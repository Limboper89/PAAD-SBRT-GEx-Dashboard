"use client";

import React, { useState } from "react";

import { X, ExternalLink, Download, CheckCircle2, ShieldCheck } from "lucide-react";
import { PathwayEnrichmentResult, MappingQC } from "@/types/pathway";
import { exportToCSV } from "@/utils/exportUtils";

interface PathwayDetailModalProps {
  pathway: PathwayEnrichmentResult | null;
  mappingQC?: MappingQC | null;
  onClose: () => void;
  onSelectGene?: (geneSymbol: string) => void;
}

export default function PathwayDetailModal({
  pathway,
  mappingQC,
  onClose,
  onSelectGene
}: PathwayDetailModalProps) {
  const [activeSubTab, setActiveSubTab] = useState<"genes" | "overlay">("genes");

  if (!pathway) return null;

  const isGsea = pathway.analysisMode === "GSEA";
  const geneDetails = pathway.geneExpressionDetails || [];

  const handleExportCSV = () => {
    const headers = [
      "Rank",
      "Gene Symbol",
      "log2 Fold Change",
      "P-Value",
      "FDR",
      "Is Significant",
      "Is Leading Edge"
    ];

    const rows = geneDetails.map((g, idx) => [
      idx + 1,
      g.symbol,
      g.log2FC,
      g.pValue,
      g.adjPValue ?? "N/A",
      g.isSignificant ? "Yes" : "No",
      g.isLeadingEdge ? "Yes" : "No"
    ]);

    exportToCSV({
      filename: `${pathway.pathwayId}_genes.csv`,
      metadata: {
        module: "Pathway Explorer - Contributing Genes",
        dataset: pathway.datasetName,
        filters: `Pathway: ${pathway.pathwayName}, Mode: ${pathway.analysisMode}`
      },
      headers,
      rows
    });
  };

  const handleExportJSON = () => {
    const jsonPayload = {
      pathwayMetadata: {
        pathwayId: pathway.pathwayId,
        pathwayName: pathway.pathwayName,
        database: pathway.database,
        databaseVersion: pathway.databaseVersion,
        analysisMode: pathway.analysisMode,
        datasetId: pathway.datasetId,
        datasetName: pathway.datasetName,
        comparisonLabel: pathway.comparisonLabel,
        description: pathway.description,
        externalUrl: pathway.externalUrl,
        exportedAt: new Date().toISOString()
      },
      enrichmentStatistics: {
        pValue: pathway.pValue,
        adjPValue: pathway.adjPValue,
        foldEnrichment: pathway.foldEnrichment,
        enrichmentScore: pathway.enrichmentScore,
        nes: pathway.nes,
        overlapCount: pathway.overlapCount,
        geneSetSize: pathway.geneSetSize,
        leadingEdgeCount: pathway.leadingEdgeCount
      },
      mappingQC: mappingQC ?? null,
      contributingGenes: geneDetails
    };

    const blob = new Blob([JSON.stringify(jsonPayload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${pathway.pathwayId}_full_results.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md font-sans">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-800 flex justify-between items-start bg-slate-950/50">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 text-xxs font-bold uppercase rounded bg-teal-500/10 text-teal-400 border border-teal-500/30">
                {pathway.database} [{pathway.databaseVersion}]
              </span>
              <span className="px-2.5 py-0.5 text-xxs font-bold uppercase rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                {pathway.analysisMode} Mode
              </span>
              <span className={`px-2.5 py-0.5 text-xxs font-bold uppercase rounded ${pathway.direction === "Upregulated" ? "bg-red-500/10 text-red-400 border border-red-500/30" : pathway.direction === "Downregulated" ? "bg-blue-500/10 text-blue-400 border border-blue-500/30" : "bg-teal-500/10 text-teal-400 border border-teal-500/30"}`}>
                {pathway.direction}
              </span>
            </div>
            <h2 className="text-xl font-bold text-slate-100">{pathway.pathwayName}</h2>
            <p className="text-xs text-slate-400 font-mono">{pathway.datasetName} &bull; {pathway.comparisonLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Description & External Resource Banner */}
          {pathway.description && (
            <div className="bg-slate-950/60 border border-slate-850 p-4 rounded-xl text-xs text-slate-300 leading-relaxed flex justify-between items-start gap-4">
              <div>
                <span className="text-slate-500 font-semibold block text-xxs uppercase tracking-wider mb-1 font-mono">
                  PATHWAY FUNCTION & BIOLOGICAL ROLE
                </span>
                {pathway.description}
              </div>
              {pathway.externalUrl && (
                <a
                  href={pathway.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs font-semibold text-teal-400 hover:text-teal-300 bg-teal-500/10 border border-teal-500/30 px-3 py-1.5 rounded-lg transition whitespace-nowrap"
                >
                  <span>External Resource</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          )}

          {/* Statistical Highlights Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-500 text-xxs uppercase block">P-Value</span>
              <span className="text-sm font-bold text-slate-200">{pathway.pValue.toExponential(3)}</span>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-500 text-xxs uppercase block">FDR (Adj. p)</span>
              <span className="text-sm font-bold text-teal-400">{pathway.adjPValue.toExponential(3)}</span>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-500 text-xxs uppercase block">
                {isGsea ? "Normalized ES (NES)" : "Fold Enrichment"}
              </span>
              <span className={`text-sm font-bold ${isGsea ? (pathway.nes && pathway.nes > 0 ? "text-red-400" : "text-blue-400") : "text-amber-400"}`}>
                {isGsea ? (pathway.nes ? pathway.nes.toFixed(3) : "N/A") : (pathway.foldEnrichment ? pathway.foldEnrichment.toFixed(2) + "x" : "N/A")}
              </span>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-500 text-xxs uppercase block">
                {isGsea ? "Leading-Edge / Size" : "Overlap / Size"}
              </span>
              <span className="text-sm font-bold text-slate-200">
                {isGsea ? `${pathway.leadingEdgeCount ?? 0} / ${pathway.geneSetSize}` : `${pathway.overlapCount} / ${pathway.geneSetSize}`}
              </span>
            </div>
          </div>

          {/* Sub-tab view buttons & Exporters */}
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 border-b border-slate-800 pb-3">
            <div className="flex gap-2 font-mono text-xs">
              <button
                onClick={() => setActiveSubTab("genes")}
                className={`px-3 py-1.5 rounded-lg font-semibold transition ${activeSubTab === "genes" ? "bg-teal-500 text-slate-950 font-bold" : "bg-slate-950 text-slate-400 border border-slate-800 hover:text-white"}`}
              >
                Mapped Genes ({geneDetails.length})
              </button>
              <button
                onClick={() => setActiveSubTab("overlay")}
                className={`px-3 py-1.5 rounded-lg font-semibold transition ${activeSubTab === "overlay" ? "bg-teal-500 text-slate-950 font-bold" : "bg-slate-950 text-slate-400 border border-slate-800 hover:text-white"}`}
              >
                Gene Expression Overlay
              </button>
            </div>

            <div className="flex items-center gap-2 text-xxs font-mono">
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 bg-slate-950 hover:bg-slate-800 text-slate-200 px-3 py-1.5 rounded-lg border border-slate-800 transition"
              >
                <Download className="w-3.5 h-3.5 text-teal-400" />
                <span>Export CSV</span>
              </button>
              <button
                onClick={handleExportJSON}
                className="flex items-center gap-1.5 bg-slate-950 hover:bg-slate-800 text-slate-200 px-3 py-1.5 rounded-lg border border-slate-800 transition"
              >
                <Download className="w-3.5 h-3.5 text-indigo-400" />
                <span>Export Metadata JSON</span>
              </button>
            </div>
          </div>

          {/* Mapped Genes Table Sub-tab */}
          {activeSubTab === "genes" && (
            <div className="bg-slate-950 border border-slate-850 rounded-xl overflow-hidden font-mono">
              <div className="overflow-x-auto max-h-72">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 text-xxs uppercase tracking-wider sticky top-0">
                    <tr>
                      <th className="p-3">Gene Symbol</th>
                      <th className="p-3">log₂ Fold Change</th>
                      <th className="p-3">P-Value</th>
                      <th className="p-3">FDR</th>
                      {isGsea && <th className="p-3">Leading Edge</th>}
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850 text-slate-300">
                    {geneDetails.map((g) => (
                      <tr key={g.symbol} className="hover:bg-slate-900/60 transition">
                        <td className="p-3 font-bold text-slate-100 flex items-center gap-2">
                          <span>{g.symbol}</span>
                          {g.isSignificant && (
                            <span className="text-[9px] bg-teal-500/10 text-teal-400 border border-teal-500/30 px-1.5 py-0.5 rounded font-normal">
                              Sig
                            </span>
                          )}
                        </td>
                        <td className={`p-3 font-semibold ${g.log2FC > 0 ? "text-red-400" : g.log2FC < 0 ? "text-blue-400" : "text-slate-400"}`}>
                          {g.log2FC > 0 ? "+" : ""}{g.log2FC.toFixed(3)}
                        </td>
                        <td className="p-3 text-slate-400">{g.pValue.toExponential(2)}</td>
                        <td className="p-3 text-slate-400">{g.adjPValue ? g.adjPValue.toExponential(2) : "N/A"}</td>
                        {isGsea && (
                          <td className="p-3">
                            {g.isLeadingEdge ? (
                              <span className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] px-2 py-0.5 rounded">
                                <CheckCircle2 className="w-3 h-3 text-amber-400" />
                                <span>Core</span>
                              </span>
                            ) : (
                              <span className="text-slate-600 text-xxs">-</span>
                            )}
                          </td>
                        )}
                        <td className="p-3 text-right">
                          {onSelectGene && (
                            <button
                              onClick={() => {
                                onSelectGene(g.symbol);
                                onClose();
                              }}
                              className="text-xxs text-teal-400 hover:underline font-semibold"
                            >
                              Inspect Gene &rarr;
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Gene Expression Overlay Sub-tab */}
          {activeSubTab === "overlay" && (
            <div className="bg-slate-950 border border-slate-850 rounded-xl p-4 font-mono space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-200">Gene Expression Overlay Waterfall Chart</h4>
                  <p className="text-xxs text-slate-500">Distribution of log₂ fold-change direction across mapped pathway members</p>
                </div>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-2">
                {geneDetails
                  .slice()
                  .sort((a, b) => b.log2FC - a.log2FC)
                  .map((g) => {
                    const maxAbsFc = Math.max(0.1, ...geneDetails.map((d) => Math.abs(d.log2FC)));
                    const barWidthPct = Math.min(100, (Math.abs(g.log2FC) / maxAbsFc) * 100);
                    const isPos = g.log2FC >= 0;

                    return (
                      <div key={`overlay-${g.symbol}`} className="flex items-center gap-3 text-xs">
                        <span className="w-20 text-slate-300 font-bold truncate text-right">{g.symbol}</span>
                        <div className="flex-1 bg-slate-900 h-5 rounded relative overflow-hidden flex items-center px-2">
                          <div
                            className={`h-full absolute top-0 rounded ${isPos ? "left-1/2 bg-red-500/40 border-l border-red-500" : "right-1/2 bg-blue-500/40 border-r border-blue-500"}`}
                            style={{ width: `${barWidthPct / 2}%` }}
                          />
                          <span className="relative z-10 text-[10px] text-slate-200 ml-auto font-bold">
                            {g.log2FC > 0 ? "+" : ""}{g.log2FC.toFixed(3)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/50 flex justify-between items-center text-xxs text-slate-500 font-mono">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-teal-400" />
            <span>Methodology: {pathway.analysisMode} with Benjamini-Hochberg Multiple-Testing Correction</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
