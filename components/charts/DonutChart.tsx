"use client";

export interface DonutSlice {
  label: string;
  count: number;
  value: number;
  color: string;
}

function fmtBrl(v: number) {
  if (v >= 1e9) return `R$ ${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `R$ ${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `R$ ${(v / 1e3).toFixed(0)}K`;
  return `R$ ${v.toFixed(0)}`;
}

export default function DonutChart({
  slices,
  size = 160,
  centerLabel,
  centerSub,
}: {
  slices: DonutSlice[];
  size?: number;
  centerLabel?: string;
  centerSub?: string;
}) {
  const cx = size / 2, cy = size / 2;
  const R = size * 0.38, r = size * 0.24;
  const total = slices.reduce((a, s) => a + s.count, 0);
  if (total === 0) return null;

  // Build arc paths
  let angle = -Math.PI / 2; // start at top
  const arcs = slices.map(s => {
    const sweep = (s.count / total) * 2 * Math.PI;
    const a0 = angle, a1 = angle + sweep - 0.012; // small gap
    angle += sweep;

    const x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0);
    const x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
    const ix0 = cx + r * Math.cos(a0), iy0 = cy + r * Math.sin(a0);
    const ix1 = cx + r * Math.cos(a1), iy1 = cy + r * Math.sin(a1);
    const large = sweep > Math.PI ? 1 : 0;

    const d = [
      `M ${x0} ${y0}`,
      `A ${R} ${R} 0 ${large} 1 ${x1} ${y1}`,
      `L ${ix1} ${iy1}`,
      `A ${r} ${r} 0 ${large} 0 ${ix0} ${iy0}`,
      "Z",
    ].join(" ");

    return { d, color: s.color, pct: (s.count / total) * 100 };
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      {/* SVG donut */}
      <div style={{ flexShrink: 0 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {arcs.map((a, i) => (
            <path key={i} d={a.d} fill={a.color} />
          ))}
          {/* Center text */}
          {centerLabel && (
            <>
              <text x={cx} y={cy - 2} textAnchor="middle" fontSize={size * 0.11}
                fontWeight="700" fill="var(--ink)" fontFamily="'Manrope',sans-serif">
                {centerLabel}
              </text>
              {centerSub && (
                <text x={cx} y={cy + size * 0.085} textAnchor="middle" fontSize={size * 0.058}
                  fill="var(--ink-3)" fontFamily="'Manrope',sans-serif">
                  {centerSub}
                </text>
              )}
            </>
          )}
        </svg>
      </div>

      {/* Legend */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 12, color: "var(--ink-2)" }}>{s.label}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
              {((s.count / total) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
        {/* Value legend (2-col grid) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", marginTop: 6, paddingTop: 8, borderTop: "1px solid var(--line-2)" }}>
          {slices.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{s.label}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ink)", marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>
                {fmtBrl(s.value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
