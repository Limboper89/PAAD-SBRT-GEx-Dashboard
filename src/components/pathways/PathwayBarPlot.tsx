"use client";

import React, { useRef, useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts";
import { PathwayEnrichmentResult } from "@/types/pathway";
import ExportButton from "@/components/ExportButton";
import { exportCanvasToPNG, exportCanvasToSVG, exportToCSV } from "@/utils/exportUtils";

interface PathwayBarPlotProps {
  results: PathwayEnrichmentResult[];
  onSelectPathway: (pathway: PathwayEnrichmentResult) => void;
  analysisMode: "ORA" | "GSEA";
}

function CustomBarTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { rawResult: PathwayEnrichmentResult } }> }) {
  if (active && payload && payload.length && payload[0].payload) {
    const r: PathwayEnrichmentResult = payload[0].payload.rawResult;
    const isGsea = r.analysisMode === "GSEA";
    return (
      <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl shadow-2xl text-xs font-mono max-w-xs space-y-1">
        <p className="font-bold text-slate-100">{r.pathwayName}</p>
        <div className="text-xxs text-slate-400 space-y-0.5">
          <div>Database: <span className="text-teal-400 font-bold">{r.database}</span></div>
          <div>
            {isGsea ? "NES:" : "Fold Enrichment:"}{" "}
            <span className="text-amber-400 font-bold">
              {isGsea ? r.nes?.toFixed(3) : (r.foldEnrichment ? r.foldEnrichment.toFixed(2) + "x" : "N/A")}
            </span>
          </div>
          <div>BH FDR: <span className="text-teal-400 font-bold">{r.adjPValue.toExponential(2)}</span></div>
        </div>
      </div>
    );
  }
  return null;
}

export default function PathwayBarPlot({
  results,
  onSelectPathway,
  analysisMode
}: PathwayBarPlotProps) {
  const chartRef = useRef<HTMLDivElement>(null);

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[350px] bg-slate-900/40 border border-slate-800 rounded-2xl p-6 text-center text-slate-500 font-mono text-xs">
        <p>No enriched pathways available for bar plot display.</p>
      </div>
    );
  }

  const isGsea = analysisMode === "GSEA";

  const displayResults = useMemo(() => {
    if (!isGsea) {
      return [...results]
        .sort((a, b) => (b.foldEnrichment || 0) - (a.foldEnrichment || 0))
        .slice(0, 15);
    }

    const upList = results
      .filter((r) => r.direction === "Upregulated" || (r.nes !== undefined && r.nes > 0))
      .sort((a, b) => (b.nes || 0) - (a.nes || 0));

    const downList = results
      .filter((r) => r.direction === "Downregulated" || (r.nes !== undefined && r.nes < 0))
      .sort((a, b) => (a.nes || 0) - (b.nes || 0));

    if (upList.length > 0 && downList.length > 0) {
      const topUp = upList.slice(0, 8);
      const topDown = downList.slice(0, 15 - topUp.length);
      return [...topUp, ...topDown].sort((a, b) => (b.nes || 0) - (a.nes || 0));
    }

    return [...results]
      .sort((a, b) => Math.abs(b.nes || 0) - Math.abs(a.nes || 0))
      .slice(0, 15);
  }, [results, isGsea]);

  const chartData = displayResults.map((r, idx) => {
    const rawMetric = isGsea ? (r.nes ?? 0) : (r.foldEnrichment ?? 1.0);
    const metric = Number.isFinite(rawMetric) ? rawMetric : 1.0;

    return {
      id: r.pathwayId || `bar-${idx}`,
      name: r.pathwayName.length > 34 ? r.pathwayName.slice(0, 32) + "..." : r.pathwayName,
      fullName: r.pathwayName,
      metric,
      fdr: Number.isFinite(r.adjPValue) ? r.adjPValue : 1.0,
      direction: r.direction,
      rawResult: r
    };
  });

  const generateHighResBarCanvas = (theme: "light" | "dark" = "light", size: number = 2400): HTMLCanvasElement => {
    const offscreen = document.createElement("canvas");
    offscreen.width = size;
    offscreen.height = size;
    const ctx = offscreen.getContext("2d");
    if (!ctx) return offscreen;

    const isLight = theme === "light";

    ctx.fillStyle = isLight ? "#ffffff" : "#020617";
    ctx.fillRect(0, 0, size, size);

    // Title
    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 54px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Pathway Enrichment Ranking", 80, 80);

    ctx.fillStyle = isLight ? "#334155" : "#94a3b8";
    ctx.font = "bold 30px monospace";
    ctx.fillText(`Top ${displayResults.length} Enriched Pathways (${isGsea ? "Normalized Enrichment Score" : "Fold Enrichment"})`, 80, 130);

    const padLeft = 880;
    const padRight = 240;
    const padTop = 200;
    const padBottom = 220;

    const plotW = size - padLeft - padRight;
    const plotH = size - padTop - padBottom;

    const metrics = chartData.map((d) => d.metric);
    let minVal = Math.min(0, ...metrics);
    let maxVal = Math.max(...metrics);
    if (isGsea) {
      const maxAbs = Math.max(Math.abs(minVal), Math.abs(maxVal), 1.5);
      minVal = -maxAbs * 1.15;
      maxVal = maxAbs * 1.15;
    } else {
      minVal = 0;
      maxVal = Math.ceil(maxVal * 1.15);
    }

    const getX = (val: number) => padLeft + ((val - minVal) / (maxVal - minVal)) * plotW;
    const zeroX = getX(0);

    const rowH = plotH / displayResults.length;
    const barH = rowH * 0.65;

    // Draw Grid & Bars
    chartData.forEach((d, idx) => {
      const y = padTop + idx * rowH + (rowH - barH) / 2;
      const barX = Math.min(zeroX, getX(d.metric));
      const barW = Math.max(4, Math.abs(getX(d.metric) - zeroX));

      // Pathway name
      ctx.fillStyle = isLight ? "#0f172a" : "#f1f5f9";
      const fontSize = Math.min(38, Math.max(22, Math.round(rowH * 0.52)));
      ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
      ctx.textAlign = "right";

      const maxLen = 42;
      const displayName = d.fullName.length > maxLen ? d.fullName.slice(0, maxLen - 3) + "..." : d.fullName;
      ctx.fillText(displayName, padLeft - 26, y + barH * 0.72);

      const isUp = d.direction === "Upregulated" || d.metric >= 0;

      // Bar Fill
      ctx.fillStyle = isUp ? "rgba(220, 38, 38, 0.85)" : "rgba(37, 99, 235, 0.85)";
      ctx.fillRect(barX, y, barW, barH);

      ctx.strokeStyle = isUp ? (isLight ? "#991b1b" : "#fca5a5") : (isLight ? "#1e40af" : "#93c5fd");
      ctx.lineWidth = 2.5;
      ctx.strokeRect(barX, y, barW, barH);

      // Value label at end of bar
      ctx.fillStyle = isLight ? "#0f172a" : "#cbd5e1";
      ctx.font = "bold 28px monospace";
      ctx.textAlign = d.metric >= 0 ? "left" : "right";
      const labelX = d.metric >= 0 ? getX(d.metric) + 16 : getX(d.metric) - 16;
      ctx.fillText(`${d.metric > 0 ? "+" : ""}${d.metric.toFixed(2)} (q=${d.fdr.toExponential(1)})`, labelX, y + barH * 0.7);
    });

    // Zero line
    ctx.strokeStyle = isLight ? "#0f172a" : "#64748b";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(zeroX, padTop);
    ctx.lineTo(zeroX, padTop + plotH);
    ctx.stroke();

    // X Axis ticks
    const numTicks = 8;
    const step = (maxVal - minVal) / numTicks;
    ctx.font = "bold 34px monospace";
    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.textAlign = "center";

    for (let i = 0; i <= numTicks; i++) {
      const val = minVal + i * step;
      const xPos = getX(val);
      ctx.beginPath();
      ctx.moveTo(xPos, padTop + plotH);
      ctx.lineTo(xPos, padTop + plotH + 10);
      ctx.stroke();
      ctx.fillText(val.toFixed(2), xPos, padTop + plotH + 46);
    }

    // X Axis Title
    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 42px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      isGsea ? "Normalized Enrichment Score (NES)" : "Fold Enrichment",
      padLeft + plotW / 2,
      padTop + plotH + 115
    );

    return offscreen;
  };

  return (
    <div ref={chartRef} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col h-full min-h-[500px] shadow-xl">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-100">Enrichment Bar Plot</h3>
          <p className="text-xxs text-slate-400 font-mono mt-0.5">
            Ranked by {isGsea ? "Normalized Enrichment Score (NES)" : "Fold Enrichment"} &bull; Top {displayResults.length} Pathways
          </p>
        </div>

        <ExportButton
          onExportCSV={() => {
            exportToCSV({
              filename: `Pathway_BarPlot_${analysisMode}.csv`,
              metadata: {
                module: "Pathway Bar Plot",
                mode: analysisMode,
                totalPathways: String(displayResults.length),
              },
              headers: ["Pathway ID", "Pathway Name", "Database", isGsea ? "NES" : "Fold Enrichment", "BH FDR"],
              rows: displayResults.map((r) => [
                r.pathwayId,
                r.pathwayName,
                r.database,
                isGsea ? (r.nes ?? "N/A") : (r.foldEnrichment ?? "N/A"),
                r.adjPValue.toExponential(4),
              ]),
            });
          }}
          onExportPNG={({ theme = "light" } = {}) => {
            const exportCanvas = generateHighResBarCanvas(theme, 2400);
            exportCanvasToPNG({
              canvas: exportCanvas,
              filename: `Pathway_BarPlot_${analysisMode}.png`,
              theme,
            });
          }}
          onExportSVG={({ theme = "light" } = {}) => {
            const exportCanvas = generateHighResBarCanvas(theme, 1200);
            exportCanvasToSVG({
              canvas: exportCanvas,
              filename: `Pathway_BarPlot_${analysisMode}.svg`,
              theme,
            });
          }}
        />
      </div>

      <div className="w-full h-[440px] min-h-[440px] relative">
        <ResponsiveContainer width="100%" height={440}>
          <BarChart
            layout="vertical"
            data={chartData}
            margin={{ top: 15, right: 35, bottom: 45, left: 190 }}
          >
            <XAxis
              type="number"
              stroke="#64748b"
              tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "monospace" }}
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
              stroke="#64748b"
              tick={{ fill: "#cbd5e1", fontSize: 11 }}
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
            <Tooltip content={<CustomBarTooltip />} />
            <Bar
              dataKey="metric"
              radius={[0, 4, 4, 0]}
              onClick={(entry) => {
                const item = entry as { rawResult?: PathwayEnrichmentResult };
                if (item && item.rawResult) {
                  onSelectPathway(item.rawResult);
                }
              }}
              className="cursor-pointer"
            >
              {chartData.map((entry) => {
                let color = "#14b8a6";
                if (entry.direction === "Upregulated") color = "#ef4444";
                else if (entry.direction === "Downregulated") color = "#3b82f6";
                return <Cell key={`bar-${entry.id}`} fill={color} fillOpacity={0.8} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
