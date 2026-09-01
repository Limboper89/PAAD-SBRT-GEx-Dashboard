"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search,
  Info,
  ShieldCheck,
  Layers,
  BarChart2,
  Table as TableIcon,
  Grid,
  GitFork,
  AlertTriangle,
  Upload,
  Database,
  Sparkles,
  Play,
  RefreshCw,
  Zap,
  Share2,
  Bot
} from "lucide-react";
import { useAIContext } from "@/components/ai/AIProvider";

import {
  PathwayEnrichmentResult,
  MappingQC,
  PathwayGeneSet,
  DatabaseProvenance
} from "@/types/pathway";
import { runORA, runGSEA, cleanAndMapGeneList, RankedGene } from "@/utils/pathwayEngine";
import { CustomGeneInput } from "./CustomGeneInput";
import { exportToCSV } from "@/utils/exportUtils";
import PathwayBubblePlot from "./PathwayBubblePlot";
import PathwayBarPlot from "./PathwayBarPlot";
import PathwayTable from "./PathwayTable";
import PathwayGeneMatrix from "./PathwayGeneMatrix";
import PathwayComparisonView from "./PathwayComparisonView";
import PathwayDetailModal from "./PathwayDetailModal";
import GSEAEnrichmentCurve from "./GSEAEnrichmentCurve";
import PathwayNetworkGraph from "./PathwayNetworkGraph";

import { DegTransferMetadata } from "@/components/GeneTable";

interface PathwayExplorerProps {
  basePath?: string;
  initialDatasetId?: string;
  initialDegList?: string[];
  initialRankedGenes?: RankedGene[];
  initialMetadata?: DegTransferMetadata;
  onSelectGene?: (gene: string) => void;
}

// ============================================================
// DATA LAYER TYPES
// ============================================================

interface PrecomputedDatasetPayload {
  metadata: {
    datasetId: string;
    datasetName: string;
    comparisonLabel: string;
    generatedAt: string;
    backgroundUniverseSize: number;
    backgroundSource: string;
    degInputCount: number;
    fdrThresholdUsed: number;
  };
  oraResults: PathwayEnrichmentResult[];
  gseaResults: PathwayEnrichmentResult[];
}

/** Ranked gene loaded from JSON dataset file */
interface DatasetRankedGene {
  symbol: string;
  rankMetric: number;
  log2FC: number;
  pValue: number;
  adjPValue?: number;
}

/** QC metadata for cohort GSEA input */
interface CohortGseaQC {
  datasetId: string;
  datasetName: string;
  contrastLabel: string;
  rankingMethod: string;
  totalRanked: number;
  mappedCount: number;
  unmappedCount: number;
  metricMin: number;
  metricMax: number;
  geneSetsAvailable: number;
  status: "idle" | "loading" | "ready" | "running" | "done" | "error";
  errorMessage?: string;
}

// ============================================================
// CONSTANTS
// ============================================================

const DATASET_CONFIG: Record<string, {
  label: string;
  contrast: string;
  rankedFile: string;
  rankingMethod: string;
}> = {
  tcga_gtex: {
    label: "TCGA-PAAD vs GTEx Pancreas",
    contrast: "Primary Tumor vs Normal Reference",
    rankedFile: "tcga_gtex_ranked_genes.json",
    rankingMethod: "sign(log2FC) × −log10(P)"
  },
  gse225767: {
    label: "GSE225767 SBRT Response",
    contrast: "Post-SBRT vs Pre-SBRT",
    rankedFile: "gse225767_ranked_genes.json",
    rankingMethod: "sign(log2FC) × −log10(P)"
  }
};

// ============================================================
// COMPONENT
// ============================================================

export default function PathwayExplorer({
  basePath = "/PAAD-SBRT-GEx-Dashboard",
  initialDatasetId = "tcga_gtex",
  initialDegList,
  initialRankedGenes,
  initialMetadata,
  onSelectGene
}: PathwayExplorerProps) {

  // ── Analysis Source: 4 independent workflows ──────────────
  // "cohort_ora"    → precomputed ORA from cohort DEG list
  // "cohort_gsea"   → genome-wide ranked GSEA from dataset
  // "custom_ora"    → user-entered gene list, ORA
  // "custom_gsea"   → user-entered ranked gene list, GSEA
  const [workflow, setWorkflow] = useState<"cohort_ora" | "cohort_gsea" | "custom_ora" | "custom_gsea">(
    initialRankedGenes && initialRankedGenes.length > 0
      ? "custom_gsea"
      : initialDegList && initialDegList.length > 0
      ? "custom_ora"
      : "cohort_ora"
  );

  // ── Dataset selection (for cohort workflows) ──────────────
  const [datasetId, setDatasetId] = useState<string>(initialDatasetId);

  // ── Filter state ──────────────────────────────────────────
  const [dbFilter, setDbFilter] = useState<string>("All");
  const [fdrThreshold, setFdrThreshold] = useState<number>(0.05);
  const [minOverlap, setMinOverlap] = useState<number>(2);
  const [directionFilter, setDirectionFilter] = useState<string>("All");
  const [keywordSearch, setKeywordSearch] = useState<string>("");

  // ── UI state ──────────────────────────────────────────────
  const [activeView, setActiveView] = useState<"bubble" | "curve" | "bar" | "table" | "matrix" | "network" | "compare">("bubble");
  const [selectedPathway, setSelectedPathway] = useState<PathwayEnrichmentResult | null>(null);
  const [showMethodology, setShowMethodology] = useState<boolean>(false);

  // ── Data Loading ──────────────────────────────────────────
  const [pathwayDatabases, setPathwayDatabases] = useState<PathwayGeneSet[]>([]);
  const [provenanceMap, setProvenanceMap] = useState<Record<string, DatabaseProvenance>>({});
  const [precomputedTcga, setPrecomputedTcga] = useState<PrecomputedDatasetPayload | null>(null);
  const [precomputedSbrt, setPrecomputedSbrt] = useState<PrecomputedDatasetPayload | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // ── COHORT GSEA state (completely independent from custom) ─
  const [cohortGseaQC, setCohortGseaQC] = useState<CohortGseaQC>({
    datasetId: initialDatasetId,
    datasetName: DATASET_CONFIG[initialDatasetId]?.label || "",
    contrastLabel: DATASET_CONFIG[initialDatasetId]?.contrast || "",
    rankingMethod: DATASET_CONFIG[initialDatasetId]?.rankingMethod || "",
    totalRanked: 0,
    mappedCount: 0,
    unmappedCount: 0,
    metricMin: 0,
    metricMax: 0,
    geneSetsAvailable: 0,
    status: "idle"
  });
  const [cohortGseaRankedGenes, setCohortGseaRankedGenes] = useState<RankedGene[]>([]);
  const [cohortGseaResults, setCohortGseaResults] = useState<PathwayEnrichmentResult[]>([]);

  // ── Custom ORA state ──────────────────────────────────────
  const [customOraGeneText, setCustomOraGeneText] = useState<string>(
    initialDegList && initialDegList.length > 0 ? initialDegList.join("\n") : ""
  );
  const [customOraResults, setCustomOraResults] = useState<PathwayEnrichmentResult[]>([]);
  const [customOraMappingQC, setCustomOraMappingQC] = useState<MappingQC | null>(null);

  // ── Custom GSEA state ─────────────────────────────────────
  const [customGseaRankedGenes, setCustomGseaRankedGenes] = useState<RankedGene[]>([]);
  const [customGseaResults, setCustomGseaResults] = useState<PathwayEnrichmentResult[]>([]);

  // ─────────────────────────────────────────────────────────
  // LOAD PATHWAY DATABASES & PRECOMPUTED COHORT DATA
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    async function loadAll() {
      try {
        setIsLoading(true);
        const [hallmarkRes, reactomeRes, goRes, tcgaRes, sbrtRes] = await Promise.all([
          fetch(`${basePath}/data/pathways/hallmark.json`),
          fetch(`${basePath}/data/pathways/reactome.json`),
          fetch(`${basePath}/data/pathways/go_bp.json`),
          fetch(`${basePath}/data/pathways/tcga_gtex_pathways.json`),
          fetch(`${basePath}/data/pathways/sbrt_pathways.json`)
        ]);

        const [hallmarkData, reactomeData, goData] = await Promise.all([
          hallmarkRes.json(), reactomeRes.json(), goRes.json()
        ]);

        const combinedSets: PathwayGeneSet[] = [
          ...hallmarkData.pathways,
          ...reactomeData.pathways,
          ...goData.pathways
        ];
        setPathwayDatabases(combinedSets);
        setProvenanceMap({
          Hallmark: hallmarkData.provenance,
          Reactome: reactomeData.provenance,
          GO_BP: goData.provenance
        });

        if (tcgaRes.ok) setPrecomputedTcga(await tcgaRes.json());
        if (sbrtRes.ok) setPrecomputedSbrt(await sbrtRes.json());

        setIsLoading(false);
      } catch (err) {
        console.error("Failed to load pathway data:", err);
        setIsLoading(false);
      }
    }
    loadAll();
  }, [basePath]);

  // ─────────────────────────────────────────────────────────
  // COHORT ORA: read from precomputed data
  // ─────────────────────────────────────────────────────────
  const activePrecomputed = useMemo(() => {
    return datasetId === "gse225767" ? precomputedSbrt : precomputedTcga;
  }, [datasetId, precomputedTcga, precomputedSbrt]);

  // ─────────────────────────────────────────────────────────
  // COHORT GSEA: Load ranked dataset + run engine
  // ─────────────────────────────────────────────────────────
  const loadAndRunCohortGsea = useCallback(async () => {
    if (pathwayDatabases.length === 0) {
      setCohortGseaQC(prev => ({ ...prev, status: "error", errorMessage: "Pathway databases not loaded yet. Please wait." }));
      return;
    }

    const cfg = DATASET_CONFIG[datasetId];
    if (!cfg) return;

    setCohortGseaResults([]);
    setCohortGseaQC({
      datasetId,
      datasetName: cfg.label,
      contrastLabel: cfg.contrast,
      rankingMethod: cfg.rankingMethod,
      totalRanked: 0,
      mappedCount: 0,
      unmappedCount: 0,
      metricMin: 0,
      metricMax: 0,
      geneSetsAvailable: pathwayDatabases.length,
      status: "loading"
    });

    try {
      console.log(`[GSEA] Loading dataset: ${cfg.rankedFile}`);
      const res = await fetch(`${basePath}/data/pathways/${cfg.rankedFile}`);
      if (!res.ok) throw new Error(`Failed to fetch ${cfg.rankedFile}: ${res.status}`);

      const json = await res.json();
      const rawGenes: DatasetRankedGene[] = json.rankedGenes;

      console.log(`[GSEA] Loaded ${rawGenes.length} ranked genes`);

      // Map symbols against pathway gene universe (case-insensitive)
      const pathwayGeneUniverse = new Set<string>();
      pathwayDatabases.forEach(p => p.genes.forEach(g => pathwayGeneUniverse.add(g)));

      const geneSymbolUpper = new Map<string, string>(); // uppercase -> original
      pathwayGeneUniverse.forEach(g => geneSymbolUpper.set(g.toUpperCase(), g));

      const rankedGenes: RankedGene[] = [];
      const unmappedList: string[] = [];

      rawGenes.forEach(g => {
        const upper = g.symbol.toUpperCase();
        const canonical = geneSymbolUpper.get(upper) || g.symbol;
        // Keep all genes; GSEA uses the full ranked list
        rankedGenes.push({
          symbol: canonical,
          rankMetric: g.rankMetric,
          log2FC: g.log2FC,
          pValue: g.pValue,
          adjPValue: g.adjPValue
        });
        if (!geneSymbolUpper.has(upper)) {
          unmappedList.push(g.symbol);
        }
      });

      const metrics = rankedGenes.map(g => g.rankMetric).filter(Number.isFinite);
      const metricMin = Math.min(...metrics);
      const metricMax = Math.max(...metrics);
      const mappedCount = rankedGenes.length - unmappedList.length;

      console.log(`[GSEA] Total ranked: ${rankedGenes.length}, Mapped to pathway universe: ${mappedCount}, Unmapped: ${unmappedList.length}`);

      setCohortGseaRankedGenes(rankedGenes);
      setCohortGseaQC({
        datasetId,
        datasetName: cfg.label,
        contrastLabel: cfg.contrast,
        rankingMethod: cfg.rankingMethod,
        totalRanked: rankedGenes.length,
        mappedCount,
        unmappedCount: unmappedList.length,
        metricMin,
        metricMax,
        geneSetsAvailable: pathwayDatabases.length,
        status: "running"
      });

      // Run GSEA engine (weighted KS + Mann-Whitney NES/p-value)
      console.log(`[GSEA] Running engine on ${rankedGenes.length} genes × ${pathwayDatabases.length} gene sets`);
      const defaultProv = provenanceMap.Hallmark || { database: "MSigDB Hallmark", version: "v2024.1.Hs", species: "Homo sapiens", identifier: "HGNC", retrievalDate: "2026-08-14", sourceUrl: "https://www.gsea-msigdb.org", license: "CC BY 4.0", redistributionStatus: "permitted" };

      const results = runGSEA(
        rankedGenes,
        pathwayDatabases,
        datasetId,
        cfg.label,
        cfg.contrast,
        defaultProv,
        5,
        500
      );

      const finiteResults = results.filter(r => Number.isFinite(r.nes) && Number.isFinite(r.adjPValue));
      console.log(`[GSEA] Raw results: ${results.length}, Finite: ${finiteResults.length}`);
      console.log(`[GSEA] FDR<0.05: ${finiteResults.filter(r => r.adjPValue < 0.05).length}, FDR<0.25: ${finiteResults.filter(r => r.adjPValue < 0.25).length}`);

      setCohortGseaResults(finiteResults);
      setCohortGseaQC(prev => ({ ...prev, status: "done" }));
    } catch (err: any) {
      console.error("[GSEA] Error:", err);
      setCohortGseaQC(prev => ({
        ...prev,
        status: "error",
        errorMessage: err?.message || "Unknown error loading GSEA data"
      }));
    }
  }, [basePath, datasetId, pathwayDatabases, provenanceMap]);

  // ─────────────────────────────────────────────────────────
  // CUSTOM ORA: run when user provides gene text
  // ─────────────────────────────────────────────────────────
  const runCustomOra = useCallback((mappedGenes: string[], qc: MappingQC) => {
    if (pathwayDatabases.length === 0 || mappedGenes.length === 0) return;
    const backgroundSet = new Set<string>();
    pathwayDatabases.forEach(p => p.genes.forEach(g => backgroundSet.add(g)));
    const defaultProv = provenanceMap.Hallmark || { database: "MSigDB Hallmark", version: "v2024.1.Hs", species: "Homo sapiens", identifier: "HGNC", retrievalDate: "2026-08-14", sourceUrl: "https://www.gsea-msigdb.org", license: "CC BY 4.0", redistributionStatus: "permitted" };
    const results = runORA(mappedGenes, pathwayDatabases, backgroundSet.size, "custom_ora", "Custom Gene List", "User Input", defaultProv, undefined, minOverlap, 5, 500);
    setCustomOraResults(results);
    setCustomOraMappingQC(qc);
    setWorkflow("custom_ora");
  }, [pathwayDatabases, provenanceMap, minOverlap]);

  // ─────────────────────────────────────────────────────────
  // CUSTOM GSEA: run when user provides ranked genes
  // ─────────────────────────────────────────────────────────
  const runCustomGsea = useCallback((rankedGenes: RankedGene[], qc: MappingQC) => {
    if (pathwayDatabases.length === 0 || rankedGenes.length === 0) {
      console.warn('[CUSTOM GSEA] Aborted: pathwayDatabases.length=', pathwayDatabases.length, 'rankedGenes.length=', rankedGenes.length);
      return;
    }

    console.log('[CUSTOM GSEA DEBUG] --- Pipeline Start ---');
    console.log('[CUSTOM GSEA DEBUG] Input ranked genes:', rankedGenes.length);
    console.log('[CUSTOM GSEA DEBUG] Pathway sets loaded:', pathwayDatabases.length);
    console.log('[CUSTOM GSEA DEBUG] First 3 genes:', rankedGenes.slice(0, 3).map(g => `${g.symbol}:${g.rankMetric}`).join(', '));

    const defaultProv = provenanceMap.Hallmark || { database: "MSigDB Hallmark", version: "v2024.1.Hs", species: "Homo sapiens", identifier: "HGNC", retrievalDate: "2026-08-14", sourceUrl: "https://www.gsea-msigdb.org", license: "CC BY 4.0", redistributionStatus: "permitted" };

    // minGeneSetSize=2 so that pathways with ≥2 of the input genes are evaluated
    const results = runGSEA(rankedGenes, pathwayDatabases, "custom_gsea", "Custom Ranked List", "User Input", defaultProv, 2, 500);

    console.log('[CUSTOM GSEA DEBUG] runGSEA returned:', results.length, 'results');

    const finiteResults = results.filter(r => Number.isFinite(r.nes) && Number.isFinite(r.adjPValue));
    console.log('[CUSTOM GSEA DEBUG] Finite NES + FDR results:', finiteResults.length);
    console.log('[CUSTOM GSEA DEBUG] FDR < 0.05:', finiteResults.filter(r => r.adjPValue < 0.05).length);
    console.log('[CUSTOM GSEA DEBUG] FDR < 0.25:', finiteResults.filter(r => r.adjPValue < 0.25).length);
    console.log('[CUSTOM GSEA DEBUG] FDR <= 1.0:', finiteResults.length);
    if (finiteResults.length > 0) {
      const top = [...finiteResults].sort((a, b) => Math.abs(b.nes!) - Math.abs(a.nes!)).slice(0, 3);
      console.log('[CUSTOM GSEA DEBUG] Top 3 results:');
      top.forEach((r, i) => console.log(
        `  ${i+1}. ${r.pathwayName?.slice(0, 45)} | NES=${r.nes?.toFixed(2)} | FDR=${r.adjPValue?.toFixed(4)} | leadingEdge=${r.leadingEdgeGenes?.length} | database=${r.database}`
      ));
    }

    // For small custom lists (<500 genes), auto-relax FDR display threshold
    // Results are still all stored — the user can see them by setting FDR=1.0
    // We also auto-switch the fdrThreshold state so results are immediately visible
    if (rankedGenes.length < 500) {
      console.log('[CUSTOM GSEA DEBUG] Small list detected — auto-relaxing FDR display threshold to 1.0');
      setFdrThreshold(1.0);
    }

    setCustomGseaResults(finiteResults);
    setCustomGseaRankedGenes(rankedGenes);
    setWorkflow("custom_gsea");

    console.log('[CUSTOM GSEA DEBUG] State updated. customGseaResults will contain:', finiteResults.length, 'results');
    console.log('[CUSTOM GSEA DEBUG] --- Pipeline End ---');
  }, [pathwayDatabases, provenanceMap]);

  // Auto-run custom GSEA when initialRankedGenes is transferred from DEG selection
  useEffect(() => {
    if (initialRankedGenes && initialRankedGenes.length > 0 && pathwayDatabases.length > 0) {
      console.log(`[PATHWAY EXPLORER] Received ${initialRankedGenes.length} initial ranked genes from DEG selection`);
      setWorkflow("custom_gsea");
      const backgroundSet = new Set<string>();
      pathwayDatabases.forEach(p => p.genes.forEach(g => backgroundSet.add(g.toUpperCase())));
      const mappedCount = initialRankedGenes.filter(g => backgroundSet.has(g.symbol.toUpperCase())).length;
      const qc: MappingQC = {
        inputGeneCount: initialRankedGenes.length,
        mappedGeneCount: mappedCount,
        unmappedGeneCount: initialRankedGenes.length - mappedCount,
        duplicateSymbolsCount: initialMetadata?.duplicateCount ?? 0,
        mappingRate: mappedCount / Math.max(1, initialRankedGenes.length),
        unmappedSymbols: initialRankedGenes.filter(g => !backgroundSet.has(g.symbol.toUpperCase())).map(g => g.symbol),
        backgroundSource: "Integrated Pathway Database Universe",
        backgroundUniverseSize: backgroundSet.size
      };
      runCustomGsea(initialRankedGenes, qc);
    }
  }, [initialRankedGenes, pathwayDatabases.length, runCustomGsea, initialMetadata]);

  // Auto-run Cohort GSEA when switching workflow to cohort_gsea or changing datasetId while in cohort_gsea
  useEffect(() => {
    if (workflow === "cohort_gsea" && pathwayDatabases.length > 0) {
      if (cohortGseaQC.status === "idle" || cohortGseaQC.datasetId !== datasetId) {
        setFdrThreshold(0.25); // Default to exploratory FDR < 0.25 for genome-wide GSEA
        loadAndRunCohortGsea();
      }
    }
  }, [workflow, datasetId, cohortGseaQC.status, cohortGseaQC.datasetId, pathwayDatabases.length, loadAndRunCohortGsea]);

  // ─────────────────────────────────────────────────────────
  // ACTIVE RESULTS: one authoritative source per workflow
  // ─────────────────────────────────────────────────────────
  const rawActiveResults = useMemo<PathwayEnrichmentResult[]>(() => {
    switch (workflow) {
      case "cohort_ora":
        return activePrecomputed?.oraResults || [];
      case "cohort_gsea":
        return cohortGseaResults;
      case "custom_ora":
        return customOraResults;
      case "custom_gsea":
        return customGseaResults;
      default:
        return [];
    }
  }, [workflow, activePrecomputed, cohortGseaResults, customOraResults, customGseaResults]);

  // ─────────────────────────────────────────────────────────
  // ACTIVE QC: one authoritative QC per workflow
  // ─────────────────────────────────────────────────────────
  const activeQCDisplay = useMemo(() => {
    switch (workflow) {
      case "cohort_ora": {
        if (!activePrecomputed?.metadata) return null;
        const m = activePrecomputed.metadata;
        return {
          label: `${m.degInputCount.toLocaleString()} DEGs mapped`,
          subLabel: `Background: ${m.backgroundUniverseSize.toLocaleString()} genes (${m.backgroundSource})`,
          mode: "ORA"
        };
      }
      case "cohort_gsea": {
        if (cohortGseaQC.status === "idle") return null;
        return {
          label: `${cohortGseaQC.mappedCount.toLocaleString()} / ${cohortGseaQC.totalRanked.toLocaleString()} ranked genes`,
          subLabel: `Metric range: ${cohortGseaQC.metricMin.toFixed(2)} to ${cohortGseaQC.metricMax.toFixed(2)} | ${cohortGseaQC.geneSetsAvailable.toLocaleString()} gene sets`,
          mode: "GSEA"
        };
      }
      case "custom_ora": {
        if (!customOraMappingQC) return null;
        return {
          label: `${customOraMappingQC.mappedGeneCount} / ${customOraMappingQC.inputGeneCount} genes mapped`,
          subLabel: `Background: ${customOraMappingQC.backgroundUniverseSize.toLocaleString()} genes (${customOraMappingQC.backgroundSource})`,
          mode: "ORA"
        };
      }
      case "custom_gsea": {
        if (customGseaRankedGenes.length === 0) return null;
        return {
          label: `${customGseaRankedGenes.length} ranked genes`,
          subLabel: `Custom ranked gene list · ${pathwayDatabases.length.toLocaleString()} gene sets tested`,
          mode: "GSEA"
        };
      }
    }
  }, [workflow, activePrecomputed, cohortGseaQC, customOraMappingQC, customGseaRankedGenes, pathwayDatabases.length]);

  // ─────────────────────────────────────────────────────────
  // APPLY USER FILTERS
  // ─────────────────────────────────────────────────────────
  const analysisMode = workflow === "cohort_gsea" || workflow === "custom_gsea" ? "GSEA" : "ORA";

  const filteredResults = useMemo(() => {
    const afterFdr = rawActiveResults.filter(r => r.adjPValue <= fdrThreshold);
    const afterOverlap = afterFdr.filter(r => analysisMode === "ORA" ? (r.overlapCount ?? 0) >= minOverlap : true);
    const afterDb = afterOverlap.filter(r => {
      if (dbFilter === "All") return true;
      if (dbFilter === "Hallmark") return r.database === "Hallmark" || r.pathwayName.startsWith("Hallmark");
      if (dbFilter === "Reactome") return r.database === "Reactome" || r.pathwayName.startsWith("Reactome");
      if (dbFilter === "GO_BP" || dbFilter === "GO Biological Process") {
        return r.database === "GO_BP" || r.database === "GO Biological Process" || r.pathwayName.startsWith("GO BP");
      }
      return r.database === dbFilter;
    });
    const afterDir = afterDb.filter(r => {
      if (directionFilter === "Upregulated") return r.direction === "Upregulated";
      if (directionFilter === "Downregulated") return r.direction === "Downregulated";
      return true;
    });
    const afterSearch = keywordSearch.trim()
      ? afterDir.filter(r => {
          const q = keywordSearch.toLowerCase().trim();
          return r.pathwayName.toLowerCase().includes(q) ||
            r.contributingGenes.some(g => g.toLowerCase().includes(q));
        })
      : afterDir;

    if ((workflow === "custom_gsea" || workflow === "cohort_gsea") && rawActiveResults.length > 0) {
      console.log('[GSEA FILTER DEBUG] raw:', rawActiveResults.length,
        '→ FDR≤', fdrThreshold, ':', afterFdr.length,
        '→ overlap:', afterOverlap.length,
        '→ db:', afterDb.length,
        '→ dir:', afterDir.length,
        '→ search:', afterSearch.length);
    }

    return afterSearch;
  }, [rawActiveResults, fdrThreshold, minOverlap, dbFilter, directionFilter, keywordSearch, analysisMode, workflow]);

  let aiCtx: any = null;
  try {
    aiCtx = useAIContext();
  } catch (e) {}

  const handleAskCopilotPathway = () => {
    if (aiCtx) {
      const q = selectedPathway
        ? `What does the enrichment result for pathway '${selectedPathway.pathwayName}' mean biologically in ${datasetId}?`
        : `Which Hallmark pathways are enriched in ${datasetId}?`;
      aiCtx.sendMessage(q, "pathway_gsea");
      aiCtx.setChatOpen(true);
    }
  };

  // ─────────────────────────────────────────────────────────
  // LOADING SCREEN
  // ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-teal-400 font-mono text-xs">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-teal-500 mb-3" />
        <p className="tracking-wider">LOADING PATHWAY EXPLORER DATASETS...</p>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 w-full font-sans">

      {/* ── TOP TOOLBAR CARD ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col gap-5 shadow-2xl">

        {/* Header */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-100 flex items-center gap-2">
              <Layers className="w-5 h-5 text-teal-400" />
              <span>Pathway Explorer</span>
              <span className="text-xxs font-mono bg-teal-500/10 text-teal-400 border border-teal-500/30 px-2 py-0.5 rounded font-semibold">
                Pathway Analysis Engine
              </span>
            </h2>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Pathway-level biological interpretation of transcriptomic dysregulation
            </p>
          </div>

          {/* Quick-access shortcut buttons */}
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
            <button
              onClick={handleAskCopilotPathway}
              className="px-3 py-1.5 rounded-xl border border-cyan-700/60 bg-cyan-950/80 text-cyan-300 hover:bg-cyan-900 font-bold flex items-center gap-1.5 transition shadow cursor-pointer"
              title="Ask PDACopilot about these pathway enrichment results"
            >
              <Bot className="w-3.5 h-3.5 text-cyan-400" />
              <span>Ask PDACopilot</span>
            </button>
            <button
              onClick={() => setWorkflow("cohort_ora")}
              className={`px-3 py-1.5 rounded-xl border font-bold flex items-center gap-1.5 transition ${
                workflow === "cohort_ora"
                  ? "bg-teal-500/20 text-teal-300 border-teal-500/40 shadow"
                  : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200"
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Cohort ORA</span>
            </button>

            <button
              onClick={() => setWorkflow("cohort_gsea")}
              className={`px-3 py-1.5 rounded-xl border font-bold flex items-center gap-1.5 transition ${
                workflow === "cohort_gsea"
                  ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40 shadow"
                  : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Cohort GSEA</span>
            </button>
            <button
              onClick={() => setWorkflow("custom_ora")}
              className={`px-3 py-1.5 rounded-xl border font-bold flex items-center gap-1.5 transition ${
                workflow === "custom_ora"
                  ? "bg-teal-500/20 text-teal-300 border-teal-500/40 shadow"
                  : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200"
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Custom ORA</span>
            </button>
            <button
              onClick={() => setWorkflow("custom_gsea")}
              className={`px-3 py-1.5 rounded-xl border font-bold flex items-center gap-1.5 transition ${
                workflow === "custom_gsea"
                  ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40 shadow"
                  : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Custom GSEA</span>
            </button>
          </div>
        </div>

        {/* ── WORKFLOW PANELS ── */}

        {/* COHORT ORA PANEL */}
        {workflow === "cohort_ora" && (
          <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-950 border border-teal-500/20 rounded-xl p-4 font-mono text-xs">
            <div className="flex items-center gap-3">
              <Database className="w-4 h-4 text-teal-400" />
              <div>
                <div className="font-bold text-teal-300 text-xs">COHORT OVER-REPRESENTATION ANALYSIS</div>
                <div className="text-slate-500 text-xxs">Precomputed ORA against DEG list from selected cohort</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-slate-400 font-bold uppercase text-xxs">Dataset:</span>
              <select
                value={datasetId}
                onChange={e => setDatasetId(e.target.value)}
                className="bg-slate-900 text-slate-100 border border-slate-800 rounded-lg px-3 py-1.5 font-medium focus:outline-none focus:border-teal-500 cursor-pointer"
              >
                <option value="tcga_gtex">TCGA-PAAD vs GTEx Pancreas (Tumor vs Normal)</option>
                <option value="gse225767">GSE225767 SBRT Radiotherapy (Post vs Pre)</option>
              </select>
            </div>
          </div>
        )}

        {/* COHORT GSEA PANEL */}
        {workflow === "cohort_gsea" && (
          <div className="flex flex-col gap-4">
            {/* Dataset selector row */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-950 border border-indigo-500/20 rounded-xl p-4 font-mono text-xs">
              <div className="flex items-center gap-3">
                <Layers className="w-4 h-4 text-indigo-400" />
                <div>
                  <div className="font-bold text-indigo-300 text-xs">COHORT GENE SET ENRICHMENT ANALYSIS</div>
                  <div className="text-slate-500 text-xxs">Genome-wide ranked transcriptome from selected dataset</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-slate-400 font-bold uppercase text-xxs">Dataset:</span>
                <select
                  value={datasetId}
                  onChange={e => {
                    setDatasetId(e.target.value);
                    // Reset GSEA state when dataset changes
                    setCohortGseaResults([]);
                    setCohortGseaRankedGenes([]);
                    const cfg = DATASET_CONFIG[e.target.value];
                    if (cfg) {
                      setCohortGseaQC({
                        datasetId: e.target.value,
                        datasetName: cfg.label,
                        contrastLabel: cfg.contrast,
                        rankingMethod: cfg.rankingMethod,
                        totalRanked: 0,
                        mappedCount: 0,
                        unmappedCount: 0,
                        metricMin: 0,
                        metricMax: 0,
                        geneSetsAvailable: pathwayDatabases.length,
                        status: "idle"
                      });
                    }
                  }}
                  className="bg-slate-900 text-slate-100 border border-slate-800 rounded-lg px-3 py-1.5 font-medium focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="tcga_gtex">TCGA-PAAD vs GTEx Pancreas (Tumor vs Normal)</option>
                  <option value="gse225767">GSE225767 SBRT Radiotherapy (Post vs Pre)</option>
                </select>
              </div>
            </div>

            {/* GSEA Input Panel: shows ranked transcriptome info + Run button */}
            <div className="bg-slate-950 border border-indigo-500/30 rounded-xl p-5 font-mono text-xs">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                <span className="font-bold text-indigo-400 text-xs flex items-center gap-2">
                  <Database className="w-4 h-4" />
                  GSEA INPUT — COHORT RANKED TRANSCRIPTOME
                </span>
                <span className="text-xxs text-slate-500">Method: Weighted Kolmogorov-Smirnov · Mann-Whitney NES</span>
              </div>

              {/* Dataset metadata grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <div>
                  <span className="text-slate-500 uppercase tracking-wider block text-xxs">Dataset</span>
                  <span className="font-bold text-slate-100 text-xs">{DATASET_CONFIG[datasetId]?.label}</span>
                </div>
                <div>
                  <span className="text-slate-500 uppercase tracking-wider block text-xxs">Contrast</span>
                  <span className="font-bold text-slate-100 text-xs">{DATASET_CONFIG[datasetId]?.contrast}</span>
                </div>
                <div>
                  <span className="text-slate-500 uppercase tracking-wider block text-xxs">Ranking Metric</span>
                  <span className="font-bold text-indigo-300 text-xs">sign(log2FC) × −log10(P)</span>
                </div>
                <div>
                  <span className="text-slate-500 uppercase tracking-wider block text-xxs">Gene Sets Available</span>
                  <span className="font-bold text-teal-400 text-xs">{pathwayDatabases.length.toLocaleString()}</span>
                </div>
              </div>

              {/* Status / QC / Run button area */}
              {cohortGseaQC.status === "idle" && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-slate-900 border border-indigo-500/20 rounded-lg p-4">
                  <div className="flex-1">
                    <div className="font-bold text-indigo-300">Ready to Load Ranked Transcriptome</div>
                    <div className="text-slate-500 text-xxs mt-1">
                      Click the button to load genome-wide ranked gene list from {DATASET_CONFIG[datasetId]?.label} and run GSEA across {pathwayDatabases.length.toLocaleString()} gene sets.
                    </div>
                    <div className="text-slate-500 text-xxs mt-1">
                      Estimated genes: {datasetId === "tcga_gtex" ? "19,815" : "19,701"} · Full genome-wide ranked transcriptome · No manual entry required.
                    </div>
                  </div>
                  <button
                    onClick={loadAndRunCohortGsea}
                    disabled={pathwayDatabases.length === 0}
                    className="px-5 py-3 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:bg-slate-700 text-white font-bold rounded-xl flex items-center gap-2 transition text-xs whitespace-nowrap shadow-lg cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Run Cohort GSEA ({datasetId === "tcga_gtex" ? "19,815 genes" : "19,701 genes"})</span>
                  </button>
                </div>
              )}

              {cohortGseaQC.status === "loading" && (
                <div className="flex items-center gap-3 bg-slate-900 border border-indigo-500/20 rounded-lg p-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-indigo-500" />
                  <div>
                    <div className="font-bold text-indigo-300">Loading ranked transcriptome...</div>
                    <div className="text-slate-500 text-xxs">Fetching {DATASET_CONFIG[datasetId]?.rankedFile}</div>
                  </div>
                </div>
              )}

              {cohortGseaQC.status === "running" && (
                <div className="flex items-center gap-3 bg-slate-900 border border-indigo-500/20 rounded-lg p-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-indigo-500" />
                  <div>
                    <div className="font-bold text-indigo-300">Running GSEA engine...</div>
                    <div className="text-slate-500 text-xxs">
                      {cohortGseaQC.totalRanked.toLocaleString()} ranked genes × {pathwayDatabases.length.toLocaleString()} gene sets — this may take 10-30 seconds
                    </div>
                  </div>
                </div>
              )}

              {(cohortGseaQC.status === "ready" || cohortGseaQC.status === "done") && (
                <div className="flex flex-col gap-3">
                  {/* QC summary grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-slate-900 border border-slate-800 rounded-lg p-4">
                    <div>
                      <span className="text-slate-500 uppercase tracking-wider block text-xxs">Ranked Genes</span>
                      <span className="font-bold text-teal-400 text-sm">{cohortGseaQC.totalRanked.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 uppercase tracking-wider block text-xxs">In Pathway DB</span>
                      <span className="font-bold text-teal-300 text-sm">{cohortGseaQC.mappedCount.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 uppercase tracking-wider block text-xxs">Not in DB</span>
                      <span className="font-bold text-slate-400 text-sm">{cohortGseaQC.unmappedCount.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 uppercase tracking-wider block text-xxs">Metric Range</span>
                      <span className="font-bold text-slate-200 text-xs">{cohortGseaQC.metricMin.toFixed(1)} to {cohortGseaQC.metricMax.toFixed(1)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 uppercase tracking-wider block text-xxs">Results</span>
                      <span className="font-bold text-indigo-400 text-sm">{cohortGseaResults.length.toLocaleString()} pathways</span>
                    </div>
                  </div>
                  {/* Re-run button for dataset switching */}
                  <div className="flex justify-end">
                    <button
                      onClick={loadAndRunCohortGsea}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-bold rounded-lg flex items-center gap-1.5 transition text-xs"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Re-run GSEA
                    </button>
                  </div>
                </div>
              )}

              {cohortGseaQC.status === "error" && (
                <div className="flex flex-col gap-2 bg-red-950/20 border border-red-800/40 rounded-lg p-4">
                  <div className="font-bold text-red-400 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Error Loading GSEA Data
                  </div>
                  <div className="text-slate-400 text-xxs">{cohortGseaQC.errorMessage}</div>
                  <button
                    onClick={loadAndRunCohortGsea}
                    className="px-3 py-1.5 bg-slate-800 text-slate-300 border border-slate-700 font-bold rounded-lg text-xs self-start"
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CUSTOM ORA / CUSTOM GSEA PANEL — both use CustomGeneInput */}
        {(workflow === "custom_ora" || workflow === "custom_gsea") && (
          <CustomGeneInput
            basePath={basePath}
            pathwayDatabases={pathwayDatabases}
            initialGeneList={initialDegList && initialDegList.length > 0 ? initialDegList : undefined}
            initialRankedGenes={initialRankedGenes}
            importedMetadata={initialMetadata}
            importedSource={initialMetadata?.datasetName ? `Imported from ${initialMetadata.datasetName} (${initialRankedGenes?.length ?? initialDegList?.length ?? 0} genes)` : undefined}
            onRunOra={runCustomOra}
            onRunGsea={(rankedGenes, qc) => {
              runCustomGsea(rankedGenes, qc);
            }}
          />
        )}

        {/* ── FILTER CONTROLS BAR ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 font-mono text-xs">
          <div>
            <label className="block text-xxs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Database Collection
            </label>
            <select
              value={dbFilter}
              onChange={e => setDbFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-teal-500"
            >
              <option value="All">All Collections</option>
              <option value="Hallmark">MSigDB Hallmark</option>
              <option value="Reactome">Reactome Pathways</option>
              <option value="GO_BP">GO Biological Process</option>
            </select>
          </div>

          <div>
            <label className="block text-xxs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              BH FDR Threshold
            </label>
            <select
              value={fdrThreshold}
              onChange={e => setFdrThreshold(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-teal-500"
            >
              <option value={0.01}>FDR &lt; 0.01 (Strict)</option>
              <option value={0.05}>FDR &lt; 0.05 (Standard)</option>
              <option value={0.25}>FDR &lt; 0.25 (Exploratory)</option>
              <option value={1.0}>All Pathways (FDR ≤ 1.0)</option>
            </select>
          </div>

          <div>
            <label className="block text-xxs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Min Overlap Genes
            </label>
            <select
              value={minOverlap}
              onChange={e => setMinOverlap(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-teal-500"
            >
              <option value={2}>&ge; 2 Genes</option>
              <option value={3}>&ge; 3 Genes</option>
              <option value={5}>&ge; 5 Genes</option>
            </select>
          </div>

          <div>
            <label className="block text-xxs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Direction
            </label>
            <select
              value={directionFilter}
              onChange={e => setDirectionFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-teal-500"
            >
              <option value="All">All Directions</option>
              <option value="Upregulated">Upregulated Only</option>
              <option value="Downregulated">Downregulated Only</option>
            </select>
          </div>

          <div>
            <label className="block text-xxs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Filter Pathway Results
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Filter by name or gene..."
                value={keywordSearch}
                onChange={e => setKeywordSearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-teal-500"
              />
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            </div>
          </div>
        </div>
      </div>

      {/* ── QC BANNER ── */}
      {activeQCDisplay && (
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-xl font-mono text-xs">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 border rounded-xl flex items-center justify-center font-bold text-xs ${
              activeQCDisplay.mode === "GSEA"
                ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400"
                : "bg-teal-500/10 border-teal-500/30 text-teal-400"
            }`}>
              {activeQCDisplay.mode}
            </div>
            <div>
              <div className="font-bold text-slate-100">{activeQCDisplay.label}</div>
              <div className="text-xxs text-slate-400 mt-0.5">{activeQCDisplay.subLabel}</div>
            </div>
          </div>
          <button
            onClick={() => setShowMethodology(!showMethodology)}
            className="flex items-center gap-1 text-teal-400 hover:underline font-bold text-xxs"
          >
            <Info className="w-3.5 h-3.5" />
            <span>{showMethodology ? "Hide Methodology" : "Analysis Details"}</span>
          </button>
        </div>
      )}

      {/* ── METHODOLOGY PANEL ── */}
      {showMethodology && (
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 font-mono text-xs text-slate-300 space-y-4 shadow-2xl">
          <div className="flex items-center gap-2 border-b border-slate-850 pb-3">
            <ShieldCheck className="w-5 h-5 text-teal-400" />
            <h3 className="text-sm font-bold text-slate-100">Statistical Engine &amp; Methodology Details</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <h4 className="font-bold text-teal-400 text-xxs uppercase tracking-wider">Over-Representation Analysis (ORA)</h4>
              <p className="text-xxs leading-relaxed text-slate-400">
                Right-tail cumulative Hypergeometric probability P(X &ge; k) using exact Lanczos log-gamma combination formula.
              </p>
              <div className="bg-slate-900 p-2.5 rounded border border-slate-850 text-xxs text-slate-200">
                P(X &ge; k) = &sum; [(K choose x)(N-K choose n-x) / (N choose n)]
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="font-bold text-indigo-400 text-xxs uppercase tracking-wider">Gene Set Enrichment Analysis (GSEA)</h4>
              <p className="text-xxs leading-relaxed text-slate-400">
                Weighted Kolmogorov-Smirnov enrichment score (ES) combined with Mann-Whitney U rank-sum test for calibrated NES and p-values without permutations.
              </p>
              <div className="bg-slate-900 p-2.5 rounded border border-slate-850 text-xxs text-slate-200">
                NES = (E[U] − U_obs) / √Var[U]
              </div>
              <p className="text-xxs text-slate-400">
                FDR correction: Benjamini-Hochberg across all evaluated gene sets.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── DEMONSTRATION MODE WARNING BANNER ── */}
      {workflow === "custom_gsea" && customGseaResults.length > 0 && customGseaRankedGenes.length < 500 && (
        <div className="bg-amber-950/20 border border-amber-700/40 rounded-xl p-3 flex items-start gap-3 font-mono text-xs">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-amber-400">Demonstration Mode — Small Ranked List ({customGseaRankedGenes.length} genes)</span>
            <span className="text-slate-400 ml-2">
              Rank-based enrichment statistics from a small gene list should not be interpreted as statistically significant.
              For biologically valid GSEA, load a full genome-wide ranked transcriptome (~10,000+ genes) using the buttons above.
              Results are shown sorted by |enrichment score| with FDR threshold relaxed to display all pathways.
            </span>
          </div>
        </div>
      )}

      {/* ── MAIN VIEW SWITCHER ── */}
      <div className="flex flex-wrap border-b border-slate-900 bg-slate-900/40 p-1.5 rounded-xl gap-1 self-start font-mono text-xs">
        <button
          onClick={() => setActiveView("bubble")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-semibold transition ${activeView === "bubble" ? "bg-slate-900 text-teal-400 border border-slate-800 shadow" : "text-slate-400 hover:text-white"}`}
        >
          <Layers className="w-4 h-4" />
          {analysisMode === "ORA" ? "ORA Summary Dot Plot" : "GSEA Summary Dot Plot"}
        </button>
        <button
          onClick={() => setActiveView("curve")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-semibold transition ${activeView === "curve" ? "bg-slate-900 text-teal-400 border border-slate-800 shadow" : "text-slate-400 hover:text-white"}`}
        >
          <Zap className="w-4 h-4 text-amber-400" />
          {analysisMode === "ORA" ? "Enrichment Curve (GSEA)" : "Enrichment Curve"}
        </button>
        <button
          onClick={() => setActiveView("table")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-semibold transition ${activeView === "table" ? "bg-slate-900 text-teal-400 border border-slate-800 shadow" : "text-slate-400 hover:text-white"}`}
        >
          <TableIcon className="w-4 h-4" />
          Results Table ({filteredResults.length})
        </button>
        <button
          onClick={() => setActiveView("matrix")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-semibold transition ${activeView === "matrix" ? "bg-slate-900 text-teal-400 border border-slate-800 shadow" : "text-slate-400 hover:text-white"}`}
        >
          <Grid className="w-4 h-4" />
          {analysisMode === "ORA" ? "Gene Overlap Matrix" : "Leading-Edge Matrix"}
        </button>
        <button
          onClick={() => setActiveView("network")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-semibold transition ${activeView === "network" ? "bg-slate-900 text-teal-400 border border-slate-800 shadow" : "text-slate-400 hover:text-white"}`}
        >
          <Share2 className="w-4 h-4 text-indigo-400" />
          {analysisMode === "ORA" ? "Pathway Overlap Network" : "Leading-Edge Network"}
        </button>
        <button
          onClick={() => setActiveView("bar")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-semibold transition ${activeView === "bar" ? "bg-slate-900 text-teal-400 border border-slate-800 shadow" : "text-slate-400 hover:text-white"}`}
        >
          <BarChart2 className="w-4 h-4 text-slate-400" />
          {analysisMode === "ORA" ? "Fold Enrichment Ranking" : "NES Ranking (Secondary)"}
        </button>
        <button
          onClick={() => setActiveView("compare")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-semibold transition ${activeView === "compare" ? "bg-slate-900 text-teal-400 border border-slate-800 shadow" : "text-slate-400 hover:text-white"}`}
        >
          <GitFork className="w-4 h-4" />
          Compare Pathways
        </button>
      </div>

      {/* ── MAIN VIEW AREA ── */}
      <div className="flex-1 space-y-6">
        {filteredResults.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-4 my-4 font-mono shadow-xl">
            <div className="w-12 h-12 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-center">
              <Layers className="w-6 h-6 text-teal-400" />
            </div>

            {/* Cohort GSEA: not yet run */}
            {workflow === "cohort_gsea" && cohortGseaQC.status === "idle" && (
              <div className="flex flex-col items-center gap-2 max-w-md">
                <h3 className="text-base font-bold text-slate-100">Run GSEA to see pathway results</h3>
                <p className="text-xs text-slate-400">
                  Select a dataset above and click <strong>Run GSEA</strong> to load the genome-wide ranked transcriptome and compute enrichment across {pathwayDatabases.length.toLocaleString()} gene sets.
                </p>
                <button
                  onClick={loadAndRunCohortGsea}
                  disabled={pathwayDatabases.length === 0}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white font-bold rounded-xl flex items-center gap-2 transition text-xs mt-2"
                >
                  <Play className="w-4 h-4" />
                  Run GSEA on {DATASET_CONFIG[datasetId]?.label}
                </button>
              </div>
            )}

            {/* Cohort GSEA: running */}
            {workflow === "cohort_gsea" && (cohortGseaQC.status === "loading" || cohortGseaQC.status === "running") && (
              <div className="flex flex-col items-center gap-2 max-w-md">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500" />
                <h3 className="text-base font-bold text-indigo-300">
                  {cohortGseaQC.status === "loading" ? "Loading ranked transcriptome..." : "Running GSEA engine..."}
                </h3>
                <p className="text-xs text-slate-400">
                  {cohortGseaQC.status === "running" && `${cohortGseaQC.totalRanked.toLocaleString()} genes × ${pathwayDatabases.length.toLocaleString()} gene sets`}
                </p>
              </div>
            )}

            {/* No results after filtering */}
            {(workflow !== "cohort_gsea" || (cohortGseaQC.status === "done" && cohortGseaResults.length > 0)) && !keywordSearch.trim() && (
              <div className="flex flex-col items-center gap-2 max-w-md">
                <h3 className="text-base font-bold text-slate-100">No pathways meet the selected statistical criteria</h3>
                <p className="text-xs text-slate-400">
                  0 pathways pass BH FDR &lt; {fdrThreshold} {analysisMode === "ORA" ? `or minimum overlap ≥ ${minOverlap}` : ""} criteria.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
                  <button
                    onClick={() => setFdrThreshold(0.25)}
                    className="bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/30 font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer"
                  >
                    Relax FDR to 0.25
                  </button>
                  <button
                    onClick={() => setFdrThreshold(1.0)}
                    className="bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 px-4 py-2 rounded-xl text-xs transition cursor-pointer"
                  >
                    Show All Pathways
                  </button>
                </div>
              </div>
            )}

            {/* Custom workflows: no data yet */}
            {(workflow === "custom_ora" || workflow === "custom_gsea") && customOraResults.length === 0 && customGseaResults.length === 0 && (
              <div className="flex flex-col items-center gap-2 max-w-md">
                <h3 className="text-base font-bold text-slate-100">
                  {workflow === "custom_ora" ? "Enter a gene list to run ORA" : "Enter a ranked gene list to run GSEA"}
                </h3>
                <p className="text-xs text-slate-400">
                  Use the input panel above to enter genes and click Run.
                </p>
              </div>
            )}

            {/* Keyword search no match */}
            {keywordSearch.trim() && (
              <div className="flex flex-col items-center gap-2 max-w-md">
                <h3 className="text-base font-bold text-slate-100">No pathways match the search filter</h3>
                <button
                  onClick={() => setKeywordSearch("")}
                  className="bg-slate-950 hover:bg-slate-800 text-teal-400 border border-slate-800 font-bold px-4 py-2 rounded-xl text-xs mt-2 transition cursor-pointer"
                >
                  Clear Search Filter
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            {activeView === "bubble" && (
              <PathwayBubblePlot
                results={filteredResults}
                onSelectPathway={p => {
                  setSelectedPathway(p);
                  setActiveView("curve");
                }}
                analysisMode={analysisMode}
              />
            )}
            {activeView === "curve" && (
              <GSEAEnrichmentCurve
                pathway={selectedPathway || filteredResults[0]}
                onClose={() => setSelectedPathway(null)}
              />
            )}
            {activeView === "bar" && (
              <PathwayBarPlot
                results={filteredResults}
                onSelectPathway={p => {
                  setSelectedPathway(p);
                  setActiveView("curve");
                }}
                analysisMode={analysisMode}
              />
            )}
            {activeView === "table" && (
              <PathwayTable
                results={filteredResults}
                onSelectPathway={p => {
                  setSelectedPathway(p);
                  setActiveView("curve");
                }}
                analysisMode={analysisMode}
              />
            )}
            {activeView === "matrix" && (
              <PathwayGeneMatrix
                results={filteredResults}
                onSelectPathway={p => {
                  setSelectedPathway(p);
                  setActiveView("curve");
                }}
                onSelectGene={onSelectGene}
                analysisMode={analysisMode}
              />
            )}
            {activeView === "network" && (
              <PathwayNetworkGraph
                results={filteredResults}
                onSelectPathway={p => {
                  setSelectedPathway(p);
                  setActiveView("curve");
                }}
                analysisMode={analysisMode}
              />
            )}
            {activeView === "compare" && (
              <PathwayComparisonView
                currentResults={filteredResults}
                tcgaResults={precomputedTcga?.oraResults || []}
                sbrtResults={precomputedSbrt?.oraResults || []}
                onSelectPathway={p => {
                  setSelectedPathway(p);
                  setActiveView("curve");
                }}
              />
            )}
          </>
        )}
      </div>

      {/* ── PATHWAY DETAIL MODAL ── */}
      {selectedPathway && (
        <PathwayDetailModal
          pathway={selectedPathway}
          mappingQC={customOraMappingQC}
          onClose={() => setSelectedPathway(null)}
          onSelectGene={onSelectGene}
        />
      )}
    </div>
  );
}
