"use client";

import React, { useMemo, useState, useRef } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Scatter,
  Line,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Info, AlertTriangle } from "lucide-react";
import ExportButton from "@/components/ExportButton";
import { exportToCSV, exportCanvasToPNG, exportCanvasToSVG } from "@/utils/exportUtils";

interface GeneExpressionEntry {
  gene: string;
  values: number[];
}

interface CorrelationPlotProps {
  gene1Name: string;
  gene2Name: string;
  gene1Expression: number[] | undefined | null;
  gene2Expression: number[] | undefined | null;
  samples: string[];
  isTcgaGtex?: boolean;
  correlationMode?: "single" | "geneset";
  signatureMethod?: "zscore" | "mean";
  geneSetALabel?: string;
  geneSetBLabel?: string;
  geneSetAExpressions?: GeneExpressionEntry[];
  geneSetBExpressions?: GeneExpressionEntry[];
}

// Spearman rank correlation helper
function calculateSpearman(x: number[], y: number[]): number {
  const n = x.length;
  if (n <= 1) return 0;
  
  const getRanks = (arr: number[]) => {
    const sorted = arr.map((val, idx) => ({ val, idx })).sort((a, b) => a.val - b.val);
    const ranks = new Array(n);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j < n && sorted[j].val === sorted[i].val) j++;
      const avgRank = (i + 1 + j) / 2;
      for (let k = i; k < j; k++) {
        ranks[sorted[k].idx] = avgRank;
      }
      i = j;
    }
    return ranks;
  };
  
  const ranksX = getRanks(x);
  const ranksY = getRanks(y);
  
  const meanRx = ranksX.reduce((a, b) => a + b, 0) / n;
  const meanRy = ranksY.reduce((a, b) => a + b, 0) / n;
  
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let k = 0; k < n; k++) {
    const dx = ranksX[k] - meanRx;
    const dy = ranksY[k] - meanRy;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  
  return denX && denY ? num / Math.sqrt(denX * denY) : 0;
}

function calculatePearson(x: number[], y: number[]): number {
  const n = x.length;
  if (n <= 1) return 0;
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  return denX && denY ? num / Math.sqrt(denX * denY) : 0;
}

// Normal / Student-t approximation for two-tailed correlation p-value
function calculateCorrelationPValue(r: number, n: number): number {
  if (n <= 2) return 1;
  const absR = Math.min(Math.abs(r), 0.9999999);
  const df = n - 2;
  const t = absR * Math.sqrt(df / (1 - absR * absR));
  const z = Math.sqrt(df * Math.log(1 + (t * t) / df)) * (1 - 1 / (4 * df));
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, pConst = 0.3275911;
  const x = z / Math.SQRT2;
  const tVal = 1.0 / (1.0 + pConst * x);
  const y = 1.0 - (((((a5 * tVal + a4) * tVal) + a3) * tVal + a2) * tVal + a1) * tVal * Math.exp(-x * x);
  return Math.max(1 - y, 1e-99);
}

function formatPValue(p: number): string {
  if (p < 0.0001) return p.toExponential(2);
  return p.toFixed(4);
}

function standardizeVector(arr: number[]): number[] {
  const n = arr.length;
  if (n === 0) return [];
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  const variance = arr.reduce((acc, val) => acc + (val - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  if (sd < 1e-9) return arr.map(() => 0);
  return arr.map((val) => (val - mean) / sd);
}

export default function CorrelationPlot({
  gene1Name,
  gene2Name,
  gene1Expression,
  gene2Expression,
  samples,
  isTcgaGtex = false,
  correlationMode = "single",
  signatureMethod = "zscore",
  geneSetALabel = "Gene Set A",
  geneSetBLabel = "Gene Set B",
  geneSetAExpressions = [],
  geneSetBExpressions = [],
}: CorrelationPlotProps) {
  const [selectedCohort, setSelectedCohort] = useState<"tumor" | "gtex" | "all">("tumor");
  const [geneSetViewMode, setGeneSetViewMode] = useState<"scatter" | "matrix">("scatter");
  const [matrixMetric, setMatrixMetric] = useState<"pearson" | "spearman">("pearson");
  const chartContainerRef = useRef<HTMLDivElement | null>(null);

  const isGeneSetMode = correlationMode === "geneset";

  // Helper to slice a sample vector for the selected cohort
  const sliceForCohort = (vec: number[]) => {
    if (!isTcgaGtex) return Array.from(vec);
    if (selectedCohort === "tumor") return Array.from(vec.slice(0, 178));
    if (selectedCohort === "gtex") return Array.from(vec.slice(178, 345));
    return Array.from(vec.slice(0, 345));
  };

  const cohortMeta = useMemo(() => {
    if (!isTcgaGtex) {
      return {
        snames: samples,
        cohortName: "Pre & Post SBRT samples",
        color: "#14b8a6",
      };
    }
    if (selectedCohort === "tumor") {
      return {
        snames: samples.slice(0, 178),
        cohortName: "TCGA Primary Tumor (n=178)",
        color: "#d73027",
      };
    }
    if (selectedCohort === "gtex") {
      return {
        snames: samples.slice(178, 345),
        cohortName: "GTEx Normal Pancreas (n=167)",
        color: "#4575b4",
      };
    }
    return {
      snames: samples.slice(0, 345),
      cohortName: "TCGA & GTEx Pooled (n=345)",
      color: "#9c27b0",
    };
  }, [isTcgaGtex, selectedCohort, samples]);

  // Compute composite signature vectors (or single-gene vectors) for the active cohort
  const filteredExpressionData = useMemo(() => {
    if (isGeneSetMode) {
      if (geneSetAExpressions.length === 0 || geneSetBExpressions.length === 0) {
        return null;
      }
      const nSamples = cohortMeta.snames.length;
      if (nSamples === 0) return null;

      const slicedA = geneSetAExpressions.map((entry) => ({
        gene: entry.gene,
        vals: signatureMethod === "zscore" ? standardizeVector(sliceForCohort(entry.values)) : sliceForCohort(entry.values),
        rawVals: sliceForCohort(entry.values),
      }));
      const slicedB = geneSetBExpressions.map((entry) => ({
        gene: entry.gene,
        vals: signatureMethod === "zscore" ? standardizeVector(sliceForCohort(entry.values)) : sliceForCohort(entry.values),
        rawVals: sliceForCohort(entry.values),
      }));

      const compositeA = new Array(nSamples).fill(0);
      const compositeB = new Array(nSamples).fill(0);

      for (let i = 0; i < nSamples; i++) {
        let sumA = 0;
        for (let g = 0; g < slicedA.length; g++) sumA += slicedA[g].vals[i] ?? 0;
        compositeA[i] = sumA / slicedA.length;

        let sumB = 0;
        for (let g = 0; g < slicedB.length; g++) sumB += slicedB[g].vals[i] ?? 0;
        compositeB[i] = sumB / slicedB.length;
      }

      return {
        g1: compositeA,
        g2: compositeB,
        snames: cohortMeta.snames,
        cohortName: cohortMeta.cohortName,
        color: cohortMeta.color,
        slicedA,
        slicedB,
      };
    }

    // Single-gene mode
    if (!gene1Expression || !gene2Expression || gene1Expression.length === 0 || gene2Expression.length === 0) {
      return null;
    }

    return {
      g1: sliceForCohort(gene1Expression),
      g2: sliceForCohort(gene2Expression),
      snames: cohortMeta.snames,
      cohortName: cohortMeta.cohortName,
      color: cohortMeta.color,
      slicedA: [],
      slicedB: [],
    };
  }, [
    isGeneSetMode,
    geneSetAExpressions,
    geneSetBExpressions,
    signatureMethod,
    gene1Expression,
    gene2Expression,
    cohortMeta,
    isTcgaGtex,
    selectedCohort,
  ]);

  // Pairwise M x K gene-set correlation matrix
  const pairwiseMatrix = useMemo(() => {
    if (!isGeneSetMode || !filteredExpressionData || filteredExpressionData.slicedA.length === 0 || filteredExpressionData.slicedB.length === 0) {
      return null;
    }
    const { slicedA, slicedB } = filteredExpressionData;
    const n = cohortMeta.snames.length;
    const rows = slicedA.map((a) => {
      const cells = slicedB.map((b) => {
        const val = matrixMetric === "pearson"
          ? calculatePearson(a.rawVals, b.rawVals)
          : calculateSpearman(a.rawVals, b.rawVals);
        const pVal = calculateCorrelationPValue(val, n);
        return {
          geneA: a.gene,
          geneB: b.gene,
          r: Number(val.toFixed(3)),
          pVal,
        };
      });
      return { geneA: a.gene, cells };
    });
    return {
      genesA: slicedA.map((a) => a.gene),
      genesB: slicedB.map((b) => b.gene),
      rows,
    };
  }, [isGeneSetMode, filteredExpressionData, matrixMetric, cohortMeta.snames.length]);

  // Generate co-expression scatter data & regression statistics
  const correlationData = useMemo(() => {
    if (!filteredExpressionData) {
      return {
        points: [],
        trendline: [],
        r: 0,
        rho: 0,
        pVal: 1,
        m: 0,
        b: 0,
        bounds: { minX: 0, maxX: 10, minY: 0, maxY: 10 },
      };
    }

    const { g1, g2, snames } = filteredExpressionData;
    const numSamples = g1.length;
    const dataPoints = [];

    for (let i = 0; i < numSamples; i++) {
      dataPoints.push({
        sample: snames[i] || `Sample ${i + 1}`,
        x: g1[i],
        y: g2[i],
      });
    }

    const xVals = dataPoints.map((d) => d.x);
    const yVals = dataPoints.map((d) => d.y);
    const meanX = xVals.reduce((a, b) => a + b, 0) / numSamples;
    const meanY = yVals.reduce((a, b) => a + b, 0) / numSamples;

    let num = 0;
    let denX = 0;
    let denY = 0;
    for (let i = 0; i < numSamples; i++) {
      const dx = xVals[i] - meanX;
      const dy = yVals[i] - meanY;
      num += dx * dy;
      denX += dx * dx;
      denY += dy * dy;
    }

    const r = denX && denY ? num / Math.sqrt(denX * denY) : 0;
    const rho = calculateSpearman(xVals, yVals);
    const pVal = calculateCorrelationPValue(r, numSamples);

    const m = denX ? num / denX : 0;
    const b = meanY - m * meanX;

    const minX = Math.min(...xVals);
    const maxX = Math.max(...xVals);

    const trendline = [
      { x: minX, trend: Number((m * minX + b).toFixed(3)) },
      { x: maxX, trend: Number((m * maxX + b).toFixed(3)) },
    ];

    return {
      points: dataPoints,
      trendline,
      r: Number(r.toFixed(3)),
      rho: Number(rho.toFixed(3)),
      pVal,
      m: Number(m.toFixed(3)),
      b: Number(b.toFixed(3)),
      bounds: {
        minX: Number((minX - 0.2).toFixed(1)),
        maxX: Number((maxX + 0.2).toFixed(1)),
        minY: Number((Math.min(...yVals) - 0.5).toFixed(1)),
        maxY: Number((Math.max(...yVals) + 0.5).toFixed(1)),
      },
    };
  }, [filteredExpressionData]);

  const xLabelTitle = useMemo(() => {
    const hasCustomLabelA = geneSetALabel && geneSetALabel !== gene1Name && geneSetALabel !== "Gene Set A";
    if (!isGeneSetMode) {
      return hasCustomLabelA ? `${geneSetALabel} (${gene1Name})` : gene1Name;
    }
    const genesList = geneSetAExpressions.map((g) => g.gene);
    if (genesList.length === 1 && !hasCustomLabelA) {
      return genesList[0];
    }
    const suffix = genesList.length <= 4 ? genesList.join(", ") : `${genesList.slice(0, 3).join(", ")} +${genesList.length - 3} more`;
    return `${geneSetALabel || "Set A"} (${suffix})`;
  }, [isGeneSetMode, gene1Name, geneSetALabel, geneSetAExpressions]);

  const yLabelTitle = useMemo(() => {
    const hasCustomLabelB = geneSetBLabel && geneSetBLabel !== gene2Name && geneSetBLabel !== "Gene Set B";
    if (!isGeneSetMode) {
      return hasCustomLabelB ? `${geneSetBLabel} (${gene2Name})` : gene2Name;
    }
    const genesList = geneSetBExpressions.map((g) => g.gene);
    if (genesList.length === 1 && !hasCustomLabelB) {
      return genesList[0];
    }
    const suffix = genesList.length <= 4 ? genesList.join(", ") : `${genesList.slice(0, 3).join(", ")} +${genesList.length - 3} more`;
    return `${geneSetBLabel || "Set B"} (${suffix})`;
  }, [isGeneSetMode, gene2Name, geneSetBLabel, geneSetBExpressions]);

  const unitSuffix = useMemo(() => {
    if (isGeneSetMode) {
      return signatureMethod === "zscore" ? "Mean Z-Score" : "Mean log₂ Expr";
    }
    return "log₂(TPM + 0.001)";
  }, [isGeneSetMode, signatureMethod]);

  if (!filteredExpressionData) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col items-center justify-center h-[350px] text-slate-400 font-mono text-xs">
        {isTcgaGtex && !gene1Expression && geneSetAExpressions.length === 0 ? (
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-500"></div>
            <span>Loading expression data buffer (27.7 MB) for correlation...</span>
          </div>
        ) : (
          <span>
            {isGeneSetMode
              ? "Please add at least 1 gene to both Gene Set A and Gene Set B above to compute signature correlation."
              : "Please select two genes in the controls above to plot correlation."}
          </span>
        )}
      </div>
    );
  }

  const { points, trendline, r, rho, pVal, m, b, bounds } = correlationData;

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      if (data.trend !== undefined) return null;
      return (
        <div className="bg-slate-950 border border-slate-700 p-2.5 rounded-lg text-xs shadow-xl font-mono">
          <div className="font-semibold text-teal-400 mb-1">{data.sample}</div>
          <div>
            <span className="text-slate-400">{isGeneSetMode ? geneSetALabel : gene1Name}:</span> {data.x.toFixed(3)}
          </div>
          <div>
            <span className="text-slate-400">{isGeneSetMode ? geneSetBLabel : gene2Name}:</span> {data.y.toFixed(3)}
          </div>
        </div>
      );
    }
    return null;
  };

  // High-res export for Pairwise Cross-Correlation Matrix
  const generateHighResMatrixCanvas = (theme: "light" | "dark" = "light", size: number = 2400): HTMLCanvasElement => {
    const offscreen = document.createElement("canvas");
    offscreen.width = size;
    offscreen.height = size;
    const ctx = offscreen.getContext("2d");
    if (!ctx || !pairwiseMatrix) return offscreen;

    const virtualSize = 2400;
    ctx.scale(size / virtualSize, size / virtualSize);
    const isLight = theme === "light";

    ctx.fillStyle = isLight ? "#ffffff" : "#020617";
    ctx.fillRect(0, 0, virtualSize, virtualSize);

    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 50px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Pairwise Gene-Set Correlation: ${geneSetALabel} vs. ${geneSetBLabel}`, 100, 85);

    const cohortLabel = isTcgaGtex ? (filteredExpressionData?.cohortName || "TCGA/GTEx") : `GSE225767 SBRT Cohort (N = ${samples.length})`;
    ctx.fillStyle = isLight ? "#334155" : "#94a3b8";
    ctx.font = "bold 30px monospace";
    ctx.fillText(`${cohortLabel} · Metric: ${matrixMetric === "pearson" ? "Pearson r" : "Spearman ρ"} · Set Score r = ${r} (p = ${formatPValue(pVal)})`, 100, 136);

    const nRows = pairwiseMatrix.genesA.length;
    const nCols = pairwiseMatrix.genesB.length;
    const padLeft = 320;
    const padTop = 320;
    const padRight = 140;
    const padBottom = 220;
    const gridW = virtualSize - padLeft - padRight;
    const gridH = virtualSize - padTop - padBottom;
    const cellW = gridW / Math.max(1, nCols);
    const cellH = gridH / Math.max(1, nRows);

    const getCorrColor = (val: number) => {
      const clamped = Math.max(-1, Math.min(1, val));
      if (clamped >= 0) {
        const t = clamped;
        const rC = Math.round(248 + (220 - 248) * t);
        const gC = Math.round(250 + (38 - 250) * t);
        const bC = Math.round(252 + (38 - 252) * t);
        return `rgb(${rC}, ${gC}, ${bC})`;
      } else {
        const t = -clamped;
        const rC = Math.round(248 + (37 - 248) * t);
        const gC = Math.round(250 + (99 - 250) * t);
        const bC = Math.round(252 + (235 - 252) * t);
        return `rgb(${rC}, ${gC}, ${bC})`;
      }
    };

    // Draw column headers (Gene Set B)
    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    const labelFontPx = Math.min(34, Math.max(18, Math.floor(Math.min(cellW, cellH) * 0.35)));
    ctx.font = `bold ${labelFontPx}px monospace`;
    pairwiseMatrix.genesB.forEach((gB, colIdx) => {
      const cx = padLeft + colIdx * cellW + cellW / 2;
      const cy = padTop - 20;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-Math.PI / 4);
      ctx.textAlign = "left";
      ctx.fillText(gB, 0, 0);
      ctx.restore();
    });

    // Draw rows and cells
    pairwiseMatrix.rows.forEach((row, rowIdx) => {
      const ry = padTop + rowIdx * cellH;
      ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
      ctx.font = `bold ${labelFontPx}px monospace`;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(row.geneA, padLeft - 20, ry + cellH / 2);

      row.cells.forEach((cell, colIdx) => {
        const cx = padLeft + colIdx * cellW;
        ctx.fillStyle = getCorrColor(cell.r);
        ctx.fillRect(cx, ry, cellW, cellH);
        ctx.strokeStyle = isLight ? "#cbd5e1" : "#334155";
        ctx.lineWidth = 2;
        ctx.strokeRect(cx, ry, cellW, cellH);

        if (nRows <= 20 && nCols <= 20) {
          const valFont = Math.min(28, Math.max(14, Math.floor(Math.min(cellW, cellH) * 0.26)));
          ctx.font = `bold ${valFont}px monospace`;
          ctx.fillStyle = Math.abs(cell.r) > 0.5 ? "#ffffff" : "#0f172a";
          ctx.textAlign = "center";
          ctx.fillText(cell.r.toFixed(2), cx + cellW / 2, ry + cellH / 2);
        }
      });
    });
    ctx.textBaseline = "alphabetic";

    return offscreen;
  };

  const generateHighResCorrelationCanvas = (theme: "light" | "dark" = "light", size: number = 2400): HTMLCanvasElement => {
    if (isGeneSetMode && geneSetViewMode === "matrix" && pairwiseMatrix) {
      return generateHighResMatrixCanvas(theme, size);
    }

    const offscreen = document.createElement("canvas");
    offscreen.width = size;
    offscreen.height = size;
    const ctx = offscreen.getContext("2d");
    if (!ctx) return offscreen;

    const virtualSize = 2400;
    ctx.scale(size / virtualSize, size / virtualSize);
    const isLight = theme === "light";

    // 1. Background
    ctx.fillStyle = isLight ? "#ffffff" : "#020617";
    ctx.fillRect(0, 0, virtualSize, virtualSize);

    // 2. Title & Subtitle Header
    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 50px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "left";
    const headerTitle = isGeneSetMode
      ? `Gene-Set Signature Correlation: ${geneSetALabel} vs. ${geneSetBLabel}`
      : `Gene-Gene Co-Expression: ${gene1Name} vs. ${gene2Name}`;
    ctx.fillText(headerTitle, 100, 82);

    ctx.fillStyle = isLight ? "#334155" : "#94a3b8";
    ctx.font = "bold 28px monospace";
    const cohortLabel = isTcgaGtex ? (filteredExpressionData?.cohortName || "TCGA/GTEx") : `GSE225767 SBRT Cohort (N = ${samples.length})`;
    ctx.fillText(`${cohortLabel} · Pearson r = ${r} · Spearman ρ = ${rho} · p = ${formatPValue(pVal)}`, 100, 130);

    if (isGeneSetMode) {
      ctx.fillStyle = isLight ? "#475569" : "#64748b";
      ctx.font = "bold 22px monospace";
      const setAStr = geneSetAExpressions.map((g) => g.gene).join(", ");
      const setBStr = geneSetBExpressions.map((g) => g.gene).join(", ");
      ctx.fillText(`Set A (${geneSetAExpressions.length}): ${setAStr.slice(0, 75)}${setAStr.length > 75 ? "..." : ""} | Set B (${geneSetBExpressions.length}): ${setBStr.slice(0, 75)}${setBStr.length > 75 ? "..." : ""}`, 100, 172);
    }

    // 3. Layout Dimensions
    const padLeft = 240;
    const padRight = 100;
    const padTop = 240;
    const padBottom = 240;
    const plotW = virtualSize - padLeft - padRight;
    const plotH = virtualSize - padTop - padBottom;

    const minX = bounds.minX;
    const maxX = bounds.maxX;
    const minY = bounds.minY;
    const maxY = bounds.maxY;

    const mapX = (x: number) => padLeft + ((x - minX) / (maxX - minX)) * plotW;
    const mapY = (y: number) => padTop + plotH - ((y - minY) / (maxY - minY)) * plotH;

    // 4. Grid Lines
    ctx.strokeStyle = isLight ? "rgba(226, 232, 240, 0.9)" : "rgba(30, 41, 59, 0.6)";
    ctx.lineWidth = 1.5;

    const numTicks = 6;
    for (let i = 0; i <= numTicks; i++) {
      const yVal = minY + (i / numTicks) * (maxY - minY);
      const py = mapY(yVal);
      ctx.beginPath();
      ctx.moveTo(padLeft, py);
      ctx.lineTo(padLeft + plotW, py);
      ctx.stroke();

      ctx.fillStyle = isLight ? "#475569" : "#94a3b8";
      ctx.font = "bold 36px monospace";
      ctx.textAlign = "right";
      ctx.fillText(yVal.toFixed(1), padLeft - 24, py + 12);

      const xVal = minX + (i / numTicks) * (maxX - minX);
      const px = mapX(xVal);
      ctx.beginPath();
      ctx.moveTo(px, padTop);
      ctx.lineTo(px, padTop + plotH);
      ctx.stroke();

      ctx.textAlign = "center";
      ctx.fillText(xVal.toFixed(1), px, padTop + plotH + 46);
    }

    // 5. Axes Box
    ctx.strokeStyle = isLight ? "#0f172a" : "#64748b";
    ctx.lineWidth = 4;
    ctx.strokeRect(padLeft, padTop, plotW, plotH);

    // Axis Titles
    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 40px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${xLabelTitle} [${unitSuffix}]`, padLeft + plotW / 2, padTop + plotH + 115);

    ctx.save();
    ctx.translate(padLeft - 120, padTop + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${yLabelTitle} [${unitSuffix}]`, 0, 0);
    ctx.restore();

    // 6. Linear Regression Trendline
    const trendX1 = minX;
    const trendY1 = m * trendX1 + b;
    const trendX2 = maxX;
    const trendY2 = m * trendX2 + b;

    ctx.strokeStyle = isLight ? "#d97706" : "#f59e0b";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(mapX(trendX1), mapY(trendY1));
    ctx.lineTo(mapX(trendX2), mapY(trendY2));
    ctx.stroke();

    // 7. Scatter Points
    const ptColor = filteredExpressionData?.color || "#14b8a6";
    points.forEach(p => {
      const px = mapX(p.x);
      const py = mapY(p.y);

      ctx.beginPath();
      ctx.arc(px, py, 14, 0, Math.PI * 2);
      ctx.fillStyle = ptColor;
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1.0;
      ctx.strokeStyle = isLight ? "rgba(15,23,42,0.35)" : "rgba(255,255,255,0.45)";
      ctx.lineWidth = 2.5;
      ctx.stroke();
    });

    // 8. Statistics Summary Card (Top-Left inside plot)
    const cardX = padLeft + 40;
    const cardY = padTop + 40;
    const cardW = 700;
    const cardH = 290;

    ctx.fillStyle = isLight ? "rgba(248, 250, 252, 0.96)" : "rgba(11, 19, 41, 0.96)";
    ctx.fillRect(cardX, cardY, cardW, cardH);
    ctx.strokeStyle = isLight ? "#cbd5e1" : "#1e293b";
    ctx.lineWidth = 2.5;
    ctx.strokeRect(cardX, cardY, cardW, cardH);

    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 34px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(isGeneSetMode ? "Signature Correlation" : "Correlation Statistics", cardX + 32, cardY + 52);

    ctx.font = "bold 28px monospace";
    ctx.fillStyle = isLight ? "#0d9488" : "#2dd4bf";
    ctx.fillText(`Pearson r  = ${r} (p = ${formatPValue(pVal)})`, cardX + 32, cardY + 106);
    ctx.fillText(`Spearman ρ = ${rho}`, cardX + 32, cardY + 152);

    ctx.fillStyle = isLight ? "#334155" : "#94a3b8";
    ctx.font = "bold 26px monospace";
    ctx.fillText(`Fit: y = ${m}x ${b >= 0 ? `+ ${b.toFixed(2)}` : `- ${Math.abs(b).toFixed(2)}`} (N=${points.length})`, cardX + 32, cardY + 202);
    if (isGeneSetMode) {
      ctx.font = "bold 22px monospace";
      ctx.fillText(`Method: ${signatureMethod === "zscore" ? "Mean Z-Score" : "Mean log2 Expr"} (${geneSetAExpressions.length} vs ${geneSetBExpressions.length} genes)`, cardX + 32, cardY + 248);
    }

    return offscreen;
  };

  const exportTag = isGeneSetMode
    ? `${(geneSetALabel || "SetA").replace(/\s+/g, "_")}_vs_${(geneSetBLabel || "SetB").replace(/\s+/g, "_")}`
    : `${gene1Name}_vs_${gene2Name}`;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col h-full w-full">
      {/* Top Header Row: Title & Action Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 pb-3 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-slate-200 font-semibold text-base">
              {isGeneSetMode ? "Gene-Set Signature Co-Expression" : "Gene-Gene Co-Expression"}
            </h3>
            {isGeneSetMode && (
              <span className="bg-teal-500/15 text-teal-300 border border-teal-500/30 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold">
                {geneSetAExpressions.length} × {geneSetBExpressions.length} genes
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {isTcgaGtex ? filteredExpressionData?.cohortName : `Expression levels across SBRT samples (N = ${samples.length})`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Scatter vs Pairwise Matrix toggle in Gene-Set Mode */}
          {isGeneSetMode && (
            <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 font-mono text-[10px]">
              <button
                type="button"
                onClick={() => setGeneSetViewMode("scatter")}
                className={`px-2 py-1 rounded-md transition cursor-pointer ${
                  geneSetViewMode === "scatter"
                    ? "bg-teal-500/20 text-teal-300 border border-teal-500/40 font-bold"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Signature Scatter
              </button>
              <button
                type="button"
                onClick={() => setGeneSetViewMode("matrix")}
                className={`px-2 py-1 rounded-md transition cursor-pointer ${
                  geneSetViewMode === "matrix"
                    ? "bg-teal-500/20 text-teal-300 border border-teal-500/40 font-bold"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Pairwise Matrix ({geneSetAExpressions.length}×{geneSetBExpressions.length})
              </button>
            </div>
          )}

          {/* Cohort Selector (TCGA-GTEx only) */}
          {isTcgaGtex && (
            <div className="flex items-center gap-1 text-[10px] font-mono text-slate-300 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800">
              <span className="text-slate-400">Cohort:</span>
              <select
                value={selectedCohort}
                onChange={(e) => setSelectedCohort(e.target.value as any)}
                className="bg-transparent border-0 text-slate-200 focus:outline-none cursor-pointer font-semibold text-[10px]"
              >
                <option value="tumor" className="bg-slate-950">TCGA Tumor (Default)</option>
                <option value="gtex" className="bg-slate-950">GTEx Normal</option>
                <option value="all" className="bg-slate-950">Pooled Cohorts</option>
              </select>
            </div>
          )}

          <ExportButton
            onExportCSV={() => {
              if (isGeneSetMode && geneSetViewMode === "matrix" && pairwiseMatrix) {
                exportToCSV({
                  filename: `Pairwise_Correlation_Matrix_${exportTag}.csv`,
                  metadata: {
                    dataset: isTcgaGtex ? `TCGA-PAAD / GTEx (${selectedCohort})` : "GSE225767 Bulk RNA-seq",
                    module: "Pairwise Gene-Set Cross-Correlation Matrix",
                    selectedGene: `${geneSetALabel} (${pairwiseMatrix.genesA.join(";")}) vs ${geneSetBLabel} (${pairwiseMatrix.genesB.join(";")})`,
                    filters: `Metric: ${matrixMetric}, Composite Pearson r: ${r}, Spearman rho: ${rho}`,
                  },
                  headers: ["Set A Gene", ...pairwiseMatrix.genesB],
                  rows: pairwiseMatrix.rows.map((row) => [row.geneA, ...row.cells.map((c) => c.r)]),
                });
                return;
              }
              if (!points || points.length === 0) return;
              exportToCSV({
                filename: `Correlation_${exportTag}.csv`,
                metadata: {
                  dataset: isTcgaGtex ? `TCGA-PAAD / GTEx (${selectedCohort})` : "GSE225767 Bulk RNA-seq",
                  module: isGeneSetMode ? `Gene-Set Signature Correlation (${signatureMethod})` : "Gene-Gene Co-Expression Correlation",
                  selectedGene: isGeneSetMode
                    ? `${geneSetALabel} [${geneSetAExpressions.map(g => g.gene).join(";")}] vs ${geneSetBLabel} [${geneSetBExpressions.map(g => g.gene).join(";")}]`
                    : `${gene1Name} vs ${gene2Name}`,
                  filters: `Pearson r: ${r}, Spearman rho: ${rho}, p-value: ${formatPValue(pVal)}, m: ${m}, b: ${b}, Total Points: ${points.length}`,
                },
                headers: ["Sample", `${isGeneSetMode ? geneSetALabel : gene1Name} (${unitSuffix})`, `${isGeneSetMode ? geneSetBLabel : gene2Name} (${unitSuffix})`],
                rows: points.map((p) => [p.sample, p.x, p.y]),
              });
            }}
            onExportPNG={({ theme = "light" } = {}) => {
              const exportCanvas = generateHighResCorrelationCanvas(theme, 2400);
              exportCanvasToPNG({
                canvas: exportCanvas,
                filename: `Correlation_${exportTag}.png`,
                theme,
              });
            }}
            onExportSVG={({ theme = "light" } = {}) => {
              const exportCanvas = generateHighResCorrelationCanvas(theme, 1200);
              exportCanvasToSVG({
                canvas: exportCanvas,
                filename: `Correlation_${exportTag}.svg`,
                theme,
              });
            }}
          />
        </div>
      </div>

      {/* Summary Statistics Sub-Bar */}
      <div className="flex items-center justify-between flex-wrap gap-2 text-[10px] font-mono bg-slate-950/60 px-2.5 py-1 rounded-md border border-slate-850 mb-2.5">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-teal-400 font-bold">
            Pearson r = <span className="text-slate-100">{r}</span>
          </span>
          <span className="text-slate-300">
            Spearman &rho; = <span className="text-slate-100">{rho}</span>
          </span>
          <span className="text-amber-400">
            p = <span className="text-slate-100">{formatPValue(pVal)}</span>
          </span>
        </div>
        <span className="text-slate-400">
          Fit: <span className="text-slate-200">y = {m}x {b >= 0 ? `+ ${b.toFixed(2)}` : `- ${Math.abs(b).toFixed(2)}`}</span>
        </span>
      </div>

      {/* Warning message for pooled exploratory mode */}
      {isTcgaGtex && selectedCohort === "all" && (
        <div className="bg-purple-950/10 border border-purple-900/40 p-2.5 rounded-lg mb-3 flex gap-2 text-xxs font-mono text-purple-300">
          <AlertTriangle className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Methodological Warning:</strong> Pooling independent tumor ($n=178$) and normal ($n=167$) cohorts can create cohort-driven artificial correlations driven by global cohort differences rather than biological gene-gene co-regulation in the same cells. Use with caution.
          </p>
        </div>
      )}

      {/* Render either Pairwise Cross-Correlation Matrix OR Scatter Plot */}
      {isGeneSetMode && geneSetViewMode === "matrix" && pairwiseMatrix ? (
        <div className="flex-1 flex flex-col min-h-[280px] overflow-auto">
          <div className="flex items-center justify-between mb-2 text-[10px] font-mono text-slate-400">
            <span>Rows: <strong className="text-teal-300">{geneSetALabel}</strong> · Columns: <strong className="text-amber-300">{geneSetBLabel}</strong></span>
            <div className="flex items-center gap-1.5">
              <span>Metric:</span>
              <select
                value={matrixMetric}
                onChange={(e) => setMatrixMetric(e.target.value as "pearson" | "spearman")}
                className="bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-slate-200 text-[10px]"
              >
                <option value="pearson">Pearson r</option>
                <option value="spearman">Spearman ρ</option>
              </select>
            </div>
          </div>
          <div className="overflow-auto border border-slate-800 rounded-lg bg-slate-950/70 flex-1">
            <table className="w-full border-collapse text-[11px] font-mono">
              <thead>
                <tr>
                  <th className="p-2 border-b border-r border-slate-800 bg-slate-900/90 text-left text-slate-400 sticky left-0 top-0 z-10">
                    Set A \ Set B
                  </th>
                  {pairwiseMatrix.genesB.map((gB) => (
                    <th key={gB} className="p-2 border-b border-slate-800 bg-slate-900/90 text-center text-amber-300 font-bold sticky top-0">
                      {gB}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pairwiseMatrix.rows.map((row) => (
                  <tr key={row.geneA} className="border-b border-slate-800/50 last:border-0">
                    <td className="p-2 border-r border-slate-800 bg-slate-900/80 font-bold text-teal-300 sticky left-0">
                      {row.geneA}
                    </td>
                    {row.cells.map((cell) => {
                      const intensity = Math.min(1, Math.abs(cell.r));
                      const bg = cell.r >= 0
                        ? `rgba(239, 68, 68, ${0.08 + intensity * 0.65})`
                        : `rgba(59, 130, 246, ${0.08 + intensity * 0.65})`;
                      const sigStars = cell.pVal < 0.001 ? "***" : cell.pVal < 0.01 ? "**" : cell.pVal < 0.05 ? "*" : "";
                      return (
                        <td
                          key={`${cell.geneA}-${cell.geneB}`}
                          style={{ backgroundColor: bg }}
                          className="p-2 text-center text-slate-100 border-r border-slate-800/40 last:border-0 transition hover:brightness-125"
                          title={`${cell.geneA} vs ${cell.geneB}: ${matrixMetric === "pearson" ? "r" : "ρ"} = ${cell.r} (p = ${formatPValue(cell.pVal)})`}
                        >
                          <div className="font-bold leading-tight">{cell.r.toFixed(2)}{sigStars}</div>
                          <div className="text-[9px] text-slate-300/80">p={formatPValue(cell.pVal)}</div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div ref={chartContainerRef} className="flex-1 w-full h-[280px] min-h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart margin={{ top: 10, right: 10, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.03)" />
              <XAxis
                type="number"
                dataKey="x"
                name={xLabelTitle}
                domain={[bounds.minX, bounds.maxX]}
                stroke="#64748b"
                tickLine={false}
                axisLine={{ stroke: "#475569" }}
                tick={{ fontSize: 10 }}
                label={{
                  value: `${xLabelTitle} [${unitSuffix}]`,
                  position: "bottom",
                  offset: 5,
                  fill: "#94a3b8",
                  fontSize: 10,
                  fontWeight: "bold",
                }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name={yLabelTitle}
                domain={[bounds.minY, bounds.maxY]}
                stroke="#64748b"
                tickLine={false}
                axisLine={{ stroke: "#475569" }}
                tick={{ fontSize: 10 }}
                label={{
                  value: `${yLabelTitle} [${unitSuffix}]`,
                  angle: -90,
                  position: "insideLeft",
                  offset: 12,
                  fill: "#94a3b8",
                  fontSize: 10,
                  fontWeight: "bold",
                  style: { textAnchor: "middle" }
                }}
              />
              <ZAxis type="number" range={[45, 45]} />
              <Tooltip content={<CustomTooltip />} />

              {/* Trendline */}
              <Line
                data={trendline}
                type="linear"
                dataKey="trend"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
                activeDot={false}
                legendType="none"
                tooltipType="none"
              />

              {/* Scatter points */}
              <Scatter
                name="Expression samples"
                data={points}
                fill={filteredExpressionData?.color || "#14b8a6"}
                stroke="rgba(255,255,255,0.15)"
                strokeWidth={0.5}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
