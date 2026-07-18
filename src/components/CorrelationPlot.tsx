"use client";

import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Scatter,
  Line,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

interface CorrelationPlotProps {
  gene1Name: string;
  gene2Name: string;
  gene1Expression: number[] | undefined;
  gene2Expression: number[] | undefined;
  samples: string[];
}

export default function CorrelationPlot({
  gene1Name,
  gene2Name,
  gene1Expression,
  gene2Expression,
  samples,
}: CorrelationPlotProps) {
  // Generate co-expression data for samples using actual data
  const correlationData = useMemo(() => {
    if (
      !gene1Expression ||
      !gene2Expression ||
      gene1Expression.length === 0 ||
      gene2Expression.length === 0
    ) {
      return {
        points: [],
        trendline: [],
        r: 0,
        m: 0,
        b: 0,
        bounds: { minX: 0, maxX: 10, minY: 0, maxY: 10 },
      };
    }

    const numSamples = gene1Expression.length;
    const dataPoints = [];

    for (let i = 0; i < numSamples; i++) {
      dataPoints.push({
        sample: samples[i] || `Sample ${i + 1}`,
        x: gene1Expression[i],
        y: gene2Expression[i],
      });
    }

    // Calculate Pearson correlation r
    const xVals = dataPoints.map((d) => d.x);
    const yVals = dataPoints.map((d) => d.y);
    const meanX = xVals.reduce((a, b) => a + b, 0) / numSamples;
    const meanY = yVals.reduce((a, b) => a + b, 0) / numSamples;

    let num = 0;
    let denX = 0;
    let denY = 0;
    for (let i = 0; i < numSamples; i++) {
      const dx = xVals[i] - meanX;
      const dy = yVals[i] - meanY;
      num += dx * dy;
      denX += dx * dx;
      denY += dy * dy;
    }

    const r = denX && denY ? num / Math.sqrt(denX * denY) : 0;

    // Linear regression: y = mx + b
    const m = denX ? num / denX : 0;
    const b = meanY - m * meanX;

    // Generate trendline points
    const minX = Math.min(...xVals);
    const maxX = Math.max(...xVals);

    const trendline = [
      { x: minX, trend: Number((m * minX + b).toFixed(3)) },
      { x: maxX, trend: Number((m * maxX + b).toFixed(3)) },
    ];

    return {
      points: dataPoints,
      trendline,
      r: Number(r.toFixed(3)),
      m: Number(m.toFixed(3)),
      b: Number(b.toFixed(3)),
      bounds: {
        minX: Number((minX - 0.2).toFixed(1)),
        maxX: Number((maxX + 0.2).toFixed(1)),
        minY: Number((Math.min(...yVals) - 0.5).toFixed(1)),
        maxY: Number((Math.max(...yVals) + 0.5).toFixed(1)),
      },
    };
  }, [gene1Expression, gene2Expression, samples]);

  if (
    !gene1Expression ||
    !gene2Expression ||
    gene1Expression.length === 0 ||
    gene2Expression.length === 0
  ) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex items-center justify-center h-[350px] text-slate-400">
        Please select two genes in the controls above to plot correlation.
      </div>
    );
  }

  const { points, trendline, r, m, b, bounds } = correlationData;

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      if (data.trend !== undefined) return null; // Ignore trendline hover
      return (
        <div className="bg-slate-950 border border-slate-700 p-2.5 rounded-lg text-xs shadow-xl">
          <div className="font-semibold text-teal-400 mb-1">{data.sample}</div>
          <div>
            <span className="text-slate-400">{gene1Name}:</span> {data.x.toFixed(3)}
          </div>
          <div>
            <span className="text-slate-400">{gene2Name}:</span> {data.y.toFixed(3)}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col h-full">
      <div className="flex flex-row justify-between items-center mb-3">
        <div>
          <h3 className="text-slate-200 font-semibold text-lg">Gene-Gene Co-Expression</h3>
          <p className="text-xs text-slate-400">
            Expression levels across tumor samples (\(N = {samples.length}\))
          </p>
        </div>
        <div className="text-right">
          <div className="text-sm font-bold text-teal-400 font-mono">
            Pearson \(r\) = {r}
          </div>
          <div className="text-[10px] text-slate-400 font-mono">
            y = {m}x + {b >= 0 ? `+${b.toFixed(2)}` : b.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="flex-1 w-full h-[300px] min-h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.05)" />
            <XAxis
              type="number"
              dataKey="x"
              name={gene1Name}
              domain={[bounds.minX, bounds.maxX]}
              stroke="#64748b"
              tickLine={false}
              axisLine={{ stroke: "#475569" }}
              tick={{ fontSize: 10 }}
              label={{
                value: `${gene1Name} Expression (log2)`,
                position: "bottom",
                offset: 5,
                fill: "#94a3b8",
                fontSize: 11,
                fontWeight: "bold",
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name={gene2Name}
              domain={[bounds.minY, bounds.maxY]}
              stroke="#64748b"
              tickLine={false}
              axisLine={{ stroke: "#475569" }}
              tick={{ fontSize: 10 }}
              label={{
                value: `${gene2Name} Expression (log2)`,
                angle: -90,
                position: "left",
                offset: -2,
                fill: "#94a3b8",
                fontSize: 11,
                fontWeight: "bold",
              }}
            />
            <ZAxis type="number" range={[60, 60]} />
            <Tooltip content={<CustomTooltip />} />

            {/* Trendline */}
            <Line
              data={trendline}
              type="linear"
              dataKey="trend"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
              activeDot={false}
              legendType="none"
              tooltipType="none"
            />

            {/* Scatter points */}
            <Scatter
              data={points}
              name="Expression samples"
              fill="#14b8a6"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth={1}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
