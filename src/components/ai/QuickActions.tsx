// QuickActions.tsx - Scientific Quick Prompt Triggers Grid for PDACopilot

"use client";

import React, { useState } from "react";
import { useAIContext } from "./AIProvider";
import { 
  Sparkles, 
  FileText, 
  Download, 
  Layers, 
  Activity, 
  MapPin, 
  Microscope, 
  BookOpen, 
  Presentation,
  ChevronDown,
  ChevronUp,
  Dna
} from "lucide-react";

export function QuickActions() {
  const { sendMessage, downloadSummary, activeContext } = useAIContext();
  const [isOpen, setIsOpen] = useState<boolean>(true);

  const geneName = activeContext.gene || "selected gene";

  const actions = [
    {
      label: `Explain ${geneName}`,
      icon: Dna,
      color: "text-cyan-400 border-cyan-800/60 bg-cyan-950/30 hover:bg-cyan-900/40",
      handler: () => sendMessage(`Explain why ${geneName} is significant based on current portal statistics and published biological knowledge.`, "explain_gene")
    },
    {
      label: "Summarize module",
      icon: Layers,
      color: "text-indigo-400 border-indigo-800/60 bg-indigo-950/30 hover:bg-indigo-900/40",
      handler: () => sendMessage(`Summarize the key findings, top differentially expressed genes, and active figures in the ${activeContext.module} module.`, "summarize_module")
    },
    {
      label: "Known pathways",
      icon: Activity,
      color: "text-emerald-400 border-emerald-800/60 bg-emerald-950/30 hover:bg-emerald-900/40",
      handler: () => sendMessage(`Identify key biological pathways (e.g. KEGG, Reactome, Hallmark) associated with ${geneName} and the top heatmap genes.`, "known_pathways")
    },
    {
      label: "Radiotherapy relevance",
      icon: Sparkles,
      color: "text-amber-400 border-amber-800/60 bg-amber-950/30 hover:bg-amber-900/40",
      handler: () => sendMessage(`Analyze the radiotherapy relevance and SBRT treatment response implications for ${geneName}.`, "radiotherapy_relevance")
    },
    {
      label: "PDAC relevance",
      icon: Microscope,
      color: "text-rose-400 border-rose-800/60 bg-rose-950/30 hover:bg-rose-900/40",
      handler: () => sendMessage(`Discuss the clinical and pathophysiological relevance of ${geneName} in Pancreatic Ductal Adenocarcinoma (PDAC).`, "pdac_relevance")
    },
    {
      label: "Cell types",
      icon: BookOpen,
      color: "text-purple-400 border-purple-800/60 bg-purple-950/30 hover:bg-purple-900/40",
      handler: () => sendMessage(`Summarize the single-nucleus cell lineage expression patterns and specificity for ${geneName} in the GSE202051 atlas.`, "cell_types")
    },
    {
      label: "Spatial localization",
      icon: MapPin,
      color: "text-teal-400 border-teal-800/60 bg-teal-950/30 hover:bg-teal-900/40",
      handler: () => sendMessage(`Describe the spatial tissue localization and spot expression distribution of ${geneName} in the PDAC tumor section.`, "spatial_localization")
    },
    {
      label: "Draft manuscript section",
      icon: FileText,
      color: "text-cyan-300 border-cyan-800/60 bg-cyan-950/40 hover:bg-cyan-900/50",
      handler: () => sendMessage(`Draft a formal scientific Results paragraph for ${geneName} based ONLY on portal evidence.`, "manuscript_text")
    },
    {
      label: "Draft discussion",
      icon: FileText,
      color: "text-blue-300 border-blue-800/60 bg-blue-950/40 hover:bg-blue-900/50",
      handler: () => sendMessage(`Draft a formal scientific Discussion section linking ${geneName} portal statistics to published biological knowledge and metabolic/stress response.`, "discussion_text")
    },
    {
      label: "Presentation summary",
      icon: Presentation,
      color: "text-amber-300 border-amber-800/60 bg-amber-950/40 hover:bg-amber-900/50",
      handler: () => sendMessage(`Generate bullet points summarizing ${geneName} key findings, quantitative evidence, biological interpretation, and limitations for a presentation.`, "presentation_summary")
    },
    {
      label: "Cross-module summary",
      icon: Sparkles,
      color: "text-indigo-300 border-indigo-700/60 bg-indigo-950/50 hover:bg-indigo-900/60",
      handler: () => sendMessage(`Perform a cross-module conservative summary for ${geneName} aggregating TCGA-GTEx, SBRT bulk, Single Nucleus, and Spatial datasets.`, "cross_module")
    },
    {
      label: "Download AI summary",
      icon: Download,
      color: "text-emerald-300 border-emerald-700/60 bg-emerald-950/50 hover:bg-emerald-900/60",
      handler: downloadSummary
    }
  ];

  return (
    <div className="border-t border-slate-800/80 bg-slate-950/60 text-xs">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-1.5 flex items-center justify-between text-slate-400 hover:text-slate-200 transition-colors text-[11px] font-medium"
      >
        <span className="flex items-center gap-1.5 text-cyan-400 font-semibold uppercase tracking-wider text-[10px]">
          <Sparkles className="w-3 h-3" /> Quick Scientific Actions
        </span>
        {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
      </button>

      {isOpen && (
        <div className="p-2.5 grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto custom-scrollbar border-t border-slate-900">
          {actions.map((act, idx) => {
            const Icon = act.icon;
            return (
              <button
                key={idx}
                onClick={act.handler}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-left text-[11px] font-medium transition-all ${act.color}`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{act.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
