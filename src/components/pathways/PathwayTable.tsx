"use client";

import React, { useState, useMemo } from "react";
import { Search, ChevronLeft, ChevronRight, Download, ExternalLink, AlertCircle } from "lucide-react";
import { PathwayEnrichmentResult } from "@/types/pathway";
import { exportToCSV } from "@/utils/exportUtils";

interface PathwayTableProps {
  results: PathwayEnrichmentResult[];
  onSelectPathway: (pathway: PathwayEnrichmentResult) => void;
  analysisMode: "ORA" | "GSEA";
}

type SortField = "pathwayName" | "database" | "pValue" | "adjPValue" | "metric" | "overlap";

export default function PathwayTable({
  results,
  onSelectPathway,
  analysisMode
}: PathwayTableProps) {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("adjPValue");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const isGsea = analysisMode === "GSEA";

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const processedResults = useMemo(() => {
    let filtered = [...results];

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      filtered = filtered.filter(
        (r) => r.pathwayName.toLowerCase().includes(q) || r.database.toLowerCase().includes(q) || r.contributingGenes.some(g => g.toLowerCase().includes(q))
      );
    }

    filtered.sort((a, b) => {
      let valA: string | number = 0;
      let valB: string | number = 0;

      if (sortField === "pathwayName") {
        valA = a.pathwayName;
        valB = b.pathwayName;
      } else if (sortField === "database") {
        valA = a.database;
        valB = b.database;
      } else if (sortField === "pValue") {
        valA = a.pValue;
        valB = b.pValue;
      } else if (sortField === "adjPValue") {
        valA = a.adjPValue;
        valB = b.adjPValue;
      } else if (sortField === "metric") {
        valA = isGsea ? Math.abs(a.nes || 0) : (a.foldEnrichment || 0);
        valB = isGsea ? Math.abs(b.nes || 0) : (b.foldEnrichment || 0);
      } else if (sortField === "overlap") {
        valA = isGsea ? (a.leadingEdgeCount || 0) : (a.overlapCount || 0);
        valB = isGsea ? (b.leadingEdgeCount || 0) : (b.overlapCount || 0);
      }

      if (typeof valA === "string" && typeof valB === "string") {
        return sortDirection === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortDirection === "asc" ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });

    return filtered;
  }, [results, search, sortField, sortDirection, isGsea]);

  // Lightweight Pathway Redundancy Detection (Check if top pathways share >50% genes)
  const redundancyAlertCount = useMemo(() => {
    if (processedResults.length < 2) return 0;
    let count = 0;
    const top5 = processedResults.slice(0, 5);
    for (let i = 0; i < top5.length; i++) {
      const setA = new Set(top5[i].contributingGenes);
      for (let j = i + 1; j < top5.length; j++) {
        const setB = top5[j].contributingGenes;
        const overlap = setB.filter(g => setA.has(g)).length;
        const minLen = Math.min(setA.size, setB.length);
        if (minLen > 0 && overlap / minLen > 0.5) {
          count++;
        }
      }
    }
    return count;
  }, [processedResults]);

  const totalPages = Math.max(1, Math.ceil(processedResults.length / pageSize));
  const paginated = processedResults.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleExportCSV = () => {
    const headers = [
      "Rank",
      "Pathway ID",
      "Pathway Name",
      "Database",
      "Database Version",
      "Analysis Mode",
      "Direction",
      "P-Value",
      "BH FDR",
      "Fold Enrichment",
      "NES",
      "Overlap Count",
      "Leading Edge Count",
      "Gene Set Size",
      "Dataset",
      "Comparison"
    ];

    const rows = processedResults.map((r, idx) => [
      idx + 1,
      r.pathwayId,
      r.pathwayName,
      r.database,
      r.databaseVersion,
      r.analysisMode,
      r.direction,
      r.pValue,
      r.adjPValue,
      r.foldEnrichment ?? "",
      r.nes ?? "",
      r.overlapCount ?? "",
      r.leadingEdgeCount ?? "",
      r.geneSetSize,
      r.datasetName,
      r.comparisonLabel
    ]);

    exportToCSV({
      filename: "pathway_enrichment_results.csv",
      metadata: {
        module: "Pathway Explorer",
        dataset: processedResults[0]?.datasetName || "PDAC Cohort",
        filters: `Mode: ${analysisMode}, Total Enriched: ${processedResults.length}`
      },
      headers,
      rows
    });
  };

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(processedResults, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pathway_enrichment_results.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col gap-4 shadow-xl">
      {/* Header controls & Export */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm font-mono">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            placeholder="Search pathway name or gene..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500"
          />
        </div>

        <div className="flex items-center gap-2 text-xxs font-mono">
          {redundancyAlertCount > 0 && (
            <div className="bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5" title="Some top pathways share >50% contributing gene overlap (e.g. nested GO/Reactome terms)">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
              <span>Redundant Terms Detected</span>
            </div>
          )}
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 bg-slate-950 hover:bg-slate-800 text-slate-200 px-3 py-2 rounded-lg border border-slate-800 transition font-bold"
          >
            <Download className="w-3.5 h-3.5 text-teal-400" />
            <span>Export Table CSV</span>
          </button>
          <button
            onClick={handleExportJSON}
            className="flex items-center gap-1.5 bg-slate-950 hover:bg-slate-800 text-slate-200 px-3 py-2 rounded-lg border border-slate-800 transition font-bold"
          >
            <Download className="w-3.5 h-3.5 text-indigo-400" />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {/* Table Area */}
      <div className="border border-slate-800 rounded-xl overflow-hidden font-mono bg-slate-950">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 text-xxs uppercase tracking-wider">
              <tr>
                <th className="p-3">Rank</th>
                <th className="p-3 cursor-pointer hover:text-white" onClick={() => handleSort("pathwayName")}>
                  Pathway Name
                </th>
                <th className="p-3 cursor-pointer hover:text-white" onClick={() => handleSort("database")}>
                  Database
                </th>
                <th className="p-3 cursor-pointer hover:text-white text-right" onClick={() => handleSort("metric")}>
                  {isGsea ? "NES" : "Fold Enrich"}
                </th>
                <th className="p-3 cursor-pointer hover:text-white text-right" onClick={() => handleSort("pValue")}>
                  p-value
                </th>
                <th className="p-3 cursor-pointer hover:text-white text-right" onClick={() => handleSort("adjPValue")}>
                  BH FDR
                </th>
                <th className="p-3 cursor-pointer hover:text-white text-center" onClick={() => handleSort("overlap")}>
                  {isGsea ? "Leading / Size" : "Overlap / Size"}
                </th>
                <th className="p-3 text-center">Direction</th>
                <th className="p-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850 text-slate-300">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-slate-500">
                    No pathways found matching current filters.
                  </td>
                </tr>
              ) : (
                paginated.map((r, idx) => {
                  const globalRank = (currentPage - 1) * pageSize + idx + 1;
                  return (
                    <tr key={r.pathwayId} className="hover:bg-slate-900/60 transition">
                      <td className="p-3 text-slate-500 font-bold">#{globalRank}</td>
                      <td className="p-3 font-semibold text-slate-100 max-w-xs truncate" title={r.pathwayName}>
                        {r.pathwayName}
                      </td>
                      <td className="p-3 text-slate-400">
                        <span className="bg-slate-900 px-2 py-0.5 rounded text-xxs border border-slate-800">
                          {r.database}
                        </span>
                      </td>
                      <td className="p-3 text-right font-bold text-amber-400">
                        {isGsea ? (r.nes ? r.nes.toFixed(3) : "N/A") : (r.foldEnrichment ? r.foldEnrichment.toFixed(2) + "x" : "N/A")}
                      </td>
                      <td className="p-3 text-right text-slate-400">{r.pValue.toExponential(2)}</td>
                      <td className="p-3 text-right font-bold text-teal-400">{r.adjPValue.toExponential(2)}</td>
                      <td className="p-3 text-center font-bold text-slate-200">
                        {isGsea ? `${r.leadingEdgeCount} / ${r.geneSetSize}` : `${r.overlapCount} / ${r.geneSetSize}`}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${r.direction === "Upregulated" ? "bg-red-500/10 text-red-400 border border-red-500/30" : r.direction === "Downregulated" ? "bg-blue-500/10 text-blue-400 border border-blue-500/30" : "bg-teal-500/10 text-teal-400 border border-teal-500/30"}`}>
                          {r.direction}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => onSelectPathway(r)}
                          className="bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 border border-teal-500/30 px-2.5 py-1 rounded text-xxs font-bold transition flex items-center gap-1 ml-auto"
                        >
                          <span>Inspect</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-3 bg-slate-900 border-t border-slate-800 flex justify-between items-center text-xxs text-slate-400">
          <span>Showing {paginated.length} of {processedResults.length} Enriched Pathways</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="p-1 rounded bg-slate-950 border border-slate-800 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span>Page {currentPage} of {totalPages}</span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="p-1 rounded bg-slate-950 border border-slate-800 disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
