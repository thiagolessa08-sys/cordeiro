"use client";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";

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

/* ══════════════════════════════════════════════════════════
   GRÁFICOS — utilitários compartilhados
   ══════════════════════════════════════════════════════════ */

const CHART_COLORS = [
  "#1b3664","#2c5fa8","#3b82f6","#60a5fa","#93c5fd",
  "#a5b4fc","#c4b5fd","#d8b4fe","#fbbf24","#f87171",
];

function makeFormatter(rows: string[][], valueColIdx: number) {
  const isCurrency = rows.some((r) => /R\$/.test(r[valueColIdx] ?? ""));
  return (v: number) => {
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
}

type ChartType = "hbar" | "vbar" | "line" | "pie";

/** Auto-detecta o melhor tipo de gráfico baseado no formato dos dados */
function detectChartType(rows: string[][]): ChartType {
  if (rows.length === 0) return "hbar";

  const firstCol = rows.map((r) => (r[0] ?? "").toString().toLowerCase());
  const monthPattern = /^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)/;
  const datePattern = /(\d{4}|\d{1,2}\/\d{2,4}|\d{4}-\d{1,2})/;
  const dayNumberPattern = /^\d{1,2}$/;  // só números de 1 a 31 (dias)

  const timeHits = firstCol.filter(
    (s) => monthPattern.test(s) || datePattern.test(s) || dayNumberPattern.test(s)
  ).length;

  if (timeHits >= rows.length * 0.7) {
    return rows.length > 8 ? "line" : "vbar";
  }

  // Pequenos conjuntos (2-6 categorias) → pizza fica boa
  if (rows.length >= 2 && rows.length <= 6) return "pie";

  // Padrão: ranking → barras horizontais
  return "hbar";
}

/* ── Gráfico de barras horizontal ────────────────────────── */
function HBarChart({ headers, rows, valueColIdx }: {
  headers: string[]; rows: string[][]; valueColIdx: number;
}) {
  const labels = rows.map((r) => r[0] ?? "");
  const values = rows.map((r) => parseNumericCell(r[valueColIdx] ?? "") ?? 0);
  const max = Math.max(...values, 1);
  const fmt = makeFormatter(rows, valueColIdx);

  const LPAD = 110, BMAX = 300, VPAD = 80, PL = 12;
  const RH = 22, BAR_H = 12;
  const W = PL + LPAD + BMAX + VPAD;
  const H = rows.length * RH + 10;

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
                fontSize={10} fill="#4b5563" fontFamily="'Manrope','Inter',sans-serif">{lbl}</text>
              <rect x={PL + LPAD} y={y} width={BMAX} height={BAR_H} fill="#eef2f9" rx={3} />
              <rect x={PL + LPAD} y={y} width={Math.max(bw, 3)} height={BAR_H} fill={CHART_COLORS[Math.min(i, CHART_COLORS.length - 1)]} rx={3} />
              <text x={PL + LPAD + bw + 7} y={y + BAR_H / 2 + 4}
                fontSize={10} fill="#374151" fontWeight={i === 0 ? "600" : "400"}
                fontFamily="'Manrope','Inter',sans-serif">{fmt(v)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ── Gráfico de barras verticais (colunas) ───────────────── */
function VBarChart({ headers, rows, valueColIdx }: {
  headers: string[]; rows: string[][]; valueColIdx: number;
}) {
  const labels = rows.map((r) => r[0] ?? "");
  const values = rows.map((r) => parseNumericCell(r[valueColIdx] ?? "") ?? 0);
  const max = Math.max(...values, 1);
  const fmt = makeFormatter(rows, valueColIdx);

  const W = 600, H = 240;
  const padL = 48, padR = 16, padT = 18, padB = 38;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = rows.length;
  const barW = (innerW / n) * 0.62;
  const gap = innerW / n;
  const xAt = (i: number) => padL + gap * i + gap / 2;
  const yAt = (v: number) => padT + innerH - (v / max) * innerH;
  const labelStep = Math.max(1, Math.ceil(n / 10));

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 10, color: "var(--ink-3)", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>
        {headers[0]} · {headers[valueColIdx]}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        {/* Grid + eixo Y */}
        {[0, 0.25, 0.5, 0.75, 1].map((p, gi) => {
          const y = padT + innerH * (1 - p);
          return (
            <g key={gi}>
              <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="#e7ecf6" strokeDasharray={gi === 0 ? "0" : "2 3"} />
              <text x={padL - 8} y={y + 3} fontSize={9} textAnchor="end" fill="#9ea7c1" fontFamily="'Manrope',sans-serif">
                {fmt(max * p)}
              </text>
            </g>
          );
        })}
        {/* Barras */}
        {rows.map((_, i) => {
          const y = yAt(values[i]);
          const bh = (padT + innerH) - y;
          return (
            <rect key={i} x={xAt(i) - barW / 2} y={y} width={barW} height={Math.max(bh, 0)}
              fill={CHART_COLORS[i % CHART_COLORS.length]} rx={3} />
          );
        })}
        {/* X labels */}
        {rows.map((_, i) => {
          if (i % labelStep !== 0 && i !== n - 1) return null;
          const lbl = labels[i].length > 8 ? labels[i].slice(0, 7) + "…" : labels[i];
          return (
            <text key={i} x={xAt(i)} y={H - 12} fontSize={9} textAnchor="middle" fill="#9ea7c1" fontFamily="'Manrope',sans-serif">
              {lbl}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/* ── Gráfico de linha com área ───────────────────────────── */
function LineChart({ headers, rows, valueColIdx }: {
  headers: string[]; rows: string[][]; valueColIdx: number;
}) {
  const labels = rows.map((r) => r[0] ?? "");
  const values = rows.map((r) => parseNumericCell(r[valueColIdx] ?? "") ?? 0);
  const max = Math.max(...values, 1);
  const fmt = makeFormatter(rows, valueColIdx);

  const W = 600, H = 220;
  const padL = 48, padR = 16, padT = 18, padB = 36;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = rows.length;
  const xAt = (i: number) => n === 1 ? padL + innerW / 2 : padL + (innerW * i) / (n - 1);
  const yAt = (v: number) => padT + innerH - (v / max) * innerH;
  const labelStep = Math.max(1, Math.ceil(n / 10));

  // Linha (polyline) e área (path fechado)
  const linePoints = rows.map((_, i) => `${xAt(i)},${yAt(values[i])}`).join(" ");
  const areaPath = `M${xAt(0)},${padT + innerH} L${rows.map((_, i) => `${xAt(i)},${yAt(values[i])}`).join(" L")} L${xAt(n - 1)},${padT + innerH} Z`;

  const gradId = `lineGrad-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 10, color: "var(--ink-3)", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>
        {headers[0]} · {headers[valueColIdx]}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BLUE} stopOpacity="0.28" />
            <stop offset="100%" stopColor={BLUE} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((p, gi) => {
          const y = padT + innerH * (1 - p);
          return (
            <g key={gi}>
              <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="#e7ecf6" strokeDasharray={gi === 0 ? "0" : "2 3"} />
              <text x={padL - 8} y={y + 3} fontSize={9} textAnchor="end" fill="#9ea7c1" fontFamily="'Manrope',sans-serif">
                {fmt(max * p)}
              </text>
            </g>
          );
        })}
        {/* Área */}
        <path d={areaPath} fill={`url(#${gradId})`} />
        {/* Linha */}
        <polyline points={linePoints} fill="none" stroke={BLUE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {/* Pontos */}
        {rows.map((_, i) => (
          <circle key={i} cx={xAt(i)} cy={yAt(values[i])} r={3} fill="#fff" stroke={BLUE} strokeWidth={1.5} />
        ))}
        {/* X labels */}
        {rows.map((_, i) => {
          if (i % labelStep !== 0 && i !== n - 1) return null;
          const lbl = labels[i].length > 8 ? labels[i].slice(0, 7) + "…" : labels[i];
          return (
            <text key={i} x={xAt(i)} y={H - 12} fontSize={9} textAnchor="middle" fill="#9ea7c1" fontFamily="'Manrope',sans-serif">
              {lbl}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/* ── Gráfico pizza (donut) com legenda ───────────────────── */
function PieChart({ headers, rows, valueColIdx }: {
  headers: string[]; rows: string[][]; valueColIdx: number;
}) {
  const labels = rows.map((r) => r[0] ?? "");
  const values = rows.map((r) => parseNumericCell(r[valueColIdx] ?? "") ?? 0);
  const total = values.reduce((a, b) => a + b, 0) || 1;
  const fmt = makeFormatter(rows, valueColIdx);

  const SIZE = 180;
  const cx = SIZE / 2, cy = SIZE / 2;
  const rOut = 78, rIn = 46;

  let acc = 0;
  const arcs = values.map((v, i) => {
    const startAngle = (acc / total) * 2 * Math.PI;
    acc += v;
    const endAngle = (acc / total) * 2 * Math.PI;
    const x1 = cx + rOut * Math.sin(startAngle);
    const y1 = cy - rOut * Math.cos(startAngle);
    const x2 = cx + rOut * Math.sin(endAngle);
    const y2 = cy - rOut * Math.cos(endAngle);
    const x3 = cx + rIn * Math.sin(endAngle);
    const y3 = cy - rIn * Math.cos(endAngle);
    const x4 = cx + rIn * Math.sin(startAngle);
    const y4 = cy - rIn * Math.cos(startAngle);
    const large = endAngle - startAngle > Math.PI ? 1 : 0;
    // Handle single 100% slice (avoid degenerate arc)
    const path = values.length === 1 || v === total
      ? `M ${cx} ${cy - rOut} A ${rOut} ${rOut} 0 1 1 ${cx - 0.001} ${cy - rOut} L ${cx - 0.001} ${cy - rIn} A ${rIn} ${rIn} 0 1 0 ${cx} ${cy - rIn} Z`
      : `M ${x1} ${y1} A ${rOut} ${rOut} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${rIn} ${rIn} 0 ${large} 0 ${x4} ${y4} Z`;
    return { path, color: CHART_COLORS[i % CHART_COLORS.length], pct: (v / total) * 100, value: v, label: String(labels[i]) };
  });

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 10, color: "var(--ink-3)", marginBottom: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>
        {headers[0]} · {headers[valueColIdx]}
      </div>
      <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ width: SIZE, height: SIZE, flexShrink: 0 }}>
          {arcs.map((arc, i) => (
            <path key={i} d={arc.path} fill={arc.color} stroke="#fff" strokeWidth="1.5" />
          ))}
          <text x={cx} y={cy - 4} textAnchor="middle" fontSize={11} fill="var(--ink-3)" fontFamily="'Manrope',sans-serif">Total</text>
          <text x={cx} y={cy + 12} textAnchor="middle" fontSize={13} fontWeight={700} fill={BLUE} fontFamily="'Manrope',sans-serif">{fmt(total)}</text>
        </svg>
        <div style={{ flex: 1, minWidth: 180, display: "flex", flexDirection: "column", gap: 5 }}>
          {arcs.map((arc, i) => {
            const lbl = arc.label.length > 22 ? arc.label.slice(0, 21) + "…" : arc.label;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                <div style={{ width: 11, height: 11, borderRadius: 3, background: arc.color, flexShrink: 0 }} />
                <span style={{ color: "var(--ink-2)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lbl}</span>
                <span style={{ color: "var(--ink-3)", fontVariantNumeric: "tabular-nums" }}>{fmt(arc.value)}</span>
                <span style={{ color: BLUE, fontWeight: 600, fontVariantNumeric: "tabular-nums", minWidth: 40, textAlign: "right" }}>
                  {arc.pct.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Roteador: escolhe o componente certo conforme tipo ──── */
function ChartView({ type, headers, rows, valueColIdx }: {
  type: ChartType; headers: string[]; rows: string[][]; valueColIdx: number;
}) {
  switch (type) {
    case "vbar": return <VBarChart headers={headers} rows={rows} valueColIdx={valueColIdx} />;
    case "line": return <LineChart headers={headers} rows={rows} valueColIdx={valueColIdx} />;
    case "pie":  return <PieChart  headers={headers} rows={rows} valueColIdx={valueColIdx} />;
    default:     return <HBarChart headers={headers} rows={rows} valueColIdx={valueColIdx} />;
  }
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

/* ── Barra de modos com 5 opções (Tabela + 4 charts) ─────── */
type ViewMode = "table" | ChartType;

function ViewModeBar({
  mode, setMode, canChart, suggested,
}: {
  mode: ViewMode; setMode: (m: ViewMode) => void; canChart: boolean; suggested: ChartType;
}) {
  const items: { key: ViewMode; icon: string; label: string }[] = [
    { key: "table", icon: "≡",  label: "Tabela"  },
    { key: "hbar",  icon: "▭",  label: "Barras"  },
    { key: "vbar",  icon: "▮",  label: "Colunas" },
    { key: "line",  icon: "∿",  label: "Linha"   },
    { key: "pie",   icon: "◐",  label: "Pizza"   },
  ];
  return (
    <div style={{ display: "flex", gap: 4, overflowX: "auto", flexShrink: 0 }}>
      {items.map((it) => {
        if (!canChart && it.key !== "table") return null;
        const isActive = mode === it.key;
        const isSuggested = !isActive && it.key === suggested;
        return (
          <button key={it.key} onClick={() => setMode(it.key)} title={isSuggested ? `${it.label} · sugerido para este dado` : it.label}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "4px 10px", borderRadius: 7, border: "none",
              fontSize: 11.5, fontWeight: 500, cursor: "pointer",
              background: isActive ? BLUE : (isSuggested ? "#dbe5f5" : "#e8edf7"),
              color: isActive ? "#fff" : "var(--ink-3)",
              transition: "background .12s, color .12s",
              position: "relative", whiteSpace: "nowrap",
            }}>
            <span style={{ fontSize: 12 }}>{it.icon}</span> {it.label}
            {isSuggested && (
              <span style={{
                position: "absolute", top: -3, right: -3,
                width: 6, height: 6, borderRadius: "50%", background: BLUE,
              }} />
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── Tabela markdown com toggle de 5 modos ───────────────── */
function MarkdownTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  const vci = findNumericColIdx(headers, rows);
  const canChart = vci >= 0 && rows.length > 1;
  const suggested = useMemo(() => detectChartType(rows), [rows]);
  const [mode, setMode] = useState<ViewMode>("table");

  return (
    <div style={{
      margin: "10px 0",
      background: "var(--bg-2)", borderRadius: 10,
      border: "1px solid var(--line-2)", overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px", borderBottom: "1px solid var(--line-2)",
        background: BLUE_SOFT, gap: 10,
      }}>
        <span style={{ fontSize: 11, color: BLUE, fontWeight: 600, whiteSpace: "nowrap" }}>
          {headers.length} colunas · {rows.length} linhas
        </span>
        <ViewModeBar mode={mode} setMode={setMode} canChart={canChart} suggested={suggested} />
      </div>
      <div style={{ padding: "10px 12px" }}>
        {mode === "table"
          ? <StyledTable headers={headers} rows={rows} />
          : <ChartView type={mode} headers={headers} rows={rows} valueColIdx={vci} />
        }
      </div>
    </div>
  );
}

/* ── Resultado de query com toggle de 5 modos ────────────── */
function ResultTable({ rec }: { rec: QueryRecord }) {
  const strRows = useMemo(
    () => rec.rows.map((r) => (r as unknown[]).map((c) => c === null || c === undefined ? "" : String(c))),
    [rec.rows]
  );
  const vci = findNumericColIdx(rec.columns, strRows);
  const canChart = vci >= 0 && strRows.length > 1;
  const suggested = useMemo(() => detectChartType(strRows), [strRows]);
  const [mode, setMode] = useState<ViewMode>("table");

  if (rec.error) return (
    <div style={{ marginTop: 8, padding: "10px 14px", background: "#fde8eb", borderRadius: 8, fontSize: 12, color: "#c0273a" }}>
      ⚠ {rec.error}
    </div>
  );
  if (!rec.columns.length) return null;

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, gap: 10 }}>
        <div style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {rec.description}
          {rec.count > 0 && (
            <span style={{ marginLeft: 6, color: "var(--muted)", fontWeight: 400 }}>
              · {rec.count} linha{rec.count !== 1 ? "s" : ""}{rec.truncated ? " (truncado)" : ""}
            </span>
          )}
        </div>
        <ViewModeBar mode={mode} setMode={setMode} canChart={canChart} suggested={suggested} />
      </div>
      {mode === "table"
        ? <StyledTable headers={rec.columns} rows={strRows} limit={8} />
        : <div style={{ background: "var(--bg-2)", borderRadius: 10, padding: "12px 14px", border: "1px solid var(--line-2)" }}>
            <ChartView type={mode} headers={rec.columns} rows={strRows} valueColIdx={vci} />
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

    // Abort automático após 110 segundos (antes do maxDuration do servidor)
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 110_000);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
        signal: controller.signal,
      });
      clearTimeout(timer);
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
      clearTimeout(timer);
      let msg = err instanceof Error ? err.message : String(err);
      if (err instanceof DOMException && err.name === "AbortError") {
        msg = "A consulta demorou mais de 110 segundos e foi cancelada. Tente uma pergunta mais específica ou um período menor.";
      } else if (msg.toLowerCase().includes("failed to fetch") || msg.toLowerCase().includes("networkerror")) {
        msg = "Não foi possível conectar ao servidor. Verifique sua conexão ou aguarde alguns segundos e tente novamente.";
      }
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
