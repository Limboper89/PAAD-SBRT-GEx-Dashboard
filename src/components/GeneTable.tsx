"use client";

import React, { useState, useMemo, useEffect } from "react";
import { 
  Search, 
  ChevronDown, 
  ChevronUp, 
  ChevronLeft, 
  ChevronRight, 
  Sparkles,
  CheckSquare,
  Square,
  Layers,
  FileSpreadsheet,
  CheckCircle2,
  Filter,
  X
} from "lucide-react";
import ExportButton from "@/components/ExportButton";
import { exportToCSV } from "@/utils/exportUtils";
import { RankedGene } from "@/utils/pathwayEngine";
import { useAIContext } from "@/components/ai/AIProvider";
import { Bot } from "lucide-react";


export interface DegTransferMetadata {
  datasetName: string;
  metricName: string;
  totalSelected: number;
  transferredCount: number;
  excludedCount: number;
  duplicateCount: number;
  excludedGenes: Array<{ symbol: string; reason: string }>;
}

interface GeneData {
  gene_name: string;
  gene_index?: number;
  log2FC: number;
  p_value: number;
  adj_p_value?: number;
  // TCGA-GTEx optional properties
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

interface GeneTableProps {
  data: GeneData[];
  selectedGene: string | null;
  onSelectGene: (geneName: string) => void;
  isTcgaGtex?: boolean;
  onRunPathwayAnalysis?: (
    geneSymbols: string[],
    rankedGenes?: RankedGene[],
    metadata?: DegTransferMetadata
  ) => void;
}

type SortField = 
  | "gene_name" 
  | "gene_index" 
  | "log2FC" 
  | "p_value" 
  | "adj_p_value"
  | "qval"
  | "pval"
  | "voom_log2FC"
  | "voom_qval"
  | "robust_deg"
  | "pct_tumor_gt1"
  | "pct_gtex_gt1";

type SortDirection = "asc" | "desc";

export default function GeneTable({ 
  data, 
  selectedGene, 
  onSelectGene,
  isTcgaGtex = false,
  onRunPathwayAnalysis
}: GeneTableProps) {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>(isTcgaGtex ? "qval" : "p_value");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filterRobust, setFilterRobust] = useState<"all" | "robust" | "non_robust">("all");
  const [selectedGenes, setSelectedGenes] = useState<Set<string>>(new Set());

  let aiCtx: any = null;
  try {
    aiCtx = useAIContext();
  } catch (e) {}

  const handleAskCopilot = () => {
    if (aiCtx) {
      const q = selectedGenes.size > 0
        ? `Tell me about these ${selectedGenes.size} selected genes in ${isTcgaGtex ? "TCGA-PAAD" : "SBRT GSE225767"}.`
        : `Which genes are significantly altered in ${isTcgaGtex ? "TCGA-PAAD" : "SBRT GSE225767"}?`;
      aiCtx.sendMessage(q, "differential_expression_list");
      aiCtx.setChatOpen(true);
    }
  };

  // Reset page on search/filter changes

  useEffect(() => {
    setCurrentPage(1);
  }, [search, pageSize, filterRobust]);

  // Sync sorting field when study type changes
  useEffect(() => {
    setSortField(isTcgaGtex ? "qval" : "p_value");
    setSortDirection("asc");
  }, [isTcgaGtex]);

  // Handle sorting toggles
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Filter and Sort data
  const processedData = useMemo(() => {
    let result = [...data];

    // 1. Search Filter
    if (search.trim()) {
      const query = search.toLowerCase().trim();
      result = result.filter((item) =>
        item.gene_name.toLowerCase().includes(query)
      );
    }

    // 2. Robust DEG filter (TCGA-GTEx only)
    if (isTcgaGtex && filterRobust !== "all") {
      result = result.filter((item) => {
        if (filterRobust === "robust") return item.robust_deg === true;
        return !item.robust_deg;
      });
    }

    // 3. Sorting
    result.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (isTcgaGtex) {
        if (sortField === "p_value") {
          valA = a.pval;
          valB = b.pval;
        } else if (sortField === "adj_p_value") {
          valA = a.qval;
          valB = b.qval;
        }
      }

      if (valA === undefined || valA === null) return 1;
      if (valB === undefined || valB === null) return -1;

      if (typeof valA === "string" && typeof valB === "string") {
        return sortDirection === "asc"
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      } else if (typeof valA === "boolean" && typeof valB === "boolean") {
        const numA = valA ? 1 : 0;
        const numB = valB ? 1 : 0;
        return sortDirection === "asc" ? numA - numB : numB - numA;
      } else {
        return sortDirection === "asc"
          ? (valA as number) - (valB as number)
          : (valB as number) - (valA as number);
      }
    });

    return result;
  }, [data, search, sortField, sortDirection, filterRobust, isTcgaGtex]);

  // Pagination slicing
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return processedData.slice(startIndex, startIndex + pageSize);
  }, [processedData, currentPage, pageSize]);

  const totalPages = Math.max(1, Math.ceil(processedData.length / pageSize));

  // Toggle selection for a single gene
  const toggleSelectGeneRow = (e: React.MouseEvent, geneName: string) => {
    e.stopPropagation();
    setSelectedGenes((prev) => {
      const next = new Set(prev);
      if (next.has(geneName)) next.delete(geneName);
      else next.add(geneName);
      return next;
    });
  };

  // Export CSV Handler
  const handleExportCSV = () => {
    if (processedData.length === 0) return;
    const isTcga = isTcgaGtex;
    const datasetName = isTcga ? "TCGA-PAAD vs GTEx Pancreas" : "GSE225767 Bulk RNA-seq";
    
    const headers = isTcga
      ? ["Gene Symbol", "ID", "Biotype", "Wilcoxon log2FC", "Wilcoxon FDR", "voom log2FC", "voom FDR", "Concordant DEG"]
      : ["Gene Name", "Gene Index", "log2 Fold Change", "p-value", "Adjusted p-value"];

    const rows = processedData.map((d) => {
      if (isTcga) {
        return [
          d.gene_name,
          d.id || "",
          d.biotype || "",
          d.log2FC,
          d.qval !== undefined ? d.qval : d.p_value,
          d.voom_log2FC !== undefined ? d.voom_log2FC : "",
          d.voom_qval !== undefined ? d.voom_qval : "",
          d.robust_deg ? "Yes" : "No",
        ];
      }
      return [
        d.gene_name,
        d.gene_index ?? "",
        d.log2FC,
        d.p_value,
        d.adj_p_value ?? "",
      ];
    });

    exportToCSV({
      filename: `${isTcga ? "TCGA_GTEX" : "GSE225767"}_DifferentialExpression.csv`,
      metadata: {
        dataset: datasetName,
        module: "Bulk RNA-seq Differential Expression",
        selectedGene: selectedGene || "N/A",
        filters: `Search: "${search || "None"}", Sort: ${sortField} (${sortDirection}), Total Filtered: ${processedData.length}`,
      },
      headers,
      rows,
    });
  };

  // Render sort indicators
  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ChevronDown className="w-3 h-3 inline ml-1 opacity-20" />;
    return sortDirection === "asc" ? (
      <ChevronUp className="w-3.5 h-3.5 inline ml-1 text-teal-400 font-bold" />
    ) : (
      <ChevronDown className="w-3.5 h-3.5 inline ml-1 text-teal-400 font-bold" />
    );
  };

  // Format numbers nicely
  const formatPVal = (val?: number) => {
    if (val === undefined || val === null || isNaN(val)) return "N/A";
    if (val < 0.0001) return val.toExponential(3);
    return val.toFixed(4);
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-5 shadow-2xl flex flex-col w-full backdrop-blur-md">
      {/* ── ROW 1: HEADER TITLE, BADGE, & SEARCH ── */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-5 pb-4 border-b border-slate-800/60">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500/20 to-emerald-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400 shadow-md">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <h3 className="text-slate-100 font-bold text-lg font-sans tracking-tight whitespace-nowrap">
              Gene Expression Data Table
            </h3>
            <span className="bg-teal-500/10 text-teal-300 text-xs font-mono font-semibold px-3 py-1 rounded-full border border-teal-500/30 whitespace-nowrap shadow-sm">
              {processedData.length.toLocaleString()} transcripts
            </span>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Interactive transcriptomic matrix · Click any row to view expression distribution
          </p>
        </div>

        {/* Search Input & Category Filter */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {/* Robust DEG Filter (TCGA-GTEx Only) */}
          {isTcgaGtex && (
            <div className="flex items-center gap-2 text-xs text-slate-300 font-mono bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800 shadow-inner">
              <Filter className="w-3.5 h-3.5 text-teal-400" />
              <span className="text-slate-400 font-medium">Filter:</span>
              <select
                value={filterRobust}
                onChange={(e) => setFilterRobust(e.target.value as any)}
                className="bg-transparent text-teal-300 focus:outline-none cursor-pointer font-bold"
              >
                <option value="all" className="bg-slate-900 text-slate-200">All Genes</option>
                <option value="robust" className="bg-slate-900 text-slate-200">Concordant DEG (Robust)</option>
                <option value="non_robust" className="bg-slate-900 text-slate-200">Non-Robust Only</option>
              </select>
            </div>
          )}

          {/* Search Box */}
          <div className="relative flex-1 lg:w-72">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder="Search gene symbol..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-8 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500/80 focus:ring-1 focus:ring-teal-500/50 transition-all font-mono shadow-inner"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-slate-400 hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── ROW 2: ACTION TOOLBAR BAR ── */}
      <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3.5 mb-4 flex flex-wrap items-center justify-between gap-3 shadow-inner font-mono text-xs">
        {/* Left controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 text-slate-400">
            <span>Show</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 focus:outline-none focus:border-teal-500 text-slate-200 font-bold cursor-pointer"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>rows</span>
          </div>

          <span className="h-4 w-px bg-slate-800 hidden sm:inline-block" />

          {/* Quick Selection Buttons */}
          <button
            type="button"
            onClick={() => {
              const allFiltered = new Set(processedData.map((d) => d.gene_name));
              setSelectedGenes(allFiltered);
            }}
            className="bg-slate-900 hover:bg-slate-800 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-800 transition font-medium flex items-center gap-1.5 cursor-pointer"
          >
            <CheckSquare className="w-3.5 h-3.5 text-slate-400" />
            <span>Select All ({processedData.length.toLocaleString()})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const sigs = new Set(
                processedData
                  .filter((d) => (isTcgaGtex ? (d.qval !== undefined ? d.qval < 0.05 : d.p_value < 0.05) : d.p_value < 0.05))
                  .map((d) => d.gene_name)
              );
              setSelectedGenes(sigs);
            }}
            className="bg-slate-900 hover:bg-slate-800 text-teal-300 px-3 py-1.5 rounded-lg border border-slate-800 transition font-medium flex items-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-teal-400" />
            <span>Select Significant (p &lt; 0.05)</span>
          </button>

          {selectedGenes.size > 0 && (
            <button
              type="button"
              onClick={() => setSelectedGenes(new Set())}
              className="bg-slate-900 hover:bg-slate-800 text-amber-400 px-3 py-1.5 rounded-lg border border-amber-500/30 transition font-medium cursor-pointer"
            >
              Clear ({selectedGenes.size.toLocaleString()})
            </button>
          )}
        </div>

        {/* Right actions: Ask Copilot, Run Pathway & Export CSV */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleAskCopilot}
            className="bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 px-3 py-1.5 rounded-lg border border-cyan-700/60 transition font-medium flex items-center gap-1.5 cursor-pointer shadow-sm"
            title="Ask PDACopilot about these differential expression results"
          >
            <Bot className="w-3.5 h-3.5 text-cyan-400" />
            <span>Ask PDACopilot</span>
          </button>

          {onRunPathwayAnalysis && (

            <button
              onClick={() => {
                const datasetName = isTcgaGtex ? "TCGA-PAAD vs GTEx Pancreas" : "GSE225767 SBRT Radiotherapy";
                const metricName = "log2FC";

                let selectedRows: GeneData[] = [];
                if (selectedGenes.size > 0) {
                  selectedRows = data.filter((d) => selectedGenes.has(d.gene_name));
                } else {
                  selectedRows = processedData.filter((d) =>
                    isTcgaGtex
                      ? d.qval !== undefined
                        ? d.qval < 0.05
                        : d.p_value < 0.05
                      : d.p_value < 0.05
                  );
                  if (selectedRows.length === 0) {
                    selectedRows = processedData.slice(0, 50);
                  }
                }

                const totalSelected = selectedRows.length;
                const geneSymbols: string[] = [];
                const rankedGenes: RankedGene[] = [];
                const excludedGenes: Array<{ symbol: string; reason: string }> = [];
                const seenSymbols = new Set<string>();

                let duplicateCount = 0;
                let excludedCount = 0;

                selectedRows.forEach((d) => {
                  const symbol = (d.gene_name || d.symbol || "").trim().toUpperCase();
                  if (!symbol) return;

                  if (seenSymbols.has(symbol)) {
                    duplicateCount++;
                    return;
                  }

                  const metricVal = d.log2FC;
                  if (metricVal === undefined || metricVal === null || isNaN(metricVal) || !isFinite(metricVal)) {
                    excludedCount++;
                    excludedGenes.push({
                      symbol: d.gene_name || symbol,
                      reason: "Missing or non-numeric log2FC metric in dataset"
                    });
                    return;
                  }

                  seenSymbols.add(symbol);
                  const pVal = d.pval !== undefined ? d.pval : (d.p_value ?? 0.05);
                  const adjPVal = d.qval !== undefined ? d.qval : d.adj_p_value;

                  geneSymbols.push(symbol);
                  rankedGenes.push({
                    symbol,
                    rankMetric: metricVal,
                    log2FC: metricVal,
                    pValue: pVal,
                    adjPValue: adjPVal
                  });
                });

                rankedGenes.sort((a, b) => b.rankMetric - a.rankMetric);

                const transferMetadata: DegTransferMetadata = {
                  datasetName,
                  metricName,
                  totalSelected,
                  transferredCount: rankedGenes.length,
                  excludedCount,
                  duplicateCount,
                  excludedGenes
                };

                if (onRunPathwayAnalysis) {
                  onRunPathwayAnalysis(geneSymbols, rankedGenes, transferMetadata);
                }
              }}
              className="flex items-center gap-2 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 px-4 py-2 rounded-xl font-bold transition shadow-lg hover:shadow-teal-500/20 font-mono text-xs cursor-pointer"
              title="Run Over-Representation & GSEA Pathway Analysis on selected or significant DEGs"
            >
              <Layers className="w-4 h-4" />
              <span>Run Pathway Analysis ({selectedGenes.size > 0 ? selectedGenes.size : "Significant"} DEGs)</span>
            </button>
          )}

          <ExportButton
            label="Export CSV"
            onExportCSV={handleExportCSV}
            disabled={processedData.length === 0}
          />
        </div>
      </div>

      {/* ── DATA TABLE CONTAINER ── */}
      <div className="overflow-x-auto border border-slate-800/80 rounded-xl bg-slate-950 shadow-inner">
        <table className="w-full text-xs text-left border-collapse font-sans">
          <thead>
            {isTcgaGtex ? (
              // TCGA-GTEx columns
              <tr className="border-b border-slate-800/90 text-slate-400 font-mono uppercase tracking-wider text-[11px] bg-slate-900/90 select-none">
                <th className="p-3.5 pl-4 w-10 text-center">
                  <span className="sr-only">Select</span>
                </th>
                <th
                  onClick={() => handleSort("gene_name")}
                  className="p-3.5 cursor-pointer hover:bg-slate-800/60 hover:text-slate-200 transition-colors"
                >
                  Symbol {renderSortIcon("gene_name")}
                </th>
                <th
                  onClick={() => handleSort("log2FC")}
                  className="p-3.5 cursor-pointer hover:bg-slate-800/60 hover:text-slate-200 transition-colors text-right"
                >
                  Wilcoxon FC {renderSortIcon("log2FC")}
                </th>
                <th
                  onClick={() => handleSort("p_value")}
                  className="p-3.5 cursor-pointer hover:bg-slate-800/60 hover:text-slate-200 transition-colors text-right text-slate-400"
                  title="Wilcoxon FDR (q-value)"
                >
                  Wilcoxon FDR {renderSortIcon("p_value")}
                </th>
                <th
                  onClick={() => handleSort("voom_log2FC")}
                  className="p-3.5 cursor-pointer hover:bg-slate-800/60 hover:text-slate-200 transition-colors text-right text-slate-400"
                  title="limma-voom expected-count log2 fold change"
                >
                  voom log2FC {renderSortIcon("voom_log2FC")}
                </th>
                <th
                  onClick={() => handleSort("voom_qval")}
                  className="p-3.5 cursor-pointer hover:bg-slate-800/60 hover:text-slate-200 transition-colors text-right text-slate-400"
                  title="limma-voom FDR adjusted p-value"
                >
                  voom FDR {renderSortIcon("voom_qval")}
                </th>
                <th
                  onClick={() => handleSort("robust_deg")}
                  className="p-3.5 cursor-pointer hover:bg-slate-800/60 hover:text-slate-200 transition-colors text-center"
                  title="Cross-method robust DEG"
                >
                  Concordant DEG {renderSortIcon("robust_deg")}
                </th>
                <th
                  onClick={() => handleSort("pct_tumor_gt1")}
                  className="p-3.5 cursor-pointer hover:bg-slate-800/60 hover:text-slate-200 transition-colors text-right"
                  title="Percentage of TCGA tumor samples with expression > 1 TPM"
                >
                  % Tumor &gt;1 {renderSortIcon("pct_tumor_gt1")}
                </th>
                <th
                  onClick={() => handleSort("pct_gtex_gt1")}
                  className="p-3.5 cursor-pointer hover:bg-slate-800/60 hover:text-slate-200 transition-colors text-right pr-4"
                  title="Percentage of GTEx normal samples with expression > 1 TPM"
                >
                  % GTEx &gt;1 {renderSortIcon("pct_gtex_gt1")}
                </th>
              </tr>
            ) : (
              // SBRT standard columns
              <tr className="border-b border-slate-800/90 text-slate-400 font-mono uppercase tracking-wider text-[11px] bg-slate-900/90 select-none">
                <th className="p-3.5 pl-4 w-10 text-center">
                  <span className="sr-only">Select</span>
                </th>
                <th
                  onClick={() => handleSort("gene_name")}
                  className="p-3.5 cursor-pointer hover:bg-slate-800/60 hover:text-slate-200 transition-colors"
                >
                  Gene Name {renderSortIcon("gene_name")}
                </th>
                <th
                  onClick={() => handleSort("gene_index")}
                  className="p-3.5 cursor-pointer hover:bg-slate-800/60 hover:text-slate-200 transition-colors text-center font-mono"
                >
                  Gene Index {renderSortIcon("gene_index")}
                </th>
                <th
                  onClick={() => handleSort("log2FC")}
                  className="p-3.5 cursor-pointer hover:bg-slate-800/60 hover:text-slate-200 transition-colors text-right"
                >
                  log2FC {renderSortIcon("log2FC")}
                </th>
                <th
                  onClick={() => handleSort("p_value")}
                  className="p-3.5 cursor-pointer hover:bg-slate-800/60 hover:text-slate-200 transition-colors text-right"
                >
                  p-value {renderSortIcon("p_value")}
                </th>
                <th
                  onClick={() => handleSort("adj_p_value")}
                  className="p-3.5 cursor-pointer hover:bg-slate-800/60 hover:text-slate-200 transition-colors pr-4 text-right"
                >
                  Adj. p-value {renderSortIcon("adj_p_value")}
                </th>
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={isTcgaGtex ? 9 : 6} className="p-12 text-center text-slate-500 font-mono">
                  No matching genes found.
                </td>
              </tr>
            ) : (
              paginatedData.map((row) => {
                const isSelected = row.gene_name === selectedGene;
                const isChecked = selectedGenes.has(row.gene_name);
                const isUp = row.log2FC > 0;

                return (
                  <tr
                    key={row.gene_name}
                    onClick={() => onSelectGene(row.gene_name)}
                    className={`cursor-pointer transition-colors duration-150 ${
                      isSelected
                        ? "bg-teal-950/40 border-l-4 border-l-teal-400"
                        : isChecked
                        ? "bg-indigo-950/30 hover:bg-indigo-950/40"
                        : "hover:bg-slate-900/60"
                    }`}
                  >
                    {/* Checkbox Column */}
                    <td className="p-3 pl-4 text-center" onClick={(e) => toggleSelectGeneRow(e, row.gene_name)}>
                      {isChecked ? (
                        <CheckSquare className="w-4 h-4 text-teal-400 inline cursor-pointer" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-600 hover:text-slate-400 inline cursor-pointer" />
                      )}
                    </td>

                    {isTcgaGtex ? (
                      // TCGA-GTEx Row Cells
                      <>
                        <td className="p-3 font-semibold text-slate-200">
                          <span className="text-teal-400 hover:underline">{row.gene_name}</span>
                        </td>
                        <td className="p-3 text-right font-mono">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-md font-semibold text-xs border ${
                              isUp
                                ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                : "bg-sky-500/10 text-sky-400 border-sky-500/20"
                            }`}
                          >
                            {isUp ? "+" : ""}
                            {row.log2FC.toFixed(4)}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono text-slate-300">
                          {formatPVal(row.qval !== undefined ? row.qval : row.p_value)}
                        </td>
                        <td className="p-3 text-right font-mono opacity-80">
                          {row.voom_log2FC !== undefined ? (
                            <span className={row.voom_log2FC > 0 ? "text-rose-400/80" : "text-sky-400/80"}>
                              {row.voom_log2FC > 0 ? "+" : ""}
                              {row.voom_log2FC.toFixed(4)}
                            </span>
                          ) : (
                            <span className="text-slate-600">N/A</span>
                          )}
                        </td>
                        <td className="p-3 text-right font-mono text-slate-400 opacity-80">
                          {formatPVal(row.voom_qval)}
                        </td>
                        <td className="p-3 text-center">
                          {row.robust_deg ? (
                            <span 
                              className="inline-flex items-center gap-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] px-2 py-0.5 rounded-full font-mono font-bold"
                              title="Significant with concordant direction across Wilcoxon and limma-voom analyses."
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              Concordant
                            </span>
                          ) : (
                            <span className="text-slate-600 font-mono text-[10px]">&mdash;</span>
                          )}
                        </td>
                        <td className="p-3 text-right font-mono text-slate-400">
                          {row.pct_tumor_gt1 !== undefined ? `${(row.pct_tumor_gt1 * 100).toFixed(1)}%` : "N/A"}
                        </td>
                        <td className="p-3 text-right pr-4 font-mono text-slate-400">
                          {row.pct_gtex_gt1 !== undefined ? `${(row.pct_gtex_gt1 * 100).toFixed(1)}%` : "N/A"}
                        </td>
                      </>
                    ) : (
                      // SBRT Row Cells
                      <>
                        <td className="p-3 font-semibold text-slate-200">
                          <span className="text-teal-400 hover:underline">{row.gene_name}</span>
                        </td>
                        <td className="p-3 text-center text-slate-400 font-mono text-xs">
                          {row.gene_index !== undefined ? row.gene_index : "N/A"}
                        </td>
                        <td className="p-3 text-right font-mono">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-md font-semibold text-xs border ${
                              isUp
                                ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                : "bg-sky-500/10 text-sky-400 border-sky-500/20"
                            }`}
                          >
                            {isUp ? "+" : ""}
                            {row.log2FC.toFixed(4)}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono text-slate-300">
                          {formatPVal(row.p_value)}
                        </td>
                        <td className="p-3 text-right pr-4 font-mono text-slate-400">
                          {formatPVal(row.adj_p_value)}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── FOOTER PAGINATION CONTROLS ── */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-4 text-xs text-slate-400 font-mono">
        <div>
          Showing <span className="text-slate-200 font-bold">{processedData.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</span> to{" "}
          <span className="text-slate-200 font-bold">{Math.min(currentPage * pageSize, processedData.length)}</span> of{" "}
          <span className="text-slate-200 font-bold">{processedData.length.toLocaleString()}</span> entries
        </div>

        <div className="flex items-center gap-1.5 select-none">
          <button
            onClick={() => setCurrentPage(1)}
            disabled={currentPage === 1}
            className="px-2 py-1 border border-slate-800 rounded-lg bg-slate-950 hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors text-slate-300"
            title="First Page"
          >
            &laquo;
          </button>
          <button
            onClick={() => setCurrentPage(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-3 py-1 border border-slate-800 rounded-lg bg-slate-950 hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors flex items-center gap-1 text-slate-300 font-medium"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Prev
          </button>

          <span className="px-3.5 py-1 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 font-bold">
            Page {currentPage} of {totalPages}
          </span>

          <button
            onClick={() => setCurrentPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="px-3 py-1 border border-slate-800 rounded-lg bg-slate-950 hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors flex items-center gap-1 text-slate-300 font-medium"
          >
            Next <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setCurrentPage(totalPages)}
            disabled={currentPage === totalPages}
            className="px-2 py-1 border border-slate-800 rounded-lg bg-slate-950 hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors text-slate-300"
            title="Last Page"
          >
            &raquo;
          </button>
        </div>
      </div>
    </div>
  );
}
