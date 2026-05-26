"use client";

export interface AgingBucket {
  faixa: string;
  qtd:   number;
  valor: number;
}

function fmtBrl(v: number) {
  if (v >= 1e6) return `R$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `R$${(v / 1e3).toFixed(0)}K`;
  return `R$${v.toFixed(0)}`;
}

export default function AgingChart({
  buckets,
  height = 220,
}: {
  buckets: AgingBucket[];
  height?: number;
}) {
  if (buckets.length === 0) return null;

  const W = 700, H = height;
  const padL = 36, padR = 12, padT = 16, padB = 50;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const maxQtd = Math.max(...buckets.map(b => b.qtd), 1);
  const n      = buckets.length;
  const barW   = (innerW / n) * 0.55;
  const gap    = (innerW / n);
  const xAt    = (i: number) => padL + gap * i + gap / 2;
  const yAt    = (v: number) => padT + innerH - (v / maxQtd) * innerH;

  const yTicks = Array.from({ length: 5 }, (_, i) =>
    Math.round((maxQtd / 4) * i)
  );

  const BLUE   = "#1b3664";
  const MUTED  = "#9ea7c1";
  const LINE   = "#e7ecf6";

  // Color per bucket: fresh=blue, middle=slightly lighter, aging=warn/danger
  const bucketColor = (i: number) => {
    if (i <= 1) return "#1b3664";
    if (i <= 2) return "#294a82";
    if (i === 3) return "#3a6db5";
    if (i === 4) return "#ff8a55";
    return "#d94c5b";
  };

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: H, display: "block", fontFamily: "'Manrope',sans-serif" }}
      >
        {/* Grid */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line
              x1={padL} x2={W - padR}
              y1={yAt(v)} y2={yAt(v)}
              stroke={LINE}
              strokeDasharray={i === 0 ? "0" : "2 3"}
            />
            <text x={padL - 6} y={yAt(v) + 3.5} fontSize={9} textAnchor="end" fill={MUTED}>{v}</text>
          </g>
        ))}

        {/* Bars */}
        {buckets.map((b, i) => {
          const x  = xAt(i);
          const y  = yAt(b.qtd);
          const bh = (padT + innerH) - y;
          return (
            <g key={b.faixa}>
              <rect
                x={x - barW / 2} y={y}
                width={barW} height={Math.max(bh, 0)}
                fill={bucketColor(i)}
                opacity={0.88}
                rx={3}
              />
              {/* Bucket label below bar */}
              <text
                x={x} y={padT + innerH + 14}
                fontSize={9.5} textAnchor="middle" fill={MUTED}
              >
                {b.faixa === ">90" ? "> 90 dias" : `${b.faixa} dias`}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Value row */}
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${n}, 1fr)`,
        gap: 4,
        marginTop: 2,
        paddingLeft: 0,
      }}>
        {buckets.map((b, i) => (
          <div key={b.faixa} style={{ textAlign: "center" }}>
            <div style={{
              fontSize: 9, color: MUTED, textTransform: "uppercase",
              letterSpacing: ".06em", fontWeight: 600, marginBottom: 2,
            }}>
              {b.faixa === ">90" ? "> 90 dias" : `${b.faixa} dias`}
            </div>
            <div style={{
              fontSize: 12, fontWeight: 600,
              color: i >= 4 ? "#d94c5b" : i >= 3 ? "#ff8a55" : "var(--blue-2)",
              fontVariantNumeric: "tabular-nums",
            }}>
              {fmtBrl(b.valor)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
