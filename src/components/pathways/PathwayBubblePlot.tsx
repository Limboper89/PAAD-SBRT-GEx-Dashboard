"use client";

import React, { useState } from "react";
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, Cell, ReferenceLine } from "recharts";
import { PathwayEnrichmentResult } from "@/types/pathway";

interface PathwayBubblePlotProps {
  results: PathwayEnrichmentResult[];
  onSelectPathway: (pathway: PathwayEnrichmentResult) => void;
  analysisMode: "ORA" | "GSEA";
}

function CustomDotTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { rawResult: PathwayEnrichmentResult } }> }) {
  if (active && payload && payload.length && payload[0].payload) {
    const r: PathwayEnrichmentResult = payload[0].payload.rawResult;
    const isGsea = r.analysisMode === "GSEA";
    const isUp = r.direction === "Upregulated" || (r.nes !== undefined && r.nes >= 0);

    return (
      <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl shadow-2xl text-xs font-mono max-w-xs space-y-1.5 backdrop-blur">
        <div className="flex items-center justify-between border-b border-slate-800 pb-1">
          <span className="text-xxs bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 px-2 py-0.5 rounded font-bold uppercase">
            {r.database}
          </span>
          <span className={`text-xxs font-bold px-1.5 py-0.5 rounded border ${isUp ? "bg-rose-500/10 text-rose-300 border-rose-500/30" : "bg-sky-500/10 text-sky-300 border-sky-500/30"}`}>
            {r.direction}
          </span>
        </div>
        <p className="font-bold text-slate-100 leading-snug">{r.pathwayName}</p>
        <div className="space-y-0.5 text-xxs pt-1">
          <div className="flex justify-between">
            <span className="text-slate-400">{isGsea ? "NES:" : "Fold Enrichment:"}</span>
            <span className={`font-bold ${isUp ? "text-rose-400" : "text-sky-400"}`}>
              {isGsea ? (r.nes !== undefined ? (r.nes > 0 ? `+${r.nes.toFixed(3)}` : r.nes.toFixed(3)) : "N/A") : (r.foldEnrichment ? `${r.foldEnrichment.toFixed(2)}x` : "N/A")}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">BH FDR:</span>
            <span className="text-teal-400 font-bold">{r.adjPValue ? r.adjPValue.toExponential(2) : "N/A"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Nominal P-value:</span>
            <span className="text-slate-200 font-bold">{r.pValue ? r.pValue.toExponential(2) : "N/A"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">{isGsea ? "Leading-Edge Genes:" : "Overlap Genes:"}</span>
            <span className="text-amber-400 font-bold">
              {isGsea ? `${r.leadingEdgeCount || r.leadingEdgeGenes?.length || 0} / ${r.geneSetSize || 0}` : `${r.overlapCount} / ${r.geneSetSize}`}
            </span>
          </div>
        </div>
        <p className="text-[10px] text-teal-400 font-sans font-semibold text-right pt-1">
          Click dot to inspect GSEA curve &rarr;
        </p>
      </div>
    );
  }
  return null;
}

export default function PathwayBubblePlot({
  results,
  onSelectPathway,
  analysisMode
}: PathwayBubblePlotProps) {
  const [topCount, setTopCount] = useState<number>(20);

  if (!results || results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[420px] bg-slate-900/40 border border-slate-800 rounded-2xl p-6 text-center text-slate-500 font-mono text-xs">
        <p>No enriched pathways meet the selected filter criteria.</p>
        <p className="text-xxs text-slate-600 mt-1">Try relaxing BH FDR threshold or min overlap filters.</p>
      </div>
    );
  }

  const isGsea = analysisMode === "GSEA";

  // Sort by FDR ascending, then absolute NES descending
  const displayResults = [...results]
    .sort((a, b) => {
      if (a.adjPValue !== b.adjPValue) return a.adjPValue - b.adjPValue;
      return Math.abs(b.nes || 0) - Math.abs(a.nes || 0);
    })
    .slice(0, topCount);

  const chartData = displayResults.map((r, idx) => {
    const rawX = isGsea ? (r.nes ?? 0) : (r.foldEnrichment ?? 1.0);
    const xValue = Number.isFinite(rawX) ? rawX : 1.0;

    const rawSize = isGsea ? (r.leadingEdgeCount ?? r.leadingEdgeGenes?.length ?? 10) : (r.overlapCount ?? 2);
    const size = Number.isFinite(rawSize) ? Math.max(6, rawSize) : 10;

    const fdr = Number.isFinite(r.adjPValue) ? r.adjPValue : 1.0;
    const logFdr = fdr > 0 ? -Math.log10(fdr) : 0;
    const opacity = Math.min(1.0, Math.max(0.4, 0.4 + logFdr * 0.15));

    return {
      id: r.pathwayId || `dot-${idx}`,
      name: r.pathwayName.length > 34 ? r.pathwayName.slice(0, 32) + "..." : r.pathwayName,
      fullName: r.pathwayName,
      xValue,
      yIndex: displayResults.length - idx,
      size,
      fdr,
      logFdr,
      opacity,
      direction: r.direction,
      rawResult: r
    };
  });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col h-full min-h-[520px] shadow-xl font-sans">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <span>GSEA Enrichment Summary</span>
            <span className="text-xxs font-mono text-slate-400 font-normal">
              (Top {displayResults.length} Enriched Pathways)
            </span>
          </h3>
          <p className="text-xxs text-slate-400 font-mono mt-0.5">
            Normalized Enrichment Score (NES) &bull; Statistical Significance &bull; Leading-Edge Genes
          </p>
        </div>

        {/* Top Count Selector */}
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="text-slate-400">Display:</span>
          <div className="flex gap-1 bg-slate-950 p-1 rounded-xl border border-slate-850">
            {[10, 20, 30].map((cnt) => (
              <button
                key={cnt}
                type="button"
                onClick={() => setTopCount(cnt)}
                className={`px-2.5 py-1 rounded-lg text-xxs font-bold transition ${
                  topCount === cnt
                    ? "bg-indigo-500 text-slate-950 shadow"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Top {cnt}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Scatter / Dot Chart */}
      <div className="w-full h-[450px] min-h-[450px] relative">
        <ResponsiveContainer width="100%" height={450}>
          <ScatterChart margin={{ top: 20, right: 35, bottom: 45, left: 190 }}>
            <XAxis
              type="number"
              dataKey="xValue"
              name={isGsea ? "NES" : "Fold Enrichment"}
              stroke="#64748b"
              tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "monospace" }}
              domain={['auto', 'auto']}
              label={{
                value: isGsea ? "Normalized Enrichment Score (NES)" : "Fold Enrichment",
                position: "insideBottom",
                offset: -14,
                fill: "#94a3b8",
                fontSize: 11,
                fontWeight: "bold",
                fontFamily: "monospace"
              }}
            />
            <YAxis
              type="category"
              dataKey="name"
              name="Pathway"
              stroke="#64748b"
              tick={{ fill: "#cbd5e1", fontSize: 11, fontFamily: "sans-serif" }}
              interval={0}
              width={180}
              label={{
                value: "Enriched Pathways",
                angle: -90,
                position: "insideLeft",
                offset: 5,
                fill: "#94a3b8",
                fontSize: 11,
                fontWeight: "bold",
                fontFamily: "monospace"
              }}
            />
            <ZAxis type="number" dataKey="size" range={[70, 450]} />
            <ReferenceLine x={0} stroke="#475569" strokeDasharray="3 3" />
            <Tooltip content={<CustomDotTooltip />} cursor={{ strokeDasharray: '3 3' }} />
            <Scatter
              data={chartData}
              onClick={(entry) => {
                const item = entry as { rawResult?: PathwayEnrichmentResult };
                if (item && item.rawResult) {
                  onSelectPathway(item.rawResult);
                }
              }}
              className="cursor-pointer"
            >
              {chartData.map((entry) => {
                let fillColor = "#14b8a6";
                if (entry.direction === "Upregulated") fillColor = "#ef4444";
                else if (entry.direction === "Downregulated") fillColor = "#3b82f6";

                return (
                  <Cell
                    key={`dot-${entry.id}`}
                    fill={fillColor}
                    fillOpacity={entry.opacity}
                    stroke={fillColor}
                    strokeWidth={1.5}
                  />
                );
              })}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
