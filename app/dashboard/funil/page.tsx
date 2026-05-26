"use client";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";

const DonutChart = dynamic(() => import("@/components/charts/DonutChart"), { ssr: false });

/* ── formatters ─────────────────────────────────────── */
const brlC = (v: number) => {
  if (v >= 1e9) return `R$ ${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `R$ ${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `R$ ${(v / 1e3).toFixed(0)}K`;
  return `R$ ${v.toFixed(0)}`;
};
const pp  = (v: number)  => `${v.toFixed(1)}%`;
const num = (v: number)  => new Intl.NumberFormat("pt-BR").format(v);

/* ── tipos ───────────────────────────────────────────── */
interface Kpis {
  convCotPed: number; deltaCotPed: number | null;
  convPedNf:  number; deltaPedNf:  number | null;
  convTotalCotNf: number; deltaTotal: number | null;
  cotQtd: number; cotVal: number;
  pedQtd: number; pedVal: number;
  nfQtd:  number; nfVal:  number;
  cicloMedio: number | null;
}
interface StatusCotacoes {
  abertas:  { count: number; value: number };
  ganhas:   { count: number; value: number };
  perdidas: { count: number; value: number };
  totalMes: number;
}
interface Vendedor {
  code: string; name: string; initials: string;
  cotacoes: number; pedidos: number; nfs: number;
  valorNf: number; taxaCotPed: number;
}
interface FunilData { kpis: Kpis; statusCotacoes: StatusCotacoes; vendedores: Vendedor[] }

/* ── sub-componentes ─────────────────────────────────── */
function DeltaPp({ v }: { v: number | null }) {
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
      {pos ? "↑" : "↓"} {Math.abs(v).toFixed(1)}% pp MoM
    </span>
  );
}

/** SVG inline mini-funnel for the vendor table */
function MiniFunnel({ cot, ped, nf }: { cot: number; ped: number; nf: number }) {
  const W = 120, H = 18, max = Math.max(cot, 1);
  const segs = [
    { w: (cot / max) * W, c: "#1b3664" },
    { w: (ped / max) * W, c: "#294a82" },
    { w: (nf  / max) * W, c: "#3a6db5" },
  ];
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {segs.map((s, i) => (
        <rect key={i} x={0} y={i * 6} width={s.w} height={5} rx={2} fill={s.c} opacity={0.85 - i * 0.1} />
      ))}
    </svg>
  );
}

/* ── Funil SVG ───────────────────────────────────────── */
function FunilBig({ cotVal, cotQtd, pedVal, pedQtd, nfVal, nfQtd, convCotPed, convPedNf }: {
  cotVal: number; cotQtd: number;
  pedVal: number; pedQtd: number;
  nfVal:  number; nfQtd:  number;
  convCotPed: number; convPedNf: number;
}) {
  const W = 700, H = 300;
  const padL = 20, padR = 70, padT = 16, padB = 20;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const cx = padL + innerW / 2;
  const stages = [
    { label: "Cotações",  qtd: cotQtd, val: cotVal },
    { label: "Pedidos",   qtd: pedQtd, val: pedVal },
    { label: "NFs",       qtd: nfQtd,  val: nfVal  },
  ];
  const maxVal = Math.max(...stages.map(s => s.val), 1);
  const n = stages.length;
  const stageH = innerH / n;
  const COL = "#1b3664";
  const convs = [null, convCotPed, convPedNf];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: H, display: "block", fontFamily: "'Manrope',sans-serif" }}>
      {stages.map((s, i) => {
        const top = padT + i * stageH;
        const topR = s.val / maxVal;
        const botR = (stages[i + 1]?.val ?? s.val * 0.88) / maxVal;
        const topW = innerW * topR;
        const botW = innerW * botR;
        const pts = `${cx - topW/2},${top} ${cx + topW/2},${top} ${cx + botW/2},${top + stageH - 4} ${cx - botW/2},${top + stageH - 4}`;
        const opacity = 0.92 - i * 0.12;
        return (
          <g key={i}>
            <polygon points={pts} fill={COL} opacity={opacity} />
            <text x={cx} y={top + stageH/2 - 6} fontSize={14} fill="#fff" textAnchor="middle" fontWeight="700">{s.label}</text>
            <text x={cx} y={top + stageH/2 + 12} fontSize={11.5} fill="rgba(255,255,255,.85)" textAnchor="middle">
              {num(s.qtd)} docs · {brlC(s.val)}
            </text>
            {convs[i] !== null && (
              <text x={W - padR + 8} y={top + 10} fontSize={11} fill="var(--ink-3)" textAnchor="start">
                {convs[i]!.toFixed(1)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ── página ──────────────────────────────────────────── */
export default function FunilPage() {
  const [data, setData] = useState<FunilData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [now] = useState(new Date());

  useEffect(() => {
    fetch("/api/dashboard/funil")
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setData(d); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

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

  const { kpis: k, statusCotacoes: sc, vendedores } = data;
  const dateStr = now.toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric" });

  /* Donut slices */
  const donutSlices = [
    { label: "Abertas",  count: sc.abertas.count,  value: sc.abertas.value,  color: "#1b3664" },
    { label: "Ganhas",   count: sc.ganhas.count,   value: sc.ganhas.value,   color: "#2dab64" },
    { label: "Perdidas", count: sc.perdidas.count, value: sc.perdidas.value, color: "#d94c5b" },
  ].filter(s => s.count > 0);

  /* Max NF value for mini-funnel scale */
  const maxNfVal = Math.max(...vendedores.map(v => v.valorNf), 1);

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
          <span>Painel</span>
          <span style={{ color:"var(--muted)" }}>/</span>
          <span style={{ color:"var(--ink)", fontWeight:500 }}>Funil Comercial</span>
        </div>
        <div style={{ marginLeft:"auto", fontSize:11, color:"var(--muted)", fontVariantNumeric:"tabular-nums" }}>
          Atualizado agora · {dateStr}
        </div>
      </div>

      {/* Conteúdo */}
      <div style={{ padding: "26px 30px 80px" }}>

        {/* Cabeçalho */}
        <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", marginBottom:24 }}>
          <div>
            <h1 style={{ fontSize:24, fontWeight:600, letterSpacing:"-0.02em", margin:0, color:"var(--ink)" }}>Funil Comercial</h1>
            <p style={{ color:"var(--ink-3)", fontSize:13, margin:"5px 0 0" }}>
              Cotações → Pedidos → NFs · Abril · 2026 &nbsp;·&nbsp;
              <span style={{ color:"var(--blue-2)" }}>{num(k.cotQtd)} cotações analisadas</span>
            </p>
          </div>
        </div>

        {/* KPI Row — 3 cards */}
        <div style={{ display:"grid", gridTemplateColumns:"1.5fr 1fr 1fr", gap:16, marginBottom:24 }}>

          {/* Hero: COT → PED */}
          <div style={{
            background: "linear-gradient(135deg,#2c4f8e 0%,#1b3664 60%,#122548 100%)",
            borderRadius:14, boxShadow:"var(--shadow-md)", padding:"20px 22px 16px",
            position:"relative", overflow:"hidden", minHeight:140,
            display:"flex", flexDirection:"column", gap:10,
          }}>
            <div style={{ position:"absolute", inset:"auto -30px -30px auto", width:160, height:160, borderRadius:"50%",
              background:"radial-gradient(circle at 30% 30%,rgba(255,255,255,.18),transparent 60%)", pointerEvents:"none" }} />
            <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:".08em", fontWeight:500, color:"rgba(255,255,255,.7)" }}>
              Conversão COT → PED
            </div>
            <div style={{ fontSize:34, fontWeight:500, color:"#fff", letterSpacing:"-0.02em", fontVariantNumeric:"tabular-nums", lineHeight:1 }}>
              {pp(k.convCotPed)}
            </div>
            <DeltaPp v={k.deltaCotPed} />
            <div style={{ fontSize:11, color:"rgba(255,255,255,.6)", marginTop:"auto" }}>
              {num(k.cotQtd)} cotações · {num(k.pedQtd)} pedidos
            </div>
          </div>

          {/* COT → NF */}
          <div style={{ background:"var(--panel)", borderRadius:14, boxShadow:"var(--shadow-md)", padding:"20px 22px 16px",
            display:"flex", flexDirection:"column", gap:10, minHeight:140 }}>
            <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:".08em", fontWeight:500, color:"var(--ink-3)" }}>
              Conversão PED → NF
            </div>
            <div style={{ fontSize:34, fontWeight:500, color:"var(--ink)", letterSpacing:"-0.02em", fontVariantNumeric:"tabular-nums", lineHeight:1 }}>
              {pp(k.convPedNf)}
            </div>
            <DeltaPp v={k.deltaPedNf} />
            <div style={{ fontSize:11, color:"var(--ink-3)", marginTop:"auto" }}>
              {num(k.pedQtd)} pedidos · {num(k.nfQtd)} NFs
            </div>
          </div>

          {/* PED → NF */}
          <div style={{ background:"var(--panel)", borderRadius:14, boxShadow:"var(--shadow-md)", padding:"20px 22px 16px",
            display:"flex", flexDirection:"column", gap:10, minHeight:140 }}>
            <div style={{ fontSize:11, textTransform:"uppercase", letterSpacing:".08em", fontWeight:500, color:"var(--ink-3)" }}>
              Conversão Total COT → NF
            </div>
            <div style={{ fontSize:34, fontWeight:500, color:"var(--ink)", letterSpacing:"-0.02em", fontVariantNumeric:"tabular-nums", lineHeight:1 }}>
              {pp(k.convTotalCotNf)}
            </div>
            <DeltaPp v={k.deltaTotal} />
            <div style={{ fontSize:11, color:"var(--ink-3)", marginTop:"auto" }}>
              Valor convertido {brlC(k.nfVal)}
            </div>
          </div>
        </div>

        {/* Main row: Funil + Donut */}
        <div style={{ display:"grid", gridTemplateColumns:"3fr 2fr", gap:16, marginBottom:24 }}>

          {/* Funil */}
          <div style={{ background:"var(--panel)", borderRadius:14, boxShadow:"var(--shadow-md)", padding:"18px 20px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:"var(--ink)" }}>Funil · volume × valor</div>
                <div style={{ fontSize:11, color:"var(--blue-2)", marginTop:2 }}>Cotações → Pedidos → NFs emitidas</div>
              </div>
            </div>

            <FunilBig
              cotVal={k.cotVal} cotQtd={k.cotQtd}
              pedVal={k.pedVal} pedQtd={k.pedQtd}
              nfVal={k.nfVal}   nfQtd={k.nfQtd}
              convCotPed={k.convCotPed} convPedNf={k.convPedNf}
            />

            {/* Stats bar */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:1, marginTop:12,
              borderTop:"1px solid var(--line-2)", paddingTop:12 }}>
              {[
                { lbl:"COT → PED", val:pp(k.convCotPed) },
                { lbl:"PED → NF",  val:pp(k.convPedNf)  },
                { lbl:"CICLO MÉDIO", val: k.cicloMedio != null ? `${k.cicloMedio.toFixed(1)} dias` : "—" },
              ].map(s => (
                <div key={s.lbl} style={{ textAlign:"center" }}>
                  <div style={{ fontSize:10, color:"var(--muted)", textTransform:"uppercase", letterSpacing:".06em", fontWeight:500 }}>{s.lbl}</div>
                  <div style={{ fontSize:16, fontWeight:600, color:"var(--ink)", fontVariantNumeric:"tabular-nums", marginTop:3 }}>{s.val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Donut: cotações por status */}
          <div style={{
            background:"var(--panel)", borderRadius:14, boxShadow:"var(--shadow-md)",
            padding:"18px 20px", display:"flex", flexDirection:"column",
          }}>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:600, color:"var(--ink)" }}>Cotações por status</div>
              <div style={{ fontSize:11, color:"var(--blue-2)", marginTop:2 }}>Distribuição · Abril/26</div>
            </div>
            <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <DonutChart
                slices={donutSlices}
                size={260}
                centerLabel={num(sc.totalMes)}
                centerSub="TOTAL NO MÊS"
              />
            </div>
          </div>
        </div>

        {/* Tabela: Conversão por vendedor */}
        {vendedores.length > 0 && (
          <div style={{ background:"var(--panel)", borderRadius:14, boxShadow:"var(--shadow-md)", padding:"18px 0 4px" }}>
            {/* Header */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 20px 14px" }}>
              <div style={{ fontSize:13, fontWeight:600, color:"var(--ink)" }}>Conversão por vendedor</div>
              <div style={{ fontSize:11, color:"var(--ink-3)" }}>
                {vendedores.length} vendedores · ordenado por valor faturado
              </div>
            </div>

            {/* Table */}
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead>
                <tr style={{ borderBottom:"1px solid var(--line-2)" }}>
                  {["VENDEDOR","COTAÇÕES","PEDIDOS","NFS","VALOR NFS","FUNIL (COT→PED→NF)","TAXA COT→PED"].map(h => (
                    <th key={h} style={{
                      padding:"6px 16px 8px", textAlign: h === "VENDEDOR" ? "left" : "right",
                      fontSize:10.5, fontWeight:600, color:"var(--muted)",
                      textTransform:"uppercase", letterSpacing:".06em",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vendedores.map((v, i) => {
                  const barMax = Math.max(...vendedores.map(x => x.cotacoes), 1);
                  const cW = (v.cotacoes / barMax) * 120;
                  const pW = v.cotacoes > 0 ? (v.pedidos / v.cotacoes) * cW : 0;
                  const nW = v.cotacoes > 0 ? (v.nfs     / v.cotacoes) * cW : 0;
                  const taxaColor = v.taxaCotPed >= 60 ? "var(--ok)" : v.taxaCotPed >= 40 ? "var(--orange)" : "var(--danger)";
                  const taxaBg   = v.taxaCotPed >= 60 ? "var(--ok-soft)" : v.taxaCotPed >= 40 ? "#fff3eb" : "var(--danger-soft)";

                  return (
                    <tr key={v.code} style={{ borderBottom:"1px solid var(--line-3)", background: i % 2 === 1 ? "rgba(236,239,245,.35)" : "transparent" }}>
                      {/* Vendedor */}
                      <td style={{ padding:"10px 16px", minWidth:180 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                          <div style={{
                            width:30, height:30, borderRadius:"50%", flexShrink:0,
                            background:`hsl(${(Number(v.code) * 47) % 360},40%,36%)`,
                            color:"#fff", display:"grid", placeItems:"center",
                            fontSize:9, fontWeight:700, letterSpacing:".02em",
                          }}>{v.initials}</div>
                          <div>
                            <div style={{ fontWeight:600, color:"var(--ink)", fontSize:12 }}>Vendedor</div>
                            <div style={{ fontSize:11, color:"var(--blue-2)", fontVariantNumeric:"tabular-nums" }}>Cód. {v.code}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding:"10px 16px", textAlign:"right", color:"var(--blue-2)", fontWeight:500, fontVariantNumeric:"tabular-nums" }}>{num(v.cotacoes)}</td>
                      <td style={{ padding:"10px 16px", textAlign:"right", color:"var(--blue-2)", fontWeight:500, fontVariantNumeric:"tabular-nums" }}>{num(v.pedidos)}</td>
                      <td style={{ padding:"10px 16px", textAlign:"right", fontVariantNumeric:"tabular-nums", color:"var(--ink-2)" }}>{num(v.nfs)}</td>
                      <td style={{ padding:"10px 16px", textAlign:"right", fontWeight:600, color:"var(--ink)", fontVariantNumeric:"tabular-nums" }}>{brlC(v.valorNf)}</td>
                      {/* Mini funnel */}
                      <td style={{ padding:"10px 16px", textAlign:"right" }}>
                        <svg width={120} height={18} viewBox="0 0 120 18">
                          <rect x={0} y={0}  width={cW} height={5} rx={2} fill="#1b3664" opacity={0.85} />
                          <rect x={0} y={6}  width={pW} height={5} rx={2} fill="#294a82" opacity={0.75} />
                          <rect x={0} y={12} width={nW} height={5} rx={2} fill="#3a6db5" opacity={0.65} />
                        </svg>
                      </td>
                      {/* Taxa */}
                      <td style={{ padding:"10px 16px", textAlign:"right" }}>
                        <span style={{ fontSize:11, fontWeight:600, color:taxaColor, background:taxaBg,
                          padding:"3px 9px", borderRadius:8, fontVariantNumeric:"tabular-nums" }}>
                          {pp(v.taxaCotPed)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </>
  );
}
