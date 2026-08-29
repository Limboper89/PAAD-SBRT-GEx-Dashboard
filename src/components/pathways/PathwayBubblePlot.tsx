"use client";

import React, { useState, useRef } from "react";
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, Cell, ReferenceLine } from "recharts";
import { PathwayEnrichmentResult } from "@/types/pathway";
import ExportButton from "@/components/ExportButton";
import { exportCanvasToPNG, exportCanvasToSVG, exportToCSV } from "@/utils/exportUtils";

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
  const chartRef = useRef<HTMLDivElement>(null);

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

  const generateHighResBubbleCanvas = (theme: "light" | "dark" = "light", size: number = 2400): HTMLCanvasElement => {
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
    ctx.fillText("GSEA Pathway Enrichment Summary", 80, 80);

    ctx.fillStyle = isLight ? "#334155" : "#94a3b8";
    ctx.font = "bold 24px monospace";
    ctx.fillText(`Top ${displayResults.length} Enriched Pathways (${isGsea ? "Normalized Enrichment Score" : "Fold Enrichment"})`, 80, 122);

    const padLeft = 840; // Generous space for pathway names on the left
    const padRight = 100;
    const padTop = 180;
    const padBottom = 220;

    const plotW = size - padLeft - padRight;
    const plotH = size - padTop - padBottom;

    // Calculate X-axis bounds
    const xValues = chartData.map((d) => d.xValue);
    let minX = Math.min(...xValues);
    let maxX = Math.max(...xValues);

    if (isGsea) {
      const maxAbs = Math.max(Math.abs(minX), Math.abs(maxX), 1.5);
      minX = -maxAbs * 1.15;
      maxX = maxAbs * 1.15;
    } else {
      minX = Math.max(0, Math.floor(minX * 0.9));
      maxX = Math.ceil(maxX * 1.1);
    }

    const getXCoord = (val: number) => {
      return padLeft + ((val - minX) / (maxX - minX)) * plotW;
    };

    const rowH = plotH / displayResults.length;

    // Draw Grid Lines
    ctx.strokeStyle = isLight ? "#f1f5f9" : "rgba(148, 163, 184, 0.08)";
    ctx.lineWidth = 1.5;

    // Horizontal Row Lines
    for (let i = 0; i < displayResults.length; i++) {
      const y = padTop + i * rowH + rowH / 2;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + plotW, y);
      ctx.stroke();
    }

    // Zero / baseline line if GSEA
    if (isGsea) {
      const zeroX = getXCoord(0);
      ctx.strokeStyle = isLight ? "#94a3b8" : "#475569";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(zeroX, padTop);
      ctx.lineTo(zeroX, padTop + plotH);
      ctx.stroke();
    }

    // Draw Pathway Names and Bubbles
    chartData.forEach((d, idx) => {
      const y = padTop + idx * rowH + rowH / 2;
      const x = getXCoord(d.xValue);

      // Pathway name text (Bold Dark Slate/Black in Light Mode)
      ctx.fillStyle = isLight ? "#0f172a" : "#f1f5f9";
      const fontSize = Math.min(32, Math.max(18, Math.round(rowH * 0.48)));
      ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
      ctx.textAlign = "right";

      const maxLen = 42;
      const displayName = d.fullName.length > maxLen ? d.fullName.slice(0, maxLen - 3) + "..." : d.fullName;
      ctx.fillText(displayName, padLeft - 24, y + fontSize * 0.35);

      // Bubble size
      const maxCount = Math.max(...chartData.map((cd) => cd.size), 20);
      const minCount = Math.min(...chartData.map((cd) => cd.size), 1);
      const normalizedSize = (d.size - minCount) / Math.max(1, maxCount - minCount);
      const radius = 14 + normalizedSize * 26;

      const isUp = d.direction === "Upregulated" || d.xValue >= 0;

      // Bubble fill
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = isUp ? "rgba(220, 38, 38, 0.85)" : "rgba(37, 99, 235, 0.85)";
      ctx.fill();

      // Bubble stroke
      ctx.strokeStyle = isUp ? (isLight ? "#991b1b" : "#fca5a5") : (isLight ? "#1e40af" : "#93c5fd");
      ctx.lineWidth = 3;
      ctx.stroke();
    });

    // Outer Axis Frame (X Axis)
    ctx.strokeStyle = isLight ? "#0f172a" : "#64748b";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(padLeft, padTop + plotH);
    ctx.lineTo(padLeft + plotW, padTop + plotH);
    ctx.moveTo(padLeft, padTop);
    ctx.lineTo(padLeft, padTop + plotH);
    ctx.stroke();

    // X-Axis Ticks & Labels
    const numXTicks = 8;
    const xStep = (maxX - minX) / numXTicks;

    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 26px monospace";
    ctx.textAlign = "center";

    for (let i = 0; i <= numXTicks; i++) {
      const val = minX + i * xStep;
      const xPos = getXCoord(val);
      ctx.beginPath();
      ctx.moveTo(xPos, padTop + plotH);
      ctx.lineTo(xPos, padTop + plotH + 8);
      ctx.stroke();
      ctx.fillText(val.toFixed(2), xPos, padTop + plotH + 38);
    }

    // X-Axis Title
    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 32px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      isGsea ? "Normalized Enrichment Score (NES)" : "Fold Enrichment",
      padLeft + plotW / 2,
      padTop + plotH + 95
    );

    // Bottom Legend
    const legY = size - 70;
    ctx.font = "bold 24px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "left";

    // Red dot for Upregulated
    ctx.beginPath();
    ctx.arc(padLeft + 40, legY, 14, 0, 2 * Math.PI);
    ctx.fillStyle = "rgba(220, 38, 38, 0.85)";
    ctx.fill();
    ctx.strokeStyle = "#991b1b";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = isLight ? "#0f172a" : "#cbd5e1";
    ctx.fillText("Upregulated in Phenotype", padLeft + 65, legY + 8);

    // Blue dot for Downregulated
    ctx.beginPath();
    ctx.arc(padLeft + 420, legY, 14, 0, 2 * Math.PI);
    ctx.fillStyle = "rgba(37, 99, 235, 0.85)";
    ctx.fill();
    ctx.strokeStyle = "#1e40af";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillText("Downregulated in Phenotype", padLeft + 445, legY + 7);

    // Bubble size text
    ctx.fillStyle = isLight ? "#475569" : "#94a3b8";
    ctx.font = "18px monospace";
    ctx.fillText("• Bubble Area ∝ Leading-Edge Gene Count", padLeft + 800, legY + 6);

    return offscreen;
  };

  return (
    <div ref={chartRef} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col h-full min-h-[520px] shadow-xl font-sans">
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

        {/* Top Count Selector and Export */}
        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="flex items-center gap-2">
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
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {cnt}
                </button>
              ))}
            </div>
          </div>

          <ExportButton
            onExportCSV={() => {
              exportToCSV({
                filename: `Pathway_BubblePlot_${analysisMode}.csv`,
                metadata: {
                  module: "Pathway Bubble Plot",
                  mode: analysisMode,
                  totalPathways: String(displayResults.length),
                },
                headers: ["Pathway ID", "Pathway Name", "Database", isGsea ? "NES" : "Fold Enrichment", "BH FDR", "Nominal P", isGsea ? "Leading-Edge Count" : "Overlap Count"],
                rows: displayResults.map((r) => [
                  r.pathwayId,
                  r.pathwayName,
                  r.database,
                  isGsea ? (r.nes ?? "N/A") : (r.foldEnrichment ?? "N/A"),
                  r.adjPValue.toExponential(4),
                  r.pValue.toExponential(4),
                  isGsea ? (r.leadingEdgeCount ?? "N/A") : r.overlapCount,
                ]),
              });
            }}
            onExportPNG={({ theme = "light" } = {}) => {
              const exportCanvas = generateHighResBubbleCanvas(theme, 2400);
              exportCanvasToPNG({
                canvas: exportCanvas,
                filename: `Pathway_BubblePlot_${analysisMode}.png`,
                theme,
              });
            }}
            onExportSVG={({ theme = "light" } = {}) => {
              const exportCanvas = generateHighResBubbleCanvas(theme, 1200);
              exportCanvasToSVG({
                canvas: exportCanvas,
                filename: `Pathway_BubblePlot_${analysisMode}.svg`,
                theme,
              });
            }}
          />
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
