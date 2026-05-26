"use client";
import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";

const AgingChart = dynamic(() => import("@/components/charts/AgingChart"), { ssr: false });
const DonutChart = dynamic(() => import("@/components/charts/DonutChart"), { ssr: false });
const Sparkline  = dynamic(() => import("@/components/ui/Sparkline"),      { ssr: false });

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
  totalPedidos: number; deltaTotal:  number | null;
  valorAberto:  number; deltaValor:  number | null;
  aging60:      number; deltaAging:  number | null; valorAging60: number;
  ticketAberto: number; deltaTicket: number | null;
}
interface AgingBucket { faixa: string; qtd: number; valor: number }
interface StatusItem   { count: number; pct: number }
interface StatusGeral  { aberto: StatusItem; parcial: StatusItem; faturado: StatusItem; cancelado: StatusItem; total: number }
interface Pedido {
  num: number; cnpj: string; vend: string; emissao: string;
  dias: number; total: number; openAmt: number; openPct: number; status: "Aberto" | "Parcial";
}
interface PedidosData { kpis: Kpis; agingBuckets: AgingBucket[]; statusGeral: StatusGeral; pedidos: Pedido[] }

/* ── Delta badge ─────────────────────────────────────── */
function Delta({ v, suffix = "MoM" }: { v: number | null; suffix?: string }) {
  if (v === null) return null;
  const pos = v >= 0;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      fontSize: 11, padding: "2px 8px", borderRadius: 8,
      background: pos ? "var(--ok-soft)" : "var(--danger-soft)",
      color: pos ? "var(--ok)" : "var(--danger)",
      fontVariantNumeric: "tabular-nums",
    }}>
      {pos ? "↑" : "↓"} {Math.abs(v).toFixed(1)}% {suffix}
    </span>
  );
}

/* ── KPI Hero ────────────────────────────────────────── */
function KpiHero({ label, value, delta, sub }: { label: string; value: string; delta: number | null; sub?: string }) {
  return (
    <div style={{
      background: "linear-gradient(135deg,#2c4f8e 0%,#1b3664 60%,#122548 100%)",
      borderRadius: 14, boxShadow: "var(--shadow-md)", padding: "18px 20px 14px",
      display: "flex", flexDirection: "column", gap: 8, minHeight: 140,
      position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", inset: "auto -40px -40px auto", width: 160, height: 160, borderRadius: "50%",
        background: "radial-gradient(circle at 30% 30%,rgba(255,255,255,.18),transparent 60%)", pointerEvents: "none" }} />
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 500, color: "rgba(255,255,255,.7)" }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 500, color: "#fff", letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{value}</div>
      <Delta v={delta} />
      {sub && <div style={{ fontSize: 11, color: "rgba(255,255,255,.55)", marginTop: "auto" }}>{sub}</div>}
    </div>
  );
}

/* ── KPI Card ────────────────────────────────────────── */
function KpiCard({ label, value, delta, sub, spark, sparkColor = "#2dab64" }: {
  label: string; value: string; delta: number | null; sub?: string; spark?: number[]; sparkColor?: string;
}) {
  return (
    <div style={{
      background: "var(--panel)", borderRadius: 14, boxShadow: "var(--shadow-md)",
      padding: "18px 20px 14px", display: "flex", flexDirection: "column", gap: 8, minHeight: 140,
    }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 500, color: "var(--ink-3)" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 500, color: "var(--ink)", letterSpacing: "-0.015em", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{value}</div>
      <Delta v={delta} />
      {sub && <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: "auto" }}>{sub}</div>}
      {spark && spark.length > 1 && (
        <div style={{ marginTop: "auto" }}>
          <Sparkline data={spark} color={sparkColor} height={30} strokeW={1.4} />
        </div>
      )}
    </div>
  );
}

/* ── Open % mini bar ─────────────────────────────────── */
function OpenBar({ pct, status }: { pct: number; status: string }) {
  const fill = status === "Parcial" ? "#ff8a55" : "#1b3664";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 72, height: 6, background: "var(--line-2)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: fill, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, color: "var(--ink-3)", fontVariantNumeric: "tabular-nums", width: 30 }}>
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

/* ── Days badge ──────────────────────────────────────── */
function DaysBadge({ dias }: { dias: number }) {
  const color = dias > 60 ? "#d94c5b" : dias > 30 ? "#ff8a55" : dias > 15 ? "#f0a500" : "#2dab64";
  const bg    = dias > 60 ? "#fde6e8" : dias > 30 ? "#fff3eb" : dias > 15 ? "#fff8e1" : "#e0f5ea";
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color, background: bg,
      padding: "2px 8px", borderRadius: 8, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
      {dias} d
    </span>
  );
}

/* ── Status badge ────────────────────────────────────── */
function StatusBadge({ s }: { s: string }) {
  const map: Record<string, { color: string; bg: string }> = {
    Aberto:  { color: "#1b3664", bg: "#e6ebf4" },
    Parcial: { color: "#e87c1e", bg: "#fff3eb" },
  };
  const st = map[s] ?? map.Aberto;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: st.color, background: st.bg,
      padding: "3px 9px", borderRadius: 8, whiteSpace: "nowrap" }}>
      {s}
    </span>
  );
}

/* ── página ──────────────────────────────────────────── */
type TabKey = "todos" | "criticos" | "parciais";

export default function PedidosPage() {
  const [data, setData]     = useState<PedidosData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [tab, setTab]       = useState<TabKey>("todos");
  const [search, setSearch] = useState("");
  const [now] = useState(new Date());

  useEffect(() => {
    fetch("/api/dashboard/pedidos")
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setData(d); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const pedidosFiltrados = useMemo(() => {
    if (!data) return [];
    let list = data.pedidos;
    if (tab === "criticos") list = list.filter(p => p.dias > 60);
    if (tab === "parciais") list = list.filter(p => p.status === "Parcial");
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        String(p.num).includes(q) || p.cnpj.toLowerCase().includes(q) || p.vend.toLowerCase().includes(q)
      );
    }
    return list;
  }, [data, tab, search]);

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

  const { kpis: k, agingBuckets, statusGeral: sg, pedidos } = data;
  const dateStr = now.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

  const criticos = pedidos.filter(p => p.dias > 60).length;
  const parciais = pedidos.filter(p => p.status === "Parcial").length;

  const donutSlices = [
    { label: "Aberto",    count: sg.aberto.count,    value: 0, color: "#1b3664" },
    { label: "Parcial",   count: sg.parcial.count,   value: 0, color: "#ff8a55" },
    { label: "Faturado",  count: sg.faturado.count,  value: 0, color: "#2dab64" },
    { label: "Cancelado", count: sg.cancelado.count, value: 0, color: "#d94c5b" },
  ].filter(s => s.count > 0);

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
          <span style={{ color: "var(--ink)", fontWeight: 500 }}>Pedidos em Aberto</span>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 16, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--blue-2)", fontVariantNumeric: "tabular-nums" }}>
            {num(k.totalPedidos)} pedidos · {brl(k.valorAberto)} em aberto
          </span>
          <span style={{ fontSize: 11, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
            {dateStr}
          </span>
        </div>
      </div>

      {/* Conteúdo */}
      <div style={{ padding: "26px 30px 80px" }}>

        {/* Cabeçalho */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", margin: 0, color: "var(--ink)" }}>
            Pedidos em Aberto
          </h1>
          <p style={{ color: "var(--ink-3)", fontSize: 13, margin: "5px 0 0" }}>
            OpenQty &gt; 0 · OpenAmount &gt; 0 · Abril · 2026
          </p>
        </div>

        {/* KPI Row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 24 }}>
          <KpiHero
            label="Pedidos com saldo"
            value={num(k.totalPedidos)}
            delta={k.deltaTotal}
            sub="com OpenQty > 0"
          />
          <KpiCard
            label="Valor em aberto"
            value={brl(k.valorAberto)}
            delta={k.deltaValor}
            sparkColor="#2dab64"
          />
          <KpiCard
            label="Pedidos > 60 dias"
            value={num(k.aging60)}
            delta={k.deltaAging}
            sub={`Valor: ${brl(k.valorAging60)}`}
            sparkColor="#d94c5b"
          />
          <KpiCard
            label="Ticket médio em aberto"
            value={brl(k.ticketAberto)}
            delta={k.deltaTicket}
            sparkColor="#1b3664"
          />
        </div>

        {/* Middle row: Aging + Status */}
        <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 16, marginBottom: 24 }}>

          {/* Aging */}
          <div style={{ background: "var(--panel)", borderRadius: 14, boxShadow: "var(--shadow-md)", padding: "18px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Aging · faixas de dias em aberto</div>
                <div style={{ fontSize: 11, color: "var(--blue-2)", marginTop: 2 }}>por contagem e valor</div>
              </div>
            </div>
            <AgingChart buckets={agingBuckets} height={220} />
          </div>

          {/* Status geral */}
          <div style={{ background: "var(--panel)", borderRadius: 14, boxShadow: "var(--shadow-md)", padding: "18px 20px" }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Status dos pedidos</div>
              <div style={{ fontSize: 11, color: "var(--blue-2)", marginTop: 2 }}>carteira total acumulada</div>
            </div>

            {/* Custom donut with pct legend */}
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              {/* Donut */}
              <div style={{ flexShrink: 0 }}>
                <DonutChart
                  slices={donutSlices}
                  size={150}
                  centerLabel={num(sg.total)}
                  centerSub="TOTAL GERAL"
                />
              </div>
            </div>

            {/* Pct list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--line-2)" }}>
              {[
                { label: "Aberto",    data: sg.aberto,    color: "#1b3664" },
                { label: "Parcial",   data: sg.parcial,   color: "#ff8a55" },
                { label: "Faturado",  data: sg.faturado,  color: "#2dab64" },
                { label: "Cancelado", data: sg.cancelado, color: "#d94c5b" },
              ].map(s => (
                <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 12, color: "var(--ink-2)" }}>{s.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
                    {num(s.data.count)}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--muted)", width: 38, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {s.data.pct.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tabela pedidos em aberto */}
        <div style={{ background: "var(--panel)", borderRadius: 14, boxShadow: "var(--shadow-md)", padding: "18px 0 6px" }}>

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Pedidos em aberto</span>

              {/* Tabs */}
              {([ ["todos", "Todos", pedidos.length], ["criticos", "Críticos", criticos], ["parciais", "Parciais", parciais] ] as [TabKey, string, number][]).map(([key, lbl, cnt]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "4px 10px", borderRadius: 8, border: "none", cursor: "pointer",
                    fontSize: 12, fontWeight: tab === key ? 600 : 400,
                    background: tab === key ? "#e6ebf4" : "transparent",
                    color: tab === key ? "var(--blue)" : "var(--ink-3)",
                  }}
                >
                  {lbl}
                  <span style={{ fontSize: 11, fontWeight: 700, background: tab === key ? "#1b3664" : "var(--bg)", color: tab === key ? "#fff" : "var(--muted)", padding: "0 6px", borderRadius: 6 }}>
                    {cnt}
                  </span>
                </button>
              ))}
            </div>

            {/* Search */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "var(--muted)" }}>⌕</span>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar pedido"
                  style={{
                    paddingLeft: 26, paddingRight: 10, height: 32, borderRadius: 8,
                    border: "1px solid var(--line-2)", background: "var(--bg)",
                    fontSize: 12, color: "var(--ink)", outline: "none", width: 160,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Table */}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line-2)" }}>
                {["N° PEDIDO","CLIENTE","VENDEDOR","EMISSÃO","DIAS","VALOR TOTAL","OPEN %","OPEN AMOUNT","STATUS"].map((h, i) => (
                  <th key={h} style={{
                    padding: "6px 14px 8px",
                    textAlign: i <= 3 ? "left" : "right",
                    fontSize: 10, fontWeight: 600, color: "var(--muted)",
                    textTransform: "uppercase", letterSpacing: ".06em",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pedidosFiltrados.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding: "24px", textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>
                    Nenhum pedido encontrado
                  </td>
                </tr>
              )}
              {pedidosFiltrados.map((p, i) => (
                <tr key={p.num} style={{ borderBottom: "1px solid var(--line-3)", background: i % 2 === 1 ? "rgba(236,239,245,.3)" : "transparent" }}>
                  <td style={{ padding: "9px 14px" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--blue-2)", fontVariantNumeric: "tabular-nums" }}>
                      # {num(p.num)}
                    </span>
                  </td>
                  <td style={{ padding: "9px 14px", maxWidth: 160 }}>
                    <span style={{ fontSize: 12, color: "var(--blue-2)", fontVariantNumeric: "tabular-nums" }}>
                      {p.cnpj || "—"}
                    </span>
                  </td>
                  <td style={{ padding: "9px 14px" }}>
                    <span style={{ fontSize: 11.5, color: "var(--blue-2)" }}>{p.vend}</span>
                  </td>
                  <td style={{ padding: "9px 14px" }}>
                    <span style={{ fontSize: 11.5, color: "var(--ink-2)", fontVariantNumeric: "tabular-nums" }}>
                      {new Date(p.emissao).toLocaleDateString("pt-BR")}
                    </span>
                  </td>
                  <td style={{ padding: "9px 14px", textAlign: "right" }}>
                    <DaysBadge dias={p.dias} />
                  </td>
                  <td style={{ padding: "9px 14px", textAlign: "right", fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
                    {brl(p.total)}
                  </td>
                  <td style={{ padding: "9px 14px", textAlign: "right" }}>
                    <OpenBar pct={p.openPct} status={p.status} />
                  </td>
                  <td style={{ padding: "9px 14px", textAlign: "right", fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
                    {brl(p.openAmt)}
                  </td>
                  <td style={{ padding: "9px 14px", textAlign: "right" }}>
                    <StatusBadge s={p.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {pedidosFiltrados.length > 0 && (
            <div style={{ padding: "10px 18px", fontSize: 11, color: "var(--muted)", textAlign: "right" }}>
              Exibindo {pedidosFiltrados.length} de {pedidos.length} pedidos
            </div>
          )}
        </div>

      </div>
    </>
  );
}
