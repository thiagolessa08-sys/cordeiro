"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Line, ComposedChart, Legend,
} from "recharts";

interface DataPoint {
  label: string;
  faturado: number;
  nfs: number;
}

function fmt(value: number) {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)}K`;
  return `R$ ${value.toFixed(0)}`;
}

export default function FaturamentoChart({ data }: { data: DataPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis dataKey="label" tick={{ fill: "#9ca3af", fontSize: 11 }} />
        <YAxis
          yAxisId="left"
          tickFormatter={(v) => fmt(v)}
          tick={{ fill: "#9ca3af", fontSize: 11 }}
          width={72}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fill: "#6b7280", fontSize: 11 }}
          width={36}
        />
        <Tooltip
          contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8 }}
          labelStyle={{ color: "#f9fafb", fontWeight: 600 }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any, name: any) => {
            const v = Number(value ?? 0);
            return String(name) === "faturado" ? [fmt(v), "Faturado"] : [v, "NFs"];
          }}
        />
        <Legend
          formatter={(v) => (v === "faturado" ? "Faturado" : "Qtd NFs")}
          wrapperStyle={{ color: "#9ca3af", fontSize: 12 }}
        />
        <Bar yAxisId="left" dataKey="faturado" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="nfs"
          stroke="#10b981"
          strokeWidth={2}
          dot={{ fill: "#10b981", r: 3 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
