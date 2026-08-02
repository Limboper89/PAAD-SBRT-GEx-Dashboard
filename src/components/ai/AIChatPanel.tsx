// AIChatPanel.tsx - Resizable, Glassmorphic Chat Drawer for PDACopilot

"use client";

import React, { useState, useRef, useEffect } from "react";
import { useAIContext } from "./AIProvider";
import { CurrentContextPanel } from "./CurrentContextPanel";
import { ChatMessage } from "./ChatMessage";
import { QuickActions } from "./QuickActions";
import { TypingIndicator } from "./TypingIndicator";
import { 
  X, 
  Send, 
  Trash2, 
  Download, 
  Bot, 
  GripVertical,
  Maximize2,
  Minimize2,
  Sparkles
} from "lucide-react";

export function AIChatPanel() {
  const {
    messages,
    isChatOpen,
    isTyping,
    currentProviderName,
    setChatOpen,
    sendMessage,
    clearChat,
    retryLastMessage,
    downloadSummary
  } = useAIContext();

  const [input, setInput] = useState<string>("");
  const [panelWidth, setPanelWidth] = useState<number>(440);
  const [isExpandedFull, setIsExpandedFull] = useState<boolean>(false);
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const chatLogRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat log to bottom when new messages arrive
  useEffect(() => {
    if (chatLogRef.current) {
      chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  // Handle panel resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth >= 340 && newWidth <= 800) {
        setPanelWidth(newWidth);
      }
    };
    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  if (!isChatOpen) return null;

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;
    const text = input;
    setInput("");
    await sendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const currentWidthStyle = isExpandedFull ? "w-full max-w-4xl" : "";
  const customWidthStyle = !isExpandedFull ? { width: `${panelWidth}px` } : {};

  return (
    <aside
      style={customWidthStyle}
      className={`fixed top-0 right-0 bottom-0 z-50 flex flex-col bg-slate-950/95 border-l border-slate-800 shadow-2xl backdrop-blur-xl transition-all duration-150 ${currentWidthStyle}`}
    >
      {/* Resizer Handle */}
      {!isExpandedFull && (
        <div
          onMouseDown={() => setIsResizing(true)}
          className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-cyan-500/50 transition-colors flex items-center justify-center group"
          title="Drag to resize PDACopilot drawer"
        >
          <GripVertical className="w-3 h-3 text-slate-600 group-hover:text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      )}

      {/* Header */}
      <div className="px-4 py-3 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-indigo-600 p-0.5 shadow-lg shadow-cyan-500/20">
            <div className="w-full h-full bg-slate-950 rounded-[7px] flex items-center justify-center text-cyan-400">
              <Bot className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-bold text-slate-100 tracking-tight">PDACopilot</h2>
              <span className="text-[10px] font-semibold bg-cyan-950 text-cyan-300 border border-cyan-800/60 px-1.5 py-0.5 rounded">
                v1.2.0
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono">
              Backend: <span className="text-slate-300">{currentProviderName}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={downloadSummary}
            className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded transition-colors"
            title="Download AI Conversation Summary (.md)"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={clearChat}
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
            title="Clear Conversation"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsExpandedFull(!isExpandedFull)}
            className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded transition-colors"
            title={isExpandedFull ? "Restore Drawer Size" : "Expand Drawer Wide"}
          >
            {isExpandedFull ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setChatOpen(false)}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors ml-1"
            title="Close Drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Visible Live Context Panel */}
      <CurrentContextPanel />

      {/* Chat Messages Log */}
      <div ref={chatLogRef} className="flex-1 overflow-y-auto px-4 py-2 custom-scrollbar space-y-1">
        {messages.map(msg => (
          <ChatMessage
            key={msg.id}
            message={msg}
            onRetry={msg.role === "assistant" ? retryLastMessage : undefined}
          />
        ))}
        {isTyping && <TypingIndicator />}
      </div>

      {/* Collapsible Scientific Quick Actions */}
      <QuickActions />

      {/* Chat Input Bar */}
      <div className="p-3 bg-slate-900/90 border-t border-slate-800 shrink-0">
        <div className="relative flex items-center bg-slate-950 border border-slate-800 rounded-lg focus-within:border-cyan-500/80 transition-colors shadow-inner">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask PDACopilot about current gene, figures, or cell types... (Press Enter to send)"
            rows={2}
            className="w-full bg-transparent text-xs text-slate-100 placeholder-slate-500 px-3 py-2 focus:outline-none resize-none custom-scrollbar"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className="absolute right-2 bottom-2 p-1.5 bg-gradient-to-r from-cyan-500 to-indigo-600 text-white rounded-md hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md"
            title="Send prompt"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1.5 px-0.5">
          <span className="flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-cyan-400" />
            <span>PDAC transcriptomic copilot</span>
          </span>
          <span>Shift + Enter for new line</span>
        </div>
      </div>
    </aside>
  );
}
