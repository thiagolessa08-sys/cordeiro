"use client";

export interface StackedSegment {
  label: string;
  count: number;
  color: "ok" | "info" | "warn" | "dang";
}

const COLOR_MAP: Record<string, { fill: string; text: string }> = {
  ok:   { fill: "var(--ok)",     text: "#fff" },
  info: { fill: "var(--blue)",   text: "#fff" },
  warn: { fill: "var(--orange)", text: "#fff" },
  dang: { fill: "var(--danger)", text: "#fff" },
};

export default function StackedBar({ segments }: { segments: StackedSegment[] }) {
  const total = segments.reduce((a, s) => a + s.count, 0);
  if (total === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Bar */}
      <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", gap: 2 }}>
        {segments.map((s, i) => {
          const pct = (s.count / total) * 100;
          const { fill } = COLOR_MAP[s.color] ?? COLOR_MAP.info;
          return (
            <div
              key={i}
              title={`${s.label}: ${s.count.toLocaleString("pt-BR")} (${pct.toFixed(1)}%)`}
              style={{ flex: pct, background: fill, minWidth: pct > 0 ? 3 : 0, transition: "flex .4s" }}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 20px" }}>
        {segments.map((s, i) => {
          const pct = (s.count / total) * 100;
          const { fill } = COLOR_MAP[s.color] ?? COLOR_MAP.info;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: fill, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{s.label}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
                {s.count.toLocaleString("pt-BR")}
              </span>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>({pct.toFixed(1)}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
