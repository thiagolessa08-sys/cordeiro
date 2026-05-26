"use client";

interface Stage { label: string; count: number; value: number }

function fmtM(v: number) {
  if (v >= 1_000_000_000) return `R$ ${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}K`;
  return `R$ ${v.toFixed(0)}`;
}

export default function FunnelChart({ stages, height = 260 }: { stages: Stage[]; height?: number }) {
  const W = 800, H = height;
  const padL = 24, padR = 60, padT = 10, padB = 10;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const n = stages.length;
  const stageH = innerH / n;
  const max = Math.max(...stages.map(s => s.value), 1);
  const COL = "#1b3664";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: H, display: "block", fontFamily: "'Manrope', sans-serif" }}>
      {stages.map((s, i) => {
        const top = padT + i * stageH;
        const topRatio = s.value / max;
        const botRatio = (stages[i + 1]?.value ?? s.value * 0.88) / max;
        const topW = innerW * topRatio;
        const botW = innerW * botRatio;
        const cx = padL + innerW / 2;
        const pts = `${cx - topW / 2},${top} ${cx + topW / 2},${top} ${cx + botW / 2},${top + stageH - 4} ${cx - botW / 2},${top + stageH - 4}`;
        const opacity = 0.92 - i * 0.12;
        const pct = i > 0 ? ((s.value / stages[i - 1].value) * 100).toFixed(1) : null;

        return (
          <g key={i}>
            <polygon points={pts} fill={COL} opacity={opacity} />
            <text x={cx} y={top + stageH / 2 - 5} fontSize={13} fill="#fff" textAnchor="middle" fontWeight="600">{s.label}</text>
            <text x={cx} y={top + stageH / 2 + 12} fontSize={11} fill="rgba(255,255,255,0.85)" textAnchor="middle">
              {s.count.toLocaleString("pt-BR")} docs · {fmtM(s.value)}
            </text>
            {pct && (
              <text x={W - padR + 6} y={top + 8} fontSize={10.5} fill="#6a7493" textAnchor="start">{pct}%</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
