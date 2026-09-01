"use client";

import React, { useState } from "react";
import { BarChart3, Download, Layers, TrendingUp, Sparkles, User, Info, FileSpreadsheet } from "lucide-react";
import ExportButton from "./ExportButton";
import { exportCanvasToPNG, exportCanvasToSVG, exportToCSV } from "@/utils/exportUtils";

export interface PatientSpatialMetric {
  patientId: string;
  gsm: string;
  totalSpots: number;
  positiveSpots: number;
  pctPositive: number;
  meanPositiveExpr: number;
  pseudobulkExpr: number;
  maxExpr: number;
}

interface SpatialCrossPatientPlotProps {
  geneSymbol: string;
  ensemblId: string;
  metrics: PatientSpatialMetric[];
  selectedPatient: string;
  onSelectPatient: (patientId: string) => void;
  isLoading?: boolean;
}

export default function SpatialCrossPatientPlot({
  geneSymbol,
  ensemblId,
  metrics,
  selectedPatient,
  onSelectPatient,
  isLoading = false,
}: SpatialCrossPatientPlotProps) {
  const [metricMode, setMetricMode] = useState<"dual" | "pct" | "mean" | "pseudobulk">("dual");

  if (isLoading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col items-center justify-center gap-3 shadow-lg min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500"></div>
        <span className="text-sm text-slate-400 font-mono">
          Calculating quantitative cross-patient spatial metrics for <strong className="text-rose-400">{geneSymbol}</strong>...
        </span>
      </div>
    );
  }

  if (!metrics || metrics.length === 0) {
    return null;
  }

  // Calculate cohort summary statistics
  const pctValues = metrics.map((m) => m.pctPositive);
  const meanExprValues = metrics.map((m) => m.meanPositiveExpr);
  const pseudoValues = metrics.map((m) => m.pseudobulkExpr);

  const avgPct = pctValues.reduce((a, b) => a + b, 0) / pctValues.length;
  const avgMeanExpr = meanExprValues.reduce((a, b) => a + b, 0) / meanExprValues.length;
  const avgPseudo = pseudoValues.reduce((a, b) => a + b, 0) / pseudoValues.length;

  // Inter-patient standard deviation and CV
  const stdPct = Math.sqrt(
    pctValues.map((x) => Math.pow(x - avgPct, 2)).reduce((a, b) => a + b, 0) / pctValues.length
  );
  const cvPct = avgPct > 0 ? (stdPct / avgPct) * 100 : 0;

  const maxPctMetric = [...metrics].sort((a, b) => b.pctPositive - a.pctPositive)[0];
  const minPctMetric = [...metrics].sort((a, b) => a.pctPositive - b.pctPositive)[0];

  const maxIntensity = Math.max(...meanExprValues, 1.0);
  const maxPseudo = Math.max(...pseudoValues, 0.5);

  // High-Res Publication Canvas Generator (Cell / Nature Journal Standard)
  const generateHighResCanvas = (theme: "light" | "dark" = "light", size: number = 2400): HTMLCanvasElement => {
    const offscreen = document.createElement("canvas");
    offscreen.width = size;
    offscreen.height = Math.round(size * 0.60); // 2400 x 1440 px
    const ctx = offscreen.getContext("2d");
    if (!ctx) return offscreen;

    const isLight = theme === "light";
    const w = offscreen.width;
    const h = offscreen.height;

    // 1. Background
    ctx.fillStyle = isLight ? "#ffffff" : "#020617";
    ctx.fillRect(0, 0, w, h);

    // 2. Title & Header Block
    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 48px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Cross-Patient Spatial Expression: ${geneSymbol} (${ensemblId})`, 80, 80);

    ctx.fillStyle = isLight ? "#475569" : "#94a3b8";
    ctx.font = "bold 24px monospace";
    ctx.fillText(
      `10x Genomics Visium Spatial (GSE274103) · 5 Treatment-Naïve PDAC Patients · Analyzed In-Tissue Spots: ${metrics.reduce((a, b) => a + b.totalSpots, 0).toLocaleString()}`,
      80,
      126
    );

    // Divider Line
    ctx.strokeStyle = isLight ? "#e2e8f0" : "#1e293b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(80, 155);
    ctx.lineTo(w - 80, 155);
    ctx.stroke();

    // 3. Plot Dimensions & Generous Spacing
    const padLeft = 160;
    const padRight = 160;
    const padTop = 230;
    const padBottom = 260;
    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;
    const plotBottom = padTop + plotH;

    // Headroom for right Y-axis (Intensity) so peak values and labels never hit the ceiling
    const maxObservedIntensity = Math.max(...meanExprValues, 0.5);
    const rightAxisMax = Math.max(1.0, Math.ceil(maxObservedIntensity * 1.35 * 10) / 10);

    // 4. Background Grid & Axis Ticks
    for (let i = 0; i <= 5; i++) {
      const y = padTop + (plotH / 5) * i;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + plotW, y);
      ctx.strokeStyle = isLight ? "#e2e8f0" : "#1e293b";
      ctx.lineWidth = i === 5 ? 3 : 1.5;
      ctx.stroke();

      // Left Y-Axis labels (% Positive Spots)
      const val = 100 - i * 20;
      ctx.fillStyle = isLight ? "#475569" : "#94a3b8";
      ctx.font = "bold 24px monospace";
      ctx.textAlign = "right";
      ctx.fillText(`${val}%`, padLeft - 20, y + 8);

      // Right Y-Axis labels (Mean Intensity)
      const exprVal = ((rightAxisMax * (5 - i)) / 5).toFixed(2);
      ctx.textAlign = "left";
      ctx.fillStyle = "#f43f5e";
      ctx.fillText(exprVal, padLeft + plotW + 20, y + 8);
    }

    // 5. Y-Axis Titles
    ctx.save();
    ctx.translate(55, padTop + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 28px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Spatial Tissue Coverage (% Positive Spots)", 0, 0);
    ctx.restore();

    ctx.save();
    ctx.translate(w - 45, padTop + plotH / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = "#f43f5e";
    ctx.font = "bold 28px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Mean Positive Spot Intensity [log1p(Float16)]", 0, 0);
    ctx.restore();

    // 6. Bars & Points
    const n = metrics.length;
    const slotW = plotW / n;
    const barW = Math.min(200, slotW * 0.48);

    metrics.forEach((m, idx) => {
      const cx = padLeft + slotW * idx + slotW / 2;
      const barH = (m.pctPositive / 100) * plotH;
      const barX = cx - barW / 2;
      const barY = plotBottom - barH;

      // Draw % Bar with Gradient
      const grad = ctx.createLinearGradient(barX, barY, barX, plotBottom);
      grad.addColorStop(0, "#0d9488"); // Teal 600
      grad.addColorStop(1, "#115e59"); // Teal 800

      ctx.fillStyle = grad;
      ctx.fillRect(barX, barY, barW, barH);
      ctx.strokeStyle = isLight ? "#0f766e" : "#2dd4bf";
      ctx.lineWidth = 3;
      ctx.strokeRect(barX, barY, barW, barH);

      // Label above bar with pill background
      const pctText = `${m.pctPositive.toFixed(1)}%`;
      ctx.font = "bold 24px monospace";
      const textMetrics = ctx.measureText(pctText);
      const pillW = textMetrics.width + 16;
      const pillH = 32;
      const pillY = barY - pillH - 6;

      ctx.fillStyle = isLight ? "rgba(241, 245, 249, 0.95)" : "rgba(15, 23, 42, 0.95)";
      ctx.fillRect(cx - pillW / 2, pillY, pillW, pillH);
      ctx.strokeStyle = isLight ? "#cbd5e1" : "#334155";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx - pillW / 2, pillY, pillW, pillH);

      ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
      ctx.textAlign = "center";
      ctx.fillText(pctText, cx, pillY + 23);

      // Mean Intensity Point (Right Axis with Headroom)
      const pointY = plotBottom - (m.meanPositiveExpr / rightAxisMax) * plotH;

      ctx.beginPath();
      ctx.arc(cx, pointY, 15, 0, 2 * Math.PI);
      ctx.fillStyle = "#f43f5e"; // Rose 500
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4.5;
      ctx.stroke();

      // Intensity Label Badge above Point
      const exprText = m.meanPositiveExpr.toFixed(2);
      ctx.font = "bold 22px monospace";
      const exprTextW = ctx.measureText(exprText).width + 16;
      const exprPillH = 30;
      const exprPillY = pointY - exprPillH - 12;

      ctx.fillStyle = "#f43f5e";
      ctx.fillRect(cx - exprTextW / 2, exprPillY, exprTextW, exprPillH);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - exprTextW / 2, exprPillY, exprTextW, exprPillH);

      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.fillText(exprText, cx, exprPillY + 22);

      // 7. X-Axis Labels (Hierarchy & Breathing Room)
      ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
      ctx.font = "bold 30px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(m.patientId, cx, plotBottom + 45);

      ctx.fillStyle = isLight ? "#64748b" : "#94a3b8";
      ctx.font = "bold 22px monospace";
      ctx.fillText(m.gsm, cx, plotBottom + 82);

      ctx.fillStyle = isLight ? "#0f766e" : "#2dd4bf";
      ctx.font = "bold 20px monospace";
      ctx.fillText(`${m.positiveSpots.toLocaleString()} / ${m.totalSpots.toLocaleString()} spots`, cx, plotBottom + 118);
    });

    // 8. Dedicated Clean Legend Box at the Bottom
    const legBoxW = 980;
    const legBoxH = 64;
    const legBoxX = (w - legBoxW) / 2;
    const legBoxY = h - 90;

    ctx.fillStyle = isLight ? "#f8fafc" : "#0b1329";
    ctx.fillRect(legBoxX, legBoxY, legBoxW, legBoxH);
    ctx.strokeStyle = isLight ? "#cbd5e1" : "#1e293b";
    ctx.lineWidth = 2.5;
    ctx.strokeRect(legBoxX, legBoxY, legBoxW, legBoxH);

    // Item 1: Coverage
    ctx.fillStyle = "#0d9488";
    ctx.fillRect(legBoxX + 40, legBoxY + 20, 28, 24);
    ctx.strokeStyle = isLight ? "#0f766e" : "#2dd4bf";
    ctx.lineWidth = 2;
    ctx.strokeRect(legBoxX + 40, legBoxY + 20, 28, 24);

    ctx.fillStyle = isLight ? "#1e293b" : "#e2e8f0";
    ctx.font = "bold 22px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Tissue Spatial Coverage (% In-Tissue Spots)", legBoxX + 80, legBoxY + 39);

    // Item 2: Mean Intensity
    ctx.beginPath();
    ctx.arc(legBoxX + 570, legBoxY + 32, 11, 0, 2 * Math.PI);
    ctx.fillStyle = "#f43f5e";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = isLight ? "#1e293b" : "#e2e8f0";
    ctx.fillText("Mean Positive Spot Intensity [log1p]", legBoxX + 595, legBoxY + 39);

    return offscreen;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-5">
      {/* Header with Export & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-rose-500" />
            <h2 className="text-base font-bold text-white tracking-tight">
              Quantitative Cross-Patient Spatial Expression: <span className="text-rose-400">{geneSymbol}</span>
            </h2>
            <span className="text-xxs px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 font-mono">
              GSE274103 · 5 Patients
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 font-mono">
            Spatial prevalence (% positive spots) vs. expression intensity across all 5 clinical PDAC tumor sections.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Metric View Switcher */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 font-mono text-xxs">
            <button
              onClick={() => setMetricMode("dual")}
              className={`px-2.5 py-1.5 rounded font-semibold transition cursor-pointer ${
                metricMode === "dual" ? "bg-rose-500 text-white shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              Dual View
            </button>
            <button
              onClick={() => setMetricMode("pct")}
              className={`px-2.5 py-1.5 rounded font-semibold transition cursor-pointer ${
                metricMode === "pct" ? "bg-rose-500 text-white shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              % Coverage
            </button>
            <button
              onClick={() => setMetricMode("mean")}
              className={`px-2.5 py-1.5 rounded font-semibold transition cursor-pointer ${
                metricMode === "mean" ? "bg-rose-500 text-white shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              Intensity
            </button>
            <button
              onClick={() => setMetricMode("pseudobulk")}
              className={`px-2.5 py-1.5 rounded font-semibold transition cursor-pointer ${
                metricMode === "pseudobulk" ? "bg-rose-500 text-white shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              Pseudo-bulk
            </button>
          </div>

          <ExportButton
            label="Export Plot"
            onExportCSV={() => {
              exportToCSV({
                filename: `Spatial_CrossPatient_${geneSymbol}_Summary.csv`,
                metadata: {
                  dataset: "GSE274103 Spatial Transcriptomics",
                  module: "Cross-Patient Spatial Quantification",
                  selectedGene: geneSymbol,
                  ensemblId: ensemblId,
                },
                headers: [
                  "Patient ID",
                  "GEO Accession",
                  "Total Spots",
                  "Positive Spots",
                  "Spatial Coverage (%)",
                  "Mean Positive Log-Expr",
                  "Pseudobulk Section Expr",
                  "Max Spot Expr",
                ],
                rows: metrics.map((m) => [
                  m.patientId,
                  m.gsm,
                  m.totalSpots,
                  m.positiveSpots,
                  m.pctPositive,
                  m.meanPositiveExpr,
                  m.pseudobulkExpr,
                  m.maxExpr,
                ]),
              });
            }}
            onExportPNG={({ theme = "light" } = {}) => {
              const canvas = generateHighResCanvas(theme, 2400);
              exportCanvasToPNG({
                canvas,
                filename: `Spatial_CrossPatient_${geneSymbol}_Summary.png`,
                theme,
              });
            }}
            onExportSVG={({ theme = "light" } = {}) => {
              const canvas = generateHighResCanvas(theme, 1200);
              exportCanvasToSVG({
                canvas,
                filename: `Spatial_CrossPatient_${geneSymbol}_Summary.svg`,
                theme,
              });
            }}
          />
        </div>
      </div>

      {/* Cohort Summary Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-1">
          <span className="text-xxs text-slate-500 uppercase tracking-wider">Cohort Mean Coverage</span>
          <span className="text-lg font-bold text-teal-400">{avgPct.toFixed(1)}%</span>
          <span className="text-xxs text-slate-500">Range: {minPctMetric.pctPositive.toFixed(1)}% – {maxPctMetric.pctPositive.toFixed(1)}%</span>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-1">
          <span className="text-xxs text-slate-500 uppercase tracking-wider">Mean Intensity (Pos)</span>
          <span className="text-lg font-bold text-rose-400">{avgMeanExpr.toFixed(2)}</span>
          <span className="text-xxs text-slate-500">log1p(Float16 Normalized)</span>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-1">
          <span className="text-xxs text-slate-500 uppercase tracking-wider">Spatial Heterogeneity</span>
          <span className="text-lg font-bold text-amber-400">{cvPct.toFixed(1)}% CV</span>
          <span className="text-xxs text-slate-500">Inter-patient coverage variance</span>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-1">
          <span className="text-xxs text-slate-500 uppercase tracking-wider">Max Coverage Patient</span>
          <span className="text-lg font-bold text-indigo-400">{maxPctMetric.patientId}</span>
          <span className="text-xxs text-slate-500">{maxPctMetric.pctPositive.toFixed(1)}% ({maxPctMetric.gsm})</span>
        </div>
      </div>

      {/* Interactive Bar & Metric Visualization */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-teal-500 inline-block"></span>
            Spatial Coverage (% In-Tissue Spots)
            {metricMode === "dual" && (
              <>
                <span className="w-3 h-3 rounded-full bg-rose-500 inline-block ml-3"></span>
                Mean Expression Intensity (Pos Spots)
              </>
            )}
          </span>
          <span className="text-xxs text-slate-500">Click any patient bar to load full spatial section</span>
        </div>

        <div className="grid grid-cols-5 gap-3 sm:gap-6 pt-4 pb-2">
          {metrics.map((m) => {
            const isSelected = m.patientId === selectedPatient;
            return (
              <button
                key={m.patientId}
                type="button"
                onClick={() => onSelectPatient(m.patientId)}
                className={`group flex flex-col items-center gap-2 p-3 rounded-xl border transition-all cursor-pointer text-center ${
                  isSelected
                    ? "bg-rose-500/10 border-rose-500/80 ring-1 ring-rose-500 shadow-lg shadow-rose-950/40"
                    : "bg-slate-900/60 border-slate-800/80 hover:bg-slate-900 hover:border-slate-700"
                }`}
              >
                {/* Visual Bar Container */}
                <div className="w-full h-44 bg-slate-950 border border-slate-850 rounded-lg relative flex flex-col justify-end p-2 items-center overflow-hidden">
                  {/* Grid tick marks */}
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20 p-1">
                    <div className="border-b border-slate-700 w-full"></div>
                    <div className="border-b border-slate-700 w-full"></div>
                    <div className="border-b border-slate-700 w-full"></div>
                  </div>

                  {/* Coverage Fill Bar */}
                  <div
                    style={{ height: `${Math.max(4, m.pctPositive)}%` }}
                    className={`w-full max-w-[48px] rounded-t-md transition-all duration-500 ${
                      isSelected
                        ? "bg-gradient-to-t from-teal-700 to-teal-400 shadow-md shadow-teal-900/50"
                        : "bg-gradient-to-t from-teal-800 to-teal-500/90 group-hover:from-teal-700 group-hover:to-teal-400"
                    }`}
                  />

                  {/* Dual Metric Badge: Mean Intensity Overlaid */}
                  {metricMode === "dual" && (
                    <div
                      style={{ bottom: `${Math.min(85, Math.max(10, (m.meanPositiveExpr / maxIntensity) * 80))}%` }}
                      className="absolute z-10 bg-rose-500 text-white font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-rose-300 shadow-md flex items-center gap-1"
                    >
                      <Sparkles className="w-2.5 h-2.5" />
                      {m.meanPositiveExpr.toFixed(2)}
                    </div>
                  )}

                  {/* Numerical Label on Top of Bar */}
                  <span className="absolute top-2 font-mono text-xs font-bold text-white drop-shadow">
                    {metricMode === "pseudobulk"
                      ? m.pseudobulkExpr.toFixed(2)
                      : metricMode === "mean"
                      ? m.meanPositiveExpr.toFixed(2)
                      : `${m.pctPositive.toFixed(1)}%`}
                  </span>
                </div>

                {/* Patient Labels & Metadata */}
                <div className="flex flex-col items-center font-mono">
                  <span className={`text-xs font-bold ${isSelected ? "text-rose-400" : "text-slate-200 group-hover:text-white"}`}>
                    {m.patientId}
                  </span>
                  <span className="text-xxs text-slate-500">{m.gsm}</span>
                  <span className="text-[10px] text-teal-400/90 font-semibold mt-1">
                    {m.positiveSpots.toLocaleString()} / {m.totalSpots.toLocaleString()} spots
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
