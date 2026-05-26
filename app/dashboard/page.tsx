"use client";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";

const Sparkline      = dynamic(() => import("@/components/ui/Sparkline"),           { ssr: false });
const DailyBarChart  = dynamic(() => import("@/components/charts/DailyBarChart"),   { ssr: false });
const FunnelChart    = dynamic(() => import("@/components/charts/FunnelChart"),     { ssr: false });
const StackedBar     = dynamic(() => import("@/components/ui/StackedBar"),          { ssr: false });
const HBarList       = dynamic(() => import("@/components/ui/HBarList"),            { ssr: false });

/* ── formatters ─────────────────────────────────────── */
const brlCompact = (v: number) => {
  if (v >= 1e9)  return `R$ ${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6)  return `R$ ${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3)  return `R$ ${(v / 1e3).toFixed(0)}K`;
  return `R$ ${v.toFixed(0)}`;
};
const pct = (v: number, dec = 1) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v) + "%";
const num = (v: number) => new Intl.NumberFormat("pt-BR").format(v);

/* ── tipos ───────────────────────────────────────────── */
interface Kpis {
  totalMes: number; deltaMes: number | null;
  totalAno: number; qtdNfsAno: number;
  ticketMedio: number;
  pedidosAbertos: number; valorAbertoPedidos: number;
  cotacoesAbertas: number; cotacoesGanhas: number; cotacoesPerdidas: number;
  aprovacoesPendentes: number;
  convCotPed: number; convPedNf: number;
  qtdNfsMes: number;
}
interface ChartPoint  { label: string; total: number; qtd: number }
interface DayPoint    { dia: number; total: number; qtd: number }
interface Categoria   { nome: string; total: number }
interface FunilData   { cotacoes: { count: number; value: number }; pedidos: { count: number; value: number }; nfs: { count: number; value: number } }
interface Sparklines  { faturamento: number[]; acumulado: number[]; ticketMedio: number[]; convCotPed: number[]; convPedNf: number[]; metaDiaria: number }
interface DashData    { kpis: Kpis; sparklines: Sparklines; chartMensal: ChartPoint[]; chartDiario: DayPoint[]; categorias: Categoria[]; funil: FunilData }

/* ── tipos bottom ────────────────────────────────────── */
interface TopCliente  { cnpj: string; nfs: number; total: number }
interface TopProduto  { code: string; descr: string; total: number }
interface StatusItem  { label: string; count: number; color: "ok" | "info" | "warn" | "dang" }
interface Alertas     { aging60: number; valorAging60: number; aprovPendentes: number }
interface BottomData  {
  topClientes:    TopCliente[];
  topProdutos:    TopProduto[];
  statusPedidos:  StatusItem[];
  statusCotacoes: StatusItem[];
  alertas:        Alertas;
}

/* ── sub-componentes ─────────────────────────────────── */
function Delta({ v, suffix = "MoM" }: { v: number | null; suffix?: string }) {
  if (v === null) return null;
  const pos = v >= 0;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      fontSize: 11.5, padding: "2px 8px", borderRadius: 8, width: "fit-content",
      background: pos ? "var(--ok-soft)" : "var(--danger-soft)",
      color: pos ? "var(--ok)" : "var(--danger)",
      fontVariantNumeric: "tabular-nums",
    }}>
      {pos ? "↑" : "↓"} {Math.abs(v).toFixed(1)}%
      <span style={{ color: "var(--muted)", marginLeft: 2 }}>{suffix}</span>
    </span>
  );
}

function KpiHero({ label, value, delta, suffix, sub, spark, color = "#1b3664" }:
  { label: string; value: string; delta?: number | null; suffix?: string; sub?: string; spark?: number[]; color?: string }) {
  const isDark = color.startsWith("#1b") || color.startsWith("#12") || color.startsWith("#2c");
  return (
    <div style={{
      background: isDark ? `linear-gradient(135deg, #2c4f8e 0%, #1b3664 60%, #122548 100%)` : "var(--panel)",
      borderRadius: 14, boxShadow: "var(--shadow-md)",
      padding: "18px 20px 14px",
      display: "flex", flexDirection: "column", gap: 8,
      minHeight: 140, position: "relative", overflow: "hidden",
    }}>
      {isDark && (
        <div style={{
          position: "absolute", inset: "auto -40px -40px auto",
          width: 160, height: 160, borderRadius: "50%",
          background: "radial-gradient(circle at 30% 30%, rgba(255,255,255,.18), transparent 60%)",
          pointerEvents: "none",
        }} />
      )}
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, color: isDark ? "rgba(255,255,255,.75)" : "var(--ink-3)" }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 500, letterSpacing: "-0.015em", color: isDark ? "#fff" : "var(--ink)", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
        {value}
      </div>
      {(delta !== undefined) && <Delta v={delta ?? null} suffix={suffix} />}
      {sub && <div style={{ fontSize: 11, color: isDark ? "rgba(255,255,255,.6)" : "var(--ink-3)", marginTop: "auto" }}>{sub}</div>}
      {spark && spark.length > 1 && (
        <div style={{ marginTop: "auto" }}>
          <Sparkline data={spark} color={isDark ? "rgba(255,255,255,.7)" : color} height={36} strokeW={1.4} />
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, delta, suffix, sub, spark, color = "#1b3664", children }:
  { label: string; value: string; delta?: number | null; suffix?: string; sub?: string; spark?: number[]; color?: string; children?: React.ReactNode }) {
  return (
    <div style={{
      background: "var(--panel)", borderRadius: 14, boxShadow: "var(--shadow-md)",
      padding: "18px 20px 14px",
      display: "flex", flexDirection: "column", gap: 8,
      minHeight: 140,
    }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, color: "var(--ink-3)" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 500, letterSpacing: "-0.015em", color: "var(--ink)", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{value}</div>
      {(delta !== undefined) && <Delta v={delta ?? null} suffix={suffix} />}
      {sub && <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: "auto" }}>{sub}</div>}
      {children}
      {spark && spark.length > 1 && (
        <div style={{ marginTop: "auto" }}>
          <Sparkline data={spark} color={color} height={32} strokeW={1.4} />
        </div>
      )}
    </div>
  );
}

const WALLET_COLORS: Record<string, { bg: string; label: string; abbr: string }> = {
  "Cobre / Metais":   { bg: "linear-gradient(135deg,#3a5fa3 0%,#1b3664 100%)",  label: "Cobre / Metais",   abbr: "CN" },
  "Fotovoltaica":     { bg: "linear-gradient(135deg,#4fd1f0 0%,#2aafd8 100%)",  label: "Fotovoltaica",     abbr: "FV" },
  "Cabos Flexíveis":  { bg: "linear-gradient(135deg,#ff9460 0%,#ff6c3c 100%)",  label: "Cabos Flexíveis",  abbr: "CF" },
  "Alumínio":         { bg: "linear-gradient(135deg,#6cd49a 0%,#2dab64 100%)",  label: "Alumínio",         abbr: "AL" },
  "Outros":           { bg: "linear-gradient(135deg,#a299f0 0%,#6f60dc 100%)",  label: "Outros",           abbr: "OT" },
};

/* ── página principal ────────────────────────────────── */
export default function VisaoGeralPage() {
  const [data, setData] = useState<DashData | null>(null);
  const [bottom, setBottom] = useState<BottomData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(new Date());

  useEffect(() => {
    Promise.all([
      fetch("/api/dashboard").then(r => r.json()),
      fetch("/api/dashboard/bottom").then(r => r.json()),
    ]).then(([d, b]) => {
      if (d.error) throw new Error(d.error);
      if (b.error) throw new Error(b.error);
      setData(d);
      setBottom(b);
    }).catch(e => setError(e.message)).finally(() => setLoading(false));
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

  const { kpis: k, sparklines: sp, chartDiario, categorias, funil } = data;
  const bot = bottom;

  const walletItems = categorias
    .filter(c => c.nome !== "Outros")
    .slice(0, 4)
    .map(c => ({ ...c, ...(WALLET_COLORS[c.nome] ?? WALLET_COLORS["Outros"]) }));
  const totalCat = walletItems.reduce((a, c) => a + c.total, 0);

  const funilStages = [
    { label: "Cotações", count: funil.cotacoes.count, value: funil.cotacoes.value },
    { label: "Pedidos",  count: funil.pedidos.count,  value: funil.pedidos.value  },
    { label: "NFs",      count: funil.nfs.count,      value: funil.nfs.value      },
  ];

  const dateStr = now.toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric" });

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
          <span style={{ color:"var(--ink)", fontWeight:500 }}>Visão Geral</span>
        </div>
        <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center" }}>
          {[
            { lbl: "Período", v: "Abril · 2026" },
            { lbl: "Vendedor", v: "Todos" },
            { lbl: "Cliente", v: "Todos" },
          ].map(chip => (
            <div key={chip.lbl} style={{
              display:"inline-flex", alignItems:"center", gap:7, height:34, padding:"0 12px",
              border:"1px solid var(--line-2)", borderRadius:10, background:"var(--panel)",
              fontSize:12, color:"var(--ink-2)", boxShadow:"var(--shadow-sm)", cursor:"pointer",
            }}>
              <span style={{ color:"var(--muted)" }}>{chip.lbl}:</span>
              <span style={{ color:"var(--ink)", fontWeight:500 }}>{chip.v}</span>
              <span style={{ fontSize:10 }}>▾</span>
            </div>
          ))}
        </div>
      </div>

      {/* Conteúdo */}
      <div style={{ padding: "26px 30px 80px" }}>

        {/* Cabeçalho da página */}
        <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", marginBottom:24 }}>
          <div>
            <h1 style={{ fontSize:24, fontWeight:600, letterSpacing:"-0.02em", margin:0, color:"var(--ink)" }}>Visão Geral</h1>
            <p style={{ color:"var(--ink-3)", fontSize:13, margin:"5px 0 0" }}>Indicadores executivos · Abril · 2026</p>
          </div>
          <div style={{ fontSize:11, color:"var(--muted)", textAlign:"right", fontVariantNumeric:"tabular-nums" }}>
            Atualizado agora · {dateStr}
          </div>
        </div>

        {/* KPI Row 1 */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:16 }}>
          <KpiHero
            label="Faturado no Mês"
            value={brlCompact(k.totalMes)}
            delta={k.deltaMes}
            suffix="MoM"
            spark={sp.faturamento}
            color="#1b3664"
          />
          <KpiCard
            label="Acumulado no Ano"
            value={brlCompact(k.totalAno)}
            spark={sp.acumulado}
            color="#1b3664"
            sub={`${num(k.qtdNfsAno)} NFs emitidas`}
          />
          <KpiCard label="Ticket Médio NFs" value={brlCompact(k.ticketMedio)} color="#ff8a55" spark={sp.ticketMedio} />
          <KpiCard label="Pedidos Ativos" value={num(k.pedidosAbertos)} sub={`Valor em aberto ${brlCompact(k.valorAbertoPedidos)}`} color="#3ec6ed" />
        </div>

        {/* KPI Row 2 */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:28 }}>
          <KpiCard label="Cotações Abertas" value={num(k.cotacoesAbertas)}>
            <div style={{ display:"flex", gap:14, fontSize:11.5, color:"var(--ink-3)", marginTop:"auto" }}>
              <span><span style={{ width:7, height:7, borderRadius:"50%", background:"var(--ok)", display:"inline-block", marginRight:5 }} />{num(k.cotacoesGanhas)} ganhas</span>
              <span><span style={{ width:7, height:7, borderRadius:"50%", background:"var(--danger)", display:"inline-block", marginRight:5 }} />{num(k.cotacoesPerdidas)} perdidas</span>
            </div>
          </KpiCard>
          <KpiCard label="Conversão Cot → Ped" value={pct(k.convCotPed)} color="#56c282"
            spark={sp.convCotPed} />
          <KpiCard label="Conversão Ped → NF" value={pct(k.convPedNf)} color="#56c282"
            spark={sp.convPedNf} />
          <KpiCard label="Aprovações Pendentes" value={num(k.aprovacoesPendentes)} />
        </div>

        {/* Wallet Cards — categorias de produto */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
          <span style={{ fontSize:14, fontWeight:600, color:"var(--ink)", letterSpacing:"-0.01em" }}>Linhas de produto · faturamento do mês</span>
          <span style={{ fontSize:12, color:"var(--blue-2)", cursor:"pointer" }}>Ver todas →</span>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:28 }}>
          {walletItems.map(cat => {
            const share = totalCat > 0 ? (cat.total / totalCat) * 100 : 0;
            return (
              <div key={cat.nome} style={{
                background: cat.bg, borderRadius:14, padding:"18px 18px 16px",
                color:"#fff", position:"relative", overflow:"hidden",
                boxShadow:"var(--shadow-md)", minHeight:130,
                display:"flex", flexDirection:"column", justifyContent:"space-between",
              }}>
                <div style={{
                  position:"absolute", inset:"-40% -10% auto auto",
                  width:"130%", height:"130%",
                  background:"radial-gradient(circle at 70% 30%, rgba(255,255,255,.18) 0%, transparent 50%)",
                  pointerEvents:"none",
                }} />
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div style={{
                    width:32, height:32, background:"rgba(255,255,255,.22)", borderRadius:9,
                    display:"grid", placeItems:"center", fontSize:11, fontWeight:700,
                  }}>{cat.abbr}</div>
                  <span style={{ fontSize:12, fontWeight:600, opacity:.9 }}>{share.toFixed(1)}%</span>
                </div>
                <div>
                  <div style={{ fontSize:14, fontWeight:600 }}>{cat.label}</div>
                  <div style={{ fontSize:18, fontWeight:500, marginTop:4, fontVariantNumeric:"tabular-nums" }}>{brlCompact(cat.total)}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Gráficos */}
        <div style={{ display:"grid", gridTemplateColumns:"3fr 2fr", gap:16 }}>
          {/* Faturamento diário */}
          <div style={{ background:"var(--panel)", borderRadius:14, boxShadow:"var(--shadow-md)", padding:"18px 20px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:"var(--ink)" }}>Faturamento diário · Abril/26</div>
                <div style={{ fontSize:11, color:"var(--blue-2)", marginTop:2 }}>NFs emitidas por dia, R$</div>
              </div>
              <div style={{ fontSize:11, color:"var(--ink-3)" }}>
                Média diária {brlCompact(sp.metaDiaria)}
              </div>
            </div>
            <DailyBarChart data={chartDiario} height={200} />
          </div>

          {/* Funil */}
          <div style={{ background:"var(--panel)", borderRadius:14, boxShadow:"var(--shadow-md)", padding:"18px 20px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:"var(--ink)" }}>Funil do mês</div>
                <div style={{ fontSize:11, color:"var(--blue-2)", marginTop:2 }}>Conversão em volume</div>
              </div>
              <span style={{ fontSize:12, color:"var(--blue-2)", cursor:"pointer" }}>Ver detalhes →</span>
            </div>
            <FunnelChart stages={funilStages} height={200} />
          </div>
        </div>

        {/* ── Bottom sections ────────────────────────────────── */}
        {bot && (
          <>
            {/* Separador */}
            <div style={{ margin:"32px 0 20px", display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ flex:1, height:1, background:"var(--line-2,#e4e8f0)" }} />
              <span style={{ fontSize:11, color:"var(--muted)", fontWeight:500, letterSpacing:".06em", textTransform:"uppercase" }}>Análises complementares</span>
              <div style={{ flex:1, height:1, background:"var(--line-2,#e4e8f0)" }} />
            </div>

            {/* Row: Top Clientes + Top Produtos */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>

              {/* Top Clientes por CNPJ */}
              <div style={{ background:"var(--panel)", borderRadius:14, boxShadow:"var(--shadow-md)", padding:"18px 20px" }}>
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:"var(--ink)" }}>Top clientes · CNPJ</div>
                  <div style={{ fontSize:11, color:"var(--ink-3)", marginTop:2 }}>Faturamento do mês por CNPJ</div>
                </div>
                <HBarList
                  color="#1b3664"
                  items={bot.topClientes.map(c => ({
                    label: c.cnpj,
                    value: c.total,
                    count: c.nfs,
                  }))}
                />
              </div>

              {/* Top Produtos */}
              <div style={{ background:"var(--panel)", borderRadius:14, boxShadow:"var(--shadow-md)", padding:"18px 20px" }}>
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:"var(--ink)" }}>Top produtos</div>
                  <div style={{ fontSize:11, color:"var(--ink-3)", marginTop:2 }}>Faturamento do mês por item</div>
                </div>
                <HBarList
                  color="#2aafd8"
                  items={bot.topProdutos.map(p => ({
                    label: p.code,
                    sublabel: p.descr.length > 42 ? p.descr.slice(0, 42) + "…" : p.descr,
                    value: p.total,
                  }))}
                />
              </div>
            </div>

            {/* Row: Status Pedidos + Status Cotações + Alertas */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:16 }}>

              {/* Status dos Pedidos */}
              <div style={{ background:"var(--panel)", borderRadius:14, boxShadow:"var(--shadow-md)", padding:"18px 20px" }}>
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:"var(--ink)" }}>Status dos pedidos</div>
                  <div style={{ fontSize:11, color:"var(--ink-3)", marginTop:2 }}>Carteira total acumulada</div>
                </div>
                <StackedBar segments={bot.statusPedidos} />
              </div>

              {/* Status das Cotações */}
              <div style={{ background:"var(--panel)", borderRadius:14, boxShadow:"var(--shadow-md)", padding:"18px 20px" }}>
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:"var(--ink)" }}>Status das cotações</div>
                  <div style={{ fontSize:11, color:"var(--ink-3)", marginTop:2 }}>Carteira total acumulada</div>
                </div>
                <StackedBar segments={bot.statusCotacoes} />
              </div>

              {/* Alertas Operacionais */}
              <div style={{ background:"var(--panel)", borderRadius:14, boxShadow:"var(--shadow-md)", padding:"18px 20px" }}>
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:"var(--ink)" }}>Alertas operacionais</div>
                  <div style={{ fontSize:11, color:"var(--ink-3)", marginTop:2 }}>Atenção imediata requerida</div>
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

                  {/* Pedidos aging > 60 dias */}
                  <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", borderRadius:10, background:"rgba(255,142,57,.08)", border:"1px solid rgba(255,142,57,.2)" }}>
                    <div style={{ width:36, height:36, borderRadius:9, background:"rgba(255,142,57,.15)", display:"grid", placeItems:"center", flexShrink:0 }}>
                      <span style={{ fontSize:17 }}>⏱</span>
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12, fontWeight:600, color:"var(--ink)" }}>
                        {bot.alertas.aging60.toLocaleString("pt-BR")} pedidos &gt; 60 dias
                      </div>
                      <div style={{ fontSize:11, color:"var(--ink-3)", marginTop:2 }}>
                        Valor em aberto: {brlCompact(bot.alertas.valorAging60)}
                      </div>
                    </div>
                    <span style={{ fontSize:11, fontWeight:600, color:"#e87c1e", padding:"3px 8px", borderRadius:6, background:"rgba(255,142,57,.12)" }}>
                      Aging
                    </span>
                  </div>

                  {/* Aprovações pendentes */}
                  <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", borderRadius:10, background:"rgba(239,68,68,.07)", border:"1px solid rgba(239,68,68,.18)" }}>
                    <div style={{ width:36, height:36, borderRadius:9, background:"rgba(239,68,68,.12)", display:"grid", placeItems:"center", flexShrink:0 }}>
                      <span style={{ fontSize:17 }}>🔔</span>
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12, fontWeight:600, color:"var(--ink)" }}>
                        {bot.alertas.aprovPendentes.toLocaleString("pt-BR")} aprovações pendentes
                      </div>
                      <div style={{ fontSize:11, color:"var(--ink-3)", marginTop:2 }}>
                        Documentos aguardando aprovação
                      </div>
                    </div>
                    <span style={{ fontSize:11, fontWeight:600, color:"var(--danger)", padding:"3px 8px", borderRadius:6, background:"rgba(239,68,68,.1)" }}>
                      Urgente
                    </span>
                  </div>

                </div>
              </div>
            </div>
          </>
        )}

      </div>
    </>
  );
}
