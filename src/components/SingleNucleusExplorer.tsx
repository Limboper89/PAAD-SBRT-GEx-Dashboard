"use client";

import React, {
  useEffect, useState, useMemo, useRef, useCallback
} from "react";
import {
  Search, Info, AlertTriangle, ChevronDown,
  TrendingUp, Cpu, X, HelpCircle, Layers, Users, Download, Bot,
  BarChart3, GitCompare, Table, ShieldAlert, Sparkles, Filter
} from "lucide-react";

import ExportButton from "./ExportButton";
import { exportCanvasToPNG, exportCanvasToSVG, exportToCSV } from "@/utils/exportUtils";
import { useAIContext } from "@/components/ai/AIProvider";
import { 
  computePatientPseudobulk, 
  PatientPseudobulkResult, 
  CellMeta 
} from "@/utils/singleNucleusStats";

// ─── Types ──────────────────────────────────────────────────────────────────
interface CellMetadata extends CellMeta {}
interface GeneEntry { s: string; k: string; i: number; c?: number; o?: number; l?: number; }
interface GeneIndex {
  n_genes: number; n_indexed: number; n_duplicates: number;
  n_unsafe: number; n_mt: number; n_rp: number;
  format: string; precision_note: string;
  genes: GeneEntry[];
}
interface PatientInfo {
  n_nuclei: number; treatment_group: string; treatment_status: string;
}

// ─── Float16 decoder (IEEE 754) ─────────────────────────────────────────────
function f16ToF32(h: number): number {
  const s = (h & 0x8000) ? -1 : 1;
  const e = (h >> 10) & 0x1F;
  const m = h & 0x3FF;
  if (e === 0) return s * Math.pow(2, -14) * (m / 1024);
  if (e === 31) return m ? NaN : s * Infinity;
  return s * Math.pow(2, e - 15) * (1 + m / 1024);
}

// ─── Color palettes ──────────────────────────────────────────────────────────
const BROAD_COLORS: Record<string, string> = {
  "Epithelial": "#f43f5e", "Fibroblast": "#3b82f6", "Immune": "#a855f7",
  "Endothelial": "#eab308", "Endocrine": "#10b981", "Schwann": "#ec4899",
  "unknown": "#64748b",
};
const LEVEL2_COLORS: Record<string, string> = {
  "Malignant": "#f43f5e", "CAF": "#60a5fa", "Ductal": "#fb923c",
  "Vascular": "#fbbf24", "Pericyte": "#a78bfa", "myCAF": "#38bdf8",
  "Macrophage": "#c084fc", "Acinar": "#4ade80", "Ductal (atypical)": "#fdba74",
  "Vascular smooth muscle": "#fde68a", "CD8+ T": "#818cf8", "ADM": "#f97316",
  "Beta": "#34d399", "Alpha": "#6ee7b7", "CD4+ T": "#7c3aed",
  "Schwann": "#f472b6", "Gamma": "#86efac", "Lymphatic": "#67e8f9",
  "Hormone-negative neuroendocrine": "#a3e635", "B": "#e879f9",
  "Dendritic": "#c026d3", "Natural killer": "#9333ea", "Treg": "#6366f1",
  "Delta": "#2dd4bf", "Adipocyte": "#d4d4aa", "Plasma": "#f0abfc",
  "Mast": "#fca5a5", "Neutrophil": "#fcd34d", "Epsilon": "#bbf7d0",
  "Intra-pancreatic neurons": "#e2e8f0",
};
const TREATMENT_COLORS: Record<string, string> = {
  "Treatment-naïve": "#14b8a6", "Neoadjuvant-treated": "#f97316",
};

// ─── Expression color (0→grey, nonzero→teal→amber→rose) ─────────────────────
function exprColor(val: number, cap: number): string {
  if (val <= 0 || cap <= 0) return "rgba(51,65,85,0.18)";
  const r = Math.min(val / cap, 1.0);
  let red, grn, blu;
  if (r < 0.5) {
    const f = r * 2;
    red = Math.round(20 + (234 - 20) * f);
    grn = Math.round(184 + (179 - 184) * f);
    blu = Math.round(8 + (94 - 8) * f);
  } else {
    const f = (r - 0.5) * 2;
    red = Math.round(234 + (244 - 234) * f);
    grn = Math.round(179 + (63 - 179) * f);
    blu = Math.round(8 + (94 - 8) * f);
  }
  return `rgba(${red},${grn},${blu},0.88)`;
}

// ─── LRU Cache configuration ─────────────────────────────────────────────────
const MAX_CACHE = 60;
const exprCache = new Map<string, Float32Array>();
function cacheGet(key: string) { return exprCache.get(key); }
function cacheSet(key: string, vec: Float32Array) {
  if (exprCache.size >= MAX_CACHE) {
    const oldest = exprCache.keys().next().value!;
    exprCache.delete(oldest);
  }
  exprCache.set(key, vec);
}

export type CohortFilter = 
  | "ALL" 
  | "NAIVE" 
  | "TREATED" 
  | "CRT" 
  | "CRTl" 
  | "CRTn" 
  | "CRTx" 
  | "GART" 
  | "RT"
  | "RESP_MOD" 
  | "RESP_MIN" 
  | "RESP_POOR";

export type AnalysisTab = "atlas" | "treatment_comparison" | "pseudobulk_table";

export default function SingleNucleusExplorer() {
  const basePath = "/PAAD-SBRT-GEx-Dashboard";
  const DATA = `${basePath}/data/gse202051`;

  // States
  const [cells, setCells]         = useState<CellMetadata[]>([]);
  const [patients, setPatients]   = useState<Record<string, PatientInfo>>({});
  const [atlasInfo, setAtlasInfo] = useState<any>(null);
  const [geneIndex, setGeneIndex] = useState<GeneIndex | null>(null);

  const [loading, setLoading]         = useState(true);
  const [errorMsg, setErrorMsg]       = useState<string | null>(null);
  const [loadingGene, setLoadingGene] = useState(false);

  // Expression variables
  const [exprVec, setExprVec]         = useState<Float32Array | null>(null);
  const [activeGene, setActiveGene]   = useState<string | null>(null);
  const [exprCap, setExprCap]         = useState(0);
  const [exprActualMax, setExprActualMax] = useState(0);
  const [capped, setCapped]           = useState(false);

  // UI state
  type ColorMode = "broad" | "level2" | "expression" | "treatment";
  const [colorMode, setColorMode] = useState<ColorMode>("broad");
  const [selectedCohort, setSelectedCohort] = useState<CohortFilter>("ALL");
  const [selectedPid, setSelectedPid] = useState("ALL");
  const [activeTab, setActiveTab] = useState<AnalysisTab>("atlas");
  const [comparisonLevel, setComparisonLevel] = useState<"broad" | "level2">("broad");

  const [query, setQuery]         = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);

  // Broad Type Inspector / Subtype Hierarchy State
  const [selectedBroadInspect, setSelectedBroadInspect] = useState<string>("ALL");

  // Canvas / interaction
  const canvasRef    = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = useState({ w: 600, h: 480 });
  const [zoom, setZoom] = useState(1.0);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const [hovered, setHovered] = useState<{ cell: CellMetadata; origIdx: number } | null>(null);
  const [tipPos, setTipPos]   = useState({ x: 0, y: 0 });
  const chunkCacheRef = useRef<Map<number, ArrayBuffer>>(new Map());

  // Map for upper case symbol lookups
  const symbolMap = useMemo(() => {
    if (!geneIndex) return new Map<string, GeneEntry>();
    const m = new Map<string, GeneEntry>();
    geneIndex.genes.forEach(g => m.set(g.s.toUpperCase(), g));
    return m;
  }, [geneIndex]);

  const geneSymbols = useMemo(() =>
    geneIndex ? geneIndex.genes.map(g => g.s) : [],
  [geneIndex]);

  // Fetch metadata & index on mount (on-demand loading)
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [metaR, infoR, geneR, patR] = await Promise.all([
          fetch(`${DATA}/metadata.json`),
          fetch(`${DATA}/atlas_info.json`),
          fetch(`${DATA}/genes_index_chunked.json`),
          fetch(`${DATA}/patients.json`),
        ]);
        if (!metaR.ok) throw new Error("Failed to load cell metadata.");
        setCells(await metaR.json());
        if (infoR.ok) setAtlasInfo(await infoR.json());
        if (geneR.ok) setGeneIndex(await geneR.json());
        if (patR.ok) setPatients(await patR.json());
        setLoading(false);
      } catch (e: any) {
        setErrorMsg(e.message);
        setLoading(false);
      }
    })();
  }, [DATA]);

  const { registerModuleContext } = useAIContext();

  // Sync state to PDACopilot
  useEffect(() => {
    registerModuleContext({
      module: "Single Nucleus",
      gene: activeGene,
      dataset: "GSE202051: PDAC Single-Nucleus Reference Atlas",
      currentFigure: activeTab === "atlas" ? "Single-Nucleus UMAP Atlas" : "Treatment-Stratified Comparison",
      singleNucleusStats: {
        selectedCellType: `${selectedBroadInspect !== "ALL" ? selectedBroadInspect : "All Cell Types"} (${selectedCohort})`,
        totalNuclei: "224,988",
        markerGenes: activeGene ? [activeGene, "NFE2L2", "COL1A1", "EPCAM", "CD8A"] : ["NFE2L2", "COL1A1", "EPCAM", "CD8A"]
      }
    });
  }, [activeGene, selectedCohort, selectedBroadInspect, activeTab, registerModuleContext]);

  // Autocomplete searches
  useEffect(() => {
    const q = query.trim().toUpperCase();
    if (!q || !geneIndex) { setSuggestions([]); return; }
    const exact   = geneSymbols.filter(s => s.toUpperCase() === q);
    const prefix  = geneSymbols.filter(s => s.toUpperCase().startsWith(q) && s.toUpperCase() !== q);
    const contain = geneSymbols.filter(s => s.toUpperCase().includes(q) && !s.toUpperCase().startsWith(q));
    setSuggestions([...exact, ...prefix, ...contain].slice(0, 10));
    setShowSuggest(true);
  }, [query, geneSymbols, geneIndex]);

  // Load gene binary on-demand
  const handleGene = useCallback(async (symbol: string) => {
    const upper = symbol.trim().toUpperCase();
    const entry = symbolMap.get(upper);
    if (!entry) {
      alert(`Gene "${symbol}" not found in the processed GSE202051 atlas.`);
      return;
    }
    setQuery(""); setSuggestions([]); setShowSuggest(false);

    // Caching
    const cached = cacheGet(entry.k);
    if (cached) {
      applyExpression(entry.s, cached);
      return;
    }

    setLoadingGene(true);
    try {
      const chunkId = entry.c ?? 0;
      const offset = entry.o ?? 0;
      const length = entry.l ?? 0;

      let chunkBuf = chunkCacheRef.current.get(chunkId);
      if (!chunkBuf) {
        const chunkFilename = `chunk_${chunkId.toString().padStart(3, "0")}.bin`;
        const res = await fetch(`${DATA}/expression_chunks/${chunkFilename}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        chunkBuf = await res.arrayBuffer();
        chunkCacheRef.current.set(chunkId, chunkBuf);
      }

      const buf = chunkBuf.slice(offset, offset + length);
      const dv     = new DataView(buf);
      const n_nz   = dv.getUint32(0, true);
      const idxArr = new Uint16Array(buf, 4, n_nz);
      const valU16 = new Uint16Array(buf, 4 + n_nz * 2, n_nz);
      const vec    = new Float32Array(20000);
      for (let i = 0; i < n_nz; i++) vec[idxArr[i]] = f16ToF32(valU16[i]);
      
      cacheSet(entry.k, vec);
      applyExpression(entry.s, vec);
    } catch (e: any) {
      alert(`Failed to load expression: ${e.message}`);
    } finally {
      setLoadingGene(false);
    }
  }, [symbolMap, DATA]);

  function applyExpression(symbol: string, vec: Float32Array) {
    const nonzero = Array.from(vec).filter(v => v > 0).sort((a, b) => a - b);
    const actualMax = nonzero.length > 0 ? nonzero[nonzero.length - 1] : 0;
    const p99idx  = Math.max(0, Math.ceil(nonzero.length * 0.99) - 1);
    const p99      = nonzero.length > 0 ? nonzero[p99idx] : 0;
    const useCap   = p99 < actualMax * 0.98;
    setExprVec(vec);
    setActiveGene(symbol);
    setExprCap(useCap ? p99 : actualMax);
    setExprActualMax(actualMax);
    setCapped(useCap);
    setColorMode("expression");
  }

  // Active subset cells filtered by Cohort & Patient selection
  const { activeCells, activeOrigIdx } = useMemo(() => {
    return cells.reduce<{ activeCells: CellMetadata[]; activeOrigIdx: number[] }>(
      (acc, c, i) => {
        // 1. Patient ID Filter
        if (selectedPid !== "ALL" && c.pid !== selectedPid) return acc;

        // 2. Cohort Filter
        const isNaive = (c.treatment_group || "").toLowerCase().includes("na");
        const isTreated = (c.treatment_group || "").toLowerCase().includes("treat");

        if (selectedCohort === "NAIVE" && !isNaive) return acc;
        if (selectedCohort === "TREATED" && !isTreated) return acc;

        // Regimen Subgroup Filters
        if (["CRT", "CRTl", "CRTn", "CRTx", "GART", "RT"].includes(selectedCohort)) {
          if (!isTreated || c.treatment !== selectedCohort) return acc;
        }

        // Response Subgroup Filters
        if (selectedCohort === "RESP_MOD" && !c.response?.toLowerCase().includes("moderate")) return acc;
        if (selectedCohort === "RESP_MIN" && !c.response?.toLowerCase().includes("minimal")) return acc;
        if (selectedCohort === "RESP_POOR" && !c.response?.toLowerCase().includes("poor")) return acc;

        acc.activeCells.push(c);
        acc.activeOrigIdx.push(i);
        return acc;
      },
      { activeCells: [], activeOrigIdx: [] }
    );
  }, [cells, selectedPid, selectedCohort]);

  // Coordinate boundaries
  const bounds = useMemo(() => {
    if (cells.length === 0) return { minX: -6, maxX: 6, minY: -6, maxY: 6 };
    let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity;
    cells.forEach(c => {
      if (c.x < mnX) mnX = c.x; if (c.x > mxX) mxX = c.x;
      if (c.y < mnY) mnY = c.y; if (c.y > mxY) mxY = c.y;
    });
    return { minX: mnX - 0.5, maxX: mxX + 0.5, minY: mnY - 0.5, maxY: mxY + 0.5 };
  }, [cells]);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setDims({ w: Math.max(width - 4, 200), h: Math.max(height - 4, 200) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const toScreen = useCallback((x: number, y: number) => {
    const pad = 16;
    const sx = pad + (x - bounds.minX) / (bounds.maxX - bounds.minX) * (dims.w - pad * 2);
    const sy = dims.h - pad - (y - bounds.minY) / (bounds.maxY - bounds.minY) * (dims.h - pad * 2);
    const cx = dims.w / 2, cy = dims.h / 2;
    return { x: (sx - cx) * zoom + cx + panX, y: (sy - cy) * zoom + cy + panY };
  }, [bounds, dims, zoom, panX, panY]);

  // Cell coloring with Broad-type subcategory inspector support
  const getCellColor = useCallback((cell: CellMetadata, origIdx: number): string => {
    if (selectedBroadInspect !== "ALL" && cell.broad_celltype !== selectedBroadInspect) {
      return "rgba(51, 65, 85, 0.08)";
    }

    if (colorMode === "broad")      return BROAD_COLORS[cell.broad_celltype] ?? "#64748b";
    if (colorMode === "level2")     return LEVEL2_COLORS[cell.level2] ?? "#64748b";
    if (colorMode === "treatment")  return TREATMENT_COLORS[cell.treatment_group] ?? "#64748b";
    if (colorMode === "expression" && exprVec)
      return exprColor(exprVec[origIdx] ?? 0, exprCap);
    return "#64748b";
  }, [colorMode, exprVec, exprCap, selectedBroadInspect]);

  // Draw UMAP loops
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || activeCells.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = dims.w * dpr;
    canvas.height = dims.h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, dims.w, dims.h);

    const order = activeCells.map((_, i) => i);
    if (colorMode === "expression" && exprVec) {
      order.sort((a, b) => (exprVec[activeOrigIdx[a]] ?? 0) - (exprVec[activeOrigIdx[b]] ?? 0));
    }

    for (const i of order) {
      const cell    = activeCells[i];
      const origIdx = activeOrigIdx[i];
      const pt      = toScreen(cell.x, cell.y);
      if (pt.x < -10 || pt.x > dims.w + 10 || pt.y < -10 || pt.y > dims.h + 10) continue;
      
      const exprVal = (colorMode === "expression" && exprVec) ? (exprVec[origIdx] ?? 0) : 0;
      const r       = colorMode === "expression" && exprVal > 0 ? 3.6 : 2.8;

      ctx.fillStyle = getCellColor(cell, origIdx);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (hovered) {
      const pt = toScreen(hovered.cell.x, hovered.cell.y);
      ctx.strokeStyle = "#14b8a6";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 8, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [activeCells, activeOrigIdx, dims, zoom, panX, panY, colorMode, exprVec, exprCap, hovered, toScreen, getCellColor]);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    if (dragging.current) {
      setPanX(ox => ox + (e.clientX - dragStart.current.x));
      setPanY(oy => oy + (e.clientY - dragStart.current.y));
      dragStart.current = { x: e.clientX, y: e.clientY };
      return;
    }
    let best: typeof hovered = null, bestD = 12;
    activeCells.forEach((cell, i) => {
      const pt = toScreen(cell.x, cell.y);
      const d  = Math.hypot(mx - pt.x, my - pt.y);
      if (d < bestD) { bestD = d; best = { cell, origIdx: activeOrigIdx[i] }; }
    });
    setHovered(best);
    if (best) setTipPos({ x: mx, y: my });
  }, [activeCells, activeOrigIdx, toScreen]);

  const onWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setZoom(z => Math.max(0.25, Math.min(z * (e.deltaY < 0 ? 1.15 : 0.87), 30)));
  }, []);

  // ── Cell-type expression summary data (Exploratory Nucleus Level) ───────────
  const dotData = useMemo(() => {
    if (!activeGene || !exprVec || activeCells.length === 0) return [];
    
    const groups: Record<string, number[]> = {};
    activeCells.forEach((c, i) => {
      const v = exprVec[activeOrigIdx[i]] ?? 0;
      if (!groups[c.level2]) groups[c.level2] = [];
      groups[c.level2].push(v);
    });

    return Object.entries(groups).map(([ct, vals]) => {
      const exp = vals.filter(v => v > 0);
      const meanAll = vals.reduce((a, b) => a + b, 0) / vals.length;
      const meanPos = exp.length ? exp.reduce((a, b) => a + b, 0) / exp.length : 0;
      
      return {
        cellType: ct,
        total:    vals.length,
        pct:      (exp.length / vals.length) * 100,
        meanAll:  meanAll,
        meanPos:  meanPos,
        tooSmall: vals.length < 10,
      };
    }).filter(r => r.pct > 0).sort((a, b) => b.meanAll - a.meanAll);
  }, [activeCells, activeOrigIdx, exprVec, activeGene]);

  // ── Patient-Aware Pseudobulk Statistics (Confirmatory Patient Level) ─────────
  const pseudobulkResults = useMemo(() => {
    if (!activeGene || !exprVec || cells.length === 0) return [];
    const subFilter = ["CRT", "CRTl", "CRTn", "CRTx", "GART", "RT"].includes(selectedCohort) ? selectedCohort : undefined;
    const key = comparisonLevel === "broad" ? "broad_celltype" : "level2";
    return computePatientPseudobulk(exprVec, cells, key, subFilter);
  }, [activeGene, exprVec, cells, comparisonLevel, selectedCohort]);

  // CSV Download handler for Patient Pseudobulk Table
  const handleDownloadPseudobulkCSV = useCallback(() => {
    if (!activeGene || pseudobulkResults.length === 0) return;

    exportToCSV({
      filename: `GSE202051_${activeGene}_Patient_Pseudobulk_Treatment_Comparison.csv`,
      metadata: {
        dataset: "GSE202051 Single-Nucleus Reference Atlas",
        module: "Patient-Aware Pseudobulk Treatment Comparison",
        selectedGene: activeGene,
        cohort: "Treatment-Naïve (n=18) vs Neoadjuvant-Treated (n=25, 100% RT/CRT)",
        statisticalUnit: "Patient (Biological Replicate)",
      },
      headers: [
        "Cell Lineage / Subtype",
        "Naïve Patients (n)",
        "Treated Patients (n)",
        "Naïve Nuclei",
        "Treated Nuclei",
        "Naïve % Pos",
        "Treated % Pos",
        "Naïve Mean (Pseudobulk)",
        "Naïve SE",
        "Treated Mean (Pseudobulk)",
        "Treated SE",
        "Delta Pseudobulk",
        "log2FC",
        "Cohen's d",
        "95% CI Lower",
        "95% CI Upper",
        "Welch t p-value",
        "Mann-Whitney U p-value",
        "FDR q-value",
        "Status"
      ],
      rows: pseudobulkResults.map((r) => [
        r.cellType,
        r.naivePatientCount,
        r.treatedPatientCount,
        r.naiveNucleusCount,
        r.treatedNucleusCount,
        r.naivePctExpressing.toFixed(2),
        r.treatedPctExpressing.toFixed(2),
        r.naiveMean.toFixed(4),
        r.naiveSE.toFixed(4),
        r.treatedMean.toFixed(4),
        r.treatedSE.toFixed(4),
        r.deltaPseudobulk.toFixed(4),
        r.log2FC.toFixed(4),
        r.cohensD.toFixed(3),
        r.ci95Lower.toFixed(4),
        r.ci95Upper.toFixed(4),
        r.pValueWelch.toExponential(4),
        r.pValueMannWhitney.toExponential(4),
        r.qValue.toExponential(4),
        r.direction
      ]),
    });
  }, [activeGene, pseudobulkResults]);

  // High-Res Publication Canvas Generator for Treatment Comparison
  const generateHighResComparisonCanvas = (theme: "light" | "dark" = "light", size: number = 2400): HTMLCanvasElement => {
    const offscreen = document.createElement("canvas");
    offscreen.width = size;
    offscreen.height = Math.round(size * 0.60); // 2400 x 1440 px
    const ctx = offscreen.getContext("2d");
    if (!ctx) return offscreen;

    const isLight = theme === "light";
    const w = offscreen.width;
    const h = offscreen.height;

    // Background
    ctx.fillStyle = isLight ? "#ffffff" : "#020617";
    ctx.fillRect(0, 0, w, h);

    // Title & Header
    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 48px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Single-Nucleus Treatment-Stratified Comparison: ${activeGene || "Target Gene"}`, 80, 80);

    ctx.fillStyle = isLight ? "#475569" : "#94a3b8";
    ctx.font = "bold 24px monospace";
    ctx.fillText(
      `GSE202051 snRNA-seq · Patient Pseudobulk: Treatment-Naïve (n=18) vs. Neoadjuvant-Treated [100% RT/CRT] (n=25)`,
      80,
      126
    );

    // Divider
    ctx.strokeStyle = isLight ? "#e2e8f0" : "#1e293b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(80, 155);
    ctx.lineTo(w - 80, 155);
    ctx.stroke();

    // Plot Dimensions
    const padLeft = 160;
    const padRight = 160;
    const padTop = 230;
    const padBottom = 260;
    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;
    const plotBottom = padTop + plotH;

    const items = pseudobulkResults.slice(0, 8);
    const maxVal = Math.max(...items.flatMap(r => [r.naiveMean + r.naiveSE, r.treatedMean + r.treatedSE]), 1.0);
    const axisMax = Math.ceil(maxVal * 1.3 * 10) / 10;

    // Grid
    for (let i = 0; i <= 5; i++) {
      const y = padTop + (plotH / 5) * i;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + plotW, y);
      ctx.strokeStyle = isLight ? "#e2e8f0" : "#1e293b";
      ctx.lineWidth = i === 5 ? 3 : 1.5;
      ctx.stroke();

      const val = ((axisMax * (5 - i)) / 5).toFixed(2);
      ctx.fillStyle = isLight ? "#475569" : "#94a3b8";
      ctx.font = "bold 24px monospace";
      ctx.textAlign = "right";
      ctx.fillText(val, padLeft - 20, y + 8);
    }

    // Y-Axis Title
    ctx.save();
    ctx.translate(55, padTop + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 28px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Patient Pseudobulk Mean Expression (log1p ± SE)", 0, 0);
    ctx.restore();

    // Bars
    const n = items.length;
    const slotW = plotW / n;
    const groupW = Math.min(220, slotW * 0.70);
    const barW = groupW * 0.45;

    items.forEach((r, idx) => {
      const cx = padLeft + slotW * idx + slotW / 2;
      const xNaive = cx - groupW / 2;
      const xTreated = cx + groupW / 2 - barW;

      // 1. Naïve Bar (Teal)
      const hNaive = (r.naiveMean / axisMax) * plotH;
      const yNaive = plotBottom - hNaive;
      ctx.fillStyle = "#0d9488";
      ctx.fillRect(xNaive, yNaive, barW, hNaive);

      // Error bar Naïve
      const errTopN = plotBottom - ((r.naiveMean + r.naiveSE) / axisMax) * plotH;
      const errBotN = plotBottom - ((Math.max(0, r.naiveMean - r.naiveSE)) / axisMax) * plotH;
      ctx.strokeStyle = isLight ? "#0f172a" : "#ffffff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(xNaive + barW / 2, errTopN);
      ctx.lineTo(xNaive + barW / 2, errBotN);
      ctx.moveTo(xNaive + barW / 2 - 8, errTopN);
      ctx.lineTo(xNaive + barW / 2 + 8, errTopN);
      ctx.moveTo(xNaive + barW / 2 - 8, errBotN);
      ctx.lineTo(xNaive + barW / 2 + 8, errBotN);
      ctx.stroke();

      // 2. Treated Bar (Orange)
      const hTreated = (r.treatedMean / axisMax) * plotH;
      const yTreated = plotBottom - hTreated;
      ctx.fillStyle = "#f97316";
      ctx.fillRect(xTreated, yTreated, barW, hTreated);

      // Error bar Treated
      const errTopT = plotBottom - ((r.treatedMean + r.treatedSE) / axisMax) * plotH;
      const errBotT = plotBottom - ((Math.max(0, r.treatedMean - r.treatedSE)) / axisMax) * plotH;
      ctx.beginPath();
      ctx.moveTo(xTreated + barW / 2, errTopT);
      ctx.lineTo(xTreated + barW / 2, errBotT);
      ctx.moveTo(xTreated + barW / 2 - 8, errTopT);
      ctx.lineTo(xTreated + barW / 2 + 8, errTopT);
      ctx.moveTo(xTreated + barW / 2 - 8, errBotT);
      ctx.lineTo(xTreated + barW / 2 + 8, errBotT);
      ctx.stroke();

      // Delta / Significance label above pair
      const topY = Math.min(errTopN, errTopT) - 20;
      const sigText = r.qValue < 0.05 ? `q=${r.qValue.toExponential(1)}*` : `p=${r.pValueWelch.toFixed(2)}`;
      ctx.fillStyle = r.isSignificant ? "#f43f5e" : (isLight ? "#64748b" : "#94a3b8");
      ctx.font = "bold 20px monospace";
      ctx.textAlign = "center";
      ctx.fillText(sigText, cx, topY);

      // X-Axis Labels
      ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
      ctx.font = "bold 26px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(r.cellType, cx, plotBottom + 45);

      ctx.fillStyle = isLight ? "#64748b" : "#94a3b8";
      ctx.font = "bold 20px monospace";
      ctx.fillText(`N:${r.naivePatientCount}p / T:${r.treatedPatientCount}p`, cx, plotBottom + 82);
    });

    // Legend
    const legBoxW = 980;
    const legBoxH = 64;
    const legBoxX = (w - legBoxW) / 2;
    const legBoxY = h - 90;

    ctx.fillStyle = isLight ? "#f8fafc" : "#0b1329";
    ctx.fillRect(legBoxX, legBoxY, legBoxW, legBoxH);
    ctx.strokeStyle = isLight ? "#cbd5e1" : "#1e293b";
    ctx.lineWidth = 2.5;
    ctx.strokeRect(legBoxX, legBoxY, legBoxW, legBoxH);

    // Item 1: Naïve
    ctx.fillStyle = "#0d9488";
    ctx.fillRect(legBoxX + 40, legBoxY + 20, 28, 24);
    ctx.fillStyle = isLight ? "#1e293b" : "#e2e8f0";
    ctx.font = "bold 22px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Treatment-Naïve Cohort (n=18)", legBoxX + 80, legBoxY + 39);

    // Item 2: Treated
    ctx.fillStyle = "#f97316";
    ctx.fillRect(legBoxX + 530, legBoxY + 20, 28, 24);
    ctx.fillStyle = isLight ? "#1e293b" : "#e2e8f0";
    ctx.fillText("Neoadjuvant-Treated / RT-CRT (n=25)", legBoxX + 570, legBoxY + 39);

    return offscreen;
  };

  return (
    <div className="flex flex-col gap-6 text-slate-200">
      {/* 1. Header with Title & Clinical Badges */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <Layers className="h-6 w-6 text-rose-500" />
            <h1 className="text-xl font-bold text-white tracking-tight">
              Single-Nucleus Reference Atlas & Treatment Remodeling
            </h1>
            <span className="text-xs px-2.5 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-400 font-mono">
              GSE202051 · Hwang et al. (Nature Genetics 2022)
            </span>
          </div>
          <p className="text-xs text-slate-400 font-mono">
            High-resolution single-nucleus dissection across 43 human PDAC patients (224,988 total nuclei; 20,000 stratified subset).
          </p>
        </div>

        {/* Primary View Mode Switcher */}
        <div className="flex items-center gap-1 bg-slate-950 p-1.5 rounded-xl border border-slate-800 font-mono text-xs">
          <button
            onClick={() => setActiveTab("atlas")}
            className={`px-3.5 py-2 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === "atlas" ? "bg-rose-500 text-white shadow" : "text-slate-400 hover:text-white"
            }`}
          >
            <Cpu className="w-4 h-4" />
            UMAP Atlas Explorer
          </button>
          <button
            onClick={() => setActiveTab("treatment_comparison")}
            className={`px-3.5 py-2 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === "treatment_comparison" ? "bg-teal-500 text-white shadow" : "text-slate-400 hover:text-white"
            }`}
          >
            <GitCompare className="w-4 h-4" />
            Treatment Comparison (Pseudobulk)
          </button>
          <button
            onClick={() => setActiveTab("pseudobulk_table")}
            className={`px-3.5 py-2 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === "pseudobulk_table" ? "bg-amber-500 text-slate-950 shadow" : "text-slate-400 hover:text-white"
            }`}
          >
            <Table className="w-4 h-4" />
            Sensitivity & Patient Tables
          </button>
        </div>
      </div>

      {/* 2. Clinical Cohort Safeguard & Context Banner */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="text-slate-200 font-bold flex items-center gap-2">
              <span>Patient-Aware Biological Replicate Standard</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-teal-500/20 text-teal-300">
                18 Naïve vs. 25 Treated (100% Radiation/CRT-Exposed)
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Comparisons use patient pseudobulk means (n=43 biological units) with Welch's t-test and Mann-Whitney U sensitivity testing. Treated cohorts represent independent resection specimens.
            </p>
          </div>
        </div>

        {/* Global Cohort Filter Selector */}
        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-xs flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-teal-400" />
            Cohort Filter:
          </span>
          <select
            value={selectedCohort}
            onChange={(e) => setSelectedCohort(e.target.value as CohortFilter)}
            className="bg-slate-950 border border-slate-700 text-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-teal-500 cursor-pointer"
          >
            <option value="ALL">All Patients (n=43, 20,000 nuclei)</option>
            <option value="NAIVE">Treatment-Naïve (n=18, 9,689 nuclei)</option>
            <option value="TREATED">Neoadjuvant-Treated [100% RT/CRT] (n=25, 10,311 nuclei)</option>
            <optgroup label="── Exploratory Regimen Subgroups ──">
              <option value="CRT">Standard CRT (n=14, 6,455 nuclei)</option>
              <option value="CRTl">CRT + Losartan [CRTl] (n=5, 1,647 nuclei)</option>
              <option value="CRTn">CRT + Nivolumab [CRTn] (n=1, 502 nuclei)</option>
              <option value="CRTx">CRTx [Other Regimen] (n=2, 1,037 nuclei)</option>
              <option value="GART">GART [Gem/Abraxane+RT] (n=1, 245 nuclei)</option>
              <option value="RT">Radiation Alone [RT] (n=1, 260 nuclei)</option>
            </optgroup>
            <optgroup label="── Exploratory Pathological Response ──">
              <option value="RESP_MOD">Moderate Response (n=8)</option>
              <option value="RESP_MIN">Minimal Response (n=11)</option>
              <option value="RESP_POOR">Poor Response (n=6)</option>
            </optgroup>
          </select>
        </div>
      </div>

      {/* 3. Main Content Views */}
      {loading ? (
        <div className="h-96 flex flex-col items-center justify-center bg-slate-900 border border-slate-800 rounded-2xl gap-3">
          <div className="w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-mono text-slate-400">Loading GSE202051 Single-Nucleus Reference Atlas…</span>
        </div>
      ) : errorMsg ? (
        <div className="p-6 bg-rose-950/20 border border-rose-800 rounded-2xl text-rose-400 text-xs font-mono flex items-center gap-3">
          <AlertTriangle className="w-5 h-5" />
          <span>Error loading atlas: {errorMsg}</span>
        </div>
      ) : activeTab === "treatment_comparison" ? (
        /* ─── TAB 2: TREATMENT-STRATIFIED COMPARISON (PSEUDOBULK) ─── */
        <div className="flex flex-col gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col gap-6 shadow-xl">
            {/* Header with Search & Level Switcher */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-teal-400" />
                  <h2 className="text-base font-bold text-white">
                    Patient-Aware Treatment Comparison: <span className="text-teal-400 font-mono">{activeGene || "Select a Gene"}</span>
                  </h2>
                </div>
                <p className="text-xs text-slate-400 font-mono mt-1">
                  Lineage-specific pseudobulk expression across 18 Treatment-Naïve vs. 25 Neoadjuvant-Treated patients (100% RT/CRT).
                </p>
              </div>

              <div className="flex items-center gap-3">
                {/* Search Bar for Gene */}
                <div className="relative w-64">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={query}
                    onChange={e => { setQuery(e.target.value); setShowSuggest(true); }}
                    onKeyDown={e => {
                      if (e.key === "Enter" && suggestions.length > 0) { handleGene(suggestions[0]); setQuery(""); }
                      if (e.key === "Escape") { setShowSuggest(false); setQuery(""); }
                    }}
                    placeholder="Search gene (e.g. NFE2L2, EPCAM)…"
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-teal-500"
                  />
                  {showSuggest && suggestions.length > 0 && (
                    <div className="absolute z-50 left-0 right-0 mt-1 bg-slate-950 border border-slate-800 rounded-lg shadow-2xl max-h-48 overflow-y-auto">
                      {suggestions.map((g) => (
                        <button key={g} onClick={() => { handleGene(g); setQuery(""); setShowSuggest(false); }}
                          className="w-full text-left px-3 py-2 text-xs font-mono text-slate-300 hover:bg-slate-800 hover:text-white">
                          {g}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Level Switcher */}
                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 font-mono text-xxs">
                  <button
                    onClick={() => setComparisonLevel("broad")}
                    className={`px-2.5 py-1.5 rounded font-semibold transition cursor-pointer ${
                      comparisonLevel === "broad" ? "bg-teal-500 text-white shadow" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Broad Lineages (n=6)
                  </button>
                  <button
                    onClick={() => setComparisonLevel("level2")}
                    className={`px-2.5 py-1.5 rounded font-semibold transition cursor-pointer ${
                      comparisonLevel === "level2" ? "bg-teal-500 text-white shadow" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Subtypes (Level 2)
                  </button>
                </div>

                <ExportButton
                  disabled={!activeGene || pseudobulkResults.length === 0}
                  onExportCSV={handleDownloadPseudobulkCSV}
                  onExportPNG={({ theme = "light" } = {}) => {
                    const canvas = generateHighResComparisonCanvas(theme, 2400);
                    exportCanvasToPNG({ canvas, filename: `GSE202051_${activeGene}_Pseudobulk_Comparison.png`, theme });
                  }}
                  onExportSVG={({ theme = "light" } = {}) => {
                    const canvas = generateHighResComparisonCanvas(theme, 1200);
                    exportCanvasToSVG({ canvas, filename: `GSE202051_${activeGene}_Pseudobulk_Comparison.svg`, theme });
                  }}
                />
              </div>
            </div>

            {/* Visual Comparative Cards & Bar Display */}
            {activeGene && pseudobulkResults.length > 0 ? (
              <div className="flex flex-col gap-6">
                {/* Cohort Summary Badges */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
                  <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-1">
                    <span className="text-xxs text-slate-500 uppercase tracking-wider">Treatment-Naïve Cohort</span>
                    <span className="text-lg font-bold text-teal-400">18 Patients</span>
                    <span className="text-xxs text-slate-500">9,689 in-tissue nuclei</span>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-1">
                    <span className="text-xxs text-slate-500 uppercase tracking-wider">Neoadjuvant-Treated Cohort</span>
                    <span className="text-lg font-bold text-orange-400">25 Patients</span>
                    <span className="text-xxs text-slate-500">10,311 nuclei (100% RT/CRT)</span>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-1">
                    <span className="text-xxs text-slate-500 uppercase tracking-wider">Max Lineage Effect Size</span>
                    <span className="text-lg font-bold text-rose-400">
                      {pseudobulkResults[0]?.log2FC.toFixed(2)} log2FC
                    </span>
                    <span className="text-xxs text-slate-500">{pseudobulkResults[0]?.cellType}</span>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-1">
                    <span className="text-xxs text-slate-500 uppercase tracking-wider">Significant Lineages (FDR &lt; 0.05)</span>
                    <span className="text-lg font-bold text-indigo-400">
                      {pseudobulkResults.filter(r => r.isSignificant).length} / {pseudobulkResults.length}
                    </span>
                    <span className="text-xxs text-slate-500">Patient-level Welch test</span>
                  </div>
                </div>

                {/* Lineage Comparison Bars */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
                  <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                    <span className="flex items-center gap-3">
                      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-teal-500"></span> Treatment-Naïve (n=18)</span>
                      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-orange-500"></span> Neoadjuvant-Treated [RT/CRT] (n=25)</span>
                    </span>
                    <span className="text-xxs text-slate-500">Error bars represent ± Standard Error (SE) across patient means</span>
                  </div>

                  <div className="flex flex-col gap-3">
                    {pseudobulkResults.map((r) => {
                      const maxBar = Math.max(...pseudobulkResults.map(x => Math.max(x.naiveMean + x.naiveSE, x.treatedMean + x.treatedSE)), 1.0);
                      const naivePctWidth = Math.min(100, (r.naiveMean / maxBar) * 100);
                      const treatPctWidth = Math.min(100, (r.treatedMean / maxBar) * 100);

                      return (
                        <div key={r.cellType} className="bg-slate-900/60 border border-slate-850 rounded-xl p-4 flex flex-col gap-2.5">
                          <div className="flex items-center justify-between text-xs font-mono">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: BROAD_COLORS[r.cellType] || LEVEL2_COLORS[r.cellType] || "#64748b" }} />
                              <span className="font-bold text-slate-200 text-sm">{r.cellType}</span>
                              <span className="text-xxs px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                                {r.naivePatientCount} Naïve pts · {r.treatedPatientCount} Treated pts
                              </span>
                            </div>

                            <div className="flex items-center gap-3">
                              <span className={`text-xs font-bold font-mono ${r.deltaPseudobulk > 0 ? "text-emerald-400" : (r.deltaPseudobulk < 0 ? "text-rose-400" : "text-slate-400")}`}>
                                Δ {r.deltaPseudobulk > 0 ? `+${r.deltaPseudobulk.toFixed(3)}` : r.deltaPseudobulk.toFixed(3)} ({r.log2FC > 0 ? `+${r.log2FC.toFixed(2)}` : r.log2FC.toFixed(2)} log2FC)
                              </span>
                              <span className={`text-xxs px-2 py-0.5 rounded font-mono ${r.isSignificant ? "bg-rose-500/20 border border-rose-500/40 text-rose-300 font-bold" : "bg-slate-800 text-slate-500"}`}>
                                {r.isSignificant ? `q = ${r.qValue.toExponential(1)}*` : `p = ${r.pValueWelch.toFixed(2)}`}
                              </span>
                            </div>
                          </div>

                          {/* Dual Bars */}
                          <div className="flex flex-col gap-1.5 font-mono text-xxs">
                            {/* Naive Bar */}
                            <div className="flex items-center gap-2">
                              <span className="w-16 text-slate-400 shrink-0">Naïve</span>
                              <div className="flex-1 bg-slate-950 rounded-full h-3.5 overflow-hidden flex items-center p-0.5">
                                <div className="bg-teal-500 h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(2, naivePctWidth)}%` }} />
                              </div>
                              <span className="w-24 text-right text-teal-400 font-bold">{r.naiveMean.toFixed(3)} ± {r.naiveSE.toFixed(3)}</span>
                              <span className="w-16 text-right text-slate-500">({r.naivePctExpressing.toFixed(1)}%)</span>
                            </div>

                            {/* Treated Bar */}
                            <div className="flex items-center gap-2">
                              <span className="w-16 text-slate-400 shrink-0">Treated</span>
                              <div className="flex-1 bg-slate-950 rounded-full h-3.5 overflow-hidden flex items-center p-0.5">
                                <div className="bg-orange-500 h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(2, treatPctWidth)}%` }} />
                              </div>
                              <span className="w-24 text-right text-orange-400 font-bold">{r.treatedMean.toFixed(3)} ± {r.treatedSE.toFixed(3)}</span>
                              <span className="w-16 text-right text-slate-500">({r.treatedPctExpressing.toFixed(1)}%)</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-xl p-6 text-center text-xs text-slate-500 gap-2">
                <HelpCircle className="w-8 h-8 text-slate-700 animate-pulse" />
                <span>Search any gene above (e.g. NFE2L2, EPCAM, COL1A1) to compute patient-level pseudobulk comparisons.</span>
              </div>
            )}
          </div>
        </div>
      ) : activeTab === "pseudobulk_table" ? (
        /* ─── TAB 3: STATISTICAL SENSITIVITY & PATIENT TABLES ─── */
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col gap-6 shadow-xl font-mono">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Table className="w-5 h-5 text-amber-400" />
                <h2 className="text-base font-bold text-white">
                  Statistical Sensitivity Table: <span className="text-amber-400">{activeGene || "Select a Gene"}</span>
                </h2>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Parametric (Welch's t-test) vs. Non-parametric (Mann-Whitney U) sensitivity testing with Benjamini-Hochberg FDR.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xxs">
                <button
                  onClick={() => setComparisonLevel("broad")}
                  className={`px-2.5 py-1.5 rounded font-semibold transition cursor-pointer ${
                    comparisonLevel === "broad" ? "bg-amber-500 text-slate-950 shadow" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Broad Lineages
                </button>
                <button
                  onClick={() => setComparisonLevel("level2")}
                  className={`px-2.5 py-1.5 rounded font-semibold transition cursor-pointer ${
                    comparisonLevel === "level2" ? "bg-amber-500 text-slate-950 shadow" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Subtypes (Level 2)
                </button>
              </div>

              <ExportButton
                disabled={!activeGene || pseudobulkResults.length === 0}
                onExportCSV={handleDownloadPseudobulkCSV}
              />
            </div>
          </div>

          {activeGene && pseudobulkResults.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 text-xxs uppercase tracking-wider border-b border-slate-800">
                    <th className="p-3">Cell Lineage</th>
                    <th className="p-3 text-center">Naïve (Pts / Nuc)</th>
                    <th className="p-3 text-center">Treated (Pts / Nuc)</th>
                    <th className="p-3 text-right">Naïve Mean ± SE</th>
                    <th className="p-3 text-right">Treated Mean ± SE</th>
                    <th className="p-3 text-right">Δ Pseudobulk</th>
                    <th className="p-3 text-right">log2FC</th>
                    <th className="p-3 text-right">Cohen's d (95% CI)</th>
                    <th className="p-3 text-right">Welch t (p)</th>
                    <th className="p-3 text-right">Mann-Whitney (p)</th>
                    <th className="p-3 text-right">FDR (q)</th>
                    <th className="p-3 text-center">Trend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {pseudobulkResults.map((r) => (
                    <tr key={r.cellType} className="hover:bg-slate-850/50 transition">
                      <td className="p-3 font-bold text-slate-200 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: BROAD_COLORS[r.cellType] || LEVEL2_COLORS[r.cellType] || "#64748b" }} />
                        {r.cellType}
                      </td>
                      <td className="p-3 text-center text-slate-400">{r.naivePatientCount}p ({r.naiveNucleusCount})</td>
                      <td className="p-3 text-center text-slate-400">{r.treatedPatientCount}p ({r.treatedNucleusCount})</td>
                      <td className="p-3 text-right text-teal-400">{r.naiveMean.toFixed(3)} ± {r.naiveSE.toFixed(3)}</td>
                      <td className="p-3 text-right text-orange-400">{r.treatedMean.toFixed(3)} ± {r.treatedSE.toFixed(3)}</td>
                      <td className={`p-3 text-right font-bold ${r.deltaPseudobulk > 0 ? "text-emerald-400" : (r.deltaPseudobulk < 0 ? "text-rose-400" : "text-slate-400")}`}>
                        {r.deltaPseudobulk > 0 ? `+${r.deltaPseudobulk.toFixed(3)}` : r.deltaPseudobulk.toFixed(3)}
                      </td>
                      <td className="p-3 text-right text-slate-300 font-bold">{r.log2FC > 0 ? `+${r.log2FC.toFixed(2)}` : r.log2FC.toFixed(2)}</td>
                      <td className="p-3 text-right text-slate-400 text-xxs">
                        {r.cohensD.toFixed(2)} [{r.ci95Lower.toFixed(2)}, {r.ci95Upper.toFixed(2)}]
                      </td>
                      <td className="p-3 text-right text-slate-300">{r.pValueWelch.toExponential(2)}</td>
                      <td className="p-3 text-right text-slate-400">{r.pValueMannWhitney.toExponential(2)}</td>
                      <td className={`p-3 text-right font-bold ${r.isSignificant ? "text-rose-400" : "text-slate-500"}`}>
                        {r.qValue.toExponential(2)}{r.isSignificant ? "*" : ""}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`text-xxs px-2 py-0.5 rounded font-bold ${
                          r.direction === "UP" ? "bg-emerald-500/20 text-emerald-300" : 
                          r.direction === "DOWN" ? "bg-rose-500/20 text-rose-300" : "bg-slate-800 text-slate-500"
                        }`}>
                          {r.direction}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-xs text-slate-500">
              Please select a target gene to generate the sensitivity matrix.
            </div>
          )}
        </div>
      ) : (
        /* ─── TAB 1: UMAP ATLAS EXPLORER (EXISTING POOLED ATLAS) ─── */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Visualizer Area */}
          <div className="lg:col-span-8 flex flex-col gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-4 shadow-xl">
              {/* UMAP Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-mono">Color by:</span>
                  <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 font-mono text-xxs">
                    <button
                      onClick={() => setColorMode("broad")}
                      className={`px-2.5 py-1.5 rounded transition cursor-pointer ${
                        colorMode === "broad" ? "bg-rose-500 text-white font-bold" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Broad Type
                    </button>
                    <button
                      onClick={() => setColorMode("level2")}
                      className={`px-2.5 py-1.5 rounded transition cursor-pointer ${
                        colorMode === "level2" ? "bg-rose-500 text-white font-bold" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Subtypes (L2)
                    </button>
                    <button
                      onClick={() => setColorMode("treatment")}
                      className={`px-2.5 py-1.5 rounded transition cursor-pointer ${
                        colorMode === "treatment" ? "bg-rose-500 text-white font-bold" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Treatment
                    </button>
                    {activeGene && (
                      <button
                        onClick={() => setColorMode("expression")}
                        className={`px-2.5 py-1.5 rounded transition cursor-pointer ${
                          colorMode === "expression" ? "bg-rose-500 text-white font-bold" : "text-slate-400 hover:text-white"
                        }`}
                      >
                        {activeGene} Expr
                      </button>
                    )}
                  </div>
                </div>

                {/* Patient Filter Dropdown */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-mono">Patient:</span>
                  <select
                    value={selectedPid}
                    onChange={e => setSelectedPid(e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-slate-300 text-xs font-mono rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-rose-500 cursor-pointer"
                  >
                    <option value="ALL">All Cohort Patients (n=43)</option>
                    <optgroup label="── Treatment-Naïve (n=18) ──">
                      {Object.keys(patients).filter(p => p.startsWith("U")).map(p => (
                        <option key={p} value={p}>{p} ({patients[p].treatment_group})</option>
                      ))}
                    </optgroup>
                    <optgroup label="── Neoadjuvant-Treated / RT-CRT (n=25) ──">
                      {Object.keys(patients).filter(p => p.startsWith("T")).map(p => (
                        <option key={p} value={p}>{p} ({patients[p].treatment_status})</option>
                      ))}
                    </optgroup>
                  </select>
                </div>
              </div>

              {/* UMAP Canvas */}
              <div ref={containerRef} className="relative w-full h-[520px] bg-slate-950 rounded-xl overflow-hidden cursor-crosshair border border-slate-850">
                <canvas
                  ref={canvasRef}
                  onMouseMove={onMouseMove}
                  onWheel={onWheel}
                  onMouseDown={e => { dragging.current = true; dragStart.current = { x: e.clientX, y: e.clientY }; }}
                  onMouseUp={() => { dragging.current = false; }}
                  onMouseLeave={() => { dragging.current = false; setHovered(null); }}
                  className="w-full h-full"
                />

                {/* Tooltip */}
                {hovered && (
                  <div
                    style={{ left: tipPos.x + 12, top: tipPos.y + 12 }}
                    className="absolute z-50 pointer-events-none bg-slate-900/95 border border-slate-700 text-slate-100 rounded-lg p-2.5 shadow-2xl text-xs font-mono backdrop-blur flex flex-col gap-1"
                  >
                    <div className="flex items-center gap-1.5 font-bold text-teal-400">
                      <span>{hovered.cell.broad_celltype}</span>
                      <span className="text-slate-500">·</span>
                      <span className="text-white">{hovered.cell.level2}</span>
                    </div>
                    <div className="text-slate-400 text-xxs">
                      Patient: <span className="text-slate-200">{hovered.cell.pid}</span> ({hovered.cell.treatment_group} · {hovered.cell.treatment})
                    </div>
                    {hovered.cell.response && (
                      <div className="text-slate-400 text-xxs">
                        Response: <span className="text-amber-300">{hovered.cell.response}</span>
                      </div>
                    )}
                    {activeGene && exprVec && (
                      <div className="text-rose-400 text-xxs font-bold pt-1 border-t border-slate-800">
                        {activeGene}: {(exprVec[hovered.origIdx] ?? 0).toFixed(3)} log1p
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Legend & Stats Footer */}
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-slate-400 pt-2">
                <span>Displaying: <strong className="text-slate-200">{activeCells.length.toLocaleString()}</strong> nuclei in view</span>
                <span className="text-xxs text-slate-500">Pan: Click + Drag · Zoom: Mouse Wheel</span>
              </div>
            </div>
          </div>

          {/* Right Sidebar: Search & Gene Summary */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            {/* Search Box */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-3 shadow-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white uppercase font-mono tracking-wider">Gene Search</span>
                {activeGene && (
                  <span className="text-xxs px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-mono font-bold">
                    {activeGene}
                  </span>
                )}
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={query}
                  onChange={e => { setQuery(e.target.value); setShowSuggest(true); }}
                  onKeyDown={e => {
                    if (e.key === "Enter" && suggestions.length > 0) { handleGene(suggestions[0]); setQuery(""); }
                    if (e.key === "Escape") { setShowSuggest(false); setQuery(""); }
                  }}
                  placeholder="Search any gene (e.g. KRAS, NFE2L2, EPCAM)…"
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-rose-500"
                />
                {showSuggest && suggestions.length > 0 && (
                  <div className="absolute z-50 left-0 right-0 mt-1 bg-slate-950 border border-slate-800 rounded-lg shadow-2xl max-h-48 overflow-y-auto">
                    {suggestions.map((g) => (
                      <button key={g} onClick={() => { handleGene(g); setQuery(""); setShowSuggest(false); }}
                        className="w-full text-left px-3 py-2 text-xs font-mono text-slate-300 hover:bg-slate-800 hover:text-white">
                        {g}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Exploratory Cell-Type Summary */}
              {activeGene && dotData.length > 0 && (
                <div className="flex flex-col gap-2 mt-2">
                  <span className="text-xxs font-bold text-slate-400 uppercase tracking-wider">Top Expressing Subtypes (Exploratory)</span>
                  <div className="flex flex-col gap-1 max-h-60 overflow-y-auto pr-1">
                    {dotData.slice(0, 6).map(r => (
                      <div key={r.cellType} className="flex items-center justify-between py-1 border-b border-slate-850 text-xs font-mono">
                        <span className="truncate text-slate-300">{r.cellType}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-teal-400 font-bold">{r.meanAll.toFixed(2)}</span>
                          <span className="text-xxs text-slate-500">({r.pct.toFixed(0)}%)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. Methods & Citation Footer */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-3 text-xs font-mono text-slate-400 shadow-xl">
        <h4 className="font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-2">
          <Info className="w-4 h-4 text-blue-400" />
          Single-Nucleus Reference Atlas Information & Methods (GSE202051)
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-[11px] leading-relaxed">
          <div>
            <strong className="text-slate-300 block mb-1">Study Provenance</strong>
            <p>Hwang et al., <em>Nature Genetics</em> (2022). High-resolution single-nucleus dissection of untreated vs. neoadjuvant-treated PDAC resections.</p>
          </div>
          <div className="border-l border-slate-800 pl-4">
            <strong className="text-slate-300 block mb-1">Patient Pseudobulk Standard</strong>
            <p>Biological replicates are defined at the patient level ($n=43$), with cell-type-specific aggregation to prevent false statistical inflation caused by single-cell clustering.</p>
          </div>
          <div className="border-l border-slate-800 pl-4">
            <strong className="text-slate-300 block mb-1">Radiation-Exposed Architecture</strong>
            <p>All 25 neoadjuvant-treated patients in GSE202051 received documented radiation therapy (14 CRT, 5 CRT+Losartan, 2 CRT+Nivolumab, 2 CRTx, 1 GART, 1 RT).</p>
          </div>
        </div>
      </div>
    </div>
  );
}
