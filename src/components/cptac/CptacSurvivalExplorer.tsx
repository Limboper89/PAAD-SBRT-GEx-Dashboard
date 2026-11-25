"use client";

import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  Activity,
  ShieldAlert,
  Sparkles,
  Plus,
  X,
  Info,
  AlertTriangle,
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
  CptacSurvivalSample,
  CptacPreset,
} from "@/types/cptac";
import {
  PROT_SAMPLE_COLS,
  MRNA_SAMPLE_COLS,
  CURATED_20_NRF2_PANEL,
  sliceMatrixRow,
  computeCoxPH,
  computeMaxstatLau92PValue,
  erfcApprox,
  runCptacSurvivalAnalysis,
  CptacSurvivalResult,
} from "@/utils/cptacEngine";
import { findOptimalCutpoint } from "@/utils/survivalEngine";

interface CptacSurvivalExplorerProps {
  proteins: CptacProteinRecord[];
  mrnaOnly: CptacMrnaOnlyRecord[];
  protBuffer: ArrayBuffer | null;
  mrnaBuffer: ArrayBuffer | null;
  survivalSamples: CptacSurvivalSample[];
  excludedCases: Array<{
    case_id: string;
    follow_up_days: number | null;
    vital_status: string | null;
    lost_to_followup: string | null;
  }>;
  curatedPresets: CptacPreset[];
  survivalGenes: string[];
  onChangeSurvivalGenes: (genes: string[]) => void;
}

type OmicLayer = "protein" | "mrna";
type CohortScope = "all_134" | "pdac_129";
type StratMethod = "optimal" | "median" | "tertile" | "quartile";

interface GeneSurvivalRow {
  gene: string;
  quantified: boolean;
  n: number;
  events: number;
  coxHR: number | null;
  coxCiL: number | null;
  coxCiH: number | null;
  coxP: number | null;
  cIndex: number | null;
  optCutoff: number | null;
  optLogRankP: number | null;
  maxstatP: number | null;
}

export default function CptacSurvivalExplorer({
  proteins,
  mrnaOnly,
  protBuffer,
  mrnaBuffer,
  survivalSamples,
  excludedCases,
  curatedPresets,
  survivalGenes,
  onChangeSurvivalGenes,
}: CptacSurvivalExplorerProps) {
  const [omicLayer, setOmicLayer] = useState<OmicLayer>("protein");
  const [cohortScope, setCohortScope] = useState<CohortScope>("all_134");
  const [stratMethod, setStratMethod] = useState<StratMethod>("optimal");
  const [showCI, setShowCI] = useState<boolean>(true);
  const [showExcludedNote, setShowExcludedNote] = useState<boolean>(false);
  const [pasteInput, setPasteInput] = useState<string>("");

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

  const kmCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const kmWrapperRef = useRef<HTMLDivElement | null>(null);
  const [kmDim, setKmDim] = useState({ width: 680, height: 420 });

  useEffect(() => {
    if (!kmWrapperRef.current) return;
    const obs = new ResizeObserver((entries) => {
      for (const e of entries) {
        const nextW = Math.max(340, Math.round(e.contentRect.width));
        const nextH = Math.max(320, Math.round(e.contentRect.height));
        setKmDim((prev) =>
          prev.width === nextW && prev.height === nextH
            ? prev
            : { width: nextW, height: nextH }
        );
      }
    });
    obs.observe(kmWrapperRef.current);
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

  const allSearchOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of proteins) set.add(p.g);
    for (const m of mrnaOnly) set.add(m.g);
    return Array.from(set).sort();
  }, [proteins, mrnaOnly]);

  const filteredSurvivalSamples = useMemo(() => {
    if (cohortScope === "pdac_129") {
      return survivalSamples.filter((s) => s.histology === "PDAC");
    }
    return survivalSamples;
  }, [survivalSamples, cohortScope]);

  const getVectorForGene = (gene: string, omic: OmicLayer): number[] | null => {
    const key = gene.toUpperCase();
    const p = protLookup.get(key);
    if (omic === "protein") {
      if (!p || !protBuffer) return null;
      return sliceMatrixRow(protBuffer, p.pi, PROT_SAMPLE_COLS);
    }
    const mi = p?.mi ?? mrnaOnlyLookup.get(key)?.mi ?? null;
    if (mi === null || !mrnaBuffer) return null;
    return sliceMatrixRow(mrnaBuffer, mi, MRNA_SAMPLE_COLS);
  };

  // Composite signature analysis
  const { survivalResult, usedGenes, skippedProteinGenes } = useMemo(() => {
    const vectors: Array<{ gene: string; fullValues: number[] }> = [];
    const skipped: string[] = [];
    for (const g of survivalGenes) {
      const vec = getVectorForGene(g, omicLayer);
      if (vec) {
        vectors.push({ gene: g, fullValues: vec.slice(0, 140) });
      } else {
        skipped.push(g);
      }
    }
    const res: CptacSurvivalResult | null =
      vectors.length > 0
        ? runCptacSurvivalAnalysis(filteredSurvivalSamples, vectors, stratMethod)
        : null;
    return {
      survivalResult: res,
      usedGenes: vectors.map((v) => v.gene),
      skippedProteinGenes: skipped,
    };
  }, [
    survivalGenes,
    omicLayer,
    filteredSurvivalSamples,
    stratMethod,
    protBuffer,
    mrnaBuffer,
    protLookup,
    mrnaOnlyLookup,
  ]);

  // Individual gene-level Cox PH + Optimal Cutpoint + maxstat Lau92 breakdown across survivalGenes
  const geneBreakdownRows = useMemo<GeneSurvivalRow[]>(() => {
    return survivalGenes.map((gene) => {
      const vec = getVectorForGene(gene, omicLayer);
      if (!vec) {
        return {
          gene,
          quantified: false,
          n: 0,
          events: 0,
          coxHR: null,
          coxCiL: null,
          coxCiH: null,
          coxP: null,
          cIndex: null,
          optCutoff: null,
          optLogRankP: null,
          maxstatP: null,
        };
      }
      const durs: number[] = [];
      const evs: number[] = [];
      const vals: number[] = [];
      for (const s of filteredSurvivalSamples) {
        const v = vec[s.tumor_idx];
        if (Number.isFinite(v)) {
          durs.push(s.os_months);
          evs.push(s.os_event);
          vals.push(v);
        }
      }
      if (durs.length < 15) {
        return {
          gene,
          quantified: false,
          n: durs.length,
          events: evs.reduce((a, b) => a + b, 0),
          coxHR: null,
          coxCiL: null,
          coxCiH: null,
          coxP: null,
          cIndex: null,
          optCutoff: null,
          optLogRankP: null,
          maxstatP: null,
        };
      }
      const cox = computeCoxPH(durs, evs, vals, true);
      const opt = findOptimalCutpoint(durs, evs, vals, 0.15, 0.85);
      const optLogRankP = opt.chi2 > 0 ? Math.min(1.0, Math.max(1e-300, erfcApprox(Math.sqrt(opt.chi2 / 2.0)))) : 1.0;
      const maxstatP = computeMaxstatLau92PValue(opt.chi2, 0.15, 0.85);
      return {
        gene,
        quantified: true,
        n: durs.length,
        events: evs.reduce((a, b) => a + b, 0),
        coxHR: cox?.hr ?? null,
        coxCiL: cox?.ciLower ?? null,
        coxCiH: cox?.ciUpper ?? null,
        coxP: cox?.pValue ?? null,
        cIndex: cox?.cIndex ?? null,
        optCutoff: opt.cutoff,
        optLogRankP,
        maxstatP,
      };
    });
  }, [
    survivalGenes,
    omicLayer,
    filteredSurvivalSamples,
    protBuffer,
    mrnaBuffer,
    protLookup,
    mrnaOnlyLookup,
  ]);

  // Draw KM Curve + Optional Export Risk Table
  const drawKmToCtx = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    light: boolean,
    isPub: boolean = false
  ) => {
    if (!survivalResult) return;

    const pad = isPub
      ? { top: 245, right: 90, bottom: 660, left: 320 }
      : { top: 28, right: 28, bottom: 50, left: 56 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    if (isPub) {
      ctx.fillStyle = light ? "#ffffff" : "#020617";
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = light ? "#0f172a" : "#f8fafc";
      ctx.textAlign = "left";
      const titleLabel =
        usedGenes.length === 1
          ? `Overall Survival: ${usedGenes[0]} (${
              omicLayer === "protein" ? "Protein" : "mRNA"
            })`
          : `Overall Survival: ${usedGenes.length}-Feature ${
              omicLayer === "protein" ? "Protein" : "mRNA"
            } Signature`;
      drawFittedText(ctx, titleLabel, 90, 110, w - 180, 100, "bold", PUB_FONT_SANS);

      ctx.fillStyle = light ? "#334155" : "#94a3b8";
      drawFittedText(
        ctx,
        `CPTAC-PDAC (Cao et al., Cell 2021) · ${
          cohortScope === "pdac_129" ? "PDAC Only (n=129)" : "All Valid OS (n=134)"
        } · ${stratMethod.toUpperCase()}`,
        90,
        180,
        w - 180,
        54,
        "bold",
        PUB_FONT_NUM
      );
    }

    const maxTime = Math.max(
      12,
      ...survivalResult.high_curve.map((p) => p.time),
      ...survivalResult.low_curve.map((p) => p.time)
    );
    const xMax = Math.ceil(maxTime / 6) * 6;
    const mapX = (t: number) => pad.left + (t / xMax) * plotW;
    const mapY = (s: number) => pad.top + plotH - s * plotH;

    // Gridlines
    ctx.font = isPub ? `bold 70px ${PUB_FONT_NUM}` : "11px sans-serif";
    const xStep = xMax > 36 ? 12 : 6;
    for (let t = 0; t <= xMax; t += xStep) {
      const px = mapX(t);
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
      ctx.fillText(`${t}`, px, pad.top + plotH + (isPub ? 84 : 18));
    }

    [0, 0.25, 0.5, 0.75, 1.0].forEach((sv) => {
      const py = mapY(sv);
      ctx.strokeStyle = light
        ? isPub
          ? "rgba(226,232,240,0.9)"
          : "rgba(100,116,139,0.16)"
        : "rgba(148,163,184,0.1)";
      ctx.lineWidth = isPub ? 2.5 : 1;
      ctx.beginPath();
      ctx.moveTo(pad.left, py);
      ctx.lineTo(pad.left + plotW, py);
      ctx.stroke();

      ctx.fillStyle = light ? "#1e293b" : "#94a3b8";
      ctx.textAlign = "right";
      ctx.fillText(
        `${Math.round(sv * 100)}%`,
        pad.left - (isPub ? 30 : 8),
        py + (isPub ? 24 : 4)
      );
    });

    // Plot Border
    ctx.strokeStyle = light ? (isPub ? "#0f172a" : "#475569") : "#64748b";
    ctx.lineWidth = isPub ? 6 : 1.2;
    ctx.strokeRect(pad.left, pad.top, plotW, plotH);

    // Axis titles
    ctx.fillStyle = light ? "#0f172a" : "#f8fafc";
    ctx.font = isPub ? `bold 84px ${PUB_FONT_SANS}` : "600 12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      "Overall Survival Time (Months)",
      pad.left + plotW / 2,
      pad.top + plotH + (isPub ? 190 : 38)
    );
    ctx.save();
    ctx.translate(isPub ? 92 : 16, pad.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Survival Probability (%)", 0, 0);
    ctx.restore();

    const drawStepCurve = (
      curve: CptacSurvivalResult["high_curve"],
      strokeColor: string,
      ciFill: string
    ) => {
      if (curve.length === 0) return;

      // 95% CI Ribbon (stepwise)
      if (showCI && curve.length > 1) {
        ctx.fillStyle = ciFill;
        ctx.beginPath();
        ctx.moveTo(mapX(curve[0].time), mapY(curve[0].ci_upper));
        for (let i = 1; i < curve.length; i++) {
          ctx.lineTo(mapX(curve[i].time), mapY(curve[i - 1].ci_upper));
          ctx.lineTo(mapX(curve[i].time), mapY(curve[i].ci_upper));
        }
        for (let i = curve.length - 1; i >= 0; i--) {
          if (i < curve.length - 1) {
            ctx.lineTo(mapX(curve[i + 1].time), mapY(curve[i].ci_lower));
          }
          ctx.lineTo(mapX(curve[i].time), mapY(curve[i].ci_lower));
        }
        ctx.closePath();
        ctx.fill();
      }

      // Main KM step curve
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = isPub ? 8 : 2.4;
      ctx.beginPath();
      ctx.moveTo(mapX(curve[0].time), mapY(curve[0].survival));
      for (let i = 1; i < curve.length; i++) {
        ctx.lineTo(mapX(curve[i].time), mapY(curve[i - 1].survival));
        ctx.lineTo(mapX(curve[i].time), mapY(curve[i].survival));
      }
      ctx.stroke();

      // Censor ticks
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = isPub ? 5 : 1.5;
      for (const pt of curve) {
        if (pt.n_censor > 0 || pt.is_censor) {
          const cx = mapX(pt.time);
          const cy = mapY(pt.survival);
          const tick = isPub ? 20 : 4;
          ctx.beginPath();
          ctx.moveTo(cx, cy - tick);
          ctx.lineTo(cx, cy + tick);
          ctx.stroke();
        }
      }
    };

    const highColor = light ? "#dc2626" : "#fb7185";
    const highCI = light ? "rgba(220,38,38,0.12)" : "rgba(251,113,133,0.16)";
    const lowColor = light ? "#0284c7" : "#38bdf8";
    const lowCI = light ? "rgba(2,132,199,0.12)" : "rgba(56,189,248,0.16)";

    drawStepCurve(survivalResult.low_curve, lowColor, lowCI);
    drawStepCurve(survivalResult.high_curve, highColor, highCI);

    // Legend & Statistics Box (GEPIA2-calibrated large text)
    const bw = isPub ? 1160 : 272;
    const bh = isPub ? 490 : 96;
    const bx = pad.left + plotW - bw - (isPub ? 32 : 13);
    const by = pad.top + (isPub ? 32 : 12);

    ctx.fillStyle = light ? "rgba(248,250,252,0.96)" : "rgba(11,19,41,0.94)";
    ctx.strokeStyle = light ? "#cbd5e1" : "#334155";
    ctx.lineWidth = isPub ? 3.5 : 1;
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeRect(bx, by, bw, bh);

    ctx.textAlign = "left";
    const lineX = bx + (isPub ? 36 : 10);
    const txtX = bx + (isPub ? 124 : 28);

    // High label
    ctx.strokeStyle = highColor;
    ctx.lineWidth = isPub ? 9 : 2.4;
    ctx.beginPath();
    ctx.moveTo(lineX, by + (isPub ? 72 : 17));
    ctx.lineTo(lineX + (isPub ? 68 : 13), by + (isPub ? 72 : 17));
    ctx.stroke();
    ctx.fillStyle = light ? "#0f172a" : "#f8fafc";
    if (isPub) {
      drawFittedText(
        ctx,
        `High (n=${survivalResult.high_n}, Med=${
          survivalResult.high_median_os !== null
            ? survivalResult.high_median_os.toFixed(1) + "m"
            : "NR"
        })`,
        txtX,
        by + 92,
        bw - 156,
        58,
        "bold",
        PUB_FONT_SANS,
        38
      );
    } else {
      ctx.font = "600 11px sans-serif";
      ctx.fillText(
        `High (n=${survivalResult.high_n}, Med=${
          survivalResult.high_median_os !== null
            ? survivalResult.high_median_os.toFixed(1) + "m"
            : "NR"
        })`,
        txtX,
        by + 20
      );
    }

    // Low label
    ctx.strokeStyle = lowColor;
    ctx.beginPath();
    ctx.moveTo(lineX, by + (isPub ? 156 : 35));
    ctx.lineTo(lineX + (isPub ? 68 : 13), by + (isPub ? 156 : 35));
    ctx.stroke();
    ctx.fillStyle = light ? "#0f172a" : "#f8fafc";
    if (isPub) {
      drawFittedText(
        ctx,
        `Low (n=${survivalResult.low_n}, Med=${
          survivalResult.low_median_os !== null
            ? survivalResult.low_median_os.toFixed(1) + "m"
            : "NR"
        })`,
        txtX,
        by + 176,
        bw - 156,
        58,
        "bold",
        PUB_FONT_SANS,
        38
      );
    } else {
      ctx.font = "600 11px sans-serif";
      ctx.fillText(
        `Low (n=${survivalResult.low_n}, Med=${
          survivalResult.low_median_os !== null
            ? survivalResult.low_median_os.toFixed(1) + "m"
            : "NR"
        })`,
        txtX,
        by + 38
      );
    }

    // Stat summary lines
    ctx.fillStyle = light ? "#334155" : "#cbd5e1";
    const lrStr = `Log-Rank p = ${formatPublicationPValue(survivalResult.logrank_p_value)}${
      survivalResult.maxstat_p_value !== undefined
        ? ` | maxstat p = ${formatPublicationPValue(survivalResult.maxstat_p_value)}`
        : ""
    }`;
    if (isPub) {
      drawFittedText(ctx, lrStr, lineX, by + 272, bw - 72, 54, "bold", PUB_FONT_NUM, 36);
      drawFittedText(
        ctx,
        `Group HR = ${survivalResult.hazard_ratio.toFixed(2)} (95% CI ${survivalResult.hr_ci_lower.toFixed(
          2
        )}–${survivalResult.hr_ci_upper.toFixed(2)})`,
        lineX,
        by + 356,
        bw - 72,
        54,
        "bold",
        PUB_FONT_NUM,
        36
      );
      if (survivalResult.cox_ph) {
        drawFittedText(
          ctx,
          `Cont. Cox HR = ${survivalResult.cox_ph.hr.toFixed(2)} (p = ${formatPublicationPValue(
            survivalResult.cox_ph.pValue
          )}) | C = ${survivalResult.cox_ph.cIndex.toFixed(3)}`,
          lineX,
          by + 440,
          bw - 72,
          54,
          "bold",
          PUB_FONT_NUM,
          36
        );
      }
    } else {
      ctx.font = "600 10.5px monospace";
      ctx.fillText(lrStr, lineX, by + 60);
      ctx.fillText(
        `Group HR = ${survivalResult.hazard_ratio.toFixed(2)} (${survivalResult.hr_ci_lower.toFixed(
          2
        )}–${survivalResult.hr_ci_upper.toFixed(2)})`,
        lineX,
        by + 76
      );
      if (survivalResult.cox_ph) {
        ctx.fillText(
          `Cont. Cox HR = ${survivalResult.cox_ph.hr.toFixed(2)} (${formatPublicationPValue(
            survivalResult.cox_ph.pValue
          )}) | C = ${survivalResult.cox_ph.cIndex.toFixed(3)}`,
          lineX,
          by + 91
        );
      }
    }

    // Embedded Numbers at Risk table for publication PNG/SVG export
    if (isPub) {
      const rtY = pad.top + plotH + 300;
      ctx.strokeStyle = light ? "#cbd5e1" : "#334155";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(90, rtY - 72);
      ctx.lineTo(w - 90, rtY - 72);
      ctx.stroke();

      ctx.fillStyle = light ? "#0f172a" : "#f8fafc";
      ctx.font = `bold 62px ${PUB_FONT_SANS}`;
      ctx.textAlign = "left";
      ctx.fillText("Number at Risk", 90, rtY);

      ctx.font = `bold 60px ${PUB_FONT_SANS}`;
      ctx.fillStyle = highColor;
      ctx.fillText("High", 90, rtY + 106);
      ctx.fillStyle = lowColor;
      ctx.fillText("Low", 90, rtY + 204);

      ctx.font = `bold 60px ${PUB_FONT_NUM}`;
      for (const row of survivalResult.risk_table) {
        const px = mapX(row.time);
        if (px <= pad.left + plotW + 10) {
          ctx.fillStyle = highColor;
          ctx.textAlign = "center";
          ctx.fillText(String(row.high_risk), px, rtY + 106);
          ctx.fillStyle = lowColor;
          ctx.fillText(String(row.low_risk), px, rtY + 204);
        }
      }
    }
  };

  useEffect(() => {
    const canvas = kmCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(kmDim.width * dpr);
    canvas.height = Math.round(kmDim.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, kmDim.width, kmDim.height);
    drawKmToCtx(ctx, kmDim.width, kmDim.height, isLightTheme, false);
  }, [survivalResult, kmDim, isLightTheme, showCI, omicLayer, cohortScope, stratMethod]);

  const renderPubKmCanvas = (light: boolean) => {
    const c = document.createElement("canvas");
    c.width = 2400;
    c.height = 2400;
    const ctx = c.getContext("2d");
    if (ctx) drawKmToCtx(ctx, 2400, 2400, light, true);
    return c;
  };

  return (
    <div className="space-y-6">
      {/* Survival Configuration Controls */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Activity className="w-4 h-4 text-rose-400" />
              CPTAC-PDAC Overall Survival Validation (Continuous Cox PH &amp; Optimal maxstat KM)
            </h3>
            <p className="text-xs text-slate-400">
              Evaluates both standardized continuous Cox Proportional Hazards (Efron ties) and Lausen &amp; Schumacher (1992) maximally selected rank statistics (<code className="text-sky-300">maxstat Lau92</code>).
            </p>
          </div>

          <button
            onClick={() => setShowExcludedNote((v) => !v)}
            className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 border border-slate-800 rounded-lg px-2.5 py-1 bg-slate-950"
          >
            <Info className="w-3.5 h-3.5 text-sky-400" />
            134 Valid OS ({excludedCases.length} excluded)
          </button>
        </div>

        {showExcludedNote && (
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-xs text-slate-300">
            <div className="font-semibold text-slate-200 mb-1">
              Excluded CPTAC Cases Without Positive OS Follow-Up (n={excludedCases.length} of 140):
            </div>
            <div className="flex flex-wrap gap-2 font-mono text-[11px] text-slate-400">
              {excludedCases.map((ex) => (
                <span
                  key={ex.case_id}
                  className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800"
                >
                  {ex.case_id} (days={ex.follow_up_days ?? "NA"}, status=
                  {ex.vital_status ?? "NA"})
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {/* Gene Adder */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
              Search &amp; Add Gene / Protein
            </label>
            <SearchableGeneSelect
              options={allSearchOptions}
              value=""
              onChange={(g) => {
                if (g && !survivalGenes.includes(g)) {
                  onChangeSurvivalGenes([...survivalGenes, g]);
                }
              }}
              placeholder="+ Add gene / protein to panel..."
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
              Paste Custom Gene List
            </label>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={pasteInput}
                onChange={(e) => setPasteInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && pasteInput.trim()) {
                    const tokens = pasteInput
                      .split(/[\s,;|\n\t]+/)
                      .map((s) => s.trim().toUpperCase())
                      .filter(Boolean);
                    if (tokens.length > 0) {
                      onChangeSurvivalGenes(Array.from(new Set([...survivalGenes, ...tokens])));
                      setPasteInput("");
                    }
                  }
                }}
                placeholder="e.g. KRAS, TP53, GATA6..."
                className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 font-mono"
              />
              <button
                type="button"
                onClick={() => {
                  const tokens = pasteInput
                    .split(/[\s,;|\n\t]+/)
                    .map((s) => s.trim().toUpperCase())
                    .filter(Boolean);
                  if (tokens.length > 0) {
                    onChangeSurvivalGenes(Array.from(new Set([...survivalGenes, ...tokens])));
                    setPasteInput("");
                  }
                }}
                className="px-2.5 py-1.5 rounded-lg bg-sky-600/25 border border-sky-500/40 text-sky-300 hover:bg-sky-600/40 text-xs font-semibold"
              >
                Add
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
              Omic Layer &amp; Clinical Cohort
            </label>
            <div className="flex gap-1.5">
              <select
                value={omicLayer}
                onChange={(e) => setOmicLayer(e.target.value as OmicLayer)}
                className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
              >
                <option value="protein">Global Protein</option>
                <option value="mrna">Matched mRNA</option>
              </select>
              <select
                value={cohortScope}
                onChange={(e) => setCohortScope(e.target.value as CohortScope)}
                className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
              >
                <option value="all_134">All OS (n=134)</option>
                <option value="pdac_129">PDAC Only (n=129)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
              KM Stratification Method
            </label>
            <select
              value={stratMethod}
              onChange={(e) => setStratMethod(e.target.value as StratMethod)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200"
            >
              <option value="optimal">Optimal Cutpoint (maxstat / Lau92)</option>
              <option value="median">Median Split (50% / 50%)</option>
              <option value="tertile">Tertiles (Top 33% vs Bottom 33%)</option>
              <option value="quartile">Quartiles (Q4 High vs Q1 Low)</option>
            </select>
          </div>
        </div>

        {/* Active Panel Chips */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] text-slate-400 mr-1">
            Active ({usedGenes.length} quantified in {omicLayer}):
          </span>
          {survivalGenes.map((g) => {
            const hasOmic = Boolean(getVectorForGene(g, omicLayer));
            return (
              <span
                key={g}
                onClick={() => onChangeSurvivalGenes([g])}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono border cursor-pointer ${
                  hasOmic
                    ? "border-slate-700 bg-slate-950 text-slate-200 hover:border-sky-500/60"
                    : "border-amber-500/40 bg-amber-950/30 text-amber-300"
                }`}
                title="Click gene name to isolate single-gene survival curve"
              >
                {g}
                {survivalGenes.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onChangeSurvivalGenes(survivalGenes.filter((x) => x !== g));
                    }}
                    className="text-slate-500 hover:text-rose-400"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </span>
            );
          })}
          {survivalGenes.length > 1 && (
            <button
              onClick={() => onChangeSurvivalGenes([survivalGenes[0]])}
              className="px-2 py-0.5 rounded-md text-[11px] bg-slate-950 border border-slate-800 text-slate-400 hover:text-rose-400"
            >
              Keep 1st Only
            </button>
          )}
        </div>

        {skippedProteinGenes.length > 0 && omicLayer === "protein" && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-200 flex items-center justify-between gap-2">
            <span>
              <AlertTriangle className="w-3.5 h-3.5 inline mr-1.5 text-amber-400" />
              <strong>{skippedProteinGenes.join(", ")}</strong> absent in TMT Global Protein matrix (computed using the {usedGenes.length} quantified panel proteins).
            </span>
            <button
              onClick={() => setOmicLayer("mrna")}
              className="px-2 py-0.5 rounded bg-emerald-600/30 border border-emerald-500/40 text-emerald-200 hover:bg-emerald-600/50 whitespace-nowrap"
            >
              Check Matched mRNA
            </button>
          </div>
        )}
      </div>

      {/* Summary Stats + KM Curve */}
      {survivalResult ? (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          {/* Left: Continuous Cox PH + KM Stats Cards */}
          <div className="xl:col-span-4 space-y-4">
            {/* Continuous Cox PH Card */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-sky-400">
                  Continuous Cox PH (Standardized Z)
                </h4>
                <span className="text-[11px] font-mono text-slate-400">
                  n = {survivalResult.n_used} ({survivalResult.events_used} events)
                </span>
              </div>

              {survivalResult.cox_ph ? (
                <>
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`text-2xl font-bold font-mono ${
                        survivalResult.cox_ph.pValue < 0.05
                          ? survivalResult.cox_ph.hr > 1
                            ? "text-rose-400"
                            : "text-emerald-400"
                          : "text-slate-200"
                      }`}
                    >
                      HR = {survivalResult.cox_ph.hr.toFixed(3)}
                    </span>
                    <span className="text-xs font-mono text-slate-400">
                      (95% CI {survivalResult.cox_ph.ciLower.toFixed(2)}–
                      {survivalResult.cox_ph.ciUpper.toFixed(2)})
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-800">
                    <div>
                      <div className="text-slate-400 text-[10px]">Wald p-value</div>
                      <div className="font-mono font-semibold text-slate-200">
                        {formatPublicationPValue(survivalResult.cox_ph.pValue)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-[10px]">LR Test p-value</div>
                      <div className="font-mono font-semibold text-slate-200">
                        {formatPublicationPValue(survivalResult.cox_ph.lrPValue)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-[10px]">Harrell&apos;s C-Index</div>
                      <div className="font-mono font-semibold text-slate-200">
                        {survivalResult.cox_ph.cIndex.toFixed(4)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-[10px]">Cox &beta; &plusmn; SE</div>
                      <div className="font-mono font-semibold text-slate-200">
                        {survivalResult.cox_ph.beta >= 0 ? "+" : ""}
                        {survivalResult.cox_ph.beta.toFixed(3)} &plusmn;{" "}
                        {survivalResult.cox_ph.se.toFixed(3)}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-xs text-slate-400">
                  Insufficient non-missing events for Cox fit.
                </div>
              )}
            </div>

            {/* Kaplan-Meier & maxstat Card */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-rose-400">
                  Kaplan-Meier Group Comparison
                </h4>
                <span className="text-[11px] font-mono text-slate-400">
                  {stratMethod.toUpperCase()}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-rose-950/30 border border-rose-500/30 p-2.5">
                  <div className="text-[10px] uppercase text-rose-300 font-semibold">
                    High Group
                  </div>
                  <div className="text-sm font-bold text-slate-100 font-mono">
                    {survivalResult.high_median_os !== null
                      ? `${survivalResult.high_median_os.toFixed(1)} mo`
                      : "Not Reached"}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    n={survivalResult.high_n} ({survivalResult.high_events} deaths)
                  </div>
                </div>
                <div className="rounded-lg bg-sky-950/30 border border-sky-500/30 p-2.5">
                  <div className="text-[10px] uppercase text-sky-300 font-semibold">
                    Low Group
                  </div>
                  <div className="text-sm font-bold text-slate-100 font-mono">
                    {survivalResult.low_median_os !== null
                      ? `${survivalResult.low_median_os.toFixed(1)} mo`
                      : "Not Reached"}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    n={survivalResult.low_n} ({survivalResult.low_events} deaths)
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-800">
                <div>
                  <div className="text-slate-400 text-[10px]">
                    Unadjusted Log-Rank p
                  </div>
                  <div className="font-mono font-semibold text-slate-200">
                    {formatPublicationPValue(survivalResult.logrank_p_value)}
                  </div>
                </div>
                {survivalResult.maxstat_p_value !== undefined ? (
                  <div>
                    <div className="text-amber-300 text-[10px] font-semibold">
                      maxstat Lau92 Adj. p
                    </div>
                    <div
                      className={`font-mono font-bold ${
                        survivalResult.maxstat_p_value < 0.05
                          ? "text-amber-300"
                          : "text-slate-200"
                      }`}
                    >
                      {formatPublicationPValue(survivalResult.maxstat_p_value)}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="text-slate-400 text-[10px]">Cutpoint / Split</div>
                    <div className="font-mono text-slate-200">
                      p{survivalResult.cutoff_percentile} ({survivalResult.cutoff_value})
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-slate-400 text-[10px]">Group Log-Rank HR</div>
                  <div className="font-mono text-slate-200">
                    {survivalResult.hazard_ratio.toFixed(2)} (
                    {survivalResult.hr_ci_lower.toFixed(2)}–
                    {survivalResult.hr_ci_upper.toFixed(2)})
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 text-[10px]">Optimal Cutpoint</div>
                  <div className="font-mono text-slate-200">
                    {survivalResult.cutoff_value} (p
                    {survivalResult.cutoff_percentile?.toFixed(0)})
                  </div>
                </div>
              </div>

              {usedGenes.length > 5 &&
                survivalResult.cox_ph &&
                survivalResult.cox_ph.pValue > 0.1 && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-2.5 text-[11px] text-amber-200 flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>
                      <strong>Multi-Gene Panel Heterogeneity:</strong> Equal-weighted averaging across large gene sets can cancel opposing prognostic signals. Inspect the individual gene-level Cox forest plot below.
                    </span>
                  </div>
                )}
            </div>
          </div>

          {/* Right: KM Plot + Numbers at Risk Table */}
          <div className="xl:col-span-8 rounded-xl border border-slate-800 bg-slate-900/60 p-4 flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-3">
                <h4 className="text-sm font-bold text-slate-100">
                  Kaplan-Meier Overall Survival Curve
                </h4>
                <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showCI}
                    onChange={(e) => setShowCI(e.target.checked)}
                    className="accent-sky-500"
                  />
                  95% Greenwood CI
                </label>
              </div>
              <ExportButton
                label="Export KM & Table"
                size="sm"
                onExportCSV={() =>
                  exportToCSV({
                    filename: `CPTAC_PDAC_OS_${usedGenes.length === 1 ? usedGenes[0] : "Panel"}_${omicLayer}.csv`,
                    metadata: {
                      dataset: "CPTAC-PDAC (Cao et al., Cell 2021)",
                      module: "Overall Survival Validation",
                      selectedGene: usedGenes.join("; "),
                      filters: `${omicLayer} | ${cohortScope} | ${stratMethod}`,
                    },
                    headers: [
                      "Patient_ID",
                      "OS_Months",
                      "OS_Event",
                      "Composite_Score",
                      "KM_Group",
                    ],
                    rows: survivalResult.patient_records.map((r) => [
                      r.patient_id,
                      r.os_months,
                      r.os_event,
                      r.score,
                      r.group,
                    ]),
                  })
                }
                onExportPNG={(opts) =>
                  exportCanvasToPNG({
                    canvas: renderPubKmCanvas(opts?.theme === "light"),
                    filename: `CPTAC_PDAC_KM_${usedGenes.length === 1 ? usedGenes[0] : "Panel"}_${omicLayer}.png`,
                    theme: opts?.theme || "light",
                  })
                }
                onExportSVG={(opts) =>
                  exportCanvasToSVG({
                    canvas: renderPubKmCanvas(opts?.theme === "light"),
                    filename: `CPTAC_PDAC_KM_${usedGenes.length === 1 ? usedGenes[0] : "Panel"}_${omicLayer}.svg`,
                    theme: opts?.theme || "light",
                  })
                }
              />
            </div>

            <div
              ref={kmWrapperRef}
              className="relative w-full h-[410px] rounded-lg border border-slate-800/80 bg-slate-950/80 overflow-hidden"
            >
              <canvas ref={kmCanvasRef} className="absolute inset-0 w-full h-full block" />
            </div>

            {/* Numbers at Risk Table */}
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/70 p-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Numbers at Risk (Months)
              </div>
              <table className="w-full text-xs font-mono text-center">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-800">
                    <th className="text-left py-1 px-2">Stratum</th>
                    {survivalResult.risk_table.map((rt) => (
                      <th key={rt.time} className="py-1 px-2">
                        {rt.time}m
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="text-rose-400">
                    <td className="text-left py-1 px-2 font-sans font-semibold">
                      High
                    </td>
                    {survivalResult.risk_table.map((rt) => (
                      <td key={rt.time} className="py-1 px-2">
                        {rt.high_risk}
                      </td>
                    ))}
                  </tr>
                  <tr className="text-sky-400">
                    <td className="text-left py-1 px-2 font-sans font-semibold">
                      Low
                    </td>
                    {survivalResult.risk_table.map((rt) => (
                      <td key={rt.time} className="py-1 px-2">
                        {rt.low_risk}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-center text-sm text-slate-400">
          {protBuffer || mrnaBuffer
            ? "Select at least one quantified gene/protein in this omic layer to compute CPTAC-PDAC overall survival."
            : "Loading CPTAC-PDAC proteomics and clinical survival matrices..."}
        </div>
      )}

      {/* Gene-Level Panel Cox PH Forest Plot & Breakdown Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-100">
              Gene-Level Panel Prognostic Breakdown ({omicLayer === "protein" ? "Global Protein" : "Matched mRNA"})
            </h3>
            <p className="text-xs text-slate-400">
              Continuous Cox PH HR (per 1-SD) + Optimal Cutpoint Log-Rank &amp;{" "}
              <code className="text-amber-300">maxstat Lau92</code> adjusted p-value. Click any gene row to render its KM curve above.
            </p>
          </div>
          <ExportButton
            label="Export Cox Table"
            size="sm"
            onExportCSV={() =>
              exportToCSV({
                filename: `CPTAC_PDAC_GeneLevel_Survival_${omicLayer}.csv`,
                metadata: {
                  dataset: "CPTAC-PDAC (Cao et al., Cell 2021)",
                  module: "Gene-Level Survival Table",
                  filters: `${omicLayer} | ${cohortScope}`,
                },
                headers: [
                  "Gene",
                  "Quantified",
                  "N",
                  "Events",
                  "Cox_HR_per_1SD",
                  "Cox_95CI_Low",
                  "Cox_95CI_High",
                  "Cox_Wald_p",
                  "Harrell_C_Index",
                  "Optimal_Cutoff",
                  "Optimal_LR_p_Unadj",
                  "Maxstat_Lau92_p_Adj",
                ],
                rows: geneBreakdownRows.map((r) => [
                  r.gene,
                  r.quantified ? "Yes" : "mRNA-only",
                  r.n,
                  r.events,
                  r.coxHR !== null ? Number(r.coxHR.toFixed(4)) : null,
                  r.coxCiL !== null ? Number(r.coxCiL.toFixed(4)) : null,
                  r.coxCiH !== null ? Number(r.coxCiH.toFixed(4)) : null,
                  r.coxP,
                  r.cIndex !== null ? Number(r.cIndex.toFixed(4)) : null,
                  r.optCutoff !== null ? Number(r.optCutoff.toFixed(4)) : null,
                  r.optLogRankP,
                  r.maxstatP,
                ]),
              })
            }
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="border-b border-slate-800 text-slate-400 uppercase text-[11px]">
              <tr>
                <th className="py-2 px-3">Feature</th>
                <th className="py-2 px-3">N / Deaths</th>
                <th className="py-2 px-3">Forest Plot (Cox HR 95% CI)</th>
                <th className="py-2 px-3">Cox HR (95% CI)</th>
                <th className="py-2 px-3">Cox p</th>
                <th className="py-2 px-3">C-Index</th>
                <th className="py-2 px-3">Opt. Cut (LR p)</th>
                <th className="py-2 px-3">maxstat Lau92 p</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {geneBreakdownRows.map((row) => {
                // Map HR [0.35, 2.5] in log scale to 0..100%
                const mapHrPct = (hr: number) => {
                  const clamped = Math.max(0.35, Math.min(2.5, hr));
                  const minL = Math.log(0.35);
                  const maxL = Math.log(2.5);
                  return ((Math.log(clamped) - minL) / (maxL - minL)) * 100;
                };
                const onePct = mapHrPct(1.0);
                const sigCox = row.coxP !== null && row.coxP < 0.05;
                const sigMax = row.maxstatP !== null && row.maxstatP < 0.05;

                return (
                  <tr
                    key={row.gene}
                    onClick={() => {
                      if (row.quantified) onChangeSurvivalGenes([row.gene]);
                    }}
                    className={`transition-colors ${
                      row.quantified
                        ? "cursor-pointer hover:bg-slate-800/50"
                        : "opacity-60"
                    } ${
                      usedGenes.length === 1 && usedGenes[0] === row.gene
                        ? "bg-sky-950/40"
                        : ""
                    }`}
                  >
                    <td className="py-2 px-3 font-bold font-mono text-slate-100">
                      {row.gene}
                      {!row.quantified && (
                        <span className="ml-1.5 text-[10px] text-amber-300 font-sans">
                          (mRNA-only)
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-400">
                      {row.quantified ? `${row.n} / ${row.events}` : "—"}
                    </td>
                    <td className="py-2 px-3 min-w-[170px]">
                      {row.coxHR !== null &&
                      row.coxCiL !== null &&
                      row.coxCiH !== null ? (
                        <div className="relative h-5 w-40 bg-slate-950 rounded border border-slate-800">
                          <div
                            className="absolute top-0 bottom-0 w-px bg-slate-500/60"
                            style={{ left: `${onePct}%` }}
                          />
                          <div
                            className={`absolute top-1/2 -translate-y-1/2 h-0.5 ${
                              row.coxHR > 1 ? "bg-rose-400" : "bg-emerald-400"
                            }`}
                            style={{
                              left: `${mapHrPct(row.coxCiL)}%`,
                              width: `${Math.max(
                                2,
                                mapHrPct(row.coxCiH) - mapHrPct(row.coxCiL)
                              )}%`,
                            }}
                          />
                          <div
                            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-sm ${
                              sigCox
                                ? row.coxHR > 1
                                  ? "bg-rose-400"
                                  : "bg-emerald-400"
                                : "bg-slate-400"
                            }`}
                            style={{ left: `${mapHrPct(row.coxHR)}%` }}
                          />
                        </div>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 font-mono">
                      {row.coxHR !== null ? (
                        <span
                          className={
                            sigCox
                              ? row.coxHR > 1
                                ? "text-rose-400 font-semibold"
                                : "text-emerald-400 font-semibold"
                              : "text-slate-300"
                          }
                        >
                          {row.coxHR.toFixed(2)} ({row.coxCiL?.toFixed(2)}–
                          {row.coxCiH?.toFixed(2)})
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td
                      className={`py-2 px-3 font-mono ${
                        sigCox ? "text-amber-300 font-semibold" : "text-slate-400"
                      }`}
                    >
                      {row.coxP !== null ? formatPublicationPValue(row.coxP) : "—"}
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-300">
                      {row.cIndex !== null ? row.cIndex.toFixed(3) : "—"}
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-300">
                      {row.optCutoff !== null && row.optLogRankP !== null
                        ? `${row.optCutoff.toFixed(2)} (${formatPublicationPValue(
                            row.optLogRankP
                          )})`
                        : "—"}
                    </td>
                    <td
                      className={`py-2 px-3 font-mono ${
                        sigMax ? "text-emerald-400 font-semibold" : "text-slate-400"
                      }`}
                    >
                      {row.maxstatP !== null
                        ? formatPublicationPValue(row.maxstatP)
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
