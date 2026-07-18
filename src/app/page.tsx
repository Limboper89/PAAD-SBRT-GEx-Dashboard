"use client";

import React, { useEffect, useState, useMemo } from "react";
import { 
  Database, 
  Layers, 
  TrendingUp, 
  Table as TableIcon, 
  Search, 
  Settings, 
  Activity, 
  HelpCircle, 
  Maximize2 
} from "lucide-react";
import VolcanoPlot from "@/components/VolcanoPlot";
import Heatmap from "@/components/Heatmap";
import CorrelationPlot from "@/components/CorrelationPlot";
import ExpressionComparison from "@/components/ExpressionComparison";
import GeneTable from "@/components/GeneTable";
import TmeView from "@/components/TmeView";
import SearchableGeneSelect from "@/components/SearchableGeneSelect";

interface GeneData {
  gene_name: string;
  gene_index?: number;
  log2FC: number;
  p_value: number;
  adj_p_value?: number;
}

interface SpatialSpot {
  id: string;
  x: number;
  y: number;
  cell_type: string;
  expressions: { [gene: string]: number };
}

interface SnCell {
  id: string;
  umap1: number;
  umap2: number;
  cell_type: string;
  expressions: { [gene: string]: number };
}

// Available study options
const STUDIES = [
  { id: "GSE225767", name: "GSE225767: Ductal Adenocarcinoma Bulk RNA-seq", type: "Bulk RNA-seq" },
  { id: "PDAC_Spatial", name: "PDAC-ST: Patient Tumor Spatial Transcriptomics", type: "Spatial Transcriptomics" },
  { id: "PDAC_snRNAseq", name: "PDAC-snRNA: Single-Nucleus TME Remodeling", type: "snRNA-seq" }
];

export default function Dashboard() {
  const [activeStudy, setActiveStudy] = useState<string>("GSE225767");
  const [activeTab, setActiveTab] = useState<"de" | "correlation" | "tme">("de");
  
  // Data States
  const [bulkData, setBulkData] = useState<GeneData[]>([]);
  const [expressionData, setExpressionData] = useState<{ samples: string[], conditions: string[], expressions: { [gene: string]: number[] } } | null>(null);
  const [spatialData, setSpatialData] = useState<{ spots: SpatialSpot[] } | null>(null);
  const [snData, setSnData] = useState<{ cells: SnCell[] } | null>(null);
  
  // UI Loading/Error States
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Interaction/Filtering States
  const [selectedGene, setSelectedGene] = useState<string | null>("NFE2L2");
  const [heatmapGenes, setHeatmapGenes] = useState<string[]>([]);
  const [correlationGene1, setCorrelationGene1] = useState<string | null>("NFE2L2");
  const [correlationGene2, setCorrelationGene2] = useState<string | null>("PHGDH");
  const [expressionGenes, setExpressionGenes] = useState<string[]>([]);
  
  // Search state in the header for quick selection
  const [headerSearch, setHeaderSearch] = useState<string>("");
  const [searchResults, setSearchResults] = useState<string[]>([]);

  // Load bulk RNA-seq data on mount
  useEffect(() => {
    async function loadBulkData() {
      try {
        setIsLoading(true);
        const res = await fetch("/data/GSE225767_DEG_results_with_names.csv");
        if (!res.ok) throw new Error("Failed to fetch DEG results CSV.");
        const text = await res.text();
        
        // Fast, lightweight CSV Parser
        const lines = text.split("\n");
        const parsed: GeneData[] = [];
        
        // Skip header line
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

        // Load normalized expression values for co-expression plots
        const exprRes = await fetch("/data/GSE225767_expression_data.json");
        if (!exprRes.ok) throw new Error("Failed to fetch expression JSON dataset.");
        const exprData = await exprRes.json();
        setExpressionData(exprData);
        
        // Setup initial default selections based on high fold change genes
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
  }, []);

  // Lazy load spatial and snRNA-seq data when selected
  useEffect(() => {
    async function loadSpatialData() {
      if (spatialData) return; // Already loaded
      try {
        const res = await fetch("/data/pdac_spatial_mock.json");
        if (!res.ok) throw new Error();
        const data = await res.json();
        setSpatialData(data);
      } catch (e) {
        console.error("Error loading spatial transcriptomics dataset", e);
      }
    }

    async function loadSnData() {
      if (snData) return; // Already loaded
      try {
        const res = await fetch("/data/pdac_snrnaseq_mock.json");
        if (!res.ok) throw new Error();
        const data = await res.json();
        setSnData(data);
      } catch (e) {
        console.error("Error loading snRNA-seq dataset", e);
      }
    }

    if (activeStudy === "PDAC_Spatial" || activeTab === "tme") {
      loadSpatialData();
    }
    if (activeStudy === "PDAC_snRNAseq" || activeTab === "tme") {
      loadSnData();
    }
  }, [activeStudy, activeTab, spatialData, snData]);

  // Sync activeStudy selection to tabs
  const handleStudyChange = (studyId: string) => {
    setActiveStudy(studyId);
    if (studyId === "PDAC_Spatial" || studyId === "PDAC_snRNAseq") {
      setActiveTab("tme");
    } else {
      setActiveTab("de");
    }
  };

  // Cross-filtering: Global select gene handler
  const handleSelectGene = (geneName: string) => {
    setSelectedGene(geneName);
    
    // Add to heatmap genes if not present
    if (!heatmapGenes.includes(geneName)) {
      setHeatmapGenes(prev => [geneName, ...prev].slice(0, 30)); // Cap at 30 genes for visibility
    }
    
    // Add to expression comparison list if not present
    if (!expressionGenes.includes(geneName)) {
      setExpressionGenes(prev => [geneName, ...prev].slice(0, 10)); // Cap at 10 genes
    }

    // Toggle correlation genes
    // Cycle between slot 1 and slot 2
    if (correlationGene1 !== geneName) {
      setCorrelationGene2(correlationGene1);
      setCorrelationGene1(geneName);
    }
  };

  const handleRemoveHeatmapGene = (geneName: string) => {
    setHeatmapGenes(prev => prev.filter(g => g !== geneName));
  };

  // Search autocomplete list from bulk data
  useEffect(() => {
    if (!headerSearch.trim()) {
      setSearchResults([]);
      return;
    }
    const query = headerSearch.toUpperCase().trim();
    const matches = bulkData
      .filter(d => d.gene_name.toUpperCase().startsWith(query))
      .slice(0, 8)
      .map(d => d.gene_name);
    setSearchResults(matches);
  }, [headerSearch, bulkData]);

  // Stats calculation
  const stats = useMemo(() => {
    if (bulkData.length === 0) return { total: 0, up: 0, down: 0, sig: 0 };
    const sig = bulkData.filter(d => d.p_value < 0.05);
    return {
      total: bulkData.length,
      up: sig.filter(d => d.log2FC > 0).length,
      down: sig.filter(d => d.log2FC < 0).length,
      sig: sig.length
    };
  }, [bulkData]);

  const activeGeneData = useMemo(() => {
    return bulkData.find(d => d.gene_name === selectedGene) || null;
  }, [selectedGene, bulkData]);

  // TME genes for visualization dropdown selector
  const tmeGenes = ["NFE2L2", "PHGDH", "PSAT1", "CD8A", "CD68", "GAPDH", "EPCAM", "COL1A1", "ACTA2"];

  if (isLoading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center min-h-screen bg-slate-950 text-slate-200">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-teal-500 mb-4"></div>
        <p className="text-sm font-semibold tracking-wider text-teal-400">LOADING TRANSCRIPIOME DATASET...</p>
        <p className="text-xs text-slate-500 mt-1">Parsing GSE225767 bulk RNA-seq file (~1.1 MB)</p>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center min-h-screen bg-slate-950 text-red-400 p-6 text-center">
        <Database className="w-16 h-16 mb-4 text-red-500" />
        <h2 className="text-xl font-bold mb-2">Dataset Load Failure</h2>
        <p className="max-w-md text-sm text-slate-400">{errorMsg}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-screen bg-slate-950 bg-grid-pattern bg-blend-overlay">
      {/* Premium Header */}
      <header className="border-b border-slate-900 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-teal-500 to-indigo-600 p-2 rounded-xl text-slate-950 shadow-lg shadow-teal-500/10">
            <Activity className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent">
              SBRT-GEx BioPortal
            </h1>
            <p className="text-xs text-slate-400">PDAC Radiotherapy & TME Multi-Study Dashboard</p>
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
              className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors w-60"
            />
            {searchResults.length > 0 && (
              <div className="absolute left-0 right-0 mt-1.5 bg-slate-950 border border-slate-800 rounded-lg shadow-2xl z-50 overflow-hidden">
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
          <div className="relative flex items-center bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300">
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
        {/* Global Active Gene Highlight card */}
        {activeGeneData && (
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-xl">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-center font-bold text-amber-500 text-base">
                {activeGeneData.gene_name.slice(0, 2)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-slate-100">{activeGeneData.gene_name}</span>
                  <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded font-mono">
                    ID: #{activeGeneData.gene_index || "N/A"}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">Active selection target for correlation and TME tissue overlay</p>
              </div>
            </div>

            <div className="flex items-center gap-6 text-xs border-l border-slate-800 pl-0 sm:pl-6">
              <div>
                <span className="text-slate-500 block">log2 Fold Change</span>
                <span className={`font-mono font-bold text-sm ${activeGeneData.log2FC > 0 ? "text-red-400" : "text-blue-400"}`}>
                  {activeGeneData.log2FC > 0 ? "+" : ""}{activeGeneData.log2FC.toFixed(4)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">p-value</span>
                <span className="font-mono font-bold text-slate-200 text-sm">
                  {activeGeneData.p_value.toExponential(3)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Adj. p-value</span>
                <span className="font-mono font-bold text-slate-200 text-sm">
                  {activeGeneData.adj_p_value ? activeGeneData.adj_p_value.toExponential(3) : "N/A"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Global Statistics Grid */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800/80 p-4 rounded-xl shadow-xl flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 uppercase font-semibold">Total Genes</span>
              <div className="text-2xl font-bold font-mono text-slate-200 mt-1">{stats.total.toLocaleString()}</div>
            </div>
            <Database className="w-8 h-8 text-indigo-500/50" />
          </div>
          
          <div className="bg-slate-900 border border-slate-800/80 p-4 rounded-xl shadow-xl flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 uppercase font-semibold">Upregulated (Sig)</span>
              <div className="text-2xl font-bold font-mono text-red-400 mt-1">{stats.up.toLocaleString()}</div>
            </div>
            <TrendingUp className="w-8 h-8 text-red-500/50" />
          </div>

          <div className="bg-slate-900 border border-slate-800/80 p-4 rounded-xl shadow-xl flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 uppercase font-semibold">Downregulated (Sig)</span>
              <div className="text-2xl font-bold font-mono text-blue-400 mt-1">{stats.down.toLocaleString()}</div>
            </div>
            <TrendingUp className="w-8 h-8 text-blue-500/50 transform rotate-180" />
          </div>

          <div className="bg-slate-900 border border-slate-800/80 p-4 rounded-xl shadow-xl flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 uppercase font-semibold">Significant (p&lt;0.05)</span>
              <div className="text-2xl font-bold font-mono text-teal-400 mt-1">{stats.sig.toLocaleString()}</div>
            </div>
            <Settings className="w-8 h-8 text-teal-500/50 animate-pulse" />
          </div>
        </section>

        {/* Tab Controllers */}
        <div className="flex border-b border-slate-900 bg-slate-900/20 p-1 rounded-xl self-start">
          <button
            onClick={() => setActiveTab("de")}
            className={`flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === "de"
                ? "bg-slate-900 text-teal-400 border border-slate-800 shadow-md"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="w-4 h-4" />
            Differential Expression
          </button>
          
          <button
            onClick={() => setActiveTab("correlation")}
            className={`flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === "correlation"
                ? "bg-slate-900 text-teal-400 border border-slate-800 shadow-md"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            Co-Expression & Heatmap
          </button>
          
          <button
            onClick={() => setActiveTab("tme")}
            className={`flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === "tme"
                ? "bg-slate-900 text-teal-400 border border-slate-800 shadow-md"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Activity className="w-4 h-4" />
            Tumor Microenvironment (TME)
          </button>
        </div>

        {/* Tab Content Rendering */}
        <section className="flex-1 flex flex-col gap-6">
          {activeTab === "de" && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-stretch">
              <div className="h-[480px]">
                <VolcanoPlot
                  data={bulkData}
                  selectedGene={selectedGene}
                  onSelectGene={handleSelectGene}
                />
              </div>
              <div className="flex">
                <GeneTable
                  data={bulkData}
                  selectedGene={selectedGene}
                  onSelectGene={handleSelectGene}
                />
              </div>
            </div>
          )}

          {activeTab === "correlation" && (
            <div className="flex flex-col gap-6">
              {/* Correlation Gene Selection controls */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-900/40 p-4 border border-slate-800 rounded-xl">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Co-Expression Gene 1
                  </label>
                  <SearchableGeneSelect
                    options={bulkData.map((d) => d.gene_name)}
                    value={correlationGene1}
                    onChange={(val) => {
                      if (val) setCorrelationGene1(val);
                    }}
                    placeholder="Search Gene 1..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Co-Expression Gene 2
                  </label>
                  <SearchableGeneSelect
                    options={bulkData.map((d) => d.gene_name)}
                    value={correlationGene2}
                    onChange={(val) => {
                      if (val) setCorrelationGene2(val);
                    }}
                    placeholder="Search Gene 2..."
                  />
                </div>
              </div>

              {/* Correlation Charts Grid */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-stretch">
                <div className="flex">
                  <Heatmap
                    expressionData={expressionData}
                    selectedGenes={heatmapGenes}
                    activeGene={selectedGene}
                    onSelectGene={handleSelectGene}
                    onAddGene={(gene) => setHeatmapGenes((prev) => [gene, ...prev].slice(0, 30))}
                    onRemoveGene={handleRemoveHeatmapGene}
                    allGenes={bulkData.map((d) => d.gene_name)}
                  />
                </div>
                <div className="flex flex-col gap-6">
                  <div className="flex-1">
                    <CorrelationPlot
                      gene1Name={correlationGene1 || ""}
                      gene2Name={correlationGene2 || ""}
                      gene1Expression={expressionData?.expressions[correlationGene1 || ""]}
                      gene2Expression={expressionData?.expressions[correlationGene2 || ""]}
                      samples={expressionData?.samples || []}
                    />
                  </div>
                  <div className="flex-1">
                    <ExpressionComparison
                      selectedGenes={expressionGenes}
                      onAddGene={(gene) => setExpressionGenes((prev) => [gene, ...prev].slice(0, 10))}
                      onRemoveGene={(gene) => setExpressionGenes((prev) => prev.filter((g) => g !== gene))}
                      allGenes={bulkData.map((d) => d.gene_name)}
                      expressionData={expressionData}
                      degData={bulkData}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "tme" && (
            <div className="flex-1">
              <TmeView
                activeDataset={activeStudy === "PDAC_snRNAseq" ? "PDAC_snRNAseq" : "PDAC_Spatial"}
                spatialData={spatialData}
                snData={snData}
                selectedGene={selectedGene}
                allGenes={tmeGenes}
              />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
