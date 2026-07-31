"use client";

import React, { useMemo, useState, useRef } from "react";
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
import { Info, AlertTriangle } from "lucide-react";
import ExportButton from "@/components/ExportButton";
import { exportToCSV, exportSvgElement, exportComponentToPNG, exportComponentToSVG } from "@/utils/exportUtils";

interface CorrelationPlotProps {
  gene1Name: string;
  gene2Name: string;
  gene1Expression: number[] | undefined | null;
  gene2Expression: number[] | undefined | null;
  samples: string[];
  isTcgaGtex?: boolean;
}

// Spearman rank correlation helper
function calculateSpearman(x: number[], y: number[]): number {
  const n = x.length;
  if (n <= 1) return 0;
  
  const getRanks = (arr: number[]) => {
    const sorted = arr.map((val, idx) => ({ val, idx })).sort((a, b) => a.val - b.val);
    const ranks = new Array(n);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j < n && sorted[j].val === sorted[i].val) j++;
      const avgRank = (i + 1 + j) / 2;
      for (let k = i; k < j; k++) {
        ranks[sorted[k].idx] = avgRank;
      }
      i = j;
    }
    return ranks;
  };
  
  const ranksX = getRanks(x);
  const ranksY = getRanks(y);
  
  const meanRx = ranksX.reduce((a, b) => a + b, 0) / n;
  const meanRy = ranksY.reduce((a, b) => a + b, 0) / n;
  
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let k = 0; k < n; k++) {
    const dx = ranksX[k] - meanRx;
    const dy = ranksY[k] - meanRy;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  
  return denX && denY ? num / Math.sqrt(denX * denY) : 0;
}

export default function CorrelationPlot({
  gene1Name,
  gene2Name,
  gene1Expression,
  gene2Expression,
  samples,
  isTcgaGtex = false,
}: CorrelationPlotProps) {
  const [selectedCohort, setSelectedCohort] = useState<"tumor" | "gtex" | "all">("tumor");
  const chartContainerRef = useRef<HTMLDivElement | null>(null);

  // Filter sample expressions based on active cohort (for TCGA-GTEx)
  // Indices:
  // 0 to 177: TCGA Tumor (n=178)
  // 178 to 344: GTEx Normal (n=167)
  // 345 to 348: TCGA Solid Normal (n=4) - excluded from calculations
  const filteredExpressionData = useMemo(() => {
    if (!gene1Expression || !gene2Expression || gene1Expression.length === 0 || gene2Expression.length === 0) {
      return null;
    }

    if (!isTcgaGtex) {
      // SBRT mode: return raw values directly
      return {
        g1: gene1Expression,
        g2: gene2Expression,
        snames: samples,
        cohortName: "Pre & Post SBRT samples",
        color: "#14b8a6", // Teal
      };
    }

    // TCGA-GTEx mode cohort filtering
    let startIdx = 0;
    let endIdx = 0;
    let name = "";
    let color = "#14b8a6";

    if (selectedCohort === "tumor") {
      startIdx = 0;
      endIdx = 178;
      name = "TCGA Primary Tumor (n=178)";
      color = "#d73027"; // Red
    } else if (selectedCohort === "gtex") {
      startIdx = 178;
      endIdx = 345;
      name = "GTEx Normal Pancreas (n=167)";
      color = "#4575b4"; // Blue
    } else {
      // Pooled Tumor and GTEx (excluding adjacent normals)
      startIdx = 0;
      endIdx = 345;
      name = "TCGA & GTEx Pooled (n=345)";
      color = "#9c27b0"; // Purple
    }

    const g1Slice = Array.from(gene1Expression.slice(startIdx, endIdx));
    const g2Slice = Array.from(gene2Expression.slice(startIdx, endIdx));
    const snSlice = samples.slice(startIdx, endIdx);

    return {
      g1: g1Slice,
      g2: g2Slice,
      snames: snSlice,
      cohortName: name,
      color,
    };
  }, [gene1Expression, gene2Expression, samples, isTcgaGtex, selectedCohort]);

  // Generate co-expression data for samples using filtered data
  const correlationData = useMemo(() => {
    if (!filteredExpressionData) {
      return {
        points: [],
        trendline: [],
        r: 0,
        rho: 0,
        m: 0,
        b: 0,
        bounds: { minX: 0, maxX: 10, minY: 0, maxY: 10 },
      };
    }

    const { g1, g2, snames } = filteredExpressionData;
    const numSamples = g1.length;
    const dataPoints = [];

    for (let i = 0; i < numSamples; i++) {
      dataPoints.push({
        sample: snames[i] || `Sample ${i + 1}`,
        x: g1[i],
        y: g2[i],
      });
    }

    // Pearson correlation r
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

    // Spearman rank correlation rho
    const rho = calculateSpearman(xVals, yVals);

    // Linear regression: y = mx + b
    const m = denX ? num / denX : 0;
    const b = meanY - m * meanX;

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
      rho: Number(rho.toFixed(3)),
      m: Number(m.toFixed(3)),
      b: Number(b.toFixed(3)),
      bounds: {
        minX: Number((minX - 0.2).toFixed(1)),
        maxX: Number((maxX + 0.2).toFixed(1)),
        minY: Number((Math.min(...yVals) - 0.5).toFixed(1)),
        maxY: Number((Math.max(...yVals) + 0.5).toFixed(1)),
      },
    };
  }, [filteredExpressionData]);

  if (
    !gene1Expression ||
    !gene2Expression ||
    gene1Expression.length === 0 ||
    gene2Expression.length === 0
  ) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col items-center justify-center h-[350px] text-slate-400 font-mono text-xs">
        {isTcgaGtex && !gene1Expression ? (
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-500"></div>
            <span>Loading expression data buffer (27.7 MB) for correlation...</span>
          </div>
        ) : (
          <span>Please select two genes in the controls above to plot correlation.</span>
        )}
      </div>
    );
  }

  const { points, trendline, r, rho, m, b, bounds } = correlationData;

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      if (data.trend !== undefined) return null; // Ignore trendline hover
      return (
        <div className="bg-slate-950 border border-slate-700 p-2.5 rounded-lg text-xs shadow-xl font-mono">
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
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col h-full w-full">
      {/* Top Header Row: Title & Action Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 pb-3 border-b border-slate-800/80">
        <div>
          <h3 className="text-slate-200 font-semibold text-base">Gene-Gene Co-Expression</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {isTcgaGtex ? filteredExpressionData?.cohortName : `Expression levels across SBRT samples (N = ${samples.length})`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Cohort Selector (TCGA-GTEx only) */}
          {isTcgaGtex && (
            <div className="flex items-center gap-1 text-[10px] font-mono text-slate-300 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800">
              <span className="text-slate-400">Cohort:</span>
              <select
                value={selectedCohort}
                onChange={(e) => setSelectedCohort(e.target.value as any)}
                className="bg-transparent border-0 text-slate-200 focus:outline-none cursor-pointer font-semibold text-[10px]"
              >
                <option value="tumor" className="bg-slate-950">TCGA Tumor (Default)</option>
                <option value="gtex" className="bg-slate-950">GTEx Normal</option>
                <option value="all" className="bg-slate-950">Pooled Cohorts</option>
              </select>
            </div>
          )}

          <ExportButton
            onExportCSV={() => {
              if (!points || points.length === 0) return;
              exportToCSV({
                filename: `Correlation_${gene1Name}_vs_${gene2Name}.csv`,
                metadata: {
                  dataset: isTcgaGtex ? `TCGA-PAAD / GTEx (${selectedCohort})` : "GSE225767 Bulk RNA-seq",
                  module: "Gene-Gene Co-Expression Correlation",
                  selectedGene: `${gene1Name} vs ${gene2Name}`,
                  filters: `Pearson r: ${r}, Spearman rho: ${rho}, m: ${m}, b: ${b}, Total Points: ${points.length}`,
                },
                headers: ["Sample", `${gene1Name} Expression`, `${gene2Name} Expression`],
                rows: points.map((p) => [p.sample, p.x, p.y]),
              });
            }}
            onExportPNG={async () => {
              if (!chartContainerRef.current) return;
              await exportComponentToPNG({
                element: chartContainerRef.current,
                filename: `Correlation_${gene1Name}_vs_${gene2Name}.png`,
                title: `Co-Expression: ${gene1Name} vs ${gene2Name} (r=${r})`,
                subtitle: `Pearson r = ${r}, Spearman rho = ${rho}`,
              });
            }}
            onExportSVG={async () => {
              if (!chartContainerRef.current) return;
              await exportComponentToSVG({
                element: chartContainerRef.current,
                filename: `Correlation_${gene1Name}_vs_${gene2Name}.svg`,
                title: `Co-Expression: ${gene1Name} vs ${gene2Name} (r=${r})`,
                subtitle: `Pearson r = ${r}, Spearman rho = ${rho}`,
              });
            }}
          />
        </div>
      </div>

      {/* Summary Statistics Sub-Bar */}
      <div className="flex items-center justify-between flex-wrap gap-2 text-[10px] font-mono bg-slate-950/60 px-2.5 py-1 rounded-md border border-slate-850 mb-2.5">
        <div className="flex items-center gap-3">
          <span className="text-teal-400 font-bold">
            Pearson r = <span className="text-slate-100">{r}</span>
          </span>
          <span className="text-slate-300">
            Spearman &rho; = <span className="text-slate-100">{rho}</span>
          </span>
        </div>
        <span className="text-slate-400">
          Fit: <span className="text-slate-200">y = {m}x {b >= 0 ? `+ ${b.toFixed(2)}` : `- ${Math.abs(b).toFixed(2)}`}</span>
        </span>
      </div>

      {/* Warning message for pooled exploratory mode */}
      {isTcgaGtex && selectedCohort === "all" && (
        <div className="bg-purple-950/10 border border-purple-900/40 p-2.5 rounded-lg mb-3 flex gap-2 text-xxs font-mono text-purple-300">
          <AlertTriangle className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Methodological Warning:</strong> Pooling independent tumor ($n=178$) and normal ($n=167$) cohorts can create cohort-driven artificial correlations driven by global cohort differences rather than biological gene-gene co-regulation in the same cells. Use with caution.
          </p>
        </div>
      )}

      <div ref={chartContainerRef} className="flex-1 w-full h-[280px] min-h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart margin={{ top: 10, right: 10, bottom: 20, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.03)" />
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
                value: `${gene1Name} Expression log₂(TPM + 0.001)`,
                position: "bottom",
                offset: 5,
                fill: "#94a3b8",
                fontSize: 10,
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
                value: `${gene2Name} Expression log₂(TPM + 0.001)`,
                angle: -90,
                position: "insideLeft",
                offset: 12,
                fill: "#94a3b8",
                fontSize: 10,
                fontWeight: "bold",
                style: { textAnchor: "middle" }
              }}
            />
            <ZAxis type="number" range={[45, 45]} />
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
              name="Expression samples"
              data={points}
              fill={filteredExpressionData?.color || "#14b8a6"}
              stroke="rgba(255,255,255,0.15)"
              strokeWidth={0.5}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
