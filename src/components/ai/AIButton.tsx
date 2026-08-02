// AIButton.tsx - Global Floating Trigger Button for PDACopilot

"use client";

import React from "react";
import { useAIContext } from "./AIProvider";
import { Bot, Sparkles } from "lucide-react";

export function AIButton() {
  const { isChatOpen, toggleChatOpen, activeContext } = useAIContext();

  if (isChatOpen) return null;

  return (
    <div className="fixed bottom-6 right-6 z-40">
      <button
        onClick={toggleChatOpen}
        className="group relative flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-slate-900/90 border border-cyan-500/50 text-cyan-300 shadow-xl shadow-cyan-950/50 hover:border-cyan-400 hover:bg-slate-900 hover:scale-105 active:scale-95 transition-all duration-200 backdrop-blur-md"
        title="Open PDACopilot Transcriptomic Assistant"
      >
        {/* Glow Ring */}
        <span className="absolute -inset-0.5 rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 opacity-30 blur group-hover:opacity-75 transition duration-300"></span>

        <div className="relative flex items-center gap-2">
          <div className="relative flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-indigo-600 text-white shadow-inner">
            <Bot className="w-4 h-4" />
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-400"></span>
            </span>
          </div>

          <div className="flex flex-col text-left pr-1">
            <span className="text-xs font-bold text-slate-100 flex items-center gap-1 leading-tight">
              PDACopilot
              <Sparkles className="w-3 h-3 text-cyan-400" />
            </span>
            <span className="text-[9.5px] text-cyan-300/90 font-mono leading-tight">
              {activeContext.gene ? `Gene: ${activeContext.gene}` : activeContext.module}
            </span>
          </div>
        </div>
      </button>
    </div>
  );
}
