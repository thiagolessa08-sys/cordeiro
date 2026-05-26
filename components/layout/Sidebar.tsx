"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navMain = [
  { ix: "01", label: "Visão Geral",     href: "/dashboard" },
  { ix: "02", label: "Funil Comercial", href: "/dashboard/funil" },
  { ix: "03", label: "Faturamento",     href: "/dashboard/faturamento", badge: "NFs" },
  { ix: "04", label: "Pedidos Abertos", href: "/dashboard/pedidos",     badge: null, countKey: "pedidosAbertos" },
  { ix: "05", label: "Aprovações",      href: "/dashboard/aprovacoes",  badge: null, countKey: "aprovacoesPendentes" },
  { ix: "06", label: "Devoluções",      href: "/dashboard/devolucoes" },
];

const navTools = [
  { label: "Chat IA", href: "/dashboard/chat", icon: "✦" },
];

const navCadastros = [
  { label: "Clientes",   href: "/clientes" },
  { label: "Produtos",   href: "/produtos" },
  { label: "Vendedores", href: "/vendedores" },
];

interface SidebarProps {
  counts?: { pedidosAbertos?: number; aprovacoesPendentes?: number };
}

export default function Sidebar({ counts }: SidebarProps) {
  const path = usePathname();

  return (
    <aside style={{
      width: 240, background: "var(--panel)",
      borderRight: "1px solid var(--line-2)",
      display: "flex", flexDirection: "column",
      position: "sticky", top: 0, height: "100vh",
    }}>
      {/* Brand */}
      <div style={{
        padding: "20px 18px 16px",
        borderBottom: "1px solid var(--line-3)",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
      }}>
        <img
          src="/Logo.png"
          alt="Grupo Melo Cordeiro"
          style={{ width: 160, height: "auto", display: "block" }}
        />
        <div style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600 }}>
          Painel Comercial
        </div>
      </div>

      {/* Nav principal */}
      <nav style={{ padding: "14px 10px 6px", flex: 1 }}>
        <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", padding: "6px 10px 8px", fontWeight: 600 }}>
          Análises
        </div>
        {navMain.map((item) => {
          const active = path === item.href || (item.href !== "/dashboard" && path.startsWith(item.href + "/"));
          const count = item.countKey ? counts?.[item.countKey as keyof typeof counts] : undefined;
          return (
            <Link key={item.href} href={item.href} style={{ textDecoration: "none" }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 12px", borderRadius: 10,
                marginBottom: 2, cursor: "pointer",
                color: active ? "var(--blue-deep)" : "var(--ink-2)",
                fontWeight: active ? 500 : 400,
                fontSize: 13,
                background: active
                  ? "linear-gradient(180deg,#eef2f9 0%,#e3e9f3 100%)"
                  : "transparent",
                boxShadow: active ? "inset 0 0 0 1px #d4dceb" : "none",
              }}>
                <span style={{
                  width: 18, fontSize: 11,
                  fontVariantNumeric: "tabular-nums",
                  color: active ? "var(--blue)" : "var(--muted)",
                }}>{item.ix}</span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {(item.badge || count !== undefined) && (
                  <span style={{
                    background: active ? "#fff" : "var(--bg)",
                    color: active ? "var(--blue-deep)" : "var(--ink-3)",
                    fontSize: 10.5, padding: "1px 7px", borderRadius: 10,
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    {item.badge ?? count}
                  </span>
                )}
              </div>
            </Link>
          );
        })}

        <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", padding: "16px 10px 8px", fontWeight: 600 }}>
          Ferramentas
        </div>
        {navTools.map((item) => {
          const active = path === item.href || path.startsWith(item.href + "/");
          return (
            <Link key={item.href} href={item.href} style={{ textDecoration: "none" }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 12px", borderRadius: 10, marginBottom: 2,
                cursor: "pointer", fontSize: 13,
                color: active ? "var(--blue-deep)" : "var(--ink-2)",
                fontWeight: active ? 500 : 400,
                background: active
                  ? "linear-gradient(180deg,#eef2f9 0%,#e3e9f3 100%)"
                  : "transparent",
                boxShadow: active ? "inset 0 0 0 1px #d4dceb" : "none",
              }}>
                <span style={{ fontSize: 14, color: active ? "var(--blue)" : "var(--muted)", width: 18, textAlign: "center" }}>
                  {item.icon}
                </span>
                <span style={{ flex: 1 }}>{item.label}</span>
              </div>
            </Link>
          );
        })}

        <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", padding: "16px 10px 8px", fontWeight: 600 }}>
          Cadastros
        </div>
        {navCadastros.map((item) => (
          <Link key={item.href} href={item.href} style={{ textDecoration: "none" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 12px", borderRadius: 10, marginBottom: 2,
              color: "var(--ink-3)", fontSize: 13,
            }}>
              {item.label}
            </div>
          </Link>
        ))}
      </nav>

      {/* Foot */}
      <div style={{
        padding: "12px 14px", borderTop: "1px solid var(--line-2)",
        display: "flex", alignItems: "center", gap: 10, fontSize: 12,
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: "50%",
          background: "linear-gradient(135deg, #2c4f8e, #122548)",
          color: "#fff", display: "grid", placeItems: "center",
          fontWeight: 600, fontSize: 11,
        }}>RC</div>
        <div>
          <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: 12 }}>Renato Cordeiro</div>
          <div style={{ color: "var(--ink-3)", fontSize: 11 }}>Diretoria · GMC</div>
        </div>
      </div>
    </aside>
  );
}
