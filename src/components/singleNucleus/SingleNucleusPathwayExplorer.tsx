"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Activity,
  Layers,
  Sparkles,
  Download,
  Info,
  Sliders,
  Search,
  Filter,
  ArrowUpDown,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Zap,
  HelpCircle,
  Eye,
  CheckCircle2,
  AlertTriangle,
  X
} from "lucide-react";

export interface PathwayResultEntry {
  id: string;
  name: string;
  database: string;
  nes: number;
  es: number;
  pval: number;
  fdr: number;
  size: number;
  direction: string;
  leading_edge: string[];
  n_naive_patients: number;
  n_treated_patients: number;
}

export interface CompartmentDivergenceItem {
  id: string;
  name: string;
  database: string;
  cds: number;
  is_opposing: boolean;
  max_nes: number;
  min_nes: number;
  nes_range: number;
  min_fdr: number;
  top_positive_compartment: string;
  top_positive_nes: number;
  top_positive_fdr: number;
  top_negative_compartment: string;
  top_negative_nes: number;
  top_negative_fdr: number;
  compartment_values: Record<string, { nes: number; fdr: number; pval: number }>;
}

export interface MixedModelEntry {
  id: string;
  name: string;
  interaction_min_pval: number;
  interaction_fdr: number;
  interaction_max_effect: number;
  model_converged: boolean;
  n_patients: number;
  n_obs: number;
}

export interface PathwayDataPayload {
  metadata: {
    dataset: string;
    description: string;
    total_nuclei: number;
    n_naive_patients: number;
    n_crt_patients: number;
    n_treated_patients: number;
    primary_comparison: string;
    secondary_comparison: string;
    compartments_included: string[];
  };
  layer1_gsea: {
    primary_naive_vs_crt: {
      label: string;
      compartments: Record<string, { name: string; category: string; n_naive_patients: number; n_treated_patients: number; pathways: PathwayResultEntry[] }>;
    };
    secondary_naive_vs_treated: {
      label: string;
      compartments: Record<string, { name: string; category: string; n_naive_patients: number; n_treated_patients: number; pathways: PathwayResultEntry[] }>;
    };
  };
  layer2_divergence: {
    primary_naive_vs_crt: CompartmentDivergenceItem[];
    secondary_naive_vs_treated: CompartmentDivergenceItem[];
  };
  layer3_mixed_models: {
    primary_naive_vs_crt: MixedModelEntry[];
    secondary_naive_vs_treated: MixedModelEntry[];
  };
}

export default function SingleNucleusPathwayExplorer() {
  const [data, setData] = useState<PathwayDataPayload | null>(null);
  const [patientScores, setPatientScores] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter States
  const [comparisonMode, setComparisonMode] = useState<"primary_naive_vs_crt" | "secondary_naive_vs_treated">("primary_naive_vs_crt");
  const [viewMode, setViewMode] = useState<"heatmap" | "divergence_table" | "mixed_models">("heatmap");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPathwayId, setSelectedPathwayId] = useState<string | null>("HALLMARK_TNF-ALPHA_SIGNALING_VIA_NF-KB");
  const [selectedCompartments, setSelectedCompartments] = useState<string[]>([
    "Malignant", "CAF", "Ductal", "Vascular", "Pericyte", "myCAF", "Macrophage", "CD8+ T", "Dendritic"
  ]);

  // Load Data Files
  useEffect(() => {
    async function loadPathwayData() {
      try {
        setLoading(true);
        const [resHallmark, resScores] = await Promise.all([
          fetch("/PAAD-SBRT-GEx-Dashboard/data/gse202051/pathways/hallmark_pathway_results.json").catch(() => 
            fetch("/data/gse202051/pathways/hallmark_pathway_results.json")
          ),
          fetch("/PAAD-SBRT-GEx-Dashboard/data/gse202051/pathways/patient_pathway_scores.json").catch(() => 
            fetch("/data/gse202051/pathways/patient_pathway_scores.json")
          )
        ]);

        if (!resHallmark.ok) {
          throw new Error(`Failed to load pathway results (${resHallmark.status})`);
        }

        const jsonHallmark = await resHallmark.json();
        const jsonScores = resScores.ok ? await resScores.json() : null;

        setData(jsonHallmark);
        setPatientScores(jsonScores);
        setLoading(false);
      } catch (err: any) {
        console.error("Error loading single-nucleus pathway data:", err);
        setError(err?.message || "Failed to load single-nucleus pathway analysis data.");
        setLoading(false);
      }
    }

    loadPathwayData();
  }, []);

  // Compartment List
  const availableCompartments = useMemo(() => [
    { id: "Malignant", label: "Malignant Epithelium", type: "Level 2" },
    { id: "CAF", label: "CAFs (Total)", type: "Level 2" },
    { id: "myCAF", label: "myCAFs", type: "Level 2" },
    { id: "Ductal", label: "Normal Ductal", type: "Level 2" },
    { id: "Vascular", label: "Vascular Endothelium", type: "Level 2" },
    { id: "Pericyte", label: "Pericytes", type: "Level 2" },
    { id: "Macrophage", label: "Macrophages", type: "Level 2" },
    { id: "CD8+ T", label: "CD8+ T Cells", type: "Level 2" },
    { id: "Dendritic", label: "Dendritic Cells", type: "Level 2" },
    { id: "Epithelial", label: "Broad Epithelial", type: "Broad" },
    { id: "Fibroblast", label: "Broad Fibroblast", type: "Broad" },
    { id: "Immune", label: "Broad Immune", type: "Broad" },
    { id: "Endothelial", label: "Broad Endothelial", type: "Broad" }
  ], []);

  // Filtered Pathways for Table / Heatmap
  const divergenceList = useMemo(() => {
    if (!data) return [];
    const list = data.layer2_divergence[comparisonMode] || [];
    if (!searchTerm.trim()) return list;
    const term = searchTerm.toLowerCase();
    return list.filter(p => p.name.toLowerCase().includes(term) || p.id.toLowerCase().includes(term));
  }, [data, comparisonMode, searchTerm]);

  // Mixed Models List
  const mixedModelList = useMemo(() => {
    if (!data) return [];
    const list = data.layer3_mixed_models[comparisonMode] || [];
    if (!searchTerm.trim()) return list;
    const term = searchTerm.toLowerCase();
    return list.filter(p => p.name.toLowerCase().includes(term) || p.id.toLowerCase().includes(term));
  }, [data, comparisonMode, searchTerm]);

  // Selected Pathway Detail
  const selectedPathwayDetail = useMemo(() => {
    if (!data || !selectedPathwayId) return null;
    const divItem = (data.layer2_divergence[comparisonMode] || []).find(p => p.id === selectedPathwayId);
    const mixedItem = (data.layer3_mixed_models[comparisonMode] || []).find(p => p.id === selectedPathwayId);
    
    // Gather Layer 1 leading edge genes across compartments
    const compResults: Record<string, PathwayResultEntry> = {};
    const compDict = data.layer1_gsea[comparisonMode]?.compartments || {};
    Object.entries(compDict).forEach(([compId, cData]) => {
      const pEntry = cData.pathways.find(p => p.id === selectedPathwayId);
      if (pEntry) compResults[compId] = pEntry;
    });

    return {
      divergence: divItem,
      mixedModel: mixedItem,
      compartmentGSEA: compResults
    };
  }, [data, selectedPathwayId, comparisonMode]);

  // Helper: NES Color Scale
  const getNESColor = (nes: number, alpha: number = 1.0) => {
    if (nes === 0 || isNaN(nes)) return `rgba(51, 65, 85, ${alpha})`;
    if (nes > 0) {
      const intensity = Math.min(1.0, nes / 2.5);
      return `rgba(239, 68, 68, ${0.15 + intensity * 0.85 * alpha})`; // Red for Upregulated in Treated
    } else {
      const intensity = Math.min(1.0, Math.abs(nes) / 2.5);
      return `rgba(59, 130, 246, ${0.15 + intensity * 0.85 * alpha})`; // Blue for Downregulated in Treated
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!data) return;
    const items = data.layer2_divergence[comparisonMode] || [];
    const headers = [
      "Pathway ID", "Pathway Name", "Database", "Compartmental Divergence Score (CDS)",
      "Is Opposing Direction", "Max NES", "Min NES", "NES Range", "Min FDR",
      "Top Positive Compartment", "Top Positive NES", "Top Negative Compartment", "Top Negative NES"
    ];

    selectedCompartments.forEach(c => {
      headers.push(`${c} NES`, `${c} FDR`);
    });

    const rows = items.map(p => {
      const r = [
        `"${p.id}"`, `"${p.name}"`, `"${p.database}"`, p.cds.toFixed(3),
        p.is_opposing ? "YES" : "NO", p.max_nes.toFixed(3), p.min_nes.toFixed(3), p.nes_range.toFixed(3), p.min_fdr.toExponential(4),
        `"${p.top_positive_compartment}"`, p.top_positive_nes.toFixed(3), `"${p.top_negative_compartment}"`, p.top_negative_nes.toFixed(3)
      ];
      selectedCompartments.forEach(c => {
        const val = p.compartment_values[c];
        r.push(val ? val.nes.toFixed(3) : "NA", val ? val.fdr.toExponential(4) : "NA");
      });
      return r.join(",");
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `GSE202051_Pathway_Divergence_${comparisonMode}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-4 bg-slate-900/60 rounded-xl border border-slate-800">
        <Activity className="w-10 h-10 text-teal-400 animate-spin" />
        <p className="text-slate-300 font-medium">Loading 3-Layer Unbiased Pathway Remodeling Analysis...</p>
        <p className="text-xs text-slate-500">Evaluating genome-wide pseudobulk GSEA, Compartment Divergence (CDS), and Mixed-Effects Models across 43 patients</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 bg-rose-950/30 border border-rose-800/50 rounded-xl text-rose-200 space-y-3">
        <div className="flex items-center space-x-2">
          <AlertTriangle className="w-6 h-6 text-rose-400" />
          <h3 className="text-lg font-semibold">Single-Nucleus Pathway Analysis Notice</h3>
        </div>
        <p className="text-sm text-slate-300">{error || "Unable to render pathway results."}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Header Banner & Safeguards */}
      <div className="p-5 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-900/40 rounded-xl shadow-lg space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="px-2 py-0.5 text-xs font-semibold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded">
                Unbiased 3-Layer Architecture
              </span>
              <span className="px-2 py-0.5 text-xs font-semibold uppercase tracking-wider bg-teal-500/20 text-teal-300 border border-teal-500/30 rounded">
                GSE202051 Single-Nucleus
              </span>
              <span className="px-2 py-0.5 text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded">
                43 Patients (n=18 Naïve vs n=25 RT/CRT Treated)
              </span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Cell-Compartment-Specific Treatment-Associated Pathway Remodeling
            </h2>
            <p className="text-xs text-slate-400 max-w-4xl">
              An unbiased, genome-wide pathway analysis identifying biological programs that undergo treatment-associated shifts across PDAC compartments. The <strong>Patient is the biological replicate</strong>, with statistical confirmation via Linear Mixed-Effects Models: <code className="text-indigo-300">PathwayScore ~ Treatment * Compartment + (1|Patient)</code>.
            </p>
          </div>

          {/* Export and Action Buttons */}
          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={handleExportCSV}
              className="flex items-center space-x-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition shadow-sm"
            >
              <Download className="w-3.5 h-3.5 text-teal-400" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Comparison and View Mode Selectors */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2 border-t border-slate-800/80 text-xs">
          {/* Comparison Selector */}
          <div className="space-y-1.5">
            <label className="text-slate-400 font-medium flex items-center space-x-1">
              <Filter className="w-3.5 h-3.5 text-indigo-400" />
              <span>Treatment Comparison:</span>
            </label>
            <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setComparisonMode("primary_naive_vs_crt")}
                className={`px-2.5 py-1.5 rounded text-xs font-medium text-center transition ${
                  comparisonMode === "primary_naive_vs_crt"
                    ? "bg-indigo-600 text-white shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Primary: Naïve vs CRT (n=18 vs 14)
              </button>
              <button
                onClick={() => setComparisonMode("secondary_naive_vs_treated")}
                className={`px-2.5 py-1.5 rounded text-xs font-medium text-center transition ${
                  comparisonMode === "secondary_naive_vs_treated"
                    ? "bg-indigo-600 text-white shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Secondary: Naïve vs All Treated (n=18 vs 25)
              </button>
            </div>
          </div>

          {/* View Mode Switcher */}
          <div className="space-y-1.5">
            <label className="text-slate-400 font-medium flex items-center space-x-1">
              <Layers className="w-3.5 h-3.5 text-teal-400" />
              <span>Analytical View Layer:</span>
            </label>
            <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setViewMode("heatmap")}
                className={`px-2 py-1.5 rounded text-xs font-medium text-center transition ${
                  viewMode === "heatmap" ? "bg-teal-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                1. Cross-Heatmap
              </button>
              <button
                onClick={() => setViewMode("divergence_table")}
                className={`px-2 py-1.5 rounded text-xs font-medium text-center transition ${
                  viewMode === "divergence_table" ? "bg-teal-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                2. Divergence (CDS)
              </button>
              <button
                onClick={() => setViewMode("mixed_models")}
                className={`px-2 py-1.5 rounded text-xs font-medium text-center transition ${
                  viewMode === "mixed_models" ? "bg-teal-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                3. Mixed Models (1|Pt)
              </button>
            </div>
          </div>

          {/* Search Filter */}
          <div className="space-y-1.5">
            <label className="text-slate-400 font-medium flex items-center space-x-1">
              <Search className="w-3.5 h-3.5 text-amber-400" />
              <span>Filter Pathways:</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search pathway name (e.g. TNF, Hypoxia, ROS)..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm("")} className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-200">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Main Analytical Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Heatmap / Divergence Table (8 Cols) */}
        <div className="lg:col-span-8 space-y-4">
          {viewMode === "heatmap" && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-4 shadow-md">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center space-x-1.5">
                    <Layers className="w-4 h-4 text-teal-400" />
                    <span>Layer 1 & 2: Cross-Compartment Pathway Heatmap (MSigDB Hallmark)</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Rows: Pathways sorted by Compartmental Divergence Score (CDS) • Columns: Cellular compartments • Values: Normalized Enrichment Score (NES)
                  </p>
                </div>

                {/* Heatmap Legend */}
                <div className="flex items-center space-x-3 text-[11px] bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
                  <div className="flex items-center space-x-1">
                    <span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" />
                    <span className="text-slate-300">Downregulated in Treated (NES &lt; 0)</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <span className="w-3 h-3 rounded-sm bg-slate-700 inline-block" />
                    <span className="text-slate-400">0.0</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <span className="w-3 h-3 rounded-sm bg-rose-500 inline-block" />
                    <span className="text-slate-300">Upregulated in Treated (NES &gt; 0)</span>
                  </div>
                </div>
              </div>

              {/* Heatmap Matrix Table */}
              <div className="overflow-x-auto max-h-[600px] rounded-lg border border-slate-800">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-950 sticky top-0 z-10 border-b border-slate-800 text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3 min-w-[220px]">Pathway Name</th>
                      <th className="py-2.5 px-2 text-center">CDS</th>
                      {selectedCompartments.map(comp => (
                        <th key={comp} className="py-2.5 px-2 text-center min-w-[85px]">
                          {comp}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                    {divergenceList.map((pathway, idx) => {
                      const isSelected = pathway.id === selectedPathwayId;
                      return (
                        <tr
                          key={pathway.id}
                          onClick={() => setSelectedPathwayId(pathway.id)}
                          className={`cursor-pointer transition hover:bg-slate-800/70 ${
                            isSelected ? "bg-indigo-950/60 font-medium" : ""
                          }`}
                        >
                          <td className="py-2 px-3 text-slate-200 flex items-center justify-between group">
                            <span className="truncate max-w-[200px]" title={pathway.name}>
                              {idx + 1}. {pathway.name.replace("Hallmark ", "")}
                            </span>
                            {pathway.is_opposing && (
                              <span className="ml-1 px-1.5 py-0.2 text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded font-semibold">
                                Opposing
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-center font-mono text-[11px] text-teal-300 bg-slate-950/40">
                            {pathway.cds.toFixed(2)}
                          </td>
                          {selectedCompartments.map(comp => {
                            const val = pathway.compartment_values[comp];
                            const nes = val ? val.nes : 0;
                            const fdr = val ? val.fdr : 1.0;
                            const isSig = fdr < 0.05;

                            return (
                              <td
                                key={comp}
                                style={{ backgroundColor: getNESColor(nes, 0.4) }}
                                className="py-2 px-1 text-center font-mono text-[11px] border-r border-slate-800/40"
                              >
                                <span className={isSig ? "font-bold text-white" : "text-slate-300"}>
                                  {nes !== 0 ? (nes > 0 ? `+${nes.toFixed(2)}` : nes.toFixed(2)) : "—"}
                                  {isSig && <span className="text-[10px] text-amber-300 ml-0.5">*</span>}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {viewMode === "divergence_table" && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3 shadow-md">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center space-x-1.5">
                  <TrendingUp className="w-4 h-4 text-amber-400" />
                  <span>Layer 2: Compartmental Divergence Rankings (CDS)</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Ranked by Compartmental Divergence Score (CDS) = (NES_max − NES_min) × Direction_Factor × √(−log10(q_min))
                </p>
              </div>

              <div className="overflow-x-auto max-h-[600px] rounded-lg border border-slate-800">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-950 sticky top-0 z-10 border-b border-slate-800 text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Rank</th>
                      <th className="py-2.5 px-3">Pathway Name</th>
                      <th className="py-2.5 px-2 text-center">CDS Score</th>
                      <th className="py-2.5 px-2 text-center">Opposing?</th>
                      <th className="py-2.5 px-3">Top Positive (Upregulated)</th>
                      <th className="py-2.5 px-3">Top Negative (Downregulated)</th>
                      <th className="py-2.5 px-2 text-center">Min FDR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                    {divergenceList.map((p, idx) => {
                      const isSelected = p.id === selectedPathwayId;
                      return (
                        <tr
                          key={p.id}
                          onClick={() => setSelectedPathwayId(p.id)}
                          className={`cursor-pointer transition hover:bg-slate-800/70 ${
                            isSelected ? "bg-indigo-950/60 font-medium" : ""
                          }`}
                        >
                          <td className="py-2.5 px-3 font-mono text-slate-400">#{idx + 1}</td>
                          <td className="py-2.5 px-3 font-medium text-slate-200">{p.name}</td>
                          <td className="py-2.5 px-2 text-center font-mono font-bold text-teal-400">{p.cds.toFixed(2)}</td>
                          <td className="py-2.5 px-2 text-center">
                            {p.is_opposing ? (
                              <span className="px-2 py-0.5 text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded">
                                Divergent
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 text-[10px] text-slate-400 bg-slate-800 rounded">
                                Concordant
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="text-rose-400 font-medium">{p.top_positive_compartment}</span>
                            <span className="text-slate-400 text-[11px] ml-1.5 font-mono">
                              (NES = +{p.top_positive_nes.toFixed(2)})
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="text-blue-400 font-medium">{p.top_negative_compartment}</span>
                            <span className="text-slate-400 text-[11px] ml-1.5 font-mono">
                              (NES = {p.top_negative_nes.toFixed(2)})
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-center font-mono text-slate-300">
                            {p.min_fdr < 0.0001 ? p.min_fdr.toExponential(2) : p.min_fdr.toFixed(4)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {viewMode === "mixed_models" && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3 shadow-md">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center space-x-1.5">
                  <ShieldCheck className="w-4 h-4 text-indigo-400" />
                  <span>Layer 3: Linear Mixed-Effects Model Interaction Rankings (1|Patient)</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Testing <code className="text-indigo-300">PathwayScore ~ Treatment * Compartment + (1|Patient)</code> across patients and compartments.
                </p>
              </div>

              <div className="overflow-x-auto max-h-[600px] rounded-lg border border-slate-800">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-950 sticky top-0 z-10 border-b border-slate-800 text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Rank</th>
                      <th className="py-2.5 px-3">Pathway Name</th>
                      <th className="py-2.5 px-2 text-center">Interaction p-value</th>
                      <th className="py-2.5 px-2 text-center">Interaction FDR (q)</th>
                      <th className="py-2.5 px-2 text-center">Max Effect (γ)</th>
                      <th className="py-2.5 px-2 text-center">Patients</th>
                      <th className="py-2.5 px-2 text-center">Observations</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                    {mixedModelList.map((m, idx) => {
                      const isSelected = m.id === selectedPathwayId;
                      const isSig = m.interaction_fdr < 0.05;
                      return (
                        <tr
                          key={m.id}
                          onClick={() => setSelectedPathwayId(m.id)}
                          className={`cursor-pointer transition hover:bg-slate-800/70 ${
                            isSelected ? "bg-indigo-950/60 font-medium" : ""
                          }`}
                        >
                          <td className="py-2.5 px-3 font-mono text-slate-400">#{idx + 1}</td>
                          <td className="py-2.5 px-3 font-medium text-slate-200">{m.name}</td>
                          <td className="py-2.5 px-2 text-center font-mono text-indigo-300">
                            {m.interaction_min_pval < 0.0001 ? m.interaction_min_pval.toExponential(2) : m.interaction_min_pval.toFixed(4)}
                          </td>
                          <td className="py-2.5 px-2 text-center font-mono">
                            <span className={isSig ? "font-bold text-amber-400" : "text-slate-400"}>
                              {m.interaction_fdr < 0.0001 ? m.interaction_fdr.toExponential(2) : m.interaction_fdr.toFixed(4)}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-center font-mono text-teal-400">{m.interaction_max_effect.toFixed(2)}</td>
                          <td className="py-2.5 px-2 text-center font-mono text-slate-400">{m.n_patients}p</td>
                          <td className="py-2.5 px-2 text-center font-mono text-slate-400">{m.n_obs}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Detailed Pathway Inspector (4 Cols) */}
        <div className="lg:col-span-4 space-y-4">
          {selectedPathwayDetail ? (
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-4 shadow-lg sticky top-6">
              <div className="border-b border-slate-800 pb-3">
                <div className="flex items-center justify-between text-xs text-indigo-400 font-semibold mb-1">
                  <span>Pathway Inspector</span>
                  <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded text-[10px]">
                    {selectedPathwayDetail.divergence?.database || "MSigDB Hallmark"}
                  </span>
                </div>
                <h4 className="text-base font-bold text-white">
                  {selectedPathwayDetail.divergence?.name || selectedPathwayId}
                </h4>
              </div>

              {/* 3-Layer Metrics Card */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-0.5">
                  <span className="text-[10px] text-slate-400 font-medium">Compartment Divergence (CDS)</span>
                  <p className="text-lg font-bold text-teal-400 font-mono">
                    {selectedPathwayDetail.divergence?.cds.toFixed(2) || "N/A"}
                  </p>
                  <span className="text-[10px] text-slate-500">
                    {selectedPathwayDetail.divergence?.is_opposing ? "Opposing Directions" : "Concordant Shift"}
                  </span>
                </div>

                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-0.5">
                  <span className="text-[10px] text-slate-400 font-medium">MixedLM Interaction FDR</span>
                  <p className="text-lg font-bold text-amber-400 font-mono">
                    {selectedPathwayDetail.mixedModel?.interaction_fdr !== undefined
                      ? (selectedPathwayDetail.mixedModel.interaction_fdr < 0.0001 
                          ? selectedPathwayDetail.mixedModel.interaction_fdr.toExponential(2) 
                          : selectedPathwayDetail.mixedModel.interaction_fdr.toFixed(4))
                      : "N/A"}
                  </p>
                  <span className="text-[10px] text-slate-500">
                    p = {selectedPathwayDetail.mixedModel?.interaction_min_pval.toFixed(4) || "N/A"}
                  </span>
                </div>
              </div>

              {/* Compartment Breakdown Bars */}
              <div className="space-y-2">
                <h5 className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>NES Across Compartments</span>
                  <span className="text-[10px] text-slate-500 font-normal">Blue (Down) | Red (Up)</span>
                </h5>
                <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                  {Object.entries(selectedPathwayDetail.compartmentGSEA).map(([compId, pData]) => {
                    const nes = pData.nes;
                    const fdr = pData.fdr;
                    const barWidth = Math.min(100, Math.abs(nes) / 2.5 * 100);
                    const isPos = nes >= 0;

                    return (
                      <div key={compId} className="text-xs bg-slate-950/60 p-2 rounded border border-slate-800/80 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-200">{compId}</span>
                          <span className="font-mono text-[11px] font-bold" style={{ color: isPos ? '#f87171' : '#60a5fa' }}>
                            {nes > 0 ? `+${nes.toFixed(2)}` : nes.toFixed(2)} (q = {fdr < 0.0001 ? fdr.toExponential(2) : fdr.toFixed(3)})
                          </span>
                        </div>
                        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden flex">
                          {isPos ? (
                            <div className="h-full bg-rose-500 rounded-full ml-auto" style={{ width: `${barWidth}%` }} />
                          ) : (
                            <div className="h-full bg-blue-500 rounded-full mr-auto" style={{ width: `${barWidth}%` }} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Leading-Edge Genes */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <h5 className="text-xs font-semibold text-slate-300">Top Leading-Edge Core Genes:</h5>
                <div className="flex flex-wrap gap-1 max-h-[140px] overflow-y-auto">
                  {Object.values(selectedPathwayDetail.compartmentGSEA)[0]?.leading_edge.slice(0, 18).map(gene => (
                    <span key={gene} className="px-2 py-0.5 bg-slate-800 text-slate-200 rounded text-[10px] font-mono border border-slate-700">
                      {gene}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 bg-slate-900 border border-slate-800 rounded-xl text-center text-slate-400 text-xs">
              Select a pathway from the table or heatmap to inspect detailed 3-layer statistics.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
