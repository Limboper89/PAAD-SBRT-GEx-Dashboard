"use client";

import React, { useRef, useEffect, useState, useMemo } from "react";
import { Info, X, Plus, Trash2 } from "lucide-react";
import SearchableGeneSelect from "./SearchableGeneSelect";
import ExportButton from "./ExportButton";
import {
  exportCanvasToPNG,
  exportCanvasToSVG,
  exportToCSV,
  PUB_FONT_SANS,
  PUB_FONT_NUM,
  drawFittedText,
} from "@/utils/exportUtils";

interface ExpressionData {
  samples: string[];
  conditions: string[];
  expressions: { [gene: string]: number[] };
}

interface HeatmapProps {
  expressionData: ExpressionData | null;
  selectedGenes: string[];
  activeGene: string | null;
  onSelectGene: (geneName: string) => void;
  onAddGene: (geneName: string) => void;
  onAddGenes?: (geneNames: string[]) => void;
  onRemoveGene: (geneName: string) => void;
  onClearGenes?: () => void;
  allGenes: string[];
  isTcgaGtex?: boolean;
  tcgaGtexExpressions?: ArrayBuffer | null;
  tcgaGtexData?: any[]; // results list containing symbol and index
}

const MAX_HEATMAP_GENES = 50;

export default function Heatmap({
  expressionData,
  selectedGenes,
  activeGene,
  onSelectGene,
  onAddGene,
  onAddGenes,
  onRemoveGene,
  onClearGenes,
  allGenes,
  isTcgaGtex = false,
  tcgaGtexExpressions = null,
  tcgaGtexData = [],
}: HeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 250 });
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteNotice, setPasteNotice] = useState<string | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{
    gene: string;
    sample: string;
    condition: string;
    value: number;
    zScore: number;
    x: number;
    y: number;
  } | null>(null);

  // Auto-resize canvas height based on selected genes count
  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width } = entry.contentRect;
        setDimensions({
          width: Math.max(width - 32, 300),
          height: selectedGenes.length * 24 + 60, // 24px per row + 60px padding
        });
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [selectedGenes]);

  // Construct virtual expression data if in TCGA-GTEx mode
  const resolvedExpressionData = useMemo(() => {
    if (!isTcgaGtex) return expressionData;
    if (!tcgaGtexExpressions || tcgaGtexData.length === 0 || selectedGenes.length === 0) return null;

    const expressionsDict: { [gene: string]: number[] } = {};
    
    // We construct 349 sample details
    // Indices:
    // 0 to 177: TCGA Tumor (n=178)
    // 178 to 344: GTEx Normal (n=167)
    // 345 to 348: TCGA Solid Normal (n=4)
    const samples = Array.from({ length: 349 }, (_, i) => {
      if (i < 178) return `TCGA PAAD #${i + 1}`;
      if (i < 345) return `GTEx Normal #${i - 177}`;
      return `TCGA Solid Normal #${i - 344}`;
    });

    const conditions = Array.from({ length: 349 }, (_, i) => {
      if (i < 178) return "Tumor";
      if (i < 345) return "Normal";
      return "Adjacent";
    });

    selectedGenes.forEach((geneSymbol) => {
      const geneObj = tcgaGtexData.find((g) => g.symbol === geneSymbol);
      if (geneObj && geneObj.index !== undefined) {
        const offset = geneObj.index * 349 * 4;
        // slice float32 from expressions ArrayBuffer
        const floatArray = new Float32Array(tcgaGtexExpressions, offset, 349);
        expressionsDict[geneSymbol] = Array.from(floatArray);
      }
    });

    return {
      samples,
      conditions,
      expressions: expressionsDict,
    };
  }, [isTcgaGtex, tcgaGtexExpressions, tcgaGtexData, selectedGenes, expressionData]);

  // Compute Z-Scores and sort columns
  // SBRT: sorted by condition: Pre first, then Post
  // TCGA-GTEx: sorted by condition: GTEx Normal (Normal) first, then TCGA Tumor (Tumor), then TCGA Solid Normal (Adjacent)
  const heatmapData = useMemo(() => {
    if (!resolvedExpressionData || selectedGenes.length === 0) return null;

    const { samples, conditions, expressions } = resolvedExpressionData;
    const numSamples = samples.length;

    // Create indices sorted by condition
    let sampleIndices: number[] = [];
    if (isTcgaGtex) {
      // Order: GTEx Normal (Normal), then TCGA Tumor (Tumor), then TCGA Solid Normal (Adjacent)
      sampleIndices = Array.from({ length: numSamples }, (_, i) => i).sort((a, b) => {
        const condA = conditions[a];
        const condB = conditions[b];
        const rank = { Normal: 0, Tumor: 1, Adjacent: 2 };
        return rank[condA as keyof typeof rank] - rank[condB as keyof typeof rank];
      });
    } else {
      // Paired SBRT sorting (Pre first, then Post)
      sampleIndices = Array.from({ length: numSamples }, (_, i) => i).sort((a, b) => {
        const condA = conditions[a];
        const condB = conditions[b];
        const rank = { Pre: 0, Post: 1 };
        return (rank[condA as keyof typeof rank] ?? 0) - (rank[condB as keyof typeof rank] ?? 0);
      });
    }

    const sortedSamples = sampleIndices.map((i) => samples[i]);
    const sortedConditions = sampleIndices.map((i) => conditions[i]);
    
    // Cohort partitions counts
    const gtexCount = sortedConditions.filter((c) => c === "Normal").length;
    const tumorCount = sortedConditions.filter((c) => c === "Tumor").length;
    const solidCount = sortedConditions.filter((c) => c === "Adjacent").length;
    const preCount = sortedConditions.filter((c) => c === "Pre").length;

    // Process each gene: calculate mean, sd, and z-scores
    const geneRows = selectedGenes
      .map((gene) => {
        const vals = expressions[gene];
        if (!vals || vals.length === 0) return null;

        const mean = vals.reduce((a, b) => a + b, 0) / numSamples;
        const variance = vals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / numSamples;
        const sd = Math.sqrt(variance) || 1e-5;

        const zScores = vals.map((v) => (v - mean) / sd);

        const sortedVals = sampleIndices.map((i) => vals[i]);
        const sortedZ = sampleIndices.map((i) => zScores[i]);

        return {
          gene,
          values: sortedVals,
          zScores: sortedZ,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    return {
      samples: sortedSamples,
      conditions: sortedConditions,
      preCount,
      gtexCount,
      tumorCount,
      solidCount,
      rows: geneRows,
    };
  }, [resolvedExpressionData, selectedGenes, isTcgaGtex]);

  const rowHeight = 24;
  const labelWidth = 90;
  const headerHeight = 35;

  const [isLightTheme, setIsLightTheme] = useState<boolean>(false);
  useEffect(() => {
    setIsLightTheme(document.documentElement.classList.contains("light"));
    const onTheme = () => setIsLightTheme(document.documentElement.classList.contains("light"));
    window.addEventListener("bioportal:theme", onTheme);
    return () => window.removeEventListener("bioportal:theme", onTheme);
  }, []);

  // Draw Heatmap Matrix on Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !heatmapData) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    const matrixWidth = dimensions.width - labelWidth - 20; // 20px padding right
    const cellWidth = matrixWidth / heatmapData.samples.length;

    // 1. Draw Column Cohort Banner Headers
    if (isTcgaGtex) {
      // Three sections: GTEx Normal, TCGA Tumor, TCGA Solid Normal
      const normalX = labelWidth;
      const normalW = heatmapData.gtexCount * cellWidth;
      
      const tumorX = normalX + normalW;
      const tumorW = heatmapData.tumorCount * cellWidth;

      const solidX = tumorX + tumorW;
      const solidW = heatmapData.solidCount * cellWidth;

      // GTEx normal pancreas header
      if (normalW > 0) {
        ctx.fillStyle = "rgba(69, 117, 180, 0.15)";
        ctx.fillRect(normalX, 5, normalW - 1, 20);
        ctx.fillStyle = "#4575b4";
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`GTEx Normal (n=${heatmapData.gtexCount})`, normalX + normalW / 2, 18);
      }

      // TCGA tumor header
      if (tumorW > 0) {
        ctx.fillStyle = "rgba(215, 48, 39, 0.15)";
        ctx.fillRect(tumorX, 5, tumorW - 1, 20);
        ctx.fillStyle = "#d73027";
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`TCGA Tumor (n=${heatmapData.tumorCount})`, tumorX + tumorW / 2, 18);
      }

      // TCGA solid normal adjacent header (diagnostic reference)
      if (solidW > 0) {
        ctx.fillStyle = "rgba(254, 224, 144, 0.15)";
        ctx.fillRect(solidX, 5, solidW - 1, 20);
        ctx.fillStyle = "#cca000"; // Darker yellow/orange
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`Adjacent Norm (n=${heatmapData.solidCount})`, solidX + solidW / 2, 18);
      }

      // Draw vertical dividers between cohorts
      ctx.strokeStyle = isLightTheme ? "#ffffff" : "#0f172a";
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      if (normalW > 0) {
        ctx.moveTo(tumorX, headerHeight);
        ctx.lineTo(tumorX, headerHeight + heatmapData.rows.length * rowHeight);
      }
      if (solidW > 0) {
        ctx.moveTo(solidX, headerHeight);
        ctx.lineTo(solidX, headerHeight + heatmapData.rows.length * rowHeight);
      }
      ctx.stroke();

    } else {
      // Paired SBRT Mode: two banners (Pre vs Post)
      const dividerX = labelWidth + heatmapData.preCount * cellWidth;

      // Pre-SBRT Banner
      ctx.fillStyle = "rgba(100, 116, 139, 0.15)";
      ctx.fillRect(labelWidth, 5, heatmapData.preCount * cellWidth - 2, 20);
      ctx.fillStyle = isLightTheme ? "#475569" : "#94a3b8";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`Pre-SBRT (N=${heatmapData.preCount})`, labelWidth + (heatmapData.preCount * cellWidth) / 2, 18);

      // Post-SBRT Banner
      ctx.fillStyle = "rgba(20, 184, 166, 0.1)";
      ctx.fillRect(dividerX + 1, 5, matrixWidth - heatmapData.preCount * cellWidth - 2, 20);
      ctx.fillStyle = isLightTheme ? "#0d9488" : "#14b8a6";
      ctx.fillText(`Post-SBRT (N=${heatmapData.samples.length - heatmapData.preCount})`, dividerX + (matrixWidth - heatmapData.preCount * cellWidth) / 2, 18);

      // Divider line
      ctx.strokeStyle = isLightTheme ? "#ffffff" : "#0f172a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(dividerX, headerHeight);
      ctx.lineTo(dividerX, headerHeight + heatmapData.rows.length * rowHeight);
      ctx.stroke();
    }

    // 2. Draw Rows & Cells
    heatmapData.rows.forEach((row, rIdx) => {
      const y = headerHeight + rIdx * rowHeight;

      // Draw Row Label (Gene Symbol)
      const isActive = row.gene === activeGene;
      ctx.fillStyle = isActive ? (isLightTheme ? "#d97706" : "#f59e0b") : (isLightTheme ? "#1e293b" : "#cbd5e1");
      ctx.font = isActive ? "bold 11px sans-serif" : "11px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(row.gene, 10, y + 15);

      // Selection row highlight outline
      if (isActive) {
        ctx.strokeStyle = "rgba(245, 158, 11, 0.35)";
        ctx.lineWidth = 1;
        ctx.strokeRect(2, y, dimensions.width - 4, rowHeight);
      }

      // Draw Cells
      row.zScores.forEach((z, cIdx) => {
        const x = labelWidth + cIdx * cellWidth;

        // Color mapper: Z-score from blue (-2.0) to white (0.0) to red (+2.0)
        let color = "";
        const maxZ = 2.0;
        const normalized = Math.min(Math.max(z / maxZ, -1), 1);

        if (normalized > 0) {
          // White to Red
          const r = 255;
          const g = Math.round(255 - normalized * 187); // 255 -> 68 (red-500)
          const b = Math.round(255 - normalized * 187);
          color = `rgb(${r}, ${g}, ${b})`;
        } else {
          // White to Blue
          const abs = Math.abs(normalized);
          const r = Math.round(255 - abs * 196); // 255 -> 59 (blue-500)
          const g = Math.round(255 - abs * 125);
          const b = 255;
          color = `rgb(${r}, ${g}, ${b})`;
        }

        ctx.fillStyle = color;
        // Draw cell block (leave a tiny vertical gap)
        ctx.fillRect(x, y + 2, cellWidth - 0.2, rowHeight - 2);
      });
    });

  }, [dimensions, heatmapData, activeGene, isTcgaGtex, isLightTheme]);

  // Handle Cell Hover Detection
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !heatmapData) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (x < labelWidth || y < headerHeight) {
      setHoveredCell(null);
      return;
    }

    const matrixWidth = dimensions.width - labelWidth - 20;
    const cellWidth = matrixWidth / heatmapData.samples.length;

    const cIdx = Math.floor((x - labelWidth) / cellWidth);
    const rIdx = Math.floor((y - headerHeight) / rowHeight);

    if (
      cIdx >= 0 &&
      cIdx < heatmapData.samples.length &&
      rIdx >= 0 &&
      rIdx < heatmapData.rows.length
    ) {
      const row = heatmapData.rows[rIdx];
      const sample = heatmapData.samples[cIdx];
      const condition = heatmapData.conditions[cIdx];
      const value = row.values[cIdx];
      const zScore = row.zScores[cIdx];

      setHoveredCell({
        gene: row.gene,
        sample,
        condition,
        value,
        zScore,
        x,
        y,
      });
    } else {
      setHoveredCell(null);
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !heatmapData) return;

    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;

    const rIdx = Math.floor((y - headerHeight) / rowHeight);
    if (rIdx >= 0 && rIdx < heatmapData.rows.length) {
      onSelectGene(heatmapData.rows[rIdx].gene);
    }
  };

  const handleMouseLeave = () => {
    setHoveredCell(null);
  };

  // Generate dedicated 1:1 square high-res canvas for publication export
  const generateHighResHeatmapCanvas = (theme: "light" | "dark" = "light", size: number = 2400): HTMLCanvasElement => {
    const offscreen = document.createElement("canvas");
    if (!heatmapData || heatmapData.rows.length === 0) return offscreen;

    offscreen.width = size;
    offscreen.height = size;
    const ctx = offscreen.getContext("2d");
    if (!ctx) return offscreen;

    const isLight = theme === "light";

    // Background
    ctx.fillStyle = isLight ? "#ffffff" : "#020617";
    ctx.fillRect(0, 0, size, size);

    // Title Header (GEPIA2-calibrated publication scale)
    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.textAlign = "left";
    drawFittedText(ctx, "Z-score Expression Heatmap", 80, 110, size - 160, 100, "bold", PUB_FONT_SANS);

    ctx.fillStyle = isLight ? "#334155" : "#94a3b8";
    const sub = isTcgaGtex 
      ? `TCGA-PAAD Tumor (n=${heatmapData.tumorCount}) vs GTEx Normal (n=${heatmapData.gtexCount})`
      : `Pre-SBRT (n=${heatmapData.preCount}) vs Post-SBRT (n=${heatmapData.samples.length - heatmapData.preCount})`;
    drawFittedText(ctx, sub, 80, 180, size - 160, 56, "bold", PUB_FONT_NUM);

    const padLeft = 560;
    const padRight = 80;
    const padTop = 310;
    const padBottom = 340; // Space for bottom colorbar legend

    const matrixWidth = size - padLeft - padRight;
    const matrixHeight = size - padTop - padBottom;

    const cellWidth = matrixWidth / heatmapData.samples.length;
    const rowHeight = matrixHeight / heatmapData.rows.length;

    // 1. Draw Cohort Header Banners
    const bannerY = padTop - 98;
    const bannerH = 82;

    if (isTcgaGtex) {
      const normalW = heatmapData.gtexCount * cellWidth;
      const tumorW = heatmapData.tumorCount * cellWidth;
      const solidW = heatmapData.solidCount * cellWidth;

      const normalX = padLeft;
      const tumorX = padLeft + normalW;
      const solidX = padLeft + normalW + tumorW;

      if (normalW > 0) {
        ctx.fillStyle = isLight ? "rgba(69, 117, 180, 0.18)" : "rgba(69, 117, 180, 0.35)";
        ctx.fillRect(normalX, bannerY, normalW - 3, bannerH);
        ctx.fillStyle = isLight ? "#1e40af" : "#60a5fa";
        ctx.textAlign = "center";
        drawFittedText(ctx, `GTEx Normal (n=${heatmapData.gtexCount})`, normalX + normalW / 2, bannerY + 58, normalW - 12, 54, "bold", PUB_FONT_SANS);
      }

      if (tumorW > 0) {
        ctx.fillStyle = isLight ? "rgba(215, 48, 39, 0.18)" : "rgba(215, 48, 39, 0.35)";
        ctx.fillRect(tumorX, bannerY, tumorW - 3, bannerH);
        ctx.fillStyle = isLight ? "#991b1b" : "#f87171";
        ctx.textAlign = "center";
        drawFittedText(ctx, `TCGA Tumor (n=${heatmapData.tumorCount})`, tumorX + tumorW / 2, bannerY + 58, tumorW - 12, 54, "bold", PUB_FONT_SANS);
      }

      if (solidW > 0) {
        ctx.fillStyle = isLight ? "rgba(234, 179, 8, 0.18)" : "rgba(234, 179, 8, 0.35)";
        ctx.fillRect(solidX, bannerY, solidW - 3, bannerH);
        ctx.fillStyle = isLight ? "#854d0e" : "#fbbf24";
        ctx.textAlign = "center";
        drawFittedText(ctx, `Solid (n=${heatmapData.solidCount})`, solidX + solidW / 2, bannerY + 58, Math.max(40, solidW - 4), 38, "bold", PUB_FONT_SANS, 22);
      }
    } else {
      const dividerX = padLeft + heatmapData.preCount * cellWidth;

      // Pre-SBRT Banner
      ctx.fillStyle = isLight ? "rgba(100, 116, 139, 0.18)" : "rgba(100, 116, 139, 0.35)";
      ctx.fillRect(padLeft, bannerY, heatmapData.preCount * cellWidth - 4, bannerH);
      ctx.fillStyle = isLight ? "#334155" : "#94a3b8";
      ctx.textAlign = "center";
      drawFittedText(ctx, `Pre-SBRT (n=${heatmapData.preCount})`, padLeft + (heatmapData.preCount * cellWidth) / 2, bannerY + 58, heatmapData.preCount * cellWidth - 16, 54, "bold", PUB_FONT_SANS);

      // Post-SBRT Banner
      ctx.fillStyle = isLight ? "rgba(20, 184, 166, 0.18)" : "rgba(20, 184, 166, 0.35)";
      ctx.fillRect(dividerX + 1, bannerY, matrixWidth - heatmapData.preCount * cellWidth - 4, bannerH);
      ctx.fillStyle = isLight ? "#0f766e" : "#14b8a6";
      ctx.textAlign = "center";
      drawFittedText(ctx, `Post-SBRT (n=${heatmapData.samples.length - heatmapData.preCount})`, dividerX + (matrixWidth - heatmapData.preCount * cellWidth) / 2, bannerY + 58, matrixWidth - heatmapData.preCount * cellWidth - 16, 54, "bold", PUB_FONT_SANS);
    }

    // 2. Draw Rows & Cells
    const geneFontSize = Math.min(68, Math.max(42, Math.round(rowHeight * 0.72)));

    heatmapData.rows.forEach((row, rIdx) => {
      const y = padTop + rIdx * rowHeight;

      // Draw Row Label (Gene Symbol) in BOLD HIGH-CONTRAST DARK TEXT
      const isActive = row.gene === activeGene;
      ctx.fillStyle = isActive ? (isLight ? "#d97706" : "#f59e0b") : (isLight ? "#0f172a" : "#f1f5f9");
      ctx.font = `bold ${geneFontSize}px ${PUB_FONT_SANS}`;
      ctx.textAlign = "left";
      ctx.fillText(row.gene, 80, y + rowHeight * 0.72);

      // Draw Cells
      row.zScores.forEach((z, cIdx) => {
        const x = padLeft + cIdx * cellWidth;

        const maxZ = 2.0;
        const normalized = Math.min(Math.max(z / maxZ, -1), 1);

        let color = "";
        if (normalized > 0) {
          const r = 255;
          const g = Math.round(255 - normalized * 187);
          const b = Math.round(255 - normalized * 187);
          color = `rgb(${r}, ${g}, ${b})`;
        } else {
          const abs = Math.abs(normalized);
          const r = Math.round(255 - abs * 196);
          const g = Math.round(255 - abs * 125);
          const b = 255;
          color = `rgb(${r}, ${g}, ${b})`;
        }

        ctx.fillStyle = color;
        ctx.fillRect(x, y + 2, cellWidth - 0.5, rowHeight - 3);
      });
    });

    // 3. Draw Z-Score Colorbar Legend at the Bottom
    const legendW = 980;
    const legendH = 48;
    const legendX = size / 2 - legendW / 2;
    const legendY = size - 145;

    const grad = ctx.createLinearGradient(legendX, legendY, legendX + legendW, legendY);
    grad.addColorStop(0, "rgb(59, 130, 255)");   // -2.0 Blue
    grad.addColorStop(0.5, "rgb(255, 255, 255)"); // 0.0 White
    grad.addColorStop(1, "rgb(255, 68, 68)");    // +2.0 Red

    ctx.fillStyle = grad;
    ctx.fillRect(legendX, legendY, legendW, legendH);

    ctx.strokeStyle = isLight ? "#0f172a" : "#64748b";
    ctx.lineWidth = 3.5;
    ctx.strokeRect(legendX, legendY, legendW, legendH);

    // Legend Tick Labels
    ctx.fillStyle = isLight ? "#0f172a" : "#cbd5e1";
    ctx.font = `bold 58px ${PUB_FONT_NUM}`;
    ctx.textAlign = "center";

    const ticks = [
      { val: "-2.0", pos: 0 },
      { val: "-1.0", pos: 0.25 },
      { val: "0.0", pos: 0.5 },
      { val: "+1.0", pos: 0.75 },
      { val: "+2.0", pos: 1.0 },
    ];

    ticks.forEach((t) => {
      const tx = legendX + t.pos * legendW;
      ctx.beginPath();
      ctx.moveTo(tx, legendY + legendH);
      ctx.lineTo(tx, legendY + legendH + 14);
      ctx.stroke();
      ctx.fillText(t.val, tx, legendY + legendH + 70);
    });

    // Legend Title
    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = `bold 68px ${PUB_FONT_SANS}`;
    ctx.textAlign = "center";
    ctx.fillText("Relative Expression (Row Z-Score)", size / 2, legendY - 28);

    return offscreen;
  };

  return (
    <div
      ref={containerRef}
      className="w-full bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl select-none flex flex-col justify-between"
    >
      {/* Header with Search and Gene count */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 border-b border-slate-800/80 pb-3 font-mono">
        <div>
          <h3 className="text-slate-200 font-semibold text-lg flex items-center gap-2">
            <span>Z-score Expression Heatmap</span>
            <span className="text-xs bg-slate-800 text-teal-400 px-2 py-0.5 rounded-full font-mono">
              {selectedGenes.length} {selectedGenes.length === 1 ? "gene" : "genes"}
            </span>
          </h3>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {isTcgaGtex 
              ? "Samples ordered by GTEx Pancreas Normal -> TCGA-PAAD Primary Tumor -> Solid Normal"
              : "Unpaired independent cohorts grouped by Pre-SBRT vs Post-SBRT"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="w-44 sm:w-52">
            <SearchableGeneSelect
              options={allGenes}
              value={null}
              onChange={(val) => {
                if (val && !selectedGenes.includes(val)) {
                  if (selectedGenes.length >= MAX_HEATMAP_GENES) {
                    alert(`Maximum limit of ${MAX_HEATMAP_GENES} genes in heatmap reached to ensure rendering performance.`);
                    return;
                  }
                  onAddGene(val);
                }
              }}
              placeholder="Add gene..."
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setShowPasteBox((v) => !v);
              setPasteNotice(null);
            }}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-sans flex items-center gap-1 transition cursor-pointer ${
              showPasteBox
                ? "border-teal-500/60 bg-teal-950/40 text-teal-300"
                : "border-slate-700 bg-slate-950 text-slate-300 hover:border-teal-500/50"
            }`}
          >
            <Plus className="w-3.5 h-3.5" /> Paste Gene List
          </button>
          {onClearGenes && selectedGenes.length > 0 && (
            <button
              type="button"
              onClick={onClearGenes}
              className="px-2 py-1.5 rounded-lg border border-slate-800 bg-slate-950 text-xs font-sans text-slate-400 hover:text-rose-400 flex items-center gap-1 cursor-pointer"
              title="Clear all heatmap genes"
            >
              <Trash2 className="w-3 h-3" /> Clear
            </button>
          )}
          <ExportButton
            disabled={!heatmapData || heatmapData.rows.length === 0}
            onExportCSV={() => {
              if (!heatmapData || heatmapData.rows.length === 0) return;
              exportToCSV({
                filename: `Heatmap_${isTcgaGtex ? "TCGA_GTEX" : "GSE225767"}_ZScores.csv`,
                metadata: {
                  dataset: isTcgaGtex ? "TCGA-PAAD vs GTEx" : "GSE225767 Bulk RNA-seq",
                  module: "Z-score Heatmap Matrix",
                  selectedGene: activeGene || "N/A",
                  filters: `Genes (${selectedGenes.length}): ${selectedGenes.join(", ")}`,
                },
                headers: ["Gene", ...heatmapData.samples],
                rows: heatmapData.rows.map((r) => [
                  r.gene,
                  ...r.zScores.map((z) => (z !== null && z !== undefined ? Number(z.toFixed(4)) : "")),
                ]),
              });
            }}
            onExportPNG={({ theme = "light" } = {}) => {
              const exportCanvas = generateHighResHeatmapCanvas(theme);
              exportCanvasToPNG({
                canvas: exportCanvas,
                filename: `Heatmap_${isTcgaGtex ? "TCGA_GTEX" : "GSE225767"}.png`,
                theme,
              });
            }}
            onExportSVG={({ theme = "light" } = {}) => {
              const exportCanvas = generateHighResHeatmapCanvas(theme);
              exportCanvasToSVG({
                canvas: exportCanvas,
                filename: `Heatmap_${isTcgaGtex ? "TCGA_GTEX" : "GSE225767"}.svg`,
                theme,
              });
            }}
          />
        </div>
      </div>

      {/* Expandable Paste Gene List Drawer */}
      {showPasteBox && (
        <div className="mb-4 rounded-xl border border-slate-800 bg-slate-950/80 p-3 flex flex-col gap-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={2}
              placeholder="Paste gene symbols separated by commas, spaces, tabs, or newlines (e.g. KRAS, TP53, SMAD4, GATA6)..."
              className="flex-1 rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-slate-200 placeholder-slate-500 font-mono focus:outline-none focus:border-teal-500"
            />
            <button
              type="button"
              onClick={() => {
                const lookup = new Map<string, string>();
                allGenes.forEach((g) => lookup.set(g.toUpperCase(), g));
                const tokens = pasteText
                  .split(/[\s,;|\n\t]+/)
                  .map((s) => s.trim().toUpperCase())
                  .filter(Boolean);
                const matched: string[] = [];
                const missing: string[] = [];
                for (const tok of Array.from(new Set(tokens))) {
                  const canonical = lookup.get(tok);
                  if (canonical) {
                    if (!selectedGenes.includes(canonical)) matched.push(canonical);
                  } else {
                    missing.push(tok);
                  }
                }
                const remaining = Math.max(0, MAX_HEATMAP_GENES - selectedGenes.length);
                const toAdd = matched.slice(0, remaining);
                if (toAdd.length > 0) {
                  if (onAddGenes) {
                    onAddGenes(toAdd);
                  } else {
                    toAdd.forEach((g) => onAddGene(g));
                  }
                }
                setPasteNotice(
                  `Added ${toAdd.length} gene(s)` +
                    (missing.length > 0 ? ` · ${missing.length} not in dataset (${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""})` : "")
                );
                if (toAdd.length > 0) setPasteText("");
              }}
              className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-xs font-semibold text-white shrink-0 cursor-pointer"
            >
              Add Parsed Genes
            </button>
          </div>
          {pasteNotice && (
            <div className="text-[11px] font-mono text-teal-300">{pasteNotice}</div>
          )}
        </div>
      )}

      {/* Main Heatmap Area */}
      {selectedGenes.length === 0 ? (
        <div className="flex-1 border border-dashed border-slate-800 rounded-lg flex items-center justify-center h-48 text-slate-500 text-xs font-mono">
          Select, add, or paste genes to display them in the Z-score heatmap matrix.
        </div>
      ) : isTcgaGtex && !tcgaGtexExpressions ? (
        <div className="flex-1 border border-dashed border-slate-800 rounded-lg flex flex-col items-center justify-center h-48 text-slate-400 text-xs font-mono gap-2">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-500"></div>
          <span>Loading expression data buffer (27.7 MB) for heatmap...</span>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-4">
          <div className="relative border border-slate-950 bg-slate-950/40 rounded-lg overflow-x-hidden p-2">
            <canvas
              ref={canvasRef}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              onClick={handleCanvasClick}
              className="w-full cursor-pointer bg-slate-950/15"
              style={{ width: "100%", height: `${dimensions.height}px` }}
            />

            {/* Heatmap Cell Tooltip */}
            {hoveredCell && (
              <div
                className="absolute bg-slate-950 border border-slate-700 text-slate-100 rounded-lg p-2.5 shadow-2xl text-[11px] z-50 pointer-events-none font-mono"
                style={{
                  left: `${hoveredCell.x + 10}px`,
                  top: `${hoveredCell.y + 10}px`,
                  transform: "translate(0, -50%)",
                }}
              >
                <div className="font-bold text-amber-400 text-xs mb-1">{hoveredCell.gene}</div>
                <div>
                  <span className="text-slate-400">Sample:</span> {hoveredCell.sample}
                </div>
                <div>
                  <span className="text-slate-400">Cohort:</span> {hoveredCell.condition}
                </div>
                <div>
                  <span className="text-slate-400">Expression log₂(TPM + 0.001):</span> {hoveredCell.value.toFixed(3)}
                </div>
                <div className="border-t border-slate-800 pt-1 mt-1 font-semibold text-teal-400">
                  <span className="text-slate-400">Z-score:</span> {hoveredCell.zScore > 0 ? "+" : ""}
                  {hoveredCell.zScore.toFixed(3)}
                </div>
              </div>
            )}
          </div>

          {/* Selected Genes Chip List with Removal */}
          <div className="flex flex-wrap gap-1.5 max-h-[85px] overflow-y-auto pr-1">
            {selectedGenes.map((gene) => (
              <span
                key={gene}
                className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border transition-colors ${
                  gene === activeGene
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                    : "bg-slate-950 border-slate-800 text-slate-300"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectGene(gene)}
                  className="hover:underline text-left truncate max-w-[80px] font-mono"
                >
                  {gene}
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveGene(gene)}
                  className="hover:bg-slate-850 rounded p-0.5 transition-colors text-slate-500 hover:text-red-400"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Heatmap Legend */}
      <div className="border-t border-slate-800/80 pt-3 mt-3 flex flex-wrap justify-between items-center gap-3 text-[11px] text-slate-400 font-mono">
        <div className="flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-slate-500" />
          <span>Click row to select active gene.</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-300 font-semibold">Row Z-Score:</span>
          <span className="text-blue-400 font-semibold">-2.0 (Lower)</span>
          <div className="flex flex-col items-center">
            <div className="h-2.5 w-32 rounded-sm bg-gradient-to-r from-blue-500 via-white to-red-500 border border-slate-700/60" />
            <div className="flex justify-between w-full text-[9px] text-slate-500 mt-0.5">
              <span>-2</span>
              <span>0</span>
              <span>+2</span>
            </div>
          </div>
          <span className="text-rose-400 font-semibold">+2.0 (Higher)</span>
        </div>
      </div>
    </div>
  );
}
