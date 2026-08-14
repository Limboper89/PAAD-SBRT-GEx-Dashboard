"use client";

import React from "react";
import { PathwayEnrichmentResult } from "@/types/pathway";
import { CheckCircle2, ExternalLink, Zap, Info } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine } from "recharts";

interface GSEAEnrichmentCurveProps {
  pathway: PathwayEnrichmentResult | null;
  onClose?: () => void;
}

export default function GSEAEnrichmentCurve({ pathway, onClose }: GSEAEnrichmentCurveProps) {
  if (!pathway) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 text-center text-slate-500 font-mono text-xs flex flex-col items-center justify-center min-h-[300px]">
        <Info className="w-8 h-8 text-slate-600 mb-2" />
        <p className="font-bold text-slate-400">No Pathway Selected for Enrichment Inspection</p>
        <p className="text-xxs text-slate-500 mt-1">Select a pathway from the Dot Plot, Results Table, or Network Graph to inspect its canonical GSEA curve.</p>
      </div>
    );
  }

  const isGsea = pathway.analysisMode === "GSEA";
  const curveData = pathway.gseaCurveData;

  const nes = pathway.nes ?? 0;
  const isUp = pathway.direction === "Upregulated" || nes >= 0;
  const accentColor = isUp ? "#ef4444" : "#3b82f6";
  const accentBg = isUp ? "bg-rose-500/10 border-rose-500/30 text-rose-300" : "bg-sky-500/10 border-sky-500/30 text-sky-300";

  const leadingEdgeGenes = pathway.leadingEdgeGenes || [];
  const geneDetails = pathway.geneExpressionDetails || [];
  const totalGenes = curveData?.totalTranscriptomeSize || pathway.contributingGenes?.length || 100;

  // Prepare plot data points
  const points = curveData?.curvePoints || [];
  const peakIndex = curveData?.peakIndex ?? 0;

  // Formatted chart data for Recharts
  const chartData = points.map((pt) => ({
    rankIndex: pt.rankIndex,
    runningES: Number(pt.runningES.toFixed(4)),
    rankMetric: Number(pt.rankMetric.toFixed(4)),
    symbol: pt.symbol || "",
    isHit: pt.isHit ? 1 : 0,
    isLeadingEdge: pt.isLeadingEdge ? 1 : 0
  }));

  // Highest absolute ES for Y-axis domain padding
  const maxAbsES = points.reduce((max, p) => Math.max(max, Math.abs(p.runningES)), 0.2);
  const esDomain: [number, number] = [-maxAbsES * 1.15, maxAbsES * 1.15];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col gap-6 shadow-2xl font-sans text-slate-100 relative">
      {/* Header Metadata Card */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800 pb-5">
        <div className="space-y-1 max-w-2xl">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xxs bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 px-2 py-0.5 rounded font-mono font-bold uppercase">
              {pathway.database}
            </span>
            <span className={`text-xxs px-2 py-0.5 rounded border font-mono font-bold ${accentBg}`}>
              {pathway.direction}
            </span>
            <span className="text-xxs text-slate-400 font-mono">
              {isGsea ? "GSEA Canonical Enrichment View" : "ORA Gene Set View"}
            </span>
          </div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <span>{pathway.pathwayName}</span>
            {pathway.externalUrl && (
              <a
                href={pathway.externalUrl}
                target="_blank"
                rel="noreferrer"
                className="text-slate-500 hover:text-teal-400 transition"
                title="Open External Database Link"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </h2>
          {pathway.description && (
            <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">{pathway.description}</p>
          )}
        </div>

        {/* Statistical Metrics Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center font-mono text-xs w-full md:w-auto">
          <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-xl">
            <span className="text-xxs text-slate-500 block uppercase">NES</span>
            <span className={`text-sm font-bold ${isUp ? "text-rose-400" : "text-sky-400"}`}>
              {pathway.nes !== undefined ? (pathway.nes > 0 ? `+${pathway.nes.toFixed(3)}` : pathway.nes.toFixed(3)) : "N/A"}
            </span>
          </div>
          <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-xl">
            <span className="text-xxs text-slate-500 block uppercase">BH FDR</span>
            <span className="text-sm font-bold text-teal-400">
              {pathway.adjPValue !== undefined ? pathway.adjPValue.toExponential(2) : "N/A"}
            </span>
          </div>
          <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-xl">
            <span className="text-xxs text-slate-500 block uppercase">Nominal P</span>
            <span className="text-sm font-bold text-slate-200">
              {pathway.pValue !== undefined ? pathway.pValue.toExponential(2) : "N/A"}
            </span>
          </div>
          <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-xl">
            <span className="text-xxs text-slate-500 block uppercase">Leading Edge</span>
            <span className="text-sm font-bold text-amber-400">
              {leadingEdgeGenes.length} / {pathway.geneSetSize || pathway.contributingGenes?.length || 0}
            </span>
          </div>
        </div>
      </div>

      {/* Main Canonical GSEA Multi-Panel Plot */}
      {isGsea && chartData.length > 0 ? (
        <div className="flex flex-col gap-4 font-mono">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-bold text-slate-200 flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Canonical GSEA Mountain Plot</span>
            </span>
            <span className="text-xxs text-slate-500">
              Ranked Transcriptome Size: <strong>{totalGenes.toLocaleString()} genes</strong>
            </span>
          </div>

          {/* Panel A: Running ES Curve */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col gap-1">
            <div className="flex justify-between items-center text-xxs text-slate-400 mb-1">
              <span>Running Enrichment Score (ES)</span>
              <span className="text-teal-400 font-bold">Peak ES = {pathway.enrichmentScore?.toFixed(4) ?? "N/A"} (Rank #{peakIndex})</span>
            </div>
            <div className="w-full h-52 relative">
              <ResponsiveContainer width="100%" height={208}>
                <AreaChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                  <defs>
                    <linearGradient id="esGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={accentColor} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={accentColor} stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="rankIndex" hide domain={[0, totalGenes - 1]} />
                  <YAxis
                    domain={esDomain}
                    stroke="#475569"
                    tick={{ fill: "#94a3b8", fontSize: 10 }}
                    width={45}
                  />
                  <ReferenceLine y={0} stroke="#64748b" strokeDasharray="3 3" />
                  <ReferenceLine x={peakIndex} stroke="#f59e0b" strokeDasharray="2 2" />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const pt = payload[0].payload;
                        return (
                          <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-xxs font-mono space-y-1 shadow-xl">
                            <div>Rank Position: <strong className="text-slate-200">#{pt.rankIndex}</strong></div>
                            <div>Running ES: <strong className="text-teal-400">{pt.runningES}</strong></div>
                            {pt.symbol && <div>Gene Symbol: <strong className="text-amber-300">{pt.symbol}</strong></div>}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="runningES"
                    stroke={accentColor}
                    strokeWidth={2}
                    fill="url(#esGradient)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Panel B: Gene-Set Member Barcode Hits */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-xxs text-slate-400">
              <span>Gene Set Member Hits Barcode ({pathway.contributingGenes?.length || 0} genes)</span>
              <span className="text-rose-400 font-bold">Leading Edge Region: Ranks #0 to #{peakIndex}</span>
            </div>
            {/* SVG Barcode Strip */}
            <div className="w-full h-8 bg-slate-900 border border-slate-800 rounded relative overflow-hidden">
              {curveData?.geneHitsIndices.map((rankIdx, i) => {
                const pct = (rankIdx / Math.max(1, totalGenes - 1)) * 100;
                const isLeading = rankIdx <= peakIndex;
                return (
                  <div
                    key={i}
                    style={{ left: `${pct}%` }}
                    className={`absolute top-0 bottom-0 w-0.5 ${
                      isLeading ? (isUp ? "bg-rose-500 z-10" : "bg-sky-500 z-10") : "bg-slate-500/60"
                    }`}
                    title={`Rank #${rankIdx}`}
                  />
                );
              })}
              {/* Highlight Peak Line */}
              <div
                style={{ left: `${(peakIndex / Math.max(1, totalGenes - 1)) * 100}%` }}
                className="absolute top-0 bottom-0 w-1 bg-amber-400 z-20 shadow-md"
                title={`Peak ES Position #${peakIndex}`}
              />
            </div>
          </div>

          {/* Panel C: Ranked Metric Distribution (log2FC / signed -log10 P) */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col gap-1">
            <div className="flex justify-between items-center text-xxs text-slate-400 mb-1">
              <span>Ranked Transcriptome Metric Distribution</span>
              <span className="text-slate-400 font-mono">Rank #0 (Top Pos) &rarr; Rank #{totalGenes - 1} (Top Neg)</span>
            </div>
            <div className="w-full h-24 relative">
              <ResponsiveContainer width="100%" height={96}>
                <AreaChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                  <XAxis dataKey="rankIndex" stroke="#475569" tick={{ fill: "#64748b", fontSize: 10 }} />
                  <YAxis stroke="#475569" tick={{ fill: "#64748b", fontSize: 10 }} width={45} />
                  <ReferenceLine y={0} stroke="#64748b" />
                  <Area
                    type="monotone"
                    dataKey="rankMetric"
                    stroke="#94a3b8"
                    fill="#334155"
                    fillOpacity={0.5}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl text-xxs text-slate-400 font-mono">
          <p>Over-Representation Analysis (ORA) mode evaluates overlap hypergeometric significance. GSEA running enrichment score mountain plot requires ranked transcriptome GSEA mode.</p>
        </div>
      )}

      {/* Leading Edge Genes Badge Grid */}
      <div className="space-y-3 border-t border-slate-800 pt-4 font-mono">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-amber-400" />
            <span>Core Leading-Edge Genes ({leadingEdgeGenes.length})</span>
          </span>
          <span className="text-xxs text-slate-500">Genes driving the enrichment signal</span>
        </div>

        <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-1">
          {geneDetails.map((g) => (
            <div
              key={g.symbol}
              className={`px-2.5 py-1 rounded-lg border text-xxs font-bold flex items-center gap-2 ${
                g.isLeadingEdge
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm"
                  : "bg-slate-950 text-slate-400 border-slate-800"
              }`}
            >
              <span>{g.symbol}</span>
              <span className={g.log2FC >= 0 ? "text-rose-400" : "text-sky-400"}>
                {g.log2FC >= 0 ? `+${g.log2FC.toFixed(2)}` : g.log2FC.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
