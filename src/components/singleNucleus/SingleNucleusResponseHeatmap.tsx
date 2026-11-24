"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Flame,
  GitCompare,
  Plus,
  X,
  Info,
  Loader2,
  SlidersHorizontal,
  Sparkles,
  Filter,
} from "lucide-react";
import ExportButton from "../ExportButton";
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
  CellMeta,
  PathologicResponseGeneRow,
  PairedMalignantDuctalRow,
  computePathologicResponseRow,
  computePairedMalignantVsDuctal,
} from "@/utils/singleNucleusStats";

export interface SnGeneEntry {
  s: string;
  k: string;
  i: number;
  c?: number;
  o?: number;
  l?: number;
}

interface SingleNucleusResponseHeatmapProps {
  cells: CellMeta[];
  symbolMap: Map<string, SnGeneEntry>;
  geneSymbols: string[];
  loadGeneVector: (symbol: string) => Promise<Float32Array | null>;
  onSelectGeneForAtlas?: (symbol: string) => void;
}

type CompartmentId =
  | "Malignant"
  | "CD8_T"
  | "Macrophage"
  | "CAF"
  | "Ductal"
  | "Broad_Epithelial"
  | "Broad_Immune"
  | "Broad_Fibroblast";

interface CompartmentOption {
  id: CompartmentId;
  label: string;
  defaultMinNuc: number;
  filter: (c: CellMeta) => boolean;
}

const COMPARTMENT_OPTIONS: CompartmentOption[] = [
  { id: "Malignant", label: "Malignant Ductal (Level 2)", defaultMinNuc: 5, filter: (c) => c.level2 === "Malignant" },
  { id: "CD8_T", label: "CD8+ T Cells (Level 2)", defaultMinNuc: 3, filter: (c) => c.level2 === "CD8+ T" },
  { id: "Macrophage", label: "Macrophages (Level 2)", defaultMinNuc: 3, filter: (c) => c.level2 === "Macrophage" },
  { id: "CAF", label: "Cancer-Associated Fibroblasts (All CAF)", defaultMinNuc: 5, filter: (c) => c.level1 === "Cancer-associated fibroblast" },
  { id: "Ductal", label: "Non-Malignant Ductal (Level 2)", defaultMinNuc: 5, filter: (c) => c.level2 === "Ductal" },
  { id: "Broad_Epithelial", label: "Broad: Epithelial", defaultMinNuc: 5, filter: (c) => c.broad_celltype === "Epithelial" },
  { id: "Broad_Immune", label: "Broad: Immune", defaultMinNuc: 5, filter: (c) => c.broad_celltype === "Immune" },
  { id: "Broad_Fibroblast", label: "Broad: Fibroblast", defaultMinNuc: 5, filter: (c) => c.broad_celltype === "Fibroblast" },
];

type TreatmentRegimenId =
  | "ALL_TREATED"
  | "RT_CRT"
  | "CRT"
  | "RT_ONLY"
  | "CHEMO_BASED"
  | "CRTl"
  | "CRTn_IMMUNO"
  | "CRTx_GART";

interface TreatmentRegimenOption {
  id: TreatmentRegimenId;
  label: string;
  shortLabel: string;
  filter: (c: CellMeta) => boolean;
}

const TREATMENT_REGIMEN_OPTIONS: TreatmentRegimenOption[] = [
  {
    id: "ALL_TREATED",
    label: "All Treated Patients (n=25 · All Neoadjuvant Regimens)",
    shortLabel: "All Treated",
    filter: () => true,
  },
  {
    id: "RT_CRT",
    label: "RT / CRT Combined (n=15 · 14 Standard CRT + 1 RT Alone)",
    shortLabel: "RT / CRT",
    filter: (c) => ["CRT", "RT"].includes((c.treatment || "").trim()),
  },
  {
    id: "CRT",
    label: "Standard CRT Only [FOLFIRINOX + RT] (n=14)",
    shortLabel: "Standard CRT",
    filter: (c) => (c.treatment || "").trim() === "CRT",
  },
  {
    id: "RT_ONLY",
    label: "Radiation Alone [RT Only, No Chemo] (n=1)",
    shortLabel: "RT Alone",
    filter: (c) => (c.treatment || "").trim() === "RT",
  },
  {
    id: "CHEMO_BASED",
    label: "All Systemic Chemo + RT Regimens (n=24 · Excl. RT Alone)",
    shortLabel: "Systemic Chemo+RT",
    filter: (c) => (c.treatment || "").trim() !== "RT",
  },
  {
    id: "CRTl",
    label: "CRT + Losartan [Stroma-Modulating] (n=5)",
    shortLabel: "CRT + Losartan",
    filter: (c) => (c.treatment || "").trim() === "CRTl",
  },
  {
    id: "CRTn_IMMUNO",
    label: "CRT + Nivolumab [Immunotherapy] (n=2 · CRTn/CRTln)",
    shortLabel: "CRT + Nivolumab",
    filter: (c) => ["CRTn", "CRTln"].includes((c.treatment || "").trim()),
  },
  {
    id: "CRTx_GART",
    label: "Other Chemo-RT Regimens [CRTx / GART] (n=3)",
    shortLabel: "CRTx / GART",
    filter: (c) => ["CRTx", "GART"].includes((c.treatment || "").trim()),
  },
];

type PairedCohortId = "ALL_43" | "NAIVE_ONLY" | "ALL_TREATED" | "RT_CRT" | "CRT" | "CRTl";

const PAIRED_COHORT_OPTIONS: { id: PairedCohortId; label: string; shortLabel: string; filter?: (c: CellMeta) => boolean }[] = [
  { id: "ALL_43", label: "All Patients (n=43 · Naïve + Treated)", shortLabel: "All Patients" },
  {
    id: "NAIVE_ONLY",
    label: "Treatment-Naïve Only (n=18 · Untreated Baseline)",
    shortLabel: "Treatment-Naïve",
    filter: (c) => (c.pid || "").startsWith("U") || c.treatment === "Untreated",
  },
  {
    id: "ALL_TREATED",
    label: "All Treated Patients (n=25 · All Neoadjuvant Regimens)",
    shortLabel: "All Treated",
    filter: (c) => !((c.pid || "").startsWith("U") || c.treatment === "Untreated"),
  },
  {
    id: "RT_CRT",
    label: "RT / CRT Combined (n=15 · 14 Standard CRT + 1 RT)",
    shortLabel: "RT / CRT",
    filter: (c) => ["CRT", "RT"].includes((c.treatment || "").trim()),
  },
  {
    id: "CRT",
    label: "Standard CRT Only (n=14)",
    shortLabel: "Standard CRT",
    filter: (c) => (c.treatment || "").trim() === "CRT",
  },
  {
    id: "CRTl",
    label: "CRT + Losartan Only (n=5)",
    shortLabel: "CRT + Losartan",
    filter: (c) => (c.treatment || "").trim() === "CRTl",
  },
];

const GENE_PRESETS: { id: string; label: string; genes: string[] }[] = [
  {
    id: "serine_12",
    label: "Serine / 1C / AA Transporters (12-Gene)",
    genes: ["PHGDH", "PSAT1", "PSPH", "SHMT1", "SHMT2", "MTHFD1", "MTHFD2", "SLC1A5", "SLC1A4", "SLC7A5", "SLC38A1", "SLC38A2"],
  },
  {
    id: "resistance_axis",
    label: "Treatment Resistance Axis (Transport + ISR + Redox)",
    genes: ["SLC7A5", "SLC3A2", "SLC7A11", "SLC1A5", "SLC38A1", "SFXN1", "ATF4", "NFE2L2", "GPX4", "GLS", "PHGDH", "PSAT1"],
  },
  {
    id: "nrf2_ferroptosis",
    label: "NRF2 & Ferroptosis Defense",
    genes: ["NFE2L2", "NQO1", "HMOX1", "SLC7A11", "GPX4", "GCLC", "GCLM", "GSS", "TXNRD1"],
  },
  {
    id: "cd8_metabolic",
    label: "CD8+ T-Cell Metabolic & Effector",
    genes: ["SLC38A1", "SFXN1", "SLC7A5", "GLS", "SLC1A5", "PHGDH", "PSAT1", "PRF1", "GZMB", "TOX"],
  },
  {
    id: "pdac_lineage",
    label: "PDAC Subtype & Stroma",
    genes: ["KRT19", "EPCAM", "GATA6", "VIM", "COL1A1", "ACTA2", "MKI67", "HIF1A"],
  },
];

// YlOrRd color interpolation (0..1)
function ylOrRdColor(t: number): { bg: string; text: string } {
  const clamped = Math.max(0, Math.min(1, t));
  const stops: [number, number, number, number][] = [
    [0.0, 255, 255, 204],
    [0.25, 254, 217, 118],
    [0.5, 253, 141, 60],
    [0.75, 227, 26, 28],
    [1.0, 128, 0, 38],
  ];
  let i = 0;
  while (i < stops.length - 2 && clamped > stops[i + 1][0]) i++;
  const [t0, r0, g0, b0] = stops[i];
  const [t1, r1, g1, b1] = stops[i + 1];
  const f = (clamped - t0) / (t1 - t0 || 1);
  const r = Math.round(r0 + (r1 - r0) * f);
  const g = Math.round(g0 + (g1 - g0) * f);
  const b = Math.round(b0 + (b1 - b0) * f);
  return {
    bg: `rgb(${r}, ${g}, ${b})`,
    text: clamped > 0.62 ? "#ffffff" : "#0f172a",
  };
}

export default function SingleNucleusResponseHeatmap({
  cells,
  symbolMap,
  geneSymbols,
  loadGeneVector,
  onSelectGeneForAtlas,
}: SingleNucleusResponseHeatmapProps) {
  const [activePreset, setActivePreset] = useState<string>("resistance_axis");
  const [genes, setGenes] = useState<string[]>(GENE_PRESETS[1].genes);
  const [compartmentId, setCompartmentId] = useState<CompartmentId>("Malignant");
  const [treatmentRegimenId, setTreatmentRegimenId] = useState<TreatmentRegimenId>("ALL_TREATED");
  const [pairedCohortId, setPairedCohortId] = useState<PairedCohortId>("ALL_43");
  const [showNaiveBaseline, setShowNaiveBaseline] = useState<boolean>(true);
  const [minNuclei, setMinNuclei] = useState<number>(5);
  const [activeSubView, setActiveSubView] = useState<"response_heatmap" | "paired_ductal">("response_heatmap");

  const [geneInput, setGeneInput] = useState<string>("");
  const [showSuggest, setShowSuggest] = useState<boolean>(false);
  const [loadingGenes, setLoadingGenes] = useState<boolean>(false);
  const [geneVectors, setGeneVectors] = useState<Record<string, Float32Array>>({});
  const [selectedDetailGene, setSelectedDetailGene] = useState<string | null>(null);

  const compartment = useMemo(
    () => COMPARTMENT_OPTIONS.find((c) => c.id === compartmentId) || COMPARTMENT_OPTIONS[0],
    [compartmentId]
  );

  const treatmentRegimen = useMemo(
    () => TREATMENT_REGIMEN_OPTIONS.find((t) => t.id === treatmentRegimenId) || TREATMENT_REGIMEN_OPTIONS[0],
    [treatmentRegimenId]
  );

  const pairedCohort = useMemo(
    () => PAIRED_COHORT_OPTIONS.find((p) => p.id === pairedCohortId) || PAIRED_COHORT_OPTIONS[0],
    [pairedCohortId]
  );

  // Batch load binary vectors for any missing genes in the current panel
  useEffect(() => {
    let cancelled = false;
    const missing = genes.filter((g) => !geneVectors[g] && symbolMap.has(g.toUpperCase()));
    if (missing.length === 0) return;

    (async () => {
      setLoadingGenes(true);
      const loaded: Record<string, Float32Array> = {};
      await Promise.all(
        missing.map(async (g) => {
          const vec = await loadGeneVector(g);
          if (vec) loaded[g] = vec;
        })
      );
      if (!cancelled && Object.keys(loaded).length > 0) {
        setGeneVectors((prev) => ({ ...prev, ...loaded }));
      }
      if (!cancelled) setLoadingGenes(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [genes, geneVectors, symbolMap, loadGeneVector]);

  const suggestions = useMemo(() => {
    const q = geneInput.trim().toUpperCase();
    if (!q || q.includes(",") || q.includes(" ")) return [];
    const exact = geneSymbols.filter((s) => s.toUpperCase() === q);
    const prefix = geneSymbols.filter((s) => s.toUpperCase().startsWith(q) && s.toUpperCase() !== q);
    return [...exact, ...prefix].slice(0, 8);
  }, [geneInput, geneSymbols]);

  const handleAddGenes = useCallback(
    (raw: string) => {
      const tokens = raw
        .split(/[\s,;]+/)
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean);
      if (tokens.length === 0) return;

      const valid: string[] = [];
      for (const tok of tokens) {
        const entry = symbolMap.get(tok);
        if (entry && !genes.includes(entry.s) && !valid.includes(entry.s)) {
          valid.push(entry.s);
        }
      }
      if (valid.length > 0) {
        setActivePreset("custom");
        setGenes((prev) => [...prev, ...valid].slice(0, 30));
      }
      setGeneInput("");
      setShowSuggest(false);
    },
    [symbolMap, genes]
  );

  // Compute Pathologic Response rows (Naïve + Moderate vs. Minimal vs. Poor)
  const responseRows: PathologicResponseGeneRow[] = useMemo(() => {
    if (cells.length === 0) return [];
    return genes
      .filter((g) => !!geneVectors[g])
      .map((g) =>
        computePathologicResponseRow(
          g,
          geneVectors[g],
          cells,
          compartment.filter,
          minNuclei,
          treatmentRegimen.filter
        )
      );
  }, [genes, geneVectors, cells, compartment, minNuclei, treatmentRegimen]);

  // Compute Paired Within-Patient Malignant vs. Normal Ductal rows
  const pairedRows: PairedMalignantDuctalRow[] = useMemo(() => {
    if (cells.length === 0) return [];
    return genes
      .filter((g) => !!geneVectors[g])
      .map((g) =>
        computePairedMalignantVsDuctal(
          g,
          geneVectors[g],
          cells,
          Math.max(1, minNuclei),
          pairedCohort.filter
        )
      );
  }, [genes, geneVectors, cells, minNuclei, pairedCohort]);

  const groupHeaderCounts = useMemo(() => {
    const first = responseRows[0];
    return {
      naive: first?.naive.patientCount ?? 0,
      mod: first?.moderate.patientCount ?? 0,
      min: first?.minimal.patientCount ?? 0,
      poor: first?.poor.patientCount ?? 0,
    };
  }, [responseRows]);

  const pairedPatientN = pairedRows[0]?.pairedPatientCount ?? 0;

  // ── Export CSV handlers ────────────────────────────────────────────────────
  const handleExportResponseCSV = useCallback(() => {
    if (responseRows.length === 0) return;
    exportToCSV({
      filename: `GSE202051_Response_${treatmentRegimenId}_${compartmentId}_minNuc${minNuclei}.csv`,
      metadata: {
        dataset: "GSE202051 Single-Nucleus Atlas (Hwang et al., Nat Genet 2022)",
        module: "Pathologic Response Heatmap (Untreated vs. Moderate vs. Minimal vs. Poor)",
        treatmentRegimen: treatmentRegimen.label,
        compartment: compartment.label,
        minNucleiPerPatient: String(minNuclei),
      },
      headers: [
        "Gene",
        "Naive_Patients",
        "Naive_Mean",
        "Naive_SE",
        "Moderate_Patients",
        "Moderate_Mean",
        "Moderate_SE",
        "Moderate_PctPos",
        "Minimal_Patients",
        "Minimal_Mean",
        "Minimal_SE",
        "Minimal_PctPos",
        "Poor_Patients",
        "Poor_Mean",
        "Poor_SE",
        "Poor_PctPos",
        "Poor_vs_Moderate_log2FC",
        "Poor_vs_Moderate_MWU_p",
        "Poor_vs_Moderate_Welch_p",
      ],
      rows: responseRows.map((r) => [
        r.gene,
        r.naive.patientCount,
        r.naive.mean.toFixed(4),
        r.naive.se.toFixed(4),
        r.moderate.patientCount,
        r.moderate.mean.toFixed(4),
        r.moderate.se.toFixed(4),
        r.moderate.pctExpressing.toFixed(2),
        r.minimal.patientCount,
        r.minimal.mean.toFixed(4),
        r.minimal.se.toFixed(4),
        r.minimal.pctExpressing.toFixed(2),
        r.poor.patientCount,
        r.poor.mean.toFixed(4),
        r.poor.se.toFixed(4),
        r.poor.pctExpressing.toFixed(2),
        r.poorVsModLog2FC.toFixed(4),
        r.poorVsModPValue.toExponential(4),
        r.poorVsModWelchP.toExponential(4),
      ]),
    });
  }, [responseRows, treatmentRegimenId, treatmentRegimen.label, compartmentId, compartment.label, minNuclei]);

  const handleExportPairedCSV = useCallback(() => {
    if (pairedRows.length === 0) return;
    exportToCSV({
      filename: `GSE202051_Paired_Malignant_vs_NonMalignantDuctal_${pairedCohortId}_minNuc${minNuclei}.csv`,
      metadata: {
        dataset: "GSE202051 Single-Nucleus Atlas (Hwang et al., Nat Genet 2022)",
        module: "Within-Patient Paired Malignant vs. Non-Malignant Ductal",
        cohort: pairedCohort.label,
        matchedPatients: String(pairedPatientN),
        minNucleiPerCompartment: String(minNuclei),
      },
      headers: [
        "Gene",
        "Matched_Patients",
        "NonMalignant_Ductal_Mean",
        "Malignant_Mean",
        "log2FC_Mal_vs_Duct",
        "Patients_Mal_GT_Duct",
        "Wilcoxon_SignedRank_p",
      ],
      rows: pairedRows.map((r) => [
        r.gene,
        r.pairedPatientCount,
        r.ductalMean.toFixed(4),
        r.malignantMean.toFixed(4),
        r.log2FC.toFixed(4),
        `${r.upregulatedPatients}/${r.pairedPatientCount}`,
        r.pValueWilcoxon.toExponential(4),
      ]),
    });
  }, [pairedRows, pairedCohortId, pairedCohort.label, minNuclei, pairedPatientN]);

  // ── High-Res Publication Canvas (Response Heatmap) ─────────────────────────
  const generateResponseHeatmapCanvas = (theme: "light" | "dark" = "light", width: number = 2200): HTMLCanvasElement => {
    const nRows = Math.max(1, responseRows.length);
    const rowH = 92;
    const padTop = 210;
    const padBottom = 210;
    const height = padTop + nRows * rowH + padBottom;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;

    const isLight = theme === "light";
    ctx.fillStyle = isLight ? "#ffffff" : "#020617";
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.textAlign = "left";
    drawFittedText(
      ctx,
      `Pathologic Response Heatmap — ${treatmentRegimen.shortLabel} (${compartment.id})`,
      80,
      92,
      width - 160,
      60,
      "bold",
      PUB_FONT_SANS
    );
    ctx.fillStyle = isLight ? "#475569" : "#94a3b8";
    drawFittedText(
      ctx,
      `GSE202051 snRNA-seq · Patient pseudobulk (≥${minNuclei} nuc/pt) · Poor vs. Moderate Mann-Whitney U`,
      80,
      146,
      width - 160,
      36,
      "bold",
      PUB_FONT_NUM
    );

    const nCols = showNaiveBaseline ? 4 : 3;
    const leftX = 300;
    const colW = showNaiveBaseline ? 300 : 360;
    const pColX = leftX + colW * nCols + 40;
    const cols = showNaiveBaseline
      ? [
          `Naïve (n=${groupHeaderCounts.naive})`,
          `Moderate (n=${groupHeaderCounts.mod})`,
          `Minimal (n=${groupHeaderCounts.min})`,
          `Poor (n=${groupHeaderCounts.poor})`,
        ]
      : [
          `Moderate (n=${groupHeaderCounts.mod})`,
          `Minimal (n=${groupHeaderCounts.min})`,
          `Poor (n=${groupHeaderCounts.poor})`,
        ];

    responseRows.forEach((r, idx) => {
      const y = padTop + idx * rowH;
      ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
      ctx.font = `bold 38px ${PUB_FONT_NUM}`;
      ctx.textAlign = "right";
      ctx.fillText(r.gene, leftX - 26, y + rowH / 2 + 13);

      const vals = showNaiveBaseline
        ? [r.naive.mean, r.moderate.mean, r.minimal.mean, r.poor.mean]
        : [r.moderate.mean, r.minimal.mean, r.poor.mean];
      const scaleMax = showNaiveBaseline ? Math.max(r.rowMax, r.naive.mean, 1e-6) : r.rowMax;

      vals.forEach((v, cIdx) => {
        const ratio = scaleMax > 0 ? v / scaleMax : 0;
        const col = ylOrRdColor(ratio);
        const cx = leftX + cIdx * colW;
        ctx.fillStyle = col.bg;
        ctx.fillRect(cx, y, colW - 4, rowH - 4);
        ctx.fillStyle = col.text;
        ctx.font = `bold 35px ${PUB_FONT_NUM}`;
        ctx.textAlign = "center";
        ctx.fillText(v.toFixed(3), cx + colW / 2 - 2, y + rowH / 2 + 12);
      });

      const hasTest = r.moderate.patientCount >= 2 && r.poor.patientCount >= 2;
      const sig = hasTest && r.poorVsModPValue < 0.05;
      ctx.fillStyle = sig ? "#dc2626" : isLight ? "#475569" : "#94a3b8";
      ctx.font = `${sig ? "bold" : "normal"} 35px ${PUB_FONT_NUM}`;
      ctx.textAlign = "left";
      ctx.fillText(
        hasTest ? `p=${formatPublicationPValue(r.poorVsModPValue)}${sig ? " *" : ""}` : "n/a",
        pColX,
        y + rowH / 2 + 12
      );
    });

    const footY = padTop + nRows * rowH + 56;
    cols.forEach((label, cIdx) => {
      ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
      ctx.font = `bold 36px ${PUB_FONT_SANS}`;
      ctx.textAlign = "center";
      ctx.fillText(label, leftX + cIdx * colW + colW / 2, footY);
    });

    const barW = 520;
    const barH = 26;
    const barX = leftX + (colW * nCols - barW) / 2;
    const barY = footY + 56;
    const grad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
    grad.addColorStop(0.0, "rgb(255,255,204)");
    grad.addColorStop(0.35, "rgb(254,178,76)");
    grad.addColorStop(0.7, "rgb(227,26,28)");
    grad.addColorStop(1.0, "rgb(128,0,38)");
    ctx.fillStyle = grad;
    ctx.fillRect(barX, barY, barW, barH);
    ctx.strokeStyle = isLight ? "#334155" : "#94a3b8";
    ctx.lineWidth = 2;
    ctx.strokeRect(barX, barY, barW, barH);

    ctx.fillStyle = isLight ? "#334155" : "#cbd5e1";
    ctx.font = `bold 30px ${PUB_FONT_NUM}`;
    ctx.textAlign = "left";
    ctx.fillText("0.0 (Row Min)", barX, barY + 58);
    ctx.textAlign = "right";
    ctx.fillText("1.0 (Row Max)", barX + barW, barY + 58);

    return canvas;
  };

  // ── High-Res Publication Canvas (Paired Malignant vs. Normal Ductal) ───────
  const generatePairedCanvas = (theme: "light" | "dark" = "light", width: number = 2200): HTMLCanvasElement => {
    const nRows = Math.max(1, pairedRows.length);
    const rowH = 92;
    const padTop = 210;
    const padBottom = 160;
    const height = padTop + nRows * rowH + padBottom;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;

    const isLight = theme === "light";
    ctx.fillStyle = isLight ? "#ffffff" : "#020617";
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.textAlign = "left";
    drawFittedText(
      ctx,
      `Malignant vs. Paired Non-Malignant Ductal — ${pairedCohort.shortLabel} (n = ${pairedPatientN})`,
      80,
      92,
      width - 160,
      60,
      "bold",
      PUB_FONT_SANS
    );
    ctx.fillStyle = isLight ? "#475569" : "#94a3b8";
    drawFittedText(
      ctx,
      `GSE202051 within-patient paired Wilcoxon signed-rank · Eliminates bulk acinar confounding`,
      80,
      146,
      width - 160,
      36,
      "bold",
      PUB_FONT_NUM
    );

    const maxAbs = Math.max(...pairedRows.map((r) => Math.abs(r.log2FC)), 2.5) * 1.35;
    const plotLeft = 320;
    const plotRight = width - 120;
    const plotW = plotRight - plotLeft;
    const zeroX = plotLeft + plotW / 2;

    ctx.strokeStyle = isLight ? "#0f172a" : "#cbd5e1";
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 8]);
    ctx.beginPath();
    ctx.moveTo(zeroX, padTop - 20);
    ctx.lineTo(zeroX, padTop + nRows * rowH + 10);
    ctx.stroke();
    ctx.setLineDash([]);

    pairedRows.forEach((r, idx) => {
      const y = padTop + idx * rowH;
      const barH = 56;
      const barY = y + (rowH - barH) / 2;

      ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
      ctx.font = `bold 38px ${PUB_FONT_NUM}`;
      ctx.textAlign = "right";
      ctx.fillText(r.gene, plotLeft - 28, y + rowH / 2 + 13);

      const barW = (Math.abs(r.log2FC) / maxAbs) * (plotW / 2);
      const isUp = r.log2FC >= 0;
      ctx.fillStyle = r.pValueWilcoxon < 0.05 ? (isUp ? "#dc2626" : "#2563eb") : "#64748b";
      if (isUp) ctx.fillRect(zeroX, barY, barW, barH);
      else ctx.fillRect(zeroX - barW, barY, barW, barH);

      const sig = r.pValueWilcoxon < 0.001 ? "***" : r.pValueWilcoxon < 0.01 ? "**" : r.pValueWilcoxon < 0.05 ? "*" : "ns";
      const lbl = `${sig} (p=${formatPublicationPValue(r.pValueWilcoxon)}; ${r.upregulatedPatients}/${r.pairedPatientCount}↑)`;
      ctx.fillStyle = isLight ? "#1e293b" : "#e2e8f0";
      ctx.font = `bold 32px ${PUB_FONT_NUM}`;
      ctx.textAlign = isUp ? "left" : "right";
      ctx.fillText(lbl, isUp ? zeroX + barW + 18 : zeroX - barW - 18, y + rowH / 2 + 11);
    });

    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = `bold 38px ${PUB_FONT_SANS}`;
    ctx.textAlign = "center";
    ctx.fillText("log2 Fold Change (Malignant vs. Paired Non-Malignant Ductal)", zeroX, padTop + nRows * rowH + 85);

    return canvas;
  };

  const detailRow = useMemo(
    () => responseRows.find((r) => r.gene === selectedDetailGene) || null,
    [responseRows, selectedDetailGene]
  );

  return (
    <div className="flex flex-col gap-6 font-mono">
      {/* Control Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col gap-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <Flame className="w-5 h-5 text-rose-400" />
              <h2 className="text-base font-bold text-white">
                Treatment Response &amp; Paired Ductal Analysis (GSE202051)
              </h2>
              {loadingGenes && (
                <span className="inline-flex items-center gap-1.5 text-xxs px-2 py-0.5 rounded bg-teal-500/15 text-teal-300">
                  <Loader2 className="w-3 h-3 animate-spin" /> Loading chunks…
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Filter by All Treated or specific therapy regimens (Chemo+RT, Losartan, Nivolumab, RT alone) — or compare within-patient Malignant vs. Non-Malignant Ductal in Untreated or Treated cohorts.
            </p>
          </div>

          {/* Sub-view Switcher */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setActiveSubView("response_heatmap")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                activeSubView === "response_heatmap"
                  ? "bg-rose-500 text-white shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              Response Heatmap (Mod / Min / Poor)
            </button>
            <button
              onClick={() => setActiveSubView("paired_ductal")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                activeSubView === "paired_ductal"
                  ? "bg-teal-500 text-white shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <GitCompare className="w-3.5 h-3.5" />
              Paired Malignant vs. Non-Malignant Ductal
            </button>
          </div>
        </div>

        {/* Presets Row */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xxs uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Biological Gene Panel Presets
          </label>
          <div className="flex flex-wrap gap-1.5">
            {GENE_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setActivePreset(p.id);
                  setGenes(p.genes);
                  setSelectedDetailGene(null);
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] border transition cursor-pointer ${
                  activePreset === p.id
                    ? "bg-rose-500/20 border-rose-500/50 text-rose-200 font-bold"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Treatment Regimen + Compartment + Min Nuclei + Baseline Toggle + Export */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 items-end">
          {/* Treatment / Cohort Selector */}
          <div className="lg:col-span-4 flex flex-col gap-1.5">
            <label className="text-xxs uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-amber-400" />
              {activeSubView === "response_heatmap" ? "Treatment Selection" : "Patient Cohort"}
            </label>
            {activeSubView === "response_heatmap" ? (
              <select
                value={treatmentRegimenId}
                onChange={(e) => setTreatmentRegimenId(e.target.value as TreatmentRegimenId)}
                className="bg-slate-950 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-amber-500"
              >
                {TREATMENT_REGIMEN_OPTIONS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={pairedCohortId}
                onChange={(e) => setPairedCohortId(e.target.value as PairedCohortId)}
                className="bg-slate-950 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-teal-500"
              >
                {PAIRED_COHORT_OPTIONS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Compartment Selector */}
          <div className="lg:col-span-3 flex flex-col gap-1.5">
            <label className="text-xxs uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-teal-400" />
              Cell Compartment
            </label>
            <select
              value={compartmentId}
              disabled={activeSubView === "paired_ductal"}
              onChange={(e) => {
                const nextId = e.target.value as CompartmentId;
                setCompartmentId(nextId);
                const opt = COMPARTMENT_OPTIONS.find((c) => c.id === nextId);
                if (opt) setMinNuclei(opt.defaultMinNuc);
              }}
              className="bg-slate-950 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-teal-500 disabled:opacity-50"
            >
              {COMPARTMENT_OPTIONS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Min Nuclei Filter */}
          <div className="lg:col-span-2 flex flex-col gap-1.5">
            <label className="text-xxs uppercase tracking-wider text-slate-400">
              Min Nuclei / Pt
            </label>
            <select
              value={minNuclei}
              onChange={(e) => setMinNuclei(Number(e.target.value))}
              className="bg-slate-950 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-teal-500"
            >
              <option value={5}>≥ 5 nuclei</option>
              <option value={3}>≥ 3 nuclei</option>
              <option value={1}>≥ 1 nucleus (All)</option>
            </select>
          </div>

          {/* Show Naïve Baseline Checkbox + Export */}
          <div className="lg:col-span-3 flex items-center justify-between gap-2">
            {activeSubView === "response_heatmap" ? (
              <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showNaiveBaseline}
                  onChange={(e) => setShowNaiveBaseline(e.target.checked)}
                  className="accent-teal-500 w-3.5 h-3.5 rounded cursor-pointer"
                />
                <span>Show Naïve Col</span>
              </label>
            ) : (
              <span />
            )}

            {activeSubView === "response_heatmap" ? (
              <ExportButton
                disabled={responseRows.length === 0}
                onExportCSV={handleExportResponseCSV}
                onExportPNG={({ theme = "light" } = {}) => {
                  const canvas = generateResponseHeatmapCanvas(theme, 2200);
                  exportCanvasToPNG({
                    canvas,
                    filename: `GSE202051_Response_${treatmentRegimenId}_${compartmentId}.png`,
                    theme,
                  });
                }}
                onExportSVG={({ theme = "light" } = {}) => {
                  const canvas = generateResponseHeatmapCanvas(theme, 1600);
                  exportCanvasToSVG({
                    canvas,
                    filename: `GSE202051_Response_${treatmentRegimenId}_${compartmentId}.svg`,
                    theme,
                  });
                }}
              />
            ) : (
              <ExportButton
                disabled={pairedRows.length === 0}
                onExportCSV={handleExportPairedCSV}
                onExportPNG={({ theme = "light" } = {}) => {
                  const canvas = generatePairedCanvas(theme, 2200);
                  exportCanvasToPNG({
                    canvas,
                    filename: `GSE202051_Paired_Malignant_vs_NonMalignantDuctal_${pairedCohortId}.png`,
                    theme,
                  });
                }}
                onExportSVG={({ theme = "light" } = {}) => {
                  const canvas = generatePairedCanvas(theme, 1600);
                  exportCanvasToSVG({
                    canvas,
                    filename: `GSE202051_Paired_Malignant_vs_NonMalignantDuctal_${pairedCohortId}.svg`,
                    theme,
                  });
                }}
              />
            )}
          </div>
        </div>

        {/* Custom Gene Chips + Add Input */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/70">
          {genes.map((g) => (
            <span
              key={g}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-200"
            >
              <button
                onClick={() => onSelectGeneForAtlas?.(g)}
                title="View gene in UMAP Atlas"
                className="hover:text-teal-400 cursor-pointer font-bold"
              >
                {g}
              </button>
              <button
                onClick={() => {
                  setActivePreset("custom");
                  setGenes((prev) => prev.filter((x) => x !== g));
                }}
                className="text-slate-500 hover:text-rose-400 cursor-pointer"
                aria-label={`Remove ${g}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          <div className="relative">
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={geneInput}
                onChange={(e) => {
                  setGeneInput(e.target.value);
                  setShowSuggest(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (suggestions.length > 0) handleAddGenes(suggestions[0]);
                    else handleAddGenes(geneInput);
                  }
                  if (e.key === "Escape") setShowSuggest(false);
                }}
                placeholder="Add gene(s), e.g. SLC6A14, MTHFD1L…"
                className="w-56 px-2.5 py-1 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500"
              />
              <button
                onClick={() => handleAddGenes(geneInput)}
                className="px-2 py-1 rounded-lg bg-teal-500/20 border border-teal-500/40 text-teal-300 hover:bg-teal-500/30 text-xs flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
            {showSuggest && suggestions.length > 0 && (
              <div className="absolute z-50 left-0 right-0 mt-1 bg-slate-950 border border-slate-700 rounded-lg shadow-2xl max-h-44 overflow-y-auto">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleAddGenes(s)}
                    className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 cursor-pointer"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── SUB-VIEW 1: MODERATE vs MINIMAL vs POOR HEATMAP ─── */}
      {activeSubView === "response_heatmap" ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Pathologic Response Heatmap — <span className="text-amber-400">{treatmentRegimen.shortLabel}</span>{" "}
                  <span className="text-slate-500">·</span>{" "}
                  <span className="text-rose-400">{compartment.label}</span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Row-scaled patient pseudobulk means (log1p, ≥{minNuclei} nuclei/patient). Click any row to inspect patient-level values.
                </p>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <span>Row-scaled:</span>
                <div
                  className="w-24 h-2.5 rounded border border-slate-700"
                  style={{
                    background: "linear-gradient(to right, rgb(255,255,204), rgb(254,178,76), rgb(227,26,28), rgb(128,0,38))",
                  }}
                />
                <span>0 → 1</span>
              </div>
            </div>

            {responseRows.length === 0 ? (
              <div className="h-48 flex items-center justify-center border border-dashed border-slate-800 rounded-xl text-xs text-slate-500">
                {loadingGenes ? "Loading binary gene expression chunks…" : "Add at least one valid gene symbol to generate the response heatmap."}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-950 text-slate-300 border-b border-slate-800 text-[11px]">
                      <th className="p-3 text-left">Gene</th>
                      {showNaiveBaseline && (
                        <th className="p-3 text-center border-r border-slate-800">
                          Untreated
                          <span className="block text-[10px] text-teal-400 font-normal">Naïve (n={groupHeaderCounts.naive})</span>
                        </th>
                      )}
                      <th className="p-3 text-center">
                        Moderate
                        <span className="block text-[10px] text-emerald-400 font-normal">Sensitive (n={groupHeaderCounts.mod})</span>
                      </th>
                      <th className="p-3 text-center">
                        Minimal
                        <span className="block text-[10px] text-amber-400 font-normal">Intermediate (n={groupHeaderCounts.min})</span>
                      </th>
                      <th className="p-3 text-center">
                        Poor
                        <span className="block text-[10px] text-rose-400 font-normal">Resistant (n={groupHeaderCounts.poor})</span>
                      </th>
                      <th className="p-3 text-right">Poor vs. Mod log2FC</th>
                      <th className="p-3 text-right">MWU p-value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {responseRows.map((row) => {
                      const scaleMax = showNaiveBaseline ? Math.max(row.rowMax, row.naive.mean, 1e-6) : row.rowMax;
                      const cNaive = ylOrRdColor(row.naive.mean / scaleMax);
                      const cMod = ylOrRdColor(row.moderate.mean / scaleMax);
                      const cMin = ylOrRdColor(row.minimal.mean / scaleMax);
                      const cPoor = ylOrRdColor(row.poor.mean / scaleMax);
                      const hasTest = row.moderate.patientCount >= 2 && row.poor.patientCount >= 2;
                      const isSig = hasTest && row.poorVsModPValue < 0.05;
                      const isSelected = selectedDetailGene === row.gene;

                      return (
                        <tr
                          key={row.gene}
                          onClick={() => setSelectedDetailGene(isSelected ? null : row.gene)}
                          className={`cursor-pointer transition ${
                            isSelected ? "ring-1 ring-inset ring-teal-400 bg-slate-800/60" : "hover:bg-slate-800/30"
                          }`}
                        >
                          <td className="p-3 font-bold text-slate-100">{row.gene}</td>
                          {showNaiveBaseline && (
                            <td className="p-1.5 text-center border-r border-slate-800">
                              <div
                                className="rounded-md py-1.5 px-2 font-bold text-xs shadow-sm"
                                style={{ backgroundColor: cNaive.bg, color: cNaive.text }}
                                title={`Treatment-Naïve: mean=${row.naive.mean.toFixed(4)} ± ${row.naive.se.toFixed(4)}, %pos=${row.naive.pctExpressing.toFixed(1)}%`}
                              >
                                {row.naive.patientCount > 0 ? row.naive.mean.toFixed(3) : "—"}
                              </div>
                            </td>
                          )}
                          <td className="p-1.5 text-center">
                            <div
                              className="rounded-md py-1.5 px-2 font-bold text-xs shadow-sm"
                              style={{ backgroundColor: cMod.bg, color: cMod.text }}
                              title={`Moderate: mean=${row.moderate.mean.toFixed(4)} ± ${row.moderate.se.toFixed(4)}, %pos=${row.moderate.pctExpressing.toFixed(1)}%`}
                            >
                              {row.moderate.patientCount > 0 ? row.moderate.mean.toFixed(3) : "—"}
                            </div>
                          </td>
                          <td className="p-1.5 text-center">
                            <div
                              className="rounded-md py-1.5 px-2 font-bold text-xs shadow-sm"
                              style={{ backgroundColor: cMin.bg, color: cMin.text }}
                              title={`Minimal: mean=${row.minimal.mean.toFixed(4)} ± ${row.minimal.se.toFixed(4)}, %pos=${row.minimal.pctExpressing.toFixed(1)}%`}
                            >
                              {row.minimal.patientCount > 0 ? row.minimal.mean.toFixed(3) : "—"}
                            </div>
                          </td>
                          <td className="p-1.5 text-center">
                            <div
                              className="rounded-md py-1.5 px-2 font-bold text-xs shadow-sm"
                              style={{ backgroundColor: cPoor.bg, color: cPoor.text }}
                              title={`Poor: mean=${row.poor.mean.toFixed(4)} ± ${row.poor.se.toFixed(4)}, %pos=${row.poor.pctExpressing.toFixed(1)}%`}
                            >
                              {row.poor.patientCount > 0 ? row.poor.mean.toFixed(3) : "—"}
                            </div>
                          </td>
                          <td
                            className={`p-3 text-right font-bold ${
                              !hasTest
                                ? "text-slate-600"
                                : row.poorVsModLog2FC > 0
                                ? "text-rose-400"
                                : "text-sky-400"
                            }`}
                          >
                            {hasTest
                              ? `${row.poorVsModLog2FC > 0 ? "+" : ""}${row.poorVsModLog2FC.toFixed(2)}`
                              : "n/a"}
                          </td>
                          <td
                            className={`p-3 text-right font-bold ${
                              isSig ? "text-rose-400" : "text-slate-400 font-normal"
                            }`}
                          >
                            {hasTest ? `${formatPublicationPValue(row.poorVsModPValue)}${isSig ? " *" : ""}` : "n/a"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Right Sidebar: Selected Gene Patient-Level Inspector & Methods */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col gap-3">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-2">
                <Info className="w-4 h-4 text-teal-400" />
                Patient-Level Pseudobulk Inspector
              </h4>
              {detailRow ? (
                <div className="flex flex-col gap-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-base font-bold text-teal-400">{detailRow.gene}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      {detailRow.moderate.patientCount >= 2 && detailRow.poor.patientCount >= 2
                        ? `MWU p=${formatPublicationPValue(detailRow.poorVsModPValue)} · Welch p=${formatPublicationPValue(detailRow.poorVsModWelchP)}`
                        : "Insufficient subgroup n (<2)"}
                    </span>
                  </div>

                  {(
                    [
                      ...(showNaiveBaseline ? [{ label: "Treatment-Naïve (Baseline)", data: detailRow.naive, accent: "text-teal-400" }] : []),
                      { label: "Moderate (Sensitive)", data: detailRow.moderate, accent: "text-emerald-400" },
                      { label: "Minimal", data: detailRow.minimal, accent: "text-amber-400" },
                      { label: "Poor (Resistant)", data: detailRow.poor, accent: "text-rose-400" },
                    ] as const
                  ).map(({ label, data, accent }) => (
                    <div key={label} className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col gap-1.5">
                      <div className="flex justify-between items-center">
                        <span className={`font-bold ${accent}`}>{label}</span>
                        <span className="text-[11px] text-slate-400">
                          {data.patientCount > 0
                            ? `${data.mean.toFixed(3)} ± ${data.se.toFixed(3)} (${data.pctExpressing.toFixed(1)}% pos)`
                            : "n = 0"}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1 max-h-24 overflow-y-auto">
                        {data.patientValues.map((pv) => (
                          <span
                            key={pv.pid}
                            className="text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300"
                          >
                            <strong>{pv.pid}</strong>: {pv.mean.toFixed(3)} ({pv.nNuclei}n)
                          </span>
                        ))}
                        {data.patientValues.length === 0 && (
                          <span className="text-[10px] text-slate-500">No patients meet ≥{minNuclei} nuclei in {treatmentRegimen.shortLabel}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 leading-relaxed">
                  Click any gene row in the heatmap to inspect individual patient pseudobulk means, nucleus counts, and Welch/Mann-Whitney sensitivity statistics across Untreated, Moderate, Minimal, and Poor response groups.
                </p>
              )}
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 text-[11px] text-slate-400 leading-relaxed flex flex-col gap-2">
              <strong className="text-slate-200 text-xs">Cohort &amp; Regimen Provenance (Hwang et al., Nat Genet 2022)</strong>
              <p>
                GSE202051 includes <strong>18 Treatment-Naïve</strong> and <strong>25 Neoadjuvant-Treated</strong> PDAC resections across multiple therapeutic regimens: <strong>14 Standard CRT</strong> (FOLFIRINOX+RT), <strong>5 CRT+Losartan</strong> (stroma-modulating), <strong>2 CRT+Nivolumab</strong> (immunotherapy), <strong>3 CRTx/GART</strong> (alternative chemo-RT), and <strong>1 RT-alone</strong>.
              </p>
              <p>
                Researchers outside radiation oncology can use <strong>All Treated (n=25)</strong> with the <strong>Untreated (Naïve)</strong> baseline column, isolate systemic/immunotherapy/stromal regimens, or switch to <strong>Paired Malignant vs. Non-Malignant Ductal (Treatment-Naïve Only)</strong> for baseline tumor biology free of therapy effects.
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* ─── SUB-VIEW 2: PAIRED MALIGNANT VS NON-MALIGNANT DUCTAL ─── */
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white">
                Within-Patient Paired Malignant vs. Non-Malignant Ductal —{" "}
                <span className="text-teal-400">{pairedCohort.shortLabel}</span> (n = {pairedPatientN} Matched Patients)
              </h3>
              <p className="text-[11px] text-slate-400">
                Eliminates bulk GTEx exocrine acinar confounding by comparing Malignant vs. Intra-specimen Non-Malignant Ductal nuclei inside the same patients (paired Wilcoxon signed-rank).
              </p>
            </div>
          </div>

          {pairedRows.length === 0 || pairedPatientN === 0 ? (
            <div className="h-48 flex items-center justify-center border border-dashed border-slate-800 rounded-xl text-xs text-slate-500">
              No patients in &ldquo;{pairedCohort.shortLabel}&rdquo; meet ≥{minNuclei} nuclei in both Malignant and Non-Malignant Ductal compartments. Try lowering Min Nuclei / Pt to ≥3 or ≥1.
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {(() => {
                const maxAbs = Math.max(...pairedRows.map((r) => Math.abs(r.log2FC)), 2.5);
                return pairedRows.map((r) => {
                  const pct = Math.min(48, (Math.abs(r.log2FC) / maxAbs) * 48);
                  const isUp = r.log2FC >= 0;
                  const isSig = r.pValueWilcoxon < 0.05;
                  const sigLabel =
                    r.pValueWilcoxon < 0.001
                      ? "***"
                      : r.pValueWilcoxon < 0.01
                      ? "**"
                      : r.pValueWilcoxon < 0.05
                      ? "*"
                      : "ns";

                  return (
                    <div
                      key={r.gene}
                      className="grid grid-cols-12 items-center gap-3 bg-slate-950/70 border border-slate-800/80 rounded-xl px-4 py-2.5 text-xs"
                    >
                      <div className="col-span-2 font-bold text-slate-100">{r.gene}</div>
                      <div className="col-span-5 relative h-5 flex items-center">
                        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-600" />
                        <div
                          className={`absolute h-3.5 rounded ${
                            isSig
                              ? isUp
                                ? "bg-rose-500"
                                : "bg-sky-500"
                              : "bg-slate-600"
                          }`}
                          style={
                            isUp
                              ? { left: "50%", width: `${Math.max(1, pct)}%` }
                              : { right: "50%", width: `${Math.max(1, pct)}%` }
                          }
                        />
                      </div>
                      <div className="col-span-2 text-right text-[11px] text-slate-400">
                        {r.ductalMean.toFixed(3)} → <strong className="text-slate-200">{r.malignantMean.toFixed(3)}</strong>
                      </div>
                      <div
                        className={`col-span-1 text-right font-bold ${
                          isUp ? "text-rose-400" : "text-sky-400"
                        }`}
                      >
                        {isUp ? "+" : ""}
                        {r.log2FC.toFixed(2)}
                      </div>
                      <div
                        className={`col-span-2 text-right text-[11px] ${
                          isSig ? "text-amber-300 font-bold" : "text-slate-500"
                        }`}
                      >
                        {sigLabel} (p={formatPublicationPValue(r.pValueWilcoxon)}; {r.upregulatedPatients}/{r.pairedPatientCount}↑)
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
