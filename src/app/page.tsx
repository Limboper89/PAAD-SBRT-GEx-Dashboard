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
  GitFork
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

// Available study options (added TCGA vs GTEx study)
const STUDIES = [
  { id: "GSE225767", name: "GSE225767: Ductal Adenocarcinoma Bulk RNA-seq", type: "Bulk RNA-seq" },
  { id: "TCGA_GTEX", name: "TCGA-PAAD vs GTEx Pancreas (Normal Reference)", type: "Tumor vs Normal" },
  { id: "GSE274103", name: "GSE274103: Patient Tumor Spatial Transcriptomics", type: "Spatial Transcriptomics" },
  { id: "GSE202051", name: "GSE202051: PDAC Single-Nucleus Reference Atlas", type: "Single-Nucleus" }
];

export default function Dashboard() {
  const [activeStudy, setActiveStudy] = useState<string>("GSE225767");
  // Hard‑coded base path for static export
  const basePath = "/PAAD-SBRT-GEx-Dashboard";
  const [activeTab, setActiveTab] = useState<"de" | "correlation" | "tme" | "sn" | "about" | "pathway">("de");
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
  
  // SBRT specific state
  const [heatmapGenes, setHeatmapGenes] = useState<string[]>([]);
  const [expressionGenes, setExpressionGenes] = useState<string[]>([]);
  const [correlationGene1, setCorrelationGene1] = useState<string | null>("NFE2L2");
  const [correlationGene2, setCorrelationGene2] = useState<string | null>("PHGDH");
  
  // TCGA-GTEx specific state
  const [tcgaGtexHeatmapGenes, setTcgaGtexHeatmapGenes] = useState<string[]>([]);
  const [tcgaGtexCorrelationGene1, setTcgaGtexCorrelationGene1] = useState<string | null>("NFE2L2");
  const [tcgaGtexCorrelationGene2, setTcgaGtexCorrelationGene2] = useState<string | null>("PHGDH");

  // Search state in the header for quick selection
  const [headerSearch, setHeaderSearch] = useState<string>("");
  const [searchResults, setSearchResults] = useState<string[]>([]);

  // Load SBRT data on mount
  useEffect(() => {
    async function loadBulkData() {
      try {
        setIsLoading(true);
        const res = await fetch(`${basePath}/data/GSE225767_DEG_results_with_names.csv`);
        if (!res.ok) throw new Error("Failed to fetch SBRT DEG results CSV.");
        const text = await res.text();
        
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

        const exprRes = await fetch(`${basePath}/data/GSE225767_expression_data.json`);
        if (!exprRes.ok) throw new Error("Failed to fetch SBRT expression JSON dataset.");
        const exprData = await exprRes.json();
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

  // Trigger lazy loading of binary matrix when correlation or heatmap is viewed in TCGA-GTEx mode
  useEffect(() => {
    if (activeStudy === "TCGA_GTEX" && activeTab === "correlation" && !tcgaGtexExpressions) {
      lazyLoadTcgaGtexExpressions();
    }
  }, [activeStudy, activeTab, tcgaGtexExpressions]);

  // Sync activeStudy selection to tabs
  const handleStudyChange = (studyId: string) => {
    setActiveStudy(studyId);
    if (studyId === "GSE274103" || studyId === "PDAC_Spatial") {
      setActiveTab("tme");
    } else if (studyId === "GSE202051") {
      setActiveTab("sn");
    } else if (studyId === "TCGA_GTEX") {
      setActiveTab("de");
      loadTcgaGtexData();
    } else {
      setActiveTab("de");
    }
  };

  // Cross-filtering: Global select gene handler
  const handleSelectGene = (geneName: string) => {
    setSelectedGene(geneName);
    
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
  const activeModuleKey = useMemo<"bulk" | "spatial" | "singleNucleus">(() => {
    if (activeTab === "sn" || activeStudy === "GSE202051") return "singleNucleus";
    if (activeTab === "tme" || activeStudy === "GSE274103" || activeStudy === "PDAC_Spatial") return "spatial";
    return "bulk";
  }, [activeTab, activeStudy]);

  const { registerModuleContext } = useAIContext();

  // Sync state to PDACopilot context provider
  useEffect(() => {
    const studyObj = STUDIES.find(s => s.id === activeStudy);
    const studyName = studyObj ? studyObj.name : activeStudy;
    
    let figureName = "Volcano Plot";
    if (activeTab === "de") figureName = "Volcano Plot & Differential Table";
    else if (activeTab === "correlation") figureName = "Correlation Scatter Plot & Heatmap";
    else if (activeTab === "tme") figureName = "Spatial Transcriptomics Spot Map";
    else if (activeTab === "sn") figureName = "Single-Nucleus UMAP Atlas";
    else if (activeTab === "about") figureName = "Documentation & Methods";

    const moduleLabel = activeStudy === "TCGA_GTEX" ? "TCGA-GTEx" : activeStudy === "GSE202051" ? "Single Nucleus" : activeStudy === "GSE274103" ? "Spatial" : "SBRT Bulk";
    const currentHeatmapGenes = activeStudy === "TCGA_GTEX" ? tcgaGtexHeatmapGenes : heatmapGenes;

    registerModuleContext({
      module: moduleLabel,
      gene: selectedGene,
      dataset: studyName,
      currentFigure: figureName,
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
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-teal-500 to-indigo-600 p-2 rounded-xl text-slate-950 shadow-lg shadow-teal-500/10">
            <Activity className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent font-sans">
              PDAC BioPortal
            </h1>
            <p className="text-xs text-slate-400 font-mono">A Multi-Cohort Transcriptomics &amp; SBRT Translational Knowledgebase</p>
          </div>
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

          {/* Active Dataset Selector Dropdown */}
          <div className="relative flex items-center bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 font-mono">
            <span className="text-slate-500 font-semibold mr-2 uppercase tracking-wide">STUDY:</span>
            <select
              value={activeStudy}
              onChange={(e) => handleStudyChange(e.target.value)}
              className="bg-transparent text-slate-100 font-medium focus:outline-none cursor-pointer pr-4"
            >
              {STUDIES.map(st => (
                <option key={st.id} value={st.id} className="bg-slate-950 text-slate-200">
                  [{st.type}] {st.id}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* Main Viewport Container */}
      <main className="flex-1 p-6 flex flex-col gap-6 max-w-7xl mx-auto w-full">
        {/* Global Cross-Study Disclaimer / Provenance Panel */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex gap-2.5 shadow-xl text-xxs font-mono text-slate-400">
          <Info className="w-4 h-4 text-teal-400 flex-shrink-0 mt-0.5" />
          {activeStudy === "TCGA_GTEX" ? (
            <p className="leading-relaxed">
              <strong>TCGA vs GTEx Baseline Transcriptomics:</strong> log₂(TPM + 0.001) values from uniformly processed Toil RNA-seq data were used for relative expression visualization across samples. TCGA and GTEx RNA-seq data were reprocessed through a common Toil computational pipeline, reducing computational processing heterogeneity and improving cross-cohort comparability. Residual cohort, pre-analytical, biological, and tissue-composition differences may remain.
            </p>
          ) : (
            <p className="leading-relaxed">
              <strong>Cross-Study Notice:</strong> GSE225767, GSE202051, and GSE274103 are independent studies involving different patient cohorts. Cross-modal views in this BioPortal provide complementary biological context and should not be interpreted as matched multi-omics measurements.
            </p>
          )}
        </div>

        {/* Global Active Gene Highlight card */}
        {activeGeneData && (
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

        {/* Tab Controllers */}
        <div className="flex flex-wrap border-b border-slate-900 bg-slate-900/20 p-1 rounded-xl self-start gap-1">
          <button
            onClick={() => { 
              if (activeTab !== "de" && activeTab !== "correlation") {
                setActiveTab("de");
              }
              setActiveStudy(activeStudy === "TCGA_GTEX" ? "TCGA_GTEX" : "GSE225767"); 
            }}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              (activeTab === "de" || activeTab === "correlation")
                ? "bg-slate-900 text-teal-400 border border-slate-800 shadow-md"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="w-4 h-4" />
            Bulk Transcriptomics
          </button>

          <button
            onClick={() => setActiveTab("pathway")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === "pathway"
                ? "bg-slate-900 text-teal-400 border border-slate-800 shadow-md"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <GitFork className="w-4 h-4 text-teal-400" />
            Pathway Explorer
          </button>
          
          <button
            onClick={() => { setActiveTab("sn"); setActiveStudy("GSE202051"); }}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === "sn"
                ? "bg-slate-900 text-teal-400 border border-slate-800 shadow-md"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Cpu className="w-4 h-4" />
            Single-Nucleus Explorer
          </button>
          
          <button
            onClick={() => { setActiveTab("tme"); setActiveStudy("GSE274103"); }}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === "tme"
                ? "bg-slate-900 text-teal-400 border border-slate-800 shadow-md"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Activity className="w-4 h-4" />
            Spatial Transcriptomics
          </button>
          
          <button
            onClick={() => setActiveTab("about")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === "about"
                ? "bg-slate-900 text-teal-400 border border-slate-800 shadow-md"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            About / Methods
          </button>
        </div>

        {/* Tab Content Rendering */}
        <section className="flex-1 flex flex-col gap-6">
          {/* Sub-tab selection for Bulk Transcriptomics views */}
          {(activeTab === "de" || activeTab === "correlation") && (
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-slate-900/40 p-2 rounded-lg border border-slate-850 self-stretch">
              <div className="flex gap-1.5 bg-slate-950 p-1 rounded-md text-xxs font-mono border border-slate-900">
                <button
                  onClick={() => setActiveTab("de")}
                  className={`px-3 py-1.5 rounded font-semibold transition ${activeTab === "de" ? "bg-slate-900 text-teal-400 border border-slate-800 shadow-sm" : "text-slate-400 hover:text-white"}`}
                >
                  Differential Expression
                </button>
                <button
                  onClick={() => setActiveTab("correlation")}
                  className={`px-3 py-1.5 rounded font-semibold transition ${activeTab === "correlation" ? "bg-slate-950 text-teal-400 border border-slate-800 shadow-sm" : "text-slate-400 hover:text-white"}`}
                >
                  Co-Expression & Heatmap
                </button>
              </div>
              
              {/* Downloader panel (TCGA-GTEx vs SBRT) */}
              <div className="flex items-center gap-2.5 text-xxs font-mono">
                {activeStudy === "TCGA_GTEX" ? (
                  <a
                    href={`${basePath}/data/tcga_gtex/tcga_gtex_DEG_results.json`}
                    download="tcga_gtex_DEG_results.json"
                    className="bg-teal-500 hover:bg-teal-600 text-slate-950 px-3 py-1.5 rounded font-bold shadow-md transition-colors"
                  >
                    Download TCGA-GTEx DEGs (7.1 MB JSON)
                  </a>
                ) : (
                  <a
                    href={`${basePath}/data/GSE225767_DEG_results_with_names.csv`}
                    download="GSE225767_DEG_results_with_names.csv"
                    className="bg-indigo-500 hover:bg-indigo-600 text-slate-100 px-3 py-1.5 rounded font-bold shadow-md transition-colors"
                  >
                    Download SBRT DEGs (805 KB CSV)
                  </a>
                )}
              </div>
            </div>
          )}

          {activeTab === "de" && (
            <div className="flex flex-col gap-6">
              <div className="h-[480px]">
                <VolcanoPlot
                  data={activeBulkData}
                  selectedGene={selectedGene}
                  onSelectGene={handleSelectGene}
                  isTcgaGtex={activeStudy === "TCGA_GTEX"}
                />
              </div>
              <div className="w-full">
                <GeneTable
                  data={activeBulkData}
                  selectedGene={selectedGene}
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
              {/* Co-expression search selector bar */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-900/40 p-4 border border-slate-800 rounded-xl">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 font-mono">
                    Co-Expression Gene 1
                  </label>
                  <SearchableGeneSelect
                    options={activeBulkData.map((d) => d.gene_name)}
                    value={activeStudy === "TCGA_GTEX" ? tcgaGtexCorrelationGene1 : correlationGene1}
                    onChange={(val) => {
                      if (val) {
                        if (activeStudy === "TCGA_GTEX") setTcgaGtexCorrelationGene1(val);
                        else setCorrelationGene1(val);
                      }
                    }}
                    placeholder="Search Gene 1..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 font-mono">
                    Co-Expression Gene 2
                  </label>
                  <SearchableGeneSelect
                    options={activeBulkData.map((d) => d.gene_name)}
                    value={activeStudy === "TCGA_GTEX" ? tcgaGtexCorrelationGene2 : correlationGene2}
                    onChange={(val) => {
                      if (val) {
                        if (activeStudy === "TCGA_GTEX") setTcgaGtexCorrelationGene2(val);
                        else setCorrelationGene2(val);
                      }
                    }}
                    placeholder="Search Gene 2..."
                  />
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
                      gene1Name={activeStudy === "TCGA_GTEX" ? (tcgaGtexCorrelationGene1 || "") : (correlationGene1 || "")}
                      gene2Name={activeStudy === "TCGA_GTEX" ? (tcgaGtexCorrelationGene2 || "") : (correlationGene2 || "")}
                      gene1Expression={activeStudy === "TCGA_GTEX" ? tcgaGtexCorrelationGene1Expression : expressionData?.expressions[correlationGene1 || ""]}
                      gene2Expression={activeStudy === "TCGA_GTEX" ? tcgaGtexCorrelationGene2Expression : expressionData?.expressions[correlationGene2 || ""]}
                      samples={activeStudy === "TCGA_GTEX" ? tcgaGtexSampleNames : (expressionData?.samples || [])}
                      isTcgaGtex={activeStudy === "TCGA_GTEX"}
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
              />
            </div>
          )}

          {activeTab === "tme" && (
            <div className="flex-1">
              <SpatialTranscriptomicsView />
            </div>
          )}

          {activeTab === "sn" && (
            <div className="flex-1">
              <SingleNucleusExplorer />
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
