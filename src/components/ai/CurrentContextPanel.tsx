// CurrentContextPanel.tsx - Visible Context Inspector inside PDACopilot Chat UI

"use client";

import React, { useState } from "react";
import { useAIContext } from "./AIProvider";
import { Activity, Layers, Database, Filter, ChevronDown, ChevronUp, Tag } from "lucide-react";

export function CurrentContextPanel() {
  const { activeContext } = useAIContext();
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  return (
    <div className="bg-slate-900/90 border-b border-slate-800 text-xs backdrop-blur-md transition-all duration-200">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 flex items-center justify-between text-slate-300 hover:text-white font-medium hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
          </span>
          <span className="font-semibold tracking-wide text-cyan-400 uppercase text-[10px]">
            Live Context Inspector
          </span>
          <span className="text-slate-500 font-mono text-[10px]">
            ({activeContext.module} • {activeContext.gene || "No Gene"})
          </span>
        </div>
        <div className="flex items-center gap-1 text-slate-400">
          <span className="text-[10px] text-slate-400">{isExpanded ? "Collapse" : "Expand"}</span>
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>

      {isExpanded && (
        <div className="px-3 pb-2.5 pt-1 grid grid-cols-2 gap-2 text-[11px] border-t border-slate-800/60 bg-slate-950/40">
          <div className="flex items-center gap-1.5 overflow-hidden text-slate-300">
            <Layers className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="text-slate-400 shrink-0">Module:</span>
            <span className="font-semibold text-indigo-300 truncate">{activeContext.module}</span>
          </div>

          <div className="flex items-center gap-1.5 overflow-hidden text-slate-300">
            <Tag className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="text-slate-400 shrink-0">Gene:</span>
            <span className="font-bold text-cyan-300 font-mono bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/40 shrink-0">
              {activeContext.gene || "None"}
            </span>
          </div>

          <div className="flex items-center gap-1.5 overflow-hidden text-slate-300 col-span-2">
            <Database className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-slate-400 shrink-0">Dataset:</span>
            <span className="font-medium text-emerald-300 truncate">{activeContext.dataset}</span>
          </div>

          <div className="flex items-center gap-1.5 overflow-hidden text-slate-300">
            <Activity className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-slate-400 shrink-0">Figure:</span>
            <span className="font-medium text-amber-300 truncate">{activeContext.currentFigure}</span>
          </div>

          <div className="flex items-center gap-1.5 overflow-hidden text-slate-300">
            <Filter className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span className="text-slate-400 shrink-0">Filters:</span>
            <span className="font-mono text-slate-200 truncate">
              log₂FC ≥ {activeContext.filters.log2fcThreshold ?? 1.0}, p &lt; {activeContext.filters.pValueThreshold ?? 0.05}
            </span>
          </div>

          <div className="col-span-2 flex items-center gap-1.5 text-slate-400 text-[10px] pt-1 border-t border-slate-900/60">
            <span className="text-slate-500">Heatmap Panel:</span>
            <span className="text-slate-300 font-mono truncate">
              {activeContext.heatmapGenes.slice(0, 5).join(", ")}
              {activeContext.heatmapGenes.length > 5 ? ` (+${activeContext.heatmapGenes.length - 5} more)` : ""}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
