"use client";

import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  Search,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Filter,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Sparkles,
  FileSpreadsheet,
  Info,
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
import { CptacProteinRecord, CptacMrnaOnlyRecord } from "@/types/cptac";
import {
  CURATED_20_NRF2_PANEL,
  PROT_SAMPLE_COLS,
  PROT_TUMOR_COUNT,
  MRNA_SAMPLE_COLS,
  MRNA_TUMOR_COUNT,
  sliceMatrixRow,
  mannWhitneyUTest,
  welchTTestExact,
} from "@/utils/cptacEngine";

interface CptacVolcanoAndDistProps {
  proteins: CptacProteinRecord[];
  mrnaOnly: CptacMrnaOnlyRecord[];
  protBuffer: ArrayBuffer | null;
  mrnaBuffer: ArrayBuffer | null;
  tumorIds: string[];
  normalIds: string[];
  mrnaNormalIds: string[];
  pairedNatSet: Set<string>;
  selectedGene: string;
  onSelectGene: (gene: string) => void;
  onSendToHeatmap?: (genes: string[]) => void;
  onSendToSurvival?: (genes: string[]) => void;
}

type StatMethod = "mw" | "welch";
type SortField =
  | "g"
  | "nT"
  | "tMean"
  | "nMean"
  | "log2FC"
  | "pVal"
  | "qVal"
  | "pairedLog2FC"
  | "r";

export default function CptacVolcanoAndDist({
  proteins,
  mrnaOnly,
  protBuffer,
  mrnaBuffer,
  tumorIds,
  normalIds,
  mrnaNormalIds,
  pairedNatSet,
  selectedGene,
  onSelectGene,
  onSendToHeatmap,
  onSendToSurvival,
}: CptacVolcanoAndDistProps) {
  const [statMethod, setStatMethod] = useState<StatMethod>("mw");
  const [fcThreshold, setFcThreshold] = useState<number>(0.5);
  const [highlightNrf2Panel, setHighlightNrf2Panel] = useState<boolean>(true);
  const [markedGenes, setMarkedGenes] = useState<Set<string>>(() => new Set());

  // Volcano Canvas states
  const volcanoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const volcanoWrapperRef = useRef<HTMLDivElement | null>(null);
  const [volcanoDim, setVolcanoDim] = useState({ width: 640, height: 430 });
  const [zoom, setZoom] = useState(1.0);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const [hoveredProtein, setHoveredProtein] = useState<CptacProteinRecord | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Distribution Canvas states
  const distCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const distWrapperRef = useRef<HTMLDivElement | null>(null);
  const [distDim, setDistDim] = useState({ width: 520, height: 380 });
  const [distPairedOnly, setDistPairedOnly] = useState<boolean>(false);

  // Table states
  const [search, setSearch] = useState("");
  const [tableFilter, setTableFilter] = useState<"all" | "sig" | "up" | "down" | "nrf2">("all");
  const [sortField, setSortField] = useState<SortField>("qVal");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  const [isLightTheme, setIsLightTheme] = useState(false);
  useEffect(() => {
    setIsLightTheme(document.documentElement.classList.contains("light"));
    const onTheme = () => setIsLightTheme(document.documentElement.classList.contains("light"));
    window.addEventListener("bioportal:theme", onTheme);
    return () => window.removeEventListener("bioportal:theme", onTheme);
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, tableFilter, pageSize]);

  // ResizeObservers
  useEffect(() => {
    if (!volcanoWrapperRef.current) return;
    const obs = new ResizeObserver((entries) => {
      for (const e of entries) {
        const nextW = Math.max(320, Math.round(e.contentRect.width));
        const nextH = Math.max(260, Math.round(e.contentRect.height));
        setVolcanoDim((prev) =>
          prev.width === nextW && prev.height === nextH
            ? prev
            : { width: nextW, height: nextH }
        );
      }
    });
    obs.observe(volcanoWrapperRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!distWrapperRef.current) return;
    const obs = new ResizeObserver((entries) => {
      for (const e of entries) {
        const nextW = Math.max(300, Math.round(e.contentRect.width));
        const nextH = Math.max(260, Math.round(e.contentRect.height));
        setDistDim((prev) =>
          prev.width === nextW && prev.height === nextH
            ? prev
            : { width: nextW, height: nextH }
        );
      }
    });
    obs.observe(distWrapperRef.current);
    return () => obs.disconnect();
  }, []);

  const nrf2Set = useMemo(() => new Set(CURATED_20_NRF2_PANEL), []);

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

  // Volcano points
  const points = useMemo(() => {
    return proteins
      .map((d) => {
        const qVal = statMethod === "mw" ? d.mwQ : d.welchQ;
        const pVal = statMethod === "mw" ? d.mwP : d.welchP;
        if (d.log2FC === null || qVal === null || pVal === null) return null;
        const y = -Math.log10(Math.max(qVal, 1e-35));
        return { prot: d, x: d.log2FC, y, pVal, qVal };
      })
      .filter((pt): pt is NonNullable<typeof pt> => pt !== null);
  }, [proteins, statMethod]);

  const bounds = useMemo(() => {
    if (points.length === 0) return { minX: -4, maxX: 4, minY: 0, maxY: 25 };
    let minX = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const absMax = Math.max(Math.abs(minX), Math.abs(maxX), 1.5);
    return {
      minX: -absMax - 0.3,
      maxX: absMax + 0.3,
      minY: 0,
      maxY: Math.max(maxY + 1.5, 5),
    };
  }, [points]);

  const pad = { top: 28, right: 24, bottom: 52, left: 56 };

  const getScreenCoords = (x: number, y: number) => {
    const w = volcanoDim.width - pad.left - pad.right;
    const h = volcanoDim.height - pad.top - pad.bottom;
    const sx = pad.left + ((x - bounds.minX) / (bounds.maxX - bounds.minX)) * w;
    const sy = volcanoDim.height - pad.bottom - ((y - bounds.minY) / (bounds.maxY - bounds.minY)) * h;
    const cx = pad.left + w / 2;
    const cy = pad.top + h / 2;
    return {
      x: (sx - cx) * zoom + cx + offsetX,
      y: (sy - cy) * zoom + cy + offsetY,
    };
  };

  // Render Volcano Canvas
  useEffect(() => {
    const canvas = volcanoCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = volcanoDim.width * dpr;
    canvas.height = volcanoDim.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, volcanoDim.width, volcanoDim.height);

    const xStep = Math.max(0.5, Math.ceil(((bounds.maxX - bounds.minX) / 8) * 2) / 2);
    const startX = Math.ceil(bounds.minX / xStep) * xStep;
    const yStep = Math.max(2, Math.ceil((bounds.maxY - bounds.minY) / 7));

    // Axis ticks
    ctx.font = "11px sans-serif";
    for (let x = startX; x <= bounds.maxX; x += xStep) {
      const sp = getScreenCoords(x, 0);
      if (sp.x >= pad.left && sp.x <= volcanoDim.width - pad.right) {
        ctx.fillStyle = isLightTheme ? "#334155" : "#94a3b8";
        ctx.textAlign = "center";
        ctx.fillText(x.toFixed(1), sp.x, volcanoDim.height - pad.bottom + 18);
        ctx.strokeStyle = isLightTheme ? "#64748b" : "#475569";
        ctx.beginPath();
        ctx.moveTo(sp.x, volcanoDim.height - pad.bottom);
        ctx.lineTo(sp.x, volcanoDim.height - pad.bottom + 4);
        ctx.stroke();
      }
    }

    for (let y = 0; y <= bounds.maxY; y += yStep) {
      const sp = getScreenCoords(0, y);
      if (sp.y >= pad.top && sp.y <= volcanoDim.height - pad.bottom) {
        ctx.fillStyle = isLightTheme ? "#334155" : "#94a3b8";
        ctx.textAlign = "right";
        ctx.fillText(y.toString(), pad.left - 8, sp.y + 4);
        ctx.strokeStyle = isLightTheme ? "#64748b" : "#475569";
        ctx.beginPath();
        ctx.moveTo(pad.left - 4, sp.y);
        ctx.lineTo(pad.left, sp.y);
        ctx.stroke();
      }
    }

    // Clipped plot region
    ctx.save();
    ctx.beginPath();
    ctx.rect(
      pad.left,
      pad.top,
      volcanoDim.width - pad.left - pad.right,
      volcanoDim.height - pad.top - pad.bottom
    );
    ctx.clip();

    // Grid lines
    ctx.strokeStyle = isLightTheme ? "rgba(100,116,139,0.14)" : "rgba(148,163,184,0.06)";
    ctx.lineWidth = 1;
    for (let x = startX; x <= bounds.maxX; x += xStep) {
      const sp = getScreenCoords(x, 0);
      ctx.beginPath();
      ctx.moveTo(sp.x, pad.top);
      ctx.lineTo(sp.x, volcanoDim.height - pad.bottom);
      ctx.stroke();
    }
    for (let y = 0; y <= bounds.maxY; y += yStep) {
      const sp = getScreenCoords(0, y);
      ctx.beginPath();
      ctx.moveTo(pad.left, sp.y);
      ctx.lineTo(volcanoDim.width - pad.right, sp.y);
      ctx.stroke();
    }

    // Zero line
    const zeroPt = getScreenCoords(0, 0);
    ctx.strokeStyle = isLightTheme ? "rgba(100,116,139,0.45)" : "rgba(148,163,184,0.25)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(zeroPt.x, pad.top);
    ctx.lineTo(zeroPt.x, volcanoDim.height - pad.bottom);
    ctx.stroke();

    // FDR = 0.05 line
    const threshPt = getScreenCoords(0, -Math.log10(0.05));
    ctx.strokeStyle = "rgba(239, 68, 68, 0.55)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.left, threshPt.y);
    ctx.lineTo(volcanoDim.width - pad.right, threshPt.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = isLightTheme ? "#dc2626" : "#f87171";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("FDR = 0.05", pad.left + 6, threshPt.y - 5);

    // FC lines
    if (fcThreshold > 0) {
      const rPt = getScreenCoords(fcThreshold, 0);
      const lPt = getScreenCoords(-fcThreshold, 0);
      ctx.strokeStyle = isLightTheme ? "rgba(100,116,139,0.4)" : "rgba(148,163,184,0.28)";
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(rPt.x, pad.top);
      ctx.lineTo(rPt.x, volcanoDim.height - pad.bottom);
      ctx.moveTo(lPt.x, pad.top);
      ctx.lineTo(lPt.x, volcanoDim.height - pad.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const activeHighlightSet = new Set<string>();
    if (highlightNrf2Panel) {
      markedGenes.forEach((g) => activeHighlightSet.add(g.toUpperCase()));
    }
    if (selectedGene) activeHighlightSet.add(selectedGene.toUpperCase());

    const sorted = [...points].sort((a, b) => {
      const aH = activeHighlightSet.has(a.prot.g.toUpperCase()) ? 1 : 0;
      const bH = activeHighlightSet.has(b.prot.g.toUpperCase()) ? 1 : 0;
      return aH - bH;
    });

    for (const p of sorted) {
      const sp = getScreenCoords(p.x, p.y);
      const isSig = p.qVal < 0.05;
      const passesFC = Math.abs(p.x) >= fcThreshold;
      let color = isLightTheme ? "rgba(148,163,184,0.3)" : "rgba(148,163,184,0.16)";
      let radius = 2.4;

      if (isSig && passesFC) {
        color = p.x > 0 ? "rgba(239, 68, 68, 0.72)" : "rgba(59, 130, 246, 0.72)";
        radius = 3.5;
      } else if (isSig) {
        color = isLightTheme ? "rgba(100,116,139,0.42)" : "rgba(148,163,184,0.28)";
        radius = 2.7;
      }

      ctx.beginPath();
      ctx.arc(sp.x, sp.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }

    // Highlighted proteins + collision-aware labels
    const markedPts = points
      .filter((p) => activeHighlightSet.has(p.prot.g.toUpperCase()))
      .sort((a, b) => {
        const aSel = a.prot.g.toUpperCase() === selectedGene.toUpperCase() ? 1 : 0;
        const bSel = b.prot.g.toUpperCase() === selectedGene.toUpperCase() ? 1 : 0;
        if (aSel !== bSel) return bSel - aSel;
        return b.y - a.y;
      })
      .slice(0, 40)
      .map((p) => ({
        gene: p.prot.g,
        isSelected: p.prot.g.toUpperCase() === selectedGene.toUpperCase(),
        dataX: p.x,
        ...getScreenCoords(p.x, p.y),
      }));

    for (const mp of markedPts) {
      ctx.beginPath();
      ctx.arc(mp.x, mp.y, mp.isSelected ? 7.5 : 5.5, 0, Math.PI * 2);
      ctx.strokeStyle = mp.isSelected ? "#14b8a6" : "#f59e0b";
      ctx.lineWidth = mp.isSelected ? 2.5 : 1.8;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(mp.x, mp.y, mp.isSelected ? 4.5 : 3.2, 0, Math.PI * 2);
      ctx.fillStyle = mp.isSelected ? "#14b8a6" : "#f59e0b";
      ctx.fill();
    }

    // Labels
    ctx.font = "bold 11px sans-serif";
    const placed: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
    for (const mp of markedPts.slice(0, 26)) {
      if (
        mp.x < pad.left ||
        mp.x > volcanoDim.width - pad.right ||
        mp.y < pad.top ||
        mp.y > volcanoDim.height - pad.bottom
      ) {
        continue;
      }
      const tw = ctx.measureText(mp.gene).width;
      const bw = tw + 8;
      const bh = 16;
      const dir = mp.dataX >= 0 ? 1 : -1;
      const candidates = [
        { dx: dir * (12 + bw / 2), dy: 0 },
        { dx: dir * (12 + bw / 2), dy: -16 },
        { dx: dir * (12 + bw / 2), dy: 16 },
        { dx: -dir * (12 + bw / 2), dy: 0 },
        { dx: 0, dy: -18 },
        { dx: 0, dy: 18 },
        { dx: dir * (24 + bw / 2), dy: -28 },
        { dx: dir * (24 + bw / 2), dy: 28 },
      ];
      let best = {
        x1: mp.x + candidates[0].dx - bw / 2,
        y1: mp.y + candidates[0].dy - bh / 2,
        x2: mp.x + candidates[0].dx + bw / 2,
        y2: mp.y + candidates[0].dy + bh / 2,
      };
      let bestScore = Infinity;
      for (let idx = 0; idx < candidates.length; idx++) {
        const c = candidates[idx];
        const cx = Math.min(Math.max(mp.x + c.dx, pad.left + 4 + bw / 2), volcanoDim.width - pad.right - 4 - bw / 2);
        const cy = Math.min(Math.max(mp.y + c.dy, pad.top + 4 + bh / 2), volcanoDim.height - pad.bottom - 4 - bh / 2);
        const x1 = cx - bw / 2;
        const y1 = cy - bh / 2;
        const x2 = cx + bw / 2;
        const y2 = cy + bh / 2;
        let pen = idx * 4;
        for (const b of placed) {
          const ox = Math.max(0, Math.min(x2 + 2, b.x2 + 2) - Math.max(x1 - 2, b.x1 - 2));
          const oy = Math.max(0, Math.min(y2 + 2, b.y2 + 2) - Math.max(y1 - 2, b.y1 - 2));
          if (ox > 0 && oy > 0) pen += ox * oy * 50 + 5000;
        }
        if (pen < bestScore) {
          bestScore = pen;
          best = { x1, y1, x2, y2 };
          if (pen < 10) break;
        }
      }
      placed.push(best);
      const ax = Math.max(best.x1, Math.min(mp.x, best.x2));
      const ay = Math.max(best.y1, Math.min(mp.y, best.y2));
      if (Math.hypot(ax - mp.x, ay - mp.y) > 8) {
        ctx.beginPath();
        ctx.moveTo(mp.x, mp.y);
        ctx.lineTo(ax, ay);
        ctx.strokeStyle = mp.isSelected ? "rgba(20,184,166,0.8)" : "rgba(245,158,11,0.75)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.fillStyle = isLightTheme ? "rgba(255,255,255,0.92)" : "rgba(2,6,23,0.88)";
      ctx.strokeStyle = mp.isSelected ? "#14b8a6" : "rgba(245,158,11,0.65)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(best.x1, best.y1, bw, bh, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = mp.isSelected ? (isLightTheme ? "#0d9488" : "#2dd4bf") : (isLightTheme ? "#b45309" : "#fbbf24");
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(mp.gene, (best.x1 + best.x2) / 2, (best.y1 + best.y2) / 2 + 0.5);
    }
    ctx.textBaseline = "alphabetic";

    if (hoveredProtein) {
      const hp = points.find((p) => p.prot.g === hoveredProtein.g);
      if (hp) {
        const sp = getScreenCoords(hp.x, hp.y);
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 7, 0, Math.PI * 2);
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    ctx.restore();

    // Axes lines & titles
    ctx.strokeStyle = isLightTheme ? "#334155" : "#475569";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pad.left, volcanoDim.height - pad.bottom);
    ctx.lineTo(volcanoDim.width - pad.right, volcanoDim.height - pad.bottom);
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, volcanoDim.height - pad.bottom);
    ctx.stroke();

    ctx.fillStyle = isLightTheme ? "#0f172a" : "#cbd5e1";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      "log2 Fold Change (Tumor [n=140] vs. Normal Adjacent Tissue [n=75])",
      pad.left + (volcanoDim.width - pad.left - pad.right) / 2,
      volcanoDim.height - 12
    );

    ctx.save();
    ctx.translate(16, pad.top + (volcanoDim.height - pad.top - pad.bottom) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(statMethod === "mw" ? "-log10(BH FDR, Mann-Whitney U)" : "-log10(BH FDR, Welch t-test)", 0, 0);
    ctx.restore();
  }, [volcanoDim, bounds, points, zoom, offsetX, offsetY, isLightTheme, fcThreshold, highlightNrf2Panel, markedGenes, selectedGene, hoveredProtein, statMethod]);

  // Extract distribution values for selected gene
  const selectedDistribution = useMemo(() => {
    const upper = selectedGene.toUpperCase();
    const protRec = protLookup.get(upper) || null;
    const mrnaRec = mrnaOnlyLookup.get(upper) || null;

    if (protRec && protBuffer) {
      const row = sliceMatrixRow(protBuffer, protRec.pi, PROT_SAMPLE_COLS);
      if (row) {
        const tumorValsAll = row.slice(0, PROT_TUMOR_COUNT);
        const natValsAll = row.slice(PROT_TUMOR_COUNT, PROT_SAMPLE_COLS);
        const tIdxMap = new Map<string, number>();
        tumorIds.forEach((id, i) => tIdxMap.set(id, i));

        const tumorSamples: Array<{ id: string; val: number; paired: boolean }> = [];
        const natSamples: Array<{ id: string; val: number; paired: boolean }> = [];

        if (distPairedOnly) {
          normalIds.forEach((nid, ni) => {
            if (pairedNatSet.has(nid)) {
              const ti = tIdxMap.get(nid);
              const tv = ti !== undefined ? tumorValsAll[ti] : NaN;
              const nv = natValsAll[ni];
              if (Number.isFinite(tv) && Number.isFinite(nv)) {
                tumorSamples.push({ id: nid, val: tv, paired: true });
                natSamples.push({ id: nid, val: nv, paired: true });
              }
            }
          });
        } else {
          tumorIds.forEach((tid, ti) => {
            const v = tumorValsAll[ti];
            if (Number.isFinite(v)) tumorSamples.push({ id: tid, val: v, paired: pairedNatSet.has(tid) });
          });
          normalIds.forEach((nid, ni) => {
            const v = natValsAll[ni];
            if (Number.isFinite(v)) natSamples.push({ id: nid, val: v, paired: pairedNatSet.has(nid) });
          });
        }

        const tVals = tumorSamples.map((s) => s.val);
        const nVals = natSamples.map((s) => s.val);
        const mw = mannWhitneyUTest(tVals, nVals);
        const welch = welchTTestExact(tVals, nVals);

        return {
          mode: "protein" as const,
          gene: protRec.g,
          unit: "log2 Median-Normalized TMT Abundance",
          protRec,
          mrnaRec: null,
          tumorSamples,
          natSamples,
          mwP: distPairedOnly ? mw.p : (protRec.mwP ?? mw.p),
          mwQ: protRec.mwQ,
          welchP: distPairedOnly ? welch.p : (protRec.welchP ?? welch.p),
          log2FC:
            tVals.length > 0 && nVals.length > 0
              ? tVals.reduce((a, b) => a + b, 0) / tVals.length - nVals.reduce((a, b) => a + b, 0) / nVals.length
              : protRec.log2FC ?? 0,
        };
      }
    }

    // Fallback to mRNA-only (e.g., NFE2L2, HIF1A, SLC7A11)
    const mi = protRec?.mi ?? mrnaRec?.mi ?? null;
    if (mi !== null && mrnaBuffer) {
      const row = sliceMatrixRow(mrnaBuffer, mi, MRNA_SAMPLE_COLS);
      if (row) {
        const tumorSamples: Array<{ id: string; val: number; paired: boolean }> = [];
        const natSamples: Array<{ id: string; val: number; paired: boolean }> = [];
        tumorIds.forEach((tid, ti) => {
          const v = row[ti];
          if (Number.isFinite(v)) tumorSamples.push({ id: tid, val: v, paired: false });
        });
        mrnaNormalIds.forEach((nid, ni) => {
          const v = row[MRNA_TUMOR_COUNT + ni];
          if (Number.isFinite(v)) natSamples.push({ id: nid, val: v, paired: false });
        });
        const tVals = tumorSamples.map((s) => s.val);
        const nVals = natSamples.map((s) => s.val);
        const mw = mannWhitneyUTest(tVals, nVals);
        const welch = welchTTestExact(tVals, nVals);
        return {
          mode: "mrna_fallback" as const,
          gene: mrnaRec?.g || selectedGene,
          unit: "Matched RNA-seq log2(RSEM-UQ + 1)",
          protRec: null,
          mrnaRec,
          tumorSamples,
          natSamples,
          mwP: mrnaRec?.mwP ?? mw.p,
          mwQ: mrnaRec?.mwQ ?? null,
          welchP: welch.p,
          log2FC:
            tVals.length > 0 && nVals.length > 0
              ? tVals.reduce((a, b) => a + b, 0) / tVals.length - nVals.reduce((a, b) => a + b, 0) / nVals.length
              : mrnaRec?.log2FC ?? 0,
        };
      }
    }
    return null;
  }, [selectedGene, protLookup, mrnaOnlyLookup, protBuffer, mrnaBuffer, tumorIds, normalIds, mrnaNormalIds, pairedNatSet, distPairedOnly]);

  // Draw Distribution Boxplot + Jitter onto Canvas
  useEffect(() => {
    const canvas = distCanvasRef.current;
    if (!canvas || !selectedDistribution) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = distDim.width * dpr;
    canvas.height = distDim.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, distDim.width, distDim.height);

    const pLeft = 60;
    const pRight = 24;
    const pTop = 44;
    const pBottom = 56;
    const pw = distDim.width - pLeft - pRight;
    const ph = distDim.height - pTop - pBottom;

    const allVals = [
      ...selectedDistribution.natSamples.map((s) => s.val),
      ...selectedDistribution.tumorSamples.map((s) => s.val),
    ];
    if (allVals.length === 0) return;

    const minV = Math.min(...allVals);
    const maxV = Math.max(...allVals);
    const span = Math.max(0.5, maxV - minV);
    const yMin = minV - span * 0.1;
    const yMax = maxV + span * 0.18;
    const mapY = (v: number) => pTop + ph - ((v - yMin) / (yMax - yMin)) * ph;

    // Gridlines
    ctx.font = "11px sans-serif";
    for (let i = 0; i <= 5; i++) {
      const yv = yMin + (i / 5) * (yMax - yMin);
      const py = mapY(yv);
      ctx.strokeStyle = isLightTheme ? "rgba(100,116,139,0.15)" : "rgba(148,163,184,0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pLeft, py);
      ctx.lineTo(pLeft + pw, py);
      ctx.stroke();

      ctx.fillStyle = isLightTheme ? "#334155" : "#94a3b8";
      ctx.textAlign = "right";
      ctx.fillText(yv.toFixed(1), pLeft - 8, py + 4);
    }

    const drawGroup = (
      samples: Array<{ id: string; val: number }>,
      cx: number,
      label: string,
      color: string,
      fillRgba: string
    ) => {
      if (samples.length === 0) return;
      const vals = samples.map((s) => s.val).sort((a, b) => a - b);
      const n = vals.length;
      const q = (p: number) => {
        const pos = (n - 1) * p;
        const base = Math.floor(pos);
        const rest = pos - base;
        return vals[base + 1] !== undefined ? vals[base] + rest * (vals[base + 1] - vals[base]) : vals[base];
      };
      const q1 = q(0.25);
      const med = q(0.5);
      const q3 = q(0.75);
      const iqr = q3 - q1;
      const lowW = vals.find((v) => v >= q1 - 1.5 * iqr) ?? q1;
      const highW = [...vals].reverse().find((v) => v <= q3 + 1.5 * iqr) ?? q3;
      const mean = vals.reduce((a, b) => a + b, 0) / n;

      // Deterministic jitter points
      const jSpread = Math.min(48, pw * 0.14);
      samples.forEach((s, idx) => {
        const jx = cx + (((idx * 37) % 100) / 100 - 0.5) * 2 * jSpread;
        ctx.beginPath();
        ctx.arc(jx, mapY(s.val), 3.1, 0, Math.PI * 2);
        ctx.fillStyle = fillRgba;
        ctx.fill();
      });

      const bw = Math.min(72, pw * 0.22);
      // Whiskers
      ctx.strokeStyle = isLightTheme ? "#0f172a" : "#e2e8f0";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx, mapY(lowW));
      ctx.lineTo(cx, mapY(q1));
      ctx.moveTo(cx, mapY(q3));
      ctx.lineTo(cx, mapY(highW));
      ctx.moveTo(cx - bw * 0.28, mapY(lowW));
      ctx.lineTo(cx + bw * 0.28, mapY(lowW));
      ctx.moveTo(cx - bw * 0.28, mapY(highW));
      ctx.lineTo(cx + bw * 0.28, mapY(highW));
      ctx.stroke();

      // Box
      const yQ3 = mapY(q3);
      const yQ1 = mapY(q1);
      ctx.fillStyle = isLightTheme ? "rgba(255,255,255,0.45)" : "rgba(15,23,42,0.45)";
      ctx.fillRect(cx - bw / 2, yQ3, bw, Math.max(2, yQ1 - yQ3));
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.strokeRect(cx - bw / 2, yQ3, bw, Math.max(2, yQ1 - yQ3));

      // Median line
      ctx.strokeStyle = isLightTheme ? "#0f172a" : "#ffffff";
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(cx - bw / 2, mapY(med));
      ctx.lineTo(cx + bw / 2, mapY(med));
      ctx.stroke();

      // Mean diamond
      const my = mapY(mean);
      ctx.beginPath();
      ctx.moveTo(cx, my - 5);
      ctx.lineTo(cx + 5, my);
      ctx.lineTo(cx, my + 5);
      ctx.lineTo(cx - 5, my);
      ctx.closePath();
      ctx.fillStyle = "#f59e0b";
      ctx.fill();
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // X-axis label
      ctx.fillStyle = isLightTheme ? "#0f172a" : "#f1f5f9";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(label, cx, distDim.height - pBottom + 20);
      ctx.fillStyle = isLightTheme ? "#475569" : "#94a3b8";
      ctx.font = "11px sans-serif";
      ctx.fillText(`n = ${n} (med ${med.toFixed(2)})`, cx, distDim.height - pBottom + 36);
    };

    const cx0 = pLeft + pw * 0.28;
    const cx1 = pLeft + pw * 0.72;
    drawGroup(selectedDistribution.natSamples, cx0, "Normal Adjacent", "#3b82f6", "rgba(59,130,246,0.45)");
    drawGroup(selectedDistribution.tumorSamples, cx1, "Primary Tumor", "#ef4444", "rgba(239,68,68,0.45)");

    // Significance bracket
    const bY = pTop - 16;
    ctx.strokeStyle = selectedDistribution.mwP < 0.05 ? "#14b8a6" : (isLightTheme ? "#475569" : "#94a3b8");
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(cx0, bY + 6);
    ctx.lineTo(cx0, bY);
    ctx.lineTo(cx1, bY);
    ctx.lineTo(cx1, bY + 6);
    ctx.stroke();

    ctx.fillStyle = selectedDistribution.mwP < 0.05 ? (isLightTheme ? "#0d9488" : "#2dd4bf") : (isLightTheme ? "#334155" : "#cbd5e1");
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    const fcSign = selectedDistribution.log2FC >= 0 ? "+" : "";
    ctx.fillText(
      `log2FC = ${fcSign}${selectedDistribution.log2FC.toFixed(3)}  |  MW p = ${formatPublicationPValue(selectedDistribution.mwP)}`,
      (cx0 + cx1) / 2,
      bY - 6
    );

    // Axis lines
    ctx.strokeStyle = isLightTheme ? "#334155" : "#475569";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pLeft, distDim.height - pBottom);
    ctx.lineTo(distDim.width - pRight, distDim.height - pBottom);
    ctx.moveTo(pLeft, pTop);
    ctx.lineTo(pLeft, distDim.height - pBottom);
    ctx.stroke();

    ctx.save();
    ctx.translate(16, pTop + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = isLightTheme ? "#0f172a" : "#cbd5e1";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(selectedDistribution.unit, 0, 0);
    ctx.restore();
  }, [distDim, selectedDistribution, isLightTheme]);

  // High-res 2400px Volcano Export Canvas
  const generateHighResVolcano = (theme: "light" | "dark" = "light"): HTMLCanvasElement => {
    const size = 2400;
    const off = document.createElement("canvas");
    off.width = size;
    off.height = size;
    const ctx = off.getContext("2d");
    if (!ctx) return off;
    const isLight = theme === "light";

    ctx.fillStyle = isLight ? "#ffffff" : "#020617";
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.textAlign = "left";
    drawFittedText(
      ctx,
      "CPTAC-PDAC Differential Protein Abundance (Tumor vs. Normal)",
      90,
      110,
      size - 180,
      98,
      "bold",
      PUB_FONT_SANS
    );
    ctx.fillStyle = isLight ? "#334155" : "#94a3b8";
    drawFittedText(
      ctx,
      `Cao et al., Cell 2021 · Tumors n=140 vs NAT n=75 · ${statMethod === "mw" ? "Mann-Whitney U" : "Welch"} FDR < 0.05, |log2FC| ≥ ${fcThreshold.toFixed(2)}`,
      90,
      180,
      size - 180,
      54,
      "bold",
      PUB_FONT_NUM
    );

    const p = { left: 320, right: 90, top: 245, bottom: 310 };
    const pw = size - p.left - p.right;
    const ph = size - p.top - p.bottom;
    const mapX = (x: number) => p.left + ((x - bounds.minX) / (bounds.maxX - bounds.minX)) * pw;
    const mapY = (y: number) => p.top + ph - ((y - bounds.minY) / (bounds.maxY - bounds.minY)) * ph;

    // Grid
    const xStep = Math.max(0.5, Math.ceil(((bounds.maxX - bounds.minX) / 8) * 2) / 2);
    const startX = Math.ceil(bounds.minX / xStep) * xStep;
    const yStep = Math.max(2, Math.ceil((bounds.maxY - bounds.minY) / 7));

    ctx.strokeStyle = isLight ? "rgba(226,232,240,0.9)" : "rgba(30,41,59,0.65)";
    ctx.lineWidth = 2.5;
    for (let x = startX; x <= bounds.maxX; x += xStep) {
      const px = mapX(x);
      ctx.beginPath();
      ctx.moveTo(px, p.top);
      ctx.lineTo(px, p.top + ph);
      ctx.stroke();
      ctx.fillStyle = isLight ? "#1e293b" : "#94a3b8";
      ctx.font = `bold 70px ${PUB_FONT_NUM}`;
      ctx.textAlign = "center";
      ctx.fillText(x.toFixed(1), px, p.top + ph + 84);
    }
    for (let y = 0; y <= bounds.maxY; y += yStep) {
      const py = mapY(y);
      ctx.beginPath();
      ctx.moveTo(p.left, py);
      ctx.lineTo(p.left + pw, py);
      ctx.stroke();
      ctx.fillStyle = isLight ? "#1e293b" : "#94a3b8";
      ctx.font = `bold 70px ${PUB_FONT_NUM}`;
      ctx.textAlign = "right";
      ctx.fillText(y.toString(), p.left - 30, py + 24);
    }

    // Thresholds
    const fdrY = mapY(-Math.log10(0.05));
    ctx.strokeStyle = "rgba(220,38,38,0.85)";
    ctx.lineWidth = 5;
    ctx.setLineDash([12, 10]);
    ctx.beginPath();
    ctx.moveTo(p.left, fdrY);
    ctx.lineTo(p.left + pw, fdrY);
    ctx.stroke();
    ctx.setLineDash([]);

    if (fcThreshold > 0) {
      ctx.strokeStyle = isLight ? "#94a3b8" : "#475569";
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(mapX(fcThreshold), p.top);
      ctx.lineTo(mapX(fcThreshold), p.top + ph);
      ctx.moveTo(mapX(-fcThreshold), p.top);
      ctx.lineTo(mapX(-fcThreshold), p.top + ph);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Points
    for (const pt of points) {
      const sx = mapX(pt.x);
      const sy = mapY(pt.y);
      const isSig = pt.qVal < 0.05;
      const passesFC = Math.abs(pt.x) >= fcThreshold;
      ctx.beginPath();
      ctx.arc(sx, sy, isSig && passesFC ? 12 : 8, 0, Math.PI * 2);
      ctx.fillStyle = isSig && passesFC ? (pt.x > 0 ? "#dc2626" : "#2563eb") : isLight ? "rgba(148,163,184,0.45)" : "rgba(148,163,184,0.25)";
      ctx.fill();
    }

    // Callout points
    const activeSet = new Set<string>();
    if (highlightNrf2Panel) markedGenes.forEach((g) => activeSet.add(g.toUpperCase()));
    if (selectedGene) activeSet.add(selectedGene.toUpperCase());

    const callouts = points
      .filter((pt) => activeSet.has(pt.prot.g.toUpperCase()))
      .sort((a, b) => b.y - a.y)
      .slice(0, 28);

    const placed: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
    ctx.font = `bold 54px ${PUB_FONT_SANS}`;
    for (const pt of callouts) {
      const sx = mapX(pt.x);
      const sy = mapY(pt.y);
      const isSel = pt.prot.g.toUpperCase() === selectedGene.toUpperCase();
      ctx.beginPath();
      ctx.arc(sx, sy, 24, 0, Math.PI * 2);
      ctx.strokeStyle = isSel ? "#0d9488" : "#d97706";
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sx, sy, 12, 0, Math.PI * 2);
      ctx.fillStyle = isSel ? "#0d9488" : "#f59e0b";
      ctx.fill();

      const tw = ctx.measureText(pt.prot.g).width;
      const bw = tw + 34;
      const bh = 72;
      const dir = pt.x >= 0 ? 1 : -1;
      const candidates = [
        { dx: dir * (40 + bw / 2), dy: 0 },
        { dx: dir * (40 + bw / 2), dy: -70 },
        { dx: dir * (40 + bw / 2), dy: 70 },
        { dx: -dir * (40 + bw / 2), dy: 0 },
        { dx: 0, dy: -82 },
        { dx: 0, dy: 82 },
      ];
      let best = {
        x1: sx + candidates[0].dx - bw / 2,
        y1: sy + candidates[0].dy - bh / 2,
        x2: sx + candidates[0].dx + bw / 2,
        y2: sy + candidates[0].dy + bh / 2,
      };
      let bestScore = Infinity;
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        const cx = Math.min(Math.max(sx + c.dx, p.left + 12 + bw / 2), p.left + pw - 12 - bw / 2);
        const cy = Math.min(Math.max(sy + c.dy, p.top + 12 + bh / 2), p.top + ph - 12 - bh / 2);
        const x1 = cx - bw / 2;
        const y1 = cy - bh / 2;
        const x2 = cx + bw / 2;
        const y2 = cy + bh / 2;
        let pen = i * 5;
        for (const b of placed) {
          const ox = Math.max(0, Math.min(x2 + 8, b.x2 + 8) - Math.max(x1 - 8, b.x1 - 8));
          const oy = Math.max(0, Math.min(y2 + 8, b.y2 + 8) - Math.max(y1 - 8, b.y1 - 8));
          if (ox > 0 && oy > 0) pen += ox * oy * 10 + 5000;
        }
        if (pen < bestScore) {
          bestScore = pen;
          best = { x1, y1, x2, y2 };
          if (pen < 15) break;
        }
      }
      placed.push(best);
      const ax = Math.max(best.x1, Math.min(sx, best.x2));
      const ay = Math.max(best.y1, Math.min(sy, best.y2));
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ax, ay);
      ctx.strokeStyle = isSel ? "#0d9488" : "#d97706";
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.fillStyle = isLight ? "rgba(255,255,255,0.96)" : "rgba(2,6,23,0.94)";
      ctx.strokeStyle = isSel ? "#0d9488" : "#d97706";
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.roundRect(best.x1, best.y1, bw, bh, 14);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isSel ? (isLight ? "#0f766e" : "#2dd4bf") : (isLight ? "#b45309" : "#fbbf24");
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(pt.prot.g, (best.x1 + best.x2) / 2, (best.y1 + best.y2) / 2);
    }
    ctx.textBaseline = "alphabetic";

    // Axes box + titles
    ctx.strokeStyle = isLight ? "#0f172a" : "#64748b";
    ctx.lineWidth = 6;
    ctx.strokeRect(p.left, p.top, pw, ph);

    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.textAlign = "center";
    drawFittedText(
      ctx,
      "log₂ Fold Change (Tumor vs. Normal Adjacent)",
      p.left + pw / 2,
      p.top + ph + 205,
      pw,
      84,
      "bold",
      PUB_FONT_SANS
    );

    ctx.save();
    ctx.translate(92, p.top + ph / 2);
    ctx.rotate(-Math.PI / 2);
    drawFittedText(
      ctx,
      statMethod === "mw" ? "−log₁₀(BH FDR, Mann-Whitney U)" : "−log₁₀(BH FDR, Welch t-test)",
      0,
      0,
      ph,
      84,
      "bold",
      PUB_FONT_SANS
    );
    ctx.restore();

    return off;
  };

  // High-res 2400px Distribution Export Canvas
  const generateHighResDist = (theme: "light" | "dark" = "light"): HTMLCanvasElement => {
    const size = 2400;
    const off = document.createElement("canvas");
    off.width = size;
    off.height = size;
    const ctx = off.getContext("2d");
    if (!ctx || !selectedDistribution) return off;
    const isLight = theme === "light";

    ctx.fillStyle = isLight ? "#ffffff" : "#020617";
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.textAlign = "left";
    drawFittedText(
      ctx,
      `CPTAC-PDAC ${selectedDistribution.mode === "protein" ? "Protein" : "mRNA"} Abundance: ${selectedDistribution.gene}`,
      90,
      110,
      size - 180,
      98,
      "bold",
      PUB_FONT_SANS
    );
    ctx.fillStyle = isLight ? "#334155" : "#94a3b8";
    drawFittedText(
      ctx,
      `${selectedDistribution.unit} · log₂FC = ${selectedDistribution.log2FC >= 0 ? "+" : ""}${selectedDistribution.log2FC.toFixed(3)} · MW p = ${formatPublicationPValue(selectedDistribution.mwP)}`,
      90,
      180,
      size - 180,
      54,
      "bold",
      PUB_FONT_NUM
    );

    const p = { left: 320, right: 100, top: 265, bottom: 340 };
    const pw = size - p.left - p.right;
    const ph = size - p.top - p.bottom;
    const allVals = [
      ...selectedDistribution.natSamples.map((s) => s.val),
      ...selectedDistribution.tumorSamples.map((s) => s.val),
    ];
    const minV = Math.min(...allVals);
    const maxV = Math.max(...allVals);
    const span = Math.max(0.5, maxV - minV);
    const yMin = minV - span * 0.1;
    const yMax = maxV + span * 0.24;
    const mapY = (v: number) => p.top + ph - ((v - yMin) / (yMax - yMin)) * ph;

    ctx.strokeStyle = isLight ? "rgba(226,232,240,0.9)" : "rgba(30,41,59,0.65)";
    ctx.lineWidth = 2.5;
    for (let i = 0; i <= 5; i++) {
      const yv = yMin + (i / 5) * (yMax - yMin);
      const py = mapY(yv);
      ctx.beginPath();
      ctx.moveTo(p.left, py);
      ctx.lineTo(p.left + pw, py);
      ctx.stroke();
      ctx.fillStyle = isLight ? "#1e293b" : "#94a3b8";
      ctx.font = `bold 70px ${PUB_FONT_NUM}`;
      ctx.textAlign = "right";
      ctx.fillText(yv.toFixed(1), p.left - 30, py + 24);
    }

    const drawHiResGroup = (
      samples: Array<{ id: string; val: number }>,
      cx: number,
      label: string,
      color: string,
      rgba: string
    ) => {
      if (samples.length === 0) return;
      const vals = samples.map((s) => s.val).sort((a, b) => a - b);
      const n = vals.length;
      const q = (pct: number) => {
        const pos = (n - 1) * pct;
        const b = Math.floor(pos);
        const r = pos - b;
        return vals[b + 1] !== undefined ? vals[b] + r * (vals[b + 1] - vals[b]) : vals[b];
      };
      const q1 = q(0.25);
      const med = q(0.5);
      const q3 = q(0.75);
      const iqr = q3 - q1;
      const lowW = vals.find((v) => v >= q1 - 1.5 * iqr) ?? q1;
      const highW = [...vals].reverse().find((v) => v <= q3 + 1.5 * iqr) ?? q3;
      const mean = vals.reduce((a, b) => a + b, 0) / n;

      samples.forEach((s, idx) => {
        const jx = cx + (((idx * 37) % 100) / 100 - 0.5) * 2 * 165;
        ctx.beginPath();
        ctx.arc(jx, mapY(s.val), 13, 0, Math.PI * 2);
        ctx.fillStyle = rgba;
        ctx.fill();
      });

      const bw = 340;
      ctx.strokeStyle = isLight ? "#0f172a" : "#e2e8f0";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(cx, mapY(lowW));
      ctx.lineTo(cx, mapY(q1));
      ctx.moveTo(cx, mapY(q3));
      ctx.lineTo(cx, mapY(highW));
      ctx.moveTo(cx - 88, mapY(lowW));
      ctx.lineTo(cx + 88, mapY(lowW));
      ctx.moveTo(cx - 88, mapY(highW));
      ctx.lineTo(cx + 88, mapY(highW));
      ctx.stroke();

      ctx.fillStyle = isLight ? "rgba(255,255,255,0.45)" : "rgba(15,23,42,0.45)";
      ctx.fillRect(cx - bw / 2, mapY(q3), bw, Math.max(4, mapY(q1) - mapY(q3)));
      ctx.strokeStyle = color;
      ctx.lineWidth = 8;
      ctx.strokeRect(cx - bw / 2, mapY(q3), bw, Math.max(4, mapY(q1) - mapY(q3)));

      ctx.strokeStyle = isLight ? "#0f172a" : "#ffffff";
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(cx - bw / 2, mapY(med));
      ctx.lineTo(cx + bw / 2, mapY(med));
      ctx.stroke();

      const my = mapY(mean);
      ctx.beginPath();
      ctx.moveTo(cx, my - 22);
      ctx.lineTo(cx + 22, my);
      ctx.lineTo(cx, my + 22);
      ctx.lineTo(cx - 22, my);
      ctx.closePath();
      ctx.fillStyle = "#f59e0b";
      ctx.fill();
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 4.5;
      ctx.stroke();

      ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
      ctx.font = `bold 74px ${PUB_FONT_SANS}`;
      ctx.textAlign = "center";
      ctx.fillText(label, cx, p.top + ph + 96);
      ctx.fillStyle = isLight ? "#334155" : "#94a3b8";
      ctx.font = `bold 58px ${PUB_FONT_NUM}`;
      ctx.fillText(`n = ${n} · Median = ${med.toFixed(2)}`, cx, p.top + ph + 174);
    };

    const cx0 = p.left + pw * 0.28;
    const cx1 = p.left + pw * 0.72;
    drawHiResGroup(selectedDistribution.natSamples, cx0, "Normal Adjacent", "#2563eb", "rgba(37,99,235,0.45)");
    drawHiResGroup(selectedDistribution.tumorSamples, cx1, "Primary Tumor", "#dc2626", "rgba(220,38,38,0.45)");

    // Significance bracket
    const bY = p.top + 110;
    ctx.strokeStyle = selectedDistribution.mwP < 0.05 ? "#0d9488" : (isLight ? "#0f172a" : "#cbd5e1");
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(cx0, bY + 30);
    ctx.lineTo(cx0, bY);
    ctx.lineTo(cx1, bY);
    ctx.lineTo(cx1, bY + 30);
    ctx.stroke();
    ctx.fillStyle = selectedDistribution.mwP < 0.05 ? "#0d9488" : (isLight ? "#0f172a" : "#f8fafc");
    ctx.textAlign = "center";
    drawFittedText(
      ctx,
      `log₂FC = ${selectedDistribution.log2FC >= 0 ? "+" : ""}${selectedDistribution.log2FC.toFixed(3)} (MW p = ${formatPublicationPValue(selectedDistribution.mwP)})`,
      (cx0 + cx1) / 2,
      bY - 26,
      pw - 80,
      62,
      "bold",
      PUB_FONT_SANS
    );

    ctx.strokeStyle = isLight ? "#0f172a" : "#64748b";
    ctx.lineWidth = 6;
    ctx.strokeRect(p.left, p.top, pw, ph);

    ctx.save();
    ctx.translate(92, p.top + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.textAlign = "center";
    drawFittedText(ctx, selectedDistribution.unit, 0, 0, ph, 80, "bold", PUB_FONT_SANS);
    ctx.restore();

    return off;
  };

  // Filtered & sorted table rows
  const processedRows = useMemo(() => {
    let rows = [...proteins];
    if (search.trim()) {
      const q = search.trim().toUpperCase();
      rows = rows.filter((r) => r.g.toUpperCase().includes(q));
    }
    if (tableFilter === "sig") {
      rows = rows.filter((r) => {
        const qv = statMethod === "mw" ? r.mwQ : r.welchQ;
        return qv !== null && qv < 0.05 && r.log2FC !== null && Math.abs(r.log2FC) >= fcThreshold;
      });
    } else if (tableFilter === "up") {
      rows = rows.filter((r) => {
        const qv = statMethod === "mw" ? r.mwQ : r.welchQ;
        return qv !== null && qv < 0.05 && r.log2FC !== null && r.log2FC >= fcThreshold;
      });
    } else if (tableFilter === "down") {
      rows = rows.filter((r) => {
        const qv = statMethod === "mw" ? r.mwQ : r.welchQ;
        return qv !== null && qv < 0.05 && r.log2FC !== null && r.log2FC <= -fcThreshold;
      });
    } else if (tableFilter === "nrf2") {
      rows = rows.filter((r) => nrf2Set.has(r.g.toUpperCase()));
    }

    rows.sort((a, b) => {
      let va: number | string | null = null;
      let vb: number | string | null = null;
      if (sortField === "g") {
        va = a.g;
        vb = b.g;
      } else if (sortField === "pVal") {
        va = statMethod === "mw" ? a.mwP : a.welchP;
        vb = statMethod === "mw" ? b.mwP : b.welchP;
      } else if (sortField === "qVal") {
        va = statMethod === "mw" ? a.mwQ : a.welchQ;
        vb = statMethod === "mw" ? b.mwQ : b.welchQ;
      } else {
        va = a[sortField];
        vb = b[sortField];
      }
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      if (typeof va === "string" && typeof vb === "string") {
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortDir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });

    return rows;
  }, [proteins, search, tableFilter, statMethod, fcThreshold, sortField, sortDir, nrf2Set]);

  const totalPages = Math.max(1, Math.ceil(processedRows.length / pageSize));
  const pagedRows = useMemo(
    () => processedRows.slice((page - 1) * pageSize, page * pageSize),
    [processedRows, page, pageSize]
  );

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "g" || field === "pVal" || field === "qVal" ? "asc" : "desc");
    }
  };

  const formatNum = (val: number | null, dec = 3) =>
    val === null || !Number.isFinite(val) ? "N/A" : val.toFixed(dec);
  const formatP = (val: number | null) =>
    val === null || !Number.isFinite(val) ? "N/A" : val < 0.0001 ? val.toExponential(2) : val.toFixed(4);

  return (
    <div className="flex flex-col gap-6">
      {/* Top Volcano + Per-Protein Distribution Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left: Volcano Plot (7 cols) */}
        <div className="xl:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3 pb-3 border-b border-slate-800/80">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-100">
                Tumor vs. Normal Differential Protein Abundance
              </h3>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                {points.length.toLocaleString()} quantified proteins tested · Tumors (n=140) vs. NAT (n=75)
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 font-mono text-[11px]">
                <button
                  type="button"
                  onClick={() => setStatMethod("mw")}
                  className={`px-2.5 py-1 rounded-md cursor-pointer transition ${
                    statMethod === "mw"
                      ? "bg-teal-500/20 text-teal-300 border border-teal-500/40 font-bold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Mann-Whitney U
                </button>
                <button
                  type="button"
                  onClick={() => setStatMethod("welch")}
                  className={`px-2.5 py-1 rounded-md cursor-pointer transition ${
                    statMethod === "welch"
                      ? "bg-teal-500/20 text-teal-300 border border-teal-500/40 font-bold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Welch t-test
                </button>
              </div>
              <ExportButton
                label="Export"
                onExportPNG={({ theme = "light" } = {}) => {
                  exportCanvasToPNG({
                    canvas: generateHighResVolcano(theme),
                    filename: `CPTAC_PDAC_Protein_Volcano_${statMethod}.png`,
                    theme,
                  });
                }}
                onExportSVG={({ theme = "light" } = {}) => {
                  exportCanvasToSVG({
                    canvas: generateHighResVolcano(theme),
                    filename: `CPTAC_PDAC_Protein_Volcano_${statMethod}.svg`,
                    theme,
                  });
                }}
              />
            </div>
          </div>

          {/* Controls row */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs font-mono">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-slate-400">|log2FC| ≥</span>
              {[0.25, 0.5, 1.0].map((thr) => (
                <button
                  key={thr}
                  type="button"
                  onClick={() => setFcThreshold(thr)}
                  className={`px-2 py-0.5 rounded border cursor-pointer ${
                    fcThreshold === thr
                      ? "bg-teal-500/20 border-teal-500/40 text-teal-300 font-bold"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {thr.toFixed(2)}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setHighlightNrf2Panel((v) => !v)}
                className={`px-2.5 py-0.5 rounded border cursor-pointer ml-1 ${
                  highlightNrf2Panel
                    ? "bg-amber-500/15 border-amber-500/40 text-amber-300 font-semibold"
                    : "bg-slate-950 border-slate-800 text-slate-400"
                }`}
              >
                {highlightNrf2Panel ? "✓ Highlighting Marked" : "Show Marked Labels"}
              </button>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(z * 1.3, 18))}
                className="p-1.5 rounded bg-slate-950 border border-slate-800 text-slate-300 hover:text-white cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(z / 1.3, 0.6))}
                className="p-1.5 rounded bg-slate-950 border border-slate-800 text-slate-300 hover:text-white cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setZoom(1);
                  setOffsetX(0);
                  setOffsetY(0);
                }}
                className="p-1.5 rounded bg-slate-950 border border-slate-800 text-slate-300 hover:text-white cursor-pointer"
                title="Reset View"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div
            ref={volcanoWrapperRef}
            className="relative w-full h-[430px] rounded-xl bg-slate-950/60 border border-slate-800/80 overflow-hidden"
          >
            <canvas
              ref={volcanoCanvasRef}
              onMouseDown={(e) => {
                setIsDragging(true);
                dragStart.current = { x: e.clientX, y: e.clientY };
              }}
              onMouseMove={(e) => {
                const canvas = volcanoCanvasRef.current;
                if (!canvas) return;
                if (isDragging) {
                  setOffsetX((p) => p + e.clientX - dragStart.current.x);
                  setOffsetY((p) => p + e.clientY - dragStart.current.y);
                  dragStart.current = { x: e.clientX, y: e.clientY };
                  setHoveredProtein(null);
                  return;
                }
                const rect = canvas.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;
                let best: { prot: CptacProteinRecord; d: number } | null = null;
                for (const pt of points) {
                  const sp = getScreenCoords(pt.x, pt.y);
                  const d = Math.hypot(sp.x - mx, sp.y - my);
                  if (d < 9 && (!best || d < best.d)) best = { prot: pt.prot, d };
                }
                setHoveredProtein(best ? best.prot : null);
                if (best) setTooltipPos({ x: mx, y: my });
              }}
              onMouseUp={() => setIsDragging(false)}
              onMouseLeave={() => {
                setIsDragging(false);
                setHoveredProtein(null);
              }}
              onWheel={(e) => {
                e.preventDefault();
                setZoom((z) => Math.max(0.6, Math.min(18, z * (e.deltaY > 0 ? 0.9 : 1.1))));
              }}
              onClick={() => {
                if (hoveredProtein && !isDragging) onSelectGene(hoveredProtein.g);
              }}
              className="absolute inset-0 w-full h-full block cursor-crosshair"
            />
            {hoveredProtein && (
              <div
                className="absolute z-40 pointer-events-none bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs font-mono shadow-2xl space-y-0.5"
                style={{
                  left: Math.min(tooltipPos.x + 12, volcanoDim.width - 220),
                  top: Math.max(8, tooltipPos.y - 60),
                }}
              >
                <div className="font-bold text-teal-400 text-sm">{hoveredProtein.g}</div>
                <div className="text-slate-200">
                  log2FC: <span className="font-bold">{(hoveredProtein.log2FC ?? 0) >= 0 ? "+" : ""}{formatNum(hoveredProtein.log2FC, 4)}</span>
                </div>
                <div className="text-slate-300">MW p / FDR: {formatP(hoveredProtein.mwP)} / {formatP(hoveredProtein.mwQ)}</div>
                <div className="text-slate-300">Welch p / FDR: {formatP(hoveredProtein.welchP)} / {formatP(hoveredProtein.welchQ)}</div>
                <div className="text-slate-400">nT={hoveredProtein.nT} · nN={hoveredProtein.nN}</div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Per-Protein Tumor-vs-Normal Distribution (5 cols) */}
        <div className="xl:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-3 border-b border-slate-800/80">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-100">
                Per-Protein Distribution: <span className="text-teal-400 font-mono">{selectedGene}</span>
              </h3>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                {selectedDistribution?.mode === "mrna_fallback"
                  ? "Absent in TMT Proteomics — Showing Matched mRNA (140T vs 21N)"
                  : distPairedOnly
                  ? "Paired Tumor vs. Matched NAT Subset (n ≤ 67 pairs)"
                  : "All Tumors (n ≤ 140) vs. Normal Adjacent Tissues (n ≤ 75)"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-40">
                <SearchableGeneSelect
                  options={allSearchOptions}
                  value={selectedGene}
                  onChange={onSelectGene}
                  placeholder="Jump to gene..."
                />
              </div>
              <ExportButton
                disabled={!selectedDistribution}
                onExportCSV={() => {
                  if (!selectedDistribution) return;
                  exportToCSV({
                    filename: `CPTAC_PDAC_${selectedDistribution.gene}_Tumor_vs_Normal.csv`,
                    metadata: {
                      dataset: "CPTAC-PDAC (Cao et al. Cell 2021)",
                      module: "Tumor vs Normal Protein Abundance",
                      selectedGene: selectedDistribution.gene,
                    },
                    headers: ["Sample_ID", "Group", "Paired_NAT_Case", "Value", "Unit"],
                    rows: [
                      ...selectedDistribution.natSamples.map((s) => [s.id, "Normal Adjacent", s.paired ? "Yes" : "No", s.val, selectedDistribution.unit]),
                      ...selectedDistribution.tumorSamples.map((s) => [s.id, "Primary Tumor", s.paired ? "Yes" : "No", s.val, selectedDistribution.unit]),
                    ],
                  });
                }}
                onExportPNG={({ theme = "light" } = {}) => {
                  exportCanvasToPNG({
                    canvas: generateHighResDist(theme),
                    filename: `CPTAC_PDAC_${selectedDistribution?.gene || selectedGene}_Distribution.png`,
                    theme,
                  });
                }}
                onExportSVG={({ theme = "light" } = {}) => {
                  exportCanvasToSVG({
                    canvas: generateHighResDist(theme),
                    filename: `CPTAC_PDAC_${selectedDistribution?.gene || selectedGene}_Distribution.svg`,
                    theme,
                  });
                }}
              />
            </div>
          </div>

          {selectedDistribution?.mode === "mrna_fallback" && (
            <div className="mb-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex gap-2 text-xs text-amber-200 font-mono">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                <strong>Mass-Spec Detection Notice:</strong> <strong>{selectedDistribution.gene}</strong> is not quantified in the 11,662-protein CPTAC TMT global proteome (typical for labile TFs NFE2L2/HIF1A or hydrophobic transporter SLC7A11). Showing matched CPTAC RNA-seq Tumor (n=140) vs. NAT (n=21) instead.
              </span>
            </div>
          )}

          {selectedDistribution?.mode === "protein" && (
            <div className="flex items-center justify-between gap-2 mb-3 text-xs font-mono">
              <label className="inline-flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={distPairedOnly}
                  onChange={(e) => setDistPairedOnly(e.target.checked)}
                  className="accent-teal-500"
                />
                <span>Restrict to 67 Paired Tumor-NAT Cases</span>
              </label>
              {selectedDistribution.protRec?.pairedLog2FC !== null && selectedDistribution.protRec?.pairedLog2FC !== undefined && (
                <span className="text-slate-400">
                  Paired Δ={selectedDistribution.protRec.pairedLog2FC >= 0 ? "+" : ""}
                  {selectedDistribution.protRec.pairedLog2FC.toFixed(3)} (p={formatP(selectedDistribution.protRec.pairedP)})
                </span>
              )}
            </div>
          )}

          <div
            ref={distWrapperRef}
            className="relative w-full h-[360px] rounded-xl bg-slate-950/60 border border-slate-800/80 overflow-hidden flex items-center justify-center"
          >
            {!selectedDistribution ? (
              <span className="text-xs font-mono text-slate-400 p-6 text-center">
                {!protBuffer ? "Loading proteomics matrix..." : `No proteomics or mRNA abundance found for ${selectedGene}.`}
              </span>
            ) : (
              <canvas ref={distCanvasRef} className="absolute inset-0 w-full h-full block" />
            )}
          </div>

          {selectedDistribution && (
            <div className="grid grid-cols-3 gap-2.5 mt-3 text-xs font-mono">
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5">
                <span className="text-slate-400 block text-[10px]">log2FC (T vs N)</span>
                <span className={`font-bold text-sm ${selectedDistribution.log2FC >= 0 ? "text-red-400" : "text-blue-400"}`}>
                  {selectedDistribution.log2FC >= 0 ? "+" : ""}{selectedDistribution.log2FC.toFixed(3)}
                </span>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5">
                <span className="text-slate-400 block text-[10px]">MW p / BH FDR</span>
                <span className="font-bold text-slate-100 text-sm">
                  {formatP(selectedDistribution.mwP)}
                </span>
                <span className="block text-[10px] text-slate-400">q={formatP(selectedDistribution.mwQ)}</span>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5">
                <span className="text-slate-400 block text-[10px]">Welch p</span>
                <span className="font-bold text-slate-100 text-sm">
                  {formatP(selectedDistribution.welchP)}
                </span>
                <span className="block text-[10px] text-slate-400">nT={selectedDistribution.tumorSamples.length}, nN={selectedDistribution.natSamples.length}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom: Searchable / Sortable Differential Protein Statistics Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-4 pb-4 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-base sm:text-lg font-bold text-slate-100">
                  CPTAC-PDAC Protein Differential Abundance Table
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-teal-500/10 border border-teal-500/30 text-teal-300 text-xs font-mono font-semibold">
                  {processedRows.length.toLocaleString()} proteins
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Click any row to inspect Tumor vs. Normal distribution · Check rows to label on Volcano Plot or export to Heatmap/Survival
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono">
              <Filter className="w-3.5 h-3.5 text-teal-400" />
              <select
                value={tableFilter}
                onChange={(e) => setTableFilter(e.target.value as any)}
                className="bg-transparent text-teal-300 font-bold focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-slate-900">All Proteins (11,662)</option>
                <option value="sig" className="bg-slate-900">Significant (FDR&lt;0.05, |FC|≥{fcThreshold})</option>
                <option value="up" className="bg-slate-900">Upregulated in Tumor</option>
                <option value="down" className="bg-slate-900">Downregulated in Tumor</option>
              </select>
            </div>
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search protein symbol..."
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 mb-4 flex flex-wrap items-center justify-between gap-2.5 text-xs font-mono">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-400">Show</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-slate-200 font-bold"
            >
              {[12, 25, 50, 100].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setMarkedGenes(new Set(processedRows.slice(0, 25).map((r) => r.g)))}
              className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-teal-300 cursor-pointer"
            >
              Mark Top 25
            </button>
            {markedGenes.size > 0 && (
              <button
                type="button"
                onClick={() => setMarkedGenes(new Set())}
                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-rose-400 cursor-pointer"
              >
                Clear ({markedGenes.size})
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onSendToHeatmap && markedGenes.size > 0 && (
              <button
                type="button"
                onClick={() => onSendToHeatmap(Array.from(markedGenes).slice(0, 35))}
                className="px-3 py-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 font-semibold cursor-pointer"
              >
                Send to Heatmap ({Math.min(35, markedGenes.size)})
              </button>
            )}
            {onSendToSurvival && markedGenes.size > 0 && (
              <button
                type="button"
                onClick={() => onSendToSurvival(Array.from(markedGenes).slice(0, 35))}
                className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-semibold cursor-pointer"
              >
                Validate Survival ({Math.min(35, markedGenes.size)})
              </button>
            )}
            <ExportButton
              label="Export CSV"
              disabled={processedRows.length === 0}
              onExportCSV={() => {
                exportToCSV({
                  filename: "CPTAC_PDAC_Protein_Differential_Abundance.csv",
                  metadata: {
                    dataset: "CPTAC-PDAC (Cao et al. Cell 2021)",
                    module: "Tumor vs Normal Global Proteomics",
                    filters: `Filter=${tableFilter}, Search=${search || "None"}`,
                  },
                  headers: [
                    "Protein", "n_Tumor", "n_NAT", "Tumor_Mean", "NAT_Mean", "log2FC",
                    "MannWhitney_p", "MannWhitney_FDR", "Welch_p", "Welch_FDR",
                    "Paired67_log2FC", "Paired67_p", "mRNA_Prot_Pearson_r", "mRNA_Prot_Spearman_rho", "Cox_OS_HR", "Cox_OS_p",
                  ],
                  rows: processedRows.map((d) => [
                    d.g, d.nT, d.nN, d.tMean, d.nMean, d.log2FC,
                    d.mwP, d.mwQ, d.welchP, d.welchQ,
                    d.pairedLog2FC, d.pairedP, d.r, d.rho, d.coxHR, d.coxP,
                  ]),
                });
              }}
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/90 text-slate-400 font-mono uppercase text-[11px] select-none">
                <th className="p-3 w-10 text-center">Mark</th>
                <th onClick={() => handleSort("g")} className="p-3 cursor-pointer hover:text-slate-100">
                  Protein {sortField === "g" && (sortDir === "asc" ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />)}
                </th>
                <th onClick={() => handleSort("nT")} className="p-3 text-center cursor-pointer hover:text-slate-100">n (T/N)</th>
                <th onClick={() => handleSort("tMean")} className="p-3 text-right cursor-pointer hover:text-slate-100">Tumor Mean</th>
                <th onClick={() => handleSort("nMean")} className="p-3 text-right cursor-pointer hover:text-slate-100">NAT Mean</th>
                <th onClick={() => handleSort("log2FC")} className="p-3 text-right cursor-pointer hover:text-slate-100">log2FC</th>
                <th onClick={() => handleSort("pVal")} className="p-3 text-right cursor-pointer hover:text-slate-100">
                  {statMethod === "mw" ? "MW p-val" : "Welch p-val"}
                </th>
                <th onClick={() => handleSort("qVal")} className="p-3 text-right cursor-pointer hover:text-slate-100">
                  {statMethod === "mw" ? "BH FDR q (MW)" : "BH FDR q (Welch)"}
                </th>
                <th onClick={() => handleSort("pairedLog2FC")} className="p-3 text-right cursor-pointer hover:text-slate-100">
                  Paired 67 Δ
                </th>
                <th onClick={() => handleSort("r")} className="p-3 text-right pr-4 cursor-pointer hover:text-slate-100">
                  mRNA-Prot r
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40 font-mono">
              {pagedRows.map((row) => {
                const isSelected = row.g.toUpperCase() === selectedGene.toUpperCase();
                const isMarked = markedGenes.has(row.g);
                const pVal = statMethod === "mw" ? row.mwP : row.welchP;
                const qVal = statMethod === "mw" ? row.mwQ : row.welchQ;
                const isUp = (row.log2FC ?? 0) > 0;
                return (
                  <tr
                    key={row.g}
                    onClick={() => onSelectGene(row.g)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? "bg-teal-950/40 border-l-4 border-l-teal-400" : "hover:bg-slate-900/60"
                    }`}
                  >
                    <td
                      className="p-2.5 text-center"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMarkedGenes((prev) => {
                          const next = new Set(prev);
                          if (next.has(row.g)) next.delete(row.g);
                          else next.add(row.g);
                          return next;
                        });
                      }}
                    >
                      {isMarked ? (
                        <CheckSquare className="w-4 h-4 text-amber-400 inline" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-600 inline" />
                      )}
                    </td>
                    <td className="p-2.5 font-bold text-teal-400">
                      {row.g}
                    </td>
                    <td className="p-2.5 text-center text-slate-400">{row.nT}/{row.nN}</td>
                    <td className="p-2.5 text-right text-slate-300">{formatNum(row.tMean, 2)}</td>
                    <td className="p-2.5 text-right text-slate-400">{formatNum(row.nMean, 2)}</td>
                    <td className="p-2.5 text-right">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-bold ${
                          isUp ? "bg-rose-500/10 text-rose-400" : "bg-sky-500/10 text-sky-400"
                        }`}
                      >
                        {row.log2FC !== null ? `${isUp ? "+" : ""}${row.log2FC.toFixed(3)}` : "N/A"}
                      </span>
                    </td>
                    <td className="p-2.5 text-right text-slate-300">{formatP(pVal)}</td>
                    <td className="p-2.5 text-right font-semibold text-slate-200">{formatP(qVal)}</td>
                    <td className="p-2.5 text-right text-slate-400">
                      {row.pairedLog2FC !== null ? `${row.pairedLog2FC >= 0 ? "+" : ""}${row.pairedLog2FC.toFixed(3)}` : "N/A"}
                    </td>
                    <td className="p-2.5 text-right pr-4 text-emerald-400 font-semibold">
                      {row.r !== null ? `${row.r >= 0 ? "+" : ""}${row.r.toFixed(3)}` : "N/A"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4 text-xs font-mono text-slate-400">
          <span>
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, processedRows.length)} of {processedRows.length.toLocaleString()}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 disabled:opacity-40 cursor-pointer flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <span className="px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-bold">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 disabled:opacity-40 cursor-pointer flex items-center gap-1"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
