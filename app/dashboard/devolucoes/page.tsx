"use client";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";

const Sparkline     = dynamic(() => import("@/components/ui/Sparkline"),         { ssr: false });
const LineAreaChart = dynamic(() => import("@/components/charts/LineAreaChart"),  { ssr: false });
const DonutChart    = dynamic(() => import("@/components/charts/DonutChart"),     { ssr: false });

/* ── formatters ──────────────────────────────────────── */
const brl = (v: number) => {
  if (v >= 1e9) return `R$ ${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `R$ ${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `R$ ${(v / 1e3).toFixed(0)}K`;
  return `R$ ${v.toFixed(0)}`;
};
const num = (v: number) => new Intl.NumberFormat("pt-BR").format(v);

/* ── tipos ───────────────────────────────────────────── */
interface Kpis {
  totalMes: number;   deltaMoM:    number | null;
  qtdNcs:   number;   deltaQtd:    number | null; qtd12m: number;
  taxaPct:  number;   deltaTaxa:   number;
  ticketMed: number;  deltaTicket: number | null;
  sparkTrend: number[];
}
interface MesPoint { ano: number; mes: number; total: number; qtd: number; label: string }
interface PicoInfo { label: string; total: number }
interface Cliente  { rank: number; cnpj: string; qtd: number; total: number; share: number }
interface Produto  { code: string; descr: string; qtd: number; total: number; pct: number }
interface DevData {
  kpis:     Kpis;
  mensal:   MesPoint[];
  maxMes:   PicoInfo | null;
  minMes:   PicoInfo | null;
  clientes: Cliente[];
  produtos: Produto[];
}

const ANO = 2026, MES = 4;

/* ── RED palette ─────────────────────────────────────── */
const RED      = "#c0273a";
const RED_SOFT = "#fde8eb";

/* ── Delta badge ─────────────────────────────────────── */
function Delta({
  v, suffix = "MoM", invert = false, isPp = false,
}: {
  v: number | null; suffix?: string; invert?: boolean; isPp?: boolean;
}) {
  if (v === null) return null;
  const pos = invert ? v <= 0 : v >= 0;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11,
      padding: "2px 8px", borderRadius: 8,
      background: pos ? "var(--ok-soft)" : RED_SOFT,
      color: pos ? "var(--ok)" : RED,
      fontVariantNumeric: "tabular-nums",
    }}>
      {v >= 0 ? "↑" : "↓"} {Math.abs(v).toFixed(1)}{isPp ? " pp" : "%"} {suffix}
    </span>
  );
}

/* ── KPI Hero (red) ──────────────────────────────────── */
function KpiHero({ label, value, delta, invert = false, spark }: {
  label: string; value: string; delta: number | null; invert?: boolean; spark?: number[];
}) {
  return (
    <div style={{
      background: "linear-gradient(135deg,#a01a2c 0%,#7d1220 60%,#5a0b16 100%)",
      borderRadius: 14, boxShadow: "var(--shadow-md)", padding: "18px 20px 14px",
      display: "flex", flexDirection: "column", gap: 8, minHeight: 148,
      position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", inset: "auto -40px -40px auto", width: 160, height: 160,
        borderRadius: "50%", background: "radial-gradient(circle at 30% 30%,rgba(255,255,255,.14),transparent 60%)", pointerEvents: "none" }} />
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 500, color: "rgba(255,255,255,.7)" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 500, color: "#fff", letterSpacing: "-0.015em", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{value}</div>
      <Delta v={delta} invert={invert} />
      {spark && spark.length > 1 && (
        <div style={{ marginTop: "auto" }}>
          <Sparkline data={spark} color="rgba(255,255,255,.65)" height={32} strokeW={1.5} />
        </div>
      )}
    </div>
  );
}

/* ── KPI Card ────────────────────────────────────────── */
function KpiCard({ label, value, delta, suffix, sub, invert = false, isPp = false, spark, sparkColor }: {
  label: string; value: string; delta: number | null; suffix?: string;
  sub?: string; invert?: boolean; isPp?: boolean; spark?: number[]; sparkColor?: string;
}) {
  return (
    <div style={{
      background: "var(--panel)", borderRadius: 14, boxShadow: "var(--shadow-md)",
      padding: "18px 20px 14px", display: "flex", flexDirection: "column", gap: 8, minHeight: 148,
    }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 500, color: "var(--ink-3)" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 500, color: "var(--ink)", letterSpacing: "-0.015em", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{value}</div>
      <Delta v={delta} suffix={suffix} invert={invert} isPp={isPp} />
      {sub && <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: "auto" }}>{sub}</div>}
      {spark && spark.length > 1 && (
        <div style={{ marginTop: "auto" }}>
          <Sparkline data={spark} color={sparkColor ?? RED} height={32} strokeW={1.4} />
        </div>
      )}
    </div>
  );
}

/* ── Monthly Bar Chart SVG (inline) ─────────────────── */
function MonthlyBarChart({ data, height = 200 }: { data: MesPoint[]; height: number }) {
  if (!data.length) return null;

  const W = 800, H = height;
  const padL = 64, padR = 14, padT = 16, padB = 32;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const max  = Math.max(...data.map(d => d.total), 1);
  const n    = data.length;
  const barW = (innerW / n) * 0.62;
  const gap  = innerW / n;
  const xAt  = (i: number) => padL + gap * i + gap / 2;
  const yAt  = (v: number) => padT + innerH - (v / max) * innerH;

  const yTicks = [0, max * 0.25, max * 0.5, max * 0.75, max];
  const MUTED  = "#9ea7c1";
  const LINE   = "#e7ecf6";

  const fmtY = (v: number) => {
    if (v >= 1e6) return `R$${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `R$${(v / 1e3).toFixed(0)}K`;
    return `R$0`;
  };

  // Current month = last entry
  const isCurrentMes = (d: MesPoint) => d.ano === ANO && d.mes === MES;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height: H, display: "block", fontFamily: "'Manrope',sans-serif" }}
    >
      {/* Grid */}
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={yAt(v)} y2={yAt(v)}
            stroke={LINE} strokeDasharray={i === 0 ? "0" : "2 3"} />
          <text x={padL - 8} y={yAt(v) + 3.5} fontSize={9} textAnchor="end" fill={MUTED}>{fmtY(v)}</text>
        </g>
      ))}

      {/* Bars */}
      {data.map((d, i) => {
        const x  = xAt(i);
        const y  = yAt(d.total);
        const bh = (padT + innerH) - y;
        const curr = isCurrentMes(d);
        return (
          <g key={i}>
            <rect
              x={x - barW / 2} y={y}
              width={barW} height={Math.max(bh, 0)}
              fill={curr ? RED : "#e07080"}
              opacity={curr ? 1 : 0.72}
              rx={3}
            />
          </g>
        );
      })}

      {/* X-axis labels */}
      {data.map((d, i) => {
        const show = i === 0 || i === n - 1 || i % 2 === 0;
        if (!show) return null;
        return (
          <text key={i} x={xAt(i)} y={H - 10} fontSize={9} textAnchor="middle" fill={MUTED}>
            {d.label}
          </text>
        );
      })}
    </svg>
  );
}

/* ── Share bar badge ─────────────────────────────────── */
function ShareBadge({ pct }: { pct: number }) {
  const color = pct >= 4 ? RED : pct >= 2.5 ? "#e07080" : pct >= 1.5 ? "#f4a65a" : "var(--ink-3)";
  const bg    = pct >= 4 ? RED_SOFT : pct >= 2.5 ? "#fdeef0" : pct >= 1.5 ? "#fff4ea" : "var(--line-2)";
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 8,
      color, background: bg, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
    }}>
      {pct.toFixed(1)}%
    </span>
  );
}

/* ── DONUT colors ─────────────────────────────────────── */
const DONUT_COLORS = ["#c0273a", "#e07080", "#f4a65a", "#f4cc6a", "#9ea7c1"];

/* ── página ──────────────────────────────────────────── */
export default function DevolucoesPage() {
  const [data, setData]       = useState<DevData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [now] = useState(new Date());

  useEffect(() => {
    fetch("/api/dashboard/devolucoes")
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setData(d); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, minHeight: "100vh" }}>
      <div style={{ color: "var(--ink-3)", fontSize: 13 }}>Carregando dados…</div>
    </div>
  );
  if (error || !data) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, minHeight: "100vh", padding: 32 }}>
      <div style={{ color: RED, fontSize: 13, maxWidth: 700, wordBreak: "break-word" }}>Erro: {error}</div>
    </div>
  );

  const { kpis: k, mensal, maxMes, minMes, clientes, produtos } = data;
  const dateStr = now.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

  const maxCliente = Math.max(...clientes.map(c => c.total), 1);

  // DonutChart slices from produtos (count drives arc size, value shows R$)
  const donutSlices = produtos.map((p, i) => ({
    label: p.code ? p.code : `Prod. ${i + 1}`,
    count: p.total,   // monetary total drives arc proportion
    value: p.total,   // displayed as R$ in the built-in legend
    color: DONUT_COLORS[i] ?? "#9ea7c1",
  }));

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
          <span style={{ color: "var(--ink)", fontWeight: 500 }}>Devoluções</span>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
          Atualizado agora · {dateStr}
        </div>
      </div>

      {/* Conteúdo */}
      <div style={{ padding: "26px 30px 80px" }}>

        {/* Cabeçalho */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", margin: 0, color: "var(--ink)" }}>
              Devoluções &amp; Créditos
            </h1>
            <p style={{ color: "var(--ink-3)", fontSize: 13, margin: "5px 0 0" }}>
              Notas de crédito por mês · RETORNOITENS ·&nbsp;
              <span style={{ color: RED }}>{num(k.qtd12m)} NCs · 12 meses</span>
            </p>
          </div>
        </div>

        {/* KPI Row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 24 }}>
          <KpiHero
            label="Devolvido no Mês"
            value={brl(k.totalMes)}
            delta={k.deltaMoM}
            invert
            spark={k.sparkTrend}
          />
          <KpiCard
            label="NCs Emitidas no Mês"
            value={num(k.qtdNcs)}
            delta={k.deltaQtd}
            invert
            sub={`Acumulado 12m: ${num(k.qtd12m)}`}
          />
          <KpiCard
            label="Taxa de Retorno"
            value={`${k.taxaPct.toFixed(2)}%`}
            delta={k.deltaTaxa}
            isPp
            invert
            sub="Devolvido / Faturado"
          />
          <KpiCard
            label="Ticket Médio NC"
            value={brl(k.ticketMed)}
            delta={k.deltaTicket}
            spark={k.sparkTrend}
            sparkColor={k.deltaTicket !== null && k.deltaTicket < 0 ? RED : "#2dab64"}
          />
        </div>

        {/* Evolução mensal – line area chart */}
        <div style={{ background: "var(--panel)", borderRadius: 14, boxShadow: "var(--shadow-md)", padding: "18px 20px 16px", marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Devoluções por mês · 12 meses</div>
              <div style={{ fontSize: 11, color: RED, marginTop: 2 }}>Valor das NCs emitidas, R$</div>
            </div>
          </div>
          <LineAreaChart
            data={mensal}
            currentAno={ANO}
            currentMes={MES}
            height={250}
            color={RED}
            legendLabel="Valor devolvido"
          />
        </div>

        {/* Devolvido mensal (barras) + Donut */}
        <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 16, marginBottom: 24 }}>

          {/* Barras 12 meses */}
          <div style={{ background: "var(--panel)", borderRadius: 14, boxShadow: "var(--shadow-md)", padding: "18px 20px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Devolvido vs. Faturado · 12 meses</div>
                <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>Valor mensal devolvido</div>
              </div>
              <div style={{ fontSize: 11, color: RED, fontWeight: 500 }}>% de retorno por mês</div>
            </div>
            <MonthlyBarChart data={mensal} height={200} />
            {(maxMes || minMes) && (
              <div style={{ display: "flex", gap: 24, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line-2)" }}>
                {maxMes && (
                  <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
                    <span style={{ color: RED, fontWeight: 600 }}>Maior pico</span>
                    {`: ${maxMes.label} · ${brl(maxMes.total)}`}
                  </div>
                )}
                {minMes && (
                  <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
                    <span style={{ color: "var(--ok)", fontWeight: 600 }}>Menor</span>
                    {`: ${minMes.label} · ${brl(minMes.total)}`}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Donut – top produtos retornados */}
          <div style={{ background: "var(--panel)", borderRadius: 14, boxShadow: "var(--shadow-md)", padding: "18px 20px 16px" }}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Top produtos · 12 meses</div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>Por valor devolvido</div>
            </div>

            {donutSlices.length > 0 ? (
              <DonutChart
                slices={donutSlices}
                size={160}
                centerLabel={num(k.qtd12m)}
                centerSub="NCs no ano"
              />
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 180, color: "var(--ink-3)", fontSize: 12 }}>
                Sem dados de produtos
              </div>
            )}

          </div>
        </div>

        {/* Tabela Clientes */}
        <div style={{ background: "var(--panel)", borderRadius: 14, boxShadow: "var(--shadow-md)", padding: "18px 0 6px", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0 18px 12px" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Clientes com mais devoluções</div>
            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>12 meses · ordenado por valor</div>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line-2)" }}>
                {["#", "CLIENTE (CNPJ)", "NCs", "VALOR DEVOLVIDO", "% DO TOTAL", "BARRA"].map((c, i) => (
                  <th key={c} style={{
                    padding: "5px 14px 7px",
                    textAlign: i <= 1 ? "left" : "right",
                    fontSize: 10, fontWeight: 600, color: "var(--muted)",
                    textTransform: "uppercase", letterSpacing: ".06em",
                  }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clientes.map((c, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--line-3)", background: i % 2 === 1 ? "rgba(236,239,245,.3)" : "transparent" }}>
                  <td style={{ padding: "9px 14px", width: 28 }}>
                    <span style={{ fontSize: 11, color: "var(--muted)", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </td>
                  <td style={{ padding: "9px 14px", maxWidth: 200 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: RED, fontVariantNumeric: "tabular-nums" }}>
                      {c.cnpj}
                    </span>
                  </td>
                  <td style={{ padding: "9px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--ink-2)" }}>
                    {num(c.qtd)}
                  </td>
                  <td style={{ padding: "9px 14px", textAlign: "right", fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
                    {brl(c.total)}
                  </td>
                  <td style={{ padding: "9px 14px", textAlign: "right" }}>
                    <ShareBadge pct={c.share} />
                  </td>
                  <td style={{ padding: "9px 14px", textAlign: "right" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                      <div style={{ width: 64, height: 4, background: "var(--line-2)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ width: `${(c.total / maxCliente) * 100}%`, height: "100%", background: RED, borderRadius: 2 }} />
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
              {clientes.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: "24px 14px", textAlign: "center", color: "var(--ink-3)", fontSize: 12 }}>
                    Sem devoluções nos últimos 12 meses
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>
    </>
  );
}
