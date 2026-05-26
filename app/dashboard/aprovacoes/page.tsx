"use client";
import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";

const Sparkline = dynamic(() => import("@/components/ui/Sparkline"), { ssr: false });

/* ── formatters ──────────────────────────────────────── */
const num = (v: number) => new Intl.NumberFormat("pt-BR").format(v);
const pp  = (v: number, d = 1) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v) + "%";
const dias = (v: number) => `${v.toFixed(1)}d`;

/* ── tipos ───────────────────────────────────────────── */
interface Kpis {
  totalPend: number; deltaMoM: number | null; altaPrio: number; aprovAtivos: number;
  tempoMedio: number; aprovados30: number;
  slaPct: number;
}
interface Etapa   { idx: number; etapa: string; qtd: number; diasMedio: number }
interface Aprovador {
  code: number; label: string; initials: string;
  pendentes: number; aprovados30d: number; tempoMedio: number; slaPct: number;
}
interface FilaItem {
  idx: number; tipo: number; tipoLabel: string; docDate: string;
  etapa: string; aprovCode: number; dias: number; prioridade: string;
}
interface TiposDist { pedidos: number; cotacoes: number; creditos: number; outros: number }
interface AprovData {
  kpis: Kpis; etapas: Etapa[]; maxQtdEtapa: number;
  aprovadores: Aprovador[]; fila: FilaItem[]; tiposDist: TiposDist;
}

/* ── Delta badge ─────────────────────────────────────── */
function Delta({ v, suffix = "MoM", invert = false }: { v: number | null; suffix?: string; invert?: boolean }) {
  if (v === null) return null;
  const pos = invert ? v <= 0 : v >= 0;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11,
      padding: "2px 8px", borderRadius: 8,
      background: pos ? "var(--ok-soft)" : "var(--danger-soft)",
      color: pos ? "var(--ok)" : "var(--danger)",
      fontVariantNumeric: "tabular-nums",
    }}>
      {v >= 0 ? "↑" : "↓"} {Math.abs(v).toFixed(1)}% {suffix}
    </span>
  );
}

/* ── SLA badge ───────────────────────────────────────── */
function SlaBadge({ pct }: { pct: number }) {
  const color = pct >= 90 ? "#2dab64" : pct >= 75 ? "#ff8a55" : "#d94c5b";
  const bg    = pct >= 90 ? "var(--ok-soft)" : pct >= 75 ? "#fff3eb" : "var(--danger-soft)";
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color, background: bg,
      padding: "3px 8px", borderRadius: 8, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
      {pp(pct, 0)}
    </span>
  );
}

/* ── Prioridade badge ────────────────────────────────── */
function PrioBadge({ p }: { p: string }) {
  const map: Record<string, { dot: string; text: string }> = {
    Alta:  { dot: "#d94c5b", text: "var(--ink-2)" },
    Média: { dot: "#ff8a55", text: "var(--ink-2)" },
    Baixa: { dot: "#9ea7c1", text: "var(--ink-3)" },
  };
  const st = map[p] ?? map.Baixa;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: st.dot, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: st.text }}>{p}</span>
    </div>
  );
}

/* ── Tipo badge ──────────────────────────────────────── */
function TipoBadge({ label }: { label: string }) {
  const map: Record<string, { color: string; bg: string }> = {
    Pedido:    { color: "#1b3664", bg: "#e6ebf4" },
    Cotação:   { color: "#2aafd8", bg: "#e0f6fd" },
    Crédito:   { color: "#e87c1e", bg: "#fff3eb" },
    Documento: { color: "#6a7493", bg: "var(--bg)" },
  };
  const st = map[label] ?? map.Documento;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: st.color, background: st.bg,
      padding: "2px 9px", borderRadius: 8, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

/* ── Dias badge ──────────────────────────────────────── */
function DiasBadge({ d }: { d: number }) {
  const color = d > 3 ? "#d94c5b" : d > 1 ? "#ff8a55" : "#2dab64";
  const bg    = d > 3 ? "#fde6e8" : d > 1 ? "#fff3eb" : "var(--ok-soft)";
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color, background: bg,
      padding: "2px 8px", borderRadius: 8, fontVariantNumeric: "tabular-nums" }}>
      {d} d
    </span>
  );
}

/* ── Etapa colors ────────────────────────────────────── */
const ETAPA_COLORS = ["#1b3664","#294a82","#ff8a55","#2aafd8","#2dab64","#a299f0","#d94c5b"];

/* ── tipo tabs ───────────────────────────────────────── */
type TabKey = "todos" | "alta" | "pedidos" | "cotacoes" | "creditos";

/* ── página ──────────────────────────────────────────── */
export default function AprovacoesPage() {
  const [data, setData]   = useState<AprovData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab]     = useState<TabKey>("todos");
  const [now] = useState(new Date());

  useEffect(() => {
    fetch("/api/dashboard/aprovacoes")
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setData(d); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filaFiltrada = useMemo(() => {
    if (!data) return [];
    const m: Record<TabKey, (item: FilaItem) => boolean> = {
      todos:    () => true,
      alta:     i  => i.prioridade === "Alta",
      pedidos:  i  => i.tipo === 17,
      cotacoes: i  => i.tipo === 23,
      creditos: i  => i.tipo === 14,
    };
    return data.fila.filter(m[tab]);
  }, [data, tab]);

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", flex:1, minHeight:"100vh" }}>
      <div style={{ color:"var(--ink-3)", fontSize:13 }}>Carregando dados…</div>
    </div>
  );
  if (error || !data) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", flex:1, minHeight:"100vh" }}>
      <div style={{ color:"var(--danger)", fontSize:13 }}>Erro: {error}</div>
    </div>
  );

  const { kpis: k, etapas, maxQtdEtapa, aprovadores, fila, tiposDist } = data;
  const dateStr = now.toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric" });

  const tabs: [TabKey, string, number][] = [
    ["todos",    "Todos",    fila.length],
    ["alta",     "Alta",     fila.filter(i => i.prioridade === "Alta").length],
    ["pedidos",  "Pedidos",  tiposDist.pedidos],
    ["cotacoes", "Cotações", tiposDist.cotacoes],
    ["creditos", "Créditos", tiposDist.creditos],
  ];

  return (
    <>
      {/* Topbar */}
      <div style={{
        height: 60, borderBottom: "1px solid var(--line-3)",
        background: "rgba(255,255,255,.85)", backdropFilter: "blur(12px)",
        display: "flex", alignItems: "center", padding: "0 26px", gap: 14,
        position: "sticky", top: 0, zIndex: 10,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, color:"var(--ink-3)", fontSize:12 }}>
          <span>Painel</span><span style={{ color:"var(--muted)" }}>/</span>
          <span style={{ color:"var(--ink)", fontWeight:500 }}>Aprovações</span>
        </div>
        <div style={{ marginLeft:"auto", display:"flex", gap:16, alignItems:"center" }}>
          <span style={{ fontSize:11, color:"var(--blue-2)", fontVariantNumeric:"tabular-nums" }}>
            {num(k.totalPend)} pendentes
          </span>
          <span style={{ fontSize:11, color:"var(--muted)" }}>{dateStr}</span>
        </div>
      </div>

      {/* Conteúdo */}
      <div style={{ padding:"26px 30px 80px" }}>

        {/* Cabeçalho */}
        <div style={{ marginBottom:24 }}>
          <h1 style={{ fontSize:24, fontWeight:600, letterSpacing:"-0.02em", margin:0, color:"var(--ink)" }}>Aprovações</h1>
          <p style={{ color:"var(--ink-3)", fontSize:13, margin:"5px 0 0" }}>
            Documentos pendentes por etapa · Abril · 2026
          </p>
        </div>

        {/* KPI Row */}
        <div style={{ display:"grid", gridTemplateColumns:"1.4fr 1fr 1fr 1fr", gap:16, marginBottom:24 }}>

          {/* Hero */}
          <div style={{
            background:"linear-gradient(135deg,#2c4f8e 0%,#1b3664 60%,#122548 100%)",
            borderRadius:14, boxShadow:"var(--shadow-md)", padding:"18px 20px 14px",
            display:"flex", flexDirection:"column", gap:8, minHeight:140,
            position:"relative", overflow:"hidden",
          }}>
            <div style={{ position:"absolute", inset:"auto -40px -40px auto", width:160, height:160, borderRadius:"50%",
              background:"radial-gradient(circle at 30% 30%,rgba(255,255,255,.18),transparent 60%)", pointerEvents:"none" }} />
            <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:".08em", fontWeight:500, color:"rgba(255,255,255,.7)" }}>Pendentes</div>
            <div style={{ fontSize:36, fontWeight:500, color:"#fff", letterSpacing:"-0.02em", fontVariantNumeric:"tabular-nums", lineHeight:1 }}>{num(k.totalPend)}</div>
            <Delta v={k.deltaMoM} invert={true} />
            <div style={{ fontSize:11, color:"rgba(255,255,255,.55)", marginTop:"auto" }}>
              <span style={{ display:"inline-flex", alignItems:"center", gap:4 }}>
                <span style={{ width:6, height:6, borderRadius:"50%", background:"#d94c5b", display:"inline-block" }} />
                {k.altaPrio} de alta prioridade
              </span>
            </div>
          </div>

          {/* Tempo médio */}
          <div style={{ background:"var(--panel)", borderRadius:14, boxShadow:"var(--shadow-md)", padding:"18px 20px 14px",
            display:"flex", flexDirection:"column", gap:8, minHeight:140 }}>
            <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:".08em", fontWeight:500, color:"var(--ink-3)" }}>Tempo médio aprovação</div>
            <div style={{ fontSize:30, fontWeight:500, color:"var(--ink)", letterSpacing:"-0.015em", fontVariantNumeric:"tabular-nums", lineHeight:1.1 }}>
              {dias(k.tempoMedio)}
            </div>
            <div style={{ fontSize:11, color:"var(--ink-3)", marginTop:"auto" }}>
              {num(k.aprovados30)} aprovações nos últimos 30 dias
            </div>
          </div>

          {/* Aprovadores ativos */}
          <div style={{ background:"var(--panel)", borderRadius:14, boxShadow:"var(--shadow-md)", padding:"18px 20px 14px",
            display:"flex", flexDirection:"column", gap:8, minHeight:140 }}>
            <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:".08em", fontWeight:500, color:"var(--ink-3)" }}>Aprovadores com fila</div>
            <div style={{ fontSize:30, fontWeight:500, color:"var(--ink)", letterSpacing:"-0.015em", fontVariantNumeric:"tabular-nums", lineHeight:1.1 }}>
              {num(k.aprovAtivos)}
            </div>
            <div style={{ fontSize:11, color:"var(--ink-3)", marginTop:"auto" }}>
              Distribuído em {etapas.length} etapas
            </div>
          </div>

          {/* SLA */}
          <div style={{ background:"var(--panel)", borderRadius:14, boxShadow:"var(--shadow-md)", padding:"18px 20px 14px",
            display:"flex", flexDirection:"column", gap:8, minHeight:140 }}>
            <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:".08em", fontWeight:500, color:"var(--ink-3)" }}>SLA cumprido (30d)</div>
            <div style={{ fontSize:30, fontWeight:500, color:"var(--ink)", letterSpacing:"-0.015em", fontVariantNumeric:"tabular-nums", lineHeight:1.1 }}>
              {pp(k.slaPct, 1)}
            </div>
            <div style={{ fontSize:11, color:"var(--ink-3)", marginTop:"auto" }}>aprovados em ≤ 2 dias</div>
          </div>
        </div>

        {/* Middle row */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:24 }}>

          {/* Etapas */}
          <div style={{ background:"var(--panel)", borderRadius:14, boxShadow:"var(--shadow-md)", padding:"18px 20px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color:"var(--ink)" }}>Documentos pendentes por etapa</div>
              <div style={{ fontSize:10, color:"var(--muted)", fontFamily:"monospace" }}>DocumentCurrStepName</div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {etapas.map((e, i) => {
                const barPct = (e.qtd / maxQtdEtapa) * 100;
                const col    = ETAPA_COLORS[i % ETAPA_COLORS.length];
                return (
                  <div key={e.etapa}>
                    <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:5 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ fontSize:10, color:"var(--muted)", fontWeight:600, fontVariantNumeric:"tabular-nums", width:16 }}>
                          {String(e.idx).padStart(2,"0")}
                        </span>
                        <span style={{ fontSize:12, fontWeight:600, color:col }}>{e.etapa}</span>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                        <span style={{ fontSize:11, color:"var(--ink-3)" }}>{dias(e.diasMedio)} médio</span>
                        <span style={{ fontSize:12, fontWeight:700, color:"var(--ink)", fontVariantNumeric:"tabular-nums",
                          background:"var(--bg)", padding:"1px 8px", borderRadius:8 }}>
                          {e.qtd}
                        </span>
                      </div>
                    </div>
                    <div style={{ height:6, background:"var(--line-2)", borderRadius:3, overflow:"hidden" }}>
                      <div style={{ width:`${barPct}%`, height:"100%", background:col, borderRadius:3, transition:"width .5s" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Aprovadores */}
          <div style={{ background:"var(--panel)", borderRadius:14, boxShadow:"var(--shadow-md)", padding:"18px 0 8px", overflow:"hidden" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", padding:"0 18px 14px" }}>
              <div style={{ fontSize:13, fontWeight:600, color:"var(--ink)" }}>Aprovadores · desempenho 30 dias</div>
              <div style={{ fontSize:10, color:"var(--muted)", fontFamily:"monospace" }}>DocumentApproverName</div>
            </div>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead>
                <tr style={{ borderBottom:"1px solid var(--line-2)" }}>
                  {["APROVADOR","PENDENTES","APROV. 30D","TEMPO MÉD.","SLA"].map((h,i) => (
                    <th key={h} style={{
                      padding:"5px 14px 7px",
                      textAlign: i === 0 ? "left" : "right",
                      fontSize:10, fontWeight:600, color:"var(--muted)",
                      textTransform:"uppercase", letterSpacing:".06em",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {aprovadores.map((a, i) => (
                  <tr key={a.code} style={{ borderBottom:"1px solid var(--line-3)", background: i%2===1?"rgba(236,239,245,.3)":"transparent" }}>
                    <td style={{ padding:"9px 14px" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                        <div style={{
                          width:28, height:28, borderRadius:"50%", flexShrink:0,
                          background:`hsl(${(a.code * 47) % 360},40%,36%)`,
                          color:"#fff", display:"grid", placeItems:"center",
                          fontSize:9, fontWeight:700,
                        }}>{a.initials}</div>
                        <span style={{ fontSize:11.5, color:"var(--ink-2)" }}>{a.label}</span>
                      </div>
                    </td>
                    <td style={{ padding:"9px 14px", textAlign:"right" }}>
                      <span style={{ fontSize:12, fontWeight:700, color: a.pendentes > 5 ? "#d94c5b" : a.pendentes > 2 ? "#ff8a55" : "var(--ink)",
                        background: a.pendentes > 5 ? "#fde6e8" : a.pendentes > 2 ? "#fff3eb" : "var(--bg)",
                        padding:"2px 8px", borderRadius:8, fontVariantNumeric:"tabular-nums" }}>
                        {a.pendentes}
                      </span>
                    </td>
                    <td style={{ padding:"9px 14px", textAlign:"right", color:"var(--ink-2)", fontVariantNumeric:"tabular-nums" }}>{num(a.aprovados30d)}</td>
                    <td style={{ padding:"9px 14px", textAlign:"right", color:"var(--ink-2)", fontVariantNumeric:"tabular-nums" }}>{dias(a.tempoMedio)}</td>
                    <td style={{ padding:"9px 14px", textAlign:"right" }}><SlaBadge pct={a.slaPct} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Fila de aprovações */}
        <div style={{ background:"var(--panel)", borderRadius:14, boxShadow:"var(--shadow-md)", padding:"18px 0 6px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 18px 14px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontSize:13, fontWeight:600, color:"var(--ink)" }}>Fila de aprovações</span>
              {tabs.map(([key, lbl, cnt]) => (
                <button key={key} onClick={() => setTab(key)} style={{
                  display:"inline-flex", alignItems:"center", gap:5,
                  padding:"4px 10px", borderRadius:8, border:"none", cursor:"pointer",
                  fontSize:12, fontWeight: tab===key ? 600 : 400,
                  background: tab===key ? "#e6ebf4" : "transparent",
                  color: tab===key ? "var(--blue)" : "var(--ink-3)",
                }}>
                  {lbl}
                  <span style={{ fontSize:11, fontWeight:700, background: tab===key?"#1b3664":"var(--bg)",
                    color: tab===key?"#fff":"var(--muted)", padding:"0 6px", borderRadius:6 }}>
                    {cnt}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead>
              <tr style={{ borderBottom:"1px solid var(--line-2)" }}>
                {["DOCUMENTO","TIPO","ETAPA ATUAL","APROVADOR","DATA","AGUARDA HÁ","PRIORIDADE"].map((h,i) => (
                  <th key={h} style={{
                    padding:"6px 14px 8px",
                    textAlign: i <= 3 ? "left" : "right",
                    fontSize:10, fontWeight:600, color:"var(--muted)",
                    textTransform:"uppercase", letterSpacing:".06em",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filaFiltrada.length === 0 && (
                <tr><td colSpan={7} style={{ padding:"24px", textAlign:"center", color:"var(--ink-3)", fontSize:13 }}>
                  Nenhum documento encontrado
                </td></tr>
              )}
              {filaFiltrada.map((item, i) => (
                <tr key={`${item.tipo}-${item.docDate}-${item.aprovCode}-${i}`}
                  style={{ borderBottom:"1px solid var(--line-3)", background: i%2===1?"rgba(236,239,245,.3)":"transparent" }}>
                  <td style={{ padding:"9px 14px" }}>
                    <span style={{ fontSize:12, fontWeight:600, color:"var(--blue-2)", fontVariantNumeric:"tabular-nums" }}>
                      #{String(i + 1).padStart(4, "0")} · {item.tipoLabel}
                    </span>
                  </td>
                  <td style={{ padding:"9px 14px" }}><TipoBadge label={item.tipoLabel} /></td>
                  <td style={{ padding:"9px 14px" }}>
                    <span style={{ fontSize:12, color:"var(--ink)" }}>{item.etapa || "—"}</span>
                  </td>
                  <td style={{ padding:"9px 14px" }}>
                    <span style={{ fontSize:11.5, color:"var(--blue-2)" }}>Cód. {item.aprovCode}</span>
                  </td>
                  <td style={{ padding:"9px 14px", textAlign:"right", color:"var(--ink-3)", fontSize:11.5, fontVariantNumeric:"tabular-nums" }}>
                    {new Date(item.docDate).toLocaleDateString("pt-BR")}
                  </td>
                  <td style={{ padding:"9px 14px", textAlign:"right" }}><DiasBadge d={item.dias} /></td>
                  <td style={{ padding:"9px 14px", textAlign:"right" }}><PrioBadge p={item.prioridade} /></td>
                </tr>
              ))}
            </tbody>
          </table>

          {filaFiltrada.length > 0 && (
            <div style={{ padding:"10px 18px", fontSize:11, color:"var(--muted)", textAlign:"right" }}>
              Exibindo {filaFiltrada.length} de {fila.length} documentos
            </div>
          )}
        </div>

      </div>
    </>
  );
}
