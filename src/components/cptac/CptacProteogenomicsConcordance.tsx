"use client";

import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  GitCompare,
  Sparkles,
  Search,
  AlertTriangle,
  ArrowRightLeft,
  Info,
  Layers,
  ChevronDown,
  ChevronUp,
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
  CptacPathwayConcordance,
} from "@/types/cptac";
import {
  PROT_SAMPLE_COLS,
  MRNA_SAMPLE_COLS,
  MRNA_TUMOR_COUNT,
  CURATED_20_NRF2_PANEL,
  sliceMatrixRow,
  pearsonAndSpearman,
} from "@/utils/cptacEngine";

interface CptacProteogenomicsConcordanceProps {
  proteins: CptacProteinRecord[];
  mrnaOnly: CptacMrnaOnlyRecord[];
  protBuffer: ArrayBuffer | null;
  mrnaBuffer: ArrayBuffer | null;
  tumorIds: string[];
  normalIds: string[];
  mrnaNormalIds: string[];
  clinicalSamples: CptacClinicalSample[];
  pathwayConcordance: CptacPathwayConcordance[];
  globalConcordance: {
    median_pearson_r: number;
    mean_pearson_r: number;
    median_spearman_rho: number;
    mean_spearman_rho: number;
    pct_positive_r: number;
  };
  testedPairedCount: number;
  sharedCount: number;
  selectedGene: string;
  onSelectGene: (gene: string) => void;
}

type ScatterMode = "same_gene" | "cross_omic";
type ColorByMode = "tissue" | "stage" | "cellularity";
type PathwaySortMode = "highest_r" | "lowest_r" | "alphabetical";

interface PairedPoint {
  caseId: string;
  x: number;
  y: number;
  tissue: "Tumor" | "NAT";
  stage: string;
  histology: string;
  cellularity: number | null;
}

const DECOUPLING_EXAMPLES: Array<{
  mrnaGene: string;
  protGene: string;
  axis: string;
  note: string;
}> = [
  {
    mrnaGene: "NFE2L2",
    protGene: "NQO1",
    axis: "NRF2 TF -> Redox Effector",
    note: "NRF2 protein is controlled via KEAP1-CUL3 degradation, not transcript abundance.",
  },
  {
    mrnaGene: "NFE2L2",
    protGene: "HMOX1",
    axis: "NRF2 TF -> Heme Catabolism",
    note: "HMOX1 protein responds to NRF2/BACH1 post-translational turnover.",
  },
  {
    mrnaGene: "NFE2L2",
    protGene: "GCLC",
    axis: "NRF2 TF -> GSH Synthesis",
    note: "NFE2L2 mRNA fails to predict catalytic GCLC protein steady state.",
  },
  {
    mrnaGene: "NFE2L2",
    protGene: "FTH1",
    axis: "NRF2 TF -> Iron Storage",
    note: "Ferritin heavy chain protein reflects NRF2 activity + IRP1/2 iron control.",
  },
  {
    mrnaGene: "NFE2L2",
    protGene: "KEAP1",
    axis: "NRF2 TF -> E3 Adaptor",
    note: "Transcript co-variation does not mirror KEAP1-mediated proteolysis.",
  },
  {
    mrnaGene: "HIF1A",
    protGene: "CA9",
    axis: "HIF1A TF -> Hypoxia Effector",
    note: "HIF1A is stabilized via VHL/PHD prolyl hydroxylation inhibition under hypoxia.",
  },
  {
    mrnaGene: "HIF1A",
    protGene: "LDHA",
    axis: "HIF1A TF -> Glycolytic Sink",
    note: "LDHA protein tracks metabolic flux & HIF stabilization more closely than HIF1A mRNA.",
  },
  {
    mrnaGene: "HIF1A",
    protGene: "SLC2A1",
    axis: "HIF1A TF -> GLUT1 Transporter",
    note: "Post-transcriptional regulation decouples HIF1A mRNA from GLUT1 protein.",
  },
];

export default function CptacProteogenomicsConcordance({
  proteins,
  mrnaOnly,
  protBuffer,
  mrnaBuffer,
  tumorIds,
  normalIds,
  mrnaNormalIds,
  clinicalSamples,
  pathwayConcordance,
  globalConcordance,
  testedPairedCount,
  sharedCount,
  selectedGene,
  onSelectGene,
}: CptacProteogenomicsConcordanceProps) {
  const [scatterMode, setScatterMode] = useState<ScatterMode>("same_gene");
  const [xGene, setXGene] = useState<string>(selectedGene || "NQO1");
  const [yGene, setYGene] = useState<string>("NQO1");
  const [includeNat, setIncludeNat] = useState<boolean>(false);
  const [colorBy, setColorBy] = useState<ColorByMode>("stage");
  const [pathwaySort, setPathwaySort] = useState<PathwaySortMode>("highest_r");
  const [pathwaySearch, setPathwaySearch] = useState<string>("");
  const [panelSearch, setPanelSearch] = useState<string>("");
  const [panelSort, setPanelSort] = useState<{
    key: "g" | "r" | "rho" | "log2FC" | "mLog2FC" | "nPairMP";
    dir: "asc" | "desc";
  }>({ key: "r", dir: "desc" });

  // Theme listener
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

  // Sync xGene if parent selectedGene changes cleanly in same_gene mode
  useEffect(() => {
    if (selectedGene && scatterMode === "same_gene") {
      setXGene(selectedGene);
      setYGene(selectedGene);
    }
  }, [selectedGene, scatterMode]);

  const scatterCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scatterWrapperRef = useRef<HTMLDivElement | null>(null);
  const [scatterDim, setScatterDim] = useState({ width: 580, height: 390 });
  const [hoveredPt, setHoveredPt] = useState<{
    pt: PairedPoint;
    clientX: number;
    clientY: number;
  } | null>(null);

  const pathwayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pathwayWrapperRef = useRef<HTMLDivElement | null>(null);
  const [pathwayDim, setPathwayDim] = useState({ width: 560, height: 400 });

  useEffect(() => {
    if (!scatterWrapperRef.current) return;
    const obs = new ResizeObserver((entries) => {
      for (const e of entries) {
        const nextW = Math.max(320, Math.round(e.contentRect.width));
        const nextH = Math.max(300, Math.round(e.contentRect.height));
        setScatterDim((prev) =>
          prev.width === nextW && prev.height === nextH
            ? prev
            : { width: nextW, height: nextH }
        );
      }
    });
    obs.observe(scatterWrapperRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!pathwayWrapperRef.current) return;
    const obs = new ResizeObserver((entries) => {
      for (const e of entries) {
        const nextW = Math.max(320, Math.round(e.contentRect.width));
        const nextH = Math.max(320, Math.round(e.contentRect.height));
        setPathwayDim((prev) =>
          prev.width === nextW && prev.height === nextH
            ? prev
            : { width: nextW, height: nextH }
        );
      }
    });
    obs.observe(pathwayWrapperRef.current);
    return () => obs.disconnect();
  }, []);

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

  const allMrnaOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of proteins) {
      if (p.mi !== null) set.add(p.g);
    }
    for (const m of mrnaOnly) set.add(m.g);
    return Array.from(set).sort();
  }, [proteins, mrnaOnly]);

  const allProteinOptions = useMemo(() => {
    return proteins.map((p) => p.g).sort();
  }, [proteins]);

  const normalProtIdxMap = useMemo(() => {
    const map = new Map<string, number>();
    normalIds.forEach((cid, idx) => map.set(cid, tumorIds.length + idx));
    return map;
  }, [normalIds, tumorIds.length]);

  const clinByTumorIdx = useMemo(() => {
    const map = new Map<number, CptacClinicalSample>();
    for (const c of clinicalSamples) map.set(c.tumor_idx, c);
    return map;
  }, [clinicalSamples]);

  const effectiveXGene = xGene;
  const effectiveYGene = scatterMode === "same_gene" ? xGene : yGene;

  // Resolve mRNA index for X gene and Protein index for Y gene
  const xMrnaIdx = useMemo(() => {
    const key = effectiveXGene.toUpperCase();
    const pr = protLookup.get(key);
    if (pr && pr.mi !== null) return pr.mi;
    const mr = mrnaOnlyLookup.get(key);
    return mr ? mr.mi : null;
  }, [effectiveXGene, protLookup, mrnaOnlyLookup]);

  const yProtRecord = useMemo(
    () => protLookup.get(effectiveYGene.toUpperCase()) || null,
    [effectiveYGene, protLookup]
  );

  // Extract paired scatter points cleanly from binary matrices
  const scatterData = useMemo(() => {
    if (!mrnaBuffer || !protBuffer || xMrnaIdx === null || !yProtRecord) {
      return {
        points: [] as PairedPoint[],
        stats: null as ReturnType<typeof pearsonAndSpearman> | null,
      };
    }

    const mrnaRow = sliceMatrixRow(mrnaBuffer, xMrnaIdx, MRNA_SAMPLE_COLS);
    const protRow = sliceMatrixRow(protBuffer, yProtRecord.pi, PROT_SAMPLE_COLS);
    if (!mrnaRow || !protRow) {
      return { points: [], stats: null };
    }

    const pts: PairedPoint[] = [];
    for (let i = 0; i < MRNA_TUMOR_COUNT; i++) {
      const xv = mrnaRow[i];
      const yv = protRow[i];
      if (Number.isFinite(xv) && Number.isFinite(yv)) {
        const clin = clinByTumorIdx.get(i);
        pts.push({
          caseId: tumorIds[i] || clin?.case_id || `Tumor_${i}`,
          x: xv,
          y: yv,
          tissue: "Tumor",
          stage: clin?.stage || "Unknown",
          histology: clin?.histology || "PDAC",
          cellularity: clin?.neoplastic_cellularity ?? null,
        });
      }
    }

    if (includeNat) {
      for (let j = 0; j < mrnaNormalIds.length; j++) {
        const cid = mrnaNormalIds[j];
        const pCol = normalProtIdxMap.get(cid);
        if (pCol === undefined) continue;
        const xv = mrnaRow[MRNA_TUMOR_COUNT + j];
        const yv = protRow[pCol];
        if (Number.isFinite(xv) && Number.isFinite(yv)) {
          pts.push({
            caseId: `${cid} (NAT)`,
            x: xv,
            y: yv,
            tissue: "NAT",
            stage: "Normal NAT",
            histology: "Normal Adjacent Tissue",
            cellularity: 0,
          });
        }
      }
    }

    const stats = pearsonAndSpearman(
      pts.map((p) => p.x),
      pts.map((p) => p.y)
    );
    return { points: pts, stats };
  }, [
    mrnaBuffer,
    protBuffer,
    xMrnaIdx,
    yProtRecord,
    includeNat,
    clinByTumorIdx,
    tumorIds,
    mrnaNormalIds,
    normalProtIdxMap,
  ]);

  // Compute decoupling summary metrics live from binary matrices
  const decouplingMetrics = useMemo(() => {
    if (!mrnaBuffer || !protBuffer) return [];
    return DECOUPLING_EXAMPLES.map((item) => {
      const xP = protLookup.get(item.mrnaGene);
      const xM = mrnaOnlyLookup.get(item.mrnaGene);
      const mi = xP?.mi ?? xM?.mi ?? null;
      const yP = protLookup.get(item.protGene);
      if (mi === null || !yP) {
        return { ...item, r: null, p: null, rho: null, n: 0, sameGeneR: null };
      }
      const mrnaVec = sliceMatrixRow(mrnaBuffer, mi, MRNA_SAMPLE_COLS);
      const protVec = sliceMatrixRow(protBuffer, yP.pi, PROT_SAMPLE_COLS);
      if (!mrnaVec || !protVec) {
        return { ...item, r: null, p: null, rho: null, n: 0, sameGeneR: yP.r };
      }
      const stats = pearsonAndSpearman(
        mrnaVec.slice(0, MRNA_TUMOR_COUNT),
        protVec.slice(0, MRNA_TUMOR_COUNT)
      );
      return {
        ...item,
        r: stats.r,
        p: stats.rP,
        rho: stats.rho,
        n: stats.n,
        sameGeneR: yP.r,
      };
    });
  }, [mrnaBuffer, protBuffer, protLookup, mrnaOnlyLookup]);

  const scatterPad = { top: 28, right: 26, bottom: 52, left: 60 };
  const scatterBounds = useMemo(() => {
    const pts = scatterData.points;
    if (pts.length === 0) return { minX: 0, maxX: 15, minY: -2, maxY: 2 };
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
    const dx = Math.max(0.5, (maxX - minX) * 0.1);
    const dy = Math.max(0.4, (maxY - minY) * 0.12);
    return {
      minX: minX - dx,
      maxX: maxX + dx,
      minY: minY - dy,
      maxY: maxY + dy,
    };
  }, [scatterData.points]);

  const drawScatterToCtx = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    light: boolean,
    isPub: boolean = false
  ) => {
    const pts = scatterData.points;
    const stats = scatterData.stats;
    const pad = isPub
      ? { top: 300, right: 90, bottom: 310, left: 320 }
      : scatterPad;

    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    if (isPub) {
      ctx.fillStyle = light ? "#ffffff" : "#020617";
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = light ? "#0f172a" : "#f8fafc";
      ctx.textAlign = "left";
      const titleStr =
        scatterMode === "same_gene"
          ? `${effectiveXGene}: Matched mRNA vs. Protein`
          : `${effectiveXGene} mRNA vs. ${effectiveYGene} Protein`;
      drawFittedText(ctx, titleStr, 90, 110, w - 180, 100, "bold", PUB_FONT_SANS);

      ctx.fillStyle = light ? "#334155" : "#94a3b8";
      const subStr = `CPTAC-PDAC · ${
        includeNat ? "Tumors + Paired NAT" : "Primary Tumors"
      } (n = ${stats?.n ?? 0})${
        stats && stats.n >= 3
          ? ` · r = ${stats.r.toFixed(3)} · ρ = ${stats.rho.toFixed(3)}`
          : ""
      }`;
      drawFittedText(ctx, subStr, 90, 180, w - 180, 56, "bold", PUB_FONT_NUM);

      // Color legend strip below subtitle
      const legItems =
        colorBy === "stage"
          ? [
              { label: "Stage I", color: "#a78bfa" },
              { label: "Stage II", color: "#38bdf8" },
              { label: "Stage III", color: "#f59e0b" },
              { label: "Stage IV", color: "#f43f5e" },
              { label: "Unknown", color: "#94a3b8" },
              ...(includeNat ? [{ label: "NAT", color: light ? "#059669" : "#34d399" }] : []),
            ]
          : colorBy === "cellularity"
          ? [
              { label: "<25% Cell.", color: "#38bdf8" },
              { label: "25–44%", color: "#f59e0b" },
              { label: "≥45%", color: "#e11d48" },
              ...(includeNat ? [{ label: "NAT", color: light ? "#059669" : "#34d399" }] : []),
            ]
          : [
              { label: "Primary Tumor", color: light ? "#d97706" : "#38bdf8" },
              ...(includeNat ? [{ label: "Normal NAT", color: light ? "#059669" : "#34d399" }] : []),
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
      ((xv - scatterBounds.minX) / (scatterBounds.maxX - scatterBounds.minX)) *
        plotW;
    const mapY = (yv: number) =>
      pad.top +
      plotH -
      ((yv - scatterBounds.minY) / (scatterBounds.maxY - scatterBounds.minY)) *
        plotH;

    // Gridlines
    const numTicks = 5;
    ctx.font = isPub ? `bold 70px ${PUB_FONT_NUM}` : "11px sans-serif";
    for (let i = 0; i <= numTicks; i++) {
      const xv =
        scatterBounds.minX +
        (i / numTicks) * (scatterBounds.maxX - scatterBounds.minX);
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

      const yv =
        scatterBounds.minY +
        (i / numTicks) * (scatterBounds.maxY - scatterBounds.minY);
      const py = mapY(yv);
      ctx.beginPath();
      ctx.moveTo(pad.left, py);
      ctx.lineTo(pad.left + plotW, py);
      ctx.stroke();

      ctx.textAlign = "right";
      ctx.fillText(yv.toFixed(1), pad.left - (isPub ? 30 : 8), py + (isPub ? 24 : 4));
    }

    // Plot border
    ctx.strokeStyle = light ? (isPub ? "#0f172a" : "#475569") : "#64748b";
    ctx.lineWidth = isPub ? 6 : 1.2;
    ctx.strokeRect(pad.left, pad.top, plotW, plotH);

    // Axis labels
    ctx.fillStyle = light ? "#0f172a" : "#f8fafc";
    ctx.textAlign = "center";
    if (isPub) {
      drawFittedText(
        ctx,
        `${effectiveXGene} mRNA [log₂ RSEM UQ]`,
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
      drawFittedText(
        ctx,
        `${effectiveYGene} Protein [log₂ TMT]`,
        0,
        0,
        plotH,
        84,
        "bold",
        PUB_FONT_SANS
      );
      ctx.restore();
    } else {
      ctx.font = "600 12px sans-serif";
      ctx.fillText(
        `${effectiveXGene} mRNA Abundance (log2 RSEM UQ)`,
        pad.left + plotW / 2,
        h - 10
      );
      ctx.save();
      ctx.translate(16, pad.top + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(`${effectiveYGene} Protein Abundance (log2 TMT Ratio)`, 0, 0);
      ctx.restore();
    }

    const getPtColor = (p: PairedPoint) => {
      if (p.tissue === "NAT") {
        return light ? "rgba(5, 150, 105, 0.85)" : "rgba(52, 211, 153, 0.85)";
      }
      if (colorBy === "stage") {
        if (p.stage.includes("IV")) return "#f43f5e";
        if (p.stage.includes("III")) return "#f59e0b";
        if (p.stage.includes("II")) return "#38bdf8";
        if (p.stage.includes("I")) return "#a78bfa";
        return "#94a3b8";
      }
      if (colorBy === "cellularity") {
        const c = p.cellularity ?? 30;
        if (c >= 45) return "#e11d48";
        if (c >= 25) return "#f59e0b";
        return "#38bdf8";
      }
      return light ? "rgba(217, 119, 6, 0.85)" : "rgba(56, 189, 248, 0.85)";
    };

    // Points
    const rPt = isPub ? 18 : 4.3;
    for (const p of pts) {
      const sx = mapX(p.x);
      const sy = mapY(p.y);
      ctx.beginPath();
      ctx.arc(sx, sy, rPt, 0, Math.PI * 2);
      ctx.fillStyle = getPtColor(p);
      ctx.fill();
      ctx.strokeStyle = light ? "rgba(15,23,42,0.35)" : "rgba(15,23,42,0.85)";
      ctx.lineWidth = isPub ? 2.5 : 0.9;
      ctx.stroke();
    }

    // OLS trend line
    if (stats && stats.n >= 3) {
      const y1 = stats.slope * scatterBounds.minX + stats.intercept;
      const y2 = stats.slope * scatterBounds.maxX + stats.intercept;
      ctx.save();
      ctx.beginPath();
      ctx.rect(pad.left, pad.top, plotW, plotH);
      ctx.clip();
      ctx.strokeStyle = light ? "#d97706" : "#fbbf24";
      ctx.lineWidth = isPub ? 8 : 2;
      ctx.beginPath();
      ctx.moveTo(mapX(scatterBounds.minX), mapY(y1));
      ctx.lineTo(mapX(scatterBounds.maxX), mapY(y2));
      ctx.stroke();
      ctx.restore();

      // Stats annotation badge inside top-left (GEPIA2-calibrated)
      const boxW = isPub ? 1160 : 205;
      const boxH = isPub ? 395 : 62;
      const bx = pad.left + (isPub ? 34 : 12);
      const by = pad.top + (isPub ? 34 : 10);
      ctx.fillStyle = light
        ? "rgba(248, 250, 252, 0.96)"
        : "rgba(11, 19, 41, 0.94)";
      ctx.strokeStyle = light ? "#cbd5e1" : "#334155";
      ctx.lineWidth = isPub ? 3.5 : 1;
      ctx.fillRect(bx, by, boxW, boxH);
      ctx.strokeRect(bx, by, boxW, boxH);

      ctx.textAlign = "left";
      if (isPub) {
        ctx.fillStyle = light ? "#0f172a" : "#f8fafc";
        drawFittedText(ctx, "Proteogenomic Concordance", bx + 36, by + 84, boxW - 72, 62, "bold", PUB_FONT_SANS);

        ctx.fillStyle = light ? "#0d9488" : "#2dd4bf";
        drawFittedText(
          ctx,
          `Pearson r = ${stats.r.toFixed(3)} (p = ${formatPublicationPValue(stats.rP)})`,
          bx + 36,
          by + 174,
          boxW - 72,
          56,
          "bold",
          PUB_FONT_NUM
        );
        drawFittedText(
          ctx,
          `Spearman ρ = ${stats.rho.toFixed(3)} (p = ${formatPublicationPValue(stats.rhoP)})`,
          bx + 36,
          by + 256,
          boxW - 72,
          56,
          "bold",
          PUB_FONT_NUM
        );
        ctx.fillStyle = light ? "#334155" : "#94a3b8";
        drawFittedText(ctx, `Matched Pairs: N = ${stats.n}`, bx + 36, by + 338, boxW - 72, 54, "bold", PUB_FONT_NUM);
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
        ctx.fillText(`Matched pairs: n = ${stats.n}`, bx + 9, by + 53);
      }
    }
  };

  // Interactive scatter canvas render
  useEffect(() => {
    const canvas = scatterCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = scatterDim.width * dpr;
    canvas.height = scatterDim.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, scatterDim.width, scatterDim.height);
    drawScatterToCtx(ctx, scatterDim.width, scatterDim.height, isLightTheme, false);
  }, [scatterData, scatterDim, isLightTheme, colorBy, effectiveXGene, effectiveYGene, scatterMode, includeNat]);

  const handleScatterMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = scatterCanvasRef.current;
    if (!canvas || scatterData.points.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const plotW = scatterDim.width - scatterPad.left - scatterPad.right;
    const plotH = scatterDim.height - scatterPad.top - scatterPad.bottom;

    let closest: PairedPoint | null = null;
    let minDist = 144;
    for (const pt of scatterData.points) {
      const sx =
        scatterPad.left +
        ((pt.x - scatterBounds.minX) /
          (scatterBounds.maxX - scatterBounds.minX)) *
          plotW;
      const sy =
        scatterPad.top +
        plotH -
        ((pt.y - scatterBounds.minY) /
          (scatterBounds.maxY - scatterBounds.minY)) *
          plotH;
      const d2 = (mx - sx) ** 2 + (my - sy) ** 2;
      if (d2 < minDist) {
        minDist = d2;
        closest = pt;
      }
    }
    if (closest) {
      setHoveredPt({ pt: closest, clientX: e.clientX, clientY: e.clientY });
    } else {
      setHoveredPt(null);
    }
  };

  // Filtered Pathways for Pathway Concordance visualization & table (MSigDB Hallmarks only)
  const filteredPathways = useMemo(() => {
    const q = pathwaySearch.trim().toLowerCase();
    const list = pathwayConcordance.filter((pw) => {
      if (pw.category !== "MSigDB Hallmark") return false;
      if (q && !pw.name.toLowerCase().includes(q) && !pw.id.toLowerCase().includes(q))
        return false;
      return true;
    });
    if (pathwaySort === "lowest_r") {
      return [...list].sort((a, b) => a.median_r - b.median_r);
    }
    if (pathwaySort === "alphabetical") {
      return [...list].sort((a, b) => a.name.localeCompare(b.name));
    }
    return [...list].sort((a, b) => b.median_r - a.median_r);
  }, [pathwayConcordance, pathwaySort, pathwaySearch]);

  const drawPathwayBarToCtx = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    light: boolean,
    isPub: boolean = false
  ) => {
    const shown = filteredPathways.slice(0, isPub ? 16 : 14);
    if (shown.length === 0) return;

    const pad = isPub
      ? { top: 280, right: 200, bottom: 290, left: 920 }
      : { top: 20, right: 24, bottom: 42, left: 210 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    if (isPub) {
      ctx.fillStyle = light ? "#ffffff" : "#020617";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = light ? "#0f172a" : "#f8fafc";
      ctx.textAlign = "left";
      drawFittedText(
        ctx,
        "Pathway mRNA vs. Protein Concordance",
        90,
        110,
        w - 180,
        98,
        "bold",
        PUB_FONT_SANS
      );
      ctx.fillStyle = light ? "#334155" : "#94a3b8";
      drawFittedText(
        ctx,
        `CPTAC-PDAC · MSigDB Hallmarks · Median r & IQR (${testedPairedCount.toLocaleString()} paired genes)`,
        90,
        180,
        w - 180,
        52,
        "bold",
        PUB_FONT_NUM
      );
    }

    const maxR = 0.85;
    const mapX = (r: number) =>
      pad.left + (Math.max(0, Math.min(maxR, r)) / maxR) * plotW;

    // Grid ticks
    ctx.font = isPub ? `bold 66px ${PUB_FONT_NUM}` : "11px sans-serif";
    [0, 0.2, 0.4, 0.6, 0.8].forEach((tick) => {
      const px = mapX(tick);
      ctx.strokeStyle = light
        ? isPub
          ? "rgba(226,232,240,0.9)"
          : "rgba(100,116,139,0.2)"
        : "rgba(148,163,184,0.12)";
      ctx.lineWidth = isPub ? 2.5 : 1;
      ctx.beginPath();
      ctx.moveTo(px, pad.top);
      ctx.lineTo(px, pad.top + plotH);
      ctx.stroke();
      ctx.fillStyle = light ? "#1e293b" : "#94a3b8";
      ctx.textAlign = "center";
      ctx.fillText(tick.toFixed(1), px, pad.top + plotH + (isPub ? 82 : 16));
    });

    // Global median reference dashed line
    const gx = mapX(globalConcordance.median_pearson_r);
    ctx.save();
    ctx.setLineDash(isPub ? [14, 10] : [4, 4]);
    ctx.strokeStyle = light ? "#d97706" : "#fbbf24";
    ctx.lineWidth = isPub ? 6 : 1.5;
    ctx.beginPath();
    ctx.moveTo(gx, pad.top);
    ctx.lineTo(gx, pad.top + plotH);
    ctx.stroke();
    ctx.restore();

    if (isPub) {
      ctx.fillStyle = light ? "#b45309" : "#fbbf24";
      ctx.font = `bold 46px ${PUB_FONT_NUM}`;
      ctx.textAlign = "center";
      ctx.fillText(
        `Median r = ${globalConcordance.median_pearson_r.toFixed(3)}`,
        gx,
        pad.top - 24
      );
    }

    const rowH = plotH / shown.length;
    shown.forEach((pw, i) => {
      const cy = pad.top + i * rowH + rowH / 2;
      ctx.fillStyle = light ? "#0f172a" : "#e2e8f0";
      ctx.textAlign = "right";
      if (isPub) {
        drawFittedText(
          ctx,
          pw.name,
          pad.left - 30,
          cy + 18,
          pad.left - 110,
          50,
          "bold",
          PUB_FONT_SANS,
          34
        );
      } else {
        const label =
          pw.name.length > 28 ? pw.name.slice(0, 26) + "…" : pw.name;
        ctx.font = "400 11px sans-serif";
        ctx.fillText(label, pad.left - 8, cy + 4);
      }

      // Bar from 0 to median_r
      const barH = Math.max(isPub ? 48 : 8, rowH * 0.5);
      const bw = mapX(pw.median_r) - pad.left;
      ctx.fillStyle = light
        ? "rgba(14, 165, 233, 0.8)"
        : "rgba(56, 189, 248, 0.72)";
      ctx.fillRect(pad.left, cy - barH / 2, Math.max(2, bw), barH);

      // IQR whisker (q25_r to q75_r)
      ctx.strokeStyle = light ? "#0f172a" : "#f8fafc";
      ctx.lineWidth = isPub ? 6 : 1.4;
      ctx.beginPath();
      ctx.moveTo(mapX(pw.q25_r), cy);
      ctx.lineTo(mapX(pw.q75_r), cy);
      ctx.stroke();

      // Numeric r
      ctx.fillStyle = light ? "#0f172a" : "#f1f5f9";
      ctx.font = isPub ? `bold 48px ${PUB_FONT_NUM}` : "600 10px monospace";
      ctx.textAlign = "left";
      ctx.fillText(
        pw.median_r.toFixed(2),
        Math.min(w - (isPub ? 160 : 30), mapX(pw.q75_r) + (isPub ? 22 : 5)),
        cy + (isPub ? 16 : 3.5)
      );
    });

    if (isPub) {
      ctx.strokeStyle = light ? "#0f172a" : "#64748b";
      ctx.lineWidth = 5;
      ctx.strokeRect(pad.left, pad.top, plotW, plotH);
    }

    ctx.fillStyle = light ? "#0f172a" : "#f8fafc";
    ctx.textAlign = "center";
    if (isPub) {
      drawFittedText(
        ctx,
        "Median mRNA–Protein Pearson r (IQR)",
        pad.left + plotW / 2,
        pad.top + plotH + 196,
        plotW + 280,
        78,
        "bold",
        PUB_FONT_SANS
      );
    } else {
      ctx.font = "600 11.5px sans-serif";
      ctx.fillText(
        `Median Gene-Level mRNA-Protein Pearson r (Dashed = Proteome Median ${globalConcordance.median_pearson_r.toFixed(
          3
        )})`,
        pad.left + plotW / 2,
        h - 6
      );
    }
  };

  useEffect(() => {
    const canvas = pathwayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(pathwayDim.width * dpr);
    canvas.height = Math.round(pathwayDim.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, pathwayDim.width, pathwayDim.height);
    drawPathwayBarToCtx(
      ctx,
      pathwayDim.width,
      pathwayDim.height,
      isLightTheme,
      false
    );
  }, [filteredPathways, pathwayDim, isLightTheme, globalConcordance]);

  // Universal proteome-wide concordance table rows (all quantified proteins + mRNA-only when searched)
  const nrf2PanelRows = useMemo(() => {
    const q = panelSearch.trim().toUpperCase();
    const rows: Array<{
      g: string;
      quantifiedProtein: boolean;
      nPairMP: number;
      r: number | null;
      rP: number | null;
      rho: number | null;
      rhoP: number | null;
      log2FC: number | null;
      mwQ: number | null;
      mLog2FC: number | null;
    }> = [];

    for (const p of proteins) {
      if (q && !p.g.toUpperCase().includes(q)) continue;
      if (!q && p.r === null) continue;
      rows.push({
        g: p.g,
        quantifiedProtein: true,
        nPairMP: p.nPairMP,
        r: p.r,
        rP: p.rP,
        rho: p.rho,
        rhoP: p.rhoP,
        log2FC: p.log2FC,
        mwQ: p.mwQ,
        mLog2FC: p.mLog2FC,
      });
    }

    if (q) {
      for (const m of mrnaOnly) {
        if (!m.g.toUpperCase().includes(q)) continue;
        rows.push({
          g: m.g,
          quantifiedProtein: false,
          nPairMP: 0,
          r: null,
          rP: null,
          rho: null,
          rhoP: null,
          log2FC: null,
          mwQ: null,
          mLog2FC: m.log2FC ?? null,
        });
      }
    }

    rows.sort((a, b) => {
      if (panelSort.key === "g") {
        return panelSort.dir === "asc"
          ? a.g.localeCompare(b.g)
          : b.g.localeCompare(a.g);
      }
      const va = a[panelSort.key] ?? -999;
      const vb = b[panelSort.key] ?? -999;
      return panelSort.dir === "asc" ? va - vb : vb - va;
    });
    return rows.slice(0, 25);
  }, [proteins, mrnaOnly, panelSearch, panelSort]);

  const renderPubScatterCanvas = (light: boolean) => {
    const c = document.createElement("canvas");
    c.width = 2400;
    c.height = 2400;
    const ctx = c.getContext("2d");
    if (ctx) drawScatterToCtx(ctx, 2400, 2400, light, true);
    return c;
  };

  const renderPubPathwayCanvas = (light: boolean) => {
    const c = document.createElement("canvas");
    c.width = 2400;
    c.height = 2400;
    const ctx = c.getContext("2d");
    if (ctx) drawPathwayBarToCtx(ctx, 2400, 2400, light, true);
    return c;
  };

  const handleExportScatterCSV = () => {
    exportToCSV({
      filename: `CPTAC_PDAC_Concordance_${effectiveXGene}_mRNA_vs_${effectiveYGene}_Protein.csv`,
      metadata: {
        dataset: "CPTAC-PDAC (Cao et al., Cell 2021)",
        module: "Matched mRNA-vs-Protein Concordance",
        selectedGene: `${effectiveXGene} mRNA vs ${effectiveYGene} Protein`,
        filters: includeNat ? "Tumors + Matched NAT" : "Primary Tumors (n<=140)",
      },
      headers: [
        "Case_ID",
        "Tissue",
        "Histology",
        "Stage",
        "Neoplastic_Cellularity_Pct",
        `${effectiveXGene}_mRNA_log2RSEM`,
        `${effectiveYGene}_Protein_log2TMT`,
      ],
      rows: scatterData.points.map((p) => [
        p.caseId,
        p.tissue,
        p.histology,
        p.stage,
        p.cellularity,
        Number(p.x.toFixed(5)),
        Number(p.y.toFixed(5)),
      ]),
    });
  };

  const handleExportPathwayCSV = () => {
    exportToCSV({
      filename: "CPTAC_PDAC_Pathway_Concordance.csv",
      metadata: {
        dataset: "CPTAC-PDAC (Cao et al., Cell 2021)",
        module: "Pathway-Level mRNA-Protein Concordance",
      },
      headers: [
        "Pathway_ID",
        "Pathway_Name",
        "Category",
        "Total_Genes",
        "Quantified_Paired",
        "Median_Pearson_r",
        "Mean_Pearson_r",
        "Q25_r",
        "Q75_r",
        "Median_Spearman_rho",
        "Median_Protein_log2FC",
      ],
      rows: filteredPathways.map((pw) => [
        pw.id,
        pw.name,
        pw.category,
        pw.total_genes,
        pw.quantified_paired,
        pw.median_r,
        pw.mean_r,
        pw.q25_r,
        pw.q75_r,
        pw.median_rho,
        pw.median_log2FC,
      ]),
    });
  };

  return (
    <div className="space-y-6">
      {/* Global Proteome-Transcriptome Concordance Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
            Matched mRNA-Protein Genes
          </div>
          <div className="text-2xl font-bold text-slate-100 mt-1 font-mono">
            {testedPairedCount.toLocaleString()}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Of {sharedCount.toLocaleString()} shared genes (paired tumors &ge; 10)
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
            Proteome-Wide Median Pearson r
          </div>
          <div className="text-2xl font-bold text-sky-400 mt-1 font-mono">
            r = {globalConcordance.median_pearson_r.toFixed(4)}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Mean r = {globalConcordance.mean_pearson_r.toFixed(4)} (Cao et al. consistent)
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
            Proteome-Wide Median Spearman &rho;
          </div>
          <div className="text-2xl font-bold text-emerald-400 mt-1 font-mono">
            &rho; = {globalConcordance.median_spearman_rho.toFixed(4)}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Positive correlation in {globalConcordance.pct_positive_r.toFixed(1)}% of genes
          </div>
        </div>
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4">
          <div className="text-[11px] uppercase tracking-wider text-amber-300 font-semibold">
            Cross-Omic Decoupling Mode
          </div>
          <div className="text-sm font-bold text-amber-200 mt-1.5 font-mono">
            Any mRNA &rarr; Any Protein
          </div>
          <div className="text-xs text-amber-200/80 mt-1">
            Test post-translational regulation between any transcript &amp; target protein below
          </div>
        </div>
      </div>

      {/* Main Split: Interactive Scatter Plot + Pathway Concordance */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Left: Matched mRNA-vs-Protein Scatter */}
        <div className="xl:col-span-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <GitCompare className="w-4 h-4 text-sky-400" />
                Matched mRNA vs. Global Protein Scatter
              </h3>
              <p className="text-[11px] text-slate-400">
                CPTAC-PDAC 1:1 paired RSEM log2 RNA-seq vs. TMT log2 Proteomics
              </p>
            </div>
            <ExportButton
              label="Export Scatter"
              size="sm"
              onExportCSV={handleExportScatterCSV}
              onExportPNG={(opts) =>
                exportCanvasToPNG({
                  canvas: renderPubScatterCanvas(opts?.theme === "light"),
                  filename: `CPTAC_Concordance_${effectiveXGene}_vs_${effectiveYGene}.png`,
                  theme: opts?.theme || "light",
                })
              }
              onExportSVG={(opts) =>
                exportCanvasToSVG({
                  canvas: renderPubScatterCanvas(opts?.theme === "light"),
                  filename: `CPTAC_Concordance_${effectiveXGene}_vs_${effectiveYGene}.svg`,
                  theme: opts?.theme || "light",
                })
              }
            />
          </div>

          {/* Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3">
            <div className="flex rounded-lg border border-slate-700 bg-slate-950 p-0.5 text-xs">
              <button
                onClick={() => {
                  setScatterMode("same_gene");
                  if (protLookup.has(xGene.toUpperCase())) {
                    setYGene(xGene);
                  } else {
                    setXGene("NQO1");
                    setYGene("NQO1");
                  }
                }}
                className={`flex-1 py-1.5 px-2 rounded-md font-medium transition-colors ${
                  scatterMode === "same_gene"
                    ? "bg-sky-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Same-Gene (X &rarr; X)
              </button>
              <button
                onClick={() => {
                  setScatterMode("cross_omic");
                  setXGene("NFE2L2");
                  setYGene("NQO1");
                }}
                className={`flex-1 py-1.5 px-2 rounded-md font-medium transition-colors flex items-center justify-center gap-1 ${
                  scatterMode === "cross_omic"
                    ? "bg-amber-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <ArrowRightLeft className="w-3 h-3" />
                Cross-Omic (A &rarr; B)
              </button>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={colorBy}
                onChange={(e) => setColorBy(e.target.value as ColorByMode)}
                className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200"
                aria-label="Color samples by"
              >
                <option value="stage">Color: AJCC Stage</option>
                <option value="cellularity">Color: Tumor Cellularity</option>
                <option value="tissue">Color: Cohort (Tumor vs NAT)</option>
              </select>
              <label className="flex items-center gap-1.5 text-xs text-slate-300 whitespace-nowrap cursor-pointer px-2 py-1.5 rounded-lg border border-slate-800 bg-slate-950">
                <input
                  type="checkbox"
                  checked={includeNat}
                  onChange={(e) => setIncludeNat(e.target.checked)}
                  className="accent-emerald-500"
                />
                +NAT (n&le;161)
              </label>
            </div>
          </div>

          {/* Gene Pickers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                {scatterMode === "same_gene"
                  ? "Target Gene (Matched mRNA & Protein)"
                  : "X-Axis: mRNA Transcript Gene"}
              </label>
              <SearchableGeneSelect
                options={scatterMode === "same_gene" ? allProteinOptions : allMrnaOptions}
                value={effectiveXGene}
                onChange={(g) => {
                  setXGene(g);
                  if (scatterMode === "same_gene") {
                    setYGene(g);
                    onSelectGene(g);
                  }
                }}
                placeholder="Search mRNA gene..."
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                Y-Axis: Global Protein Target
              </label>
              <SearchableGeneSelect
                options={allProteinOptions}
                value={effectiveYGene}
                onChange={(g) => {
                  if (scatterMode === "same_gene") {
                    setXGene(g);
                    setYGene(g);
                    onSelectGene(g);
                  } else {
                    setYGene(g);
                  }
                }}
                placeholder="Search protein target..."
              />
            </div>
          </div>

          {/* Notice if protein is missing in TMT for chosen same_gene */}
          {!yProtRecord && (
            <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-950/30 p-3 text-xs text-amber-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong>{effectiveYGene}</strong> is quantified in CPTAC RNA-seq but{" "}
                <strong>not detected in the 11,662-protein TMT mass-spec matrix</strong>. Switch to{" "}
                <button
                  onClick={() => {
                    setScatterMode("cross_omic");
                    setXGene(effectiveYGene);
                    setYGene("NQO1");
                  }}
                  className="underline text-amber-300 font-semibold hover:text-amber-100"
                >
                  Cross-Omic mode ({effectiveYGene} mRNA vs. NQO1 Protein)
                </button>{" "}
                to test regulator decoupling.
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 mb-2">
            {colorBy === "stage" && (
              <>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-violet-400 inline-block" /> Stage I
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" /> Stage II
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Stage III
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" /> Stage IV
                </span>
              </>
            )}
            {colorBy === "cellularity" && (
              <>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block" /> High (&ge;45%)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Med (25–44%)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" /> Low (&lt;25%)
                </span>
              </>
            )}
            {includeNat && (
              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" /> Normal NAT
              </span>
            )}
            <span className="ml-auto text-slate-400 font-mono">
              Line: OLS fit | n = {scatterData.stats?.n ?? 0}
            </span>
          </div>

          <div
            ref={scatterWrapperRef}
            className="relative w-full h-[390px] rounded-lg border border-slate-800/80 bg-slate-950/80 overflow-hidden"
          >
            <canvas
              ref={scatterCanvasRef}
              onMouseMove={handleScatterMouseMove}
              onMouseLeave={() => setHoveredPt(null)}
              className="absolute inset-0 w-full h-full block cursor-crosshair"
            />
            {!mrnaBuffer || !protBuffer ? (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 text-xs text-slate-400">
                Streaming CPTAC expression matrices for paired plotting...
              </div>
            ) : null}
            {hoveredPt && (
              <div
                className="fixed z-50 pointer-events-none rounded-lg border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs shadow-xl"
                style={{
                  left: hoveredPt.clientX + 14,
                  top: hoveredPt.clientY - 12,
                }}
              >
                <div className="font-bold text-slate-100">{hoveredPt.pt.caseId}</div>
                <div className="text-slate-400 text-[11px]">
                  {hoveredPt.pt.histology} &middot; {hoveredPt.pt.stage}
                  {hoveredPt.pt.cellularity !== null
                    ? ` &middot; ${hoveredPt.pt.cellularity.toFixed(0)}% tumor`
                    : ""}
                </div>
                <div className="mt-1 font-mono text-sky-300">
                  {effectiveXGene} mRNA: {hoveredPt.pt.x.toFixed(3)}
                </div>
                <div className="font-mono text-amber-300">
                  {effectiveYGene} Protein: {hoveredPt.pt.y.toFixed(3)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Pathway Concordance Comparison */}
        <div className="xl:col-span-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                Pathway-Level Concordance Comparison
              </h3>
              <p className="text-[11px] text-slate-400">
                Median &amp; IQR mRNA-Protein Pearson r across MSigDB Hallmark Pathways
              </p>
            </div>
            <ExportButton
              label="Export Pathways"
              size="sm"
              onExportCSV={handleExportPathwayCSV}
              onExportPNG={(opts) =>
                exportCanvasToPNG({
                  canvas: renderPubPathwayCanvas(opts?.theme === "light"),
                  filename: "CPTAC_PDAC_Pathway_Concordance.png",
                  theme: opts?.theme || "light",
                })
              }
              onExportSVG={(opts) =>
                exportCanvasToSVG({
                  canvas: renderPubPathwayCanvas(opts?.theme === "light"),
                  filename: "CPTAC_PDAC_Pathway_Concordance.svg",
                  theme: opts?.theme || "light",
                })
              }
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <select
              value={pathwaySort}
              onChange={(e) => setPathwaySort(e.target.value as PathwaySortMode)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200"
            >
              <option value="highest_r">Sort: Highest Concordance (r)</option>
              <option value="lowest_r">Sort: Lowest Concordance (r)</option>
              <option value="alphabetical">Sort: Alphabetical (A–Z)</option>
            </select>

            <div className="relative flex-1 min-w-[160px]">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
              <input
                type="text"
                value={pathwaySearch}
                onChange={(e) => setPathwaySearch(e.target.value)}
                placeholder="Filter MSigDB Hallmark..."
                className="w-full rounded-lg border border-slate-700 bg-slate-950 pl-8 pr-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500"
              />
            </div>
          </div>

          <div
            ref={pathwayWrapperRef}
            className="relative w-full h-[420px] rounded-lg border border-slate-800/80 bg-slate-950/80 overflow-hidden"
          >
            <canvas ref={pathwayCanvasRef} className="absolute inset-0 w-full h-full block" />
          </div>

          <div className="mt-2.5 flex items-center gap-2 text-[11px] text-slate-400">
            <Info className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span>
              Bars show median gene-level mRNA&ndash;protein Pearson r across MSigDB Hallmark pathways; horizontal whiskers indicate the interquartile range (Q25&ndash;Q75) and the dashed vertical line marks the proteome-wide median.
            </span>
          </div>
        </div>
      </div>

      {/* Gene-Level Proteome-Wide Concordance Explorer Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-100">
              Gene-Level Matched mRNA-vs-Protein Concordance Explorer (Top 25 Shown)
            </h3>
            <p className="text-xs text-slate-400">
              Search any of the 11,662 quantified proteins or 7,430 mRNA-only genes; click a row to plot above
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
              <input
                type="text"
                value={panelSearch}
                onChange={(e) => setPanelSearch(e.target.value)}
                placeholder="Search any gene / protein..."
                className="rounded-lg border border-slate-700 bg-slate-950 pl-8 pr-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500"
              />
            </div>
            <ExportButton
              label="Export Table CSV"
              size="sm"
              onExportCSV={() =>
                exportToCSV({
                  filename: "CPTAC_PDAC_Gene_Concordance.csv",
                  metadata: {
                    dataset: "CPTAC-PDAC (Cao et al., Cell 2021)",
                    module: "Gene-Level mRNA-Protein Concordance Table",
                  },
                  headers: [
                    "Gene",
                    "Protein_Detected_TMT",
                    "Paired_N",
                    "Pearson_r",
                    "Pearson_p",
                    "Spearman_rho",
                    "Spearman_p",
                    "Protein_TumorVsNAT_log2FC",
                    "Protein_MW_FDR_q",
                    "mRNA_TumorVsNAT_log2FC",
                  ],
                  rows: nrf2PanelRows.map((row) => [
                    row.g,
                    row.quantifiedProtein ? "Yes" : "mRNA-only",
                    row.nPairMP,
                    row.r,
                    row.rP,
                    row.rho,
                    row.rhoP,
                    row.log2FC,
                    row.mwQ,
                    row.mLog2FC,
                  ]),
                })
              }
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="border-b border-slate-800 text-slate-400 uppercase text-[11px]">
              <tr>
                {(
                  [
                    ["g", "Gene / Protein"],
                    ["nPairMP", "Paired n"],
                    ["r", "Pearson r"],
                    ["rho", "Spearman rho"],
                    ["log2FC", "Protein log2FC (T/NAT)"],
                    ["mLog2FC", "mRNA log2FC (T/NAT)"],
                  ] as const
                ).map(([key, label]) => (
                  <th
                    key={key}
                    onClick={() =>
                      setPanelSort((prev) => ({
                        key,
                        dir:
                          prev.key === key && prev.dir === "desc" ? "asc" : "desc",
                      }))
                    }
                    className="py-2.5 px-3 cursor-pointer hover:text-slate-200 select-none"
                  >
                    <span className="inline-flex items-center gap-1">
                      {label}
                      {panelSort.key === key &&
                        (panelSort.dir === "desc" ? (
                          <ChevronDown className="w-3 h-3" />
                        ) : (
                          <ChevronUp className="w-3 h-3" />
                        ))}
                    </span>
                  </th>
                ))}
                <th className="py-2.5 px-3">Proteogenomic Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {nrf2PanelRows.map((row) => {
                const isSelected =
                  scatterMode === "same_gene" &&
                  effectiveXGene.toUpperCase() === row.g;
                return (
                  <tr
                    key={row.g}
                    onClick={() => {
                      if (row.quantifiedProtein) {
                        setScatterMode("same_gene");
                        setXGene(row.g);
                        setYGene(row.g);
                        onSelectGene(row.g);
                      } else {
                        setScatterMode("cross_omic");
                        setXGene(row.g);
                        setYGene("NQO1");
                      }
                    }}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-sky-950/40 text-slate-100"
                        : "hover:bg-slate-800/50 text-slate-300"
                    }`}
                  >
                    <td className="py-2 px-3 font-bold font-mono">
                      <span className="text-slate-100">{row.g}</span>
                      {!row.quantifiedProtein && (
                        <span className="ml-2 px-1.5 py-0.5 text-[10px] rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-sans">
                          mRNA-only
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-400">
                      {row.quantifiedProtein ? row.nPairMP : "0 (mRNA 140)"}
                    </td>
                    <td className="py-2 px-3 font-mono">
                      {row.r !== null ? (
                        <span
                          className={
                            row.r >= 0.5
                              ? "text-emerald-400 font-semibold"
                              : row.r >= 0.3
                              ? "text-sky-300"
                              : "text-slate-400"
                          }
                        >
                          {row.r.toFixed(3)}{" "}
                          <span className="text-[10px] text-slate-500">
                            ({row.rP !== null ? formatPublicationPValue(row.rP) : ""})
                          </span>
                        </span>
                      ) : (
                        <span className="text-slate-500">ND in TMT</span>
                      )}
                    </td>
                    <td className="py-2 px-3 font-mono">
                      {row.rho !== null ? (
                        <span>
                          {row.rho.toFixed(3)}{" "}
                          <span className="text-[10px] text-slate-500">
                            ({row.rhoP !== null ? formatPublicationPValue(row.rhoP) : ""})
                          </span>
                        </span>
                      ) : (
                        <span className="text-slate-500">&mdash;</span>
                      )}
                    </td>
                    <td className="py-2 px-3 font-mono">
                      {row.log2FC !== null ? (
                        <span
                          className={
                            row.log2FC > 0
                              ? "text-rose-400 font-semibold"
                              : "text-sky-400 font-semibold"
                          }
                        >
                          {row.log2FC > 0 ? "+" : ""}
                          {row.log2FC.toFixed(3)}
                        </span>
                      ) : (
                        <span className="text-slate-500">&mdash;</span>
                      )}
                    </td>
                    <td className="py-2 px-3 font-mono">
                      {row.mLog2FC !== null ? (
                        <span
                          className={
                            row.mLog2FC > 0 ? "text-rose-300" : "text-sky-300"
                          }
                        >
                          {row.mLog2FC > 0 ? "+" : ""}
                          {row.mLog2FC.toFixed(3)}
                        </span>
                      ) : (
                        <span className="text-slate-500">&mdash;</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-[11px] text-slate-400">
                      {!row.quantifiedProtein
                        ? "Quantified in RNA-seq; below TMT detection limit — click to test cross-omic vs NQO1 protein"
                        : row.r !== null && row.r >= 0.55
                        ? "High RNA-to-protein translation fidelity"
                        : row.r !== null && row.r < 0.35
                        ? "Moderate/buffered post-transcriptional regulation"
                        : "Concordant mRNA & protein regulation"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* All Pathways Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="text-sm font-bold text-slate-100 mb-3">
          Pathway Concordance Directory ({filteredPathways.length} sets shown)
        </h3>
        <div className="overflow-x-auto max-h-[340px]">
          <table className="w-full text-xs text-left">
            <thead className="border-b border-slate-800 text-slate-400 uppercase text-[11px] sticky top-0 bg-slate-900">
              <tr>
                <th className="py-2 px-3">Pathway / Panel</th>
                <th className="py-2 px-3">Category</th>
                <th className="py-2 px-3">Paired / Total</th>
                <th className="py-2 px-3">Median r (IQR)</th>
                <th className="py-2 px-3">Median &rho;</th>
                <th className="py-2 px-3">Top Concordant (Click)</th>
                <th className="py-2 px-3">Lowest / Decoupled (Click)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filteredPathways.map((pw) => (
                <tr key={pw.id} className="hover:bg-slate-800/40">
                  <td className="py-2 px-3 font-medium text-slate-200">{pw.name}</td>
                  <td className="py-2 px-3 text-slate-400">{pw.category}</td>
                  <td className="py-2 px-3 font-mono text-slate-300">
                    {pw.quantified_paired} / {pw.total_genes}
                  </td>
                  <td className="py-2 px-3 font-mono text-sky-300">
                    {pw.median_r.toFixed(3)}{" "}
                    <span className="text-[10px] text-slate-500">
                      ({pw.q25_r.toFixed(2)}–{pw.q75_r.toFixed(2)})
                    </span>
                  </td>
                  <td className="py-2 px-3 font-mono text-emerald-300">
                    {pw.median_rho !== null ? pw.median_rho.toFixed(3) : "—"}
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex flex-wrap gap-1">
                      {pw.top_concordant.slice(0, 3).map((g) => (
                        <button
                          key={g.g}
                          onClick={() => {
                            setScatterMode("same_gene");
                            setXGene(g.g);
                            setYGene(g.g);
                            onSelectGene(g.g);
                          }}
                          className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono text-[10px] hover:bg-emerald-500/25"
                        >
                          {g.g} ({g.r.toFixed(2)})
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex flex-wrap gap-1">
                      {pw.lowest_concordant.slice(0, 3).map((g) => (
                        <button
                          key={g.g}
                          onClick={() => {
                            setScatterMode("same_gene");
                            setXGene(g.g);
                            setYGene(g.g);
                            onSelectGene(g.g);
                          }}
                          className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 font-mono text-[10px] hover:bg-rose-500/25"
                        >
                          {g.g} ({g.r.toFixed(2)})
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
