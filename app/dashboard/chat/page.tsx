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

/* ══════════════════════════════════════════════════════════
   MARKDOWN PARSER
   ══════════════════════════════════════════════════════════ */

/** Tenta converter string para número (aceita R$, pontos, vírgula, %) */
function parseNumericCell(s: string): number | null {
  const c = s.replace(/R\$\s?/g, "").replace(/\./g, "").replace(",", ".").replace(/%/g, "").trim();
  const n = parseFloat(c);
  return isNaN(n) ? null : n;
}

/** Índice da melhor coluna numérica para usar como barra */
function findNumericColIdx(headers: string[], rows: string[][]): number {
  // Prefere a última coluna numérica (geralmente é o valor total)
  for (let ci = headers.length - 1; ci >= 1; ci--) {
    const hits = rows.filter((r) => parseNumericCell(r[ci] ?? "") !== null).length;
    if (hits >= Math.max(1, rows.length * 0.5)) return ci;
  }
  return -1;
}

/** Quebra uma linha markdown `| a | b | c |` em células */
function splitTableRow(line: string): string[] {
  return line
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());
}

/** Verifica se uma linha é separadora de cabeçalho `|---|---|----|` */
function isSeparator(line: string): boolean {
  return /^\s*\|[\s\-:|]+\|\s*$/.test(line.trim());
}

/** Verifica se uma linha é linha de tabela markdown (começa e termina com |) */
function isTableLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith("|") && t.endsWith("|") && t.length > 1;
}

/** Parseia um bloco de linhas de tabela → {headers, rows} ou null */
function parseMarkdownTable(lines: string[]): { headers: string[]; rows: string[][] } | null {
  const nonSep = lines.filter((l) => !isSeparator(l));
  if (nonSep.length < 2) return null;
  const headers = splitTableRow(nonSep[0]);
  if (headers.length < 2) return null;
  const rows = nonSep.slice(1).map(splitTableRow);
  if (rows.length === 0) return null;
  return { headers, rows };
}

/** Divide o texto em segmentos: texto ou tabela markdown */
function parseSegments(text: string): Segment[] {
  const lines = text.split("\n");
  const result: Segment[] = [];
  let textBuf: string[] = [];

  const flushText = () => {
    const joined = textBuf.join("\n");
    if (joined.trim()) result.push({ type: "text", content: joined });
    textBuf = [];
  };

  let i = 0;
  while (i < lines.length) {
    if (isTableLine(lines[i])) {
      const tableLines: string[] = [];
      while (i < lines.length && (isTableLine(lines[i]) || isSeparator(lines[i]))) {
        tableLines.push(lines[i]);
        i++;
      }
      const parsed = parseMarkdownTable(tableLines);
      if (parsed) {
        flushText();
        result.push({ type: "table", ...parsed });
      } else {
        textBuf.push(...tableLines);
      }
    } else {
      textBuf.push(lines[i]);
      i++;
    }
  }
  flushText();
  return result;
}

/* ══════════════════════════════════════════════════════════
   COMPONENTES DE RENDERIZAÇÃO
   ══════════════════════════════════════════════════════════ */

/** Renderiza texto inline com **bold** */
function InlineText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*\n]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} style={{ fontWeight: 700, color: "var(--ink)" }}>{p.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

/** Renderiza um bloco de texto com headings, listas e bold */
function TextBlock({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <div>
      {lines.map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} style={{ height: 6 }} />;

        // H2 ##
        if (t.startsWith("## ")) return (
          <div key={i} style={{ fontSize: 14.5, fontWeight: 700, color: "var(--ink)", marginTop: 14, marginBottom: 4, lineHeight: 1.4 }}>
            <InlineText text={t.slice(3)} />
          </div>
        );
        // H3 ###
        if (t.startsWith("### ")) return (
          <div key={i} style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", marginTop: 12, marginBottom: 3, lineHeight: 1.4 }}>
            <InlineText text={t.slice(4)} />
          </div>
        );
        // H1 #
        if (t.startsWith("# ")) return (
          <div key={i} style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", marginTop: 16, marginBottom: 6, lineHeight: 1.3 }}>
            <InlineText text={t.slice(2)} />
          </div>
        );

        // Lista não-ordenada - • *
        if (/^\s*[-•*]\s/.test(line)) return (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 3, paddingLeft: 6, lineHeight: 1.6 }}>
            <span style={{ color: "var(--muted)", flexShrink: 0, marginTop: 1 }}>•</span>
            <span style={{ flex: 1 }}><InlineText text={line.replace(/^\s*[-•*]\s/, "")} /></span>
          </div>
        );

        // Linha simples
        return (
          <div key={i} style={{ lineHeight: 1.65, marginBottom: 1 }}>
            <InlineText text={line} />
          </div>
        );
      })}
    </div>
  );
}

/* ── Toggle button ───────────────────────────────────────── */
function Toggle({ active, onClick, icon, label }: {
  active: boolean; onClick: () => void; icon: string; label: string;
}) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 4,
      padding: "4px 11px", borderRadius: 7, border: "none",
      fontSize: 11.5, fontWeight: 500, cursor: "pointer",
      background: active ? BLUE : "#e8edf7",
      color: active ? "#fff" : "var(--ink-3)",
      transition: "background .12s, color .12s",
    }}>
      <span style={{ fontSize: 12 }}>{icon}</span> {label}
    </button>
  );
}

/* ── Gráfico de barras horizontal ────────────────────────── */
function HBarChart({ headers, rows, valueColIdx }: {
  headers: string[]; rows: string[][]; valueColIdx: number;
}) {
  const labels = rows.map((r) => r[0] ?? "");
  const values = rows.map((r) => parseNumericCell(r[valueColIdx] ?? "") ?? 0);
  const max = Math.max(...values, 1);
  const isCurrency = rows.some((r) => /R\$/.test(r[valueColIdx] ?? ""));

  const fmt = (v: number) => {
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

  const LPAD = 110, BMAX = 300, VPAD = 80, PL = 12;
  const RH = 22;   // altura de cada linha (barra + espaço)
  const BAR_H = 12; // espessura da barra
  const W = PL + LPAD + BMAX + VPAD;
  const H = rows.length * RH + 10;

  const COLORS = ["#1b3664","#2c5fa8","#3b82f6","#60a5fa","#93c5fd","#a5b4fc","#c4b5fd","#d8b4fe"];

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 10, color: "var(--ink-3)", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>
        {headers[0]} · {headers[valueColIdx]}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        {rows.map((_, i) => {
          const v = values[i];
          const bw = (v / max) * BMAX;
          const y = i * RH + 4;
          const lbl = labels[i].length > 14 ? labels[i].slice(0, 13) + "…" : labels[i];
          return (
            <g key={i}>
              <text x={PL + LPAD - 6} y={y + BAR_H / 2 + 4} textAnchor="end"
                fontSize={10} fill="#4b5563" fontFamily="'Manrope','Inter',sans-serif">
                {lbl}
              </text>
              {/* Track */}
              <rect x={PL + LPAD} y={y} width={BMAX} height={BAR_H} fill="#eef2f9" rx={3} />
              {/* Bar */}
              <rect x={PL + LPAD} y={y} width={Math.max(bw, 3)} height={BAR_H} fill={COLORS[Math.min(i, COLORS.length - 1)]} rx={3} />
              {/* Value */}
              <text x={PL + LPAD + bw + 7} y={y + BAR_H / 2 + 4}
                fontSize={10} fill="#374151" fontWeight={i === 0 ? "600" : "400"}
                fontFamily="'Manrope','Inter',sans-serif">
                {fmt(v)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ── Tabela estilizada ───────────────────────────────────── */
function StyledTable({ headers, rows, limit = 10 }: {
  headers: string[]; rows: string[][]; limit?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, limit);

  return (
    <div>
      <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid var(--line-2)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: BLUE_SOFT }}>
              {headers.map((h, i) => (
                <th key={i} style={{
                  padding: "7px 13px",
                  textAlign: i === 0 ? "left" : "right",
                  fontSize: 10, fontWeight: 700, color: BLUE,
                  textTransform: "uppercase", letterSpacing: ".05em",
                  borderBottom: "1px solid var(--line-2)", whiteSpace: "nowrap",
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, ri) => (
              <tr key={ri} style={{ background: ri % 2 === 1 ? "rgba(236,239,245,.35)" : "transparent" }}>
                {row.map((cell, ci) => {
                  const isNum = parseNumericCell(cell) !== null;
                  return (
                    <td key={ci} style={{
                      padding: "7px 13px",
                      textAlign: ci > 0 && isNum ? "right" : "left",
                      color: "var(--ink-2)", borderBottom: "1px solid var(--line-3)",
                      fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
                    }}>
                      <InlineText text={cell} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <button onClick={() => setExpanded(!expanded)} style={{
          marginTop: 5, background: "none", border: "none",
          color: BLUE, fontSize: 11, cursor: "pointer", padding: "2px 0",
        }}>
          {expanded ? "▲ ver menos" : `▼ ver mais ${rows.length - limit} linhas`}
        </button>
      )}
    </div>
  );
}

/* ── Tabela markdown com toggle Tabela / Gráfico ─────────── */
function MarkdownTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  const [mode, setMode] = useState<"table" | "chart">("table");
  const vci = findNumericColIdx(headers, rows);
  const canChart = vci >= 0 && rows.length > 1;

  return (
    <div style={{
      margin: "10px 0",
      background: "var(--bg-2)", borderRadius: 10,
      border: "1px solid var(--line-2)", overflow: "hidden",
    }}>
      {/* Barra de controle */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px", borderBottom: "1px solid var(--line-2)",
        background: BLUE_SOFT,
      }}>
        <span style={{ fontSize: 11, color: BLUE, fontWeight: 600 }}>
          {headers.length} colunas · {rows.length} linhas
        </span>
        {canChart && (
          <div style={{ display: "flex", gap: 6 }}>
            <Toggle active={mode === "table"} onClick={() => setMode("table")} icon="≡" label="Tabela" />
            <Toggle active={mode === "chart"} onClick={() => setMode("chart")} icon="▦" label="Gráfico" />
          </div>
        )}
      </div>
      {/* Conteúdo */}
      <div style={{ padding: "10px 12px" }}>
        {mode === "table"
          ? <StyledTable headers={headers} rows={rows} />
          : <HBarChart headers={headers} rows={rows} valueColIdx={vci} />
        }
      </div>
    </div>
  );
}

/* ── Resultado de query com toggle ──────────────────────── */
function ResultTable({ rec }: { rec: QueryRecord }) {
  const [mode, setMode] = useState<"table" | "chart">("table");

  if (rec.error) return (
    <div style={{ marginTop: 8, padding: "10px 14px", background: "#fde8eb", borderRadius: 8, fontSize: 12, color: "#c0273a" }}>
      ⚠ {rec.error}
    </div>
  );
  if (!rec.columns.length) return null;

  const strRows = rec.rows.map((r) =>
    (r as unknown[]).map((c) => c === null || c === undefined ? "" : String(c))
  );
  const vci = findNumericColIdx(rec.columns, strRows);
  const canChart = vci >= 0 && strRows.length > 1;

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 500 }}>
          {rec.description}
          {rec.count > 0 && (
            <span style={{ marginLeft: 6, color: "var(--muted)", fontWeight: 400 }}>
              · {rec.count} linha{rec.count !== 1 ? "s" : ""}{rec.truncated ? " (truncado)" : ""}
            </span>
          )}
        </div>
        {canChart && (
          <div style={{ display: "flex", gap: 6 }}>
            <Toggle active={mode === "table"} onClick={() => setMode("table")} icon="≡" label="Tabela" />
            <Toggle active={mode === "chart"} onClick={() => setMode("chart")} icon="▦" label="Gráfico" />
          </div>
        )}
      </div>
      {mode === "table"
        ? <StyledTable headers={rec.columns} rows={strRows} limit={8} />
        : <div style={{ background: "var(--bg-2)", borderRadius: 10, padding: "12px 14px", border: "1px solid var(--line-2)" }}>
            <HBarChart headers={rec.columns} rows={strRows} valueColIdx={vci} />
          </div>
      }
    </div>
  );
}

/* ── SQL block ───────────────────────────────────────────── */
function SqlBlock({ sql }: { sql: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(sql).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); });
  };
  return (
    <div style={{ background: "#0f172a", borderRadius: 8, overflow: "hidden", marginTop: 8, fontFamily: "'JetBrains Mono','Fira Code',monospace" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 12px", background: "#1e293b" }}>
        <span style={{ color: "#64748b", fontSize: 10.5 }}>SQL</span>
        <button onClick={copy} style={{ background: "none", border: "none", cursor: "pointer", color: copied ? "#22c55e" : "#64748b", fontSize: 10.5, padding: "2px 6px" }}>
          {copied ? "✓ copiado" : "copiar"}
        </button>
      </div>
      <pre style={{ margin: 0, padding: "10px 14px", color: "#e2e8f0", overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.55, fontSize: 11.5 }}>
        {sql}
      </pre>
    </div>
  );
}

/* ── Balão assistente ────────────────────────────────────── */
function AssistantBubble({ msg }: { msg: ChatMessage }) {
  const [showSql, setShowSql] = useState(false);
  const hasQueries = (msg.queries?.length ?? 0) > 0;

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div style={{
        width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
        background: "linear-gradient(135deg, #1b3664, #2c5fa8)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, color: "#fff", fontWeight: 700, marginTop: 2,
      }}>AI</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {msg.loading ? (
          <div style={{ display: "flex", gap: 5, alignItems: "center", padding: "10px 0" }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{
                width: 7, height: 7, borderRadius: "50%", background: BLUE, opacity: 0.55,
                animation: `chatBounce 1.1s ease-in-out ${i * 0.2}s infinite`,
              }} />
            ))}
            <style>{`@keyframes chatBounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}`}</style>
          </div>
        ) : (
          <>
            {/* Balão de resposta com markdown parseado */}
            <div style={{
              background: "var(--panel)", borderRadius: "4px 14px 14px 14px",
              padding: "14px 16px", boxShadow: "var(--shadow-md)",
              fontSize: 13, color: "var(--ink-2)",
            }}>
              {msg.error
                ? <span style={{ color: "#c0273a" }}>⚠ {msg.error}</span>
                : parseSegments(msg.content).map((seg, si) =>
                    seg.type === "text"
                      ? <TextBlock key={si} content={seg.content} />
                      : <MarkdownTable key={si} headers={seg.headers} rows={seg.rows} />
                  )
              }
            </div>

            {/* Seção de queries executadas */}
            {hasQueries && (
              <div style={{ marginTop: 8 }}>
                <button onClick={() => setShowSql(!showSql)} style={{
                  background: BLUE_SOFT, border: "none", borderRadius: 6,
                  padding: "4px 10px", cursor: "pointer", fontSize: 11,
                  color: BLUE, fontWeight: 500, display: "flex", alignItems: "center", gap: 5,
                }}>
                  <span>{showSql ? "▲" : "▼"}</span>
                  {msg.queries!.length} {msg.queries!.length === 1 ? "query executada" : "queries executadas"}
                </button>
                {showSql && msg.queries!.map((q, qi) => (
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

/* ── Balão usuário ───────────────────────────────────────── */
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

/* ══════════════════════════════════════════════════════════
   PÁGINA PRINCIPAL
   ══════════════════════════════════════════════════════════ */
export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 180) + "px";
  }, [input]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMsg, { role: "assistant", content: "", loading: true }]);
    setInput("");
    setLoading(true);

    const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      const data = await res.json() as { response?: string; queries?: QueryRecord[]; error?: string };
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
  }, [messages, loading]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
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

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          {/* Botão nova consulta — só aparece quando há mensagens */}
          {!isEmpty && (
            <button
              onClick={() => { setMessages([]); setInput(""); textareaRef.current?.focus(); }}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 14px", borderRadius: 8, border: "none",
                background: "linear-gradient(135deg, #1b3664, #2c5fa8)",
                color: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer",
                boxShadow: "0 2px 8px rgba(27,54,100,.25)",
                transition: "opacity .15s",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = "0.85")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = "1")}
            >
              ＋ Nova consulta
            </button>
          )}
          <span style={{ fontSize: 11, color: "var(--muted)" }}>Claude · Sybase IQ 16</span>
        </div>
      </div>

      {/* Área de mensagens */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 20, minHeight: 0 }}>
        {isEmpty && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{
                width: 64, height: 64, borderRadius: "50%",
                background: "linear-gradient(135deg, #1b3664, #2c5fa8)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 26, color: "#fff", margin: "0 auto 16px",
              }}>AI</div>
              <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--ink)", margin: "0 0 6px" }}>Analista de Dados IA</h2>
              <p style={{ fontSize: 13, color: "var(--ink-3)", margin: 0, maxWidth: 420, textAlign: "center", lineHeight: 1.6 }}>
                Faça perguntas em português sobre faturamento, pedidos, cotações,
                devoluções e aprovações. Os resultados aparecem em tabela ou gráfico de barras.
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, maxWidth: 640, width: "100%" }}>
              {SUGGESTIONS.map((s, i) => (
                <button key={i} onClick={() => sendMessage(s)} style={{
                  background: "var(--panel)", border: "1px solid var(--line-2)",
                  borderRadius: 10, padding: "12px 14px", textAlign: "left",
                  cursor: "pointer", fontSize: 12, color: "var(--ink-2)",
                  lineHeight: 1.45, boxShadow: "var(--shadow-sm)",
                  transition: "border-color .15s, box-shadow .15s",
                }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = BLUE; (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 0 3px ${BLUE_SOFT}`; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--line-2)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "var(--shadow-sm)"; }}
                >{s}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) =>
          msg.role === "user"
            ? <UserBubble key={i} content={msg.content} />
            : <AssistantBubble key={i} msg={msg} />
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ borderTop: "1px solid var(--line-2)", background: "rgba(255,255,255,.92)", backdropFilter: "blur(12px)", padding: "14px 28px 18px" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", background: "var(--panel)", border: "1.5px solid var(--line-2)", borderRadius: 14, padding: "10px 12px", boxShadow: "var(--shadow-md)", transition: "border-color .15s" }}
          onFocusCapture={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = BLUE)}
          onBlurCapture={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = "var(--line-2)")}
        >
          <textarea ref={textareaRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="Pergunte algo sobre o banco… (Enter para enviar, Shift+Enter nova linha)"
            disabled={loading} rows={1}
            style={{ flex: 1, background: "none", border: "none", outline: "none", resize: "none", fontSize: 13, color: "var(--ink)", lineHeight: 1.55, fontFamily: "'Manrope','Inter',sans-serif", overflowY: "auto" }}
          />
          <button onClick={() => sendMessage(input)} disabled={loading || !input.trim()} style={{
            width: 38, height: 38, borderRadius: 10, border: "none",
            background: loading || !input.trim() ? "var(--line-2)" : "linear-gradient(135deg, #1b3664, #2c5fa8)",
            color: loading || !input.trim() ? "var(--muted)" : "#fff",
            cursor: loading || !input.trim() ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 17, flexShrink: 0, transition: "background .15s",
          }}>
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
