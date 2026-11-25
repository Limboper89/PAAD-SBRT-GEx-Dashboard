"use client";

import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  Grid3X3,
  Plus,
  X,
  AlertTriangle,
  ArrowRightLeft,
  Sparkles,
  Trash2,
} from "lucide-react";
import ExportButton from "@/components/ExportButton";
import SearchableGeneSelect from "@/components/SearchableGeneSelect";
import {
  exportCanvasToPNG,
  exportCanvasToSVG,
  exportToCSV,
  PUB_FONT_SANS,
  PUB_FONT_NUM,
  drawFittedText,
  formatPublicationPValue,
} from "@/utils/exportUtils";
import {
  CptacProteinRecord,
  CptacMrnaOnlyRecord,
  CptacClinicalSample,
  CptacPreset,
} from "@/types/cptac";
import {
  PROT_SAMPLE_COLS,
  PROT_TUMOR_COUNT,
  PROT_NAT_COUNT,
  MRNA_SAMPLE_COLS,
  MRNA_TUMOR_COUNT,
  MRNA_NAT_COUNT,
  CURATED_20_NRF2_PANEL,
  sliceMatrixRow,
  pearsonAndSpearman,
} from "@/utils/cptacEngine";

interface CptacHeatmapAndCorrelationProps {
  proteins: CptacProteinRecord[];
  mrnaOnly: CptacMrnaOnlyRecord[];
  protBuffer: ArrayBuffer | null;
  mrnaBuffer: ArrayBuffer | null;
  tumorIds: string[];
  normalIds: string[];
  mrnaNormalIds: string[];
  clinicalSamples: CptacClinicalSample[];
  curatedPresets: CptacPreset[];
  panelGenes: string[];
  onChangePanelGenes: (genes: string[]) => void;
}

type OmicLayer = "protein" | "mrna";
type SampleOrderMode = "group_stage" | "signature_score";
type SigCohort = "tumor" | "nat" | "pooled";
type ColorBy = "cohort" | "stage" | "cellularity";
type CorrSubView = "scatter" | "matrix";

type StageGroup = "NAT" | "Stage I" | "Stage II" | "Stage III" | "Stage IV" | "Unknown";

function getStageGroup(stage: string, isTumor: boolean): StageGroup {
  if (!isTumor) return "NAT";
  const s = stage.toUpperCase();
  if (s.includes("IV")) return "Stage IV";
  if (s.includes("III")) return "Stage III";
  if (s.includes("II")) return "Stage II";
  if (s.includes("I")) return "Stage I";
  return "Unknown";
}

function getStageShortLabel(grp: StageGroup): string {
  switch (grp) {
    case "Stage I":
      return "I";
    case "Stage II":
      return "II";
    case "Stage III":
      return "III";
    case "Stage IV":
      return "IV";
    case "Unknown":
      return "?";
    default:
      return "";
  }
}

function getStageRank(stage: string, isTumor: boolean): number {
  if (!isTumor) return 0;
  const s = stage.toUpperCase().trim();
  if (s === "STAGE IA") return 1;
  if (s === "STAGE IB") return 2;
  if (s.includes("STAGE I") && !s.includes("II") && !s.includes("III") && !s.includes("IV")) return 2.5;
  if (s === "STAGE IIA") return 3;
  if (s === "STAGE IIB") return 4;
  if (s.includes("STAGE II") && !s.includes("III")) return 4.5;
  if (s.includes("STAGE III")) return 5;
  if (s.includes("STAGE IV")) return 6;
  return 7;
}

function getStageColor(stage: string, isTumor: boolean, light: boolean): string {
  const grp = getStageGroup(stage, isTumor);
  switch (grp) {
    case "NAT":
      return light ? "#cbd5e1" : "#334155";
    case "Stage I":
      return light ? "#7c3aed" : "#a78bfa";
    case "Stage II":
      return light ? "#0284c7" : "#38bdf8";
    case "Stage III":
      return light ? "#d97706" : "#f59e0b";
    case "Stage IV":
      return light ? "#e11d48" : "#f43f5e";
    default:
      return light ? "#94a3b8" : "#64748b";
  }
}

function interpolateRdBu(z: number): string {
  const clamped = Math.max(-2.5, Math.min(2.5, z));
  const t = (clamped + 2.5) / 5.0; // 0 (blue) -> 0.5 (white/slate) -> 1 (red)
  if (t <= 0.5) {
    const f = t / 0.5; // 0..1
    const r = Math.round(37 + f * (248 - 37));
    const g = Math.round(99 + f * (250 - 99));
    const b = Math.round(235 + f * (252 - 235));
    return `rgb(${r},${g},${b})`;
  }
  const f = (t - 0.5) / 0.5;
  const r = Math.round(248 - f * (248 - 220));
  const g = Math.round(250 - f * (250 - 38));
  const b = Math.round(252 - f * (252 - 38));
  return `rgb(${r},${g},${b})`;
}

export default function CptacHeatmapAndCorrelation({
  proteins,
  mrnaOnly,
  protBuffer,
  mrnaBuffer,
  tumorIds,
  normalIds,
  mrnaNormalIds,
  clinicalSamples,
  curatedPresets,
  panelGenes,
  onChangePanelGenes,
}: CptacHeatmapAndCorrelationProps) {
  const [heatmapOmic, setHeatmapOmic] = useState<OmicLayer>("protein");
  const [sampleFilter, setSampleFilter] = useState<"all" | "tumor">("all");
  const [orderMode, setOrderMode] = useState<SampleOrderMode>("group_stage");
  const [pasteText, setPasteText] = useState<string>("");
  const [showPasteBox, setShowPasteBox] = useState<boolean>(false);

  // Within-layer Co-Expression state (uses active heatmapOmic: Protein vs Protein or mRNA vs mRNA)
  const [corrSubView, setCorrSubView] = useState<CorrSubView>("matrix");
  const sigAOmi: OmicLayer = heatmapOmic;
  const sigBOmi: OmicLayer = heatmapOmic;
  const [sigAGenes, setSigAGenes] = useState<string[]>(["KRAS"]);
  const [sigBGenes, setSigBGenes] = useState<string[]>(["KRT19"]);
  const [sigCohort, setSigCohort] = useState<SigCohort>("tumor");
  const [sigColorBy, setSigColorBy] = useState<ColorBy>("stage");

  const [isLightTheme, setIsLightTheme] = useState<boolean>(() => {
    if (typeof document !== "undefined") {
      return document.documentElement.classList.contains("light");
    }
    return false;
  });

  useEffect(() => {
    const onTheme = () => {
      setIsLightTheme(document.documentElement.classList.contains("light"));
    };
    window.addEventListener("bioportal:theme", onTheme);
    return () => window.removeEventListener("bioportal:theme", onTheme);
  }, []);

  const hmCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hmWrapperRef = useRef<HTMLDivElement | null>(null);
  const [hmDim, setHmDim] = useState({ width: 900, height: 420 });
  const [hmHover, setHmHover] = useState<{
    sampleId: string;
    tissue: string;
    stage: string;
    gene: string;
    z: number | null;
    raw: number | null;
    clientX: number;
    clientY: number;
  } | null>(null);

  const corrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const corrWrapperRef = useRef<HTMLDivElement | null>(null);
  const [corrDim, setCorrDim] = useState({ width: 580, height: 380 });
  const [corrHover, setCorrHover] = useState<{
    caseId: string;
    tissue: string;
    stage: string;
    x: number;
    y: number;
    clientX: number;
    clientY: number;
  } | null>(null);

  useEffect(() => {
    const el = hmWrapperRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const nextW = Math.max(360, Math.round(rect.width));
      const nextH = Math.max(320, Math.round(rect.height));
      setHmDim((prev) =>
        prev.width === nextW && prev.height === nextH
          ? prev
          : { width: nextW, height: nextH }
      );
    };
    measure();
    const obs = new ResizeObserver((entries) => {
      for (const e of entries) {
        const nextW = Math.max(360, Math.round(e.contentRect.width));
        const nextH = Math.max(320, Math.round(e.contentRect.height));
        setHmDim((prev) =>
          prev.width === nextW && prev.height === nextH
            ? prev
            : { width: nextW, height: nextH }
        );
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (corrSubView !== "scatter") return;
    const el = corrWrapperRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const nextW = Math.max(320, Math.round(rect.width));
      const nextH = Math.max(320, Math.round(rect.height));
      setCorrDim((prev) =>
        prev.width === nextW && prev.height === nextH
          ? prev
          : { width: nextW, height: nextH }
      );
    };
    measure();
    const obs = new ResizeObserver((entries) => {
      for (const e of entries) {
        const nextW = Math.max(320, Math.round(e.contentRect.width));
        const nextH = Math.max(320, Math.round(e.contentRect.height));
        setCorrDim((prev) =>
          prev.width === nextW && prev.height === nextH
            ? prev
            : { width: nextW, height: nextH }
        );
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [corrSubView]);

  const protLookup = useMemo(() => {
    const map = new Map<string, CptacProteinRecord>();
    for (const p of proteins) map.set(p.g.toUpperCase(), p);
    return map;
  }, [proteins]);

  const mrnaOnlyLookup = useMemo(() => {
    const map = new Map<string, CptacMrnaOnlyRecord>();
    for (const m of mrnaOnly) map.set(m.g.toUpperCase(), m);
    return map;
  }, [mrnaOnly]);

  const allSearchOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of proteins) set.add(p.g);
    for (const m of mrnaOnly) set.add(m.g);
    return Array.from(set).sort();
  }, [proteins, mrnaOnly]);

  const activeOmicSearchOptions = useMemo(() => {
    if (heatmapOmic === "protein") {
      return proteins.map((p) => p.g).sort();
    }
    const set = new Set<string>();
    for (const p of proteins) {
      if (p.mi !== null && p.mi !== undefined) set.add(p.g);
    }
    for (const m of mrnaOnly) set.add(m.g);
    return Array.from(set).sort();
  }, [heatmapOmic, proteins, mrnaOnly]);

  const clinByTumorIdx = useMemo(() => {
    const map = new Map<number, CptacClinicalSample>();
    for (const c of clinicalSamples) map.set(c.tumor_idx, c);
    return map;
  }, [clinicalSamples]);

  const normalProtIdxMap = useMemo(() => {
    const map = new Map<string, number>();
    normalIds.forEach((cid, idx) => map.set(cid, PROT_TUMOR_COUNT + idx));
    return map;
  }, [normalIds]);

  const getGeneVectorForOmic = (
    geneSymbol: string,
    omic: OmicLayer
  ): number[] | null => {
    const key = geneSymbol.toUpperCase();
    const p = protLookup.get(key);
    if (omic === "protein") {
      if (!p || !protBuffer) return null;
      return sliceMatrixRow(protBuffer, p.pi, PROT_SAMPLE_COLS);
    }
    const mi = p?.mi ?? mrnaOnlyLookup.get(key)?.mi ?? null;
    if (mi === null || !mrnaBuffer) return null;
    return sliceMatrixRow(mrnaBuffer, mi, MRNA_SAMPLE_COLS);
  };

  // Build Heatmap matrix rows & sorted column metadata
  const heatmapData = useMemo(() => {
    const activeBuffer = heatmapOmic === "protein" ? protBuffer : mrnaBuffer;
    const totalCols =
      heatmapOmic === "protein" ? PROT_SAMPLE_COLS : MRNA_SAMPLE_COLS;
    const tumorCount =
      heatmapOmic === "protein" ? PROT_TUMOR_COUNT : MRNA_TUMOR_COUNT;
    const natCount =
      heatmapOmic === "protein" ? PROT_NAT_COUNT : MRNA_NAT_COUNT;
    const natList = heatmapOmic === "protein" ? normalIds : mrnaNormalIds;

    const quantifiedRows: Array<{
      gene: string;
      zVals: number[];
      rawVals: number[];
    }> = [];
    const skippedGenes: string[] = [];

    for (const g of panelGenes) {
      const vec = getGeneVectorForOmic(g, heatmapOmic);
      if (!vec || !activeBuffer) {
        skippedGenes.push(g);
        continue;
      }
      const colsToUse = sampleFilter === "tumor" ? tumorCount : totalCols;
      const sliced = vec.slice(0, colsToUse);
      const finite = sliced.filter(Number.isFinite);
      if (finite.length < 3) {
        skippedGenes.push(g);
        continue;
      }
      const mean = finite.reduce((a, b) => a + b, 0) / finite.length;
      const sd = Math.sqrt(
        finite.reduce((s, v) => s + (v - mean) ** 2, 0) / (finite.length - 1)
      );
      const zVals = sliced.map((v) =>
        Number.isFinite(v) && sd > 1e-8 ? (v - mean) / sd : Number.NaN
      );
      quantifiedRows.push({ gene: g, zVals, rawVals: sliced });
    }

    const colCount = sampleFilter === "tumor" ? tumorCount : totalCols;
    const colMeta = Array.from({ length: colCount }, (_, idx) => {
      const isTumor = idx < tumorCount;
      const clin = isTumor ? clinByTumorIdx.get(idx) : undefined;
      const caseId = isTumor
        ? tumorIds[idx] || clin?.case_id || `Tumor_${idx}`
        : `${natList[idx - tumorCount] || `NAT_${idx - tumorCount}`} (NAT)`;
      let sigSum = 0;
      let sigCnt = 0;
      for (const r of quantifiedRows) {
        const zv = r.zVals[idx];
        if (Number.isFinite(zv)) {
          sigSum += zv;
          sigCnt++;
        }
      }
      const sigScore = sigCnt > 0 ? sigSum / sigCnt : 0;
      return {
        colIdx: idx,
        caseId,
        isTumor,
        stage: isTumor ? clin?.stage || "Unknown" : "Normal NAT",
        sigScore,
      };
    });

    colMeta.sort((a, b) => {
      if (a.isTumor !== b.isTumor) return a.isTumor ? 1 : -1; // NAT left, Tumor right
      if (orderMode === "signature_score") {
        return a.sigScore - b.sigScore;
      }
      return (
        getStageRank(a.stage, a.isTumor) - getStageRank(b.stage, b.isTumor) ||
        a.sigScore - b.sigScore
      );
    });

    return {
      quantifiedRows,
      skippedGenes,
      colMeta,
      tumorCount,
      natCount: sampleFilter === "tumor" ? 0 : natCount,
    };
  }, [
    panelGenes,
    heatmapOmic,
    sampleFilter,
    orderMode,
    protBuffer,
    mrnaBuffer,
    protLookup,
    mrnaOnlyLookup,
    tumorIds,
    normalIds,
    mrnaNormalIds,
    clinByTumorIdx,
  ]);

  const hmPad = { top: 64, right: 24, bottom: 24, left: 82 };

  const drawHeatmapToCtx = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    light: boolean,
    isPub: boolean = false
  ) => {
    const { quantifiedRows, colMeta } = heatmapData;
    if (quantifiedRows.length === 0 || colMeta.length === 0) return;

    const pad = isPub
      ? { top: 410, right: 80, bottom: 470, left: 450 }
      : hmPad;
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    if (isPub) {
      ctx.fillStyle = light ? "#ffffff" : "#020617";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = light ? "#0f172a" : "#f8fafc";
      ctx.textAlign = "left";
      drawFittedText(
        ctx,
        `CPTAC-PDAC Multi-${
          heatmapOmic === "protein" ? "Protein" : "Gene mRNA"
        } Heatmap (Z-Score)`,
        80,
        110,
        w - 160,
        98,
        "bold",
        PUB_FONT_SANS
      );
      ctx.fillStyle = light ? "#334155" : "#94a3b8";
      drawFittedText(
        ctx,
        `Cao et al., Cell 2021 · ${quantifiedRows.length} features × ${colMeta.length} samples (${
          heatmapData.natCount > 0
            ? `${heatmapData.natCount} NAT, ${heatmapData.tumorCount} Tumor`
            : `${heatmapData.tumorCount} Primary Tumors`
        })`,
        80,
        180,
        w - 160,
        54,
        "bold",
        PUB_FONT_NUM
      );
    }

    const cw = plotW / colMeta.length;
    const rh = plotH / quantifiedRows.length;
    const tissueH = isPub ? 44 : 10;
    const stageH = isPub ? 52 : 12;
    const trackGap = isPub ? 12 : 3;
    const stageTrackY = pad.top - stageH - (isPub ? 18 : 6);
    const tissueTrackY = stageTrackY - tissueH - trackGap;

    // Track 1: Tissue Type (NAT vs Tumor) & Track 2: AJCC Stage
    colMeta.forEach((col, cIdx) => {
      const cx = pad.left + cIdx * cw;
      const cellW = Math.max(1, cw + 0.45);
      ctx.fillStyle = col.isTumor ? "#f43f5e" : "#10b981";
      ctx.fillRect(cx, tissueTrackY, cellW, tissueH);

      ctx.fillStyle = getStageColor(col.stage, col.isTumor, light);
      ctx.fillRect(cx, stageTrackY, cellW, stageH);
    });

    // Left-side labels for Tissue & Stage annotation tracks
    ctx.fillStyle = light ? "#334155" : "#94a3b8";
    ctx.font = isPub ? `bold 46px ${PUB_FONT_SANS}` : "600 10px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(
      "Tissue",
      pad.left - (isPub ? 26 : 8),
      tissueTrackY + tissueH * 0.78
    );
    ctx.fillText(
      "Stage",
      pad.left - (isPub ? 26 : 8),
      stageTrackY + stageH * 0.76
    );

    // Inline Stage block labels (I, II, III, IV) when sorted by Tissue -> Stage
    if (orderMode === "group_stage") {
      let runStart = 0;
      while (runStart < colMeta.length) {
        const grp = getStageGroup(colMeta[runStart].stage, colMeta[runStart].isTumor);
        let runEnd = runStart + 1;
        while (
          runEnd < colMeta.length &&
          getStageGroup(colMeta[runEnd].stage, colMeta[runEnd].isTumor) === grp
        ) {
          runEnd++;
        }
        if (grp !== "NAT") {
          const rx = pad.left + runStart * cw;
          const rw = (runEnd - runStart) * cw;
          if (runStart > 0 && colMeta[runStart - 1].isTumor) {
            ctx.strokeStyle = light ? "rgba(15,23,42,0.5)" : "rgba(2,6,23,0.75)";
            ctx.lineWidth = isPub ? 3.5 : 1;
            ctx.beginPath();
            ctx.moveTo(rx, stageTrackY);
            ctx.lineTo(rx, stageTrackY + stageH);
            ctx.stroke();
          }
          if (rw >= (isPub ? 52 : 16)) {
            ctx.fillStyle = "#ffffff";
            ctx.font = isPub ? `bold 38px ${PUB_FONT_SANS}` : "700 9.5px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(
              getStageShortLabel(grp),
              rx + rw / 2,
              stageTrackY + stageH * 0.76
            );
          }
        }
        runStart = runEnd;
      }
    }

    // Track legend headers above Tissue bar
    ctx.font = isPub ? `bold 50px ${PUB_FONT_SANS}` : "600 10px sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = light ? "#047857" : "#34d399";
    if (heatmapData.natCount > 0) {
      ctx.fillText(
        `NAT (n=${heatmapData.natCount})`,
        pad.left,
        tissueTrackY - (isPub ? 22 : 5)
      );
    }
    const tumorStartCol = colMeta.findIndex((c) => c.isTumor);
    if (tumorStartCol >= 0) {
      ctx.fillStyle = light ? "#be123c" : "#fb7185";
      ctx.fillText(
        `Primary PDAC Tumor (n=${heatmapData.tumorCount})`,
        pad.left + tumorStartCol * cw,
        tissueTrackY - (isPub ? 22 : 5)
      );
    }

    // Cells
    const pubGeneFont = Math.min(64, Math.max(36, Math.round(rh * 0.68)));
    quantifiedRows.forEach((row, rIdx) => {
      const ry = pad.top + rIdx * rh;
      colMeta.forEach((col, cIdx) => {
        const cx = pad.left + cIdx * cw;
        const zv = row.zVals[col.colIdx];
        ctx.fillStyle = Number.isFinite(zv)
          ? interpolateRdBu(zv)
          : light
          ? "#cbd5e1"
          : "#1e293b";
        ctx.fillRect(cx, ry, Math.max(1, cw + 0.45), Math.max(1, rh + 0.45));
      });

      // Gene label
      ctx.fillStyle = light ? "#0f172a" : "#f1f5f9";
      ctx.font = isPub
        ? `bold ${pubGeneFont}px ${PUB_FONT_SANS}`
        : `600 ${Math.min(12, Math.max(9, rh * 0.72))}px monospace`;
      ctx.textAlign = "right";
      ctx.fillText(row.gene, pad.left - (isPub ? 26 : 8), ry + rh * 0.7);
    });

    // Boundary separator NAT vs Tumor
    if (tumorStartCol > 0) {
      const bx = pad.left + tumorStartCol * cw;
      ctx.strokeStyle = light ? "#0f172a" : "#ffffff";
      ctx.lineWidth = isPub ? 5 : 1.5;
      ctx.beginPath();
      ctx.moveTo(bx, tissueTrackY);
      ctx.lineTo(bx, pad.top + plotH);
      ctx.stroke();
    }

    // Bottom Horizontal Colorbar + AJCC Stage Legend on Pub export (GEPIA2-calibrated)
    if (isPub) {
      // 1. AJCC Stage Legend row
      const stageLegY = pad.top + plotH + 92;
      const stageItems: Array<{ label: string; color: string }> = [
        { label: "Stage I", color: getStageColor("Stage I", true, light) },
        { label: "Stage II", color: getStageColor("Stage II", true, light) },
        { label: "Stage III", color: getStageColor("Stage III", true, light) },
        { label: "Stage IV", color: getStageColor("Stage IV", true, light) },
        { label: "Unknown", color: getStageColor("Unknown", true, light) },
        { label: "NAT", color: getStageColor("Normal NAT", false, light) },
      ];
      ctx.font = `bold 48px ${PUB_FONT_SANS}`;
      ctx.textAlign = "left";
      let sx = 80;
      ctx.fillStyle = light ? "#0f172a" : "#f8fafc";
      ctx.fillText("Stage:", sx, stageLegY);
      sx += ctx.measureText("Stage:").width + 32;
      stageItems.forEach((it) => {
        ctx.fillStyle = it.color;
        ctx.fillRect(sx, stageLegY - 36, 36, 36);
        ctx.strokeStyle = light ? "#475569" : "#64748b";
        ctx.lineWidth = 2.5;
        ctx.strokeRect(sx, stageLegY - 36, 36, 36);
        ctx.fillStyle = light ? "#1e293b" : "#cbd5e1";
        ctx.fillText(it.label, sx + 48, stageLegY);
        sx += 48 + ctx.measureText(it.label).width + 42;
      });

      // 2. Horizontal Row Z-Score Colorbar
      const legendW = 980;
      const legendH = 48;
      const legendX = w / 2 - legendW / 2 - 140;
      const legendY = pad.top + plotH + 250;

      ctx.fillStyle = light ? "#0f172a" : "#f8fafc";
      ctx.font = `bold 64px ${PUB_FONT_SANS}`;
      ctx.textAlign = "center";
      ctx.fillText("Relative Abundance (Row Z-Score)", legendX + legendW / 2, legendY - 28);

      for (let px = 0; px < legendW; px++) {
        const z = -2.5 + (px / legendW) * 5.0;
        ctx.fillStyle = interpolateRdBu(z);
        ctx.fillRect(legendX + px, legendY, 2, legendH);
      }
      ctx.strokeStyle = light ? "#0f172a" : "#64748b";
      ctx.lineWidth = 3.5;
      ctx.strokeRect(legendX, legendY, legendW, legendH);

      ctx.fillStyle = light ? "#0f172a" : "#cbd5e1";
      ctx.font = `bold 56px ${PUB_FONT_NUM}`;
      ctx.textAlign = "center";
      [
        { lbl: "-2.5", pos: 0 },
        { lbl: "0.0", pos: 0.5 },
        { lbl: "+2.5", pos: 1.0 },
      ].forEach((t) => {
        const tx = legendX + t.pos * legendW;
        ctx.beginPath();
        ctx.moveTo(tx, legendY + legendH);
        ctx.lineTo(tx, legendY + legendH + 14);
        ctx.stroke();
        ctx.fillText(t.lbl, tx, legendY + legendH + 70);
      });

      // NA Swatch next to colorbar
      const naX = legendX + legendW + 90;
      ctx.fillStyle = light ? "#cbd5e1" : "#1e293b";
      ctx.fillRect(naX, legendY, 48, 48);
      ctx.strokeStyle = light ? "#0f172a" : "#64748b";
      ctx.lineWidth = 3;
      ctx.strokeRect(naX, legendY, 48, 48);
      ctx.fillStyle = light ? "#334155" : "#cbd5e1";
      ctx.font = `bold 52px ${PUB_FONT_SANS}`;
      ctx.textAlign = "left";
      ctx.fillText("NA", naX + 64, legendY + 42);
    }
  };

  useEffect(() => {
    const canvas = hmCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(hmDim.width * dpr);
    canvas.height = Math.round(hmDim.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, hmDim.width, hmDim.height);
    drawHeatmapToCtx(ctx, hmDim.width, hmDim.height, isLightTheme, false);
  }, [heatmapData, hmDim, isLightTheme, heatmapOmic, orderMode]);

  const handleHeatmapMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = hmCanvasRef.current;
    const { quantifiedRows, colMeta } = heatmapData;
    if (!canvas || quantifiedRows.length === 0 || colMeta.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / Math.max(1, rect.width)) * hmDim.width;
    const my = ((e.clientY - rect.top) / Math.max(1, rect.height)) * hmDim.height;
    const plotW = hmDim.width - hmPad.left - hmPad.right;
    const plotH = hmDim.height - hmPad.top - hmPad.bottom;
    const topTrackLimit = hmPad.top - 32;
    if (
      mx < hmPad.left ||
      mx > hmPad.left + plotW ||
      my < topTrackLimit ||
      my > hmPad.top + plotH
    ) {
      setHmHover(null);
      return;
    }
    const cIdx = Math.min(
      colMeta.length - 1,
      Math.max(0, Math.floor(((mx - hmPad.left) / plotW) * colMeta.length))
    );
    const col = colMeta[cIdx];
    if (my < hmPad.top) {
      setHmHover({
        sampleId: col.caseId,
        tissue: col.isTumor ? "Primary Tumor" : "Normal NAT",
        stage: col.stage,
        gene: "Sample Metadata",
        z: null,
        raw: null,
        clientX: e.clientX,
        clientY: e.clientY,
      });
      return;
    }
    const rIdx = Math.min(
      quantifiedRows.length - 1,
      Math.max(0, Math.floor(((my - hmPad.top) / plotH) * quantifiedRows.length))
    );
    const row = quantifiedRows[rIdx];
    const zVal = row.zVals[col.colIdx];
    const rawVal = row.rawVals[col.colIdx];
    setHmHover({
      sampleId: col.caseId,
      tissue: col.isTumor ? "Primary Tumor" : "Normal NAT",
      stage: col.stage,
      gene: row.gene,
      z: Number.isFinite(zVal) ? zVal : null,
      raw: Number.isFinite(rawVal) ? rawVal : null,
      clientX: e.clientX,
      clientY: e.clientY,
    });
  };

  // Signature-vs-Signature Computation (supports independent X/Y omic!)
  const sigCorrelationData = useMemo(() => {
    if (!protBuffer && !mrnaBuffer) {
      return {
        points: [] as Array<{
          caseId: string;
          tissue: "Tumor" | "NAT";
          stage: string;
          cellularity: number | null;
          x: number;
          y: number;
        }>,
        stats: null as ReturnType<typeof pearsonAndSpearman> | null,
        usedA: [] as string[],
        usedB: [] as string[],
      };
    }

    // Build cohort sample mapping: caseId, tumor/nat, pCol, mCol, clin
    interface CohortItem {
      caseId: string;
      tissue: "Tumor" | "NAT";
      pCol: number | null;
      mCol: number | null;
      stage: string;
      cellularity: number | null;
    }
    const items: CohortItem[] = [];
    if (sigCohort === "tumor" || sigCohort === "pooled") {
      for (let i = 0; i < tumorIds.length; i++) {
        const clin = clinByTumorIdx.get(i);
        items.push({
          caseId: tumorIds[i] || `Tumor_${i}`,
          tissue: "Tumor",
          pCol: i,
          mCol: i,
          stage: clin?.stage || "Unknown",
          cellularity: clin?.neoplastic_cellularity ?? null,
        });
      }
    }
    if (sigCohort === "nat" || sigCohort === "pooled") {
      // If either axis uses mRNA, iterate mrnaNormalIds and match protein col if present; else iterate normalIds
      if (sigAOmi === "mrna" || sigBOmi === "mrna") {
        mrnaNormalIds.forEach((cid, mIdx) => {
          const pCol = normalProtIdxMap.get(cid) ?? null;
          items.push({
            caseId: `${cid} (NAT)`,
            tissue: "NAT",
            pCol,
            mCol: MRNA_TUMOR_COUNT + mIdx,
            stage: "Normal NAT",
            cellularity: 0,
          });
        });
      } else {
        normalIds.forEach((cid, pIdx) => {
          items.push({
            caseId: `${cid} (NAT)`,
            tissue: "NAT",
            pCol: PROT_TUMOR_COUNT + pIdx,
            mCol: null,
            stage: "Normal NAT",
            cellularity: 0,
          });
        });
      }
    }

    const computeSigScores = (genes: string[], omic: OmicLayer) => {
      const used: string[] = [];
      const zColsPerSample = new Array<number>(items.length).fill(0);
      const cntPerSample = new Array<number>(items.length).fill(0);

      for (const g of genes) {
        const vec = getGeneVectorForOmic(g, omic);
        if (!vec) continue;
        const vals: number[] = [];
        items.forEach((it) => {
          const idx = omic === "protein" ? it.pCol : it.mCol;
          if (idx !== null && Number.isFinite(vec[idx])) vals.push(vec[idx]);
        });
        if (vals.length < 5) continue;
        used.push(g);
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        const sd = Math.sqrt(
          vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (vals.length - 1)
        );
        if (sd < 1e-8) continue;

        items.forEach((it, idxSample) => {
          const idx = omic === "protein" ? it.pCol : it.mCol;
          if (idx !== null && Number.isFinite(vec[idx])) {
            zColsPerSample[idxSample] += (vec[idx] - mean) / sd;
            cntPerSample[idxSample]++;
          }
        });
      }

      const scores = items.map((_, i) =>
        cntPerSample[i] > 0 ? zColsPerSample[i] / cntPerSample[i] : Number.NaN
      );
      return { scores, used };
    };

    const resA = computeSigScores(sigAGenes, sigAOmi);
    const resB = computeSigScores(sigBGenes, sigBOmi);

    const pts = items
      .map((it, idx) => ({
        caseId: it.caseId,
        tissue: it.tissue,
        stage: it.stage,
        cellularity: it.cellularity,
        x: resA.scores[idx],
        y: resB.scores[idx],
      }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

    const stats = pearsonAndSpearman(
      pts.map((p) => p.x),
      pts.map((p) => p.y)
    );
    return { points: pts, stats, usedA: resA.used, usedB: resB.used };
  }, [
    sigAGenes,
    sigBGenes,
    sigAOmi,
    sigBOmi,
    sigCohort,
    protBuffer,
    mrnaBuffer,
    protLookup,
    mrnaOnlyLookup,
    tumorIds,
    normalIds,
    mrnaNormalIds,
    normalProtIdxMap,
    clinByTumorIdx,
  ]);

  // Pairwise Correlation Matrix across active panelGenes in heatmapOmic
  const pairwiseMatrix = useMemo(() => {
    const validGenes: Array<{ gene: string; vec: number[] }> = [];
    for (const g of panelGenes) {
      const vec = getGeneVectorForOmic(g, heatmapOmic);
      if (vec) validGenes.push({ gene: g, vec: vec.slice(0, PROT_TUMOR_COUNT) });
    }
    const n = validGenes.length;
    const mat: number[][] = Array.from({ length: n }, () => new Array(n).fill(1));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const res = pearsonAndSpearman(validGenes[i].vec, validGenes[j].vec);
        mat[i][j] = res.r;
        mat[j][i] = res.r;
      }
    }
    return { genes: validGenes.map((v) => v.gene), mat };
  }, [panelGenes, heatmapOmic, protBuffer, mrnaBuffer, protLookup, mrnaOnlyLookup]);

  const corrPad = { top: 28, right: 24, bottom: 52, left: 58 };
  const corrBounds = useMemo(() => {
    const pts = sigCorrelationData.points;
    if (pts.length === 0) return { minX: -2, maxX: 2, minY: -2, maxY: 2 };
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const dx = Math.max(0.3, (maxX - minX) * 0.1);
    const dy = Math.max(0.3, (maxY - minY) * 0.12);
    return { minX: minX - dx, maxX: maxX + dx, minY: minY - dy, maxY: maxY + dy };
  }, [sigCorrelationData.points]);

  const drawCorrScatterToCtx = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    light: boolean,
    isPub: boolean = false
  ) => {
    const { points, stats, usedA, usedB } = sigCorrelationData;
    const pad = isPub
      ? { top: 300, right: 90, bottom: 310, left: 320 }
      : corrPad;
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    if (isPub) {
      ctx.fillStyle = light ? "#ffffff" : "#020617";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = light ? "#0f172a" : "#f8fafc";
      ctx.textAlign = "left";
      const omicLabel = heatmapOmic === "protein" ? "Protein" : "mRNA";
      const titleStr =
        usedA.length <= 2 && usedB.length <= 2
          ? `Co-Expression (${omicLabel}): ${usedA.join("+")} vs. ${usedB.join("+")}`
          : `Signature Correlation (${omicLabel})`;
      drawFittedText(ctx, titleStr, 90, 110, w - 180, 100, "bold", PUB_FONT_SANS);

      ctx.fillStyle = light ? "#334155" : "#94a3b8";
      const cohortStr =
        sigCohort === "tumor"
          ? "Primary Tumors"
          : sigCohort === "nat"
          ? "Normal NAT Controls"
          : "Pooled Tumor + NAT";
      drawFittedText(
        ctx,
        `CPTAC-PDAC · ${cohortStr} (n = ${stats?.n ?? 0})${
          stats && stats.n >= 3
            ? ` · r = ${stats.r.toFixed(3)} · ρ = ${stats.rho.toFixed(3)}`
            : ""
        }`,
        90,
        180,
        w - 180,
        56,
        "bold",
        PUB_FONT_NUM
      );

      // Color legend strip below subtitle
      const legItems =
        sigColorBy === "stage"
          ? [
              { label: "Stage I", color: getStageColor("Stage I", true, light) },
              { label: "Stage II", color: getStageColor("Stage II", true, light) },
              { label: "Stage III", color: getStageColor("Stage III", true, light) },
              { label: "Stage IV", color: getStageColor("Stage IV", true, light) },
              { label: "Unknown", color: getStageColor("Unknown", true, light) },
              ...(sigCohort !== "tumor" ? [{ label: "NAT", color: "#10b981" }] : []),
            ]
          : sigColorBy === "cellularity"
          ? [
              { label: "<25% Cell.", color: "#38bdf8" },
              { label: "25–44%", color: "#f59e0b" },
              { label: "≥45%", color: "#e11d48" },
              ...(sigCohort !== "tumor" ? [{ label: "NAT", color: "#10b981" }] : []),
            ]
          : [
              { label: "Primary Tumor", color: light ? "#0284c7" : "#38bdf8" },
              ...(sigCohort !== "tumor" ? [{ label: "Normal NAT", color: "#10b981" }] : []),
            ];
      let lx = 90;
      const ly = 252;
      ctx.font = `bold 46px ${PUB_FONT_SANS}`;
      ctx.textAlign = "left";
      for (const item of legItems) {
        ctx.beginPath();
        ctx.arc(lx + 16, ly - 14, 15, 0, Math.PI * 2);
        ctx.fillStyle = item.color;
        ctx.fill();
        ctx.fillStyle = light ? "#334155" : "#cbd5e1";
        ctx.fillText(item.label, lx + 44, ly);
        lx += 44 + ctx.measureText(item.label).width + 44;
      }
    }

    const mapX = (xv: number) =>
      pad.left +
      ((xv - corrBounds.minX) / (corrBounds.maxX - corrBounds.minX)) * plotW;
    const mapY = (yv: number) =>
      pad.top +
      plotH -
      ((yv - corrBounds.minY) / (corrBounds.maxY - corrBounds.minY)) * plotH;

    ctx.font = isPub ? `bold 70px ${PUB_FONT_NUM}` : "11px sans-serif";
    for (let i = 0; i <= 5; i++) {
      const xv = corrBounds.minX + (i / 5) * (corrBounds.maxX - corrBounds.minX);
      const px = mapX(xv);
      ctx.strokeStyle = light
        ? isPub
          ? "rgba(226,232,240,0.9)"
          : "rgba(100,116,139,0.16)"
        : "rgba(148,163,184,0.1)";
      ctx.lineWidth = isPub ? 2.5 : 1;
      ctx.beginPath();
      ctx.moveTo(px, pad.top);
      ctx.lineTo(px, pad.top + plotH);
      ctx.stroke();
      ctx.fillStyle = light ? "#1e293b" : "#94a3b8";
      ctx.textAlign = "center";
      ctx.fillText(xv.toFixed(1), px, pad.top + plotH + (isPub ? 84 : 18));

      const yv = corrBounds.minY + (i / 5) * (corrBounds.maxY - corrBounds.minY);
      const py = mapY(yv);
      ctx.beginPath();
      ctx.moveTo(pad.left, py);
      ctx.lineTo(pad.left + plotW, py);
      ctx.stroke();
      ctx.textAlign = "right";
      ctx.fillText(yv.toFixed(1), pad.left - (isPub ? 30 : 8), py + (isPub ? 24 : 4));
    }

    ctx.strokeStyle = light ? (isPub ? "#0f172a" : "#475569") : "#64748b";
    ctx.lineWidth = isPub ? 6 : 1.2;
    ctx.strokeRect(pad.left, pad.top, plotW, plotH);

    const xLbl =
      usedA.length <= 2
        ? `${usedA.join("+")} [${sigAOmi.toUpperCase()} Z-Score]`
        : `Signature A (${usedA.length} ${sigAOmi.toUpperCase()} Z-Score)`;
    const yLbl =
      usedB.length <= 2
        ? `${usedB.join("+")} [${sigBOmi.toUpperCase()} Z-Score]`
        : `Signature B (${usedB.length} ${sigBOmi.toUpperCase()} Z-Score)`;

    ctx.fillStyle = light ? "#0f172a" : "#f8fafc";
    ctx.textAlign = "center";
    if (isPub) {
      drawFittedText(
        ctx,
        xLbl,
        pad.left + plotW / 2,
        pad.top + plotH + 204,
        plotW,
        84,
        "bold",
        PUB_FONT_SANS
      );
      ctx.save();
      ctx.translate(92, pad.top + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      drawFittedText(ctx, yLbl, 0, 0, plotH, 84, "bold", PUB_FONT_SANS);
      ctx.restore();
    } else {
      ctx.font = "600 12px sans-serif";
      ctx.fillText(xLbl, pad.left + plotW / 2, h - 10);
      ctx.save();
      ctx.translate(16, pad.top + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(yLbl, 0, 0);
      ctx.restore();
    }

    const rPt = isPub ? 18 : 4.4;
    if (points.length === 0) {
      ctx.fillStyle = light ? "#475569" : "#94a3b8";
      ctx.font = isPub ? `bold 54px ${PUB_FONT_SANS}` : "600 12.5px sans-serif";
      ctx.textAlign = "center";
      const reason =
        sigAGenes.length === 0 || sigBGenes.length === 0
          ? "Select at least one feature for both X-Axis and Y-Axis signatures."
          : usedA.length === 0
          ? `X-Axis feature(s) not detected in ${sigAOmi === "protein" ? "TMT Global Proteomics" : "Matched mRNA"}.`
          : usedB.length === 0
          ? `Y-Axis feature(s) not detected in ${sigBOmi === "protein" ? "TMT Global Proteomics" : "Matched mRNA"}.`
          : "No overlapping quantified samples in selected cohort.";
      ctx.fillText(reason, pad.left + plotW / 2, pad.top + plotH / 2);
      return;
    }

    for (const p of points) {
      let fill = "#38bdf8";
      if (p.tissue === "NAT") fill = "#10b981";
      else if (sigColorBy === "stage") {
        fill = getStageColor(p.stage, true, light);
      } else if (sigColorBy === "cellularity") {
        const c = p.cellularity ?? 30;
        fill = c >= 45 ? "#e11d48" : c >= 25 ? "#f59e0b" : "#38bdf8";
      } else {
        fill = light ? "#0284c7" : "#38bdf8";
      }
      ctx.beginPath();
      ctx.arc(mapX(p.x), mapY(p.y), rPt, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = light ? "rgba(15,23,42,0.35)" : "rgba(15,23,42,0.85)";
      ctx.lineWidth = isPub ? 2.5 : 0.9;
      ctx.stroke();
    }

    if (stats && stats.n >= 3) {
      const y1 = stats.slope * corrBounds.minX + stats.intercept;
      const y2 = stats.slope * corrBounds.maxX + stats.intercept;
      ctx.save();
      ctx.beginPath();
      ctx.rect(pad.left, pad.top, plotW, plotH);
      ctx.clip();
      ctx.strokeStyle = light ? "#d97706" : "#fbbf24";
      ctx.lineWidth = isPub ? 8 : 2;
      ctx.beginPath();
      ctx.moveTo(mapX(corrBounds.minX), mapY(y1));
      ctx.lineTo(mapX(corrBounds.maxX), mapY(y2));
      ctx.stroke();
      ctx.restore();

      const bx = pad.left + (isPub ? 34 : 12);
      const by = pad.top + (isPub ? 34 : 10);
      const bw = isPub ? 1160 : 215;
      const bh = isPub ? 395 : 62;
      ctx.fillStyle = light ? "rgba(248,250,252,0.96)" : "rgba(11,19,41,0.94)";
      ctx.strokeStyle = light ? "#cbd5e1" : "#334155";
      ctx.lineWidth = isPub ? 3.5 : 1;
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeRect(bx, by, bw, bh);

      ctx.textAlign = "left";
      if (isPub) {
        ctx.fillStyle = light ? "#0f172a" : "#f8fafc";
        drawFittedText(ctx, "Correlation Statistics", bx + 36, by + 84, bw - 72, 62, "bold", PUB_FONT_SANS);

        ctx.fillStyle = light ? "#0d9488" : "#2dd4bf";
        drawFittedText(
          ctx,
          `Pearson r = ${stats.r.toFixed(3)} (p = ${formatPublicationPValue(stats.rP)})`,
          bx + 36,
          by + 174,
          bw - 72,
          56,
          "bold",
          PUB_FONT_NUM
        );
        drawFittedText(
          ctx,
          `Spearman ρ = ${stats.rho.toFixed(3)} (p = ${formatPublicationPValue(stats.rhoP)})`,
          bx + 36,
          by + 256,
          bw - 72,
          56,
          "bold",
          PUB_FONT_NUM
        );
        ctx.fillStyle = light ? "#334155" : "#94a3b8";
        drawFittedText(
          ctx,
          `Fit: y = ${stats.slope.toFixed(2)}x ${stats.intercept >= 0 ? "+" : "−"} ${Math.abs(stats.intercept).toFixed(2)} (N = ${stats.n})`,
          bx + 36,
          by + 338,
          bw - 72,
          54,
          "bold",
          PUB_FONT_NUM
        );
      } else {
        ctx.fillStyle = light ? "#0f172a" : "#f8fafc";
        ctx.font = "700 11.5px monospace";
        ctx.fillText(
          `Pearson r = ${stats.r.toFixed(4)} (${formatPublicationPValue(stats.rP)})`,
          bx + 9,
          by + 19
        );
        ctx.fillText(
          `Spearman rho = ${stats.rho.toFixed(4)} (${formatPublicationPValue(stats.rhoP)})`,
          bx + 9,
          by + 36
        );
        ctx.fillStyle = light ? "#475569" : "#94a3b8";
        ctx.font = "11px monospace";
        ctx.fillText(`n = ${stats.n}`, bx + 9, by + 53);
      }
    }
  };

  useEffect(() => {
    if (corrSubView !== "scatter") return;
    const canvas = corrCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(corrDim.width * dpr);
    canvas.height = Math.round(corrDim.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, corrDim.width, corrDim.height);
    drawCorrScatterToCtx(ctx, corrDim.width, corrDim.height, isLightTheme, false);
  }, [
    sigCorrelationData,
    corrDim,
    isLightTheme,
    corrSubView,
    sigColorBy,
    sigAOmi,
    sigBOmi,
    sigAGenes,
    sigBGenes,
  ]);

  const handleCorrMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = corrCanvasRef.current;
    if (!canvas || sigCorrelationData.points.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / Math.max(1, rect.width)) * corrDim.width;
    const my = ((e.clientY - rect.top) / Math.max(1, rect.height)) * corrDim.height;
    const plotW = corrDim.width - corrPad.left - corrPad.right;
    const plotH = corrDim.height - corrPad.top - corrPad.bottom;

    let best: (typeof sigCorrelationData.points)[0] | null = null;
    let bestD = 144;
    for (const p of sigCorrelationData.points) {
      const sx =
        corrPad.left +
        ((p.x - corrBounds.minX) / (corrBounds.maxX - corrBounds.minX)) * plotW;
      const sy =
        corrPad.top +
        plotH -
        ((p.y - corrBounds.minY) / (corrBounds.maxY - corrBounds.minY)) * plotH;
      const d2 = (mx - sx) ** 2 + (my - sy) ** 2;
      if (d2 < bestD) {
        bestD = d2;
        best = p;
      }
    }
    if (best) {
      setCorrHover({ ...best, clientX: e.clientX, clientY: e.clientY });
    } else {
      setCorrHover(null);
    }
  };

  const applyPasteGenes = () => {
    const parsed = pasteText
      .split(/[\s,;|\n\t]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (parsed.length === 0) return;
    const next = Array.from(new Set([...panelGenes, ...parsed]));
    onChangePanelGenes(next);
    setPasteText("");
    setShowPasteBox(false);
  };

  const renderPubHeatmapCanvas = (light: boolean) => {
    const c = document.createElement("canvas");
    c.width = 2400;
    c.height = 2400;
    const ctx = c.getContext("2d");
    if (ctx) drawHeatmapToCtx(ctx, 2400, 2400, light, true);
    return c;
  };

  const renderPubCorrCanvas = (light: boolean) => {
    const c = document.createElement("canvas");
    c.width = 2400;
    c.height = 2400;
    const ctx = c.getContext("2d");
    if (ctx) drawCorrScatterToCtx(ctx, 2400, 2400, light, true);
    return c;
  };

  const renderPubMatrixCanvas = (light: boolean) => {
    const size = 2400;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");
    if (!ctx || pairwiseMatrix.genes.length === 0) return c;

    ctx.fillStyle = light ? "#ffffff" : "#020617";
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = light ? "#0f172a" : "#f8fafc";
    ctx.textAlign = "left";
    drawFittedText(
      ctx,
      `Pairwise ${heatmapOmic === "protein" ? "Protein" : "mRNA"} Co-Expression Matrix`,
      90,
      110,
      size - 180,
      96,
      "bold",
      PUB_FONT_SANS
    );
    ctx.fillStyle = light ? "#334155" : "#94a3b8";
    drawFittedText(
      ctx,
      `CPTAC-PDAC Primary Tumors (n=140) · Pearson r (${pairwiseMatrix.genes.length}×${pairwiseMatrix.genes.length} features)`,
      90,
      180,
      size - 180,
      54,
      "bold",
      PUB_FONT_NUM
    );

    const n = pairwiseMatrix.genes.length;
    const padLeft = 400;
    const padTop = 430;
    const padRight = 100;
    const padBottom = 270;
    const gridW = size - padLeft - padRight;
    const gridH = size - padTop - padBottom;
    const cellW = gridW / Math.max(1, n);
    const cellH = gridH / Math.max(1, n);

    const getCorrColor = (val: number) => {
      const clamped = Math.max(-1, Math.min(1, val));
      if (clamped >= 0) {
        const t = clamped;
        const rC = Math.round(248 + (220 - 248) * t);
        const gC = Math.round(250 + (38 - 250) * t);
        const bC = Math.round(252 + (38 - 252) * t);
        return `rgb(${rC}, ${gC}, ${bC})`;
      }
      const t = -clamped;
      const rC = Math.round(248 + (37 - 248) * t);
      const gC = Math.round(250 + (99 - 250) * t);
      const bC = Math.round(252 + (235 - 252) * t);
      return `rgb(${rC}, ${gC}, ${bC})`;
    };

    const labelFontPx = Math.min(62, Math.max(36, Math.floor(Math.min(cellW, cellH) * 0.46)));
    ctx.fillStyle = light ? "#0f172a" : "#f8fafc";
    ctx.font = `bold ${labelFontPx}px ${PUB_FONT_NUM}`;
    pairwiseMatrix.genes.forEach((gCol, j) => {
      const cx = padLeft + j * cellW + cellW / 2;
      ctx.save();
      ctx.translate(cx, padTop - 26);
      ctx.rotate(-Math.PI / 4);
      ctx.textAlign = "left";
      ctx.fillText(gCol, 0, 0);
      ctx.restore();
    });

    pairwiseMatrix.genes.forEach((gRow, i) => {
      const ry = padTop + i * cellH;
      ctx.fillStyle = light ? "#0f172a" : "#f8fafc";
      ctx.font = `bold ${labelFontPx}px ${PUB_FONT_NUM}`;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(gRow, padLeft - 26, ry + cellH / 2);

      pairwiseMatrix.genes.forEach((_, j) => {
        const cx = padLeft + j * cellW;
        const val = pairwiseMatrix.mat[i][j];
        ctx.fillStyle = i === j ? (light ? "#e2e8f0" : "#1e293b") : getCorrColor(val);
        ctx.fillRect(cx, ry, cellW, cellH);
        ctx.strokeStyle = light ? "#cbd5e1" : "#334155";
        ctx.lineWidth = 2.5;
        ctx.strokeRect(cx, ry, cellW, cellH);

        if (n <= 20) {
          const valFont = Math.min(52, Math.max(30, Math.floor(Math.min(cellW, cellH) * 0.36)));
          ctx.font = `bold ${valFont}px ${PUB_FONT_NUM}`;
          ctx.fillStyle =
            i === j
              ? light
                ? "#475569"
                : "#94a3b8"
              : Math.abs(val) > 0.5
              ? "#ffffff"
              : "#0f172a";
          ctx.textAlign = "center";
          ctx.fillText(val.toFixed(2), cx + cellW / 2, ry + cellH / 2);
        }
      });
    });
    ctx.textBaseline = "alphabetic";

    // Bottom horizontal Pearson r colorbar
    const legW = 920;
    const legH = 44;
    const legX = size / 2 - legW / 2;
    const legY = size - 140;
    const grad = ctx.createLinearGradient(legX, legY, legX + legW, legY);
    grad.addColorStop(0, "rgb(37, 99, 235)");
    grad.addColorStop(0.5, "rgb(248, 250, 252)");
    grad.addColorStop(1, "rgb(220, 38, 38)");
    ctx.fillStyle = grad;
    ctx.fillRect(legX, legY, legW, legH);
    ctx.strokeStyle = light ? "#0f172a" : "#64748b";
    ctx.lineWidth = 3;
    ctx.strokeRect(legX, legY, legW, legH);
    ctx.fillStyle = light ? "#0f172a" : "#cbd5e1";
    ctx.font = `bold 54px ${PUB_FONT_NUM}`;
    ctx.textAlign = "center";
    ctx.fillText("-1.0", legX, legY + legH + 64);
    ctx.fillText("0.0", legX + legW / 2, legY + legH + 64);
    ctx.fillText("+1.0", legX + legW, legY + legH + 64);
    ctx.fillStyle = light ? "#0f172a" : "#f8fafc";
    ctx.font = `bold 62px ${PUB_FONT_SANS}`;
    ctx.fillText("Pearson Correlation (r)", size / 2, legY - 26);

    return c;
  };

  return (
    <div className="space-y-6">
      {/* Shared Gene / Protein Panel Builder */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Grid3X3 className="w-4 h-4 text-sky-400" />
              Active Multi-Protein / Multi-Gene Query Panel ({panelGenes.length} features)
            </h3>
            <p className="text-xs text-slate-400">
              Search individual proteins/genes or paste any custom list to render the heatmap and pairwise correlation matrix.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="w-64">
            <SearchableGeneSelect
              options={allSearchOptions}
              value=""
              onChange={(g) => {
                if (g && !panelGenes.includes(g)) {
                  onChangePanelGenes([...panelGenes, g]);
                }
              }}
              placeholder="+ Add gene / protein..."
            />
          </div>
          <button
            onClick={() => setShowPasteBox((v) => !v)}
            className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-950 text-xs text-slate-300 hover:border-sky-500/50 flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Paste Gene List
          </button>
          <button
            onClick={() => onChangePanelGenes([])}
            className="px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-950 text-xs text-slate-400 hover:text-rose-400 flex items-center gap-1"
          >
            <Trash2 className="w-3 h-3" /> Clear
          </button>
        </div>

        {showPasteBox && (
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={2}
              placeholder="Paste gene symbols separated by commas, spaces, or newlines (e.g. NQO1, HMOX1, GPX4, SLC7A11)..."
              className="flex-1 rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-slate-200 placeholder-slate-500 font-mono"
            />
            <button
              onClick={applyPasteGenes}
              className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white shrink-0"
            >
              Add Parsed Genes
            </button>
          </div>
        )}

        {/* Active Gene Chips */}
        <div className="flex flex-wrap gap-1.5">
          {panelGenes.map((g) => {
            const hasProt = protLookup.has(g.toUpperCase());
            return (
              <span
                key={g}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono border ${
                  hasProt
                    ? "border-slate-700 bg-slate-950 text-slate-200"
                    : "border-amber-500/40 bg-amber-950/30 text-amber-200"
                }`}
                title={
                  hasProt
                    ? "Quantified in both TMT Global Proteomics and RNA-seq"
                    : "Quantified in RNA-seq only (not in TMT proteomics matrix)"
                }
              >
                {g}
                {!hasProt && <span className="text-[9px] text-amber-400">(RNA)</span>}
                <button
                  onClick={() =>
                    onChangePanelGenes(panelGenes.filter((x) => x !== g))
                  }
                  className="text-slate-500 hover:text-rose-400"
                  aria-label={`Remove ${g}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
        </div>
      </div>

      {/* Section 1: Multi-Protein / Multi-Gene Heatmap */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-100">
              Multi-{heatmapOmic === "protein" ? "Protein" : "Gene mRNA"} Abundance Heatmap (Z-Score)
            </h3>
            <p className="text-xs text-slate-400">
              {heatmapOmic === "protein"
                ? "75 Normal Adjacent Tissues vs. 140 Primary Tumors (log2 TMT intensity row Z-score; NA cells rendered muted slate)"
                : "21 Normal Adjacent Tissues vs. 140 Primary Tumors (log2 RSEM UQ row Z-score)"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-slate-700 bg-slate-950 p-0.5 text-xs">
              <button
                onClick={() => setHeatmapOmic("protein")}
                className={`px-2.5 py-1 rounded-md font-medium ${
                  heatmapOmic === "protein"
                    ? "bg-sky-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Global Protein (215)
              </button>
              <button
                onClick={() => setHeatmapOmic("mrna")}
                className={`px-2.5 py-1 rounded-md font-medium ${
                  heatmapOmic === "mrna"
                    ? "bg-emerald-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Matched mRNA (161)
              </button>
            </div>

            <select
              value={sampleFilter}
              onChange={(e) => setSampleFilter(e.target.value as "all" | "tumor")}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-200"
            >
              <option value="all">NAT + Primary Tumors</option>
              <option value="tumor">Primary Tumors Only (140)</option>
            </select>

            <select
              value={orderMode}
              onChange={(e) => setOrderMode(e.target.value as SampleOrderMode)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-200"
            >
              <option value="group_stage">Sort: Tissue &rarr; Stage</option>
              <option value="signature_score">Sort: Panel Z-Score</option>
            </select>

            <ExportButton
              label="Export Heatmap"
              size="sm"
              disabled={heatmapData.quantifiedRows.length === 0}
              onExportCSV={() =>
                exportToCSV({
                  filename: `CPTAC_PDAC_${heatmapOmic}_Heatmap_ZScores.csv`,
                  metadata: {
                    dataset: "CPTAC-PDAC (Cao et al., Cell 2021)",
                    module: `Multi-${heatmapOmic} Heatmap`,
                    filters: sampleFilter,
                  },
                  headers: [
                    "Feature",
                    ...heatmapData.colMeta.map((c) => c.caseId),
                  ],
                  rows: heatmapData.quantifiedRows.map((r) => [
                    r.gene,
                    ...heatmapData.colMeta.map((c) =>
                      Number.isFinite(r.zVals[c.colIdx])
                        ? Number(r.zVals[c.colIdx].toFixed(4))
                        : "NA"
                    ),
                  ]),
                })
              }
              onExportPNG={(opts) =>
                exportCanvasToPNG({
                  canvas: renderPubHeatmapCanvas(opts?.theme === "light"),
                  filename: `CPTAC_PDAC_${heatmapOmic}_Heatmap.png`,
                  theme: opts?.theme || "light",
                })
              }
              onExportSVG={(opts) =>
                exportCanvasToSVG({
                  canvas: renderPubHeatmapCanvas(opts?.theme === "light"),
                  filename: `CPTAC_PDAC_${heatmapOmic}_Heatmap.svg`,
                  theme: opts?.theme || "light",
                })
              }
            />
          </div>
        </div>

        {heatmapData.skippedGenes.length > 0 && heatmapOmic === "protein" && (
          <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-950/25 px-3 py-2 text-xs text-amber-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>mRNA-only targets not detected in shotgun TMT proteomics:</strong>{" "}
                <span className="font-mono text-amber-300">
                  {heatmapData.skippedGenes.join(", ")}
                </span>{" "}
                (showing {heatmapData.quantifiedRows.length} quantified proteins below).
              </span>
            </div>
            <button
              onClick={() => setHeatmapOmic("mrna")}
              className="px-2 py-1 rounded bg-emerald-600/30 border border-emerald-500/40 text-emerald-200 hover:bg-emerald-600/50 whitespace-nowrap"
            >
              Switch to Matched mRNA
            </button>
          </div>
        )}

        <div
          ref={hmWrapperRef}
          className="relative w-full h-[420px] rounded-lg border border-slate-800/80 bg-slate-950/80 overflow-hidden"
        >
          <canvas
            ref={hmCanvasRef}
            onMouseMove={handleHeatmapMouseMove}
            onMouseLeave={() => setHmHover(null)}
            className="absolute inset-0 w-full h-full block cursor-crosshair"
          />
          {hmHover && (
            <div
              className="fixed z-50 pointer-events-none rounded-lg border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs shadow-xl"
              style={{ left: hmHover.clientX + 14, top: hmHover.clientY - 12 }}
            >
              <div className="font-bold text-slate-100">{hmHover.sampleId}</div>
              <div className="text-[11px] text-slate-400">
                {hmHover.tissue} &middot;{" "}
                <span className="text-slate-200 font-semibold">{hmHover.stage}</span>
              </div>
              {hmHover.gene !== "Sample Metadata" && (
                <>
                  <div className="mt-1 font-mono text-sky-300">
                    {hmHover.gene} Z ={" "}
                    {hmHover.z !== null ? hmHover.z.toFixed(3) : "NA (Missing in TMT)"}
                  </div>
                  {hmHover.raw !== null && (
                    <div className="font-mono text-slate-400">
                      Raw log2 = {hmHover.raw.toFixed(3)}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Interactive Heatmap Colorbar + Tissue & AJCC Stage Legend */}
        <div className="mt-3 pt-2.5 border-t border-slate-800/80 space-y-2 text-[11px] font-mono text-slate-400">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold text-slate-300">Row Z-Score:</span>
              <div className="flex items-center gap-2">
                <span className="text-blue-400 font-semibold">-2.5 (Lower)</span>
                <div className="flex flex-col items-center">
                  <div
                    className="h-3 w-40 sm:w-48 rounded-sm border border-slate-700/80"
                    style={{
                      background:
                        "linear-gradient(to right, rgb(37,99,235) 0%, rgb(248,250,252) 50%, rgb(220,38,38) 100%)",
                    }}
                  />
                  <div className="flex justify-between w-full text-[9px] text-slate-500 mt-0.5 px-0.5">
                    <span>-2.5</span>
                    <span>0.0 (Mean)</span>
                    <span>+2.5</span>
                  </div>
                </div>
                <span className="text-rose-400 font-semibold">+2.5 (Higher)</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-slate-800 border border-slate-600 inline-block" />
                <span>NA (Missing)</span>
              </span>
              <span className="hidden sm:inline text-slate-600">|</span>
              <span className="font-semibold text-slate-300">Tissue:</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
                <span>NAT</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" />
                <span>Tumor</span>
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 pt-1.5 border-t border-slate-800/60">
            <span className="font-semibold text-slate-300">AJCC Stage Track:</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-violet-400 inline-block" />
              <span>Stage I (IA/IB)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-sky-400 inline-block" />
              <span>Stage II (IIA/IIB)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />
              <span>Stage III</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" />
              <span>Stage IV</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-slate-500 inline-block" />
              <span>Unknown</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-slate-700 border border-slate-600 inline-block" />
              <span>NAT (N/A)</span>
            </span>
          </div>
        </div>
      </div>

      {/* Section 2: Within-Layer Co-Expression Matrix & Signature Correlation */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-sky-400" />
              Within-Layer Co-Expression ({heatmapOmic === "protein" ? "Protein vs. Protein" : "mRNA vs. mRNA"})
            </h3>
            <p className="text-xs text-slate-400">
              Explore pairwise Pearson r co-expression across your active heatmap panel or correlate two multi-gene signatures within the selected{" "}
              {heatmapOmic === "protein" ? "Global Protein" : "Matched mRNA"} layer. (For mRNA-vs-Protein concordance, use Tab 2.)
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-slate-700 bg-slate-950 p-0.5 text-xs">
              <button
                onClick={() => setCorrSubView("matrix")}
                className={`px-2.5 py-1 rounded-md font-medium ${
                  corrSubView === "matrix"
                    ? "bg-sky-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Pairwise Matrix ({pairwiseMatrix.genes.length}&times;
                {pairwiseMatrix.genes.length})
              </button>
              <button
                onClick={() => setCorrSubView("scatter")}
                className={`px-2.5 py-1 rounded-md font-medium ${
                  corrSubView === "scatter"
                    ? "bg-sky-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Signature-vs-Signature Scatter
              </button>
            </div>

            <ExportButton
              label={corrSubView === "matrix" ? "Export Matrix" : "Export Correlation"}
              size="sm"
              disabled={
                corrSubView === "matrix"
                  ? pairwiseMatrix.genes.length === 0
                  : sigCorrelationData.points.length === 0
              }
              onExportCSV={() => {
                if (corrSubView === "matrix") {
                  exportToCSV({
                    filename: `CPTAC_PDAC_${heatmapOmic}_Pairwise_CoExpression_Matrix.csv`,
                    metadata: {
                      dataset: "CPTAC-PDAC (Cao et al., Cell 2021)",
                      module: "Within-Layer Pairwise Pearson r Matrix",
                      filters: `${heatmapOmic} | Primary Tumors (n=140)`,
                    },
                    headers: ["Feature", ...pairwiseMatrix.genes],
                    rows: pairwiseMatrix.genes.map((g, i) => [
                      g,
                      ...pairwiseMatrix.mat[i].map((v) => Number(v.toFixed(4))),
                    ]),
                  });
                } else {
                  exportToCSV({
                    filename: `CPTAC_PDAC_${heatmapOmic}_Signature_Correlation.csv`,
                    metadata: {
                      dataset: "CPTAC-PDAC (Cao et al., Cell 2021)",
                      module: "Within-Layer Signature Correlation",
                      filters: `${heatmapOmic} (${sigCohort})`,
                    },
                    headers: [
                      "Case_ID",
                      "Tissue",
                      "Stage",
                      "Neoplastic_Cellularity_Pct",
                      `SigA_${heatmapOmic}_ZScore`,
                      `SigB_${heatmapOmic}_ZScore`,
                    ],
                    rows: sigCorrelationData.points.map((p) => [
                      p.caseId,
                      p.tissue,
                      p.stage,
                      p.cellularity,
                      Number(p.x.toFixed(4)),
                      Number(p.y.toFixed(4)),
                    ]),
                  });
                }
              }}
              onExportPNG={(opts) =>
                exportCanvasToPNG({
                  canvas:
                    corrSubView === "matrix"
                      ? renderPubMatrixCanvas(opts?.theme === "light")
                      : renderPubCorrCanvas(opts?.theme === "light"),
                  filename:
                    corrSubView === "matrix"
                      ? `CPTAC_PDAC_${heatmapOmic}_Pairwise_Matrix.png`
                      : `CPTAC_PDAC_${heatmapOmic}_Signature_Correlation.png`,
                  theme: opts?.theme || "light",
                })
              }
              onExportSVG={(opts) =>
                exportCanvasToSVG({
                  canvas:
                    corrSubView === "matrix"
                      ? renderPubMatrixCanvas(opts?.theme === "light")
                      : renderPubCorrCanvas(opts?.theme === "light"),
                  filename:
                    corrSubView === "matrix"
                      ? `CPTAC_PDAC_${heatmapOmic}_Pairwise_Matrix.svg`
                      : `CPTAC_PDAC_${heatmapOmic}_Signature_Correlation.svg`,
                  theme: opts?.theme || "light",
                })
              }
            />
          </div>
        </div>

        {corrSubView === "scatter" ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-5 space-y-3">
              {/* Signature A Builder */}
              <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-sky-300">
                    X-Axis Signature ({sigAGenes.length} {heatmapOmic === "protein" ? "proteins" : "genes"})
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-slate-400 uppercase">
                      {heatmapOmic === "protein" ? "Global Protein" : "Matched mRNA"}
                    </span>
                    {sigAGenes.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSigAGenes([])}
                        className="text-[10px] text-slate-500 hover:text-rose-400"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
                <SearchableGeneSelect
                  options={activeOmicSearchOptions}
                  value=""
                  onChange={(g) => {
                    if (g && !sigAGenes.includes(g)) setSigAGenes([...sigAGenes, g]);
                  }}
                  placeholder={`+ Add X ${heatmapOmic === "protein" ? "protein" : "gene"}...`}
                />
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                  {sigAGenes.map((g) => {
                    const missingInLayer =
                      heatmapOmic === "protein" && !protLookup.has(g.toUpperCase());
                    return (
                      <span
                        key={g}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-mono ${
                          missingInLayer
                            ? "bg-amber-950/30 border-amber-500/40 text-amber-200"
                            : "bg-slate-900 border-slate-700 text-slate-200"
                        }`}
                        title={
                          missingInLayer
                            ? "Not quantified in TMT Global Proteomics (switch to Matched mRNA or remove)"
                            : undefined
                        }
                      >
                        {g}
                        {missingInLayer && (
                          <span className="text-[9px] text-amber-400">(NA)</span>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setSigAGenes(sigAGenes.filter((x) => x !== g))
                          }
                          className="text-slate-500 hover:text-rose-400"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Swap X <-> Y control */}
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    const prevA = sigAGenes;
                    setSigAGenes(sigBGenes);
                    setSigBGenes(prevA);
                  }}
                  className="px-2.5 py-1 rounded-md border border-slate-800 bg-slate-950 text-[11px] text-slate-400 hover:text-sky-300 hover:border-sky-500/40 inline-flex items-center gap-1.5"
                >
                  <ArrowRightLeft className="w-3 h-3" /> Swap X &harr; Y Axes
                </button>
              </div>

              {/* Signature B Builder */}
              <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-amber-300">
                    Y-Axis Signature ({sigBGenes.length} {heatmapOmic === "protein" ? "proteins" : "genes"})
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-slate-400 uppercase">
                      {heatmapOmic === "protein" ? "Global Protein" : "Matched mRNA"}
                    </span>
                    {sigBGenes.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSigBGenes([])}
                        className="text-[10px] text-slate-500 hover:text-rose-400"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
                <SearchableGeneSelect
                  options={activeOmicSearchOptions}
                  value=""
                  onChange={(g) => {
                    if (g && !sigBGenes.includes(g)) setSigBGenes([...sigBGenes, g]);
                  }}
                  placeholder={`+ Add Y ${heatmapOmic === "protein" ? "protein" : "gene"}...`}
                />
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                  {sigBGenes.map((g) => {
                    const missingInLayer =
                      heatmapOmic === "protein" && !protLookup.has(g.toUpperCase());
                    return (
                      <span
                        key={g}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-mono ${
                          missingInLayer
                            ? "bg-amber-950/30 border-amber-500/40 text-amber-200"
                            : "bg-slate-900 border-slate-700 text-slate-200"
                        }`}
                        title={
                          missingInLayer
                            ? "Not quantified in TMT Global Proteomics (switch to Matched mRNA or remove)"
                            : undefined
                        }
                      >
                        {g}
                        {missingInLayer && (
                          <span className="text-[9px] text-amber-400">(NA)</span>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setSigBGenes(sigBGenes.filter((x) => x !== g))
                          }
                          className="text-slate-500 hover:text-rose-400"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={sigCohort}
                  onChange={(e) => setSigCohort(e.target.value as SigCohort)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200"
                >
                  <option value="tumor">Tumors Only (n=140)</option>
                  <option value="pooled">Pooled Tumor + NAT</option>
                  <option value="nat">NAT Controls Only</option>
                </select>
                <select
                  value={sigColorBy}
                  onChange={(e) => setSigColorBy(e.target.value as ColorBy)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200"
                >
                  <option value="stage">Color: AJCC Stage</option>
                  <option value="cellularity">Color: Tumor Cellularity</option>
                  <option value="cohort">Color: Tissue Type</option>
                </select>
              </div>
            </div>

            <div className="lg:col-span-7 flex flex-col">
              <div
                ref={corrWrapperRef}
                className="relative w-full h-[400px] rounded-lg border border-slate-800/80 bg-slate-950/80 overflow-hidden"
              >
                <canvas
                  ref={corrCanvasRef}
                  onMouseMove={handleCorrMouseMove}
                  onMouseLeave={() => setCorrHover(null)}
                  className="absolute inset-0 w-full h-full block cursor-crosshair"
                />
                {corrHover && (
                  <div
                    className="fixed z-50 pointer-events-none rounded-lg border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs shadow-xl"
                    style={{
                      left: corrHover.clientX + 14,
                      top: corrHover.clientY - 12,
                    }}
                  >
                    <div className="font-bold text-slate-100">{corrHover.caseId}</div>
                    <div className="text-[11px] text-slate-400">
                      {corrHover.tissue} &middot; {corrHover.stage}
                    </div>
                    <div className="mt-1 font-mono text-sky-300">
                      X Z-score = {corrHover.x.toFixed(3)}
                    </div>
                    <div className="font-mono text-amber-300">
                      Y Z-score = {corrHover.y.toFixed(3)}
                    </div>
                  </div>
                )}
              </div>

              {/* Scatter Color Legend */}
              <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] font-mono text-slate-400">
                {sigColorBy === "stage" ? (
                  <>
                    <span className="font-semibold text-slate-300">AJCC Stage:</span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-violet-400 inline-block" />
                      Stage I
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" />
                      Stage II
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                      Stage III
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                      Stage IV
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-500 inline-block" />
                      Unknown
                    </span>
                    {sigCohort !== "tumor" && (
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                        NAT
                      </span>
                    )}
                  </>
                ) : sigColorBy === "cellularity" ? (
                  <>
                    <span className="font-semibold text-slate-300">Tumor Cellularity:</span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" />
                      &lt;25%
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                      25&ndash;44%
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block" />
                      &ge;45%
                    </span>
                    {sigCohort !== "tumor" && (
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                        NAT
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="font-semibold text-slate-300">Tissue Type:</span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" />
                      Primary Tumor
                    </span>
                    {sigCohort !== "tumor" && (
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                        Normal NAT
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <p className="text-xs text-slate-400 mb-2">
              Tumor-only (n=140) pairwise Pearson r matrix across active panel ({heatmapOmic.toUpperCase()} layer). Click any off-diagonal cell to inspect that pair in Signature Scatter mode.
            </p>
            <table className="text-[11px] font-mono border-collapse">
              <thead>
                <tr>
                  <th className="p-1.5 text-left text-slate-400">Feature</th>
                  {pairwiseMatrix.genes.map((g) => (
                    <th key={g} className="p-1.5 text-center text-slate-300">
                      {g}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pairwiseMatrix.genes.map((gRow, i) => (
                  <tr key={gRow}>
                    <td className="p-1.5 font-bold text-slate-200">{gRow}</td>
                    {pairwiseMatrix.genes.map((gCol, j) => {
                      const val = pairwiseMatrix.mat[i][j];
                      const bg =
                        i === j
                          ? "bg-slate-800 text-slate-400"
                          : val >= 0.45
                          ? "bg-rose-600/45 text-rose-100"
                          : val >= 0.2
                          ? "bg-rose-500/20 text-rose-200"
                          : val <= -0.35
                          ? "bg-sky-600/45 text-sky-100"
                          : val <= -0.15
                          ? "bg-sky-500/20 text-sky-200"
                          : "bg-slate-900 text-slate-400";
                      return (
                        <td
                          key={gCol}
                          onClick={() => {
                            if (i !== j) {
                              setSigAGenes([gRow]);
                              setSigBGenes([gCol]);
                              setCorrSubView("scatter");
                            }
                          }}
                          className={`p-1.5 text-center border border-slate-800/70 cursor-pointer hover:ring-1 hover:ring-amber-400 ${bg}`}
                          title={`${gRow} vs ${gCol}: r = ${val.toFixed(3)}`}
                        >
                          {val.toFixed(2)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-300">Pearson r:</span>
                <span className="text-sky-400 font-semibold">-1.0 (Inverse)</span>
                <div
                  className="h-2.5 w-36 rounded-sm border border-slate-700"
                  style={{
                    background:
                      "linear-gradient(to right, rgba(2,132,199,0.7) 0%, rgb(15,23,42) 50%, rgba(225,29,72,0.7) 100%)",
                  }}
                />
                <span className="text-rose-400 font-semibold">+1.0 (Co-expressed)</span>
              </div>
              <span className="text-slate-500">Click any cell to open Scatter view</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
