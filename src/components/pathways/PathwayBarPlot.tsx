"use client";

import React, { useRef, useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts";
import { PathwayEnrichmentResult } from "@/types/pathway";
import { getContrastDisplayInfo, calculateNiceTicks, formatTickValue } from "@/utils/pathwayEngine";
import ExportButton from "@/components/ExportButton";
import { exportCanvasToPNG, exportCanvasToSVG, exportToCSV, PUB_FONT_SANS, PUB_FONT_NUM, drawFittedText } from "@/utils/exportUtils";

interface PathwayBarPlotProps {
  results: PathwayEnrichmentResult[];
  onSelectPathway: (pathway: PathwayEnrichmentResult) => void;
  analysisMode: "ORA" | "GSEA";
  datasetName?: string;
  comparisonLabel?: string;
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
  analysisMode,
  datasetName,
  comparisonLabel
}: PathwayBarPlotProps) {
  const chartRef = useRef<HTMLDivElement>(null);

  const contrast = useMemo(() => {
    return getContrastDisplayInfo(
      comparisonLabel || results[0]?.comparisonLabel,
      datasetName || results[0]?.datasetName,
      results[0]?.datasetId
    );
  }, [comparisonLabel, datasetName, results]);

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

    // Main Title: Contrast & Analysis Method (GEPIA2-calibrated)
    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.textAlign = "left";
    drawFittedText(ctx, `${contrast.shortTitle} (${isGsea ? "GSEA" : "ORA"})`, 80, 110, size - 160, 98, "bold", PUB_FONT_SANS);

    // Subtitle: Cohort name according to data
    ctx.fillStyle = isLight ? "#334155" : "#94a3b8";
    drawFittedText(
      ctx,
      `Cohort: ${contrast.datasetName} (${contrast.fullContrast}) · Top ${displayResults.length} Pathways`,
      80,
      180,
      size - 160,
      54,
      "bold",
      PUB_FONT_NUM
    );

    const padLeft = 1000;
    const padRight = 350;
    const padTop = 235;
    const padBottom = 420;

    const plotW = size - padLeft - padRight;
    const plotH = size - padTop - padBottom;
    const axisY = padTop + plotH;

    const metrics = chartData.map((d) => d.metric);
    const rawMin = Math.min(...metrics);
    const rawMax = Math.max(...metrics);

    const tickInfo = calculateNiceTicks(rawMin, rawMax, isGsea);
    const minVal = tickInfo.min;
    const maxVal = tickInfo.max;

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
      const fontSize = Math.min(56, Math.max(40, Math.round(rowH * 0.6)));
      ctx.textAlign = "right";

      const maxLen = 36;
      const displayName = d.fullName.length > maxLen ? d.fullName.slice(0, maxLen - 3) + "..." : d.fullName;
      drawFittedText(ctx, displayName, padLeft - 28, y + barH * 0.74, padLeft - 70, fontSize, "bold", PUB_FONT_SANS, 32);

      const isUp = d.direction === "Upregulated" || d.metric >= 0;

      // Bar Fill
      ctx.fillStyle = isUp ? "rgba(220, 38, 38, 0.85)" : "rgba(37, 99, 235, 0.85)";
      ctx.fillRect(barX, y, barW, barH);

      ctx.strokeStyle = isUp ? (isLight ? "#991b1b" : "#fca5a5") : (isLight ? "#1e40af" : "#93c5fd");
      ctx.lineWidth = 3.5;
      ctx.strokeRect(barX, y, barW, barH);

      // Value label at end of bar
      ctx.fillStyle = isLight ? "#0f172a" : "#cbd5e1";
      ctx.font = `bold 44px ${PUB_FONT_NUM}`;
      ctx.textAlign = d.metric >= 0 ? "left" : "right";
      const labelX = d.metric >= 0 ? getX(d.metric) + 18 : getX(d.metric) - 18;
      ctx.fillText(`${d.metric > 0 ? "+" : ""}${d.metric.toFixed(2)} (q=${d.fdr.toExponential(1)})`, labelX, y + barH * 0.74);
    });

    // Zero line
    ctx.strokeStyle = isLight ? "#0f172a" : "#64748b";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(zeroX, padTop);
    ctx.lineTo(zeroX, axisY);
    ctx.stroke();

    // Axis Border Lines
    ctx.beginPath();
    ctx.moveTo(padLeft, axisY);
    ctx.lineTo(padLeft + plotW, axisY);
    ctx.stroke();

    // Clean Integer / Half Ticks (GEPIA2-calibrated)
    ctx.font = `bold 66px ${PUB_FONT_NUM}`;
    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.textAlign = "center";

    tickInfo.ticks.forEach((val) => {
      const xPos = getX(val);
      ctx.beginPath();
      ctx.moveTo(xPos, axisY);
      ctx.lineTo(xPos, axisY + 18);
      ctx.stroke();
      ctx.fillText(formatTickValue(val), xPos, axisY + 80);
    });

    // X Axis Title
    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.textAlign = "center";
    drawFittedText(
      ctx,
      isGsea
        ? "Rank-Sum Enrichment Z-Score (Z_GSEA)"
        : `Fold Enrichment (${contrast.shortTitle})`,
      padLeft + plotW / 2,
      axisY + 178,
      plotW + 300,
      74,
      "bold",
      PUB_FONT_SANS
    );

    // Dedicated Full-Width Legend Container Box
    const legBoxX = 80;
    const legBoxW = size - 160;
    const legBoxY = axisY + 235;
    const legBoxH = 114;
    const midY = legBoxY + 58;

    ctx.fillStyle = isLight ? "#f8fafc" : "#0b1329";
    ctx.strokeStyle = isLight ? "#cbd5e1" : "#1e293b";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.roundRect(legBoxX, legBoxY, legBoxW, legBoxH, 14);
    ctx.fill();
    ctx.stroke();

    if (isGsea) {
      ctx.fillStyle = "rgba(37, 99, 235, 0.9)";
      ctx.fillRect(legBoxX + 40, midY - 18, 36, 36);
      ctx.strokeStyle = "#1e40af";
      ctx.lineWidth = 3;
      ctx.strokeRect(legBoxX + 40, midY - 18, 36, 36);

      ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
      ctx.textAlign = "left";
      drawFittedText(ctx, contrast.negLegend, legBoxX + 92, midY + 16, 650, 46, "bold", PUB_FONT_SANS, 32);

      const midColX = legBoxX + 780;
      ctx.fillStyle = "rgba(220, 38, 38, 0.9)";
      ctx.fillRect(midColX, midY - 18, 36, 36);
      ctx.strokeStyle = "#991b1b";
      ctx.lineWidth = 3;
      ctx.strokeRect(midColX, midY - 18, 36, 36);

      ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
      drawFittedText(ctx, contrast.posLegend, midColX + 52, midY + 16, 650, 46, "bold", PUB_FONT_SANS, 32);

      ctx.fillStyle = isLight ? "#334155" : "#cbd5e1";
      ctx.textAlign = "right";
      drawFittedText(ctx, "Bar = |Z_GSEA| · q = FDR", legBoxX + legBoxW - 40, midY + 15, 650, 44, "bold", PUB_FONT_NUM, 32);
    } else {
      ctx.fillStyle = "rgba(20, 184, 166, 0.9)";
      ctx.fillRect(legBoxX + 40, midY - 18, 36, 36);
      ctx.strokeStyle = "#0d9488";
      ctx.lineWidth = 3;
      ctx.strokeRect(legBoxX + 40, midY - 18, 36, 36);

      ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
      ctx.font = `bold 46px ${PUB_FONT_SANS}`;
      ctx.textAlign = "left";
      ctx.fillText("Fold Enrichment (BH FDR < 0.05)", legBoxX + 92, midY + 16);

      ctx.fillStyle = isLight ? "#334155" : "#cbd5e1";
      ctx.font = `bold 44px ${PUB_FONT_NUM}`;
      ctx.textAlign = "right";
      ctx.fillText("q = BH Adjusted P-value", legBoxX + legBoxW - 40, midY + 15);
    }

    return offscreen;
  };

  return (
    <div ref={chartRef} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col h-full min-h-[500px] shadow-xl">
      <div className="flex justify-between items-center mb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-slate-100">Enrichment Bar Plot</h3>
            <span className={`text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full border ${contrast.badgeColor}`}>
              Contrast: {contrast.shortTitle}
            </span>
          </div>
          <p className="text-xxs text-slate-400 font-mono mt-0.5">
            Cohort: <span className="text-slate-200">{contrast.datasetName}</span> &bull; Ranked by {isGsea ? "Normalized Enrichment Score (NES)" : "Fold Enrichment"} &bull; Top {displayResults.length} Pathways
          </p>
        </div>

        <ExportButton
          onExportCSV={() => {
            exportToCSV({
              filename: `Pathway_BarPlot_${analysisMode}_${contrast.slug}.csv`,
              metadata: {
                module: "Pathway Bar Plot",
                mode: analysisMode,
                contrast: contrast.shortTitle,
                dataset: contrast.datasetName,
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
              filename: `Pathway_BarPlot_${analysisMode}_${contrast.slug}.png`,
              theme,
            });
          }}
          onExportSVG={({ theme = "light" } = {}) => {
            const exportCanvas = generateHighResBarCanvas(theme, 1200);
            exportCanvasToSVG({
              canvas: exportCanvas,
              filename: `Pathway_BarPlot_${analysisMode}_${contrast.slug}.svg`,
              theme,
            });
          }}
        />
      </div>

      <div className="w-full h-[460px] min-h-[460px] relative">
        <ResponsiveContainer width="100%" height={460}>
          <BarChart
            layout="vertical"
            data={chartData}
            margin={{ top: 15, right: 35, bottom: 52, left: 190 }}
          >
            <XAxis
              type="number"
              stroke="#64748b"
              tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "monospace" }}
              label={{
                value: isGsea
                  ? "Normalized Enrichment Score (NES)"
                  : `Fold Enrichment (${contrast.shortTitle})`,
                position: "insideBottom",
                offset: -12,
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

      {/* Interactive On-Screen Legend & Contrast Card */}
      <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t border-slate-800 text-xs font-mono">
        <div className="flex flex-wrap items-center gap-5">
          {isGsea ? (
            <>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded bg-red-500/90 border border-red-400 inline-block shadow-sm"></span>
                <span className="text-slate-300">
                  Positive NES: <span className="text-red-400 font-bold">{contrast.posShort}</span>
                  <span className="text-slate-400 text-xxs ml-1">({contrast.posPhenotype})</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded bg-blue-500/90 border border-blue-400 inline-block shadow-sm"></span>
                <span className="text-slate-300">
                  Negative NES: <span className="text-blue-400 font-bold">{contrast.negShort}</span>
                  <span className="text-slate-400 text-xxs ml-1">({contrast.negPhenotype})</span>
                </span>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded bg-teal-500 border border-teal-400 inline-block"></span>
              <span className="text-slate-300 font-medium">Over-represented Pathways</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-slate-400">
            <span>q = BH Adjusted P-value</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xxs text-slate-400">
          <span>Contrast:</span>
          <span className="text-slate-200 font-semibold">{contrast.fullContrast}</span>
        </div>
      </div>
    </div>
  );
}
