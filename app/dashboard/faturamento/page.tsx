"use client";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";

const Sparkline     = dynamic(() => import("@/components/ui/Sparkline"),              { ssr: false });
const LineAreaChart = dynamic(() => import("@/components/charts/LineAreaChart"),      { ssr: false });
const DailyBarChart = dynamic(() => import("@/components/charts/DailyBarChart"),      { ssr: false });

/* ── formatters ──────────────────────────────────────── */
const brl = (v: number) => {
  if (v >= 1e9) return `R$ ${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `R$ ${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `R$ ${(v / 1e3).toFixed(0)}K`;
  return `R$ ${v.toFixed(0)}`;
};
const num = (v: number) => new Intl.NumberFormat("pt-BR").format(v);
const pct = (v: number) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v) + "%";

/* ── tipos ───────────────────────────────────────────── */
interface Kpis {
  totalMes: number;   deltaMoM:    number | null;
  ytdVal: number;     deltaYoY:    number | null;
  ticketMed: number;  deltaTicket: number | null;
  qtdNfs: number;     deltaQtdMoM: number | null;
  maiorNf: number;
  totalAnt: number;   diasComMov: number; projecao: number;
}
interface ChartPoint { label: string; ano: number; mes: number; total: number; qtd: number }
interface DayPoint   { dia: number; total: number; qtd: number }
interface TopCliente { cnpj: string; pedidos: number; ticket: number; total: number; share: number }
interface TopProduto { code: string; descr: string; qtd: number; total: number; share: number }
interface Sparklines { faturamento: number[]; ytd: number[]; ticket: number[] }
interface FatData {
  kpis: Kpis;
  sparklines: Sparklines;
  chartMensal: ChartPoint[];
  chartDiario: DayPoint[];
  topClientes: TopCliente[];
  topProdutos: TopProduto[];
}

/* ── Delta badge ─────────────────────────────────────── */
function Delta({ v, suffix = "MoM" }: { v: number | null; suffix?: string }) {
  if (v === null) return null;
  const pos = v >= 0;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      fontSize: 11, padding: "2px 8px", borderRadius: 8, width: "fit-content",
      background: pos ? "var(--ok-soft)" : "var(--danger-soft)",
      color: pos ? "var(--ok)" : "var(--danger)",
      fontVariantNumeric: "tabular-nums",
    }}>
      {pos ? "↑" : "↓"} {Math.abs(v).toFixed(1)}% {suffix}
    </span>
  );
}

/* ── KPI cards ───────────────────────────────────────── */
function KpiHero({ label, value, delta, suffix, spark }: {
  label: string; value: string; delta: number | null; suffix?: string; spark?: number[];
}) {
  return (
    <div style={{
      background: "linear-gradient(135deg,#2c4f8e 0%,#1b3664 60%,#122548 100%)",
      borderRadius: 14, boxShadow: "var(--shadow-md)", padding: "18px 20px 14px",
      display: "flex", flexDirection: "column", gap: 8, minHeight: 148,
      position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", inset: "auto -40px -40px auto", width: 160, height: 160,
        borderRadius: "50%", background: "radial-gradient(circle at 30% 30%,rgba(255,255,255,.18),transparent 60%)", pointerEvents: "none" }} />
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 500, color: "rgba(255,255,255,.7)" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 500, color: "#fff", letterSpacing: "-0.015em", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{value}</div>
      <Delta v={delta} suffix={suffix} />
      {spark && spark.length > 1 && (
        <div style={{ marginTop: "auto" }}>
          <Sparkline data={spark} color="rgba(255,255,255,.7)" height={34} strokeW={1.5} />
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, delta, suffix, sub, spark, sparkColor = "#1b3664" }: {
  label: string; value: string; delta: number | null; suffix?: string;
  sub?: string; spark?: number[]; sparkColor?: string;
}) {
  return (
    <div style={{
      background: "var(--panel)", borderRadius: 14, boxShadow: "var(--shadow-md)",
      padding: "18px 20px 14px", display: "flex", flexDirection: "column", gap: 8, minHeight: 148,
    }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 500, color: "var(--ink-3)" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 500, color: "var(--ink)", letterSpacing: "-0.015em", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{value}</div>
      <Delta v={delta} suffix={suffix} />
      {sub && <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: "auto" }}>{sub}</div>}
      {spark && spark.length > 1 && (
        <div style={{ marginTop: "auto" }}>
          <Sparkline data={spark} color={sparkColor} height={32} strokeW={1.4} />
        </div>
      )}
    </div>
  );
}

/* ── Ranking table ───────────────────────────────────── */
function RankTable<T extends { total: number; share: number }>({
  title, subtitle, cols, rows, renderRow,
}: {
  title: string; subtitle: string;
  cols: string[];
  rows: T[];
  renderRow: (row: T, idx: number) => React.ReactNode;
}) {
  const maxTotal = Math.max(...rows.map(r => r.total), 1);
  return (
    <div style={{ background: "var(--panel)", borderRadius: 14, boxShadow: "var(--shadow-md)", padding: "18px 0 6px", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0 18px 12px" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{title}</div>
        <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{subtitle}</div>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--line-2)" }}>
            {cols.map(c => (
              <th key={c} style={{
                padding: "5px 14px 7px",
                textAlign: c === cols[1] ? "left" : "right",
                fontSize: 10, fontWeight: 600, color: "var(--muted)",
                textTransform: "uppercase", letterSpacing: ".06em",
              }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              style={{ borderBottom: "1px solid var(--line-3)", background: i % 2 === 1 ? "rgba(236,239,245,.3)" : "transparent" }}
            >
              {renderRow(row, i)}
            </tr>
          ))}
        </tbody>
      </table>
      {/* Share bar overlay hint (visual) */}
      <div style={{ display: "none" }}>{maxTotal}</div>
    </div>
  );
}

/* ── página ──────────────────────────────────────────── */
const ANO = 2026, MES = 4;

export default function FaturamentoPage() {
  const [data, setData]   = useState<FatData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [now] = useState(new Date());

  useEffect(() => {
    fetch("/api/dashboard/faturamento")
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
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, minHeight: "100vh" }}>
      <div style={{ color: "var(--danger)", fontSize: 13 }}>Erro: {error}</div>
    </div>
  );

  const { kpis: k, sparklines: sp, chartMensal, chartDiario, topClientes, topProdutos } = data;
  const dateStr = now.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const diff    = k.totalMes - k.totalAnt;
  const diffPct = k.totalAnt > 0 ? (diff / k.totalAnt) * 100 : 0;

  // Total top-10 shares
  const maxCliente = Math.max(...topClientes.map(c => c.total), 1);
  const maxProduto = Math.max(...topProdutos.map(p => p.total), 1);

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
          <span style={{ color: "var(--ink)", fontWeight: 500 }}>Faturamento</span>
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
              Faturamento (NFs)
            </h1>
            <p style={{ color: "var(--ink-3)", fontSize: 13, margin: "5px 0 0" }}>
              Análise temporal e composição ·&nbsp;
              <span style={{ color: "var(--blue-2)" }}>{num(k.qtdNfs)} NFs · Abril · 2026</span>
            </p>
          </div>
        </div>

        {/* KPI Row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 24 }}>
          <KpiHero
            label="Faturado no Mês"
            value={brl(k.totalMes)}
            delta={k.deltaMoM}
            suffix="MoM"
            spark={sp.faturamento}
          />
          <KpiCard
            label="Acumulado no Ano"
            value={brl(k.ytdVal)}
            delta={k.deltaYoY}
            suffix="YoY"
            spark={sp.ytd}
            sparkColor="#1b3664"
          />
          <KpiCard
            label="Ticket Médio"
            value={brl(k.ticketMed)}
            delta={k.deltaTicket}
            suffix="MoM"
            spark={sp.ticket}
            sparkColor={k.deltaTicket !== null && k.deltaTicket < 0 ? "#d94c5b" : "#1b3664"}
          />
          <KpiCard
            label="NFs Emitidas (Mês)"
            value={num(k.qtdNfs)}
            delta={k.deltaQtdMoM}
            suffix="MoM"
            sub={`Maior NF do mês ${brl(k.maiorNf)}`}
          />
        </div>

        {/* Evolução mensal */}
        <div style={{ background: "var(--panel)", borderRadius: 14, boxShadow: "var(--shadow-md)", padding: "18px 20px 16px", marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Evolução mensal · 12 meses</div>
              <div style={{ fontSize: 11, color: "var(--blue-2)", marginTop: 2 }}>NFs faturadas, R$</div>
            </div>
          </div>

          <LineAreaChart data={chartMensal} currentAno={ANO} currentMes={MES} height={260} />

          {/* Stats bar */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            borderTop: "1px solid var(--line-2)", paddingTop: 14, marginTop: 4, gap: 8,
          }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600 }}>Mês Atual</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums", marginTop: 3 }}>{brl(k.totalMes)}</div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>parcial · {k.diasComMov} de 30 dias</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600 }}>Mês Anterior</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums", marginTop: 3 }}>{brl(k.totalAnt)}</div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>100% encerrado</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600 }}>Diferença</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: diff >= 0 ? "var(--ok)" : "var(--danger)", fontVariantNumeric: "tabular-nums", marginTop: 3 }}>
                {diff >= 0 ? "+" : ""}{brl(diff)}
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{diffPct.toFixed(1)}% MoM</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600 }}>Projeção Fim do Mês</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: "var(--blue-2)", fontVariantNumeric: "tabular-nums", marginTop: 3 }}>{brl(k.projecao)}</div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>extrapolação linear</div>
            </div>
          </div>
        </div>

        {/* Faturamento diário */}
        <div style={{ background: "var(--panel)", borderRadius: 14, boxShadow: "var(--shadow-md)", padding: "18px 20px 16px", marginBottom: 24 }}>
          <div style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Faturamento diário · Abril · 2026</div>
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>fins de semana destacados em cinza</div>
          </div>
          <DailyBarChart data={chartDiario} height={200} ano={ANO} mes={MES} totalDias={30} />
        </div>

        {/* Tabelas Top 10 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

          {/* Top 10 Clientes */}
          <RankTable
            title="Top 10 clientes"
            subtitle="por valor faturado"
            cols={["#", "CLIENTE", "PEDIDOS", "TICKET", "VALOR", "SHARE"]}
            rows={topClientes}
            renderRow={(row, i) => (
              <>
                <td style={{ padding: "8px 14px", width: 28, textAlign: "right" }}>
                  <span style={{ fontSize: 11, color: "var(--muted)", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </td>
                <td style={{ padding: "8px 14px", maxWidth: 180 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--blue-2)", fontVariantNumeric: "tabular-nums" }}>
                    {row.cnpj}
                  </span>
                </td>
                <td style={{ padding: "8px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--ink-2)" }}>
                  {num(row.pedidos)}
                </td>
                <td style={{ padding: "8px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--ink-2)" }}>
                  {brl(row.ticket)}
                </td>
                <td style={{ padding: "8px 14px", textAlign: "right", fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
                  {brl(row.total)}
                </td>
                <td style={{ padding: "8px 14px", textAlign: "right" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                    <div style={{ width: 48, height: 4, background: "var(--line-2)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ width: `${(row.total / maxCliente) * 100}%`, height: "100%", background: "var(--blue)", borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 11, color: "var(--ink-3)", fontVariantNumeric: "tabular-nums", width: 34, textAlign: "right" }}>
                      {row.share.toFixed(1)}%
                    </span>
                  </div>
                </td>
              </>
            )}
          />

          {/* Top 10 Produtos */}
          <RankTable
            title="Top 10 produtos"
            subtitle="por valor faturado"
            cols={["#", "CÓDIGO · DESCRIÇÃO", "QTD.", "VALOR", "SHARE"]}
            rows={topProdutos}
            renderRow={(row, i) => (
              <>
                <td style={{ padding: "8px 14px", width: 28, textAlign: "right" }}>
                  <span style={{ fontSize: 11, color: "var(--muted)", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </td>
                <td style={{ padding: "8px 14px", maxWidth: 200 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{row.code}</div>
                  <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 1, lineHeight: 1.3 }}>
                    {row.descr.length > 36 ? row.descr.slice(0, 36) + "…" : row.descr}
                  </div>
                </td>
                <td style={{ padding: "8px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--ink-2)" }}>
                  {row.qtd >= 1000
                    ? `${(row.qtd / 1000).toFixed(0)}k`
                    : num(Math.round(row.qtd))}
                </td>
                <td style={{ padding: "8px 14px", textAlign: "right", fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
                  {brl(row.total)}
                </td>
                <td style={{ padding: "8px 14px", textAlign: "right" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                    <div style={{ width: 48, height: 4, background: "var(--line-2)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ width: `${(row.total / maxProduto) * 100}%`, height: "100%", background: "#2aafd8", borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 11, color: "var(--ink-3)", fontVariantNumeric: "tabular-nums", width: 34, textAlign: "right" }}>
                      {row.share.toFixed(1)}%
                    </span>
                  </div>
                </td>
              </>
            )}
          />
        </div>

      </div>
    </>
  );
}
