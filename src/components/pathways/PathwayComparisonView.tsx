"use client";

import React, { useState } from "react";
import { Info, ArrowRightLeft } from "lucide-react";
import { PathwayEnrichmentResult } from "@/types/pathway";
import ExportButton from "@/components/ExportButton";
import { exportToCSV } from "@/utils/exportUtils";

interface PathwayComparisonViewProps {
  currentResults: PathwayEnrichmentResult[];
  tcgaResults: PathwayEnrichmentResult[];
  sbrtResults: PathwayEnrichmentResult[];
  onSelectPathway: (pathway: PathwayEnrichmentResult) => void;
}

export default function PathwayComparisonView({
  currentResults,
  tcgaResults,
  sbrtResults,
  onSelectPathway
}: PathwayComparisonViewProps) {
  const [compMode, setCompMode] = useState<"up_down" | "cross_cohort">("up_down");

  const upPathways = currentResults.filter((r) => r.direction === "Upregulated" || (r.nes && r.nes > 0));
  const downPathways = currentResults.filter((r) => r.direction === "Downregulated" || (r.nes && r.nes < 0));

  // Build map for cross-cohort comparison
  const tcgaMap = new Map<string, PathwayEnrichmentResult>();
  tcgaResults.forEach((r) => tcgaMap.set(r.pathwayId, r));

  const sbrtMap = new Map<string, PathwayEnrichmentResult>();
  sbrtResults.forEach((r) => sbrtMap.set(r.pathwayId, r));

  const allPathwayIds = Array.from(new Set([...tcgaMap.keys(), ...sbrtMap.keys()]));

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col gap-6 shadow-xl font-sans">
      {/* Selector bar */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-teal-400" />
            <span>Comparative Pathway Analysis</span>
          </h3>
          <p className="text-xxs text-slate-400 font-mono mt-0.5">
            Evaluate directional pathway divergence or cross-cohort observations
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex gap-2 font-mono text-xs bg-slate-950 p-1 rounded-xl border border-slate-850">
            <button
              onClick={() => setCompMode("up_down")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${compMode === "up_down" ? "bg-slate-900 text-teal-400 border border-slate-800 shadow" : "text-slate-400 hover:text-white"}`}
            >
              Up vs Down Pathways
            </button>
            <button
              onClick={() => setCompMode("cross_cohort")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${compMode === "cross_cohort" ? "bg-slate-900 text-teal-400 border border-slate-800 shadow" : "text-slate-400 hover:text-white"}`}
            >
              Cross-Study Observation
            </button>
          </div>

          <ExportButton
            onExportCSV={() => {
              if (compMode === "up_down") {
                exportToCSV({
                  filename: "Comparative_Pathway_UpDown.csv",
                  metadata: {
                    module: "Comparative Pathway Analysis",
                    mode: "Up vs Down",
                    upCount: String(upPathways.length),
                    downCount: String(downPathways.length),
                  },
                  headers: ["Direction", "Pathway ID", "Pathway Name", "Database", "NES / Metric", "BH FDR"],
                  rows: [
                    ...upPathways.map((p) => ["Upregulated", p.pathwayId, p.pathwayName, p.database, p.nes ?? p.foldEnrichment ?? "N/A", p.adjPValue.toExponential(4)]),
                    ...downPathways.map((p) => ["Downregulated", p.pathwayId, p.pathwayName, p.database, p.nes ?? p.foldEnrichment ?? "N/A", p.adjPValue.toExponential(4)]),
                  ],
                });
              } else {
                exportToCSV({
                  filename: "Comparative_Pathway_CrossCohort.csv",
                  metadata: {
                    module: "Comparative Pathway Analysis",
                    mode: "Cross Cohort (TCGA vs SBRT)",
                  },
                  headers: ["Pathway ID", "Pathway Name", "TCGA PAAD NES", "TCGA BH FDR", "SBRT GSE225767 NES", "SBRT BH FDR"],
                  rows: allPathwayIds.map((id) => {
                    const t = tcgaMap.get(id);
                    const s = sbrtMap.get(id);
                    return [
                      id,
                      t?.pathwayName || s?.pathwayName || id,
                      t?.nes?.toFixed(3) ?? "N/A",
                      t?.adjPValue ? t.adjPValue.toExponential(3) : "N/A",
                      s?.nes?.toFixed(3) ?? "N/A",
                      s?.adjPValue ? s.adjPValue.toExponential(3) : "N/A",
                    ];
                  }),
                });
              }
            }}
          />
        </div>
      </div>

      {/* Up vs Down Side-by-Side View */}
      {compMode === "up_down" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
          {/* Upregulated Column */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col gap-3 font-mono">
            <div className="flex items-center justify-between border-b border-slate-850 pb-2">
              <span className="text-xs font-bold text-red-400 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                Upregulated / Positive NES ({upPathways.length})
              </span>
            </div>
            <div className="space-y-2 overflow-y-auto max-h-[380px]">
              {upPathways.length === 0 ? (
                <p className="text-xxs text-slate-500 py-4 text-center">No upregulated pathways match filters.</p>
              ) : (
                upPathways.map((r) => (
                  <div
                    key={`up-${r.pathwayId}`}
                    onClick={() => onSelectPathway(r)}
                    className="p-3 bg-slate-900/60 hover:bg-slate-900 border border-slate-800 rounded-lg cursor-pointer transition flex justify-between items-center text-xs"
                  >
                    <div className="truncate max-w-[240px]">
                      <p className="font-bold text-slate-200 truncate">{r.pathwayName}</p>
                      <span className="text-xxs text-slate-500 font-sans">{r.database}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-red-400 font-bold text-xs block">
                        {r.nes ? `NES +${r.nes.toFixed(2)}` : `${r.foldEnrichment?.toFixed(1)}x`}
                      </span>
                      <span className="text-xxs text-slate-400">FDR {r.adjPValue.toExponential(1)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Downregulated Column */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col gap-3 font-mono">
            <div className="flex items-center justify-between border-b border-slate-850 pb-2">
              <span className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                Downregulated / Negative NES ({downPathways.length})
              </span>
            </div>
            <div className="space-y-2 overflow-y-auto max-h-[380px]">
              {downPathways.length === 0 ? (
                <p className="text-xxs text-slate-500 py-4 text-center">No downregulated pathways match filters.</p>
              ) : (
                downPathways.map((r) => (
                  <div
                    key={`down-${r.pathwayId}`}
                    onClick={() => onSelectPathway(r)}
                    className="p-3 bg-slate-900/60 hover:bg-slate-900 border border-slate-800 rounded-lg cursor-pointer transition flex justify-between items-center text-xs"
                  >
                    <div className="truncate max-w-[240px]">
                      <p className="font-bold text-slate-200 truncate">{r.pathwayName}</p>
                      <span className="text-xxs text-slate-500 font-sans">{r.database}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-blue-400 font-bold text-xs block">
                        {r.nes ? `NES ${r.nes.toFixed(2)}` : `${r.foldEnrichment?.toFixed(1)}x`}
                      </span>
                      <span className="text-xxs text-slate-400">FDR {r.adjPValue.toExponential(1)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cross-Cohort Observation View */}
      {compMode === "cross_cohort" && (
        <div className="flex flex-col gap-4 font-mono">
          {/* Scientific Disclaimer */}
          <div className="bg-amber-500/10 border border-amber-500/30 p-3.5 rounded-xl text-xxs text-amber-300 leading-relaxed flex gap-2.5">
            <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p>
              <strong>Cross-Study Pathway Observation Disclaimer:</strong> TCGA-PAAD vs GTEx (Tumor vs Normal) and GSE225767 (Post vs Pre Radiotherapy) represent independent studies with distinct patient cohorts and biological contrasts. Pathway metrics are displayed side-by-side for qualitative cross-study observation of shared program enrichment, NOT as unified statistical measurements.
            </p>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto max-h-[380px]">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 text-xxs uppercase tracking-wider sticky top-0">
                  <tr>
                    <th className="p-3">Pathway Name</th>
                    <th className="p-3">Database</th>
                    <th className="p-3 text-center">TCGA-PAAD vs GTEx (Tumor vs Normal)</th>
                    <th className="p-3 text-center">GSE225767 (Post vs Pre Radiotherapy)</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850 text-slate-300">
                  {allPathwayIds.map((id) => {
                    const tcgaItem = tcgaMap.get(id);
                    const sbrtItem = sbrtMap.get(id);
                    const name = tcgaItem ? tcgaItem.pathwayName : sbrtItem ? sbrtItem.pathwayName : id;
                    const db = tcgaItem ? tcgaItem.database : sbrtItem ? sbrtItem.database : "Hallmark";

                    return (
                      <tr key={`cross-${id}`} className="hover:bg-slate-900/60 transition">
                        <td className="p-3 font-semibold text-slate-100 max-w-xs truncate" title={name}>
                          {name}
                        </td>
                        <td className="p-3 text-slate-400 text-xxs">{db}</td>
                        <td className="p-3 text-center">
                          {tcgaItem ? (
                            <span className={`text-xxs font-bold px-2 py-1 rounded ${tcgaItem.direction === "Upregulated" ? "bg-red-500/10 text-red-400 border border-red-500/30" : "bg-blue-500/10 text-blue-400 border border-blue-500/30"}`}>
                              {tcgaItem.direction} (FDR {tcgaItem.adjPValue.toExponential(1)})
                            </span>
                          ) : (
                            <span className="text-slate-600 text-xxs">Not Enriched</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {sbrtItem ? (
                            <span className={`text-xxs font-bold px-2 py-1 rounded ${sbrtItem.direction === "Upregulated" ? "bg-red-500/10 text-red-400 border border-red-500/30" : "bg-blue-500/10 text-blue-400 border border-blue-500/30"}`}>
                              {sbrtItem.direction} (FDR {sbrtItem.adjPValue.toExponential(1)})
                            </span>
                          ) : (
                            <span className="text-slate-600 text-xxs">Not Enriched</span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => onSelectPathway(tcgaItem || sbrtItem!)}
                            className="text-xxs text-teal-400 font-semibold hover:underline"
                          >
                            Inspect &rarr;
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
