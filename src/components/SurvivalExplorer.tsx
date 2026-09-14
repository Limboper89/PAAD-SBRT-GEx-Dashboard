"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  BarChart,
  Bar,
  Cell,
  Customized,
  ErrorBar,
} from "recharts";
import {
  Activity,
  Plus,
  X,
  RotateCcw,
  Info,
  Layers,
  Sparkles,
  HeartPulse,
} from "lucide-react";
import {
  MatchedSurvivalSample,
  SurvivalAnalysisResult,
  runCustomSurvivalAnalysis,
  SbrtSampleMetadata,
  SbrtResponseAnalysisResult,
  runSbrtResponseAnalysis,
} from "@/utils/survivalEngine";
import ExportButton from "@/components/ExportButton";
import {
  exportToCSV,
  exportCanvasToPNG,
  exportCanvasToSVG,
} from "@/utils/exportUtils";

interface SurvivalExplorerProps {
  basePath: string;
  activeStudy: string;
  allGenes: string[];
  tcgaGtexExpressions: ArrayBuffer | null;
  geneIndexLookup: Map<string, number>;
  sbrtExpressionData: {
    samples: string[];
    conditions: string[];
    expressions: { [gene: string]: number[] };
  } | null;
  onSelectGene?: (gene: string) => void;
}

const PRESET_SIGNATURES: {
  id: string;
  name: string;
  genes: string[];
  description: string;
  badge?: string;
}[] = [
  {
    id: "rsi_10gene",
    name: "10-Gene Radiosensitivity Index (RSI - Torres-Roca)",
    genes: ["AR", "ABL1", "STAT1", "JUN", "PRKCB", "HDAC1", "RELA", "IRF1", "SUMO1", "PAK2"],
    description: "Authentic Torres-Roca 10-gene intrinsic radiosensitivity model (Lancet Oncol 2009, Clin Cancer Res 2012/2015)",
    badge: "TORRES-ROCA RSI",
  },
  {
    id: "serine_transport",
    name: "Serine Transport Index",
    genes: ["SLC1A4", "SLC1A5", "SLC7A5", "SLC38A1", "SLC38A2"],
    description: "Neutral amino acid & serine membrane influx carriers in PDAC",
  },
  {
    id: "serine_biosynthesis",
    name: "Serine Biosynthesis (3-Gene)",
    genes: ["PHGDH", "PSAT1", "PSPH"],
    description: "Canonical de novo serine synthesis cascade enzymes",
  },
  {
    id: "serine_folate_7gene",
    name: "Serine/Folate Engine (7-Gene)",
    genes: ["PHGDH", "PSAT1", "PSPH", "SHMT1", "SHMT2", "MTHFD2", "MTHFD1L"],
    description: "Combined de novo serine synthesis and mitochondrial 1C folate metabolism",
  },
  {
    id: "nrf2_axis",
    name: "NRF2 Antioxidant Axis",
    genes: ["NFE2L2", "NQO1", "HMOX1", "GCLC", "GCLM", "TXNRD1"],
    description: "Master redox regulator and validated cytoprotective downstream targets",
  },
  {
    id: "cystine_transport",
    name: "Cystine / Ferroptosis Defense",
    genes: ["SLC7A11", "SLC3A2", "GPX4"],
    description: "System xc- cystine-glutamate antiporter and phospholipid hydroperoxide scavenger",
  },
  {
    id: "fibrotic_stroma",
    name: "Fibrotic Stroma / Desmoplasia",
    genes: ["COL1A1", "COL1A2", "COL3A1", "ACTA2"],
    description: "Pancreatic stellate cell activation and dense extracellular collagen matrix",
  },
];

export default function SurvivalExplorer({
  basePath,
  activeStudy,
  allGenes,
  tcgaGtexExpressions,
  geneIndexLookup,
  sbrtExpressionData,
  onSelectGene,
}: SurvivalExplorerProps) {
  // Cohort mode: default to sbrt if active study is GSE225767, else tcga
  const [cohortMode, setCohortMode] = useState<"sbrt" | "tcga">(
    activeStudy === "TCGA_GTEX" ? "tcga" : "sbrt"
  );

  // Sync cohort mode if user changes the global study dropdown
  useEffect(() => {
    if (activeStudy === "TCGA_GTEX") {
      setCohortMode("tcga");
    } else if (activeStudy === "GSE225767") {
      setCohortMode("sbrt");
    }
  }, [activeStudy]);

  // Selected genes state
  const [selectedGenes, setSelectedGenes] = useState<string[]>([
    "SLC1A4",
    "SLC1A5",
    "SLC7A5",
    "SLC38A1",
    "SLC38A2",
  ]);

  // Gene search state
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Stratification cutoff mode for TCGA KM
  const [stratMethod, setStratMethod] = useState<"median" | "quartile" | "tertile">("median");

  // Matched survival clinical records for TCGA
  const [tcgaSurvivalSamples, setTcgaSurvivalSamples] = useState<MatchedSurvivalSample[]>([]);
  const [isTcgaLoading, setIsTcgaLoading] = useState<boolean>(true);

  // SBRT metadata
  const [sbrtMetadata, setSbrtMetadata] = useState<SbrtSampleMetadata[]>([]);
  const [isSbrtMetaLoading, setIsSbrtMetaLoading] = useState<boolean>(true);

  // Fetch TCGA survival dataset
  useEffect(() => {
    async function loadMatchedSurvival() {
      try {
        setIsTcgaLoading(true);
        const res = await fetch(`${basePath}/data/tcga_gtex/tcga_survival_matched.json`);
        if (!res.ok) throw new Error("Failed to load TCGA survival records");
        const data: MatchedSurvivalSample[] = await res.json();
        setTcgaSurvivalSamples(data);
      } catch (err) {
        console.error("Error loading TCGA survival:", err);
      } finally {
        setIsTcgaLoading(false);
      }
    }
    loadMatchedSurvival();
  }, [basePath]);

  // Fetch SBRT sample metadata
  useEffect(() => {
    async function loadSbrtMetadata() {
      try {
        setIsSbrtMetaLoading(true);
        const res = await fetch(`${basePath}/data/gse225767_sample_metadata.json`);
        if (!res.ok) throw new Error("Failed to load SBRT metadata");
        const data: SbrtSampleMetadata[] = await res.json();
        setSbrtMetadata(data);
      } catch (err) {
        console.error("Error loading SBRT metadata:", err);
      } finally {
        setIsSbrtMetaLoading(false);
      }
    }
    loadSbrtMetadata();
  }, [basePath]);

  // Search suggestions
  const searchSuggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toUpperCase().trim();
    return allGenes
      .filter((g) => g.toUpperCase().includes(q) && !selectedGenes.includes(g))
      .slice(0, 30);
  }, [searchQuery, allGenes, selectedGenes]);

  const handleAddGene = (gene: string) => {
    if (!selectedGenes.includes(gene)) {
      setSelectedGenes((prev) => [...prev, gene]);
    }
    setSearchQuery("");
    setIsSearchOpen(false);
  };

  const handleRemoveGene = (gene: string) => {
    setSelectedGenes((prev) => prev.filter((g) => g !== gene));
  };

  const handleApplyPreset = (presetId: string) => {
    const preset = PRESET_SIGNATURES.find((p) => p.id === presetId);
    if (preset) {
      setSelectedGenes(preset.genes);
    }
  };

  // -------------------------------------------------------------
  // 1. SBRT Pathologic Response Calculation
  // -------------------------------------------------------------
  const sbrtResult: SbrtResponseAnalysisResult | null = useMemo(() => {
    if (
      !sbrtExpressionData ||
      sbrtMetadata.length === 0 ||
      selectedGenes.length === 0
    ) {
      return null;
    }

    try {
      const expressions = sbrtExpressionData.expressions;
      const validGeneMatrix: number[][] = [];

      for (const gene of selectedGenes) {
        if (expressions[gene] && expressions[gene].length === sbrtMetadata.length) {
          validGeneMatrix.push(expressions[gene]);
        }
      }

      if (validGeneMatrix.length === 0) return null;

      return runSbrtResponseAnalysis(sbrtMetadata, validGeneMatrix);
    } catch (err) {
      console.error("SBRT response analysis error:", err);
      return null;
    }
  }, [sbrtExpressionData, sbrtMetadata, selectedGenes]);

  // SBRT Bar Chart Data with error bars (SE = SD / sqrt(n))
  const sbrtBarChartData = useMemo(() => {
    if (!sbrtResult) return [];
    const { groups } = sbrtResult;

    return [
      {
        id: "Pre_NR",
        group: "Pre-SBRT (NR)",
        displayLabel: "Pre-SBRT (NR)\n(n=4)",
        timepoint: "Pre",
        response: "Non-Responder",
        mean: groups.Pre_NR.mean,
        sd: groups.Pre_NR.sd,
        se: groups.Pre_NR.n > 1 ? Number((groups.Pre_NR.sd / Math.sqrt(groups.Pre_NR.n)).toFixed(3)) : 0,
        n: groups.Pre_NR.n,
        color: "#f59e0b", // Warm Amber
      },
      {
        id: "Pre_R",
        group: "Pre-SBRT (R)",
        displayLabel: "Pre-SBRT (R)\n(n=11)",
        timepoint: "Pre",
        response: "Responder",
        mean: groups.Pre_R.mean,
        sd: groups.Pre_R.sd,
        se: groups.Pre_R.n > 1 ? Number((groups.Pre_R.sd / Math.sqrt(groups.Pre_R.n)).toFixed(3)) : 0,
        n: groups.Pre_R.n,
        color: "#10b981", // Emerald Green
      },
      {
        id: "Post_NR",
        group: "Post-SBRT (NR)",
        displayLabel: "Post-SBRT (NR)\n(n=5)",
        timepoint: "Post",
        response: "Non-Responder",
        mean: groups.Post_NR.mean,
        sd: groups.Post_NR.sd,
        se: groups.Post_NR.n > 1 ? Number((groups.Post_NR.sd / Math.sqrt(groups.Post_NR.n)).toFixed(3)) : 0,
        n: groups.Post_NR.n,
        color: "#ef4444", // Crimson Red
      },
      {
        id: "Post_R",
        group: "Post-SBRT (R)",
        displayLabel: "Post-SBRT (R)\n(n=15)",
        timepoint: "Post",
        response: "Responder",
        mean: groups.Post_R.mean,
        sd: groups.Post_R.sd,
        se: groups.Post_R.n > 1 ? Number((groups.Post_R.sd / Math.sqrt(groups.Post_R.n)).toFixed(3)) : 0,
        n: groups.Post_R.n,
        color: "#06b6d4", // Cyan/Teal
      },
    ];
  }, [sbrtResult]);

  // Export SBRT CSV
  const handleExportSbrtCSV = () => {
    if (!sbrtResult) return;
    const rows = sbrtResult.all_samples.map((s) => [
      s.sample_id,
      s.title,
      s.gsm,
      s.timepoint,
      s.response,
      s.score,
    ]);
    exportToCSV({
      filename: `GSE225767_SBRT_Response_${selectedGenes.join("_").slice(0, 35)}.csv`,
      metadata: {
        dataset: "GSE225767 (SBRT Pre vs Post)",
        module: "Pathologic Response Explorer (R vs NR)",
        genes: selectedGenes.join(", "),
      },
      headers: ["Sample_ID", "Sample_Title", "GSM_ID", "Timepoint", "Pathologic_Response", "Composite_Score"],
      rows,
    });
  };

  // -------------------------------------------------------------
  // Dedicated 2400px Publication-Grade Canvas Generator for SBRT Response
  // -------------------------------------------------------------
  const generateHighResSbrtResponseCanvas = (
    theme: "light" | "dark" = "light",
    size: number = 2400
  ): HTMLCanvasElement => {
    const offscreen = document.createElement("canvas");
    offscreen.width = size;
    offscreen.height = size;
    const ctx = offscreen.getContext("2d");
    if (!ctx || !sbrtResult) return offscreen;

    const isLight = theme === "light";

    // 1. Background
    ctx.fillStyle = isLight ? "#ffffff" : "#020617";
    ctx.fillRect(0, 0, size, size);

    // 2. Header
    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 60px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("GSE225767: SBRT Pathologic Treatment Response (R vs. NR)", 120, 100);

    ctx.fillStyle = isLight ? "#475569" : "#94a3b8";
    ctx.font = "bold 32px monospace";
    ctx.fillText(
      `Signature (${selectedGenes.length} genes): ${selectedGenes.join(", ")} · Neoadjuvant SBRT Cohort (N = 55)`,
      120,
      155
    );

    // 3. Layout Dimensions
    const padLeft = 280;
    const padRight = 120;
    const padTop = 320;
    const padBottom = 420; // Room for X labels, legend, trajectory
    const plotW = size - padLeft - padRight;
    const plotH = size - padTop - padBottom;

    // Collect all points and means to establish exact Y-scale
    const allPts = [
      ...sbrtResult.groups.Pre_NR.points.map((p) => p.score),
      ...sbrtResult.groups.Pre_R.points.map((p) => p.score),
      ...sbrtResult.groups.Post_NR.points.map((p) => p.score),
      ...sbrtResult.groups.Post_R.points.map((p) => p.score),
    ];

    const dataMin = Math.min(...allPts);
    const dataMax = Math.max(...allPts);
    const span = Math.max(dataMax - dataMin, 1.0);

    // Extend range with 30% top headroom for brackets
    const minY = Math.floor((dataMin - span * 0.12) * 10) / 10;
    const maxY = Math.ceil((dataMax + span * 0.32) * 10) / 10;

    const mapY = (val: number) => padTop + plotH - ((val - minY) / (maxY - minY)) * plotH;

    // 4. Gridlines & Y-Axis
    ctx.strokeStyle = isLight ? "rgba(226, 232, 240, 0.9)" : "rgba(30, 41, 59, 0.6)";
    ctx.lineWidth = 2;

    const numTicks = 6;
    const step = (maxY - minY) / numTicks;
    for (let i = 0; i <= numTicks; i++) {
      const val = minY + i * step;
      const py = mapY(val);

      ctx.beginPath();
      ctx.moveTo(padLeft, py);
      ctx.lineTo(padLeft + plotW, py);
      ctx.stroke();

      // Outer tick mark on Y-axis
      ctx.beginPath();
      ctx.moveTo(padLeft - 16, py);
      ctx.lineTo(padLeft, py);
      ctx.strokeStyle = isLight ? "#0f172a" : "#64748b";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = isLight ? "rgba(226, 232, 240, 0.9)" : "rgba(30, 41, 59, 0.6)";
      ctx.lineWidth = 2;

      ctx.fillStyle = isLight ? "#1e293b" : "#94a3b8";
      ctx.font = "bold 36px monospace";
      ctx.textAlign = "right";
      ctx.fillText(val.toFixed(2), padLeft - 26, py + 12);
    }

    // Zero baseline
    if (minY <= 0 && maxY >= 0) {
      const zeroY = mapY(0);
      ctx.strokeStyle = isLight ? "#64748b" : "#94a3b8";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(padLeft, zeroY);
      ctx.lineTo(padLeft + plotW, zeroY);
      ctx.stroke();
    }

    // Axes Box
    ctx.strokeStyle = isLight ? "#0f172a" : "#64748b";
    ctx.lineWidth = 4;
    ctx.strokeRect(padLeft, padTop, plotW, plotH);

    // Y-Axis Title
    ctx.save();
    ctx.translate(padLeft - 150, padTop + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 48px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      selectedGenes.length > 1 ? "Z-Score Composite Index (Mean ± SE)" : "Normalized Expression (log2)",
      0,
      0
    );
    ctx.restore();

    // 5. Draw 4 Columns with Bars, Error Bars, and Jitter Dots
    const groupData = [
      { id: "Pre_NR", label: "Pre-SBRT (NR)", sub: "(n = 4)", stats: sbrtResult.groups.Pre_NR, color: "#f59e0b" },
      { id: "Pre_R", label: "Pre-SBRT (R)", sub: "(n = 11)", stats: sbrtResult.groups.Pre_R, color: "#10b981" },
      { id: "Post_NR", label: "Post-SBRT (NR)", sub: "(n = 5)", stats: sbrtResult.groups.Post_NR, color: "#ef4444" },
      { id: "Post_R", label: "Post-SBRT (R)", sub: "(n = 15)", stats: sbrtResult.groups.Post_R, color: "#06b6d4" },
    ];

    const colW = plotW / 4;
    const barW = colW * 0.46;
    const zeroY = mapY(0);

    const colCenters: number[] = [];

    groupData.forEach((g, idx) => {
      const cx = padLeft + idx * colW + colW / 2;
      colCenters.push(cx);

      const meanVal = g.stats.mean;
      const seVal = g.stats.n > 1 ? g.stats.sd / Math.sqrt(g.stats.n) : 0;
      const meanY = mapY(meanVal);

      // Bar
      const barX = cx - barW / 2;
      const barTop = Math.min(zeroY, meanY);
      const barHeight = Math.abs(meanY - zeroY);

      ctx.fillStyle = g.color;
      ctx.fillRect(barX, barTop, barW, barHeight);

      ctx.strokeStyle = isLight ? "#0f172a" : "#ffffff";
      ctx.lineWidth = 3.5;
      ctx.strokeRect(barX, barTop, barW, barHeight);

      // Error Bar (Mean ± SE)
      const errTopY = mapY(meanVal + seVal);
      const errBottomY = mapY(meanVal - seVal);
      const capW = 34;

      ctx.strokeStyle = isLight ? "#0f172a" : "#ffffff";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx, errBottomY);
      ctx.lineTo(cx, errTopY);
      // Top cap
      ctx.moveTo(cx - capW / 2, errTopY);
      ctx.lineTo(cx + capW / 2, errTopY);
      // Bottom cap
      ctx.moveTo(cx - capW / 2, errBottomY);
      ctx.lineTo(cx + capW / 2, errBottomY);
      ctx.stroke();

      // Jitter Points
      g.stats.points.forEach((pt, ptIdx) => {
        const py = mapY(pt.score);
        const jitterOffset = ((ptIdx * 37) % 70) - 35;
        const jx = cx + jitterOffset;

        ctx.fillStyle = isLight ? "rgba(15, 23, 42, 0.70)" : "rgba(255, 255, 255, 0.85)";
        ctx.beginPath();
        ctx.arc(jx, py, 13, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = isLight ? "#ffffff" : "#020617";
        ctx.lineWidth = 3;
        ctx.stroke();
      });

      // Mean Numerical Label with clear backing
      ctx.save();
      const numStr = (meanVal >= 0 ? "+" : "") + meanVal.toFixed(2);
      ctx.font = "bold 36px monospace";
      ctx.textAlign = "center";
      const labelY = meanVal >= 0 ? errTopY - 22 : errBottomY + 44;
      const tw = ctx.measureText(numStr).width;
      ctx.fillStyle = isLight ? "#ffffff" : "#020617";
      ctx.fillRect(cx - tw / 2 - 8, labelY - 30, tw + 16, 38);
      ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
      ctx.fillText(numStr, cx, labelY);
      ctx.restore();

      // X-Axis Labels (Large & Crisp)
      ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
      ctx.font = "bold 42px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(g.label, cx, padTop + plotH + 56);

      ctx.fillStyle = isLight ? "#475569" : "#94a3b8";
      ctx.font = "bold 34px monospace";
      ctx.fillText(g.sub, cx, padTop + plotH + 104);
    });

    // 6. Publication Significance Brackets (The P-Values!)
    const formatPStr = (p: number) => {
      let mark = "ns";
      if (p < 0.001) mark = "***";
      else if (p < 0.01) mark = "**";
      else if (p < 0.05) mark = "*";
      else if (p < 0.10) mark = "trend";
      const pText = p < 0.001 ? "p < 0.001" : `p = ${p.toFixed(3)}`;
      return `${pText} (${mark})`;
    };

    const bracketY = padTop + 65;
    const tickH = 20;

    // Pre-SBRT Bracket (Col 0 to Col 1)
    const x0 = colCenters[0];
    const x1 = colCenters[1];
    const isPreSig = sbrtResult.pre_comparison.p_value < 0.05;
    const preP = formatPStr(sbrtResult.pre_comparison.p_value);

    ctx.strokeStyle = isPreSig ? "#059669" : (isLight ? "#0f172a" : "#cbd5e1");
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x0, bracketY + tickH);
    ctx.lineTo(x0, bracketY);
    ctx.lineTo(x1, bracketY);
    ctx.lineTo(x1, bracketY + tickH);
    ctx.stroke();

    ctx.fillStyle = isPreSig ? "#059669" : (isLight ? "#0f172a" : "#f8fafc");
    ctx.font = "bold 42px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(preP, (x0 + x1) / 2, bracketY - 16);

    // Post-SBRT Bracket (Col 2 to Col 3)
    const x2 = colCenters[2];
    const x3 = colCenters[3];
    const isPostSig = sbrtResult.post_comparison.p_value < 0.05;
    const postP = formatPStr(sbrtResult.post_comparison.p_value);

    ctx.strokeStyle = isPostSig ? "#0284c7" : (isLight ? "#0f172a" : "#cbd5e1");
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x2, bracketY + tickH);
    ctx.lineTo(x2, bracketY);
    ctx.lineTo(x3, bracketY);
    ctx.lineTo(x3, bracketY + tickH);
    ctx.stroke();

    ctx.fillStyle = isPostSig ? "#0284c7" : (isLight ? "#0f172a" : "#f8fafc");
    ctx.font = "bold 42px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(postP, (x2 + x3) / 2, bracketY - 16);

    // 7. Bottom Legend & Trajectory Panel (Zero plot occlusion)
    const panelTop = padTop + plotH + 160;
    ctx.strokeStyle = isLight ? "#cbd5e1" : "#334155";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(padLeft, panelTop);
    ctx.lineTo(padLeft + plotW, panelTop);
    ctx.stroke();

    // Legend Items
    const legItems = [
      { label: "Pre-SBRT NR", color: "#f59e0b", n: "n=4" },
      { label: "Pre-SBRT R", color: "#10b981", n: "n=11" },
      { label: "Post-SBRT NR", color: "#ef4444", n: "n=5" },
      { label: "Post-SBRT R", color: "#06b6d4", n: "n=15" },
    ];

    let legX = padLeft + 10;
    const legY = panelTop + 50;

    legItems.forEach((item) => {
      ctx.fillStyle = item.color;
      ctx.fillRect(legX, legY - 26, 32, 32);
      ctx.strokeStyle = isLight ? "#0f172a" : "#ffffff";
      ctx.lineWidth = 2.5;
      ctx.strokeRect(legX, legY - 26, 32, 32);

      ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
      ctx.font = "bold 34px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`${item.label} (${item.n})`, legX + 44, legY);

      legX += 360;
    });

    // Trajectory Summary (Clean bottom row)
    const trajY = panelTop + 120;
    ctx.fillStyle = isLight ? "#334155" : "#94a3b8";
    ctx.font = "bold 32px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Treatment Response Trajectory (Post vs. Pre):", padLeft + 10, trajY);

    ctx.font = "bold 32px monospace";
    ctx.fillStyle = isLight ? "#047857" : "#34d399";
    const deltaRStr = `${sbrtResult.delta_r.delta >= 0 ? "+" : ""}${sbrtResult.delta_r.delta.toFixed(2)}`;
    ctx.fillText(`• Responders: Δ = ${deltaRStr}`, padLeft + 780, trajY);

    ctx.fillStyle = isLight ? "#b91c1c" : "#f87171";
    const deltaNrStr = `${sbrtResult.delta_nr.delta >= 0 ? "+" : ""}${sbrtResult.delta_nr.delta.toFixed(2)}`;
    ctx.fillText(`• Non-Responders: Δ = ${deltaNrStr}`, padLeft + 1380, trajY);

    // Bottom citation watermark
    ctx.fillStyle = isLight ? "#94a3b8" : "#64748b";
    ctx.font = "bold 24px monospace";
    ctx.textAlign = "left";
    ctx.fillText("GSE225767 · Pancreatic Ductal Adenocarcinoma · Neoadjuvant SBRT Cohort", padLeft + 10, panelTop + 195);

    return offscreen;
  };

  // -------------------------------------------------------------
  // 2. TCGA Kaplan-Meier Survival Calculation
  // -------------------------------------------------------------
  const tcgaResult: SurvivalAnalysisResult | null = useMemo(() => {
    if (
      !tcgaGtexExpressions ||
      tcgaSurvivalSamples.length === 0 ||
      selectedGenes.length === 0
    ) {
      return null;
    }

    try {
      const geneExpressions: number[][] = [];
      for (const gene of selectedGenes) {
        const geneIdx = geneIndexLookup.get(gene);
        if (geneIdx === undefined) continue;

        const offset = geneIdx * 349 * 4;
        const fullFloatArray = new Float32Array(tcgaGtexExpressions, offset, 349);
        const tumorExprs = tcgaSurvivalSamples.map((s) => fullFloatArray[s.tumor_idx]);
        geneExpressions.push(tumorExprs);
      }

      if (geneExpressions.length === 0) return null;

      return runCustomSurvivalAnalysis(tcgaSurvivalSamples, geneExpressions, stratMethod);
    } catch (err) {
      console.error("TCGA survival calculation error:", err);
      return null;
    }
  }, [tcgaGtexExpressions, tcgaSurvivalSamples, selectedGenes, geneIndexLookup, stratMethod]);

  const tcgaKmChartData = useMemo(() => {
    if (!tcgaResult) return [];
    const { high_curve, low_curve } = tcgaResult;
    const times = Array.from(
      new Set([...high_curve.map((p) => p.time), ...low_curve.map((p) => p.time)])
    ).sort((a, b) => a - b);

    let lastHighS = 1.0;
    let lastLowS = 1.0;

    return times.map((t) => {
      const highPt = high_curve.find((p) => p.time === t);
      const lowPt = low_curve.find((p) => p.time === t);
      if (highPt) lastHighS = highPt.survival;
      if (lowPt) lastLowS = lowPt.survival;

      return {
        time: Number(t.toFixed(1)),
        high_survival: Number((lastHighS * 100).toFixed(1)),
        low_survival: Number((lastLowS * 100).toFixed(1)),
      };
    });
  }, [tcgaResult]);

  // Export TCGA CSV
  const handleExportTcgaCSV = () => {
    if (!tcgaResult) return;
    const rows = tcgaResult.patient_records.map((r) => [
      r.patient_id,
      r.sample_id,
      r.score,
      r.group,
      r.os_months,
      r.os_event,
    ]);
    exportToCSV({
      filename: `TCGA_PAAD_KM_Survival_${selectedGenes.join("_").slice(0, 35)}.csv`,
      metadata: {
        dataset: "TCGA-PAAD",
        module: "Kaplan-Meier Overall Survival",
        filters: `Stratification: ${stratMethod}`,
      },
      headers: ["Patient_ID", "Sample_ID", "Composite_Score", "Stratification_Group", "OS_Months", "OS_Event_Death"],
      rows,
    });
  };

  // -------------------------------------------------------------
  // Dedicated 2400px Publication-Grade Canvas Generator for Kaplan-Meier
  // -------------------------------------------------------------
  const generateHighResKmCanvas = (
    theme: "light" | "dark" = "light",
    size: number = 2400
  ): HTMLCanvasElement => {
    const offscreen = document.createElement("canvas");
    offscreen.width = size;
    offscreen.height = size;
    const ctx = offscreen.getContext("2d");
    if (!ctx || !tcgaResult) return offscreen;

    const isLight = theme === "light";

    // 1. Background
    ctx.fillStyle = isLight ? "#ffffff" : "#020617";
    ctx.fillRect(0, 0, size, size);

    // 2. Header
    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 60px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("TCGA-PAAD: Kaplan-Meier Overall Survival", 120, 100);

    ctx.fillStyle = isLight ? "#475569" : "#94a3b8";
    ctx.font = "bold 32px monospace";
    ctx.fillText(
      `Signature (${selectedGenes.length} genes): ${selectedGenes.join(", ")} · Stratification: ${stratMethod} (N = 177)`,
      120,
      155
    );

    // 3. Layout Dimensions
    const padLeft = 340;
    const padRight = 100;
    const padTop = 260;
    const padBottom = 580; // Ample room for numbers at risk table
    const plotW = size - padLeft - padRight;
    const plotH = size - padTop - padBottom;

    // Time domain
    const maxTime = Math.max(
      ...tcgaResult.high_curve.map((p) => p.time),
      ...tcgaResult.low_curve.map((p) => p.time)
    );
    const maxAxisTime = Math.ceil(maxTime / 12) * 12 || 72;

    const mapX = (t: number) => padLeft + (t / maxAxisTime) * plotW;
    const mapY = (s: number) => padTop + plotH - s * plotH;

    // 4. Gridlines & Ticks (0, 25, 50, 75, 100%)
    ctx.strokeStyle = isLight ? "rgba(226, 232, 240, 0.9)" : "rgba(30, 41, 59, 0.6)";
    ctx.lineWidth = 2;

    [0, 0.25, 0.5, 0.75, 1.0].forEach((prob) => {
      const py = mapY(prob);

      ctx.beginPath();
      ctx.moveTo(padLeft, py);
      ctx.lineTo(padLeft + plotW, py);
      ctx.stroke();

      // Outer tick on Y-axis
      ctx.beginPath();
      ctx.moveTo(padLeft - 16, py);
      ctx.lineTo(padLeft, py);
      ctx.strokeStyle = isLight ? "#0f172a" : "#64748b";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = isLight ? "rgba(226, 232, 240, 0.9)" : "rgba(30, 41, 59, 0.6)";
      ctx.lineWidth = 2;

      ctx.fillStyle = isLight ? "#1e293b" : "#94a3b8";
      ctx.font = "bold 38px monospace";
      ctx.textAlign = "right";
      ctx.fillText(`${Math.round(prob * 100)}%`, padLeft - 26, py + 13);
    });

    // 50% Median Survival Reference Dashed Line
    const medianY = mapY(0.5);
    ctx.strokeStyle = isLight ? "#64748b" : "#94a3b8";
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 10]);
    ctx.beginPath();
    ctx.moveTo(padLeft, medianY);
    ctx.lineTo(padLeft + plotW, medianY);
    ctx.stroke();
    ctx.setLineDash([]); // Reset

    // X-Axis Time Ticks
    const timeTicks = [0, 12, 24, 36, 48, 60, 72, 84].filter((t) => t <= maxAxisTime);
    timeTicks.forEach((t) => {
      const px = mapX(t);
      ctx.beginPath();
      ctx.moveTo(px, padTop);
      ctx.lineTo(px, padTop + plotH);
      ctx.stroke();

      // Outer tick on bottom axis
      ctx.beginPath();
      ctx.moveTo(px, padTop + plotH);
      ctx.lineTo(px, padTop + plotH + 16);
      ctx.strokeStyle = isLight ? "#0f172a" : "#64748b";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = isLight ? "rgba(226, 232, 240, 0.9)" : "rgba(30, 41, 59, 0.6)";
      ctx.lineWidth = 2;

      ctx.fillStyle = isLight ? "#1e293b" : "#94a3b8";
      ctx.font = "bold 38px monospace";
      ctx.textAlign = "center";
      ctx.fillText(`${t} mo`, px, padTop + plotH + 54);
    });

    // Axes Box
    ctx.strokeStyle = isLight ? "#0f172a" : "#64748b";
    ctx.lineWidth = 4;
    ctx.strokeRect(padLeft, padTop, plotW, plotH);

    // Y-Axis Title
    ctx.save();
    ctx.translate(padLeft - 150, padTop + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 48px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Overall Survival Probability (%)", 0, 0);
    ctx.restore();

    // X-Axis Title
    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 48px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Overall Survival Time (Months)", padLeft + plotW / 2, padTop + plotH + 118);

    // 5. Draw Stepped Curves (High = Crimson #d9534f, Low = Royal Blue #0275d8)
    const drawCurve = (curve: typeof tcgaResult.high_curve, color: string) => {
      if (curve.length === 0) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 7;
      ctx.beginPath();

      let lastX = mapX(curve[0].time);
      let lastY = mapY(curve[0].survival);
      ctx.moveTo(lastX, lastY);

      for (let i = 1; i < curve.length; i++) {
        const pt = curve[i];
        const curX = mapX(pt.time);
        const curY = mapY(pt.survival);

        ctx.lineTo(curX, lastY);
        ctx.lineTo(curX, curY);

        lastX = curX;
        lastY = curY;
      }
      ctx.stroke();

      // Censor vertical ticks
      ctx.lineWidth = 4;
      ctx.strokeStyle = color;
      curve.forEach((pt) => {
        if (pt.is_censor) {
          const cx = mapX(pt.time);
          const cy = mapY(pt.survival);
          ctx.beginPath();
          ctx.moveTo(cx, cy - 16);
          ctx.lineTo(cx, cy + 16);
          ctx.stroke();
        }
      });
    };

    drawCurve(tcgaResult.low_curve, "#0275d8");
    drawCurve(tcgaResult.high_curve, "#d9534f");

    // 6. In-Plot Publication Annotation Box (Top-Right) - Vertically Stacked to Prevent Any Overlap
    const annW = 760;
    const annH = 280;
    const annX = padLeft + plotW - annW - 30;
    const annY = padTop + 35;

    ctx.fillStyle = isLight ? "rgba(255, 255, 255, 0.98)" : "rgba(15, 23, 42, 0.98)";
    ctx.fillRect(annX, annY, annW, annH);
    ctx.strokeStyle = isLight ? "#cbd5e1" : "#334155";
    ctx.lineWidth = 3;
    ctx.strokeRect(annX, annY, annW, annH);

    const isSig = tcgaResult.logrank_p_value < 0.05;
    ctx.fillStyle = isSig ? "#059669" : (isLight ? "#0f172a" : "#f8fafc");
    ctx.font = "bold 40px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "left";
    const pStr =
      tcgaResult.logrank_p_value < 0.0001
        ? tcgaResult.logrank_p_value.toExponential(3)
        : tcgaResult.logrank_p_value.toFixed(4);
    ctx.fillText(`Log-Rank Test: p = ${pStr}${isSig ? " *" : " (ns)"}`, annX + 28, annY + 54);

    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 32px monospace";
    ctx.fillText(
      `Hazard Ratio (HR): ${tcgaResult.hazard_ratio.toFixed(2)} (95% CI: ${tcgaResult.hr_ci_lower.toFixed(2)} – ${tcgaResult.hr_ci_upper.toFixed(2)})`,
      annX + 28,
      annY + 114
    );

    const highMed = tcgaResult.high_median_os ? `${tcgaResult.high_median_os.toFixed(1)} mo` : "NR";
    const lowMed = tcgaResult.low_median_os ? `${tcgaResult.low_median_os.toFixed(1)} mo` : "NR";
    const highN = tcgaResult.high_n;
    const lowN = tcgaResult.low_n;

    // Stacked vertically for zero horizontal overlap
    ctx.font = "bold 32px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillStyle = "#d9534f";
    ctx.fillText(`• High Index: Median = ${highMed} (n = ${highN})`, annX + 28, annY + 174);

    ctx.fillStyle = "#0275d8";
    ctx.fillText(`• Low Index:  Median = ${lowMed} (n = ${lowN})`, annX + 28, annY + 232);

    // 7. Publication Numbers at Risk Table (Wide margin to prevent label overlap)
    const tableTop = padTop + plotH + 190;
    const rowH = 70;
    const tableLabelX = 60; // Clean left margin well separated from column 0 at padLeft

    ctx.strokeStyle = isLight ? "#cbd5e1" : "#334155";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(tableLabelX, tableTop);
    ctx.lineTo(padLeft + plotW, tableTop);
    ctx.stroke();

    // Table Header
    ctx.fillStyle = isLight ? "#334155" : "#94a3b8";
    ctx.font = "bold 36px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Time (Months)", tableLabelX, tableTop + 48);

    tcgaResult.risk_table.forEach((r) => {
      const rx = mapX(r.time);
      if (rx <= padLeft + plotW) {
        ctx.textAlign = "center";
        ctx.font = "bold 38px monospace";
        ctx.fillText(`${r.time}`, rx, tableTop + 48);
      }
    });

    // High Index Row
    const highRowY = tableTop + rowH;
    ctx.fillStyle = "#d9534f";
    ctx.font = "bold 36px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("High Index", tableLabelX, highRowY + 48);

    tcgaResult.risk_table.forEach((r) => {
      const rx = mapX(r.time);
      if (rx <= padLeft + plotW) {
        ctx.textAlign = "center";
        ctx.font = "bold 38px monospace";
        ctx.fillText(`${r.high_risk}`, rx, highRowY + 48);
      }
    });

    // Low Index Row
    const lowRowY = tableTop + rowH * 2;
    ctx.fillStyle = "#0275d8";
    ctx.font = "bold 36px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Low Index", tableLabelX, lowRowY + 48);

    tcgaResult.risk_table.forEach((r) => {
      const rx = mapX(r.time);
      if (rx <= padLeft + plotW) {
        ctx.textAlign = "center";
        ctx.font = "bold 38px monospace";
        ctx.fillText(`${r.low_risk}`, rx, lowRowY + 48);
      }
    });

    // Bottom subtle divider
    ctx.strokeStyle = isLight ? "#e2e8f0" : "#1e293b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tableLabelX, tableTop + rowH * 3 + 15);
    ctx.lineTo(padLeft + plotW, tableTop + rowH * 3 + 15);
    ctx.stroke();

    // Bottom citation watermark
    ctx.fillStyle = isLight ? "#94a3b8" : "#64748b";
    ctx.font = "bold 24px monospace";
    ctx.textAlign = "left";
    ctx.fillText("TCGA-PAAD · Pancreatic Adenocarcinoma · Primary Tumor Resection Cohort (n=177)", tableLabelX, tableTop + rowH * 3 + 55);

    return offscreen;
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Cohort Selection Switch */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-teal-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-teal-950/80 text-teal-400 border border-teal-800/50 flex items-center gap-1.5">
                <Activity className="w-4 h-4" />
                Clinical Outcomes & Treatment Response
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight">
              {cohortMode === "sbrt"
                ? "GSE225767: SBRT Pathologic Treatment Response (Responders vs. Non-Responders)"
                : "TCGA-PAAD: Overall Survival (Kaplan-Meier Curves)"}
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-3xl leading-relaxed">
              {cohortMode === "sbrt"
                ? "Evaluate pre-treatment biopsy and post-treatment surgical resection specimens stratified by Pathologic Treatment Response (R: Complete/Major Response ≤ 10% viable tumor vs. NR: Non-Response). Real-time composite scoring across custom gene signatures."
                : "Continuous Overall Survival (months to death) in TCGA-PAAD primary tumors (n=177). Dynamic multi-gene composite scoring, Mantel-Cox log-rank test, and Peto Hazard Ratio."}
            </p>
          </div>

          {/* Cohort Switch Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
            <button
              onClick={() => setCohortMode("sbrt")}
              className={`px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all ${
                cohortMode === "sbrt"
                  ? "bg-slate-900 text-teal-400 border border-slate-700 shadow-md"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Activity className="w-4 h-4 text-emerald-400" />
              <span>SBRT Response (GSE225767)</span>
              <span className="text-xs bg-slate-800/80 text-slate-300 px-2 py-0.5 rounded font-mono">
                n = 55
              </span>
            </button>

            <button
              onClick={() => setCohortMode("tcga")}
              className={`px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all ${
                cohortMode === "tcga"
                  ? "bg-slate-900 text-rose-400 border border-slate-700 shadow-md"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <HeartPulse className="w-4 h-4 text-rose-400" />
              <span>TCGA Survival (KM)</span>
              <span className="text-xs bg-slate-800/80 text-slate-300 px-2 py-0.5 rounded font-mono">
                n = 177
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Gene Signature Controls */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
        {/* Curated Presets */}
        <div>
          <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-300 mb-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Select Biological Gene Set:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESET_SIGNATURES.map((preset) => {
              const isPresetActive =
                preset.genes.length === selectedGenes.length &&
                preset.genes.every((g) => selectedGenes.includes(g));

              return (
                <button
                  key={preset.id}
                  onClick={() => handleApplyPreset(preset.id)}
                  className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all text-left flex items-center gap-1.5 shadow-sm border ${
                    isPresetActive
                      ? "bg-teal-500/20 border-teal-500/60 text-teal-200 font-bold ring-1 ring-teal-500/30"
                      : "bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300 hover:text-slate-100"
                  }`}
                  title={preset.description}
                >
                  {preset.badge && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono font-bold tracking-tight">
                      {preset.badge}
                    </span>
                  )}
                  <span>{preset.name}</span>
                  <span className="text-xs text-slate-500 font-mono">({preset.genes.length})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Gene Tags & Add Gene Search */}
        <div className="pt-2 border-t border-slate-800/80">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-semibold text-slate-200">
                Active Genes in Index ({selectedGenes.length}):
              </span>
              {selectedGenes.length > 0 && (
                <button
                  onClick={() => setSelectedGenes([])}
                  className="text-xs text-slate-500 hover:text-rose-400 transition-colors flex items-center gap-1 ml-2"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Clear All
                </button>
              )}
            </div>

            {/* If in TCGA mode: show stratification options */}
            {cohortMode === "tcga" && (
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm text-slate-400">Stratify By:</span>
                <div className="inline-flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs sm:text-sm">
                  <button
                    onClick={() => setStratMethod("median")}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                      stratMethod === "median"
                        ? "bg-teal-500 text-slate-950 font-bold shadow-sm"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Median (50/50)
                  </button>
                  <button
                    onClick={() => setStratMethod("quartile")}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                      stratMethod === "quartile"
                        ? "bg-teal-500 text-slate-950 font-bold shadow-sm"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                    title="Extreme Quartiles (Top 25% vs Bottom 25%)"
                  >
                    Quartiles (25/25)
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Active Tags */}
          <div className="flex flex-wrap items-center gap-2 p-2.5 bg-slate-950 rounded-xl border border-slate-800 min-h-[44px]">
            {selectedGenes.map((gene) => (
              <span
                key={gene}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700/80 text-teal-300 font-mono text-xs sm:text-sm font-medium shadow-sm"
              >
                <span>{gene}</span>
                <button
                  onClick={() => handleRemoveGene(gene)}
                  className="text-slate-400 hover:text-rose-400 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}

            {/* Search Input */}
            <div className="relative flex-1 min-w-[160px]">
              <div className="flex items-center gap-1.5 text-slate-400">
                <Plus className="w-4 h-4 text-slate-500" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Type any gene to add (e.g. SLC7A11, NQO1, COL1A1)..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setIsSearchOpen(true);
                  }}
                  onFocus={() => setIsSearchOpen(true)}
                  className="w-full bg-transparent text-xs sm:text-sm text-slate-200 placeholder-slate-600 focus:outline-none py-1"
                />
              </div>

              {isSearchOpen && searchSuggestions.length > 0 && (
                <div className="absolute left-0 top-full mt-1.5 w-64 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl z-50 max-h-48 overflow-y-auto py-1">
                  {searchSuggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleAddGene(s)}
                      className="w-full text-left px-3 py-1.5 text-xs sm:text-sm text-slate-300 hover:text-teal-300 hover:bg-slate-900 font-mono transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. COHORT-SPECIFIC VISUALIZATION & STATISTICS */}

      {selectedGenes.length === 0 ? (
        <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-2xl p-12 text-center text-slate-500">
          <Layers className="w-10 h-10 mx-auto mb-3 opacity-30 text-teal-400" />
          <h3 className="text-base font-semibold text-slate-300 mb-1">No Genes Selected</h3>
          <p className="text-xs sm:text-sm max-w-md mx-auto text-slate-500">
            Please choose a preset above or type a gene symbol to compute clinical treatment response.
          </p>
        </div>
      ) : cohortMode === "sbrt" ? (
        /* -------------------------------------------------------------
         * MODE A: SBRT Pathologic Treatment Response (GSE225767)
         * ------------------------------------------------------------- */
        !sbrtResult ? (
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-teal-400 mb-3" />
            <p className="text-sm font-medium">Computing SBRT pathologic response statistics...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Top Metric Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Pre-SBRT R vs NR */}
              <div
                className={`p-4 rounded-2xl border transition-all ${
                  sbrtResult.pre_comparison.p_value < 0.05
                    ? "bg-emerald-950/30 border-emerald-800/60"
                    : "bg-slate-900/80 border-slate-800"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs sm:text-sm text-slate-400 font-medium">Pre-SBRT (Biopsy)</span>
                  {sbrtResult.pre_comparison.p_value < 0.05 && (
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      p &lt; 0.05
                    </span>
                  )}
                </div>
                <div className="text-2xl font-bold font-mono text-slate-100">
                  p = {sbrtResult.pre_comparison.p_value < 0.001
                    ? sbrtResult.pre_comparison.p_value.toExponential(3)
                    : sbrtResult.pre_comparison.p_value.toFixed(4)}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Responders ({sbrtResult.groups.Pre_R.mean.toFixed(2)}) vs Non-Resp ({sbrtResult.groups.Pre_NR.mean.toFixed(2)})
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Δ = {sbrtResult.pre_comparison.diff.toFixed(2)} (t = {sbrtResult.pre_comparison.t_stat.toFixed(2)})
                </div>
              </div>

              {/* Post-SBRT R vs NR */}
              <div
                className={`p-4 rounded-2xl border transition-all ${
                  sbrtResult.post_comparison.p_value < 0.05
                    ? "bg-emerald-950/30 border-emerald-800/60"
                    : "bg-slate-900/80 border-slate-800"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs sm:text-sm text-slate-400 font-medium">Post-SBRT (Resection)</span>
                  {sbrtResult.post_comparison.p_value < 0.05 && (
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      p &lt; 0.05
                    </span>
                  )}
                </div>
                <div className="text-2xl font-bold font-mono text-slate-100">
                  p = {sbrtResult.post_comparison.p_value < 0.001
                    ? sbrtResult.post_comparison.p_value.toExponential(3)
                    : sbrtResult.post_comparison.p_value.toFixed(4)}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Responders ({sbrtResult.groups.Post_R.mean.toFixed(2)}) vs Non-Resp ({sbrtResult.groups.Post_NR.mean.toFixed(2)})
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Δ = {sbrtResult.post_comparison.diff.toFixed(2)} (t = {sbrtResult.post_comparison.t_stat.toFixed(2)})
                </div>
              </div>

              {/* Induction in Responders */}
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
                <span className="text-xs sm:text-sm text-slate-400 font-medium">Response Trajectory</span>
                <div className="text-2xl font-bold font-mono text-cyan-400 mt-1">
                  Δ = {sbrtResult.delta_r.delta > 0 ? `+${sbrtResult.delta_r.delta}` : sbrtResult.delta_r.delta}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Post-SBRT vs Pre-SBRT in Responders
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  From {sbrtResult.delta_r.mean_pre.toFixed(2)} to {sbrtResult.delta_r.mean_post.toFixed(2)}
                </div>
              </div>

              {/* Induction in Non-Responders */}
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
                <span className="text-xs sm:text-sm text-slate-400 font-medium">Resistance Trajectory</span>
                <div className="text-2xl font-bold font-mono text-amber-400 mt-1">
                  Δ = {sbrtResult.delta_nr.delta > 0 ? `+${sbrtResult.delta_nr.delta}` : sbrtResult.delta_nr.delta}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Post-SBRT vs Pre-SBRT in Non-Responders
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  From {sbrtResult.delta_nr.mean_pre.toFixed(2)} to {sbrtResult.delta_nr.mean_post.toFixed(2)}
                </div>
              </div>
            </div>

            {/* SBRT Publication-Standard Plot Card */}
            <div
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden"
            >
              {/* Card Header with Title & Export Button */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 pb-4 border-b border-slate-800/80">
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                    <span>Pathologic Treatment Response Distribution</span>
                    <span className="text-xs sm:text-sm font-normal text-slate-300">
                      ({selectedGenes.length === 1 ? selectedGenes[0] : `${selectedGenes.join(", ")} Composite Index`})
                    </span>
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
                    GSE225767: Pre-SBRT Biopsy vs. Post-SBRT Surgical Resection by Pathologic Response
                  </p>
                </div>

                {/* Standard BioPortal Export Suite Button - Canvas Rendered */}
                <ExportButton
                  label="Export Figure"
                  size="md"
                  onExportCSV={handleExportSbrtCSV}
                  onExportPNG={({ theme = "light" } = {}) => {
                    const canvas = generateHighResSbrtResponseCanvas(theme, 2400);
                    exportCanvasToPNG({
                      canvas,
                      filename: `GSE225767_SBRT_Response_${selectedGenes.join("_").slice(0, 35)}.png`,
                      theme,
                    });
                  }}
                  onExportSVG={({ theme = "light" } = {}) => {
                    const canvas = generateHighResSbrtResponseCanvas(theme, 2400);
                    exportCanvasToSVG({
                      canvas,
                      filename: `GSE225767_SBRT_Response_${selectedGenes.join("_").slice(0, 35)}.svg`,
                      theme,
                    });
                  }}
                />
              </div>

              {/* In-Plot Significance Info Banner */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4 px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs sm:text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-200">Baseline (Pre-SBRT):</span>
                  <span
                    className={`font-mono font-bold ${
                      sbrtResult.pre_comparison.p_value < 0.05 ? "text-emerald-400" : "text-slate-100"
                    }`}
                  >
                    p = {sbrtResult.pre_comparison.p_value.toFixed(4)}
                    {sbrtResult.pre_comparison.p_value < 0.05 ? " *" : " (ns)"}
                  </span>
                  <span className="text-slate-400 font-mono">| Δ = {sbrtResult.pre_comparison.diff.toFixed(2)}</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-200">Resection (Post-SBRT):</span>
                  <span
                    className={`font-mono font-bold ${
                      sbrtResult.post_comparison.p_value < 0.05 ? "text-cyan-400" : "text-slate-100"
                    }`}
                  >
                    p = {sbrtResult.post_comparison.p_value.toFixed(4)}
                    {sbrtResult.post_comparison.p_value < 0.05 ? " *" : " (ns)"}
                  </span>
                  <span className="text-slate-400 font-mono">| Δ = {sbrtResult.post_comparison.diff.toFixed(2)}</span>
                </div>
              </div>

              {/* Chart with P-Value Significance Brackets */}
              <div className="h-80 sm:h-96 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={sbrtBarChartData}
                    margin={{ top: 50, right: 30, left: 20, bottom: 25 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#475569" opacity={0.4} />
                    <XAxis
                      dataKey="group"
                      tick={{ fill: "#f1f5f9", fontSize: 13, fontWeight: 700 }}
                      tickLine={{ stroke: "#64748b" }}
                      axisLine={{ stroke: "#64748b", strokeWidth: 2 }}
                    />
                    <YAxis
                      tick={{ fill: "#f1f5f9", fontSize: 13, fontWeight: 600 }}
                      tickLine={{ stroke: "#64748b" }}
                      axisLine={{ stroke: "#64748b", strokeWidth: 2 }}
                      label={{
                        value:
                          selectedGenes.length > 1
                            ? "Z-Score Composite Index (Mean ± SD)"
                            : "Normalized Expression (log2)",
                        angle: -90,
                        position: "insideLeft",
                        offset: 0,
                        fill: "#f1f5f9",
                        fontSize: 14,
                        fontWeight: "bold",
                        style: { textAnchor: "middle" },
                      }}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const d = payload[0].payload;
                          return (
                            <div className="bg-slate-950 border border-slate-700 rounded-xl p-3.5 shadow-2xl text-xs sm:text-sm space-y-1.5 font-mono">
                              <div className="font-bold text-white text-sm border-b border-slate-800 pb-1">
                                {d.group}
                              </div>
                              <div className="text-slate-200">
                                Mean Index: <span className="font-bold text-teal-300">{d.mean}</span>
                              </div>
                              <div className="text-slate-300">
                                Standard Dev: <span>±{d.sd}</span>
                              </div>
                              <div className="text-slate-300">
                                Standard Error: <span>±{d.se}</span>
                              </div>
                              <div className="text-slate-300">
                                Cohort Count: <span className="text-white font-bold">n = {d.n}</span>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" strokeOpacity={0.8} />

                    {/* Vector Significance Bracket Layer */}
                    <Customized
                      component={(props: any) => {
                        const { width, height } = props;
                        if (!width || !height || !sbrtResult) return null;

                        const margin = { top: 50, right: 30, left: 20, bottom: 25 };
                        const plotWidth = width - margin.left - margin.right;
                        const colWidth = plotWidth / 4;

                        const x0 = margin.left + colWidth * 0.5;
                        const x1 = margin.left + colWidth * 1.5;
                        const x2 = margin.left + colWidth * 2.5;
                        const x3 = margin.left + colWidth * 3.5;

                        const bracketY = 26;
                        const tickH = 8;

                        const formatP = (p: number) => {
                          let mark = "ns";
                          if (p < 0.001) mark = "***";
                          else if (p < 0.01) mark = "**";
                          else if (p < 0.05) mark = "*";
                          else if (p < 0.1) mark = "trend";

                          const pStr = p < 0.001 ? "p < 0.001" : `p = ${p.toFixed(3)}`;
                          return `${pStr} ${mark !== "ns" ? mark : ""}`;
                        };

                        const preLabel = formatP(sbrtResult.pre_comparison.p_value);
                        const postLabel = formatP(sbrtResult.post_comparison.p_value);

                        const isPreSig = sbrtResult.pre_comparison.p_value < 0.05;
                        const isPostSig = sbrtResult.post_comparison.p_value < 0.05;

                        return (
                          <g className="publication-brackets">
                            {/* Pre-SBRT Bracket */}
                            <path
                              d={`M ${x0},${bracketY + tickH} L ${x0},${bracketY} L ${x1},${bracketY} L ${x1},${bracketY + tickH}`}
                              fill="none"
                              stroke={isPreSig ? "#10b981" : "#cbd5e1"}
                              strokeWidth={2.2}
                            />
                            <text
                              x={(x0 + x1) / 2}
                              y={bracketY - 7}
                              textAnchor="middle"
                              fill={isPreSig ? "#34d399" : "#ffffff"}
                              fontSize={14}
                              fontWeight="bold"
                              fontFamily="sans-serif"
                            >
                              {preLabel}
                            </text>

                            {/* Post-SBRT Bracket */}
                            <path
                              d={`M ${x2},${bracketY + tickH} L ${x2},${bracketY} L ${x3},${bracketY} L ${x3},${bracketY + tickH}`}
                              fill="none"
                              stroke={isPostSig ? "#38bdf8" : "#cbd5e1"}
                              strokeWidth={2.2}
                            />
                            <text
                              x={(x2 + x3) / 2}
                              y={bracketY - 7}
                              textAnchor="middle"
                              fill={isPostSig ? "#38bdf8" : "#ffffff"}
                              fontSize={14}
                              fontWeight="bold"
                              fontFamily="sans-serif"
                            >
                              {postLabel}
                            </text>
                          </g>
                        );
                      }}
                    />

                    <Bar dataKey="mean" radius={[6, 6, 0, 0]}>
                      <ErrorBar dataKey="se" width={8} strokeWidth={2.5} stroke="#ffffff" />
                      {sbrtBarChartData.map((entry) => (
                        <Cell key={entry.id} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Publication Legend & Sample Size Details */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-5 mt-3 border-t border-slate-800 text-xs sm:text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 rounded bg-amber-500 flex-shrink-0" />
                  <span className="text-white font-bold">Pre-SBRT NR</span>
                  <span className="text-slate-300 font-mono">(n=4)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 rounded bg-emerald-500 flex-shrink-0" />
                  <span className="text-white font-bold">Pre-SBRT R</span>
                  <span className="text-slate-300 font-mono">(n=11)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 rounded bg-red-500 flex-shrink-0" />
                  <span className="text-white font-bold">Post-SBRT NR</span>
                  <span className="text-slate-300 font-mono">(n=5)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 rounded bg-cyan-500 flex-shrink-0" />
                  <span className="text-white font-bold">Post-SBRT R</span>
                  <span className="text-slate-300 font-mono">(n=15)</span>
                </div>
              </div>
            </div>
          </div>
        )
      ) : (
        /* -------------------------------------------------------------
         * MODE B: TCGA-PAAD Kaplan-Meier Overall Survival
         * ------------------------------------------------------------- */
        !tcgaResult ? (
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-rose-400 mb-3" />
            <p className="text-sm font-medium">Computing Kaplan-Meier overall survival curves for TCGA-PAAD...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Top Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div
                className={`p-4 rounded-2xl border transition-all ${
                  tcgaResult.logrank_p_value < 0.05
                    ? "bg-emerald-950/30 border-emerald-800/60"
                    : "bg-slate-900/80 border-slate-800"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs sm:text-sm text-slate-400 font-medium">Mantel-Cox Log-Rank Test</span>
                  {tcgaResult.logrank_p_value < 0.05 && (
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      p &lt; 0.05
                    </span>
                  )}
                </div>
                <div className="text-2xl font-bold font-mono text-slate-100">
                  p = {tcgaResult.logrank_p_value < 0.0001
                    ? tcgaResult.logrank_p_value.toExponential(3)
                    : tcgaResult.logrank_p_value.toFixed(4)}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Chi-Square: {tcgaResult.logrank_chi2.toFixed(2)} (df = 1)
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
                <span className="text-xs sm:text-sm text-slate-400 font-medium">Peto Hazard Ratio (HR)</span>
                <div className="text-2xl font-bold font-mono text-slate-100 mt-1">
                  {tcgaResult.hazard_ratio.toFixed(2)}
                </div>
                <div className="text-xs text-slate-400 mt-1 font-mono">
                  95% CI: [{tcgaResult.hr_ci_lower.toFixed(2)} – {tcgaResult.hr_ci_upper.toFixed(2)}]
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
                <span className="text-xs sm:text-sm text-slate-400 font-medium">Median Survival Comparison</span>
                <div className="text-lg font-bold font-mono text-slate-100 mt-1 flex items-center justify-between">
                  <span className="text-red-400">
                    High: {tcgaResult.high_median_os ? `${tcgaResult.high_median_os.toFixed(1)} mo` : "NR"}
                  </span>
                  <span className="text-blue-400">
                    Low: {tcgaResult.low_median_os ? `${tcgaResult.low_median_os.toFixed(1)} mo` : "NR"}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-1 font-mono">
                  High: n={tcgaResult.high_n} ({tcgaResult.high_events} deaths) | Low: n={tcgaResult.low_n} ({tcgaResult.low_events} deaths)
                </div>
              </div>
            </div>

            {/* Publication KM Plot Card */}
            <div
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden"
            >
              {/* Header with Title & Export Button */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 pb-4 border-b border-slate-800/80">
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-white">
                    Kaplan-Meier Overall Survival Probability
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
                    TCGA-PAAD Cohort (n={tcgaSurvivalSamples.length}) | Stratification: {stratMethod} | Signature: {selectedGenes.join(", ")}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  {/* Legend */}
                  <div className="flex items-center gap-3 text-xs sm:text-sm font-semibold">
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-1 bg-red-500 rounded" />
                      <span className="text-red-400">High Index</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-1 bg-blue-500 rounded" />
                      <span className="text-blue-400">Low Index</span>
                    </div>
                  </div>

                  {/* Standard BioPortal Export Suite Button - Canvas Rendered */}
                  <ExportButton
                    label="Export Figure"
                    size="md"
                    onExportCSV={handleExportTcgaCSV}
                    onExportPNG={({ theme = "light" } = {}) => {
                      const canvas = generateHighResKmCanvas(theme, 2400);
                      exportCanvasToPNG({
                        canvas,
                        filename: `TCGA_PAAD_KM_Survival_${selectedGenes.join("_").slice(0, 35)}.png`,
                        theme,
                      });
                    }}
                    onExportSVG={({ theme = "light" } = {}) => {
                      const canvas = generateHighResKmCanvas(theme, 2400);
                      exportCanvasToSVG({
                        canvas,
                        filename: `TCGA_PAAD_KM_Survival_${selectedGenes.join("_").slice(0, 35)}.svg`,
                        theme,
                      });
                    }}
                  />
                </div>
              </div>

              {/* Chart with in-plot publication annotation card */}
              <div className="relative h-80 sm:h-96 w-full">
                {/* In-Plot Publication Box */}
                <div className="absolute top-2 right-4 bg-slate-950/95 border border-slate-700 rounded-xl p-3.5 shadow-2xl backdrop-blur-sm pointer-events-none text-xs sm:text-sm space-y-1.5 font-mono z-10">
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    <span>
                      Log-rank p ={" "}
                      {tcgaResult.logrank_p_value < 0.0001
                        ? tcgaResult.logrank_p_value.toExponential(3)
                        : tcgaResult.logrank_p_value.toFixed(4)}
                    </span>
                    {tcgaResult.logrank_p_value < 0.05 && (
                      <span className="text-xs font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-700">
                        p &lt; 0.05
                      </span>
                    )}
                  </div>
                  <div className="text-slate-100 font-semibold text-xs sm:text-sm">
                    Hazard Ratio: {tcgaResult.hazard_ratio.toFixed(2)} (95% CI: {tcgaResult.hr_ci_lower.toFixed(2)} – {tcgaResult.hr_ci_upper.toFixed(2)})
                  </div>
                  <div className="text-slate-300 pt-1 border-t border-slate-800 text-xs">
                    <span className="text-red-400 font-bold">High:</span> {tcgaResult.high_median_os ? `${tcgaResult.high_median_os.toFixed(1)} mo` : "NR"} (n={tcgaResult.high_n}) |{" "}
                    <span className="text-blue-400 font-bold">Low:</span> {tcgaResult.low_median_os ? `${tcgaResult.low_median_os.toFixed(1)} mo` : "NR"} (n={tcgaResult.low_n})
                  </div>
                </div>

                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={tcgaKmChartData}
                    margin={{ top: 15, right: 30, left: 20, bottom: 25 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#475569" opacity={0.4} />
                    <XAxis
                      dataKey="time"
                      type="number"
                      domain={[0, "dataMax"]}
                      tick={{ fill: "#f1f5f9", fontSize: 13, fontWeight: 600 }}
                      unit=" mo"
                      axisLine={{ stroke: "#64748b", strokeWidth: 2 }}
                      tickLine={{ stroke: "#64748b" }}
                      label={{
                        value: "Overall Survival Time (Months)",
                        position: "insideBottom",
                        offset: -12,
                        fill: "#f1f5f9",
                        fontSize: 14,
                        fontWeight: "bold",
                      }}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fill: "#f1f5f9", fontSize: 13, fontWeight: 600 }}
                      unit="%"
                      axisLine={{ stroke: "#64748b", strokeWidth: 2 }}
                      tickLine={{ stroke: "#64748b" }}
                      label={{
                        value: "Overall Survival Probability (%)",
                        angle: -90,
                        position: "insideLeft",
                        offset: -5,
                        fill: "#f1f5f9",
                        fontSize: 14,
                        fontWeight: "bold",
                        style: { textAnchor: "middle" },
                      }}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const d = payload[0].payload;
                          return (
                            <div className="bg-slate-950 border border-slate-700 rounded-xl p-3 shadow-2xl text-xs sm:text-sm space-y-1.5 font-mono">
                              <div className="font-bold text-white pb-1 border-b border-slate-800">
                                Time: {d.time} months
                              </div>
                              <div className="text-red-400 font-semibold">
                                High Score: <span className="font-bold">{d.high_survival}%</span>
                              </div>
                              <div className="text-blue-400 font-semibold">
                                Low Score: <span className="font-bold">{d.low_survival}%</span>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <ReferenceLine y={50} stroke="#94a3b8" strokeDasharray="3 3" strokeOpacity={0.8} />
                    <Line
                      type="stepAfter"
                      dataKey="high_survival"
                      name="High Score"
                      stroke="#ef4444"
                      strokeWidth={3}
                      dot={false}
                    />
                    <Line
                      type="stepAfter"
                      dataKey="low_survival"
                      name="Low Score"
                      stroke="#3b82f6"
                      strokeWidth={3}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Numbers at Risk Table */}
              <div className="mt-6 pt-4 border-t border-slate-800">
                <div className="text-xs sm:text-sm font-bold text-slate-100 mb-2">
                  Numbers at Risk:
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm font-mono">
                    <thead>
                      <tr className="text-slate-300 border-b border-slate-800 font-bold">
                        <th className="text-left py-1.5 pr-4">Time (Months)</th>
                        {tcgaResult.risk_table.map((row) => (
                          <th key={row.time} className="text-center py-1.5 px-3">
                            {row.time}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="text-white">
                        <td className="text-left py-1.5 text-red-400 font-bold pr-4">High Index</td>
                        {tcgaResult.risk_table.map((row) => (
                          <td key={row.time} className="text-center py-1.5 px-3 font-semibold">
                            {row.high_risk}
                          </td>
                        ))}
                      </tr>
                      <tr className="text-white">
                        <td className="text-left py-1.5 text-blue-400 font-bold pr-4">Low Index</td>
                        {tcgaResult.risk_table.map((row) => (
                          <td key={row.time} className="text-center py-1.5 px-3 font-semibold">
                            {row.low_risk}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}
