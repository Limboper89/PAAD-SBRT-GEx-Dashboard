"use client";

import React, { useEffect, useState, useMemo } from "react";
import { 
  Database, 
  Layers, 
  TrendingUp, 
  Search, 
  Settings, 
  Activity, 
  HelpCircle, 
  Cpu,
  Info,
  GitFork,
  HeartPulse,
  Target,
  Sun,
  Moon
} from "lucide-react";
import VolcanoPlot from "@/components/VolcanoPlot";
import Heatmap from "@/components/Heatmap";
import CorrelationPlot from "@/components/CorrelationPlot";
import ExpressionComparison from "@/components/ExpressionComparison";
import GeneTable from "@/components/GeneTable";
import SearchableGeneSelect from "@/components/SearchableGeneSelect";
import AboutView from "@/components/AboutView";
import SingleNucleusExplorer from "@/components/SingleNucleusExplorer";
import SpatialTranscriptomicsView from "@/components/SpatialPrototypeView";
import SummaryCard from "@/components/SummaryCard";
import PathwayExplorer from "@/components/pathways/PathwayExplorer";
import SurvivalExplorer from "@/components/SurvivalExplorer";
import CptacProteomicsExplorer from "@/components/cptac/CptacProteomicsExplorer";
import PortalNavigationDock, {
  CptacSubTabId,
  SnSubTabId,
  SpatialViewModeId,
} from "@/components/PortalNavigationDock";
import { useAIContext } from "@/components/ai/AIProvider";
import { RankedGene } from "@/utils/pathwayEngine";
import { DegTransferMetadata } from "@/components/GeneTable";

interface GeneData {
  gene_name: string;
  gene_index?: number;
  log2FC: number;
  p_value: number;
  adj_p_value?: number;
  // TCGA-GTEx extensions
  id?: string;
  symbol?: string;
  biotype?: string;
  pval?: number;
  qval?: number;
  voom_log2FC?: number;
  voom_qval?: number;
  robust_deg?: boolean;
  pct_tumor_gt1?: number;
  pct_gtex_gt1?: number;
}

interface SnCell {
  id: string;
  umap1: number;
  umap2: number;
  cell_type: string;
  expressions: { [gene: string]: number };
}

// Available study options (added TCGA vs GTEx and CPTAC-PDAC Proteomics)
const STUDIES = [
  { id: "GSE225767", name: "GSE225767: Ductal Adenocarcinoma Bulk RNA-seq", type: "Bulk RNA-seq" },
  { id: "TCGA_GTEX", name: "TCGA-PAAD vs GTEx Pancreas (Normal Reference)", type: "Tumor vs Normal" },
  { id: "CPTAC_PDAC", name: "CPTAC-PDAC (Cell 2021): Global Proteomics & Proteogenomics", type: "Proteogenomics (TMT + RNA-seq)" },
  { id: "GSE274103", name: "GSE274103: Patient Tumor Spatial Transcriptomics", type: "Spatial Transcriptomics" },
  { id: "GSE202051", name: "GSE202051: PDAC Single-Nucleus Reference Atlas", type: "Single-Nucleus" }
];

export default function Dashboard() {
  const [activeStudy, setActiveStudy] = useState<string>("GSE225767");
  // Hard‑coded base path for static export
  const basePath = "/PAAD-SBRT-GEx-Dashboard";
  const [activeTab, setActiveTab] = useState<"de" | "correlation" | "tme" | "sn" | "survival" | "cptac" | "about" | "pathway">("de");
  const [cptacSubTab, setCptacSubTab] = useState<CptacSubTabId>("abundance");
  const [snSubTab, setSnSubTab] = useState<SnSubTabId>("atlas");
  const [spatialViewMode, setSpatialViewMode] = useState<SpatialViewModeId>("he_spots");
  const [portalTheme, setPortalTheme] = useState<"dark" | "light">("dark");

  // Initialize and sync Light / Dark theme class on <html>
  useEffect(() => {
    const saved = localStorage.getItem("pdac_bioportal_theme");
    if (saved === "light" || saved === "dark") {
      setPortalTheme(saved);
      document.documentElement.classList.remove("dark", "light");
      document.documentElement.classList.add(saved);
    }
  }, []);

  const togglePortalTheme = () => {
    const nextTheme = portalTheme === "dark" ? "light" : "dark";
    setPortalTheme(nextTheme);
    localStorage.setItem("pdac_bioportal_theme", nextTheme);
    document.documentElement.classList.remove("dark", "light");
    document.documentElement.classList.add(nextTheme);
    window.dispatchEvent(new CustomEvent("bioportal:theme", { detail: { theme: nextTheme } }));
  };
  const [pathwayInputGenes, setPathwayInputGenes] = useState<string[] | undefined>(undefined);
  const [pathwayInputRankedGenes, setPathwayInputRankedGenes] = useState<RankedGene[] | undefined>(undefined);
  const [pathwayInputMetadata, setPathwayInputMetadata] = useState<DegTransferMetadata | undefined>(undefined);
  
  // Data States (SBRT)
  const [bulkData, setBulkData] = useState<GeneData[]>([]);
  const [expressionData, setExpressionData] = useState<{ samples: string[], conditions: string[], expressions: { [gene: string]: number[] } } | null>(null);
  
  // Data States (TCGA-GTEx)
  const [tcgaGtexData, setTcgaGtexData] = useState<GeneData[]>([]);
  const [tcgaGtexExpressions, setTcgaGtexExpressions] = useState<ArrayBuffer | null>(null);
  const [isTcgaGtexDataLoading, setIsTcgaGtexDataLoading] = useState<boolean>(false);
  const [isTcgaGtexExpressionsLoading, setIsTcgaGtexExpressionsLoading] = useState<boolean>(false);

  // UI Loading/Error States
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Interaction/Filtering States
  const [selectedGene, setSelectedGene] = useState<string | null>("NFE2L2");
  const [selectedVolcanoGenes, setSelectedVolcanoGenes] = useState<Set<string>>(new Set());
  
  // SBRT specific state
  const [heatmapGenes, setHeatmapGenes] = useState<string[]>([]);
  const [expressionGenes, setExpressionGenes] = useState<string[]>([]);
  const [correlationGene1, setCorrelationGene1] = useState<string | null>("NFE2L2");
  const [correlationGene2, setCorrelationGene2] = useState<string | null>("PHGDH");
  
  // TCGA-GTEx specific state
  const [tcgaGtexHeatmapGenes, setTcgaGtexHeatmapGenes] = useState<string[]>([]);
  const [tcgaGtexCorrelationGene1, setTcgaGtexCorrelationGene1] = useState<string | null>("NFE2L2");
  const [tcgaGtexCorrelationGene2, setTcgaGtexCorrelationGene2] = useState<string | null>("PHGDH");

  // Unified Single / Multi-Gene Correlation state (1 gene per axis = single-gene mode; >1 gene = signature mode)
  const [signatureMethod, setSignatureMethod] = useState<"zscore" | "mean">("zscore");
  const [geneSetALabel, setGeneSetALabel] = useState<string>("");
  const [geneSetBLabel, setGeneSetBLabel] = useState<string>("");
  const [geneSetA, setGeneSetA] = useState<string[]>(["NFE2L2"]);
  const [geneSetB, setGeneSetB] = useState<string[]>(["PHGDH"]);
  const [pasteInputA, setPasteInputA] = useState<string>("");
  const [pasteInputB, setPasteInputB] = useState<string>("");

  // Search state in the header for quick selection
  const [headerSearch, setHeaderSearch] = useState<string>("");
  const [searchResults, setSearchResults] = useState<string[]>([]);

  // In-page tab routing from PDACopilot action buttons & URL hash
  useEffect(() => {
    const handleNavigate = (event: Event) => {
      const customEvent = event as CustomEvent<{ action?: string; target?: string }>;
      const action = customEvent.detail?.action?.toUpperCase() || "";
      const target = customEvent.detail?.target || "";

      if (action.includes("CPTAC") || action.includes("PROTEOMIC") || target === "cptac" || target === "proteomics") {
        setActiveTab("cptac");
        setActiveStudy("CPTAC_PDAC");
      } else if (action.includes("SINGLE_NUCLEUS") || target === "sn") {
        setActiveTab("sn");
        setActiveStudy("GSE202051");
      } else if (action.includes("SPATIAL") || target === "spatial" || target === "tme") {
        setActiveTab("tme");
        setActiveStudy("GSE274103");
      } else if (action.includes("SURVIVAL") || action.includes("KM") || target === "survival") {
        setActiveTab("survival");
      } else if (action.includes("GSEA") || action.includes("PATHWAY") || target === "pathway") {
        setActiveTab("pathway");
      } else if (action.includes("CORRELATION") || action.includes("HEATMAP") || target === "correlation") {
        setActiveTab("correlation");
      } else if (action.includes("DEG") || action.includes("EXPRESSION") || target === "de") {
        setActiveTab("de");
      }

      // Smoothly scroll down to tab controllers
      setTimeout(() => {
        const el = document.getElementById("main-tab-controllers");
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 50);
    };

    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "").toLowerCase();
      if (hash === "cptac" || hash === "proteomics" || hash === "proteome") {
        setActiveTab("cptac");
        setActiveStudy("CPTAC_PDAC");
      } else if (hash === "sn" || hash === "single-nucleus") {
        setActiveTab("sn");
        setActiveStudy("GSE202051");
      } else if (hash === "spatial" || hash === "tme") {
        setActiveTab("tme");
        setActiveStudy("GSE274103");
      } else if (hash === "survival" || hash === "km" || hash === "kaplan-meier") {
        setActiveTab("survival");
      } else if (hash === "pathways" || hash === "pathway" || hash === "gsea") {
        setActiveTab("pathway");
      } else if (hash === "correlation" || hash === "heatmap") {
        setActiveTab("correlation");
      } else if (hash === "deg" || hash === "de" || hash === "expression") {
        setActiveTab("de");
      }
    };

    window.addEventListener("bioportal:navigate", handleNavigate);
    window.addEventListener("hashchange", handleHashChange);

    // Initial check on mount if URL contains a hash
    if (window.location.hash) {
      handleHashChange();
    }

    return () => {
      window.removeEventListener("bioportal:navigate", handleNavigate);
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  // Load SBRT data on mount
  useEffect(() => {
    async function loadBulkData() {
      try {
        setIsLoading(true);
        const [res, exprRes] = await Promise.all([
          fetch(`${basePath}/data/GSE225767_DEG_results_with_names.csv`),
          fetch(`${basePath}/data/GSE225767_expression_data.json`),
        ]);
        if (!res.ok) throw new Error("Failed to fetch SBRT DEG results CSV.");
        if (!exprRes.ok) throw new Error("Failed to fetch SBRT expression JSON dataset.");

        const [text, exprData] = await Promise.all([res.text(), exprRes.json()]);
        
        const lines = text.split("\n");
        const parsed: GeneData[] = [];
        
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const cols = line.split(",");
          if (cols.length >= 3) {
            parsed.push({
              gene_name: cols[0].replace(/"/g, ""),
              gene_index: cols[1] ? Number(cols[1]) : undefined,
              log2FC: Number(cols[2]),
              p_value: Number(cols[3]),
              adj_p_value: cols[4] ? Number(cols[4]) : undefined
            });
          }
        }
        
        setBulkData(parsed);
        setExpressionData(exprData);
        
        const topSigGenes = parsed
          .filter(d => d.p_value < 0.05 && Math.abs(d.log2FC) > 1.5)
          .slice(0, 15)
          .map(d => d.gene_name);
           
        setHeatmapGenes(topSigGenes.length ? topSigGenes : ["NFE2L2", "PHGDH", "PSAT1", "CCDC9B", "CA12"]);
        setExpressionGenes(topSigGenes.slice(0, 8));
        
        setIsLoading(false);
      } catch (err: any) {
        console.error(err);
        setErrorMsg("Failed to load GSE225767 bulk RNA-seq dataset. Verify that public/data/GSE225767_DEG_results_with_names.csv and public/data/GSE225767_expression_data.json exist.");
        setIsLoading(false);
      }
    }

    loadBulkData();
  }, [basePath]);

  // Load TCGA-GTEx master results JSON dynamically
  const loadTcgaGtexData = async () => {
    if (tcgaGtexData.length > 0 || isTcgaGtexDataLoading) return;
    try {
      setIsTcgaGtexDataLoading(true);
      const res = await fetch(`${basePath}/data/tcga_gtex/tcga_gtex_DEG_results.json`);
      if (!res.ok) throw new Error("Failed to load TCGA-GTEx DEG results JSON");
      const parsed = await res.json();
      
      // Map JSON entries to fit baseline GeneData properties
      const mapped = parsed.map((d: any) => ({
        ...d,
        gene_name: d.symbol,
        log2FC: d.log2FC,       // Wilcoxon log2FC mean
        p_value: d.pval,        // Wilcoxon raw pval
        adj_p_value: d.qval,    // Wilcoxon FDR
        gene_index: d.index     // Binary file row position index
      }));

      setTcgaGtexData(mapped);
      
      // Initialize Heatmap genes with top robust DEGs
      const topRobust = mapped
        .filter((d: any) => d.robust_deg && Math.abs(d.log2FC) > 3.0)
        .slice(0, 15)
        .map((d: any) => d.gene_name);
        
      setTcgaGtexHeatmapGenes(topRobust.length ? topRobust : ["S100P", "MSLN", "CEACAM6", "PRSS1", "CPA1", "NFE2L2", "PHGDH"]);
      setIsTcgaGtexDataLoading(false);
    } catch (err) {
      console.error(err);
      alert("Failed to load TCGA-GTEx dataset. Please ensure the files in public/data/tcga_gtex exist.");
      setIsTcgaGtexDataLoading(false);
    }
  };

  // Lazy-load TCGA-GTEx binary expression matrix buffer
  const lazyLoadTcgaGtexExpressions = async () => {
    if (tcgaGtexExpressions || isTcgaGtexExpressionsLoading) return;
    try {
      setIsTcgaGtexExpressionsLoading(true);
      const res = await fetch(`${basePath}/data/tcga_gtex/tcga_gtex_expression_matrix.bin`);
      if (!res.ok) throw new Error("Failed to fetch expression matrix binary");
      const buffer = await res.arrayBuffer();
      setTcgaGtexExpressions(buffer);
      setIsTcgaGtexExpressionsLoading(false);
    } catch (err) {
      console.error(err);
      alert("Failed to download TCGA-GTEx sample expression matrix.");
      setIsTcgaGtexExpressionsLoading(false);
    }
  };

  // Trigger lazy loading of binary matrix when correlation or survival is viewed
  useEffect(() => {
    if (activeTab === "survival") {
      if (tcgaGtexData.length === 0 && !isTcgaGtexDataLoading) {
        loadTcgaGtexData();
      }
      if (!tcgaGtexExpressions && !isTcgaGtexExpressionsLoading) {
        lazyLoadTcgaGtexExpressions();
      }
    } else if (activeStudy === "TCGA_GTEX" && activeTab === "correlation" && !tcgaGtexExpressions) {
      lazyLoadTcgaGtexExpressions();
    }
  }, [activeStudy, activeTab, tcgaGtexExpressions, tcgaGtexData.length, isTcgaGtexDataLoading, isTcgaGtexExpressionsLoading]);

  // Sync activeStudy selection while preserving the current analysis view whenever possible
  const handleStudyChange = (studyId: string) => {
    const isBulkTab =
      activeTab === "de" ||
      activeTab === "correlation" ||
      activeTab === "pathway" ||
      activeTab === "survival";

    setActiveStudy(studyId);

    if (studyId === "CPTAC_PDAC") {
      if (activeTab === "correlation") setCptacSubTab("heatmap");
      else if (activeTab === "survival") setCptacSubTab("survival");
      else if (activeTab === "de") setCptacSubTab("abundance");
      setActiveTab("cptac");
    } else if (studyId === "GSE274103" || studyId === "PDAC_Spatial") {
      setActiveTab("tme");
    } else if (studyId === "GSE202051") {
      if (activeTab === "pathway") setSnSubTab("pathway_analysis");
      setActiveTab("sn");
    } else if (studyId === "TCGA_GTEX" || studyId === "GSE225767") {
      if (studyId === "TCGA_GTEX") {
        if (tcgaGtexData.length === 0 && !isTcgaGtexDataLoading) {
          loadTcgaGtexData();
        }
        if ((activeTab === "correlation" || activeTab === "survival") && !tcgaGtexExpressions && !isTcgaGtexExpressionsLoading) {
          lazyLoadTcgaGtexExpressions();
        }
      }

      if (isBulkTab) {
        // Stay on the exact same analysis page (Volcano, Correlation, Pathways, or Response/Survival)
        return;
      }

      // Map equivalent analysis when coming from Proteomics or Single-Nucleus
      if (activeTab === "cptac") {
        if (cptacSubTab === "heatmap") setActiveTab("correlation");
        else if (cptacSubTab === "survival" && studyId === "TCGA_GTEX") setActiveTab("survival");
        else setActiveTab("de");
      } else if (activeTab === "sn" && snSubTab === "pathway_analysis") {
        setActiveTab("pathway");
      } else {
        setActiveTab("de");
      }
    }
  };

  // Cross-filtering: Global select gene handler
  const handleSelectGene = (geneName: string) => {
    setSelectedGene(geneName);

    // If user is in 1-gene vs 1-gene correlation state, rotate the clicked gene into Axis X
    if (geneSetA.length <= 1 && geneSetB.length <= 1) {
      const prevA = geneSetA[0] || "NFE2L2";
      if (prevA !== geneName) {
        setGeneSetB([prevA]);
        setGeneSetA([geneName]);
      }
    }
    
    if (activeStudy === "TCGA_GTEX") {
      if (!tcgaGtexHeatmapGenes.includes(geneName)) {
        setTcgaGtexHeatmapGenes(prev => [geneName, ...prev].slice(0, 35));
      }
      if (tcgaGtexCorrelationGene1 !== geneName) {
        setTcgaGtexCorrelationGene2(tcgaGtexCorrelationGene1);
        setTcgaGtexCorrelationGene1(geneName);
      }
    } else {
      if (!heatmapGenes.includes(geneName)) {
        setHeatmapGenes(prev => [geneName, ...prev].slice(0, 30));
      }
      if (!expressionGenes.includes(geneName)) {
        setExpressionGenes(prev => [geneName, ...prev].slice(0, 10));
      }
      if (correlationGene1 !== geneName) {
        setCorrelationGene2(correlationGene1);
        setCorrelationGene1(geneName);
      }
    }
  };

  // Search autocomplete list from active data
  useEffect(() => {
    if (!headerSearch.trim()) {
      setSearchResults([]);
      return;
    }
    const query = headerSearch.toUpperCase().trim();
    const activeList = activeStudy === "TCGA_GTEX" ? tcgaGtexData : bulkData;
    
    const matches = activeList
      .filter(d => d.gene_name.toUpperCase().startsWith(query))
      .slice(0, 8)
      .map(d => d.gene_name);
    setSearchResults(matches);
  }, [headerSearch, bulkData, tcgaGtexData, activeStudy]);

  // Compute active datasets depending on activeStudy
  const activeBulkData = useMemo(() => {
    return activeStudy === "TCGA_GTEX" ? tcgaGtexData : bulkData;
  }, [activeStudy, tcgaGtexData, bulkData]);

  const activeGeneData = useMemo(() => {
    return activeBulkData.find(d => d.gene_name === selectedGene) || null;
  }, [selectedGene, activeBulkData]);

  const sbrtCalculatedLog2FC = useMemo(() => {
    if (activeStudy === "TCGA_GTEX" || !expressionData || !selectedGene) return null;
    const { conditions, expressions } = expressionData;
    const exprVals = expressions[selectedGene];
    if (!exprVals || exprVals.length === 0) return null;
    const preVals = exprVals.filter((_, idx) => conditions[idx] === "Pre");
    const postVals = exprVals.filter((_, idx) => conditions[idx] === "Post");
    if (preVals.length === 0 || postVals.length === 0) return null;
    const meanPre = preVals.reduce((a, b) => a + b, 0) / preVals.length;
    const meanPost = postVals.reduce((a, b) => a + b, 0) / postVals.length;
    return meanPost - meanPre;
  }, [activeStudy, expressionData, selectedGene]);

  const activeLog2FC = useMemo(() => {
    if (activeStudy !== "TCGA_GTEX" && sbrtCalculatedLog2FC !== null) {
      return sbrtCalculatedLog2FC;
    }
    return activeGeneData?.log2FC ?? 0;
  }, [activeStudy, sbrtCalculatedLog2FC, activeGeneData]);

  // Slice individual gene TPMs from the binary buffer for boxplot visualization
  const tcgaGtexExpressionForSelectedGene = useMemo(() => {
    if (activeStudy !== "TCGA_GTEX" || !tcgaGtexExpressions || tcgaGtexData.length === 0 || !selectedGene) {
      return null;
    }
    const geneObj = tcgaGtexData.find((g) => g.gene_name === selectedGene);
    if (!geneObj || geneObj.gene_index === undefined) return null;
    const offset = geneObj.gene_index * 349 * 4;
    return Array.from(new Float32Array(tcgaGtexExpressions, offset, 349));
  }, [activeStudy, tcgaGtexExpressions, tcgaGtexData, selectedGene]);

  // Slice gene-gene expressions for Correlation plot
  const tcgaGtexCorrelationGene1Expression = useMemo(() => {
    if (activeStudy !== "TCGA_GTEX" || !tcgaGtexExpressions || tcgaGtexData.length === 0 || !tcgaGtexCorrelationGene1) {
      return null;
    }
    const geneObj = tcgaGtexData.find((g) => g.gene_name === tcgaGtexCorrelationGene1);
    if (!geneObj || geneObj.gene_index === undefined) return null;
    const offset = geneObj.gene_index * 349 * 4;
    return Array.from(new Float32Array(tcgaGtexExpressions, offset, 349));
  }, [activeStudy, tcgaGtexExpressions, tcgaGtexData, tcgaGtexCorrelationGene1]);

  const tcgaGtexCorrelationGene2Expression = useMemo(() => {
    if (activeStudy !== "TCGA_GTEX" || !tcgaGtexExpressions || tcgaGtexData.length === 0 || !tcgaGtexCorrelationGene2) {
      return null;
    }
    const geneObj = tcgaGtexData.find((g) => g.gene_name === tcgaGtexCorrelationGene2);
    if (!geneObj || geneObj.gene_index === undefined) return null;
    const offset = geneObj.gene_index * 349 * 4;
    return Array.from(new Float32Array(tcgaGtexExpressions, offset, 349));
  }, [activeStudy, tcgaGtexExpressions, tcgaGtexData, tcgaGtexCorrelationGene2]);

  // Fast map lookup for TCGA-GTEx gene indexes
  const tcgaGtexGeneIndexLookup = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of tcgaGtexData) {
      if (g.gene_name && g.gene_index !== undefined) {
        map.set(g.gene_name, g.gene_index);
      }
    }
    return map;
  }, [tcgaGtexData]);

  // Resolve expression vectors for Gene Set A and Gene Set B
  const geneSetAExpressions = useMemo(() => {
    const out: Array<{ gene: string; values: number[] }> = [];
    for (const sym of geneSetA) {
      if (activeStudy === "TCGA_GTEX") {
        if (!tcgaGtexExpressions) continue;
        const idx = tcgaGtexGeneIndexLookup.get(sym);
        if (idx === undefined) continue;
        const offset = idx * 349 * 4;
        out.push({ gene: sym, values: Array.from(new Float32Array(tcgaGtexExpressions, offset, 349)) });
      } else {
        const vals = expressionData?.expressions[sym];
        if (vals && vals.length > 0) {
          out.push({ gene: sym, values: vals });
        }
      }
    }
    return out;
  }, [geneSetA, activeStudy, tcgaGtexExpressions, tcgaGtexGeneIndexLookup, expressionData]);

  const geneSetBExpressions = useMemo(() => {
    const out: Array<{ gene: string; values: number[] }> = [];
    for (const sym of geneSetB) {
      if (activeStudy === "TCGA_GTEX") {
        if (!tcgaGtexExpressions) continue;
        const idx = tcgaGtexGeneIndexLookup.get(sym);
        if (idx === undefined) continue;
        const offset = idx * 349 * 4;
        out.push({ gene: sym, values: Array.from(new Float32Array(tcgaGtexExpressions, offset, 349)) });
      } else {
        const vals = expressionData?.expressions[sym];
        if (vals && vals.length > 0) {
          out.push({ gene: sym, values: vals });
        }
      }
    }
    return out;
  }, [geneSetB, activeStudy, tcgaGtexExpressions, tcgaGtexGeneIndexLookup, expressionData]);

  // Stats calculation
  const stats = useMemo(() => {
    if (activeBulkData.length === 0) return { total: 0, up: 0, down: 0, sig: 0 };
    
    if (activeStudy === "TCGA_GTEX") {
      // In TCGA-GTEx, stats are calculated using Wilcoxon qval (FDR) < 0.05
      const sig = activeBulkData.filter(d => d.qval !== undefined && d.qval < 0.05);
      return {
        total: activeBulkData.length,
        up: sig.filter(d => d.log2FC > 0).length,
        down: sig.filter(d => d.log2FC < 0).length,
        sig: sig.length
      };
    } else {
      // SBRT uses p_value < 0.05
      const sig = activeBulkData.filter(d => d.p_value < 0.05);
      return {
        total: activeBulkData.length,
        up: sig.filter(d => d.log2FC > 0).length,
        down: sig.filter(d => d.log2FC < 0).length,
        sig: sig.length
      };
    }
  }, [activeBulkData, activeStudy]);

  // Active module key for context-aware summary statistics
  const activeModuleKey = useMemo<"bulk" | "spatial" | "singleNucleus" | "cptac">(() => {
    if (activeTab === "cptac" || activeStudy === "CPTAC_PDAC") return "cptac";
    if (activeTab === "sn" || activeStudy === "GSE202051") return "singleNucleus";
    if (activeTab === "tme" || activeStudy === "GSE274103" || activeStudy === "PDAC_Spatial") return "spatial";
    return "bulk";
  }, [activeTab, activeStudy]);

  const { registerModuleContext, activeContext, setCurrentFigure } = useAIContext();

  // Dynamic available figures based on active tab
  const availableFigures = useMemo(() => {
    switch (activeTab) {
      case "correlation":
        return [
          "Correlation Scatter Plot",
          "Expression Heatmap",
          "Expression Comparison (Distribution)"
        ];
      case "de":
        return [
          "Volcano Plot",
          "Differential Expression Table"
        ];
      case "survival":
        return [
          "Kaplan-Meier Survival Plot",
          "Pathologic Response Bar Chart"
        ];
      case "cptac":
        return [
          "Tumor vs Normal Protein Volcano & Distribution",
          "Matched mRNA-vs-Protein Proteogenomics Concordance",
          "Multi-Protein Heatmap & Signature Correlation",
          "CPTAC-PDAC Overall Survival (Cox PH & maxstat KM)"
        ];
      case "sn":
        return [
          "Single-Nucleus UMAP Atlas",
          "Treatment-Stratified Comparison",
          "Cell Lineage Distribution"
        ];
      case "tme":
        return [
          "Spatial Visium Spot Map",
          "H&E Histology Alignment Overlay",
          "Cross-Patient Spatial Expression"
        ];
      case "pathway":
        return [
          "Pathway Enrichment Dot Plot",
          "GSEA Running Score Plot",
          "Pathway Gene Membership"
        ];
      default:
        return ["Documentation & Methods"];
    }
  }, [activeTab]);

  const defaultFigureForTab = useMemo(() => {
    switch (activeTab) {
      case "correlation": return "Correlation Scatter Plot";
      case "de": return "Volcano Plot";
      case "survival": return "Kaplan-Meier Survival Plot";
      case "cptac": return "Tumor vs Normal Protein Volcano & Distribution";
      case "sn": return "Single-Nucleus UMAP Atlas";
      case "tme": return "Spatial Visium Spot Map";
      case "pathway": return "Pathway Enrichment Dot Plot";
      default: return "Documentation & Methods";
    }
  }, [activeTab]);

  const activeFigure = activeContext.currentFigure || defaultFigureForTab;

  // Sync state to PDACopilot context provider
  useEffect(() => {
    if (activeTab === "cptac" || activeStudy === "CPTAC_PDAC") return;
    const studyObj = STUDIES.find(s => s.id === activeStudy);
    const studyName = studyObj ? studyObj.name : activeStudy;

    const moduleLabel = activeStudy === "TCGA_GTEX" ? "TCGA-GTEx" : activeStudy === "GSE202051" ? "Single Nucleus" : activeStudy === "GSE274103" ? "Spatial" : "SBRT Bulk";
    const currentHeatmapGenes = activeStudy === "TCGA_GTEX" ? tcgaGtexHeatmapGenes : heatmapGenes;

    registerModuleContext({
      module: moduleLabel,
      gene: selectedGene,
      dataset: studyName,
      currentFigure: defaultFigureForTab,
      availableFigures: availableFigures,
      heatmapGenes: currentHeatmapGenes,
      filters: {
        log2fcThreshold: 1.0,
        pValueThreshold: 0.05
      },
      tcgaStats: activeStudy === "TCGA_GTEX" ? {
        log2FC: activeGeneData?.log2FC,
        pval: activeGeneData?.p_value,
        qval: activeGeneData?.adj_p_value,
        correlationGene1: tcgaGtexCorrelationGene1,
        correlationGene2: tcgaGtexCorrelationGene2
      } : undefined,
      sbrtStats: activeStudy !== "TCGA_GTEX" ? {
        log2FC: activeLog2FC ?? activeGeneData?.log2FC,
        p_value: activeGeneData?.p_value,
        adj_p_value: activeGeneData?.adj_p_value,
        treatment: "SBRT Radiotherapy Pre vs Post"
      } : undefined
    });
  }, [
    activeStudy,
    activeTab,
    defaultFigureForTab,
    availableFigures,
    selectedGene,
    activeGeneData,
    activeLog2FC,
    heatmapGenes,
    tcgaGtexHeatmapGenes,
    correlationGene1,
    correlationGene2,
    tcgaGtexCorrelationGene1,
    tcgaGtexCorrelationGene2,
    registerModuleContext
  ]);

  // Context-aware summary cards configuration for active module
  const summaryCards = useMemo(() => {
    if (activeModuleKey === "cptac") {
      return [
        {
          title: "Quantified Proteins",
          value: "11,662",
          icon: Database,
          valueColorClass: "text-amber-300",
          iconClass: "text-amber-500/50",
        },
        {
          title: "Samples (Tumor / NAT)",
          value: "140 / 75",
          icon: Layers,
          valueColorClass: "text-emerald-400",
          iconClass: "text-emerald-500/50",
        },
        {
          title: "Matched mRNA-Protein",
          value: "11,651",
          icon: GitFork,
          valueColorClass: "text-sky-400",
          iconClass: "text-sky-500/50",
        },
        {
          title: "OS Follow-Up Cases",
          value: "134 (76 Events)",
          icon: HeartPulse,
          valueColorClass: "text-rose-400",
          iconClass: "text-rose-500/50",
        },
      ];
    }

    if (activeModuleKey === "singleNucleus") {
      return [
        {
          title: "Searchable Genes",
          value: "22,164",
          icon: Database,
          valueColorClass: "text-slate-200",
          iconClass: "text-indigo-500/50",
        },
        {
          title: "Atlas Nuclei",
          value: "224,988",
          icon: Activity,
          valueColorClass: "text-teal-400",
          iconClass: "text-teal-500/50",
        },
        {
          title: "Visualization Subset",
          value: "20,000",
          icon: Layers,
          valueColorClass: "text-amber-400",
          iconClass: "text-amber-500/50",
        },
        {
          title: "Patients",
          value: "43",
          icon: Cpu,
          valueColorClass: "text-indigo-400",
          iconClass: "text-indigo-500/50",
        },
      ];
    }

    if (activeModuleKey === "spatial") {
      return [
        {
          title: "Searchable Genes",
          value: "17,943",
          icon: Database,
          valueColorClass: "text-slate-200",
          iconClass: "text-indigo-500/50",
        },
        {
          title: "Spatial Spots",
          value: "23,436",
          icon: Activity,
          valueColorClass: "text-teal-400",
          iconClass: "text-teal-500/50",
        },
        {
          title: "Tissue Sections",
          value: "5 Sections",
          icon: Layers,
          valueColorClass: "text-amber-400",
          iconClass: "text-amber-500/50",
        },
        {
          title: "Patients",
          value: "5 Cases",
          icon: Cpu,
          valueColorClass: "text-indigo-400",
          iconClass: "text-indigo-500/50",
        },
      ];
    }

    // Default: Bulk Transcriptomics
    return [
      {
        title: "Total Genes",
        value: stats.total.toLocaleString(),
        icon: Database,
        valueColorClass: "text-slate-200",
        iconClass: "text-indigo-500/50",
      },
      {
        title: "Upregulated (Sig)",
        value: stats.up.toLocaleString(),
        icon: TrendingUp,
        valueColorClass: "text-red-400",
        iconClass: "text-red-500/50",
      },
      {
        title: "Downregulated (Sig)",
        value: stats.down.toLocaleString(),
        icon: TrendingUp,
        valueColorClass: "text-blue-400",
        iconClass: "text-blue-500/50 transform rotate-180",
      },
      {
        title: activeStudy === "TCGA_GTEX" ? "Significant (FDR<0.05)" : "Significant (p<0.05)",
        value: stats.sig.toLocaleString(),
        icon: Settings,
        valueColorClass: "text-teal-400",
        iconClass: "text-teal-500/50 animate-pulse",
      },
    ];
  }, [activeModuleKey, stats, activeStudy]);

  // Combined loading states
  const showPageLoader = isLoading || (activeStudy === "TCGA_GTEX" && isTcgaGtexDataLoading && tcgaGtexData.length === 0);

  if (showPageLoader) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center min-h-screen bg-slate-950 text-slate-200">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-500 mb-4"></div>
        <p className="text-sm font-semibold tracking-wider text-teal-400 font-mono">LOADING PORTAL DATASET...</p>
        <p className="text-xs text-slate-500 mt-1 font-mono">
          {activeStudy === "TCGA_GTEX" ? "Downloading TCGA vs GTEx baseline DE results (7.1 MB)..." : "Parsing SBRT bulk DEG and expression files..."}
        </p>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center min-h-screen bg-slate-950 text-red-400 p-6 text-center font-mono">
        <Database className="w-16 h-16 mb-4 text-red-500" />
        <h2 className="text-xl font-bold mb-2">Dataset Load Failure</h2>
        <p className="max-w-md text-sm text-slate-400">{errorMsg}</p>
      </div>
    );
  }

  // Create hardcoded 349 sample names to pass to co-expression components
  const tcgaGtexSampleNames = Array.from({ length: 349 }, (_, i) => {
    if (i < 178) return `TCGA PAAD #${i + 1}`;
    if (i < 345) return `GTEx Normal #${i - 177}`;
    return `TCGA Solid Normal #${i - 344}`;
  });

  return (
    <div className="flex flex-col flex-1 min-h-screen bg-slate-950 bg-grid-pattern bg-blend-overlay">
      {/* Premium Header */}
      <header className="border-b border-slate-900 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
        <div 
          className="flex items-center cursor-pointer group"
          onClick={() => setActiveTab("de")}
          title="PDAC BioPortal - Home"
        >
          <img 
            src={`${basePath}/pdac_bioportal_logo_transparent.png?v=2`} 
            alt="PDAC BioPortal - A Multicohort Transcriptomics & Translational Knowledgebase" 
            className="h-16 sm:h-20 md:h-24 lg:h-28 w-auto object-contain transition-all duration-200 group-hover:scale-[1.02] drop-shadow-[0_2px_12px_rgba(56,189,248,0.15)]"
          />
        </div>

        {/* Search & Study dropdown controllers */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Global Search Bar */}
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder="Search target gene (e.g. NFE2L2)..."
              value={headerSearch}
              onChange={(e) => setHeaderSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors w-60 font-mono"
            />
            {searchResults.length > 0 && (
              <div className="absolute left-0 right-0 mt-1.5 bg-slate-950 border border-slate-800 rounded-lg shadow-2xl z-50 overflow-hidden font-mono">
                {searchResults.map(gene => (
                  <button
                    key={gene}
                    onClick={() => {
                      handleSelectGene(gene);
                      setHeaderSearch("");
                    }}
                    className="w-full text-left px-4 py-2 text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition-colors border-b border-slate-900 last:border-0"
                  >
                    {gene}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* About / Methods Compact Header Trigger */}
          <button
            type="button"
            onClick={() => setActiveTab(activeTab === "about" ? (activeStudy === "CPTAC_PDAC" ? "cptac" : activeStudy === "GSE202051" ? "sn" : activeStudy === "GSE274103" ? "tme" : "de") : "about")}
            title="About PDAC BioPortal & Methods"
            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-mono font-medium transition-all cursor-pointer shadow-sm ${
              activeTab === "about"
                ? "bg-teal-500/15 border-teal-400/60 text-teal-300"
                : "border-slate-800 bg-slate-950 hover:bg-slate-800 text-slate-300"
            }`}
          >
            <HelpCircle className="w-4 h-4 text-teal-400" />
            <span>Methods</span>
          </button>

          {/* Light / Dark Mode Toggle Button */}
          <button
            type="button"
            onClick={togglePortalTheme}
            title={portalTheme === "dark" ? "Switch to Light Mode (Clinical Paper View)" : "Switch to Dark Mode (High-Contrast Dark View)"}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-800 bg-slate-950 hover:bg-slate-800 text-xs font-mono font-medium text-slate-200 transition-all cursor-pointer shadow-sm"
          >
            {portalTheme === "dark" ? (
              <>
                <Sun className="w-4 h-4 text-amber-400" />
                <span>Light</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-indigo-400" />
                <span>Dark</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Viewport Container */}
      <main className="flex-1 p-6 flex flex-col gap-5 max-w-7xl mx-auto w-full">
        {/* Interactive Cohort Switcher + Context-Aware Analysis Tabs (Above Gene & Summary Cards) */}
        <PortalNavigationDock
          activeStudy={activeStudy}
          activeTab={activeTab}
          cptacSubTab={cptacSubTab}
          snSubTab={snSubTab}
          spatialViewMode={spatialViewMode}
          onSelectStudy={handleStudyChange}
          onSelectBulkTab={(tab) => {
            setActiveTab(tab);
            if (tab === "survival" && activeStudy === "TCGA_GTEX") {
              if (tcgaGtexData.length === 0) loadTcgaGtexData();
              if (!tcgaGtexExpressions) lazyLoadTcgaGtexExpressions();
            }
          }}
          onSelectCptacSubTab={(sub) => {
            setActiveStudy("CPTAC_PDAC");
            setActiveTab("cptac");
            setCptacSubTab(sub);
          }}
          onSelectSnSubTab={(sub) => {
            setActiveStudy("GSE202051");
            setActiveTab("sn");
            setSnSubTab(sub);
          }}
          onSelectSpatialViewMode={(mode) => {
            setActiveStudy("GSE274103");
            setActiveTab("tme");
            setSpatialViewMode(mode);
          }}
          onExitAbout={() => handleStudyChange(activeStudy)}
        />

        {/* Global Active Gene Highlight card */}
        {activeGeneData && activeTab !== "cptac" && (
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-xl">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-center font-bold text-amber-500 text-base">
                {activeGeneData.gene_name.slice(0, 2)}
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="text-base font-bold text-slate-100">{activeGeneData.gene_name}</span>
                  <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded font-mono">
                    Index: #{activeGeneData.gene_index ?? "N/A"}
                  </span>
                  
                  {/* Concordant DEG Tooltip Badge (TCGA-GTEx only) */}
                  {activeStudy === "TCGA_GTEX" && activeGeneData.robust_deg && (
                    <div className="group relative inline-flex items-center gap-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded cursor-help">
                      <span>Concordant DEG</span>
                      <HelpCircle className="w-3.5 h-3.5 text-amber-500" />
                      <span className="pointer-events-none absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 bg-slate-950 border border-slate-800 text-slate-300 text-[9px] p-2 rounded shadow-2xl w-48 font-normal leading-normal opacity-0 group-hover:opacity-100 transition-opacity z-50">
                        Significant with concordant direction across Wilcoxon and limma-voom analyses under predefined thresholds.
                      </span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">Active selection target for cohort distributions and co-expression</p>
              </div>
            </div>

            <div className="flex items-center gap-6 text-xs border-l border-slate-800 pl-0 sm:pl-6 font-mono">
              <div>
                <span className="text-slate-500 block">
                  {activeStudy === "TCGA_GTEX" ? "Wilcoxon log2FC" : "log2 Fold Change"}
                </span>
                <span className={`font-mono font-bold text-sm ${activeLog2FC > 0 ? "text-red-400" : "text-blue-400"}`}>
                  {activeLog2FC > 0 ? "+" : ""}{activeLog2FC.toFixed(4)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">
                  {activeStudy === "TCGA_GTEX" ? "Wilcoxon FDR" : "p-value"}
                </span>
                <span className="font-mono font-bold text-slate-200 text-sm">
                  {activeStudy === "TCGA_GTEX" 
                    ? (activeGeneData.qval ? activeGeneData.qval.toExponential(3) : "N/A") 
                    : activeGeneData.p_value.toExponential(3)
                  }
                </span>
              </div>
              {activeStudy === "TCGA_GTEX" ? (
                <>
                  <div>
                    <span className="text-slate-500 block">voom log2FC</span>
                    <span className={`font-mono font-bold text-sm ${activeGeneData.voom_log2FC && activeGeneData.voom_log2FC > 0 ? "text-red-400/80" : "text-blue-400/80"}`}>
                      {activeGeneData.voom_log2FC ? `${activeGeneData.voom_log2FC > 0 ? "+" : ""}${activeGeneData.voom_log2FC.toFixed(3)}` : "N/A"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">voom FDR</span>
                    <span className="font-mono font-bold text-slate-300 text-sm">
                      {activeGeneData.voom_qval ? activeGeneData.voom_qval.toExponential(3) : "N/A"}
                    </span>
                  </div>
                </>
              ) : (
                <div>
                  <span className="text-slate-500 block">Adj. p-value</span>
                  <span className="font-mono font-bold text-slate-200 text-sm">
                    {activeGeneData.adj_p_value ? activeGeneData.adj_p_value.toExponential(3) : "N/A"}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Global Statistics Grid */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {summaryCards.map((card, idx) => (
            <SummaryCard
              key={`${activeModuleKey}-${idx}-${card.title}`}
              title={card.title}
              value={card.value}
              icon={card.icon}
              valueColorClass={card.valueColorClass}
              iconClass={card.iconClass}
            />
          ))}
        </section>

        {/* Tab Content Rendering */}
        <section className="flex-1 flex flex-col gap-6">
          {/* Bulk Transcriptomics Download Utility Strip */}
          {(activeTab === "de" || activeTab === "correlation") && (
            <div className="flex justify-end items-center gap-2.5 text-xxs font-mono">
              {activeStudy === "TCGA_GTEX" ? (
                <a
                  href={`${basePath}/data/tcga_gtex/tcga_gtex_DEG_results.json`}
                  download="tcga_gtex_DEG_results.json"
                  className="bg-teal-500 hover:bg-teal-600 text-slate-950 px-3 py-1.5 rounded-lg font-bold shadow-md transition-colors"
                >
                  Download TCGA-GTEx DEGs (7.1 MB JSON)
                </a>
              ) : (
                <a
                  href={`${basePath}/data/GSE225767_DEG_results_with_names.csv`}
                  download="GSE225767_DEG_results_with_names.csv"
                  className="bg-indigo-500 hover:bg-indigo-600 text-slate-100 px-3 py-1.5 rounded-lg font-bold shadow-md transition-colors"
                >
                  Download SBRT DEGs (805 KB CSV)
                </a>
              )}
            </div>
          )}

          {activeTab === "de" && (
            <div className="flex flex-col gap-6">
              <div className="h-[480px]">
                <VolcanoPlot
                  data={activeBulkData}
                  selectedGene={selectedGene}
                  selectedGenes={selectedVolcanoGenes}
                  onSelectGene={handleSelectGene}
                  isTcgaGtex={activeStudy === "TCGA_GTEX"}
                />
              </div>
              <div className="w-full">
                <GeneTable
                  data={activeBulkData}
                  selectedGene={selectedGene}
                  selectedGenes={selectedVolcanoGenes}
                  onSelectedGenesChange={setSelectedVolcanoGenes}
                  onSelectGene={handleSelectGene}
                  isTcgaGtex={activeStudy === "TCGA_GTEX"}
                  onRunPathwayAnalysis={(genes, rankedGenes, metadata) => {
                    setPathwayInputGenes(genes);
                    setPathwayInputRankedGenes(rankedGenes);
                    setPathwayInputMetadata(metadata);
                    setActiveTab("pathway");
                  }}
                />
              </div>
            </div>
          )}

          {activeTab === "correlation" && (
            <div className="flex flex-col gap-6">
              {/* Unified Co-Expression Selector Panel (1 gene = Single-Gene mode; 2+ genes = Signature mode) */}
              <div className="bg-slate-900/40 p-4 border border-slate-800 rounded-xl flex flex-col gap-3.5">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-2.5 border-b border-slate-800/80">
                  <div className="flex items-center gap-2.5 flex-wrap font-mono text-xs">
                    <span className="text-slate-200 font-bold uppercase tracking-wider">
                      Co-Expression Axis Selection
                    </span>
                    <span className="bg-teal-500/15 text-teal-300 border border-teal-500/30 px-2.5 py-0.5 rounded-full text-[10px] font-semibold">
                      {geneSetA.length > 1 || geneSetB.length > 1
                        ? `Gene-Set Signature Mode (${geneSetAExpressions.length} × ${geneSetBExpressions.length} genes)`
                        : "Single-Gene Mode (Add 2+ genes to either axis for signature correlation)"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap font-mono text-xs">
                    {(geneSetA.length > 1 || geneSetB.length > 1) ? (
                      <>
                        <span className="text-slate-400">Scoring:</span>
                        <select
                          value={signatureMethod}
                          onChange={(e) => setSignatureMethod(e.target.value as "zscore" | "mean")}
                          className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-teal-300 font-semibold focus:outline-none focus:border-teal-500 cursor-pointer text-[11px]"
                        >
                          <option value="zscore">Mean Z-Score (Standardized)</option>
                          <option value="mean">Mean log₂ Expression</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            setGeneSetA([geneSetA[0] || "NFE2L2"]);
                            setGeneSetB([geneSetB[0] || "PHGDH"]);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 text-[11px] cursor-pointer"
                        >
                          Reset to 1×1 Gene
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* X-Axis Gene(s) / Set A */}
                  <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                        <span className="text-xs font-bold text-teal-400 font-mono uppercase tracking-wider shrink-0">
                          X-Axis ({geneSetAExpressions.length}):
                        </span>
                        <input
                          type="text"
                          value={geneSetALabel}
                          onChange={(e) => setGeneSetALabel(e.target.value)}
                          placeholder={geneSetA.length === 1 ? `${geneSetA[0]} (or type custom set/index name...)` : "Custom X-Axis Name (e.g. Serine Transport Index)"}
                          className="flex-1 px-2.5 py-1 bg-slate-900 border border-slate-700/80 rounded-lg text-xs text-slate-100 placeholder:text-slate-500 font-mono focus:outline-none focus:border-teal-400"
                        />
                        {geneSetALabel && (
                          <button
                            type="button"
                            onClick={() => setGeneSetALabel("")}
                            className="text-[10px] font-mono text-slate-400 hover:text-rose-400 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 cursor-pointer"
                            title="Reset custom X-axis name"
                          >
                            Reset Name
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 font-mono text-[10px]">
                        {selectedVolcanoGenes.size > 0 && (
                          <button
                            type="button"
                            onClick={() => setGeneSetA(Array.from(selectedVolcanoGenes).slice(0, 50))}
                            className="px-2 py-0.5 rounded bg-teal-500/15 text-teal-300 border border-teal-500/30 hover:bg-teal-500/25 cursor-pointer"
                            title="Import genes checked in the Gene Expression Data Table"
                          >
                            Use Table Selection ({selectedVolcanoGenes.size})
                          </button>
                        )}
                        {geneSetA.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setGeneSetA([geneSetA[0]])}
                            className="px-2 py-0.5 rounded bg-slate-900 text-slate-400 hover:text-rose-400 border border-slate-800 cursor-pointer"
                          >
                            Keep 1st Only
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <SearchableGeneSelect
                        options={activeBulkData.map((d) => d.gene_name)}
                        value={geneSetA.length === 1 ? geneSetA[0] : null}
                        onChange={(val) => {
                          if (!val) return;
                          if (geneSetA.includes(val)) return;
                          setGeneSetA((prev) => [...prev, val]);
                        }}
                        placeholder="+ Search & add gene to X-Axis..."
                      />
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={pasteInputA}
                          onChange={(e) => setPasteInputA(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && pasteInputA.trim()) {
                              const validSet = new Set(activeBulkData.map((d) => d.gene_name.toUpperCase()));
                              const tokens = pasteInputA.split(/[\s,;]+/).map((s) => s.trim().toUpperCase()).filter((s) => s && validSet.has(s));
                              if (tokens.length > 0) {
                                setGeneSetA((prev) => Array.from(new Set([...prev, ...tokens])));
                                setPasteInputA("");
                              }
                            }
                          }}
                          placeholder="Paste gene list (e.g. NFE2L2, NQO1)..."
                          className="flex-1 px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-lg text-[11px] text-slate-200 font-mono focus:outline-none focus:border-teal-500"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (!pasteInputA.trim()) return;
                            const validSet = new Set(activeBulkData.map((d) => d.gene_name.toUpperCase()));
                            const tokens = pasteInputA.split(/[\s,;]+/).map((s) => s.trim().toUpperCase()).filter((s) => s && validSet.has(s));
                            if (tokens.length > 0) {
                              setGeneSetA((prev) => Array.from(new Set([...prev, ...tokens])));
                              setPasteInputA("");
                            }
                          }}
                          className="px-2.5 py-1 bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 rounded-lg text-xs font-mono font-semibold cursor-pointer"
                        >
                          Add
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 max-h-24 overflow-y-auto pt-0.5">
                      {geneSetA.map((g) => (
                        <span
                          key={g}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-500/10 border border-teal-500/30 text-teal-300 text-[11px] font-mono"
                        >
                          {g}
                          {geneSetA.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setGeneSetA((prev) => prev.filter((item) => item !== g))}
                              className="text-teal-400/70 hover:text-rose-400 ml-0.5 cursor-pointer font-bold"
                            >
                              &times;
                            </button>
                          )}
                        </span>
                      ))}
                      {geneSetA.length === 1 && (
                        <span className="text-[10px] text-slate-500 font-mono ml-1">
                          (Add more genes above for a signature score, or type a custom X-Axis name at the top)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Y-Axis Gene(s) / Set B */}
                  <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                        <span className="text-xs font-bold text-amber-400 font-mono uppercase tracking-wider shrink-0">
                          Y-Axis ({geneSetBExpressions.length}):
                        </span>
                        <input
                          type="text"
                          value={geneSetBLabel}
                          onChange={(e) => setGeneSetBLabel(e.target.value)}
                          placeholder={geneSetB.length === 1 ? `${geneSetB[0]} (or type custom set/index name...)` : "Custom Y-Axis Name (e.g. Serine Synthesis Set)"}
                          className="flex-1 px-2.5 py-1 bg-slate-900 border border-slate-700/80 rounded-lg text-xs text-slate-100 placeholder:text-slate-500 font-mono focus:outline-none focus:border-amber-400"
                        />
                        {geneSetBLabel && (
                          <button
                            type="button"
                            onClick={() => setGeneSetBLabel("")}
                            className="text-[10px] font-mono text-slate-400 hover:text-rose-400 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 cursor-pointer"
                            title="Reset custom Y-axis name"
                          >
                            Reset Name
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 font-mono text-[10px]">
                        {selectedVolcanoGenes.size > 0 && (
                          <button
                            type="button"
                            onClick={() => setGeneSetB(Array.from(selectedVolcanoGenes).slice(0, 50))}
                            className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 cursor-pointer"
                            title="Import genes checked in the Gene Expression Data Table"
                          >
                            Use Table Selection ({selectedVolcanoGenes.size})
                          </button>
                        )}
                        {geneSetB.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setGeneSetB([geneSetB[0]])}
                            className="px-2 py-0.5 rounded bg-slate-900 text-slate-400 hover:text-rose-400 border border-slate-800 cursor-pointer"
                          >
                            Keep 1st Only
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <SearchableGeneSelect
                        options={activeBulkData.map((d) => d.gene_name)}
                        value={geneSetB.length === 1 ? geneSetB[0] : null}
                        onChange={(val) => {
                          if (!val) return;
                          if (geneSetB.includes(val)) return;
                          setGeneSetB((prev) => [...prev, val]);
                        }}
                        placeholder="+ Search & add gene to Y-Axis..."
                      />
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={pasteInputB}
                          onChange={(e) => setPasteInputB(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && pasteInputB.trim()) {
                              const validSet = new Set(activeBulkData.map((d) => d.gene_name.toUpperCase()));
                              const tokens = pasteInputB.split(/[\s,;]+/).map((s) => s.trim().toUpperCase()).filter((s) => s && validSet.has(s));
                              if (tokens.length > 0) {
                                setGeneSetB((prev) => Array.from(new Set([...prev, ...tokens])));
                                setPasteInputB("");
                              }
                            }
                          }}
                          placeholder="Paste gene list (e.g. PHGDH, PSAT1)..."
                          className="flex-1 px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-lg text-[11px] text-slate-200 font-mono focus:outline-none focus:border-amber-500"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (!pasteInputB.trim()) return;
                            const validSet = new Set(activeBulkData.map((d) => d.gene_name.toUpperCase()));
                            const tokens = pasteInputB.split(/[\s,;]+/).map((s) => s.trim().toUpperCase()).filter((s) => s && validSet.has(s));
                            if (tokens.length > 0) {
                              setGeneSetB((prev) => Array.from(new Set([...prev, ...tokens])));
                              setPasteInputB("");
                            }
                          }}
                          className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-mono font-semibold cursor-pointer"
                        >
                          Add
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 max-h-24 overflow-y-auto pt-0.5">
                      {geneSetB.map((g) => (
                        <span
                          key={g}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-mono"
                        >
                          {g}
                          {geneSetB.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setGeneSetB((prev) => prev.filter((item) => item !== g))}
                              className="text-amber-400/70 hover:text-rose-400 ml-0.5 cursor-pointer font-bold"
                            >
                              &times;
                            </button>
                          )}
                        </span>
                      ))}
                      {geneSetB.length === 1 && (
                        <span className="text-[10px] text-slate-500 font-mono ml-1">
                          (Add more genes above for a signature score, or type a custom Y-Axis name at the top)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Co-Expression & Heatmap Plot Focus Control for PDACopilot */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 bg-slate-900/60 p-3 rounded-xl border border-slate-800 text-xs">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <span className="text-slate-200 font-semibold">Active Analysis Target for PDACopilot:</span>
                    <span className="text-[11px] text-amber-300 font-mono ml-2 font-bold">{activeFigure}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap font-mono text-[11px]">
                  <button
                    onClick={() => setCurrentFigure("Correlation Scatter Plot")}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                      activeFigure === "Correlation Scatter Plot"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/60 shadow-md ring-1 ring-amber-500/30"
                        : "bg-slate-950 text-slate-400 border border-slate-800 hover:text-white hover:border-slate-700"
                    }`}
                  >
                    🎯 Correlation Plot
                  </button>
                  <button
                    onClick={() => setCurrentFigure("Expression Heatmap")}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                      activeFigure === "Expression Heatmap"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/60 shadow-md ring-1 ring-amber-500/30"
                        : "bg-slate-950 text-slate-400 border border-slate-800 hover:text-white hover:border-slate-700"
                    }`}
                  >
                    🎯 Expression Heatmap
                  </button>
                  <button
                    onClick={() => setCurrentFigure("Expression Comparison (Distribution)")}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                      activeFigure.includes("Distribution") || activeFigure.includes("Comparison")
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/60 shadow-md ring-1 ring-amber-500/30"
                        : "bg-slate-950 text-slate-400 border border-slate-800 hover:text-white hover:border-slate-700"
                    }`}
                  >
                    🎯 Expression Distribution
                  </button>
                </div>
              </div>

              {/* Jitter Scatter & Heatmap grid */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-stretch">
                <div className="flex">
                  <Heatmap
                    expressionData={expressionData}
                    selectedGenes={activeStudy === "TCGA_GTEX" ? tcgaGtexHeatmapGenes : heatmapGenes}
                    activeGene={selectedGene}
                    onSelectGene={handleSelectGene}
                    onAddGene={(gene) => {
                      if (activeStudy === "TCGA_GTEX") {
                        setTcgaGtexHeatmapGenes((prev) => [gene, ...prev].slice(0, 35));
                      } else {
                        setHeatmapGenes((prev) => [gene, ...prev].slice(0, 30));
                      }
                    }}
                    onRemoveGene={(gene) => {
                      if (activeStudy === "TCGA_GTEX") {
                        setTcgaGtexHeatmapGenes((prev) => prev.filter((g) => g !== gene));
                      } else {
                        setHeatmapGenes((prev) => prev.filter((g) => g !== gene));
                      }
                    }}
                    onAddGenes={(genes) => {
                      if (activeStudy === "TCGA_GTEX") {
                        setTcgaGtexHeatmapGenes((prev) => Array.from(new Set([...prev, ...genes])).slice(0, 50));
                      } else {
                        setHeatmapGenes((prev) => Array.from(new Set([...prev, ...genes])).slice(0, 50));
                      }
                    }}
                    onClearGenes={() => {
                      if (activeStudy === "TCGA_GTEX") {
                        setTcgaGtexHeatmapGenes([]);
                      } else {
                        setHeatmapGenes([]);
                      }
                    }}
                    allGenes={activeBulkData.map((d) => d.gene_name)}
                    isTcgaGtex={activeStudy === "TCGA_GTEX"}
                    tcgaGtexExpressions={tcgaGtexExpressions}
                    tcgaGtexData={tcgaGtexData}
                  />
                </div>
                
                <div className="flex flex-col gap-6">
                  {/* Co-expression scatter plot */}
                  <div className="flex-1">
                    <CorrelationPlot
                      gene1Name={geneSetA[0] || "NFE2L2"}
                      gene2Name={geneSetB[0] || "PHGDH"}
                      gene1Expression={geneSetAExpressions[0]?.values}
                      gene2Expression={geneSetBExpressions[0]?.values}
                      samples={activeStudy === "TCGA_GTEX" ? tcgaGtexSampleNames : (expressionData?.samples || [])}
                      isTcgaGtex={activeStudy === "TCGA_GTEX"}
                      correlationMode={geneSetA.length > 1 || geneSetB.length > 1 ? "geneset" : "single"}
                      signatureMethod={signatureMethod}
                      geneSetALabel={geneSetALabel.trim() || (geneSetA.length === 1 ? geneSetA[0] : "Gene Set A")}
                      geneSetBLabel={geneSetBLabel.trim() || (geneSetB.length === 1 ? geneSetB[0] : "Gene Set B")}
                      geneSetAExpressions={geneSetAExpressions}
                      geneSetBExpressions={geneSetBExpressions}
                    />
                  </div>
                  
                  {/* Violin/Scatter Expression Distribution Plot */}
                  <div className="flex-1">
                    <ExpressionComparison
                      selectedGenes={expressionGenes}
                      onAddGene={(gene) => setExpressionGenes((prev) => [gene, ...prev].slice(0, 10))}
                      onRemoveGene={(gene) => setExpressionGenes((prev) => prev.filter((g) => g !== gene))}
                      allGenes={activeBulkData.map((d) => d.gene_name)}
                      expressionData={expressionData}
                      degData={activeBulkData}
                      isTcgaGtex={activeStudy === "TCGA_GTEX"}
                      tcgaGtexExpressionForSelectedGene={tcgaGtexExpressionForSelectedGene}
                      selectedGeneSymbol={selectedGene}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "pathway" && (
            <div className="flex-1">
              <PathwayExplorer
                basePath={basePath}
                initialDatasetId={activeStudy === "TCGA_GTEX" ? "tcga_gtex" : "gse225767"}
                initialDegList={pathwayInputGenes}
                initialRankedGenes={pathwayInputRankedGenes}
                initialMetadata={pathwayInputMetadata}
                onSelectGene={handleSelectGene}
                hideDatasetSelector={true}
              />
            </div>
          )}

          {activeTab === "survival" && (
            <div className="flex-1">
              <SurvivalExplorer
                basePath={basePath}
                activeStudy={activeStudy}
                allGenes={activeStudy === "TCGA_GTEX" ? tcgaGtexData.map((d) => d.gene_name) : bulkData.map((d) => d.gene_name)}
                tcgaGtexExpressions={tcgaGtexExpressions}
                geneIndexLookup={tcgaGtexGeneIndexLookup}
                sbrtExpressionData={expressionData}
                onSelectGene={handleSelectGene}
                hideCohortSwitch={true}
              />
            </div>
          )}

          {activeTab === "tme" && (
            <div className="flex-1">
              <SpatialTranscriptomicsView
                activeViewMode={spatialViewMode}
                onViewModeChange={setSpatialViewMode}
              />
            </div>
          )}

          {activeTab === "sn" && (
            <div className="flex-1">
              <SingleNucleusExplorer
                activeSubTab={snSubTab}
                onSubTabChange={setSnSubTab}
                hideInternalTabs={true}
              />
            </div>
          )}

          {activeTab === "cptac" && (
            <div className="flex-1">
              <CptacProteomicsExplorer
                basePath={basePath}
                selectedGene={selectedGene || "NQO1"}
                onSelectGene={handleSelectGene}
                activeSubTab={cptacSubTab}
                onSubTabChange={setCptacSubTab}
                hideInternalTabs={true}
              />
            </div>
          )}

          {activeTab === "about" && (
            <div className="flex-1">
              <AboutView />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
