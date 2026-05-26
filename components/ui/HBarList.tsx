"use client";

export interface HBarItem {
  label: string;
  sublabel?: string;
  value: number;
  count?: number;
}

function fmtBrl(v: number) {
  if (v >= 1e9) return `R$ ${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `R$ ${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `R$ ${(v / 1e3).toFixed(0)}K`;
  return `R$ ${v.toFixed(0)}`;
}

export default function HBarList({
  items,
  color = "#1b3664",
  valueLabel,
}: {
  items: HBarItem[];
  color?: string;
  valueLabel?: (item: HBarItem) => string;
}) {
  const max = Math.max(...items.map(i => i.value), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((item, idx) => {
        const pct = (item.value / max) * 100;
        const label = valueLabel ? valueLabel(item) : fmtBrl(item.value);
        return (
          <div key={idx} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  width: 18, height: 18, borderRadius: 5, background: "var(--bg-2,#eef1f7)",
                  display: "grid", placeItems: "center",
                  fontSize: 9, fontWeight: 700, color: "var(--ink-3)", flexShrink: 0,
                }}>
                  {idx + 1}
                </span>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink)", lineHeight: 1.2 }}>
                    {item.label}
                  </span>
                  {item.sublabel && (
                    <div style={{ fontSize: 10.5, color: "var(--ink-3)", lineHeight: 1 }}>
                      {item.sublabel}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
                  {label}
                </span>
                {item.count !== undefined && (
                  <div style={{ fontSize: 10.5, color: "var(--muted)" }}>
                    {item.count.toLocaleString("pt-BR")} docs
                  </div>
                )}
              </div>
            </div>
            <div style={{ height: 5, background: "var(--line-2,#e8ecf4)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${pct}%`,
                background: color,
                borderRadius: 3,
                opacity: 0.8 - idx * 0.08,
                transition: "width .5s ease",
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
