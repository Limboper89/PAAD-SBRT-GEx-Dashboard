// TypingIndicator.tsx - Smooth loading indicator for PDACopilot inference

"use client";

import React from "react";
import { Bot } from "lucide-react";

export function TypingIndicator() {
  return (
    <div className="flex gap-2.5 my-3 flex-row items-center">
      <div className="w-7 h-7 rounded-full bg-cyan-600/30 text-cyan-400 border border-cyan-500/40 flex items-center justify-center shrink-0">
        <Bot className="w-4 h-4" />
      </div>
      <div className="bg-slate-900/90 border border-slate-800 rounded-lg rounded-tl-none px-3.5 py-2.5 flex items-center gap-1.5 shadow-md">
        <span className="text-xs text-slate-400 font-medium mr-1">PDACopilot analyzing</span>
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:-0.3s]"></span>
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:-0.15s]"></span>
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce"></span>
      </div>
    </div>
  );
}
