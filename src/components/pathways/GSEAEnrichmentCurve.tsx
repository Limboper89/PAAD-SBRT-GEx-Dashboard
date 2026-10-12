"use client";

import React, { useRef, useMemo } from "react";
import { PathwayEnrichmentResult } from "@/types/pathway";
import { getContrastDisplayInfo } from "@/utils/pathwayEngine";
import { CheckCircle2, ExternalLink, Zap, Info, Layers } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine } from "recharts";
import ExportButton from "@/components/ExportButton";
import { exportCanvasToPNG, exportCanvasToSVG, exportToCSV } from "@/utils/exportUtils";

interface GSEAEnrichmentCurveProps {
  pathway: PathwayEnrichmentResult | null;
  availablePathways?: PathwayEnrichmentResult[];
  onSelectPathway?: (pathway: PathwayEnrichmentResult) => void;
  onOpenDetailModal?: (pathway: PathwayEnrichmentResult) => void;
  onClose?: () => void;
  datasetName?: string;
  comparisonLabel?: string;
}

export default function GSEAEnrichmentCurve({ 
  pathway, 
  availablePathways, 
  onSelectPathway, 
  onOpenDetailModal,
  onClose, 
  datasetName, 
  comparisonLabel 
}: GSEAEnrichmentCurveProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const contrast = useMemo(() => {
    return getContrastDisplayInfo(
      comparisonLabel || pathway?.comparisonLabel,
      datasetName || pathway?.datasetName,
      pathway?.datasetId
    );
  }, [comparisonLabel, datasetName, pathway]);

  const computedExternalUrl = useMemo(() => {
    if (pathway?.externalUrl) return pathway.externalUrl;
    if (!pathway) return "";
    const name = pathway.pathwayName || "";
    const id = pathway.pathwayId || "";
    const db = pathway.database || "";
    
    if (db === "Hallmark" || name.startsWith("Hallmark") || id.startsWith("HALLMARK_")) {
      const canonical = (id || name).toUpperCase()
        .replace(/^HALLMARK[\s_:-]*/, "")
        .replace("TNF-ALPHA_SIGNALING_VIA_NF-KB", "TNFA_SIGNALING_VIA_NFKB")
        .replace("TNF-ALPHA SIGNALING VIA NF-KB", "TNFA_SIGNALING_VIA_NFKB")
        .replace("TNF_ALPHA_SIGNALING_VIA_NF_KB", "TNFA_SIGNALING_VIA_NFKB")
        .replace("TGF-BETA_SIGNALING", "TGF_BETA_SIGNALING")
        .replace("TGF-BETA SIGNALING", "TGF_BETA_SIGNALING")
        .replace("IL-6/JAK/STAT3_SIGNALING", "IL6_JAK_STAT3_SIGNALING")
        .replace("IL-6/JAK/STAT3 SIGNALING", "IL6_JAK_STAT3_SIGNALING")
        .replace("IL-2/STAT5_SIGNALING", "IL2_STAT5_SIGNALING")
        .replace("IL-2/STAT5 SIGNALING", "IL2_STAT5_SIGNALING")
        .replace("G2-M_CHECKPOINT", "G2M_CHECKPOINT")
        .replace("G2-M CHECKPOINT", "G2M_CHECKPOINT")
        .replace("WNT-BETA_CATENIN_SIGNALING", "WNT_BETA_CATENIN_SIGNALING")
        .replace("WNT-BETA CATENIN SIGNALING", "WNT_BETA_CATENIN_SIGNALING")
        .replace(/[^A-Z0-9_]/g, "_")
        .replace(/_+/g, "_");
      return `https://www.gsea-msigdb.org/gsea/msigdb/human/geneset/HALLMARK_${canonical}.html`;
    }
    if (db === "Reactome" || name.startsWith("Reactome") || id.includes("R-HSA-")) {
      const match = id.match(/R-HSA-\d+/) || name.match(/R-HSA-\d+/);
      if (match) return `https://reactome.org/content/detail/${match[0]}`;
    }
    if (db === "GO_BP" || name.startsWith("GO") || id.startsWith("GO:")) {
      const match = id.match(/GO:\d+/) || name.match(/GO:\d+/);
      if (match) return `https://amigo.geneontology.org/amigo/term/${match[0]}`;
    }
    return "";
  }, [pathway]);


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
    ctx.font = "bold 52px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(pathway.pathwayName, 80, 75);

    // Subtitle 1: Cohort & Contrast
    ctx.fillStyle = isLight ? "#334155" : "#94a3b8";
    ctx.font = "bold 26px monospace";
    ctx.fillText(
      `Cohort: ${contrast.datasetName} (${contrast.fullContrast})`,
      80,
      118
    );

    const totalHits = pathway.geneSetSize || pathway.contributingGenes?.length || curveData?.geneHitsIndices?.length || 0;
    const leadingHits = leadingEdgeGenes.length;
    const pctLeading = totalHits > 0 ? Math.round((leadingHits / totalHits) * 100) : 0;

    // Subtitle 2: Metrics
    ctx.fillStyle = isLight ? "#475569" : "#64748b";
    ctx.font = "bold 24px monospace";
    ctx.fillText(
      `Database: ${pathway.database} | NES: ${pathway.nes !== undefined ? (pathway.nes > 0 ? "+" + pathway.nes.toFixed(3) : pathway.nes.toFixed(3)) : "N/A"} | FDR: ${pathway.adjPValue ? pathway.adjPValue.toExponential(2) : "N/A"} | Total Hits: ${totalHits} genes | Leading Edge: ${leadingHits} / ${totalHits} (${pctLeading}%)`,
      80,
      155
    );



    const padLeft = 200;
    const padRight = 80;
    const plotW = size - padLeft - padRight;

    const nPoints = chartData.length;
    const maxRank = nPoints > 0 ? chartData[nPoints - 1].rankIndex : totalGenes;

    const getX = (rank: number) => padLeft + (rank / Math.max(1, maxRank)) * plotW;

    // --- PANEL A: Mountain Plot (y: 190 to 1100, height 910) ---
    const panelATop = 190;
    const panelAH = 910;

    ctx.fillStyle = isLight ? "#f8fafc" : "#0f172a";
    ctx.fillRect(padLeft, panelATop, plotW, panelAH);
    ctx.strokeStyle = isLight ? "#cbd5e1" : "#1e293b";
    ctx.lineWidth = 2.5;
    ctx.strokeRect(padLeft, panelATop, plotW, panelAH);

    const minES = esDomain[0];
    const maxES = esDomain[1];
    const getESY = (es: number) => panelATop + ((maxES - es) / (maxES - minES)) * panelAH;
    const zeroY = getESY(0);

    // Zero line
    ctx.strokeStyle = isLight ? "#94a3b8" : "#475569";
    ctx.lineWidth = 3;
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
      ctx.lineWidth = 5.5;
      ctx.stroke();

      // Peak line
      const peakX = getX(peakIndex);
      const peakY = getESY(pathway.enrichmentScore ?? 0);
      ctx.strokeStyle = "rgba(245, 158, 11, 0.95)";
      ctx.lineWidth = 3.5;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(peakX, panelATop);
      ctx.lineTo(peakX, panelATop + panelAH);
      ctx.stroke();
      ctx.setLineDash([]);

      // Peak label
      ctx.fillStyle = "#d97706";
      ctx.font = "bold 30px monospace";
      ctx.textAlign = isUp ? "left" : "right";
      const peakLabelX = isUp ? peakX + 16 : peakX - 16;
      ctx.fillText(`Peak ES = ${pathway.enrichmentScore?.toFixed(4)} (Rank #${peakIndex})`, peakLabelX, peakY - 18);
    }

    // Panel A Y Axis label
    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 38px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.save();
    ctx.translate(75, panelATop + panelAH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("Enrichment Score (ES)", 0, 0);
    ctx.restore();

    // --- PANEL B: Hit Barcode Strip (y: 1140 to 1340, height 200) ---
    const panelBTop = 1140;
    const panelBH = 200;

    ctx.fillStyle = isLight ? "#f8fafc" : "#0f172a";
    ctx.fillRect(padLeft, panelBTop, plotW, panelBH);
    ctx.strokeStyle = isLight ? "#cbd5e1" : "#1e293b";
    ctx.lineWidth = 2.5;
    ctx.strokeRect(padLeft, panelBTop, plotW, panelBH);

    // Panel B Header / Legend over Barcode
    ctx.fillStyle = isLight ? "#334155" : "#94a3b8";
    ctx.font = "bold 22px monospace";
    ctx.textAlign = "left";
    ctx.fillText(
      `Total Mapped Hits: ${totalHits} genes  (● ${leadingHits} Core Leading Edge [${isUp ? "Red" : "Blue"}]  |  ● ${totalHits - leadingHits} Trailing Hits [Slate])`,
      padLeft,
      panelBTop - 12
    );

    const hitRanks = curveData?.geneHitsIndices && curveData.geneHitsIndices.length > 0 
      ? curveData.geneHitsIndices 
      : chartData.filter(d => d.isHit).map(d => d.rankIndex);

    hitRanks.forEach((rankIdx) => {
      const x = getX(rankIdx);
      const isLeading = isUp ? rankIdx <= peakIndex : rankIdx >= peakIndex;
      ctx.strokeStyle = isLeading ? (isUp ? "#dc2626" : "#2563eb") : (isLight ? "#64748b" : "#475569");
      ctx.lineWidth = isLeading ? 3.5 : 2;
      ctx.beginPath();
      ctx.moveTo(x, panelBTop + 8);
      ctx.lineTo(x, panelBTop + panelBH - 8);
      ctx.stroke();
    });

    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 36px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.save();
    ctx.translate(75, panelBTop + panelBH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("Hits", 0, 0);
    ctx.restore();

    // --- PANEL C: Ranked Metric (y: 1390 to 2040, height 650) ---
    const panelCTop = 1390;
    const panelCH = 650;

    ctx.fillStyle = isLight ? "#f8fafc" : "#0f172a";
    ctx.fillRect(padLeft, panelCTop, plotW, panelCH);
    ctx.strokeStyle = isLight ? "#cbd5e1" : "#1e293b";
    ctx.lineWidth = 2.5;
    ctx.strokeRect(padLeft, panelCTop, plotW, panelCH);

    const minMetric = chartData.length > 0 ? Math.min(...chartData.map((d) => d.rankMetric)) : -5;
    const maxMetric = chartData.length > 0 ? Math.max(...chartData.map((d) => d.rankMetric)) : 5;
    const getMetricY = (m: number) => panelCTop + ((maxMetric - m) / (maxMetric - minMetric)) * panelCH;
    const zeroMetricY = getMetricY(0);

    // Zero Metric Line
    ctx.strokeStyle = isLight ? "#94a3b8" : "#475569";
    ctx.lineWidth = 3;
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
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 36px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.save();
    ctx.translate(75, panelCTop + panelCH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("Rank Metric", 0, 0);
    ctx.restore();

    // Bottom X Axis (Ranks)
    const numXTicks = 8;
    const rankStep = Math.round(maxRank / numXTicks);
    ctx.font = "bold 34px monospace";
    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.textAlign = "center";

    for (let i = 0; i <= numXTicks; i++) {
      const r = i * rankStep;
      const xPos = getX(r);
      ctx.beginPath();
      ctx.moveTo(xPos, panelCTop + panelCH);
      ctx.lineTo(xPos, panelCTop + panelCH + 10);
      ctx.stroke();
      ctx.fillText(r.toLocaleString(), xPos, panelCTop + panelCH + 46);
    }

    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 38px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`Rank in Ordered Gene List (${maxRank.toLocaleString()} genes)`, padLeft + plotW / 2, panelCTop + panelCH + 115);

    // Directional Phenotype Indicators on bottom axis of Canvas
    ctx.font = "bold 26px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillStyle = isLight ? "#dc2626" : "#f87171";
    ctx.textAlign = "left";
    ctx.fillText(`◄ ${contrast.posShort}`, padLeft + 10, panelCTop + panelCH + 115);

    ctx.fillStyle = isLight ? "#2563eb" : "#60a5fa";
    ctx.textAlign = "right";
    ctx.fillText(`${contrast.negShort} ►`, padLeft + plotW - 10, panelCTop + panelCH + 115);

    return offscreen;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col gap-6 shadow-2xl font-sans text-slate-100 relative">
      {/* Interactive Pathway Selector Bar */}
      {availablePathways && availablePathways.length > 1 && onSelectPathway && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-950/90 border border-slate-800 rounded-xl px-4 py-3 shadow-inner">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-teal-400 shrink-0" />
            <span className="text-xs font-mono uppercase tracking-wider text-slate-300 font-bold">
              Switch Pathway:
            </span>
            <span className="text-xxs font-mono text-slate-500 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
              {availablePathways.length.toLocaleString()} available
            </span>
          </div>
          <select
            value={pathway.pathwayName}
            onChange={(e) => {
              const selected = availablePathways.find(p => p.pathwayName === e.target.value);
              if (selected) onSelectPathway(selected);
            }}
            className="bg-slate-900 hover:bg-slate-850 border border-slate-700 hover:border-teal-500/50 text-slate-200 text-xs rounded-lg px-3 py-2 font-mono focus:outline-none focus:border-teal-500 transition-colors w-full sm:max-w-xl truncate cursor-pointer shadow-sm"
          >
            {availablePathways.map((p) => (
              <option key={`${p.database}-${p.pathwayName}`} value={p.pathwayName}>
                [{p.database}] {p.pathwayName} {p.nes !== undefined ? `(NES: ${p.nes > 0 ? '+' : ''}${p.nes.toFixed(2)})` : ''} — FDR: {p.adjPValue < 0.0001 ? p.adjPValue.toExponential(1) : p.adjPValue.toFixed(4)}
              </option>
            ))}
          </select>
        </div>
      )}

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
            <span className={`text-xxs px-2.5 py-0.5 rounded-full border font-mono font-bold ${contrast.badgeColor}`}>
              Contrast: {contrast.shortTitle}
            </span>
            <span className="text-xxs text-slate-400 font-mono">
              Cohort: {contrast.datasetName}
            </span>
            <span className="text-xxs text-slate-500 font-mono">
              ({isGsea ? "GSEA Canonical Enrichment View" : "ORA Gene Set View"})
            </span>
          </div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <span>{pathway.pathwayName}</span>
            {(pathway.externalUrl || computedExternalUrl) && (
              <a
                href={pathway.externalUrl || computedExternalUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs bg-slate-800 hover:bg-slate-700 text-teal-300 hover:text-teal-200 border border-slate-700 hover:border-teal-500/50 px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-mono transition shadow-sm"
                title="View Official Gene Set on UCSD MSigDB / External Database"
              >
                <span>{pathway.database === "Hallmark" ? "UCSD MSigDB Card" : `${pathway.database} Card`}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            {onOpenDetailModal && (
              <button
                onClick={() => onOpenDetailModal(pathway)}
                className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 hover:border-slate-600 px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-mono transition shadow-sm cursor-pointer"
                title="Open Detailed Genes Analysis Window"
              >
                <span>Full Gene Analysis Window</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
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
            <span className="text-xxs text-slate-500 block uppercase">Leading Edge / Hits</span>
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
                  filename: `GSEA_Curve_${pathway.pathwayName.replace(/[^a-zA-Z0-9]/g, "_")}_${contrast.slug}.csv`,
                  metadata: {
                    dataset: pathway.database,
                    cohort: contrast.datasetName,
                    contrast: contrast.shortTitle,
                    comparison: contrast.fullContrast,
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
                  filename: `GSEA_Mountain_${pathway.pathwayName.replace(/[^a-zA-Z0-9]/g, "_")}_${contrast.slug}.png`,
                  theme,
                });
              }}
              onExportSVG={({ theme = "light" } = {}) => {
                const exportCanvas = generateHighResGseaMountainCanvas(theme, 1200);
                exportCanvasToSVG({
                  canvas: exportCanvas,
                  filename: `GSEA_Mountain_${pathway.pathwayName.replace(/[^a-zA-Z0-9]/g, "_")}_${contrast.slug}.svg`,
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
                    tickFormatter={(val: number) => (typeof val === "number" ? val.toFixed(2) : String(val))}
                    width={55}
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
              <span>
                Gene Set Member Hits Barcode: <strong className="text-slate-200">{pathway.geneSetSize || pathway.contributingGenes?.length || curveData?.geneHitsIndices?.length || 0} total mapped genes</strong> (<span className="text-rose-400 font-bold">{leadingEdgeGenes.length} leading-edge</span> + <span className="text-slate-400 font-semibold">{(pathway.geneSetSize || pathway.contributingGenes?.length || curveData?.geneHitsIndices?.length || 0) - leadingEdgeGenes.length} trailing</span>)
              </span>
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
                  <YAxis
                    stroke="#475569"
                    tick={{ fill: "#64748b", fontSize: 10 }}
                    tickFormatter={(val: number) => (typeof val === "number" ? val.toFixed(1) : String(val))}
                    width={55}
                  />
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

          {/* Directional axis indicators for UI */}
          <div className="flex flex-col sm:flex-row justify-between items-center px-4 py-2 bg-slate-950 rounded-xl text-xxs font-mono border border-slate-800 text-slate-400 gap-2">
            <span className="text-rose-400 font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              ◄ High in {contrast.posShort} (Positively Correlated / Rank #0)
            </span>
            <span className="text-slate-400 font-semibold">
              Rank in Ordered Dataset ({totalGenes.toLocaleString()} genes)
            </span>
            <span className="text-sky-400 font-bold flex items-center gap-1.5">
              High in {contrast.negShort} (Negatively Correlated / Rank #{totalGenes.toLocaleString()}) ►
              <span className="w-2 h-2 rounded-full bg-sky-500" />
            </span>
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
