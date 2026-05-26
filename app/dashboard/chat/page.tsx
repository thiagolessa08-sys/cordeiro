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

/* ── perguntas sugeridas ─────────────────────────────────── */
const SUGGESTIONS = [
  "Qual foi o faturamento total em abril de 2026?",
  "Quais os 5 produtos mais vendidos nos últimos 3 meses?",
  "Quantos pedidos estão em aberto há mais de 30 dias?",
  "Quais clientes têm mais devoluções no ano?",
  "Qual a taxa de conversão de cotações em pedidos em 2026?",
  "Liste as aprovações pendentes por tipo de documento.",
];

/* ── paleta ──────────────────────────────────────────────── */
const BLUE      = "#1b3664";
const BLUE_SOFT = "#eef2f9";

/* ── componentes auxiliares ─────────────────────────────── */

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
      marginTop: 8, fontSize: 11.5, fontFamily: "'JetBrains Mono','Fira Code',monospace",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "5px 12px", background: "#1e293b",
      }}>
        <span style={{ color: "#64748b", fontSize: 10.5, fontFamily: "inherit" }}>SQL</span>
        <button onClick={copy} style={{
          background: "none", border: "none", cursor: "pointer",
          color: copied ? "#22c55e" : "#64748b", fontSize: 10.5, padding: "2px 6px",
        }}>
          {copied ? "✓ copiado" : "copiar"}
        </button>
      </div>
      <pre style={{
        margin: 0, padding: "10px 14px", color: "#e2e8f0", overflowX: "auto",
        whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.55,
      }}>
        {sql}
      </pre>
    </div>
  );
}

function ResultTable({ rec }: { rec: QueryRecord }) {
  const [expanded, setExpanded] = useState(false);
  const visibleRows = expanded ? rec.rows : rec.rows.slice(0, 8);

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

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 4, fontWeight: 500 }}>
        {rec.description}
        {rec.count > 0 && (
          <span style={{ marginLeft: 6, color: "var(--muted)", fontWeight: 400 }}>
            · {rec.count} linha{rec.count !== 1 ? "s" : ""}{rec.truncated ? " (truncado)" : ""}
          </span>
        )}
      </div>
      <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid var(--line-2)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
          <thead>
            <tr style={{ background: BLUE_SOFT }}>
              {rec.columns.map((col, i) => (
                <th key={i} style={{
                  padding: "6px 12px", textAlign: "left",
                  fontSize: 10, fontWeight: 600, color: BLUE,
                  textTransform: "uppercase", letterSpacing: ".05em",
                  whiteSpace: "nowrap", borderBottom: "1px solid var(--line-2)",
                }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, ri) => (
              <tr key={ri} style={{ background: ri % 2 === 1 ? "rgba(236,239,245,.3)" : "transparent" }}>
                {(row as unknown[]).map((cell, ci) => (
                  <td key={ci} style={{
                    padding: "6px 12px", color: "var(--ink-2)", borderBottom: "1px solid var(--line-3)",
                    whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums",
                  }}>
                    {cell === null || cell === undefined ? (
                      <span style={{ color: "var(--muted)" }}>—</span>
                    ) : String(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rec.rows.length > 8 && (
        <button onClick={() => setExpanded(!expanded)} style={{
          marginTop: 6, background: "none", border: "none",
          color: BLUE, fontSize: 11, cursor: "pointer", padding: "2px 0",
        }}>
          {expanded ? "▲ ver menos" : `▼ ver mais ${rec.rows.length - 8} linhas`}
        </button>
      )}
    </div>
  );
}

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
        fontSize: 14, color: "#fff", fontWeight: 700, marginTop: 2,
      }}>
        AI
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Loading skeleton */}
        {msg.loading ? (
          <div style={{ display: "flex", gap: 5, alignItems: "center", padding: "10px 0" }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{
                width: 7, height: 7, borderRadius: "50%", background: BLUE,
                opacity: 0.5,
                animation: `bounce 1.1s ease-in-out ${i * 0.2}s infinite`,
              }} />
            ))}
            <style>{`
              @keyframes bounce {
                0%,80%,100%{transform:translateY(0)}
                40%{transform:translateY(-5px)}
              }
            `}</style>
          </div>
        ) : (
          <>
            {/* Texto da resposta */}
            <div style={{
              background: "var(--panel)", borderRadius: "4px 14px 14px 14px",
              padding: "12px 16px", boxShadow: "var(--shadow-md)",
              fontSize: 13, color: "var(--ink)", lineHeight: 1.65,
              whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>
              {msg.error ? (
                <span style={{ color: "#c0273a" }}>⚠ {msg.error}</span>
              ) : (
                msg.content
              )}
            </div>

            {/* Queries executadas */}
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

                {showSql && msg.queries!.map((q, i) => (
                  <div key={i} style={{ marginTop: 10 }}>
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

/* ── página principal ────────────────────────────────────── */
export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* Scroll automático */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* Ajuste automático da altura da textarea */
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
    const loadingMsg: ChatMessage = { role: "assistant", content: "", loading: true };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setInput("");
    setLoading(true);

    /* Histórico para a API (sem a mensagem de loading) */
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

      const data = await res.json() as { response?: string; queries?: QueryRecord[]; error?: string };

      setMessages((prev) => {
        const next = [...prev];
        const lastIdx = next.length - 1;
        if (data.error) {
          next[lastIdx] = { role: "assistant", content: "", error: data.error };
        } else {
          next[lastIdx] = {
            role: "assistant",
            content: data.response ?? "",
            queries: data.queries ?? [],
          };
        }
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

      {/* Área de mensagens */}
      <div style={{
        flex: 1, overflowY: "auto", padding: "24px 28px",
        display: "flex", flexDirection: "column", gap: 20,
        minHeight: 0,
      }}>

        {/* Estado vazio */}
        {isEmpty && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{
                width: 64, height: 64, borderRadius: "50%",
                background: "linear-gradient(135deg, #1b3664, #2c5fa8)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 28, color: "#fff", margin: "0 auto 16px",
              }}>
                AI
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--ink)", margin: "0 0 6px" }}>
                Analista de Dados IA
              </h2>
              <p style={{ fontSize: 13, color: "var(--ink-3)", margin: 0, maxWidth: 420, textAlign: "center" }}>
                Faça perguntas em português sobre faturamento, pedidos, cotações, devoluções e aprovações.
                O assistente consultará o banco automaticamente.
              </p>
            </div>

            {/* Sugestões */}
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(2, 1fr)",
              gap: 10, maxWidth: 640, width: "100%",
            }}>
              {SUGGESTIONS.map((s, i) => (
                <button key={i} onClick={() => sendMessage(s)} style={{
                  background: "var(--panel)", border: "1px solid var(--line-2)",
                  borderRadius: 10, padding: "12px 14px", textAlign: "left",
                  cursor: "pointer", fontSize: 12, color: "var(--ink-2)",
                  lineHeight: 1.45, transition: "border-color .15s, box-shadow .15s",
                  boxShadow: "var(--shadow-sm)",
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

        {/* Mensagens */}
        {messages.map((msg, i) => (
          msg.role === "user"
            ? <UserBubble key={i} content={msg.content} />
            : <AssistantBubble key={i} msg={msg} />
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Input fixo na parte inferior */}
      <div style={{
        borderTop: "1px solid var(--line-2)",
        background: "rgba(255,255,255,.92)", backdropFilter: "blur(12px)",
        padding: "14px 28px 18px",
      }}>
        <div style={{
          display: "flex", gap: 10, alignItems: "flex-end",
          background: "var(--panel)", border: "1.5px solid var(--line-2)",
          borderRadius: 14, padding: "10px 12px",
          boxShadow: "var(--shadow-md)",
          transition: "border-color .15s",
        }}
          onFocusCapture={(e) => (e.currentTarget as HTMLDivElement).style.borderColor = BLUE}
          onBlurCapture={(e) => (e.currentTarget as HTMLDivElement).style.borderColor = "var(--line-2)"}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pergunte algo sobre o banco de dados… (Enter para enviar, Shift+Enter para nova linha)"
            disabled={loading}
            rows={1}
            style={{
              flex: 1, background: "none", border: "none", outline: "none", resize: "none",
              fontSize: 13, color: "var(--ink)", lineHeight: 1.55,
              fontFamily: "'Manrope', 'Inter', sans-serif",
              overflowY: "auto",
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
            style={{
              width: 38, height: 38, borderRadius: 10, border: "none",
              background: loading || !input.trim()
                ? "var(--line-2)"
                : `linear-gradient(135deg, #1b3664, #2c5fa8)`,
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
