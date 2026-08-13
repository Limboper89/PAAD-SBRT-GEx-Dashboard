// ChatMessage.tsx - Single Source of Truth Evidence & Confidence Renderer with Scientific AI-Draft Disclaimer Notice

"use client";

import React, { useState } from "react";
import { ChatMessageItem } from "./AIProvider";
import { Copy, Check, RefreshCw, Bot, User, ShieldCheck, Terminal, AlertCircle, CheckCircle2, XCircle, MinusCircle } from "lucide-react";

export function ChatMessage({ message, onRetry }: { message: ChatMessageItem; onRetry?: () => void }) {
  const [copied, setCopied] = useState<boolean>(false);
  const [showDebugPlan, setShowDebugPlan] = useState<boolean>(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Failed to copy:", e);
    }
  };

  const renderMarkdown = (text: string) => {
    let lines = text.split("\n");
    let htmlLines: React.ReactNode[] = [];
    let inTable = false;
    let tableRows: string[][] = [];

    lines.forEach((line, index) => {
      // Check table rows
      if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
        inTable = true;
        const cols = line.split("|").slice(1, -1).map(c => c.trim());
        if (!cols.every(c => /^:?-+:?$/.test(c))) {
          tableRows.push(cols);
        }
        return;
      } else if (inTable) {
        inTable = false;
        const header = tableRows[0];
        const body = tableRows.slice(1);
        htmlLines.push(
          <div key={`table-${index}`} className="my-2.5 overflow-x-auto rounded border border-slate-800 bg-slate-950/80">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-900 text-cyan-400 font-semibold border-b border-slate-800">
                <tr>
                  {header?.map((h, i) => (
                    <th key={i} className="px-2.5 py-1.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900 text-slate-300">
                {body.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-900/40">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="px-2.5 py-1.5">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        tableRows = [];
      }

      // Headers
      if (line.startsWith("### ")) {
        htmlLines.push(
          <h4 key={index} className="text-xs font-bold text-cyan-300 mt-3 mb-1 uppercase tracking-wide border-b border-slate-800 pb-1">
            {parseInline(line.replace("### ", ""))}
          </h4>
        );
        return;
      }
      if (line.startsWith("## ")) {
        htmlLines.push(
          <h3 key={index} className="text-sm font-bold text-slate-100 mt-3 mb-1">
            {parseInline(line.replace("## ", ""))}
          </h3>
        );
        return;
      }

      // Section tags
      if (line.includes("[Portal Observation]") || line.includes("[Published Biological Knowledge]") || line.includes("[Hypothesis]")) {
        let tagColor = "text-indigo-400 border-indigo-900/60 bg-indigo-950/40";
        if (line.includes("[Portal Observation]")) tagColor = "text-cyan-400 border-cyan-900/60 bg-cyan-950/40";
        if (line.includes("[Published Biological Knowledge]")) tagColor = "text-emerald-400 border-emerald-900/60 bg-emerald-950/40";
        if (line.includes("[Hypothesis]")) tagColor = "text-amber-400 border-amber-900/60 bg-amber-950/40";

        htmlLines.push(
          <div key={index} className={`my-2 px-2.5 py-1 rounded border text-xs font-semibold ${tagColor}`}>
            {parseInline(line)}
          </div>
        );
        return;
      }

      // Bullet points
      if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
        const content = line.trim().substring(2);
        htmlLines.push(
          <li key={index} className="ml-4 list-disc text-slate-300 my-0.5 leading-relaxed">
            {parseInline(content)}
          </li>
        );
        return;
      }

      // Standard paragraph
      if (line.trim() !== "") {
        htmlLines.push(
          <p key={index} className="my-1.5 text-slate-200 leading-relaxed">
            {parseInline(line)}
          </p>
        );
      }
    });

    return htmlLines;
  };

  const parseInline = (text: string): React.ReactNode => {
    const parts = text.split(/(\*\*.*?\*\*|`.*?`|\*.*?\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={idx} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code key={idx} className="font-mono text-[11px] bg-slate-900 text-cyan-300 px-1 py-0.5 rounded border border-slate-800">
            {part.slice(1, -1)}
          </code>
        );
      }
      if (part.startsWith("*") && part.endsWith("*")) {
        return <em key={idx} className="italic text-slate-300">{part.slice(1, -1)}</em>;
      }
      return part;
    });
  };

  const isUser = message.role === "user";
  const confidenceValue = message.confidence || message.evidence?.confidence || "High";
  const provenanceItems = message.provenanceItems || [];

  const intent = message.queryPlanDebug?.intent || "";
  const isDraftAction = 
    intent === "manuscript_text" || 
    intent === "discussion_text" || 
    intent === "presentation_summary" ||
    message.content.toLowerCase().includes("draft manuscript") ||
    message.content.toLowerCase().includes("draft discussion") ||
    message.content.toLowerCase().includes("presentation summary");

  return (
    <div className={`flex gap-2.5 my-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
        isUser ? "bg-indigo-600 text-white" : "bg-cyan-600/30 text-cyan-400 border border-cyan-500/40"
      }`}>
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>

      <div className={`max-w-[85%] rounded-lg p-3 text-xs shadow-md ${
        isUser 
          ? "bg-indigo-600/90 text-white rounded-tr-none" 
          : message.isError
            ? "bg-red-950/40 border border-red-800 text-red-200 rounded-tl-none"
            : "bg-slate-900/95 border border-slate-800/80 text-slate-200 rounded-tl-none backdrop-blur"
      }`}>
        <div className="flex items-center justify-between gap-2 border-b border-slate-800/60 pb-1 mb-2 text-[10px] text-slate-400">
          <span className="font-semibold text-slate-300">{isUser ? "You" : "PDACopilot"}</span>
          <div className="flex items-center gap-2">
            <span>{message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            {!isUser && (
              <div className="flex items-center gap-1">
                {message.queryPlanDebug && (
                  <button
                    onClick={() => setShowDebugPlan(!showDebugPlan)}
                    className="text-slate-400 hover:text-cyan-400 p-0.5 rounded transition-colors flex items-center gap-0.5"
                    title="Toggle Router Debug Info"
                  >
                    <Terminal className="w-3 h-3" />
                  </button>
                )}
                <button
                  onClick={handleCopy}
                  className="hover:text-cyan-400 p-0.5 rounded transition-colors"
                  title="Copy Response"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                {onRetry && (
                  <button
                    onClick={onRetry}
                    className="hover:text-cyan-400 p-0.5 rounded transition-colors"
                    title="Retry Response"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Scientific AI-Draft Disclaimer Notice for Draft/Presentation actions */}
        {!isUser && isDraftAction && (
          <div className="mb-2.5 px-2.5 py-1.5 rounded bg-amber-950/30 border border-amber-800/40 text-[10px] text-amber-300/90 flex items-center gap-1.5 leading-tight">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>AI-assisted draft — independently verify numerical results, citations, biological interpretations, and scientific claims before use.</span>
          </div>
        )}

        {/* Debug Query Plan Drawer */}
        {!isUser && showDebugPlan && message.queryPlanDebug && (
          <div className="mb-2 p-2 rounded bg-slate-950 border border-cyan-900/60 font-mono text-[10px] text-cyan-300">
            <div className="font-bold text-slate-300 border-b border-slate-800 pb-1 mb-1">🔍 Query Router Plan</div>
            <div>Intent: <span className="text-amber-300">{message.queryPlanDebug.intent}</span></div>
            <div>Target Datasets: <span className="text-cyan-400">{message.queryPlanDebug.targetDatasets.join(", ")}</span></div>
            <div>Reasoning: <span className="text-slate-400">{message.queryPlanDebug.reasoning}</span></div>
          </div>
        )}

        {/* Message Content */}
        <div className="prose prose-invert max-w-none text-xs">
          {renderMarkdown(message.content)}
        </div>

        {/* Evidence Used Trace */}
        {!isUser && provenanceItems.length > 0 && (
          <div className="mt-3 pt-2 border-t border-slate-800/80 text-[10px]">
            <div className="flex items-center justify-between font-semibold text-slate-300 mb-1">
              <span>Evidence Used</span>
              <span className={`px-1.5 py-0.2 rounded font-bold text-[9px] ${
                confidenceValue === "High" ? "bg-emerald-950 text-emerald-400 border border-emerald-800" :
                confidenceValue === "Moderate" ? "bg-amber-950 text-amber-400 border border-amber-800" :
                "bg-rose-950 text-rose-400 border border-rose-800"
              }`}>
                Confidence: {confidenceValue}
              </span>
            </div>
            <div className="space-y-0.5 text-slate-400">
              {provenanceItems.map((item, idx) => (
                <div key={idx} className="flex items-start gap-1">
                  {item.status === "success" ? (
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                  ) : item.status === "failed" ? (
                    <XCircle className="w-3 h-3 text-rose-400 shrink-0 mt-0.5" />
                  ) : (
                    <MinusCircle className="w-3 h-3 text-slate-500 shrink-0 mt-0.5" />
                  )}
                  <span className={item.status === "success" ? "text-slate-300" : "text-slate-500"}>
                    <strong className="text-slate-200">{item.datasetName}</strong> — {item.queryDetails || item.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
