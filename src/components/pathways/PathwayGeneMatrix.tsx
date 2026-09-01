"use client";

import React, { useRef } from "react";
import { PathwayEnrichmentResult } from "@/types/pathway";
import { Layers, Sparkles } from "lucide-react";
import ExportButton from "@/components/ExportButton";
import { exportCanvasToPNG, exportCanvasToSVG, exportToCSV } from "@/utils/exportUtils";

interface PathwayGeneMatrixProps {
  results: PathwayEnrichmentResult[];
  onSelectPathway: (pathway: PathwayEnrichmentResult) => void;
  onSelectGene?: (gene: string) => void;
  analysisMode?: "ORA" | "GSEA";
}

export default function PathwayGeneMatrix({
  results,
  onSelectPathway,
  onSelectGene,
  analysisMode
}: PathwayGeneMatrixProps) {
  const matrixRef = useRef<HTMLDivElement>(null);

  if (!results || results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[350px] bg-slate-900/40 border border-slate-800 rounded-2xl p-6 text-center text-slate-500 font-mono text-xs">
        <p>No enriched pathways available for matrix visualization.</p>
      </div>
    );
  }

  const isGsea = analysisMode === "GSEA" || results[0]?.analysisMode === "GSEA";

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

  const generateHighResMatrixCanvas = (theme: "light" | "dark" = "light", size: number = 2400): HTMLCanvasElement => {
    const offscreen = document.createElement("canvas");
    offscreen.width = size;
    offscreen.height = size;
    const ctx = offscreen.getContext("2d");
    if (!ctx) return offscreen;

    const isLight = theme === "light";

    ctx.fillStyle = isLight ? "#ffffff" : "#020617";
    ctx.fillRect(0, 0, size, size);

    // Title
    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 54px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(isGsea ? "Leading-Edge Gene Overlap Matrix" : "Gene Overlap Matrix (ORA)", 80, 80);

    ctx.fillStyle = isLight ? "#334155" : "#94a3b8";
    ctx.font = "bold 30px monospace";
    ctx.fillText(
      `Top ${topPathways.length} Enriched Pathways × Top ${topGenes.length} ${isGsea ? "Leading-Edge Genes" : "Overlapping Genes"}`,
      80,
      130
    );

    const padLeft = 880;
    const padRight = 80;
    const padTop = 340;
    const padBottom = 100;

    const matrixW = size - padLeft - padRight;
    const matrixH = size - padTop - padBottom;

    const cellW = matrixW / Math.max(1, topGenes.length);
    const rowH = matrixH / Math.max(1, topPathways.length);

    // Draw Column Headers (Gene Symbols rotated 60 deg)
    topGenes.forEach((gene, cIdx) => {
      const x = padLeft + cIdx * cellW + cellW / 2;
      ctx.save();
      ctx.translate(x, padTop - 24);
      ctx.rotate(-Math.PI / 3);
      ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
      ctx.font = "bold 32px monospace";
      ctx.textAlign = "left";
      ctx.fillText(gene, 0, 0);
      ctx.restore();
    });

    // Draw Rows and Cells
    topPathways.forEach((p, rIdx) => {
      const y = padTop + rIdx * rowH;
      const leadingSet = new Set(p.leadingEdgeGenes && p.leadingEdgeGenes.length > 0 ? p.leadingEdgeGenes : p.contributingGenes);

      // Pathway name
      ctx.fillStyle = isLight ? "#0f172a" : "#f1f5f9";
      const fontSize = Math.min(38, Math.max(22, Math.round(rowH * 0.52)));
      ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
      ctx.textAlign = "right";

      const maxLen = 42;
      const displayName = p.pathwayName.length > maxLen ? p.pathwayName.slice(0, maxLen - 3) + "..." : p.pathwayName;
      ctx.fillText(displayName, padLeft - 26, y + rowH * 0.68);

      // Cells
      topGenes.forEach((gene, cIdx) => {
        const x = padLeft + cIdx * cellW;
        const isPresent = leadingSet.has(gene);
        const geneDetail = p.geneExpressionDetails?.find((d) => d.symbol === gene);

        if (isPresent) {
          const isUp = geneDetail ? geneDetail.log2FC >= 0 : true;
          ctx.fillStyle = isUp ? "rgba(220, 38, 38, 0.85)" : "rgba(37, 99, 235, 0.85)";
          ctx.fillRect(x + 2, y + 2, cellW - 4, rowH - 4);

          ctx.strokeStyle = isUp ? "#991b1b" : "#1e40af";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 2, y + 2, cellW - 4, rowH - 4);

          // Checkmark / Dot inside
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(x + cellW / 2, y + rowH / 2, Math.min(10, cellW * 0.25), 0, 2 * Math.PI);
          ctx.fill();
        } else {
          ctx.fillStyle = isLight ? "#f8fafc" : "#0f172a";
          ctx.fillRect(x + 1, y + 1, cellW - 2, rowH - 2);

          ctx.strokeStyle = isLight ? "#e2e8f0" : "#1e293b";
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 1, y + 1, cellW - 2, rowH - 2);
        }
      });
    });

    return offscreen;
  };

  return (
    <div ref={matrixRef} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col gap-6 shadow-xl font-sans text-slate-100">
      <div className="flex justify-between items-center border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Layers className="w-4 h-4 text-teal-400" />
            <span>{isGsea ? "Leading-Edge Gene Matrix" : "Gene Overlap Matrix"}</span>
          </h3>
          <p className="text-xxs text-slate-400 font-mono mt-0.5">
            Top {topPathways.length} Enriched Pathways &bull; Top {topGenes.length} {isGsea ? "Leading-Edge Core Genes" : "Overlapping DEGs"}
          </p>
        </div>

        <ExportButton
          onExportCSV={() => {
            exportToCSV({
              filename: isGsea ? "Pathway_LeadingEdge_Gene_Matrix.csv" : "Pathway_Gene_Overlap_Matrix.csv",
              metadata: {
                module: isGsea ? "Pathway Leading Edge Matrix" : "Pathway Gene Overlap Matrix",
                mode: isGsea ? "GSEA" : "ORA",
                topPathways: String(topPathways.length),
                topGenes: String(topGenes.length),
              },
              headers: ["Pathway Name", ...topGenes],
              rows: topPathways.map((p) => {
                const genes = (p.leadingEdgeGenes && p.leadingEdgeGenes.length > 0) ? p.leadingEdgeGenes : p.contributingGenes;
                return [p.pathwayName, ...topGenes.map((g) => (genes.includes(g) ? "1" : "0"))];
              }),
            });
          }}
          onExportPNG={({ theme = "light" } = {}) => {
            const exportCanvas = generateHighResMatrixCanvas(theme, 2400);
            exportCanvasToPNG({
              canvas: exportCanvas,
              filename: "Pathway_LeadingEdge_Gene_Matrix.png",
              theme,
            });
          }}
          onExportSVG={({ theme = "light" } = {}) => {
            const exportCanvas = generateHighResMatrixCanvas(theme, 1200);
            exportCanvasToSVG({
              canvas: exportCanvas,
              filename: "Pathway_LeadingEdge_Gene_Matrix.svg",
              theme,
            });
          }}
        />
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
