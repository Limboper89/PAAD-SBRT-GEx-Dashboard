"use client";

import React from "react";
import {
  Layers,
  Database,
  Cpu,
  Activity,
  GitFork,
  BarChart3,
  GitCompare,
  Grid3X3,
  Table,
  Flame,
  Eye,
  Scan,
  Sparkles,
  Info,
  ArrowLeft,
  HeartPulse,
  Microscope,
} from "lucide-react";

export type MainTabId = "de" | "correlation" | "tme" | "sn" | "survival" | "cptac" | "about" | "pathway";
export type CptacSubTabId = "abundance" | "concordance" | "heatmap" | "survival";
export type SnSubTabId = "atlas" | "treatment_comparison" | "pseudobulk_table" | "pathway_analysis" | "response_analysis";
export type SpatialViewModeId = "he_only" | "he_spots" | "expression";

type AccentColor = "teal" | "cyan" | "amber" | "rose" | "violet" | "indigo" | "emerald";

interface CohortDef {
  id: string;
  title: string;
  scaleBadge: string;
  accent: AccentColor;
  icon: React.ComponentType<{ className?: string }>;
  previewTitle: string;
  previewSummary: string;
  previewChips: string[];
}

interface AnalysisTabDef {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: AccentColor;
  previewTitle: string;
  previewHint: string;
  previewChips: string[];
}

const COHORTS: CohortDef[] = [
  {
    id: "GSE225767",
    title: "Bulk SBRT",
    scaleBadge: "Pre vs Post",
    accent: "teal",
    icon: Layers,
    previewTitle: "Bulk SBRT Radiotherapy",
    previewSummary: "Radiation-induced transcriptional changes & pathologic response across Pre- vs Post-SBRT tumors.",
    previewChips: ["Volcano & DEGs", "Co-Expression", "Pathways", "Treatment Response"],
  },
  {
    id: "TCGA_GTEX",
    title: "Tumor vs Normal",
    scaleBadge: "Bulk RNA-seq",
    accent: "cyan",
    icon: BarChart3,
    previewTitle: "Tumor vs Normal Pancreas",
    previewSummary: "Primary PDAC tumors compared against normal pancreas baseline with overall survival outcomes.",
    previewChips: ["Wilcoxon + voom", "Co-Expression", "Pathways", "Survival (KM)"],
  },
  {
    id: "CPTAC_PDAC",
    title: "Proteomics",
    scaleBadge: "11.7k Proteins",
    accent: "amber",
    icon: Database,
    previewTitle: "Global Proteomics & Proteogenomics",
    previewSummary: "TMT protein abundance (140 tumors, 75 NATs, 67 matched pairs), paired RNA-seq & OS.",
    previewChips: ["Tumor vs NAT", "mRNA–Protein r", "Heatmap", "OS Survival"],
  },
  {
    id: "GSE202051",
    title: "Single-Nucleus",
    scaleBadge: "225k Nuclei",
    accent: "rose",
    icon: Cpu,
    previewTitle: "Single-Nucleus Reference Atlas",
    previewSummary: "43 PDAC patients across malignant, stromal & immune compartments with treatment stratification.",
    previewChips: ["UMAP Atlas", "Treatment Diff", "Patient Tables", "3-Layer Pathway", "Response"],
  },
  {
    id: "GSE274103",
    title: "Spatial",
    scaleBadge: "Visium H&E",
    accent: "violet",
    icon: Microscope,
    previewTitle: "Spatial Transcriptomics",
    previewSummary: "Tissue H&E histology overlaid with spot-level gene expression & cross-patient comparisons.",
    previewChips: ["H&E + Spots", "Expression Overlay", "H&E Stain"],
  },
];

const ACCENT_STYLES: Record<
  AccentColor,
  {
    activeCard: string;
    activeTab: string;
    iconActive: string;
    iconIdle: string;
    dot: string;
    badge: string;
    chip: string;
    hoverBorder: string;
  }
> = {
  teal: {
    activeCard: "bg-teal-500/12 border-teal-400/70 cohort-glow-teal text-slate-100",
    activeTab: "bg-teal-500/15 border-teal-400/70 text-teal-300 cohort-glow-teal",
    iconActive: "text-teal-400",
    iconIdle: "text-teal-400/70 group-hover:text-teal-400",
    dot: "bg-teal-400",
    badge: "bg-teal-500/15 text-teal-300 border-teal-500/30",
    chip: "bg-teal-500/10 text-teal-300 border-teal-500/25",
    hoverBorder: "hover:border-teal-500/45",
  },
  cyan: {
    activeCard: "bg-cyan-500/12 border-cyan-400/70 cohort-glow-cyan text-slate-100",
    activeTab: "bg-cyan-500/15 border-cyan-400/70 text-cyan-300 cohort-glow-cyan",
    iconActive: "text-cyan-400",
    iconIdle: "text-cyan-400/70 group-hover:text-cyan-400",
    dot: "bg-cyan-400",
    badge: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
    chip: "bg-cyan-500/10 text-cyan-300 border-cyan-500/25",
    hoverBorder: "hover:border-cyan-500/45",
  },
  amber: {
    activeCard: "bg-amber-500/12 border-amber-400/70 cohort-glow-amber text-slate-100",
    activeTab: "bg-amber-500/15 border-amber-400/70 text-amber-300 cohort-glow-amber",
    iconActive: "text-amber-400",
    iconIdle: "text-amber-400/70 group-hover:text-amber-400",
    dot: "bg-amber-400",
    badge: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    chip: "bg-amber-500/10 text-amber-300 border-amber-500/25",
    hoverBorder: "hover:border-amber-500/45",
  },
  rose: {
    activeCard: "bg-rose-500/12 border-rose-400/70 cohort-glow-rose text-slate-100",
    activeTab: "bg-rose-500/15 border-rose-400/70 text-rose-300 cohort-glow-rose",
    iconActive: "text-rose-400",
    iconIdle: "text-rose-400/70 group-hover:text-rose-400",
    dot: "bg-rose-400",
    badge: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    chip: "bg-rose-500/10 text-rose-300 border-rose-500/25",
    hoverBorder: "hover:border-rose-500/45",
  },
  violet: {
    activeCard: "bg-violet-500/12 border-violet-400/70 cohort-glow-violet text-slate-100",
    activeTab: "bg-violet-500/15 border-violet-400/70 text-violet-300 cohort-glow-violet",
    iconActive: "text-violet-400",
    iconIdle: "text-violet-400/70 group-hover:text-violet-400",
    dot: "bg-violet-400",
    badge: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    chip: "bg-violet-500/10 text-violet-300 border-violet-500/25",
    hoverBorder: "hover:border-violet-500/45",
  },
  indigo: {
    activeCard: "bg-indigo-500/12 border-indigo-400/70 cohort-glow-indigo text-slate-100",
    activeTab: "bg-indigo-500/15 border-indigo-400/70 text-indigo-300 cohort-glow-indigo",
    iconActive: "text-indigo-400",
    iconIdle: "text-indigo-400/70 group-hover:text-indigo-400",
    dot: "bg-indigo-400",
    badge: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
    chip: "bg-indigo-500/10 text-indigo-300 border-indigo-500/25",
    hoverBorder: "hover:border-indigo-500/45",
  },
  emerald: {
    activeCard: "bg-emerald-500/12 border-emerald-400/70 cohort-glow-emerald text-slate-100",
    activeTab: "bg-emerald-500/15 border-emerald-400/70 text-emerald-300 cohort-glow-emerald",
    iconActive: "text-emerald-400",
    iconIdle: "text-emerald-400/70 group-hover:text-emerald-400",
    dot: "bg-emerald-400",
    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    chip: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
    hoverBorder: "hover:border-emerald-500/45",
  },
};

function getAnalysisTabsForCohort(studyId: string): AnalysisTabDef[] {
  if (studyId === "CPTAC_PDAC") {
    return [
      {
        id: "abundance",
        label: "Tumor vs Normal",
        icon: BarChart3,
        accent: "amber",
        previewTitle: "Global Protein Abundance",
        previewHint: "Volcano plot & paired Tumor–NAT TMT protein distributions.",
        previewChips: ["Volcano", "Paired NAT", "11.7k Proteins"],
      },
      {
        id: "concordance",
        label: "mRNA–Protein",
        icon: GitCompare,
        accent: "amber",
        previewTitle: "Matched Proteogenomic Concordance",
        previewHint: "Compare RNA-seq vs TMT protein fold-changes & sample-level correlation.",
        previewChips: ["Quadrant Plot", "Spearman r", "Discordant Hits"],
      },
      {
        id: "heatmap",
        label: "Heatmap & Co-Expr",
        icon: Grid3X3,
        accent: "amber",
        previewTitle: "Multi-Protein Panel & Co-Expression",
        previewHint: "Clustered protein heatmap with stage tracks & pairwise correlation.",
        previewChips: ["Stage Track", "Gene Panels", "Correlation"],
      },
      {
        id: "survival",
        label: "OS Survival",
        icon: HeartPulse,
        accent: "emerald",
        previewTitle: "Overall Survival Validation",
        previewHint: "Kaplan–Meier, Cox proportional hazards & maxstat optimal cutpoints.",
        previewChips: ["KM Curve", "Cox HR", "maxstat"],
      },
    ];
  }

  if (studyId === "GSE202051") {
    return [
      {
        id: "atlas",
        label: "UMAP Atlas",
        icon: Cpu,
        accent: "rose",
        previewTitle: "Single-Nucleus UMAP Explorer",
        previewHint: "Cell-type & gene-expression manifold across 43 PDAC patients.",
        previewChips: ["20k Stratified", "Broad & Level-2", "Gene Overlay"],
      },
      {
        id: "treatment_comparison",
        label: "Treatment Diff",
        icon: GitCompare,
        accent: "teal",
        previewTitle: "Treatment-Stratified Pseudobulk",
        previewHint: "Compare Treatment-Naïve vs Neoadjuvant RT/CRT by cell compartment.",
        previewChips: ["Pseudobulk", "Naïve vs CRT", "Ductal / TME"],
      },
      {
        id: "pseudobulk_table",
        label: "Patient Tables",
        icon: Table,
        accent: "amber",
        previewTitle: "Sensitivity & Patient-Level Tables",
        previewHint: "Per-patient pseudobulk statistics with CSV export.",
        previewChips: ["43 Patients", "Sensitivity", "CSV Export"],
      },
      {
        id: "pathway_analysis",
        label: "Pathway 3-Layer",
        icon: Activity,
        accent: "indigo",
        previewTitle: "Pathway Remodeling & Divergence",
        previewHint: "3-layer pathway activity shifts across malignant & stromal states.",
        previewChips: ["3-Layer", "Remodeling", "Divergence"],
      },
      {
        id: "response_analysis",
        label: "Response Heatmap",
        icon: Flame,
        accent: "rose",
        previewTitle: "Pathologic Response Heatmap",
        previewHint: "Stratify transcriptional programs across Moderate, Minimal & Poor responders.",
        previewChips: ["Mod / Min / Poor", "Response"],
      },
    ];
  }

  if (studyId === "GSE274103") {
    return [
      {
        id: "he_spots",
        label: "H&E + Spots",
        icon: Scan,
        accent: "violet",
        previewTitle: "Histology + Visium Spots",
        previewHint: "High-resolution H&E tissue slice with spatial capture spot overlay.",
        previewChips: ["Zoom & Pan", "Spot Inspector"],
      },
      {
        id: "expression",
        label: "Expression Overlay",
        icon: Sparkles,
        accent: "violet",
        previewTitle: "Spatial Gene Expression Heatmap",
        previewHint: "Visualize target gene intensity directly on tumor tissue architecture.",
        previewChips: ["Color Scale", "Cross-Patient"],
      },
      {
        id: "he_only",
        label: "H&E Stain",
        icon: Eye,
        accent: "violet",
        previewTitle: "Clean H&E Histology",
        previewHint: "Unobstructed H&E pathology slide for morphologic inspection.",
        previewChips: ["Hi-Res H&E", "No Overlay"],
      },
    ];
  }

  // Tumor vs Normal (TCGA_GTEX) — includes Survival (KM)
  if (studyId === "TCGA_GTEX") {
    return [
      {
        id: "de",
        label: "Volcano & DEGs",
        icon: Layers,
        accent: "cyan",
        previewTitle: "Differential Expression",
        previewHint: "Tumor vs Normal volcano plot & concordant Wilcoxon/voom DEG table.",
        previewChips: ["Volcano Plot", "DEG Table", "Send to Pathways"],
      },
      {
        id: "correlation",
        label: "Co-Expression & Heatmap",
        icon: Grid3X3,
        accent: "cyan",
        previewTitle: "Co-Expression, Signatures & Heatmap",
        previewHint: "Single-gene or multi-gene signature scatter, expression violin & heatmap.",
        previewChips: ["Gene Signatures", "Heatmap", "Violin / Scatter"],
      },
      {
        id: "pathway",
        label: "Pathways",
        icon: GitFork,
        accent: "indigo",
        previewTitle: "ORA & GSEA Pathway Explorer",
        previewHint: "Enrichment bubble/bar plots, GSEA curves, gene matrix & network graph.",
        previewChips: ["ORA / GSEA", "Hallmark / KEGG", "Network"],
      },
      {
        id: "survival",
        label: "Survival (KM)",
        icon: HeartPulse,
        accent: "emerald",
        previewTitle: "Overall Survival (Kaplan–Meier)",
        previewHint: "Kaplan–Meier survival stratification & hazard ratios across 177 PDAC tumors.",
        previewChips: ["KM Curves", "Log-rank p", "Signature Split"],
      },
    ];
  }

  // Bulk SBRT (GSE225767) — Pathologic Treatment Response (NOT survival)
  return [
    {
      id: "de",
      label: "Volcano & DEGs",
      icon: Layers,
      accent: "teal",
      previewTitle: "Differential Expression",
      previewHint: "Pre- vs Post-SBRT volcano plot & searchable DEG table.",
      previewChips: ["Volcano Plot", "DEG Table", "Send to Pathways"],
    },
    {
      id: "correlation",
      label: "Co-Expression & Heatmap",
      icon: Grid3X3,
      accent: "teal",
      previewTitle: "Co-Expression, Signatures & Heatmap",
      previewHint: "Single-gene or multi-gene signature scatter, expression violin & heatmap.",
      previewChips: ["Gene Signatures", "Heatmap", "Violin / Scatter"],
    },
    {
      id: "pathway",
      label: "Pathways",
      icon: GitFork,
      accent: "indigo",
      previewTitle: "ORA & GSEA Pathway Explorer",
      previewHint: "Enrichment bubble/bar plots, GSEA curves, gene matrix & network graph.",
      previewChips: ["ORA / GSEA", "Hallmark / KEGG", "Network"],
    },
    {
      id: "survival",
      label: "Treatment Response",
      icon: Activity,
      accent: "emerald",
      previewTitle: "SBRT Pathologic Response",
      previewHint: "Compare Responders vs Non-Responders across Pre- & Post-SBRT biopsies.",
      previewChips: ["Responders vs NR", "Pre & Post", "Gene Signatures"],
    },
  ];
}

interface PortalNavigationDockProps {
  activeStudy: string;
  activeTab: MainTabId;
  cptacSubTab: CptacSubTabId;
  snSubTab: SnSubTabId;
  spatialViewMode: SpatialViewModeId;
  onSelectStudy: (studyId: string) => void;
  onSelectBulkTab: (tab: "de" | "correlation" | "pathway" | "survival") => void;
  onSelectCptacSubTab: (tab: CptacSubTabId) => void;
  onSelectSnSubTab: (tab: SnSubTabId) => void;
  onSelectSpatialViewMode: (mode: SpatialViewModeId) => void;
  onExitAbout: () => void;
}

export default function PortalNavigationDock({
  activeStudy,
  activeTab,
  cptacSubTab,
  snSubTab,
  spatialViewMode,
  onSelectStudy,
  onSelectBulkTab,
  onSelectCptacSubTab,
  onSelectSnSubTab,
  onSelectSpatialViewMode,
  onExitAbout,
}: PortalNavigationDockProps) {
  const currentCohort = COHORTS.find((c) => c.id === activeStudy) || COHORTS[0];
  const analysisTabs = getAnalysisTabsForCohort(activeStudy);

  const activeAnalysisId =
    activeStudy === "CPTAC_PDAC"
      ? cptacSubTab
      : activeStudy === "GSE202051"
      ? snSubTab
      : activeStudy === "GSE274103"
      ? spatialViewMode
      : activeTab;

  const handleAnalysisClick = (tabId: string) => {
    if (activeStudy === "CPTAC_PDAC") {
      onSelectCptacSubTab(tabId as CptacSubTabId);
    } else if (activeStudy === "GSE202051") {
      onSelectSnSubTab(tabId as SnSubTabId);
    } else if (activeStudy === "GSE274103") {
      onSelectSpatialViewMode(tabId as SpatialViewModeId);
    } else {
      onSelectBulkTab(tabId as "de" | "correlation" | "pathway" | "survival");
    }
  };

  return (
    <nav aria-label="Cohort and Analysis Navigation" className="flex flex-col gap-2.5">
      {/* Row 1: Interactive Cohort Cards (5 Datasets) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {COHORTS.map((cohort, idx) => {
          const Icon = cohort.icon;
          const isActive = activeStudy === cohort.id && activeTab !== "about";
          const style = ACCENT_STYLES[cohort.accent];
          const popoverAlign =
            idx === 0
              ? "left-0"
              : idx === COHORTS.length - 1
              ? "right-0"
              : "left-1/2 -translate-x-1/2";

          return (
            <div key={cohort.id} className="relative group">
              <button
                type="button"
                onClick={() => onSelectStudy(cohort.id)}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl border transition-all duration-200 cursor-pointer flex flex-col gap-1.5 ${
                  isActive
                    ? style.activeCard
                    : `bg-slate-900/70 border-slate-800/90 text-slate-300 hover:bg-slate-900 hover:-translate-y-0.5 ${style.hoverBorder}`
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon
                      className={`w-4 h-4 flex-shrink-0 transition-colors ${
                        isActive ? style.iconActive : style.iconIdle
                      }`}
                    />
                    <span className="text-xs font-bold tracking-tight truncate">
                      {cohort.title}
                    </span>
                  </div>
                  {isActive && (
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${style.dot} animate-pulse`} />
                  )}
                </div>

                <div className="flex items-center justify-between gap-1.5">
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                      isActive
                        ? style.badge
                        : "bg-slate-950/70 text-slate-400 border-slate-800"
                    }`}
                  >
                    {cohort.scaleBadge}
                  </span>
                </div>
              </button>

              {/* Hover Preview Popover */}
              <div
                className={`pointer-events-none opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-150 absolute top-full mt-2 ${popoverAlign} z-50 w-64 bg-slate-950/95 backdrop-blur-md border border-slate-700/90 rounded-xl p-3 shadow-2xl hidden sm:block`}
              >
                <div className="text-[11px] font-bold text-slate-100 leading-tight mb-1">
                  {cohort.previewTitle}
                </div>
                <p className="text-[11px] text-slate-400 leading-snug mb-2">
                  {cohort.previewSummary}
                </p>
                <div className="flex flex-wrap gap-1">
                  {cohort.previewChips.map((chip) => (
                    <span
                      key={chip}
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${style.chip}`}
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Row 2: Context-Aware Analysis Tabs for the Active Cohort */}
      <div
        id="main-tab-controllers"
        className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/60 border border-slate-800/90 rounded-xl p-1.5 shadow-lg"
      >
        {activeTab === "about" ? (
          <div className="flex items-center justify-between w-full px-2 py-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-teal-400">
              <Info className="w-4 h-4" />
              <span>About &amp; Methods</span>
            </div>
            <button
              type="button"
              onClick={onExitAbout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to {currentCohort.title}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-500 border-r border-slate-800 mr-0.5">
              <span className={`w-1.5 h-1.5 rounded-full ${ACCENT_STYLES[currentCohort.accent].dot}`} />
              {currentCohort.title}
            </span>

            {analysisTabs.map((tab, idx) => {
              const Icon = tab.icon;
              const isActive = activeAnalysisId === tab.id;
              const style = ACCENT_STYLES[tab.accent];
              const popoverAlign =
                idx === 0
                  ? "left-0"
                  : idx === analysisTabs.length - 1
                  ? "right-0"
                  : "left-1/2 -translate-x-1/2";

              return (
                <div key={tab.id} className="relative group">
                  <button
                    type="button"
                    onClick={() => handleAnalysisClick(tab.id)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold border transition-all duration-150 cursor-pointer ${
                      isActive
                        ? style.activeTab
                        : `bg-transparent border-transparent text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 ${style.hoverBorder}`
                    }`}
                  >
                    <Icon
                      className={`w-3.5 h-3.5 transition-colors ${
                        isActive ? style.iconActive : style.iconIdle
                      }`}
                    />
                    <span>{tab.label}</span>
                  </button>

                  {/* Hover Preview Popover */}
                  <div
                    className={`pointer-events-none opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-150 absolute top-full mt-2 ${popoverAlign} z-50 w-60 bg-slate-950/95 backdrop-blur-md border border-slate-700/90 rounded-xl p-2.5 shadow-2xl hidden sm:block`}
                  >
                    <div className="text-[11px] font-bold text-slate-100 mb-1">
                      {tab.previewTitle}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug mb-2">
                      {tab.previewHint}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {tab.previewChips.map((chip) => (
                        <span
                          key={chip}
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${style.chip}`}
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </nav>
  );
}
