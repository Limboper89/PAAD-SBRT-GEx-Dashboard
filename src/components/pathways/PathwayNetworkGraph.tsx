"use client";

import React, { useState } from "react";
import { PathwayEnrichmentResult } from "@/types/pathway";
import { Share2, Info } from "lucide-react";

interface PathwayNetworkGraphProps {
  results: PathwayEnrichmentResult[];
  onSelectPathway: (pathway: PathwayEnrichmentResult) => void;
}

export default function PathwayNetworkGraph({ results, onSelectPathway }: PathwayNetworkGraphProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  if (!results || results.length === 0) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 text-center text-slate-500 font-mono text-xs">
        No pathways available to construct leading-edge network.
      </div>
    );
  }

  // Top 12 pathways for clear node graph rendering
  const topPathways = [...results]
    .sort((a, b) => a.adjPValue - b.adjPValue)
    .slice(0, 12);

  // Compute shared leading-edge edges
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

  const nodePositions = new Map<string, { x: number; y: number }>();
  topPathways.forEach((p, idx) => {
    const angle = (idx / numNodes) * 2 * Math.PI - Math.PI / 2;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    nodePositions.set(p.pathwayId, { x, y });
  });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col gap-4 shadow-xl font-sans text-slate-100">
      <div className="flex justify-between items-center border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Share2 className="w-4 h-4 text-teal-400" />
            <span>Leading-Edge Pathway Network</span>
          </h3>
          <p className="text-xxs text-slate-400 font-mono mt-0.5">
            Nodes: Top Pathways &bull; Edges: Shared Leading-Edge Genes &bull; Click node to inspect
          </p>
        </div>
        <span className="text-xxs font-mono bg-slate-950 text-teal-300 border border-slate-800 px-2.5 py-1 rounded">
          {topPathways.length} Nodes &bull; {edges.length} Inter-Pathway Edges
        </span>
      </div>

      <div className="w-full h-[480px] min-h-[480px] bg-slate-950 border border-slate-850 rounded-xl relative flex items-center justify-center overflow-hidden">
        <svg className="w-full h-full" viewBox="0 0 640 480">
          {/* Render Edges */}
          {edges.map((edge, idx) => {
            const pos1 = nodePositions.get(edge.sourceId);
            const pos2 = nodePositions.get(edge.targetId);
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
            const pos = nodePositions.get(p.pathwayId);
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
