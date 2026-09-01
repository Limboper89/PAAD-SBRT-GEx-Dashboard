"use client";

import React, { useState, useRef, useMemo } from "react";
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

  // Balance top Upregulated and top Downregulated pathways in GSEA All-Directions mode
  const displayResults = useMemo(() => {
    if (!isGsea) {
      return [...results]
        .sort((a, b) => {
          if (a.adjPValue !== b.adjPValue) return a.adjPValue - b.adjPValue;
          return (b.foldEnrichment || 0) - (a.foldEnrichment || 0);
        })
        .slice(0, topCount);
    }

    const upList = results
      .filter((r) => r.direction === "Upregulated" || (r.nes !== undefined && r.nes > 0))
      .sort((a, b) => {
        if (a.adjPValue !== b.adjPValue) return a.adjPValue - b.adjPValue;
        return (b.nes || 0) - (a.nes || 0);
      });

    const downList = results
      .filter((r) => r.direction === "Downregulated" || (r.nes !== undefined && r.nes < 0))
      .sort((a, b) => {
        if (a.adjPValue !== b.adjPValue) return a.adjPValue - b.adjPValue;
        return (a.nes || 0) - (b.nes || 0); // Most negative first
      });

    if (upList.length > 0 && downList.length > 0) {
      const half = Math.floor(topCount / 2);
      const topUp = upList.slice(0, half);
      const topDown = downList.slice(0, topCount - topUp.length);
      return [...topUp, ...topDown].sort((a, b) => (b.nes || 0) - (a.nes || 0));
    }

    return [...results]
      .sort((a, b) => {
        if (a.adjPValue !== b.adjPValue) return a.adjPValue - b.adjPValue;
        return Math.abs(b.nes || 0) - Math.abs(a.nes || 0);
      })
      .slice(0, topCount);
  }, [results, isGsea, topCount]);

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

    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 54px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(isGsea ? "GSEA Pathway Enrichment Summary" : "Pathway Over-Representation Analysis (ORA)", 80, 80);

    ctx.fillStyle = isLight ? "#334155" : "#94a3b8";
    ctx.font = "bold 30px monospace";
    ctx.fillText(
      `Top ${displayResults.length} Enriched Pathways (${isGsea ? "Normalized Enrichment Score" : "Fold Enrichment"})`,
      80,
      130
    );

    const padLeft = 880;
    const padRight = 100;
    const padTop = 200;
    const padBottom = 240;

    const plotW = size - padLeft - padRight;
    const plotH = size - padTop - padBottom;

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

    ctx.strokeStyle = isLight ? "#f1f5f9" : "rgba(148, 163, 184, 0.08)";
    ctx.lineWidth = 1.5;

    for (let i = 0; i < displayResults.length; i++) {
      const y = padTop + i * rowH + rowH / 2;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + plotW, y);
      ctx.stroke();
    }

    if (isGsea) {
      const zeroX = getXCoord(0);
      ctx.strokeStyle = isLight ? "#94a3b8" : "#475569";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(zeroX, padTop);
      ctx.lineTo(zeroX, padTop + plotH);
      ctx.stroke();
    }

    chartData.forEach((d, idx) => {
      const y = padTop + idx * rowH + rowH / 2;
      const x = getXCoord(d.xValue);

      ctx.fillStyle = isLight ? "#0f172a" : "#f1f5f9";
      const fontSize = Math.min(38, Math.max(22, Math.round(rowH * 0.52)));
      ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
      ctx.textAlign = "right";

      const maxLen = 42;
      const displayName = d.fullName.length > maxLen ? d.fullName.slice(0, maxLen - 3) + "..." : d.fullName;
      ctx.fillText(displayName, padLeft - 26, y + fontSize * 0.35);

      const maxCount = Math.max(...chartData.map((cd) => cd.size), 20);
      const minCount = Math.min(...chartData.map((cd) => cd.size), 1);
      const normalizedSize = (d.size - minCount) / Math.max(1, maxCount - minCount);
      const radius = 16 + normalizedSize * 30;

      const isUp = d.direction === "Upregulated" || d.xValue >= 0;

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = isUp ? "rgba(220, 38, 38, 0.85)" : "rgba(37, 99, 235, 0.85)";
      ctx.fill();

      ctx.strokeStyle = isUp ? (isLight ? "#991b1b" : "#fca5a5") : (isLight ? "#1e40af" : "#93c5fd");
      ctx.lineWidth = 3.5;
      ctx.stroke();
    });

    ctx.strokeStyle = isLight ? "#0f172a" : "#64748b";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(padLeft, padTop + plotH);
    ctx.lineTo(padLeft + plotW, padTop + plotH);
    ctx.moveTo(padLeft, padTop);
    ctx.lineTo(padLeft, padTop + plotH);
    ctx.stroke();

    const numXTicks = 8;
    const xStep = (maxX - minX) / numXTicks;

    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 34px monospace";
    ctx.textAlign = "center";

    for (let i = 0; i <= numXTicks; i++) {
      const val = minX + i * xStep;
      const xPos = getXCoord(val);
      ctx.beginPath();
      ctx.moveTo(xPos, padTop + plotH);
      ctx.lineTo(xPos, padTop + plotH + 10);
      ctx.stroke();
      ctx.fillText(val.toFixed(2), xPos, padTop + plotH + 46);
    }

    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 42px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      isGsea ? "Normalized Enrichment Score (NES)" : "Fold Enrichment",
      padLeft + plotW / 2,
      padTop + plotH + 106
    );

    if (isGsea) {
      ctx.beginPath();
      ctx.arc(padLeft + 40, padTop + plotH + 128, 14, 0, 2 * Math.PI);
      ctx.fillStyle = "rgba(220, 38, 38, 0.9)";
      ctx.fill();
      ctx.strokeStyle = "#991b1b";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
      ctx.font = "bold 26px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("Upregulated in Phenotype", padLeft + 64, padTop + plotH + 135);

      ctx.beginPath();
      ctx.arc(padLeft + 450, padTop + plotH + 128, 14, 0, 2 * Math.PI);
      ctx.fillStyle = "rgba(37, 99, 235, 0.9)";
      ctx.fill();
      ctx.strokeStyle = "#1e40af";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillText("Downregulated in Phenotype", padLeft + 474, padTop + plotH + 135);
    }

    ctx.fillStyle = isLight ? "#475569" : "#94a3b8";
    ctx.font = "24px monospace";
    ctx.textAlign = "left";
    ctx.fillText(
      isGsea ? "• Bubble Area ∝ Leading-Edge Gene Count" : "• Bubble Area ∝ Overlapping Gene Count",
      isGsea ? padLeft + 900 : padLeft + 40,
      padTop + plotH + 135
    );

    return offscreen;
  };

  return (
    <div ref={chartRef} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col h-full min-h-[520px] shadow-xl font-sans">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <span>{isGsea ? "GSEA Enrichment Summary" : "ORA Enrichment Summary"}</span>
            <span className="text-xxs font-mono text-slate-400 font-normal">
              (Top {displayResults.length} Enriched Pathways)
            </span>
          </h3>
          <p className="text-xxs text-slate-400 font-mono mt-0.5">
            {isGsea
              ? "Normalized Enrichment Score (NES) • Statistical Significance • Leading-Edge Genes"
              : "Fold Enrichment • Hypergeometric Significance (BH FDR) • Overlapping DEGs"}
          </p>
        </div>

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
