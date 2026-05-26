"use client";

export interface LinePoint {
  label: string;
  total: number;
  ano: number;
  mes: number;
}

function fmtY(v: number): string {
  if (v >= 1e9) return `R$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `R$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `R$${(v / 1e3).toFixed(0)}K`;
  return `R$${v.toFixed(0)}`;
}

export default function LineAreaChart({
  data,
  currentAno,
  currentMes,
  height = 280,
  color = "#1b3664",
  legendLabel = "NFs",
}: {
  data: LinePoint[];
  currentAno: number;
  currentMes: number;
  height?: number;
  color?: string;
  legendLabel?: string;
}) {
  if (data.length < 2) return null;

  const W = 1400, H = height;
  const padL = 66, padR = 44, padT = 18, padB = 36;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const max   = Math.max(...data.map(d => d.total), 1);
  const n     = data.length;

  const xAt = (i: number) => padL + (i / (n - 1)) * innerW;
  const yAt = (v: number) => padT + innerH - (v / max) * innerH;

  // Y-axis ticks — 5 evenly spaced
  const yTicks = Array.from({ length: 6 }, (_, i) => (max / 5) * i);

  // Split into complete months vs current (partial)
  const currentIdx = data.findIndex(d => d.ano === currentAno && d.mes === currentMes);
  const solidData  = currentIdx >= 0 ? data.slice(0, currentIdx + 1) : data;
  const dashedData = currentIdx >= 0 && currentIdx < n - 1
    ? data.slice(currentIdx)
    : [];

  const toPath = (pts: LinePoint[], startIdx: number) =>
    pts.map((d, j) => {
      const x = xAt(startIdx + j);
      const y = yAt(d.total);
      return `${j === 0 ? "M" : "L"} ${x} ${y}`;
    }).join(" ");

  const toArea = (pts: LinePoint[], startIdx: number) => {
    const line = pts.map((d, j) => `${j === 0 ? "M" : "L"} ${xAt(startIdx + j)} ${yAt(d.total)}`).join(" ");
    const base = `L ${xAt(startIdx + pts.length - 1)} ${padT + innerH} L ${xAt(startIdx)} ${padT + innerH} Z`;
    return line + " " + base;
  };

  // X-axis labels — show every other month, always first and last
  const xLabels = data.map((d, i) => {
    const show = i === 0 || i === n - 1 || i % 2 === 0;
    return show ? { i, label: d.label } : null;
  }).filter(Boolean) as { i: number; label: string }[];

  const BLUE      = color;
  const BLUE_SOFT = color + "33";
  const MUTED     = "#9ea7c1";
  const LINE_COL  = "#e7ecf6";

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: "auto", display: "block", fontFamily: "'Manrope',sans-serif" }}
    >
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={BLUE} stopOpacity="0.18" />
          <stop offset="100%" stopColor={BLUE} stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="areaGradDash" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={BLUE} stopOpacity="0.08" />
          <stop offset="100%" stopColor={BLUE} stopOpacity="0.01" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {yTicks.map((v, i) => (
        <g key={i}>
          <line
            x1={padL} x2={W - padR}
            y1={yAt(v)} y2={yAt(v)}
            stroke={LINE_COL}
            strokeDasharray={i === 0 ? "0" : "3 4"}
            strokeWidth={1}
          />
          <text
            x={padL - 8} y={yAt(v) + 4}
            fontSize={9.5} textAnchor="end"
            fill={MUTED}
          >
            {fmtY(v)}
          </text>
        </g>
      ))}

      {/* Area fill — solid months */}
      <path d={toArea(solidData, 0)} fill="url(#areaGrad)" />

      {/* Area fill — dashed (current partial month extension) */}
      {dashedData.length > 1 && (
        <path d={toArea(dashedData, currentIdx)} fill="url(#areaGradDash)" />
      )}

      {/* Solid line */}
      <path
        d={toPath(solidData, 0)}
        fill="none"
        stroke={BLUE}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Dashed line for current partial month */}
      {dashedData.length > 1 && (
        <path
          d={toPath(dashedData, currentIdx)}
          fill="none"
          stroke={BLUE}
          strokeWidth={1.8}
          strokeDasharray="5 4"
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity={0.6}
        />
      )}

      {/* Data points */}
      {solidData.map((d, i) => (
        <circle
          key={i}
          cx={xAt(i)}
          cy={yAt(d.total)}
          r={i === solidData.length - 1 ? 4.5 : 3}
          fill={i === solidData.length - 1 ? BLUE : "#fff"}
          stroke={BLUE}
          strokeWidth={i === solidData.length - 1 ? 0 : 1.8}
        />
      ))}

      {/* X-axis labels */}
      {xLabels.map(({ i, label }) => (
        <text
          key={i}
          x={xAt(i)}
          y={H - 10}
          fontSize={9.5}
          textAnchor="middle"
          fill={MUTED}
        >
          {label}
        </text>
      ))}

      {/* Legend */}
      <g transform={`translate(${W - padR - 130}, ${padT - 4})`}>
        <line x1={0} y1={5} x2={18} y2={5} stroke={BLUE} strokeWidth={2} />
        <text x={22} y={8.5} fontSize={9.5} fill={MUTED}>{legendLabel}</text>
        <line x1={22 + legendLabel.length * 6.5} y1={5} x2={22 + legendLabel.length * 6.5 + 18} y2={5}
          stroke={BLUE} strokeWidth={1.8} strokeDasharray="4 3" opacity={0.6} />
        <text x={22 + legendLabel.length * 6.5 + 22} y={8.5} fontSize={9.5} fill={MUTED}>Parcial</text>
      </g>
    </svg>
  );
}
