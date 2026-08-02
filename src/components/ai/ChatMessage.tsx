// ChatMessage.tsx - Custom Markdown Renderer & Evidence Tag Renderer for PDACopilot

"use client";

import React, { useState } from "react";
import { ChatMessageItem } from "./AIProvider";
import { Copy, Check, RefreshCw, Bot, User, CheckCircle2, XCircle, ShieldCheck } from "lucide-react";

export function ChatMessage({ message, onRetry }: { message: ChatMessageItem; onRetry?: () => void }) {
  const [copied, setCopied] = useState<boolean>(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Failed to copy:", e);
    }
  };

  // Modern clean Markdown parser (supporting bold, code blocks, bullet points, headers, tables, callouts)
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
        // Ignore separator row like |---|---|
        if (!cols.every(c => /^:?-+:?$/.test(c))) {
          tableRows.push(cols);
        }
        return;
      } else if (inTable) {
        // Flush table
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

      // Section tags like [Portal Observation]
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

  // Helper for inline bold, code backticks, and italic
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

        <div className="space-y-1">{renderMarkdown(message.content)}</div>

        {/* Evidence Tags Badge Block for Assistant Messages */}
        {!isUser && message.evidence && (
          <div className="mt-3 pt-2 border-t border-slate-800/80 text-[10px] bg-slate-950/60 -mx-3 -mb-3 p-2.5 rounded-b-lg">
            <div className="flex items-center gap-1.5 font-semibold text-cyan-400 mb-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              <span>Evidence Used</span>
              <span className="ml-auto text-slate-400 font-normal">
                Confidence: <strong className="text-emerald-400">{message.evidence.confidence}</strong>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1 text-[10.5px]">
              <div className="flex items-center gap-1">
                {message.evidence.tcga ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <XCircle className="w-3 h-3 text-slate-500" />}
                <span className={message.evidence.tcga ? "text-slate-200" : "text-slate-500"}>TCGA–GTEx</span>
              </div>
              <div className="flex items-center gap-1">
                {message.evidence.sbrt ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <XCircle className="w-3 h-3 text-slate-500" />}
                <span className={message.evidence.sbrt ? "text-slate-200" : "text-slate-500"}>SBRT Bulk</span>
              </div>
              <div className="flex items-center gap-1">
                {message.evidence.singleNucleus ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <XCircle className="w-3 h-3 text-slate-500" />}
                <span className={message.evidence.singleNucleus ? "text-slate-200" : "text-slate-500"}>Single Nucleus</span>
              </div>
              <div className="flex items-center gap-1">
                {message.evidence.spatial ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <XCircle className="w-3 h-3 text-slate-500" />}
                <span className={message.evidence.spatial ? "text-slate-200" : "text-slate-500"}>
                  Spatial {message.evidence.spatial ? "" : "(not queried)"}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
