"use client";

interface Bar { dia: number; total: number; qtd: number }

function fmtK(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(Math.round(v));
}

function fmtBrl(v: number) {
  if (v >= 1e6) return `R$ ${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `R$ ${(v / 1e3).toFixed(0)}K`;
  return `R$ ${v.toFixed(0)}`;
}

export default function DailyBarChart({
  data,
  height = 200,
  ano,
  mes,
  totalDias = 31,
}: {
  data: Bar[];
  height?: number;
  /** Year of the displayed month — used to detect weekends */
  ano?: number;
  /** Month (1-12) — used to detect weekends */
  mes?: number;
  /** Total days in the month (28/29/30/31) */
  totalDias?: number;
}) {
  const W = 800, H = height;
  const padL = 56, padR = 14, padT = 14, padB = 30;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const max = Math.max(...data.map(d => d.total), 1);
  const yAt = (v: number) => padT + innerH - (v / max) * innerH;
  const barW = Math.max(4, (innerW / totalDias) * 0.68);
  const xAt  = (dia: number) => padL + ((dia - 1) / (totalDias - 1)) * innerW;

  const isWeekend = (dia: number): boolean => {
    if (!ano || !mes) return false;
    const dow = new Date(ano, mes - 1, dia).getDay(); // 0=Sun 6=Sat
    return dow === 0 || dow === 6;
  };

  const yTicks = [0, max * 0.25, max * 0.5, max * 0.75, max];
  const COL_LINE  = "#e7ecf6";
  const COL_MUTED = "#9ea7c1";
  const COL_BLUE  = "#1b3664";
  const COL_WE    = "#c8cfde";   // weekend bar color
  const COL_INK3  = "#6a7493";

  // Y-axis labels formatted as R$
  const yLabel = (v: number) => {
    if (v >= 1e6) return `R$${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `R$${(v / 1e3).toFixed(0)}K`;
    return `R$0`;
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height: H, display: "block", fontFamily: "'Manrope', sans-serif" }}
    >
      {/* Grid + Y-axis */}
      {yTicks.map((v, i) => (
        <g key={i}>
          <line
            x1={padL} x2={W - padR}
            y1={yAt(v)} y2={yAt(v)}
            stroke={COL_LINE}
            strokeDasharray={i === 0 ? "0" : "2 3"}
          />
          <text x={padL - 8} y={yAt(v) + 3.5} fontSize={9} textAnchor="end" fill={COL_MUTED}>
            {yLabel(v)}
          </text>
        </g>
      ))}

      {/* Weekend background bands */}
      {ano && mes && Array.from({ length: totalDias }, (_, i) => i + 1).map(dia => {
        if (!isWeekend(dia)) return null;
        const x = xAt(dia) - barW / 2 - 1;
        return (
          <rect
            key={`we-${dia}`}
            x={x} y={padT}
            width={barW + 2} height={innerH}
            fill="#f0f2f7" rx={2}
          />
        );
      })}

      {/* Bars */}
      {data.map((d) => {
        const x  = xAt(d.dia);
        const y  = yAt(d.total);
        const bh = (padT + innerH) - y;
        const wk = isWeekend(d.dia);
        return (
          <g key={d.dia}>
            <rect
              x={x - barW / 2} y={y}
              width={barW} height={Math.max(bh, 0)}
              fill={wk ? COL_WE : COL_BLUE}
              opacity={wk ? 0.9 : 0.84}
              rx={2}
            />
          </g>
        );
      })}

      {/* X-axis labels — show every 5 days + day 1 */}
      {Array.from({ length: totalDias }, (_, i) => i + 1).map(dia => {
        const show = dia === 1 || dia % 5 === 0;
        if (!show) return null;
        return (
          <text
            key={dia}
            x={xAt(dia)}
            y={H - 12}
            fontSize={9}
            textAnchor="middle"
            fill={isWeekend(dia) ? COL_WE : COL_INK3}
          >
            {String(dia).padStart(2, "0")}
          </text>
        );
      })}
    </svg>
  );
}
