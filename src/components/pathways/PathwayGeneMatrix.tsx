"use client";

import React from "react";
import { PathwayEnrichmentResult } from "@/types/pathway";
import { Layers, Sparkles } from "lucide-react";

interface PathwayGeneMatrixProps {
  results: PathwayEnrichmentResult[];
  onSelectPathway: (pathway: PathwayEnrichmentResult) => void;
  onSelectGene?: (gene: string) => void;
}

export default function PathwayGeneMatrix({
  results,
  onSelectPathway,
  onSelectGene
}: PathwayGeneMatrixProps) {
  if (!results || results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[350px] bg-slate-900/40 border border-slate-800 rounded-2xl p-6 text-center text-slate-500 font-mono text-xs">
        <p>No enriched pathways available for matrix visualization.</p>
      </div>
    );
  }

  // Top 10 pathways
  const topPathways = [...results]
    .sort((a, b) => a.adjPValue - b.adjPValue)
    .slice(0, 10);

  // Frequency map for leading-edge genes (or contributing genes if leading edge empty)
  const geneFreqMap = new Map<string, number>();
  topPathways.forEach((p) => {
    const list = (p.leadingEdgeGenes && p.leadingEdgeGenes.length > 0) ? p.leadingEdgeGenes : p.contributingGenes;
    list.forEach((g) => {
      geneFreqMap.set(g, (geneFreqMap.get(g) || 0) + 1);
    });
  });

  const topGenes = Array.from(geneFreqMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map((e) => e[0]);

  // Master regulators present in >= 2 pathways
  const sharedMasterRegulators = Array.from(geneFreqMap.entries())
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col gap-6 shadow-xl font-sans text-slate-100">
      <div className="flex justify-between items-center border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Layers className="w-4 h-4 text-teal-400" />
            <span>Leading-Edge Gene Matrix</span>
          </h3>
          <p className="text-xxs text-slate-400 font-mono mt-0.5">
            Top {topPathways.length} Enriched Pathways &bull; Top {topGenes.length} Leading-Edge Core Genes
          </p>
        </div>
      </div>

      <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950 p-4 font-mono">
        <table className="w-full text-left text-xxs">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400">
              <th className="p-2.5 min-w-[220px]">Pathway Name</th>
              {topGenes.map((gene) => (
                <th
                  key={`col-${gene}`}
                  className="p-2 text-center cursor-pointer hover:text-teal-400 transition"
                  onClick={() => onSelectGene && onSelectGene(gene)}
                  title={`Inspect ${gene}`}
                >
                  {gene}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-850">
            {topPathways.map((p) => {
              const leadingSet = new Set(p.leadingEdgeGenes && p.leadingEdgeGenes.length > 0 ? p.leadingEdgeGenes : p.contributingGenes);
              return (
                <tr key={`matrix-row-${p.pathwayId}`} className="hover:bg-slate-900/60 transition">
                  <td
                    className="p-2.5 font-semibold text-slate-200 cursor-pointer hover:text-teal-400 truncate max-w-xs"
                    onClick={() => onSelectPathway(p)}
                    title={p.pathwayName}
                  >
                    {p.pathwayName}
                  </td>
                  {topGenes.map((gene) => {
                    const isPresent = leadingSet.has(gene);
                    const geneDetail = p.geneExpressionDetails?.find((d) => d.symbol === gene);
                    let bg = "bg-slate-900/40 text-slate-700";
                    if (isPresent) {
                      if (geneDetail) {
                        bg = geneDetail.log2FC >= 0
                          ? "bg-rose-500/30 text-rose-300 font-bold border border-rose-500/50"
                          : "bg-sky-500/30 text-sky-300 font-bold border border-sky-500/50";
                      } else {
                        bg = "bg-teal-500/30 text-teal-300 font-bold border border-teal-500/50";
                      }
                    }

                    return (
                      <td key={`cell-${p.pathwayId}-${gene}`} className="p-1 text-center">
                        <div className={`w-6 h-6 rounded flex items-center justify-center mx-auto text-[10px] ${bg}`}>
                          {isPresent ? "●" : ""}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Shared Leading-Edge Master Regulators Section */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col gap-3 font-mono">
        <div className="flex items-center justify-between border-b border-slate-850 pb-2">
          <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Shared Leading-Edge Master Regulators ({sharedMasterRegulators.length})</span>
          </span>
          <span className="text-xxs text-slate-500">Genes driving enrichment across multiple pathways</span>
        </div>

        {sharedMasterRegulators.length === 0 ? (
          <p className="text-xxs text-slate-500">No single leading-edge gene is shared across 2 or more top pathways.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {sharedMasterRegulators.map(([gene, count]) => (
              <div
                key={`shared-${gene}`}
                className="bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-lg text-xxs font-bold text-amber-300 flex items-center gap-2"
              >
                <span>{gene}</span>
                <span className="bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded text-[10px]">
                  {count} Pathways
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
