"use client";

import React, { useState, useMemo } from "react";
import { PathwayEnrichmentResult } from "@/types/pathway";
import { getContrastDisplayInfo } from "@/utils/pathwayEngine";
import { Share2, Info } from "lucide-react";
import ExportButton from "@/components/ExportButton";
import { exportCanvasToPNG, exportCanvasToSVG, exportToCSV, PUB_FONT_SANS, PUB_FONT_NUM, drawFittedText } from "@/utils/exportUtils";

interface PathwayNetworkGraphProps {
  results: PathwayEnrichmentResult[];
  onSelectPathway: (pathway: PathwayEnrichmentResult) => void;
  analysisMode?: "ORA" | "GSEA";
  datasetName?: string;
  comparisonLabel?: string;
}

export default function PathwayNetworkGraph({
  results,
  onSelectPathway,
  analysisMode,
  datasetName,
  comparisonLabel
}: PathwayNetworkGraphProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const contrast = useMemo(() => {
    return getContrastDisplayInfo(
      comparisonLabel || results[0]?.comparisonLabel,
      datasetName || results[0]?.datasetName,
      results[0]?.datasetId
    );
  }, [comparisonLabel, datasetName, results]);

  if (!results || results.length === 0) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 text-center text-slate-500 font-mono text-xs">
        No pathways available to construct network.
      </div>
    );
  }

  const isGsea = analysisMode === "GSEA" || results[0]?.analysisMode === "GSEA";

  // Top 12 pathways for clear node graph rendering
  const topPathways = [...results]
    .sort((a, b) => a.adjPValue - b.adjPValue)
    .slice(0, 12);

  // Compute shared leading-edge / overlap edges
  interface Edge {
    sourceId: string;
    targetId: string;
    sharedGenes: string[];
  }

  const edges: Edge[] = [];
  for (let i = 0; i < topPathways.length; i++) {
    for (let j = i + 1; j < topPathways.length; j++) {
      const p1 = topPathways[i];
      const p2 = topPathways[j];
      const set1 = new Set(p1.leadingEdgeGenes || p1.contributingGenes || []);
      const set2 = p2.leadingEdgeGenes || p2.contributingGenes || [];
      const shared = set2.filter((g) => set1.has(g));

      if (shared.length > 0) {
        edges.push({
          sourceId: p1.pathwayId,
          targetId: p2.pathwayId,
          sharedGenes: shared
        });
      }
    }
  }

  // Arrange nodes in a circular layout
  const numNodes = topPathways.length;
  const radius = 170;
  const centerX = 320;
  const centerY = 240;

  const nodePositions = topPathways.map((p, idx) => {
    const angle = (idx / numNodes) * 2 * Math.PI - Math.PI / 2;
    return {
      pathway: p,
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  });

  const nodeMap = new Map(nodePositions.map((n) => [n.pathway.pathwayId, n]));

  const generateHighResNetworkCanvas = (theme: "light" | "dark" = "light", size: number = 2400): HTMLCanvasElement => {
    const offscreen = document.createElement("canvas");
    offscreen.width = size;
    offscreen.height = size;
    const ctx = offscreen.getContext("2d");
    if (!ctx) return offscreen;

    const isLight = theme === "light";

    // Background
    ctx.fillStyle = isLight ? "#ffffff" : "#020617";
    ctx.fillRect(0, 0, size, size);

    // Title (publication-scaled)
    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.textAlign = "left";
    drawFittedText(ctx, contrast.shortTitle, 80, 92, size - 160, 74, "bold", PUB_FONT_SANS);

    ctx.fillStyle = isLight ? "#334155" : "#94a3b8";
    drawFittedText(
      ctx,
      `Cohort: ${contrast.datasetName} (${contrast.fullContrast}) · ${isGsea ? "Crosstalk Network" : "Overlap Network"} · Top ${topPathways.length} Pathways`,
      80,
      150,
      size - 160,
      38,
      "bold",
      PUB_FONT_NUM
    );

    const cX = size / 2;
    const cY = size / 2 + 20;
    const r = size * 0.27;

    const posList = topPathways.map((p, idx) => {
      const angle = (idx / numNodes) * 2 * Math.PI - Math.PI / 2;
      return {
        pathway: p,
        x: cX + r * Math.cos(angle),
        y: cY + r * Math.sin(angle),
        angle
      };
    });

    const highResNodeMap = new Map(posList.map((n) => [n.pathway.pathwayId, n]));

    // 1. Draw Edges
    edges.forEach((edge) => {
      const p1 = highResNodeMap.get(edge.sourceId);
      const p2 = highResNodeMap.get(edge.targetId);
      if (!p1 || !p2) return;

      const w = Math.min(20, Math.max(4, edge.sharedGenes.length * 2.2));
      ctx.strokeStyle = isLight ? "rgba(99, 102, 241, 0.45)" : "rgba(129, 140, 248, 0.45)";
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    });

    // 2. Draw Nodes
    posList.forEach((pos) => {
      const p = pos.pathway;
      const isUp = p.direction === "Upregulated" || (p.nes !== undefined && p.nes >= 0);

      // Outer circle
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 36, 0, 2 * Math.PI);
      ctx.fillStyle = isUp ? "rgba(220, 38, 38, 0.9)" : "rgba(37, 99, 235, 0.9)";
      ctx.fill();

      ctx.strokeStyle = isUp ? "#991b1b" : "#1e40af";
      ctx.lineWidth = 4.5;
      ctx.stroke();

      // Label text (bounded to stay inside canvas edges)
      ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";

      const cosA = Math.cos(pos.angle);
      const sinA = Math.sin(pos.angle);

      let labelX = pos.x;
      let labelY = pos.y;
      let availW = 540;

      if (Math.abs(cosA) > 0.3) {
        ctx.textAlign = cosA > 0 ? "left" : "right";
        labelX += cosA > 0 ? 50 : -50;
        labelY += 12;
        availW = cosA > 0 ? Math.max(240, size - labelX - 40) : Math.max(240, labelX - 40);
      } else {
        ctx.textAlign = "center";
        labelY += sinA > 0 ? 74 : -54;
        availW = 860;
      }

      const maxLen = 30;
      const displayLabel = p.pathwayName.length > maxLen ? p.pathwayName.slice(0, maxLen - 3) + "..." : p.pathwayName;
      drawFittedText(ctx, displayLabel, labelX, labelY, availW, 40, "bold", PUB_FONT_SANS, 28);
    });

    // 3. Full-Width Legend Box at Bottom
    const legBoxX = 80;
    const legBoxW = size - 160;
    const legBoxY = size - 135;
    const legBoxH = 92;
    const legY = legBoxY + 46;

    ctx.fillStyle = isLight ? "#f8fafc" : "#0b1329";
    ctx.strokeStyle = isLight ? "#cbd5e1" : "#1e293b";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(legBoxX, legBoxY, legBoxW, legBoxH, 14);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = "left";

    if (isGsea) {
      // Red dot
      ctx.beginPath();
      ctx.arc(legBoxX + 52, legY, 18, 0, 2 * Math.PI);
      ctx.fillStyle = "rgba(220, 38, 38, 0.9)";
      ctx.fill();
      ctx.strokeStyle = "#991b1b";
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
      drawFittedText(ctx, `Positive Z_GSEA: ${contrast.posShort}`, legBoxX + 86, legY + 12, 660, 34, "bold", PUB_FONT_SANS, 26);

      // Blue dot
      const midX = legBoxX + 780;
      ctx.beginPath();
      ctx.arc(midX, legY, 18, 0, 2 * Math.PI);
      ctx.fillStyle = "rgba(37, 99, 235, 0.9)";
      ctx.fill();
      ctx.strokeStyle = "#1e40af";
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
      drawFittedText(ctx, `Negative Z_GSEA: ${contrast.negShort}`, midX + 34, legY + 12, 660, 34, "bold", PUB_FONT_SANS, 26);

      // Edge thickness text
      ctx.fillStyle = isLight ? "#334155" : "#cbd5e1";
      ctx.textAlign = "right";
      drawFittedText(ctx, "Edge Width ∝ Shared Leading-Edge Genes", legBoxX + legBoxW - 42, legY + 12, 700, 32, "bold", PUB_FONT_NUM, 24);
    } else {
      ctx.fillStyle = isLight ? "#334155" : "#cbd5e1";
      ctx.textAlign = "center";
      ctx.font = `bold 34px ${PUB_FONT_NUM}`;
      ctx.fillText("Edge Width ∝ Shared Overlapping DEGs", size / 2, legY + 12);
    }

    return offscreen;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col gap-4 shadow-xl font-sans text-slate-100">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Share2 className="w-4 h-4 text-teal-400" />
              <span>{isGsea ? "Leading-Edge Pathway Network" : "Pathway Overlap Network"}</span>
            </h3>
            <span className={`text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full border ${contrast.badgeColor}`}>
              Contrast: {contrast.shortTitle}
            </span>
          </div>
          <p className="text-xxs text-slate-400 font-mono mt-0.5">
            Cohort: <span className="text-slate-200">{contrast.datasetName}</span> &bull; Nodes: Top Pathways &bull; Edges: {isGsea ? "Shared Leading-Edge Genes" : "Shared Overlapping DEGs"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xxs font-mono bg-slate-950 text-teal-300 border border-slate-800 px-2.5 py-1 rounded">
            {topPathways.length} Nodes &bull; {edges.length} Inter-Pathway Edges
          </span>
          <ExportButton
            onExportCSV={() => {
              exportToCSV({
                filename: `Pathway_${isGsea ? "LeadingEdge" : "Overlap"}_Network_Edges_${contrast.slug}.csv`,
                metadata: {
                  module: isGsea ? "Pathway Leading Edge Network Graph" : "Pathway Overlap Network Graph",
                  mode: isGsea ? "GSEA" : "ORA",
                  contrast: contrast.shortTitle,
                  dataset: contrast.datasetName,
                  totalNodes: String(topPathways.length),
                  totalEdges: String(edges.length),
                },
                headers: ["Source Pathway ID", "Target Pathway ID", "Shared Gene Count", "Shared Gene Symbols"],
                rows: edges.map((e) => [e.sourceId, e.targetId, e.sharedGenes.length, e.sharedGenes.join("; ")]),
              });
            }}
            onExportPNG={({ theme = "light" } = {}) => {
              const exportCanvas = generateHighResNetworkCanvas(theme, 2400);
              exportCanvasToPNG({
                canvas: exportCanvas,
                filename: `Pathway_${isGsea ? "LeadingEdge" : "Overlap"}_Network_${contrast.slug}.png`,
                theme,
              });
            }}
            onExportSVG={({ theme = "light" } = {}) => {
              const exportCanvas = generateHighResNetworkCanvas(theme, 1200);
              exportCanvasToSVG({
                canvas: exportCanvas,
                filename: `Pathway_${isGsea ? "LeadingEdge" : "Overlap"}_Network_${contrast.slug}.svg`,
                theme,
              });
            }}
          />
        </div>
      </div>

      <div className="w-full h-[480px] min-h-[480px] bg-slate-950 border border-slate-850 rounded-xl relative flex items-center justify-center overflow-hidden">
        <svg className="w-full h-full" viewBox="0 0 640 480">
          {/* Render Edges */}
          {edges.map((edge, idx) => {
            const pos1 = nodeMap.get(edge.sourceId);
            const pos2 = nodeMap.get(edge.targetId);
            if (!pos1 || !pos2) return null;

            const isSelected = selectedNodeId === edge.sourceId || selectedNodeId === edge.targetId;
            const strokeWidth = Math.min(6, Math.max(1, edge.sharedGenes.length * 0.8));

            return (
              <g key={`edge-${idx}`}>
                <line
                  x1={pos1.x}
                  y1={pos1.y}
                  x2={pos2.x}
                  y2={pos2.y}
                  stroke={isSelected ? "#2dd4bf" : "#334155"}
                  strokeWidth={strokeWidth}
                  strokeOpacity={isSelected ? 0.9 : 0.4}
                />
              </g>
            );
          })}

          {/* Render Nodes */}
          {topPathways.map((p) => {
            const pos = nodeMap.get(p.pathwayId);
            if (!pos) return null;

            const isSelected = selectedNodeId === p.pathwayId;
            const isUp = p.direction === "Upregulated" || (p.nes !== undefined && p.nes >= 0);
            const fillColor = isUp ? "#ef4444" : "#3b82f6";
            
            const logFdr = p.adjPValue > 0 ? -Math.log10(p.adjPValue) : 1;
            const nodeRadius = Math.max(12, Math.min(26, 12 + logFdr * 2.5));

            const shortLabel = p.pathwayName.length > 22 ? p.pathwayName.slice(0, 20) + "..." : p.pathwayName;

            return (
              <g
                key={`node-${p.pathwayId}`}
                className="cursor-pointer transition hover:opacity-90"
                onClick={() => {
                  setSelectedNodeId(p.pathwayId);
                  onSelectPathway(p);
                }}
              >
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={nodeRadius}
                  fill={fillColor}
                  fillOpacity={isSelected ? 0.95 : 0.75}
                  stroke={isSelected ? "#2dd4bf" : "#0f172a"}
                  strokeWidth={isSelected ? 3 : 1.5}
                />
                <text
                  x={pos.x}
                  y={pos.y > centerY ? pos.y + nodeRadius + 14 : pos.y - nodeRadius - 6}
                  textAnchor="middle"
                  fill={isSelected ? "#2dd4bf" : "#cbd5e1"}
                  fontSize={10}
                  fontWeight={isSelected ? "bold" : "normal"}
                  fontFamily="monospace"
                >
                  {shortLabel}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Legend Overlay */}
        <div className="absolute bottom-3 left-3 bg-slate-950/90 border border-slate-800 p-2.5 rounded-lg text-xxs font-mono text-slate-400 space-y-1 backdrop-blur shadow-lg">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
            <span>Upregulated NES</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-500 inline-block" />
            <span>Downregulated NES</span>
          </div>
          <div className="text-slate-500 text-[10px] border-t border-slate-850 pt-1 mt-1">
            Edge thickness = Shared leading-edge gene count
          </div>
        </div>
      </div>
    </div>
  );
}
