"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, HelpCircle } from "lucide-react";
import ExportButton from "@/components/ExportButton";
import { exportToCSV } from "@/utils/exportUtils";

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
}: GeneTableProps) {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>(isTcgaGtex ? "qval" : "p_value");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filterRobust, setFilterRobust] = useState<"all" | "robust" | "non_robust">("all");

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
      // Determine the value to compare based on SortField and study context
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      // Custom alias mappings for TCGA-GTEx fields if sorted by SBRT names
      if (isTcgaGtex) {
        if (sortField === "p_value") {
          valA = a.pval;
          valB = b.pval;
        } else if (sortField === "adj_p_value") {
          valA = a.qval;
          valB = b.qval;
        }
      }

      // Handle undefined/null values
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
        // Numbers
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
    if (sortField !== field) return null;
    return sortDirection === "asc" ? (
      <ChevronUp className="w-3 h-3 inline ml-0.5" />
    ) : (
      <ChevronDown className="w-3 h-3 inline ml-0.5" />
    );
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col w-full">
      <div className="flex flex-col xl:flex-row justify-between items-stretch xl:items-center gap-4 mb-4">
        <div>
          <h3 className="text-slate-200 font-semibold text-lg">Gene Expression Data Table</h3>
          <p className="text-xs text-slate-400">
            Search, sort, and browse full dataset transcripts ({processedData.length} filtered of {data.length})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Robust DEG Filter (TCGA-GTEx Only) */}
          {isTcgaGtex && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
              <span>Category:</span>
              <select
                value={filterRobust}
                onChange={(e) => setFilterRobust(e.target.value as any)}
                className="bg-slate-950 border border-slate-800 rounded px-2 py-1.5 focus:outline-none focus:border-teal-500 text-slate-300"
              >
                <option value="all">All Genes</option>
                <option value="robust">Concordant DEG (Robust)</option>
                <option value="non_robust">Non-Robust Only</option>
              </select>
            </div>
          )}

          {/* Search Box */}
          <div className="relative flex-1 sm:w-56">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder="Search genes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors font-mono"
            />
          </div>

          {/* Page Size Selector & Export Button */}
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <div className="flex items-center gap-1.5">
              <span>Show</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="bg-slate-950 border border-slate-800 rounded px-2 py-1.5 focus:outline-none focus:border-teal-500 text-slate-300"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span>entries</span>
            </div>

            <ExportButton
              label="Export CSV"
              onExportCSV={handleExportCSV}
              disabled={processedData.length === 0}
            />
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto border border-slate-800 rounded-lg bg-slate-950">
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            {isTcgaGtex ? (
              // TCGA-GTEx columns
              <tr className="border-b border-slate-800 text-slate-400 font-semibold bg-slate-900/60 select-none font-mono">
                <th
                  onClick={() => handleSort("gene_name")}
                  className="p-3 pl-4 cursor-pointer hover:bg-slate-800/50 hover:text-slate-200 transition-colors"
                >
                  Symbol {renderSortIcon("gene_name")}
                </th>
                <th
                  onClick={() => handleSort("log2FC")}
                  className="p-3 cursor-pointer hover:bg-slate-800/50 hover:text-slate-200 transition-colors text-right"
                >
                  Wilcoxon FC {renderSortIcon("log2FC")}
                </th>
                <th
                  onClick={() => handleSort("p_value")}
                  className="p-3 cursor-pointer hover:bg-slate-800/50 hover:text-slate-200 transition-colors text-right text-slate-400"
                  title="Wilcoxon FDR (q-value)"
                >
                  Wilcoxon FDR {renderSortIcon("p_value")}
                </th>
                <th
                  onClick={() => handleSort("voom_log2FC")}
                  className="p-3 cursor-pointer hover:bg-slate-800/50 hover:text-slate-200 transition-colors text-right text-slate-500"
                  title="limma-voom expected-count log2 fold change"
                >
                  voom log2FC {renderSortIcon("voom_log2FC")}
                </th>
                <th
                  onClick={() => handleSort("voom_qval")}
                  className="p-3 cursor-pointer hover:bg-slate-800/50 hover:text-slate-200 transition-colors text-right text-slate-500"
                  title="limma-voom FDR adjusted p-value"
                >
                  voom FDR {renderSortIcon("voom_qval")}
                </th>
                <th
                  onClick={() => handleSort("robust_deg")}
                  className="p-3 cursor-pointer hover:bg-slate-800/50 hover:text-slate-200 transition-colors text-center"
                  title="Cross-method robust DEG"
                >
                  Robust DEG? {renderSortIcon("robust_deg")}
                </th>
                <th
                  onClick={() => handleSort("pct_tumor_gt1")}
                  className="p-3 cursor-pointer hover:bg-slate-800/50 hover:text-slate-200 transition-colors text-right"
                  title="Percentage of TCGA tumor samples with expression > 1 TPM"
                >
                  % Tumor &gt;1 {renderSortIcon("pct_tumor_gt1")}
                </th>
                <th
                  onClick={() => handleSort("pct_gtex_gt1")}
                  className="p-3 cursor-pointer hover:bg-slate-800/50 hover:text-slate-200 transition-colors text-right pr-4"
                  title="Percentage of GTEx normal samples with expression > 1 TPM"
                >
                  % GTEx &gt;1 {renderSortIcon("pct_gtex_gt1")}
                </th>
              </tr>
            ) : (
              // SBRT standard columns
              <tr className="border-b border-slate-800 text-slate-400 font-semibold bg-slate-900/60 select-none">
                <th
                  onClick={() => handleSort("gene_name")}
                  className="p-3 pl-4 cursor-pointer hover:bg-slate-800/50 hover:text-slate-200 transition-colors"
                >
                  Gene Name {renderSortIcon("gene_name")}
                </th>
                <th
                  onClick={() => handleSort("gene_index")}
                  className="p-3 cursor-pointer hover:bg-slate-800/50 hover:text-slate-200 transition-colors text-center font-mono"
                >
                  Gene Index {renderSortIcon("gene_index")}
                </th>
                <th
                  onClick={() => handleSort("log2FC")}
                  className="p-3 cursor-pointer hover:bg-slate-800/50 hover:text-slate-200 transition-colors text-right"
                >
                  log2FC {renderSortIcon("log2FC")}
                </th>
                <th
                  onClick={() => handleSort("p_value")}
                  className="p-3 cursor-pointer hover:bg-slate-800/50 hover:text-slate-200 transition-colors text-right"
                >
                  p-value {renderSortIcon("p_value")}
                </th>
                <th
                  onClick={() => handleSort("adj_p_value")}
                  className="p-3 cursor-pointer hover:bg-slate-800/50 hover:text-slate-200 transition-colors pr-4 text-right"
                >
                  Adj. p-value {renderSortIcon("adj_p_value")}
                </th>
              </tr>
            )}
          </thead>
          <tbody>
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={isTcgaGtex ? 8 : 5} className="p-8 text-center text-slate-500 font-mono">
                  No matching genes found.
                </td>
              </tr>
            ) : (
              paginatedData.map((row) => {
                const isSelected = row.gene_name === selectedGene;
                return (
                  <tr
                    key={row.gene_name}
                    onClick={() => onSelectGene(row.gene_name)}
                    className={`border-b border-slate-800/40 cursor-pointer transition-colors hover:bg-slate-850/30 ${
                      isSelected ? "bg-teal-950/20 border-l-2 border-l-amber-500" : ""
                    }`}
                  >
                    {isTcgaGtex ? (
                      // TCGA-GTEx Row Cells
                      <>
                        <td className="p-2.5 pl-4 font-semibold text-slate-200">
                          <span className="text-teal-400 hover:underline">{row.gene_name}</span>
                        </td>
                        <td
                          className={`p-2.5 text-right font-mono font-medium ${
                            row.log2FC > 0 ? "text-red-400" : "text-blue-400"
                          }`}
                        >
                          {row.log2FC > 0 ? "+" : ""}
                          {row.log2FC.toFixed(4)}
                        </td>
                        <td className="p-2.5 text-right font-mono text-slate-300">
                          {row.qval !== undefined ? row.qval.toExponential(4) : "N/A"}
                        </td>
                        <td
                          className={`p-2.5 text-right font-mono font-medium opacity-80 ${
                            row.voom_log2FC !== undefined 
                              ? row.voom_log2FC > 0 ? "text-red-400/80" : "text-blue-400/80"
                              : "text-slate-500"
                          }`}
                        >
                          {row.voom_log2FC !== undefined 
                            ? `${row.voom_log2FC > 0 ? "+" : ""}${row.voom_log2FC.toFixed(4)}`
                            : "N/A"
                          }
                        </td>
                        <td className="p-2.5 text-right font-mono text-slate-400 opacity-80">
                          {row.voom_qval !== undefined ? row.voom_qval.toExponential(4) : "N/A"}
                        </td>
                        <td className="p-2.5 text-center">
                          {row.robust_deg ? (
                            <span 
                              className="inline-block bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[9px] px-1.5 py-0.5 rounded font-mono font-bold"
                              title="Significant with concordant direction across Wilcoxon and limma-voom analyses under predefined thresholds."
                            >
                              Concordant DEG
                            </span>
                          ) : (
                            <span className="text-slate-600 text-[10px] font-mono">&mdash;</span>
                          )}
                        </td>
                        <td className="p-2.5 text-right font-mono text-slate-400">
                          {row.pct_tumor_gt1 !== undefined ? `${(row.pct_tumor_gt1 * 100).toFixed(1)}%` : "N/A"}
                        </td>
                        <td className="p-2.5 text-right pr-4 font-mono text-slate-400">
                          {row.pct_gtex_gt1 !== undefined ? `${(row.pct_gtex_gt1 * 100).toFixed(1)}%` : "N/A"}
                        </td>
                      </>
                    ) : (
                      // SBRT Row Cells
                      <>
                        <td className="p-2.5 pl-4 font-semibold text-slate-200">
                          <span className="text-teal-400 hover:underline">{row.gene_name}</span>
                        </td>
                        <td className="p-2.5 text-center text-slate-400 font-mono text-xs">
                          {row.gene_index !== undefined ? row.gene_index : "N/A"}
                        </td>
                        <td
                          className={`p-2.5 text-right font-mono font-medium ${
                            row.log2FC > 0 ? "text-red-400" : "text-blue-400"
                          }`}
                        >
                          {row.log2FC > 0 ? "+" : ""}
                          {row.log2FC.toFixed(4)}
                        </td>
                        <td className="p-2.5 text-right font-mono text-xs text-slate-300">
                          {row.p_value.toExponential(4)}
                        </td>
                        <td className="p-2.5 text-right pr-4 font-mono text-xs text-slate-400">
                          {row.adj_p_value !== undefined ? row.adj_p_value.toExponential(4) : "N/A"}
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

      {/* Pagination Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-4 text-xs text-slate-400 font-mono">
        <div>
          Showing {(currentPage - 1) * pageSize + 1} to{" "}
          {Math.min(currentPage * pageSize, processedData.length)} of{" "}
          {processedData.length} entries
        </div>

        <div className="flex items-center gap-1 select-none">
          <button
            onClick={() => setCurrentPage(1)}
            disabled={currentPage === 1}
            className="p-1.5 border border-slate-800 rounded bg-slate-950 hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            &laquo;
          </button>
          <button
            onClick={() => setCurrentPage(currentPage - 1)}
            disabled={currentPage === 1}
            className="p-1.5 border border-slate-800 rounded bg-slate-950 hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors flex items-center gap-1"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Prev
          </button>

          <span className="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200">
            Page {currentPage} of {totalPages}
          </span>

          <button
            onClick={() => setCurrentPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="p-1.5 border border-slate-800 rounded bg-slate-950 hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors flex items-center gap-1"
          >
            Next <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setCurrentPage(totalPages)}
            disabled={currentPage === totalPages}
            className="p-1.5 border border-slate-800 rounded bg-slate-950 hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            &raquo;
          </button>
        </div>
      </div>
    </div>
  );
}
