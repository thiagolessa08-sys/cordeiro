import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { SCHEMA_CONTEXT } from "@/lib/schema-context";
import { executeQuery } from "@/lib/sybase";

/* ── tipos ──────────────────────────────────────────────── */
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface QueryRecord {
  description: string;
  sql: string;
  columns: string[];
  rows: unknown[][];
  count: number;
  truncated: boolean;
  error?: string;
}

/* ── ferramentas expostas ao Claude ─────────────────────── */
const tools: Anthropic.Tool[] = [
  {
    name: "execute_sql",
    description:
      "Executa uma query SELECT no banco Sybase IQ 16 da Grupo Melo Cordeiro. " +
      "Apenas SELECT é permitido — nunca INSERT, UPDATE, DELETE ou DDL. " +
      "Máximo de 200 linhas retornadas.",
    input_schema: {
      type: "object" as const,
      properties: {
        sql: {
          type: "string",
          description: "A query SQL SELECT a ser executada.",
        },
        description: {
          type: "string",
          description:
            "Breve descrição em português do que esta query faz (mostrada ao usuário).",
        },
      },
      required: ["sql", "description"],
    },
  },
];

/* ── helper: só SELECT ──────────────────────────────────── */
function isSafeSelect(sql: string): boolean {
  const clean = sql.trim().toUpperCase();
  return (
    clean.startsWith("SELECT") &&
    !/(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|EXEC|EXECUTE|GRANT|REVOKE)\s/i.test(
      sql
    )
  );
}

/* ── POST /api/chat ─────────────────────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { messages: ChatMessage[] };
    const userMessages: ChatMessage[] = body.messages ?? [];

    if (!userMessages.length) {
      return NextResponse.json({ error: "Nenhuma mensagem enviada." }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY não configurada no servidor." },
        { status: 500 }
      );
    }

    const client = new Anthropic({ apiKey });

    /* Converte mensagens para o formato SDK */
    const sdkMessages: Anthropic.MessageParam[] = userMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const queries: QueryRecord[] = [];

    /* ── Agentic loop ────────────────────────────────────── */
    let response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      system: SCHEMA_CONTEXT,
      tools,
      messages: sdkMessages,
    });

    /* Executa ferramentas até Claude emitir stop_reason = "end_turn" */
    while (response.stop_reason === "tool_use") {
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      /* Monta resposta de assistente com todo o conteúdo atual */
      sdkMessages.push({ role: "assistant", content: response.content });

      /* Processa cada tool_use em paralelo */
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          if (block.name !== "execute_sql") {
            return {
              type: "tool_result" as const,
              tool_use_id: block.id,
              content: "Ferramenta desconhecida.",
            };
          }

          const input = block.input as { sql: string; description: string };
          const { sql, description } = input;

          /* Segurança: apenas SELECT */
          if (!isSafeSelect(sql)) {
            const rec: QueryRecord = {
              description,
              sql,
              columns: [],
              rows: [],
              count: 0,
              truncated: false,
              error: "Apenas queries SELECT são permitidas.",
            };
            queries.push(rec);
            return {
              type: "tool_result" as const,
              tool_use_id: block.id,
              content: JSON.stringify({ error: rec.error }),
            };
          }

          try {
            const result = await executeQuery(sql, 200);
            const rec: QueryRecord = {
              description,
              sql,
              columns: result.columns,
              rows: result.rows,
              count: result.count,
              truncated: result.truncated,
            };
            queries.push(rec);

            /* Envia ao Claude apenas colunas + primeiras 50 linhas para economizar tokens */
            const preview = {
              columns: result.columns,
              rows: result.rows.slice(0, 50),
              count: result.count,
              truncated: result.truncated || result.rows.length > 50,
            };
            return {
              type: "tool_result" as const,
              tool_use_id: block.id,
              content: JSON.stringify(preview),
            };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const rec: QueryRecord = {
              description,
              sql,
              columns: [],
              rows: [],
              count: 0,
              truncated: false,
              error: msg,
            };
            queries.push(rec);
            return {
              type: "tool_result" as const,
              tool_use_id: block.id,
              content: JSON.stringify({ error: msg }),
            };
          }
        })
      );

      sdkMessages.push({ role: "user", content: toolResults });

      response = await client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 4096,
        system: SCHEMA_CONTEXT,
        tools,
        messages: sdkMessages,
      });
    }

    /* Extrai texto final */
    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    const finalText = textBlock?.text ?? "Não foi possível gerar uma resposta.";

    return NextResponse.json({ response: finalText, queries });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
