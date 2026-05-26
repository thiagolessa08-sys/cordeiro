"use client";
import { useState, useRef, useEffect, useCallback } from "react";

/* ── tipos ──────────────────────────────────────────────── */
interface QueryRecord {
  description: string;
  sql: string;
  columns: string[];
  rows: unknown[][];
  count: number;
  truncated: boolean;
  error?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  queries?: QueryRecord[];
  loading?: boolean;
  error?: string;
}

type Segment =
  | { type: "text"; content: string }
  | { type: "table"; headers: string[]; rows: string[][] };

/* ── paleta ──────────────────────────────────────────────── */
const BLUE      = "#1b3664";
const BLUE_SOFT = "#eef2f9";

/* ── sugestões ───────────────────────────────────────────── */
const SUGGESTIONS = [
  "Qual foi o faturamento total em abril de 2026?",
  "Quais os 5 produtos mais vendidos nos últimos 3 meses?",
  "Quantos pedidos estão em aberto há mais de 30 dias?",
  "Quais clientes têm mais devoluções no ano?",
  "Qual a taxa de conversão de cotações em pedidos em 2026?",
  "Liste as aprovações pendentes por tipo de documento.",
];

/* ── utilitários de markdown ─────────────────────────────── */

/** Tenta converter string para número (aceita R$, pontos de milhar, vírgula decimal) */
function parseNumericCell(s: string): number | null {
  const cleaned = s
    .replace(/R\$\s?/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/%/, "")
    .trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

/** Encontra o índice da melhor coluna numérica (≥1) para usar como valor do gráfico */
function findNumericColIdx(headers: string[], rows: string[][]): number {
  for (let ci = headers.length - 1; ci >= 1; ci--) {
    const parseable = rows.filter((r) => parseNumericCell(r[ci] ?? "") !== null);
    if (parseable.length >= Math.max(1, rows.length * 0.5)) return ci;
  }
  return -1;
}

/** Quebra texto em segmentos: partes normais e tabelas markdown */
function parseSegments(text: string): Segment[] {
  const lines = text.split("\n");
  const segments: Segment[] = [];
  let textBuf: string[] = [];
  let i = 0;

  while (i < lines.length) {
    if (lines[i].trimStart().startsWith("|")) {
      // Flush text
      if (textBuf.length) {
        segments.push({ type: "text", content: textBuf.join("\n") });
        textBuf = [];
      }
      // Collect table lines
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      const parsed = parseMarkdownTable(tableLines);
      if (parsed) segments.push({ type: "table", ...parsed });
      else textBuf.push(...tableLines);
    } else {
      textBuf.push(lines[i]);
      i++;
    }
  }
  if (textBuf.length) segments.push({ type: "text", content: textBuf.join("\n") });
  return segments;
}

function parseMarkdownTable(
  lines: string[]
): { headers: string[]; rows: string[][] } | null {
  const dataLines = lines.filter((l) => !/^\s*\|[-:\s|]+\|\s*$/.test(l));
  if (dataLines.length < 2) return null;

  const parseRow = (l: string) =>
    l
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());

  const headers = parseRow(dataLines[0]);
  const rows = dataLines.slice(1).map(parseRow);
  if (!headers.length) return null;
  return { headers, rows };
}

/* ── Renderizador de texto inline (bold, etc.) ───────────── */
function InlineText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*\n]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} style={{ fontWeight: 600, color: "var(--ink)" }}>
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

/** Renderiza um bloco de texto com quebras de linha e formatação inline */
function TextBlock({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <div style={{ lineHeight: 1.7 }}>
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} style={{ height: 8 }} />;
        // item de lista
        if (/^\s*[-•]\s/.test(line)) {
          return (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 2 }}>
              <span style={{ color: "var(--muted)", flexShrink: 0 }}>•</span>
              <InlineText text={line.replace(/^\s*[-•]\s/, "")} />
            </div>
          );
        }
        return (
          <div key={i}>
            <InlineText text={line} />
          </div>
        );
      })}
    </div>
  );
}

/* ── Gráfico de barras horizontal ────────────────────────── */
function HBarChart({
  headers,
  rows,
  valueColIdx,
}: {
  headers: string[];
  rows: string[][];
  valueColIdx: number;
}) {
  const labels = rows.map((r) => r[0] ?? "");
  const values = rows.map((r) => parseNumericCell(r[valueColIdx] ?? "") ?? 0);
  const max = Math.max(...values, 1);

  const isCurrency = rows.some((r) => /R\$/.test(r[valueColIdx] ?? ""));
  const fmtVal = (v: number) => {
    if (isCurrency) {
      if (v >= 1e9) return `R$ ${(v / 1e9).toFixed(2)}B`;
      if (v >= 1e6) return `R$ ${(v / 1e6).toFixed(1)}M`;
      if (v >= 1e3) return `R$ ${(v / 1e3).toFixed(0)}K`;
      return `R$ ${v.toFixed(0)}`;
    }
    if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (v >= 1e3) return (v / 1e3).toFixed(0) + "K";
    return v % 1 === 0 ? String(v) : v.toFixed(1);
  };

  const LABEL_W = 120;
  const BAR_MAX = 320;
  const VALUE_W = 90;
  const PAD_L = 16;
  const ROW_H = 34;
  const VB_W = PAD_L + LABEL_W + BAR_MAX + VALUE_W;
  const VB_H = rows.length * ROW_H + 16;

  const COLORS = [
    "#1b3664","#2c5fa8","#3b82f6","#60a5fa","#93c5fd",
    "#a5b4fc","#c4b5fd","#d8b4fe","#f0abfc","#f9a8d4",
  ];

  return (
    <div style={{ marginTop: 12, overflowX: "auto" }}>
      <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>
        {headers[0]}  ·  {headers[valueColIdx]}
      </div>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        style={{ width: "100%", height: "auto", display: "block", maxWidth: VB_W }}
      >
        {rows.map((row, i) => {
          const v = values[i];
          const bw = max > 0 ? (v / max) * BAR_MAX : 0;
          const y = i * ROW_H + 8;
          const label = labels[i].length > 16 ? labels[i].slice(0, 15) + "…" : labels[i];
          const color = COLORS[Math.min(i, COLORS.length - 1)];

          return (
            <g key={i}>
              {/* Label */}
              <text
                x={PAD_L + LABEL_W - 8}
                y={y + ROW_H / 2 + 4}
                textAnchor="end"
                fontSize={10.5}
                fill="#4b5563"
                fontFamily="'Manrope','Inter',sans-serif"
              >
                {label}
              </text>
              {/* Bar background */}
              <rect
                x={PAD_L + LABEL_W}
                y={y + 4}
                width={BAR_MAX}
                height={ROW_H - 10}
                fill="#f1f5f9"
                rx={4}
              />
              {/* Bar fill */}
              <rect
                x={PAD_L + LABEL_W}
                y={y + 4}
                width={Math.max(bw, 2)}
                height={ROW_H - 10}
                fill={color}
                rx={4}
              />
              {/* Value label */}
              <text
                x={PAD_L + LABEL_W + bw + 8}
                y={y + ROW_H / 2 + 4}
                fontSize={10.5}
                fill="#374151"
                fontFamily="'Manrope','Inter',sans-serif"
                fontWeight={i === 0 ? "600" : "400"}
              >
                {fmtVal(v)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ── Tabela markdown com toggle tabela/gráfico ───────────── */
function MarkdownTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  const [mode, setMode] = useState<"table" | "chart">("table");
  const valueColIdx = findNumericColIdx(headers, rows);
  const canChart = valueColIdx >= 0 && rows.length > 0;

  return (
    <div style={{ marginTop: 10, marginBottom: 4 }}>
      {/* Toggle */}
      {canChart && (
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <ToggleBtn active={mode === "table"} onClick={() => setMode("table")} icon="≡" label="Tabela" />
          <ToggleBtn active={mode === "chart"} onClick={() => setMode("chart")} icon="▦" label="Gráfico" />
        </div>
      )}

      {mode === "table" ? (
        <StyledTable headers={headers} rows={rows} />
      ) : (
        <div style={{ background: "var(--bg-2)", borderRadius: 10, padding: "14px 16px", border: "1px solid var(--line-2)" }}>
          <HBarChart headers={headers} rows={rows} valueColIdx={valueColIdx} />
        </div>
      )}
    </div>
  );
}

/* ── Toggle button ───────────────────────────────────────── */
function ToggleBtn({
  active, onClick, icon, label,
}: {
  active: boolean; onClick: () => void; icon: string; label: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "4px 12px", borderRadius: 7, border: "none",
        fontSize: 11.5, fontWeight: 500, cursor: "pointer",
        background: active ? BLUE : "var(--line-2)",
        color: active ? "#fff" : "var(--ink-3)",
        transition: "background .12s, color .12s",
      }}
    >
      <span style={{ fontSize: 13 }}>{icon}</span>
      {label}
    </button>
  );
}

/* ── Tabela estilizada genérica ──────────────────────────── */
function StyledTable({
  headers,
  rows,
  maxRows,
}: {
  headers: string[];
  rows: string[][];
  maxRows?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const limit = maxRows ?? 10;
  const visible = expanded ? rows : rows.slice(0, limit);
  const isNum = (s: string) => parseNumericCell(s) !== null;

  return (
    <div>
      <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid var(--line-2)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: BLUE_SOFT }}>
              {headers.map((h, i) => (
                <th
                  key={i}
                  style={{
                    padding: "7px 13px",
                    textAlign: i === 0 ? "left" : "right",
                    fontSize: 10, fontWeight: 700, color: BLUE,
                    textTransform: "uppercase", letterSpacing: ".05em",
                    borderBottom: "1px solid var(--line-2)", whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, ri) => (
              <tr
                key={ri}
                style={{ background: ri % 2 === 1 ? "rgba(236,239,245,.35)" : "transparent" }}
              >
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    style={{
                      padding: "7px 13px",
                      textAlign: ci > 0 && isNum(cell) ? "right" : "left",
                      color: "var(--ink-2)",
                      borderBottom: "1px solid var(--line-3)",
                      fontVariantNumeric: "tabular-nums",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <InlineText text={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            marginTop: 6, background: "none", border: "none",
            color: BLUE, fontSize: 11, cursor: "pointer", padding: "2px 0",
          }}
        >
          {expanded
            ? "▲ ver menos"
            : `▼ ver mais ${rows.length - limit} linhas`}
        </button>
      )}
    </div>
  );
}

/* ── Bloco de resultado de query (com toggle tabela/gráfico) */
function ResultTable({ rec }: { rec: QueryRecord }) {
  const [mode, setMode] = useState<"table" | "chart">("table");

  if (rec.error) {
    return (
      <div style={{
        marginTop: 8, padding: "10px 14px", background: "#fde8eb",
        borderRadius: 8, fontSize: 12, color: "#c0273a",
      }}>
        ⚠ {rec.error}
      </div>
    );
  }
  if (!rec.columns.length) return null;

  // Convert raw rows to string[][] for reuse
  const strRows = rec.rows.map((r) =>
    (r as unknown[]).map((c) =>
      c === null || c === undefined ? "" : String(c)
    )
  );

  const valueColIdx = findNumericColIdx(rec.columns, strRows);
  const canChart = valueColIdx >= 0 && strRows.length > 1;

  return (
    <div style={{ marginTop: 10 }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 500 }}>
          {rec.description}
          {rec.count > 0 && (
            <span style={{ marginLeft: 6, color: "var(--muted)", fontWeight: 400 }}>
              · {rec.count} linha{rec.count !== 1 ? "s" : ""}
              {rec.truncated ? " (truncado)" : ""}
            </span>
          )}
        </div>
        {canChart && (
          <div style={{ display: "flex", gap: 6 }}>
            <ToggleBtn active={mode === "table"} onClick={() => setMode("table")} icon="≡" label="Tabela" />
            <ToggleBtn active={mode === "chart"} onClick={() => setMode("chart")} icon="▦" label="Gráfico" />
          </div>
        )}
      </div>

      {mode === "table" ? (
        <StyledTable headers={rec.columns} rows={strRows} maxRows={8} />
      ) : (
        <div style={{ background: "var(--bg-2)", borderRadius: 10, padding: "14px 16px", border: "1px solid var(--line-2)" }}>
          <HBarChart headers={rec.columns} rows={strRows} valueColIdx={valueColIdx} />
        </div>
      )}
    </div>
  );
}

/* ── SQL expandível ──────────────────────────────────────── */
function SqlBlock({ sql }: { sql: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(sql).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <div style={{
      background: "#0f172a", borderRadius: 8, overflow: "hidden",
      marginTop: 8, fontFamily: "'JetBrains Mono','Fira Code',monospace",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "5px 12px", background: "#1e293b",
      }}>
        <span style={{ color: "#64748b", fontSize: 10.5 }}>SQL</span>
        <button onClick={copy} style={{
          background: "none", border: "none", cursor: "pointer",
          color: copied ? "#22c55e" : "#64748b", fontSize: 10.5, padding: "2px 6px",
        }}>
          {copied ? "✓ copiado" : "copiar"}
        </button>
      </div>
      <pre style={{
        margin: 0, padding: "10px 14px", color: "#e2e8f0",
        overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word",
        lineHeight: 1.55, fontSize: 11.5,
      }}>
        {sql}
      </pre>
    </div>
  );
}

/* ── Balão do assistente ─────────────────────────────────── */
function AssistantBubble({ msg }: { msg: ChatMessage }) {
  const [showSql, setShowSql] = useState(false);
  const hasQueries = (msg.queries?.length ?? 0) > 0;

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      {/* Avatar */}
      <div style={{
        width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
        background: "linear-gradient(135deg, #1b3664, #2c5fa8)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, color: "#fff", fontWeight: 700, marginTop: 2,
      }}>
        AI
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Loading */}
        {msg.loading ? (
          <div style={{ display: "flex", gap: 5, alignItems: "center", padding: "10px 0" }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{
                width: 7, height: 7, borderRadius: "50%", background: BLUE, opacity: 0.5,
                animation: `chatBounce 1.1s ease-in-out ${i * 0.2}s infinite`,
              }} />
            ))}
            <style>{`
              @keyframes chatBounce {
                0%,80%,100%{transform:translateY(0)}
                40%{transform:translateY(-6px)}
              }
            `}</style>
          </div>
        ) : (
          <>
            {/* Resposta com markdown */}
            <div style={{
              background: "var(--panel)", borderRadius: "4px 14px 14px 14px",
              padding: "14px 16px", boxShadow: "var(--shadow-md)",
              fontSize: 13, color: "var(--ink-2)",
            }}>
              {msg.error ? (
                <span style={{ color: "#c0273a" }}>⚠ {msg.error}</span>
              ) : (
                parseSegments(msg.content).map((seg, si) =>
                  seg.type === "text" ? (
                    <TextBlock key={si} content={seg.content} />
                  ) : (
                    <MarkdownTable key={si} headers={seg.headers} rows={seg.rows} />
                  )
                )
              )}
            </div>

            {/* Queries executadas */}
            {hasQueries && (
              <div style={{ marginTop: 8 }}>
                <button
                  onClick={() => setShowSql(!showSql)}
                  style={{
                    background: BLUE_SOFT, border: "none", borderRadius: 6,
                    padding: "4px 10px", cursor: "pointer", fontSize: 11,
                    color: BLUE, fontWeight: 500,
                    display: "flex", alignItems: "center", gap: 5,
                  }}
                >
                  <span>{showSql ? "▲" : "▼"}</span>
                  {msg.queries!.length}{" "}
                  {msg.queries!.length === 1 ? "query executada" : "queries executadas"}
                </button>

                {showSql &&
                  msg.queries!.map((q, qi) => (
                    <div key={qi} style={{ marginTop: 10 }}>
                      <SqlBlock sql={q.sql} />
                      <ResultTable rec={q} />
                    </div>
                  ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Balão do usuário ────────────────────────────────────── */
function UserBubble({ content }: { content: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <div style={{
        background: "linear-gradient(135deg, #1b3664, #2c5fa8)",
        color: "#fff", borderRadius: "14px 4px 14px 14px",
        padding: "11px 16px", maxWidth: "72%",
        fontSize: 13, lineHeight: 1.55, wordBreak: "break-word",
      }}>
        {content}
      </div>
    </div>
  );
}

/* ── Página principal ────────────────────────────────────── */
export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 180) + "px";
  }, [input]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const userMsg: ChatMessage = { role: "user", content: trimmed };
      const loadingMsg: ChatMessage = { role: "assistant", content: "", loading: true };

      setMessages((prev) => [...prev, userMsg, loadingMsg]);
      setInput("");
      setLoading(true);

      const history: ChatMessage[] = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history }),
        });
        const data = (await res.json()) as {
          response?: string;
          queries?: QueryRecord[];
          error?: string;
        };

        setMessages((prev) => {
          const next = [...prev];
          const last = next.length - 1;
          next[last] = data.error
            ? { role: "assistant", content: "", error: data.error }
            : { role: "assistant", content: data.response ?? "", queries: data.queries ?? [] };
          return next;
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: "", error: msg };
          return next;
        });
      } finally {
        setLoading(false);
        textareaRef.current?.focus();
      }
    },
    [messages, loading]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <>
      {/* Topbar */}
      <div style={{
        height: 60, borderBottom: "1px solid var(--line-3)",
        background: "rgba(255,255,255,.85)", backdropFilter: "blur(12px)",
        display: "flex", alignItems: "center", padding: "0 26px", gap: 14,
        position: "sticky", top: 0, zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink-3)", fontSize: 12 }}>
          <span>Painel</span>
          <span style={{ color: "var(--muted)" }}>/</span>
          <span style={{ color: "var(--ink)", fontWeight: 500 }}>Chat IA</span>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)" }}>
          Claude · Sybase IQ 16
        </div>
      </div>

      {/* Mensagens */}
      <div style={{
        flex: 1, overflowY: "auto", padding: "24px 28px",
        display: "flex", flexDirection: "column", gap: 20, minHeight: 0,
      }}>
        {isEmpty && (
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 24,
          }}>
            <div style={{ textAlign: "center" }}>
              <div style={{
                width: 64, height: 64, borderRadius: "50%",
                background: "linear-gradient(135deg, #1b3664, #2c5fa8)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 26, color: "#fff", margin: "0 auto 16px",
              }}>
                AI
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--ink)", margin: "0 0 6px" }}>
                Analista de Dados IA
              </h2>
              <p style={{ fontSize: 13, color: "var(--ink-3)", margin: 0, maxWidth: 420, textAlign: "center", lineHeight: 1.6 }}>
                Faça perguntas em português sobre faturamento, pedidos,
                cotações, devoluções e aprovações. O assistente consultará
                o banco e apresentará os dados em tabela ou gráfico.
              </p>
            </div>

            <div style={{
              display: "grid", gridTemplateColumns: "repeat(2, 1fr)",
              gap: 10, maxWidth: 640, width: "100%",
            }}>
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(s)}
                  style={{
                    background: "var(--panel)", border: "1px solid var(--line-2)",
                    borderRadius: 10, padding: "12px 14px", textAlign: "left",
                    cursor: "pointer", fontSize: 12, color: "var(--ink-2)",
                    lineHeight: 1.45, boxShadow: "var(--shadow-sm)",
                    transition: "border-color .15s, box-shadow .15s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = BLUE;
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 0 3px ${BLUE_SOFT}`;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--line-2)";
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = "var(--shadow-sm)";
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) =>
          msg.role === "user" ? (
            <UserBubble key={i} content={msg.content} />
          ) : (
            <AssistantBubble key={i} msg={msg} />
          )
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        borderTop: "1px solid var(--line-2)",
        background: "rgba(255,255,255,.92)", backdropFilter: "blur(12px)",
        padding: "14px 28px 18px",
      }}>
        <div
          style={{
            display: "flex", gap: 10, alignItems: "flex-end",
            background: "var(--panel)", border: "1.5px solid var(--line-2)",
            borderRadius: 14, padding: "10px 12px", boxShadow: "var(--shadow-md)",
            transition: "border-color .15s",
          }}
          onFocusCapture={(e) =>
            ((e.currentTarget as HTMLDivElement).style.borderColor = BLUE)
          }
          onBlurCapture={(e) =>
            ((e.currentTarget as HTMLDivElement).style.borderColor = "var(--line-2)")
          }
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pergunte algo sobre o banco… (Enter para enviar, Shift+Enter nova linha)"
            disabled={loading}
            rows={1}
            style={{
              flex: 1, background: "none", border: "none", outline: "none",
              resize: "none", fontSize: 13, color: "var(--ink)", lineHeight: 1.55,
              fontFamily: "'Manrope','Inter',sans-serif", overflowY: "auto",
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
            style={{
              width: 38, height: 38, borderRadius: 10, border: "none",
              background:
                loading || !input.trim()
                  ? "var(--line-2)"
                  : "linear-gradient(135deg, #1b3664, #2c5fa8)",
              color: loading || !input.trim() ? "var(--muted)" : "#fff",
              cursor: loading || !input.trim() ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 17, flexShrink: 0, transition: "background .15s",
            }}
          >
            {loading ? "…" : "↑"}
          </button>
        </div>
        <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 6, textAlign: "center" }}>
          Apenas queries SELECT são executadas · dados em tempo real do Sybase IQ
        </div>
      </div>
    </>
  );
}
