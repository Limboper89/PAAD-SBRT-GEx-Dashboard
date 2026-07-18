"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from "lucide-react";

interface GeneData {
  gene_name: string;
  gene_index?: number;
  log2FC: number;
  p_value: number;
  adj_p_value?: number;
}

interface GeneTableProps {
  data: GeneData[];
  selectedGene: string | null;
  onSelectGene: (geneName: string) => void;
}

type SortField = "gene_name" | "gene_index" | "log2FC" | "p_value" | "adj_p_value";
type SortDirection = "asc" | "desc";

export default function GeneTable({ data, selectedGene, onSelectGene }: GeneTableProps) {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("p_value");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Reset page on search change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, pageSize]);

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

    // 2. Sorting
    result.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      // Handle undefined/null values
      if (valA === undefined || valA === null) return 1;
      if (valB === undefined || valB === null) return -1;

      if (typeof valA === "string" && typeof valB === "string") {
        return sortDirection === "asc"
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      } else {
        // Numbers
        return sortDirection === "asc"
          ? (valA as number) - (valB as number)
          : (valB as number) - (valA as number);
      }
    });

    return result;
  }, [data, search, sortField, sortDirection]);

  // Pagination slicing
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return processedData.slice(startIndex, startIndex + pageSize);
  }, [processedData, currentPage, pageSize]);

  const totalPages = Math.max(1, Math.ceil(processedData.length / pageSize));

  // Render sort indicators
  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return null;
    return sortDirection === "asc" ? (
      <ChevronUp className="w-3.5 h-3.5 inline ml-1" />
    ) : (
      <ChevronDown className="w-3.5 h-3.5 inline ml-1" />
    );
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col w-full">
      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 mb-4">
        <div>
          <h3 className="text-slate-200 font-semibold text-lg">Gene Expression Data Table</h3>
          <p className="text-xs text-slate-400">
            Search, sort, and browse full dataset transcripts ({processedData.length} filtered of {data.length})
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Search Box */}
          <div className="relative flex-1 sm:w-64">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder="Search genes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
            />
          </div>

          {/* Page Size Selector */}
          <div className="flex items-center gap-2 text-xs text-slate-400">
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
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto border border-slate-800 rounded-lg bg-slate-950">
        <table className="w-full text-sm text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 font-semibold bg-slate-900/60 select-none">
              <th
                onClick={() => handleSort("gene_name")}
                className="p-3 pl-4 cursor-pointer hover:bg-slate-800/50 hover:text-slate-200 transition-colors"
              >
                Gene Name {renderSortIcon("gene_name")}
              </th>
              <th
                onClick={() => handleSort("gene_index")}
                className="p-3 cursor-pointer hover:bg-slate-800/50 hover:text-slate-200 transition-colors text-center"
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
          </thead>
          <tbody>
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-500">
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
                    className={`border-b border-slate-800/40 cursor-pointer transition-colors hover:bg-slate-800/20 ${
                      isSelected ? "bg-teal-950/20 border-l-2 border-l-amber-500" : ""
                    }`}
                  >
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
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-4 text-xs text-slate-400">
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
