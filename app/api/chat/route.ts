import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { SCHEMA_CONTEXT } from "@/lib/schema-context";
import { executeQuery } from "@/lib/sybase";

/* ── Config do segmento de rota ─────────────────────────── */
export const maxDuration = 120; // segundos — Railway/Vercel

/* ── Constantes ──────────────────────────────────────────── */
const MAX_ITERATIONS  = 6;    // máximo de rodadas de tool use
const QUERY_TIMEOUT   = 25_000; // ms por query no Sybase

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
      "Máximo de 200 linhas retornadas. " +
      "Se não encontrar dados, retorne imediatamente com essa informação — não tente outra query similar.",
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
  return (
    sql.trim().toUpperCase().startsWith("SELECT") &&
    !/(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|EXEC|EXECUTE|GRANT|REVOKE)\s/i.test(sql)
  );
}

/* ── helper: query com timeout ──────────────────────────── */
async function executeWithTimeout(sql: string, ms: number) {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Query ultrapassou ${ms / 1000}s — tente simplificar a consulta.`)), ms)
  );
  return Promise.race([executeQuery(sql, 200), timeout]);
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

    const sdkMessages: Anthropic.MessageParam[] = userMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const queries: QueryRecord[] = [];
    let iterations = 0;

    /* ── Primeira chamada ────────────────────────────────── */
    let response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 4096,
      system: SCHEMA_CONTEXT,
      tools,
      messages: sdkMessages,
    });

    /* ── Agentic loop com guarda de iterações ────────────── */
    while (response.stop_reason === "tool_use") {
      iterations++;

      /* Se atingir o limite, pede ao Claude que conclua com o que tem */
      if (iterations > MAX_ITERATIONS) {
        // response.content pode conter tool_use blocks pendentes.
        // A API Anthropic exige que todo tool_use seja seguido de tool_result —
        // enviar texto puro após tool_use causa erro 400.
        const pendingBlocks = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
        );
        sdkMessages.push({ role: "assistant", content: response.content });
        sdkMessages.push({
          role: "user",
          content: [
            // tool_results sintéticos para cada tool_use pendente
            ...pendingBlocks.map((b) => ({
              type: "tool_result" as const,
              tool_use_id: b.id,
              content: "Limite de iterações atingido — use os dados já obtidos.",
            })),
            // instrução de encerramento no mesmo bloco de usuário
            {
              type: "text" as const,
              text:
                "Você já executou muitas queries. Com os dados que já obteve, " +
                "apresente a análise final agora — mesmo que incompleta.",
            },
          ],
        });
        response = await client.messages.create({
          model: "claude-haiku-4-5",
          max_tokens: 2048,
          system: SCHEMA_CONTEXT,
          tools: [],           // sem ferramentas → resposta direta
          messages: sdkMessages,
        });
        break;
      }

      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      sdkMessages.push({ role: "assistant", content: response.content });

      /* Executa todas as ferramentas desta rodada em paralelo */
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          if (block.name !== "execute_sql") {
            return {
              type: "tool_result" as const,
              tool_use_id: block.id,
              content: "Ferramenta desconhecida.",
            };
          }

          const { sql, description } = block.input as { sql: string; description: string };

          if (!isSafeSelect(sql)) {
            const rec: QueryRecord = { description, sql, columns: [], rows: [], count: 0, truncated: false, error: "Apenas queries SELECT são permitidas." };
            queries.push(rec);
            return { type: "tool_result" as const, tool_use_id: block.id, content: JSON.stringify({ error: rec.error }) };
          }

          try {
            const result = await executeWithTimeout(sql, QUERY_TIMEOUT);
            const rec: QueryRecord = {
              description, sql,
              columns: result.columns,
              rows: result.rows,
              count: result.count,
              truncated: result.truncated,
            };
            queries.push(rec);

            /* Envia preview ao Claude (max 50 linhas) para economizar tokens */
            const hasData = result.rows.length > 0;
            const preview = hasData
              ? { columns: result.columns, rows: result.rows.slice(0, 50), count: result.count, truncated: result.truncated || result.rows.length > 50 }
              : { columns: result.columns, rows: [], count: 0, message: "A query não retornou dados. O vendedor/registro pode não existir ou não ter movimentação no período." };

            return { type: "tool_result" as const, tool_use_id: block.id, content: JSON.stringify(preview) };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const rec: QueryRecord = { description, sql, columns: [], rows: [], count: 0, truncated: false, error: msg };
            queries.push(rec);
            return { type: "tool_result" as const, tool_use_id: block.id, content: JSON.stringify({ error: msg }) };
          }
        })
      );

      sdkMessages.push({ role: "user", content: toolResults });

      response = await client.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 4096,
        system: SCHEMA_CONTEXT,
        tools,
        messages: sdkMessages,
      });
    }

    /* Extrai texto final */
    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    const finalText = textBlock?.text ?? "Não foi possível gerar uma resposta com os dados disponíveis.";

    return NextResponse.json({ response: finalText, queries });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
