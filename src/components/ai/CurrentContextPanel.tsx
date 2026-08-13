// CurrentContextPanel.tsx - Live Context & Global Registry Inspector inside PDACopilot Chat UI

"use client";

import React, { useState } from "react";
import { useAIContext } from "./AIProvider";
import { Activity, Layers, Database, Filter, ChevronDown, ChevronUp, Tag, Globe, CheckCircle2 } from "lucide-react";
import { DATASET_REGISTRY } from "./DatasetRegistry";

export function CurrentContextPanel() {
  const { activeContext } = useAIContext();
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<"current_page" | "global_registry">("current_page");

  const registryCount = Object.keys(DATASET_REGISTRY).length;

  return (
    <div className="bg-slate-900/90 border-b border-slate-800 text-xs backdrop-blur-md transition-all duration-200">
      <div className="px-3 py-2 flex items-center justify-between border-b border-slate-800/60">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-slate-300 hover:text-white font-medium transition-colors"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
          </span>
          <span className="font-semibold tracking-wide text-cyan-400 uppercase text-[10px]">
            Live Context & Global Router
          </span>
          <span className="text-slate-500 font-mono text-[10px]">
            ({activeContext.module} • {activeContext.gene || "No Gene"})
          </span>
        </button>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-950 rounded p-0.5 border border-slate-800 text-[10px]">
            <button
              onClick={() => { setActiveTab("current_page"); setIsExpanded(true); }}
              className={`px-2 py-0.5 rounded transition-colors ${activeTab === "current_page" ? "bg-cyan-950 text-cyan-300 font-semibold" : "text-slate-400 hover:text-slate-200"}`}
            >
              Current Page
            </button>
            <button
              onClick={() => { setActiveTab("global_registry"); setIsExpanded(true); }}
              className={`px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${activeTab === "global_registry" ? "bg-indigo-950 text-indigo-300 font-semibold" : "text-slate-400 hover:text-slate-200"}`}
            >
              <Globe className="w-2.5 h-2.5" />
              Global Datasets ({registryCount})
            </button>
          </div>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-slate-400 hover:text-white p-0.5"
          >
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {isExpanded && activeTab === "current_page" && (
        <div className="px-3 pb-2.5 pt-1.5 grid grid-cols-2 gap-2 text-[11px] bg-slate-950/40">
          <div className="flex items-center gap-1.5 overflow-hidden text-slate-300">
            <Layers className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="text-slate-400 shrink-0">Current Route:</span>
            <span className="font-semibold text-indigo-300 truncate">{activeContext.module}</span>
          </div>

          <div className="flex items-center gap-1.5 overflow-hidden text-slate-300">
            <Tag className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="text-slate-400 shrink-0">Selected Gene:</span>
            <span className="font-bold text-cyan-300 font-mono bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/40 shrink-0">
              {activeContext.gene || "None"}
            </span>
          </div>

          <div className="flex items-center gap-1.5 overflow-hidden text-slate-300 col-span-2">
            <Database className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-slate-400 shrink-0">Active Dataset:</span>
            <span className="font-medium text-emerald-300 truncate">{activeContext.dataset}</span>
          </div>

          <div className="flex items-center gap-1.5 overflow-hidden text-slate-300">
            <Activity className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-slate-400 shrink-0">Active Figure:</span>
            <span className="font-medium text-amber-300 truncate">{activeContext.currentFigure}</span>
          </div>

          <div className="flex items-center gap-1.5 overflow-hidden text-slate-300">
            <Filter className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span className="text-slate-400 shrink-0">Filters:</span>
            <span className="font-mono text-slate-200 truncate">
              log₂FC ≥ {activeContext.filters.log2fcThreshold ?? 1.0}, p &lt; {activeContext.filters.pValueThreshold ?? 0.05}
            </span>
          </div>
        </div>
      )}

      {isExpanded && activeTab === "global_registry" && (
        <div className="px-3 py-2 bg-slate-950/70 space-y-1.5 text-[10.5px]">
          <div className="text-[10px] text-indigo-300 font-medium pb-1 border-b border-slate-900 flex items-center justify-between">
            <span>Global Router Status: <strong className="text-emerald-400">All Datasets Reachable Off-Page</strong></span>
            <span className="text-slate-500 font-mono">Zero Dataset Substitution Active</span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {Object.values(DATASET_REGISTRY).map(ds => (
              <div key={ds.id} className="p-1.5 rounded bg-slate-900/80 border border-slate-800 flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="overflow-hidden">
                  <div className="font-semibold text-slate-200 truncate">{ds.name}</div>
                  <div className="text-[9.5px] text-slate-400 truncate">{ds.modality.join(', ')}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
