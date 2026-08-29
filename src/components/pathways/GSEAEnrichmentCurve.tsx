"use client";

import React, { useRef } from "react";
import { PathwayEnrichmentResult } from "@/types/pathway";
import { CheckCircle2, ExternalLink, Zap, Info } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine } from "recharts";
import ExportButton from "@/components/ExportButton";
import { exportCanvasToPNG, exportCanvasToSVG, exportToCSV } from "@/utils/exportUtils";

interface GSEAEnrichmentCurveProps {
  pathway: PathwayEnrichmentResult | null;
  onClose?: () => void;
}

export default function GSEAEnrichmentCurve({ pathway, onClose }: GSEAEnrichmentCurveProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);


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

  const generateHighResGseaMountainCanvas = (theme: "light" | "dark" = "light", size: number = 2400): HTMLCanvasElement => {
    const offscreen = document.createElement("canvas");
    offscreen.width = size;
    offscreen.height = size;
    const ctx = offscreen.getContext("2d");
    if (!ctx) return offscreen;

    const isLight = theme === "light";

    // Background
    ctx.fillStyle = isLight ? "#ffffff" : "#020617";
    ctx.fillRect(0, 0, size, size);

    // Title
    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 46px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(pathway.pathwayName, 80, 80);

    ctx.fillStyle = isLight ? "#334155" : "#94a3b8";
    ctx.font = "bold 24px monospace";
    ctx.fillText(
      `Database: ${pathway.database} | NES: ${pathway.nes !== undefined ? (pathway.nes > 0 ? "+" + pathway.nes.toFixed(3) : pathway.nes.toFixed(3)) : "N/A"} | FDR: ${pathway.adjPValue ? pathway.adjPValue.toExponential(2) : "N/A"} | Leading Edge: ${leadingEdgeGenes.length} genes`,
      80,
      122
    );

    const padLeft = 180;
    const padRight = 80;
    const plotW = size - padLeft - padRight;

    const nPoints = chartData.length;
    const maxRank = nPoints > 0 ? chartData[nPoints - 1].rankIndex : totalGenes;

    const getX = (rank: number) => padLeft + (rank / Math.max(1, maxRank)) * plotW;

    // --- PANEL A: Mountain Plot (y: 180 to 1100, height 920) ---
    const panelATop = 180;
    const panelAH = 920;

    ctx.fillStyle = isLight ? "#f8fafc" : "#0f172a";
    ctx.fillRect(padLeft, panelATop, plotW, panelAH);
    ctx.strokeStyle = isLight ? "#cbd5e1" : "#1e293b";
    ctx.lineWidth = 2;
    ctx.strokeRect(padLeft, panelATop, plotW, panelAH);

    const minES = esDomain[0];
    const maxES = esDomain[1];
    const getESY = (es: number) => panelATop + ((maxES - es) / (maxES - minES)) * panelAH;
    const zeroY = getESY(0);

    // Zero line
    ctx.strokeStyle = isLight ? "#94a3b8" : "#475569";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(padLeft, zeroY);
    ctx.lineTo(padLeft + plotW, zeroY);
    ctx.stroke();

    // ES Mountain Area + Line
    if (chartData.length > 0) {
      const areaGrad = ctx.createLinearGradient(0, panelATop, 0, panelATop + panelAH);
      if (isUp) {
        areaGrad.addColorStop(0, "rgba(220, 38, 38, 0.45)");
        areaGrad.addColorStop(1, "rgba(220, 38, 38, 0.02)");
      } else {
        areaGrad.addColorStop(0, "rgba(37, 99, 235, 0.02)");
        areaGrad.addColorStop(1, "rgba(37, 99, 235, 0.45)");
      }

      ctx.beginPath();
      ctx.moveTo(getX(chartData[0].rankIndex), zeroY);
      chartData.forEach((d) => {
        ctx.lineTo(getX(d.rankIndex), getESY(d.runningES));
      });
      ctx.lineTo(getX(chartData[chartData.length - 1].rankIndex), zeroY);
      ctx.closePath();
      ctx.fillStyle = areaGrad;
      ctx.fill();

      // Stroke
      ctx.beginPath();
      chartData.forEach((d, i) => {
        const x = getX(d.rankIndex);
        const y = getESY(d.runningES);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = isUp ? "#dc2626" : "#2563eb";
      ctx.lineWidth = 4.5;
      ctx.stroke();

      // Peak line
      const peakX = getX(peakIndex);
      const peakY = getESY(pathway.enrichmentScore ?? 0);
      ctx.strokeStyle = "rgba(245, 158, 11, 0.9)";
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(peakX, panelATop);
      ctx.lineTo(peakX, panelATop + panelAH);
      ctx.stroke();
      ctx.setLineDash([]);

      // Peak label
      ctx.fillStyle = "#d97706";
      ctx.font = "bold 24px monospace";
      ctx.textAlign = isUp ? "left" : "right";
      const peakLabelX = isUp ? peakX + 15 : peakX - 15;
      ctx.fillText(`Peak ES = ${pathway.enrichmentScore?.toFixed(4)} (Rank #${peakIndex})`, peakLabelX, peakY - 15);
    }

    // Panel A Y Axis label
    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 30px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.save();
    ctx.translate(65, panelATop + panelAH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("Enrichment Score (ES)", 0, 0);
    ctx.restore();

    // --- PANEL B: Hit Barcode Strip (y: 1150 to 1350, height 200) ---
    const panelBTop = 1150;
    const panelBH = 200;

    ctx.fillStyle = isLight ? "#f8fafc" : "#0f172a";
    ctx.fillRect(padLeft, panelBTop, plotW, panelBH);
    ctx.strokeStyle = isLight ? "#cbd5e1" : "#1e293b";
    ctx.lineWidth = 2;
    ctx.strokeRect(padLeft, panelBTop, plotW, panelBH);

    chartData.forEach((d) => {
      if (d.isHit) {
        const x = getX(d.rankIndex);
        ctx.strokeStyle = d.isLeadingEdge ? (isUp ? "#dc2626" : "#2563eb") : (isLight ? "#334155" : "#94a3b8");
        ctx.lineWidth = d.isLeadingEdge ? 3.5 : 2;
        ctx.beginPath();
        ctx.moveTo(x, panelBTop + 8);
        ctx.lineTo(x, panelBTop + panelBH - 8);
        ctx.stroke();
      }
    });

    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 28px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.save();
    ctx.translate(65, panelBTop + panelBH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("Hits", 0, 0);
    ctx.restore();

    // --- PANEL C: Ranked Metric (y: 1400 to 2050, height 650) ---
    const panelCTop = 1400;
    const panelCH = 650;

    ctx.fillStyle = isLight ? "#f8fafc" : "#0f172a";
    ctx.fillRect(padLeft, panelCTop, plotW, panelCH);
    ctx.strokeStyle = isLight ? "#cbd5e1" : "#1e293b";
    ctx.lineWidth = 2;
    ctx.strokeRect(padLeft, panelCTop, plotW, panelCH);

    const minMetric = chartData.length > 0 ? Math.min(...chartData.map((d) => d.rankMetric)) : -5;
    const maxMetric = chartData.length > 0 ? Math.max(...chartData.map((d) => d.rankMetric)) : 5;
    const getMetricY = (m: number) => panelCTop + ((maxMetric - m) / (maxMetric - minMetric)) * panelCH;
    const zeroMetricY = getMetricY(0);

    // Zero Metric Line
    ctx.strokeStyle = isLight ? "#94a3b8" : "#475569";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(padLeft, zeroMetricY);
    ctx.lineTo(padLeft + plotW, zeroMetricY);
    ctx.stroke();

    // Ranked Metric Area + Line
    if (chartData.length > 0) {
      ctx.beginPath();
      chartData.forEach((d, i) => {
        const x = getX(d.rankIndex);
        const y = getMetricY(d.rankMetric);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = isLight ? "#475569" : "#94a3b8";
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 28px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.save();
    ctx.translate(65, panelCTop + panelCH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("Rank Metric", 0, 0);
    ctx.restore();

    // Bottom X Axis (Ranks)
    const numXTicks = 8;
    const rankStep = Math.round(maxRank / numXTicks);
    ctx.font = "bold 26px monospace";
    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.textAlign = "center";

    for (let i = 0; i <= numXTicks; i++) {
      const r = i * rankStep;
      const xPos = getX(r);
      ctx.beginPath();
      ctx.moveTo(xPos, panelCTop + panelCH);
      ctx.lineTo(xPos, panelCTop + panelCH + 8);
      ctx.stroke();
      ctx.fillText(r.toLocaleString(), xPos, panelCTop + panelCH + 38);
    }

    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 32px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Rank in Ordered Gene List", padLeft + plotW / 2, panelCTop + panelCH + 95);

    return offscreen;
  };

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
        <div ref={chartContainerRef} className="flex flex-col gap-4 font-mono bg-slate-900 p-2 rounded-xl">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-200 flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>Canonical GSEA Mountain Plot</span>
              </span>
              <span className="text-xxs text-slate-500">
                ({totalGenes.toLocaleString()} genes)
              </span>
            </div>
            
            <ExportButton
              onExportCSV={() => {
                exportToCSV({
                  filename: `GSEA_Curve_${pathway.pathwayName.replace(/[^a-zA-Z0-9]/g, "_")}.csv`,
                  metadata: {
                    dataset: pathway.database,
                    module: "GSEA Enrichment Curve",
                    pathway: pathway.pathwayName,
                    nes: String(pathway.nes ?? "N/A"),
                    fdr: String(pathway.adjPValue ?? "N/A"),
                  },
                  headers: ["Rank", "Gene Symbol", "Running ES", "Rank Metric", "Is Hit", "Is Leading Edge"],
                  rows: chartData.map((d) => [d.rankIndex, d.symbol, d.runningES, d.rankMetric, d.isHit, d.isLeadingEdge]),
                });
              }}
              onExportPNG={({ theme = "light" } = {}) => {
                const exportCanvas = generateHighResGseaMountainCanvas(theme, 2400);
                exportCanvasToPNG({
                  canvas: exportCanvas,
                  filename: `GSEA_Mountain_${pathway.pathwayName.replace(/[^a-zA-Z0-9]/g, "_")}.png`,
                  theme,
                });
              }}
              onExportSVG={({ theme = "light" } = {}) => {
                const exportCanvas = generateHighResGseaMountainCanvas(theme, 1200);
                exportCanvasToSVG({
                  canvas: exportCanvas,
                  filename: `GSEA_Mountain_${pathway.pathwayName.replace(/[^a-zA-Z0-9]/g, "_")}.svg`,
                  theme,
                });
              }}
            />
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
