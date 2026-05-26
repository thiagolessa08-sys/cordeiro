"use client";

interface SparklineProps {
  data: number[];
  color?: string;
  height?: number;
  fill?: boolean;
  strokeW?: number;
}

export default function Sparkline({ data, color = "#1b3664", height = 32, fill = true, strokeW = 1.5 }: SparklineProps) {
  if (!data || data.length < 2) return null;
  const w = 100, h = 100;
  const max = Math.max(...data), min = Math.min(...data);
  const range = (max - min) || 1;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => [i * step, h - ((v - min) / range) * (h * 0.85) - h * 0.07]);
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(2) + " " + p[1].toFixed(2)).join(" ");
  const dFill = d + ` L${w} ${h} L0 ${h} Z`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height, display: "block" }}
    >
      {fill && <path d={dFill} fill={color} opacity={0.1} />}
      <path d={d} fill="none" stroke={color} strokeWidth={strokeW} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
