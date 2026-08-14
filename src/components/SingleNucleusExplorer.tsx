"use client";

import React, {
  useEffect, useState, useMemo, useRef, useCallback
} from "react";
import {
  Search, Info, AlertTriangle, ChevronDown,
  TrendingUp, Cpu, X, HelpCircle, Layers, Users, Download, Bot
} from "lucide-react";

import ExportButton from "./ExportButton";
import { exportCanvasToPNG, exportCanvasToSVG, exportToCSV } from "@/utils/exportUtils";
import { useAIContext } from "@/components/ai/AIProvider";

// ─── Types ──────────────────────────────────────────────────────────────────
interface CellMetadata {
  id: string; x: number; y: number;
  pid: string; broad_celltype: string;
  level1: string; level2: string; level3: string;
  treatment: string; treatment_group: string; response: string;
}
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
  const [selectedPid, setSelectedPid] = useState("ALL");
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
      currentFigure: "Single-Nucleus UMAP Atlas",
      singleNucleusStats: {
        selectedCellType: selectedBroadInspect !== "ALL" ? selectedBroadInspect : "All Cell Types",
        totalNuclei: "224,988",
        markerGenes: activeGene ? [activeGene, "NFE2L2", "PHGDH", "S100P"] : ["NFE2L2", "PHGDH", "S100P"]
      }
    });
  }, [activeGene, selectedBroadInspect, registerModuleContext]);

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

  // Active subset cells filtered by patient selection
  const { activeCells, activeOrigIdx } = useMemo(() => {
    if (selectedPid === "ALL") {
      return { activeCells: cells, activeOrigIdx: cells.map((_, i) => i) };
    }
    const filtered = cells.map((c, i) => ({ c, i })).filter(x => x.c.pid === selectedPid);
    return { activeCells: filtered.map(x => x.c), activeOrigIdx: filtered.map(x => x.i) };
  }, [cells, selectedPid]);

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
    // Hierarchical cell-type display check
    if (selectedBroadInspect !== "ALL" && cell.broad_celltype !== selectedBroadInspect) {
      return "rgba(51, 65, 85, 0.08)"; // Grey out cells of other broad categories
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

  // ── Cell-type expression summary data — PRIMARY SCIENTIFIC METRIC CORRECTION ────────────────
  const dotData = useMemo(() => {
    if (!activeGene || !exprVec || activeCells.length === 0) return [];
    
    // Group expressions by Level 2 subtype
    const groups: Record<string, number[]> = {};
    activeCells.forEach((c, i) => {
      const v = exprVec[activeOrigIdx[i]] ?? 0;
      if (!groups[c.level2]) groups[c.level2] = [];
      groups[c.level2].push(v);
    });

    return Object.entries(groups).map(([ct, vals]) => {
      const exp = vals.filter(v => v > 0);
      const meanAll = vals.reduce((a, b) => a + b, 0) / vals.length; // PRIMARY METRIC: Mean across all nuclei
      const meanPos = exp.length ? exp.reduce((a, b) => a + b, 0) / exp.length : 0; // SECONDARY METRIC: Mean among expressing
      
      return {
        cellType: ct,
        total:    vals.length,
        pct:      (exp.length / vals.length) * 100,
        meanAll:  meanAll,
        meanPos:  meanPos,
        tooSmall: vals.length < 10,
      };
    }).filter(r => r.pct > 0).sort((a, b) => b.meanAll - a.meanAll); // Primary sorting: Mean across ALL nuclei
  }, [activeCells, activeOrigIdx, exprVec, activeGene]);

  // CSV Download handler for Cell-Type Expression Summary
  const handleDownloadCSV = useCallback(() => {
    if (!activeGene || dotData.length === 0) return;

    const now = new Date();
    const dateStr = now.toLocaleString();

    // Determine treatment text for metadata
    const treatmentText = selectedPid !== "ALL" && patients[selectedPid]
      ? patients[selectedPid].treatment_status
      : "ALL";

    // Build Metadata Header lines
    const metaLines = [
      `Dataset: GSE202051`,
      `Gene: ${activeGene}`,
      `Patient Filter: ${selectedPid}`,
      `Cell Type Filter: ${selectedBroadInspect}`,
      `Treatment Filter: ${treatmentText}`,
      `Export Date: ${dateStr}`,
      ``,
    ];

    const headerRow = ["Subtype (Level 2)", "N", "Expr %", "Mean (All)", "Mean (Pos)"];
    
    const dataRows = dotData.map((row) => [
      `"${row.cellType.replace(/"/g, '""')}"`,
      row.total,
      row.pct.toFixed(2),
      row.meanAll.toFixed(4),
      row.meanPos.toFixed(4),
    ]);

    const csvContent = [
      ...metaLines,
      headerRow.join(","),
      ...dataRows.map((r) => r.join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `GSE202051_${activeGene}_CellTypeSummary.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [activeGene, dotData, selectedPid, selectedBroadInspect, patients]);

  // Filtered Cell Metadata export callback
  const handleExportCellMetadata = useCallback(() => {
    if (!activeCells || activeCells.length === 0) return;
    const headers = [
      "Cell Barcode",
      "Patient ID",
      "Broad Cell Type",
      "Subtype (Level 2)",
      "Treatment Status",
      "UMAP1",
      "UMAP2",
      activeGene ? `${activeGene} Expression (log1p Float16)` : "Gene Expression",
    ];

    const rows = activeCells.map((c, i) => {
      const origIdx = activeOrigIdx[i];
      const exprVal = exprVec && origIdx !== undefined ? f16ToF32(exprVec[origIdx]) : 0;
      return [
        c.id,
        c.pid,
        c.broad_celltype,
        c.level2,
        c.treatment,
        c.x.toFixed(4),
        c.y.toFixed(4),
        exprVal.toFixed(4),
      ];
    });

    exportToCSV({
      filename: `GSE202051_FilteredCells_${activeGene || "All"}.csv`,
      metadata: {
        dataset: "GSE202051 Single-Nucleus Atlas",
        module: "Single-Nucleus Cell Metadata Explorer",
        selectedGene: activeGene || "None",
        filters: `Patient: ${selectedPid}, Lineage: ${selectedBroadInspect}, Total Cells: ${activeCells.length}`,
      },
      headers,
      rows,
    });
  }, [activeCells, activeOrigIdx, exprVec, activeGene, selectedPid, selectedBroadInspect]);

  // Filtered Expression Matrix export callback
  const handleExportExpressionMatrix = useCallback(() => {
    if (!activeCells || activeCells.length === 0 || !activeGene || !exprVec) return;
    const headers = ["Cell Barcode", "Patient ID", "Cell Type", activeGene];
    const rows = activeCells.map((c, i) => {
      const origIdx = activeOrigIdx[i];
      const exprVal = origIdx !== undefined ? f16ToF32(exprVec[origIdx]) : 0;
      return [c.id, c.pid, c.level2, exprVal.toFixed(4)];
    });

    exportToCSV({
      filename: `GSE202051_ExpressionMatrix_${activeGene}.csv`,
      metadata: {
        dataset: "GSE202051 Single-Nucleus Atlas",
        module: "Filtered Single-Nucleus Expression Matrix",
        selectedGene: activeGene,
        filters: `Patient: ${selectedPid}, Lineage: ${selectedBroadInspect}, Total Cells: ${activeCells.length}`,
      },
      headers,
      rows,
    });
  }, [activeCells, activeOrigIdx, exprVec, activeGene, selectedPid, selectedBroadInspect]);

  const legendEntries = useMemo((): [string, string][] => {
    if (colorMode === "broad")     return Object.entries(BROAD_COLORS);
    if (colorMode === "level2")    return Object.entries(LEVEL2_COLORS).slice(0, 18);
    if (colorMode === "treatment") return Object.entries(TREATMENT_COLORS);
    return [];
  }, [colorMode]);

  const selPatientInfo = selectedPid !== "ALL" ? patients[selectedPid] : null;

  let aiCtx: any = null;
  try {
    aiCtx = useAIContext();
  } catch (e) {}

  const handleAskCopilotSN = () => {
    if (aiCtx) {
      const q = activeGene
        ? `Which cell populations express ${activeGene} in the single-nucleus PDAC dataset?`
        : "What cell populations are represented in the single-nucleus PDAC dataset?";
      aiCtx.sendMessage(q, "cell_type_lineage_expression");
      aiCtx.setChatOpen(true);
    }
  };

  return (
    <div className="flex flex-col gap-6 flex-1 w-full text-slate-300">
      
      {/* Disclaimer panel */}
      <div className="bg-amber-950/30 border border-amber-900/60 rounded-xl p-4 flex gap-3 text-xs leading-relaxed text-amber-200">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-amber-100 block mb-0.5">Cross-Study Disclaimer & Scientific Limitations</strong>
          GSE202051 (single-nucleus) and GSE225767 (bulk transcriptomics) represent completely independent cohorts of different patient populations. The single-nucleus data are provided here strictly as a complementary reference atlas to identify cell-type-specific localization of targets. It must not be interpreted as direct validation or co-expression verification of bulk RNA-seq treatment comparisons.
        </div>
      </div>

      {/* Header controls & statistics */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h2 className="text-slate-100 font-bold text-lg flex items-center gap-2">
            <Cpu className="w-5 h-5 text-teal-400" />
            PDAC Single-Nucleus Explorer — GSE202051
          </h2>
          <p className="text-xs text-slate-300 mt-1.5 font-medium">
            Human PDAC single-nucleus transcriptomic atlas · 43 patients · 22,164 genes searchable
          </p>
          <p className="text-[10px] text-slate-500 mt-1">
            GSE202051 · Hwang et al., Nature Genetics (2022)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleAskCopilotSN}
            className="bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 px-3 py-1.5 rounded-lg border border-cyan-700/60 transition font-medium text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
            title="Ask PDACopilot about single-nucleus cell populations"
          >
            <Bot className="w-3.5 h-3.5 text-cyan-400" />
            <span>Ask PDACopilot</span>
          </button>
          <div className="flex flex-wrap gap-2 text-[10px] uppercase font-mono tracking-wider">
            <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
              <span className="text-slate-500">Source Atlas</span>{" "}
              <span className="text-slate-200 font-bold">224,988 nuclei</span>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
              <span className="text-slate-500">Viz Subset</span>{" "}
              <span className="text-teal-400 font-bold">20,000 nuclei</span>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
              <span className="text-slate-500">Patients</span>{" "}
              <span className="text-slate-200 font-bold">43 cases</span>
            </div>
          </div>
        </div>
      </div>


      {/* Main Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 bg-slate-900 border border-slate-800 rounded-2xl">
          <div className="w-10 h-10 border-2 border-t-teal-500 border-slate-700 rounded-full animate-spin" />
          <span className="text-xs text-teal-400 font-mono">LOADING REFERENCE ATLAS...</span>
        </div>
      ) : errorMsg ? (
        <div className="flex items-center justify-center py-20 gap-2 text-red-400 bg-slate-900 border border-slate-800 rounded-2xl">
          <AlertTriangle className="w-6 h-6" /><p className="text-xs">{errorMsg}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-stretch">
          
          {/* UMAP Plot Panel */}
          <div className="xl:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-4">
            
            {/* View selectors */}
            <div className="flex flex-wrap gap-2 items-center">
              <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg p-1">
                {(["broad","level2","treatment","expression"] as ColorMode[]).map(m => (
                  <button key={m}
                    onClick={() => {
                      if (m === "expression" && !activeGene) { alert("Search a gene in the sidebar to activate expression coloring."); return; }
                      setColorMode(m);
                    }}
                    className={`px-3 py-1.5 text-[10px] font-semibold rounded transition-all ${colorMode === m ? "bg-teal-500 text-slate-950" : "text-slate-400 hover:text-slate-200"}`}>
                    {m === "broad" ? "Broad Type" : m === "level2" ? "Detailed Subtype" : m === "expression" ? "Expression" : "Treatment Group"}
                  </button>
                ))}
              </div>

              {/* Patient select */}
              <div className="relative">
                <select value={selectedPid} onChange={e => setSelectedPid(e.target.value)}
                  className="appearance-none bg-slate-950 border border-slate-800 text-[10px] text-slate-300 rounded-lg px-3 py-2 pr-8 focus:outline-none focus:border-teal-500">
                  <option value="ALL">All 43 Patients</option>
                  {Object.keys(patients).sort().map(pid => (
                    <option key={pid} value={pid}>
                      {pid} ({patients[pid].treatment_group === "Treatment-naïve" ? "Naïve" : "NAT"} · {patients[pid].n_nuclei} cells)
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
              </div>

              {/* Hierarchical Broad-type inspector */}
              <div className="relative">
                <select value={selectedBroadInspect} onChange={e => setSelectedBroadInspect(e.target.value)}
                  className="appearance-none bg-slate-950 border border-slate-800 text-[10px] text-slate-300 rounded-lg px-3 py-2 pr-8 focus:outline-none focus:border-teal-500"
                  title="Isolate specific lineages to view sub-annotations without visual clutter">
                  <option value="ALL">All Cell Types</option>
                  {Object.keys(BROAD_COLORS).map(b => (
                    <option key={b} value={b}>Isolate {b}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
              </div>

              <ExportButton
                label="Export UMAP"
                onExportPNG={() => {
                  if (!canvasRef.current) return;
                  exportCanvasToPNG({
                    canvas: canvasRef.current,
                    filename: `UMAP_GSE202051_${activeGene || colorMode}.png`,
                    title: `GSE202051 UMAP (${colorMode.toUpperCase()})`,
                    subtitle: `Gene: ${activeGene || "None"} | Patient: ${selectedPid} | Lineage: ${selectedBroadInspect}`,
                  });
                }}
                onExportSVG={() => {
                  if (!canvasRef.current) return;
                  exportCanvasToSVG({
                    canvas: canvasRef.current,
                    filename: `UMAP_GSE202051_${activeGene || colorMode}.svg`,
                    title: `GSE202051 UMAP (${colorMode.toUpperCase()})`,
                    subtitle: `Gene: ${activeGene || "None"} | Patient: ${selectedPid} | Lineage: ${selectedBroadInspect}`,
                  });
                }}
              />

              {selPatientInfo && (
                <div className="text-[10px] bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-400 flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-slate-500" />
                  <span className="font-bold text-slate-200">{selectedPid}</span>
                  {" · "}{selPatientInfo.n_nuclei} nuclei · 
                  <span className={selPatientInfo.treatment_group === "Treatment-naïve" ? "text-teal-400" : "text-orange-400"}>
                    {selPatientInfo.treatment_status}
                  </span>
                </div>
              )}

              <button onClick={() => { setZoom(1); setPanX(0); setPanY(0); }}
                className="ml-auto text-[10px] px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
                Reset Pan/Zoom
              </button>
            </div>

            {/* Expression scale cap notice */}
            {colorMode === "expression" && activeGene && (
              <div className="flex items-center gap-3 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2">
                <span className="text-[10px] font-bold text-slate-200 font-mono">{activeGene}</span>
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-[9px] text-slate-500">0.0</span>
                  <div className="flex-1 h-2 rounded bg-gradient-to-r from-teal-500 via-amber-500 to-rose-500 opacity-80" />
                  <span className="text-[9px] text-slate-500">{exprCap.toFixed(2)}</span>
                </div>
                {capped && (
                  <span className="text-[9px] text-amber-400 bg-amber-950/30 border border-amber-900/40 rounded px-2 py-0.5 shrink-0">
                    Color scale capped at 99th percentile of nonzero expression for visualization (Max: {exprActualMax.toFixed(2)})
                  </span>
                )}
              </div>
            )}

            {/* General treatment warning */}
            {colorMode === "treatment" && (
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-[10px] text-slate-400 leading-relaxed">
                <span className="font-semibold text-slate-300">Treatment group terminology context:</span> Groups represent patients designated as Treatment-naïve (18 cases) versus Neoadjuvant-treated (25 cases). Regimens within the treated cohort were heterogeneous (combination regimens, radiotherapies, etc.). This UMAP is to display spatial clusters and is not designed to compare treatment specific efficacy.
              </div>
            )}

            {/* UMAP Canvas container */}
            <div ref={containerRef} className="flex-1 min-h-[440px] relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800/80">
              <canvas ref={canvasRef}
                onMouseMove={onMouseMove}
                onMouseDown={e => { dragging.current = true; dragStart.current = { x: e.clientX, y: e.clientY }; }}
                onMouseUp={() => { dragging.current = false; }}
                onMouseLeave={() => { dragging.current = false; setHovered(null); }}
                onWheel={onWheel}
                className="w-full h-full cursor-grab active:cursor-grabbing" />

              {/* Hover Tooltip */}
              {hovered && (
                <div className="absolute pointer-events-none bg-slate-950/95 border border-slate-700 rounded-xl p-3 shadow-2xl text-[10px] z-50 max-w-[240px]"
                  style={{ left: Math.min(tipPos.x + 14, dims.w - 250), top: Math.max(tipPos.y - 92, 8) }}>
                  <div className="font-bold text-teal-400 mb-1.5 pb-1 border-b border-slate-800 flex items-center gap-1.5 truncate">
                    <span>{hovered.cell.pid}</span>
                    <span className="text-slate-500">·</span>
                    <span className="truncate">{hovered.cell.level2}</span>
                  </div>
                  <div className="text-slate-400"><span className="text-slate-500">Broad Type:</span> {hovered.cell.broad_celltype}</div>
                  <div className="text-slate-400"><span className="text-slate-500">Treatment:</span> {hovered.cell.treatment}</div>
                  <div className="text-slate-400"><span className="text-slate-500">Response:</span> {hovered.cell.response}</div>
                  {colorMode === "expression" && activeGene && exprVec && (
                    <div className="mt-1.5 pt-1.5 border-t border-slate-800 font-bold text-amber-400 font-mono">
                      {activeGene} Log-Expr: {(exprVec[hovered.origIdx] ?? 0).toFixed(3)}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Legend display */}
            {legendEntries.length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-1">
                {legendEntries.map(([label, color]) => (
                  <div key={label} className="flex items-center gap-1.5 text-[9px] text-slate-400">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    <span className="truncate max-w-[120px]">{label}</span>
                  </div>
                ))}
                {colorMode === "level2" && (
                  <span className="text-[9px] text-slate-600 italic">+{Object.keys(LEVEL2_COLORS).length - 18} more subtypes</span>
                )}
              </div>
            )}
          </div>

          {/* Gene Search & Cell Type Summaries Panel */}
          <div className="flex flex-col gap-5">
            
            {/* Search Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                Single-Nucleus Gene Expression
              </label>
              
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                  {loadingGene
                    ? <div className="w-3.5 h-3.5 border border-t-teal-500 border-slate-600 rounded-full animate-spin" />
                    : <Search className="w-3.5 h-3.5" />}
                </span>
                <input type="text" value={query}
                  onChange={e => { setQuery(e.target.value); setShowSuggest(true); }}
                  onKeyDown={e => {
                    if (e.key === "Enter" && suggestions.length > 0) { handleGene(suggestions[0]); setQuery(""); }
                    if (e.key === "Escape") { setShowSuggest(false); setQuery(""); }
                  }}
                  placeholder="Search any gene (e.g. KRAS, KRT19, GATA6)…"
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-teal-500 transition-colors"
                />
                {query && (
                  <button onClick={() => { setQuery(""); setSuggestions([]); setShowSuggest(false); }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Autocomplete dropdown */}
                {showSuggest && suggestions.length > 0 && (
                  <div className="absolute z-50 left-0 right-0 mt-1.5 bg-slate-950 border border-slate-800 rounded-lg shadow-2xl max-h-52 overflow-y-auto">
                    {suggestions.map((g, idx) => (
                      <button key={g} onClick={() => { handleGene(g); setQuery(""); setShowSuggest(false); }}
                        className="w-full text-left px-4 py-2.5 text-xs font-mono text-slate-300 hover:bg-slate-800 hover:text-white transition-colors border-b border-slate-900 last:border-0">
                        <span className="text-teal-400 font-bold">{g.slice(0, query.length)}</span>
                        {g.slice(query.length)}
                        {idx === 0 && <span className="ml-2 text-[8px] text-slate-600 uppercase font-mono">↵ Enter</span>}
                      </button>
                    ))}
                  </div>
                )}

                {/* Error mismatch notice */}
                {query && suggestions.length === 0 && query.trim().length > 0 && (
                  <div className="mt-2 text-[10px] text-amber-500/90 px-1 flex gap-1 items-center">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>Gene not available in the processed GSE202051 atlas.</span>
                  </div>
                )}
              </div>

              {/* Active display label */}
              {activeGene && (
                <div className="mt-3 p-3 bg-slate-950 border border-slate-850 rounded-xl flex justify-between items-center text-xs">
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase font-bold block">Selected Gene</span>
                    <span className="font-mono font-bold text-slate-100 text-sm">{activeGene}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] text-slate-500 uppercase font-bold block">Session Cache</span>
                    <span className="font-mono text-slate-400">{exprCache.size}/{MAX_CACHE}</span>
                  </div>
                </div>
              )}

              {/* Methods info box */}
              <div className="mt-3 bg-slate-950/40 border border-slate-850 rounded-lg px-3 py-2 text-[9px] text-slate-500 leading-relaxed">
                <strong className="text-slate-400">Processed expression (log-normalized, log1p scale)</strong>
                <p className="mt-0.5">
                  Expression files use a Float16 near-lossless representation to optimize page loads. Raw source values are stored at high precision.
                </p>
              </div>
            </div>

            {/* Summaries Panel - Primary and Secondary Metrics corrected */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex-1 flex flex-col">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="text-slate-100 text-xs font-semibold flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                  Cell-Type Expression Summary
                  {selectedPid !== "ALL" && (
                    <span className="text-[9px] bg-slate-950 px-2 py-0.5 border border-slate-800 rounded text-teal-400 font-mono">{selectedPid}</span>
                  )}
                </h3>

                <ExportButton
                  disabled={!activeGene || dotData.length === 0}
                  disabledTooltip="Select a gene before exporting."
                  onExportCSV={handleDownloadCSV}
                  onExportCellMetadata={handleExportCellMetadata}
                  onExportExpressionMatrix={handleExportExpressionMatrix}
                />
              </div>

              {activeGene ? (
                <div className="flex flex-col gap-0 flex-1 overflow-y-auto max-h-[460px] pr-1">
                  
                  {/* Corrected column headers */}
                  <div className="grid grid-cols-12 text-[8px] font-bold text-slate-500 uppercase border-b border-slate-800 pb-1.5 mb-2 tracking-wider">
                    <div className="col-span-4">Subtype (L2)</div>
                    <div className="col-span-2 text-center">N</div>
                    <div className="col-span-2 text-center">Expr%</div>
                    <div className="col-span-2 text-center" title="Mean expression across all nuclei including zeros (Primary metric)">Mean</div>
                    <div className="col-span-2 text-center text-slate-600" title="Mean expression among expressing nuclei only (Secondary metric)">Mean(Pos)</div>
                  </div>

                  {/* Rows */}
                  {dotData.map(row => (
                    <div key={row.cellType}
                      className={`grid grid-cols-12 items-center py-1.5 text-[10px] border-b border-slate-900/60 last:border-0 ${row.tooSmall ? "opacity-50" : ""}`}>
                      <div className="col-span-4 flex items-center gap-1.5 truncate">
                        {row.tooSmall && (
                          <span title="Extremely rare population in active view">
                            <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />
                          </span>
                        )}
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: LEVEL2_COLORS[row.cellType] || "#64748b" }} />
                        <span className="truncate text-slate-300" title={row.cellType}>{row.cellType}</span>
                      </div>
                      <div className="col-span-2 text-center text-slate-500 font-mono text-[9px]">{row.total}</div>
                      <div className="col-span-2 flex justify-center items-center">
                        <span className="rounded-full border border-slate-800/80 inline-block"
                          style={{
                            width:  `${Math.max(5, 3 + 10 * row.pct / 100)}px`,
                            height: `${Math.max(5, 3 + 10 * row.pct / 100)}px`,
                            backgroundColor: exprColor(row.meanAll, exprCap), // Colored by mean of ALL nuclei
                          }} title={`${row.pct.toFixed(1)}% expressing cells`} />
                      </div>
                      <div className="col-span-2 text-center font-mono font-bold text-slate-200 text-[10px]" title="Mean across all nuclei">
                        {row.meanAll.toFixed(2)}
                      </div>
                      <div className="col-span-2 text-center font-mono text-slate-500 text-[9px]" title="Mean among expressing only">
                        {row.meanPos.toFixed(2)}
                      </div>
                    </div>
                  ))}

                  {/* Warning notices */}
                  {dotData.some(r => r.tooSmall) && (
                    <p className="text-[9px] text-amber-500/70 mt-2.5 italic px-1 leading-relaxed">
                      ⚠ Interpret very small cell populations (N &lt; 10) cautiously.
                    </p>
                  )}

                  <div className="mt-4 pt-2 border-t border-slate-800 text-[8px] text-slate-500 flex justify-between items-center leading-relaxed">
                    <span>Dot size = % expressing · Color = mean (all nuclei)</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <span>Low</span>
                      <div className="w-12 h-1.5 rounded bg-gradient-to-r from-teal-500 via-amber-500 to-rose-500" />
                      <span>High</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-xl p-6 text-center text-xs text-slate-500 min-h-[180px] gap-2">
                  <HelpCircle className="w-8 h-8 text-slate-700 animate-pulse" />
                  <span>Search any gene in the sidebar input to compute expression breakdowns and populate coordinates</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dataset & Methods detailed box */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-4">
        <h4 className="text-slate-100 text-xs font-semibold flex items-center gap-2 pb-2 border-b border-slate-800">
          <Info className="w-3.5 h-3.5 text-blue-400" />
          Single-Nucleus Reference Atlas Information & Methods
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-slate-400">
          <div>
            <strong className="text-slate-200 block mb-1">Study Citation</strong>
            <p className="leading-relaxed">
              <strong>Hwang et al., Nature Genetics (2022)</strong><br />
              <em>"Refined molecular taxonomy and treatment remodeling of pancreatic cancer using single-cell resolution"</em><br />
              <span className="text-[10px] text-slate-500 font-mono block mt-1">GEO: GSE202051 · DOI: 10.1038/s41588-022-01134-8</span>
              <span className="text-[10px] text-slate-500 font-mono block mt-0.5">Resource version: 1.0</span>
            </p>
          </div>
          <div className="border-l border-slate-800 pl-6">
            <strong className="text-slate-200 block mb-1">Visualization Subsampling Strategy</strong>
            <p className="leading-relaxed">
              The web explorer uses a stratified 20,000-nucleus subset representing all 43 patients and broad cell lineages (seed=42). This ensures highly interactive visual representation and fast page loads.
              <span className="text-[10px] text-slate-500 block mt-1.5">
                Expression values are stored as Float16 to optimize network transfers. Statistical analyses, DEG calculations, or quantitative comparisons must use the full-precision Float32 source atlas.
              </span>
            </p>
          </div>
          <div className="border-l border-slate-800 pl-6 text-amber-200/90 bg-amber-950/10 p-3 rounded-lg border border-amber-900/20">
            <strong className="text-amber-100 block mb-1 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> Important Cohort Differences
            </strong>
            <p className="leading-relaxed text-[11px]">
              GSE202051 represents an independent cohort and should not be used as direct cellular validation of fold changes in GSE225767. Additionally, the clinical response markers shown in tooltips correspond to overall patient-level annotations; they do not represent individual cell-level phenotypes.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
