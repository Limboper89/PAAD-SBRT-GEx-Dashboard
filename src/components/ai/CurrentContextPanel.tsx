// CurrentContextPanel.tsx - Visual Context & Provenance Indicator Panel for PDACopilot

"use client";

import React, { useState } from "react";
import { useAIContext } from "./AIProvider";
import { 
  Layers, 
  Dna, 
  Database, 
  Activity, 
  Filter, 
  ChevronDown, 
  ChevronUp, 
  CheckCircle2, 
  Sparkles,
  Info
} from "lucide-react";
import { DATASET_REGISTRY } from "./DatasetRegistry";

export function CurrentContextPanel() {
  const { activeContext, currentProviderName } = useAIContext();
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"mounted_page" | "global_registry">("mounted_page");

  const geneName = activeContext.gene || "None selected";

  return (
    <div className="border-b border-slate-800/80 bg-slate-950/80 text-xs">
      <div className="px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-indigo-950/60 border border-indigo-800/60 text-indigo-300 font-semibold text-[11px] shrink-0">
            <Layers className="w-3 h-3 text-indigo-400" />
            <span>{activeContext.module}</span>
          </div>

          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-800/60 text-cyan-300 font-semibold text-[11px] shrink-0">
            <Dna className="w-3 h-3 text-cyan-400" />
            <span>{geneName}</span>
          </div>

          <span className="text-[10px] text-slate-500 hidden sm:inline truncate">
            (Visual hint only — Router queries all portal datasets off-page)
          </span>
        </div>

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-slate-400 hover:text-slate-200 transition-colors p-1 rounded hover:bg-slate-900 flex items-center gap-1 text-[11px] shrink-0"
        >
          <span className="text-[10px] text-cyan-400 uppercase tracking-wider font-semibold">Context Info</span>
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {isExpanded && (
        <div className="border-t border-slate-900 bg-slate-950/90 p-2.5 space-y-2">
          <div className="flex items-center justify-between text-[11px] border-b border-slate-900 pb-1.5">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab("mounted_page")}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                  activeTab === "mounted_page"
                    ? "bg-cyan-950 text-cyan-300 border border-cyan-800"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Active Mounted Page
              </button>
              <button
                onClick={() => setActiveTab("global_registry")}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                  activeTab === "global_registry"
                    ? "bg-indigo-950 text-indigo-300 border border-indigo-800"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Global Dataset Registry (4)
              </button>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">Provider: {currentProviderName}</span>
          </div>

          {activeTab === "mounted_page" && (
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="flex items-center gap-1.5 overflow-hidden text-slate-300">
                <Database className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="text-slate-400 shrink-0">Dataset:</span>
                <span className="font-medium text-slate-200 truncate">{activeContext.dataset}</span>
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
                  log₂FC ≥ {activeContext.filters?.log2fcThreshold ?? 1.0}, p &lt; {activeContext.filters?.pValueThreshold ?? 0.05}
                </span>
              </div>
            </div>
          )}

          {activeTab === "global_registry" && (
            <div className="space-y-1.5 text-[10.5px]">
              <div className="text-[10px] text-indigo-300 font-medium pb-1 border-b border-slate-900 flex items-center justify-between">
                <span>Global Router Status: <strong className="text-emerald-400">All Datasets Reachable Off-Page</strong></span>
                <span className="text-slate-500 font-mono">Zero Dataset Substitution Active</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.values(DATASET_REGISTRY).map(d => (
                  <div key={d.id} className="p-1.5 rounded bg-slate-900/60 border border-slate-800 text-slate-300 flex items-start gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-cyan-300 text-[10px]">{d.name}</div>
                      <div className="text-[9.5px] text-slate-400 leading-tight">{d.biologicalQuestions[0]}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
