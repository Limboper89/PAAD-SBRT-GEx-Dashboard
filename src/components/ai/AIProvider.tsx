// AIProvider.tsx - Global React Context Provider for PDACopilot

"use client";

import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import { sendToAI } from "./AIClient";
import { buildSystemPrompt, buildContextualPrompt, generateExportMetadata, EvidenceChecklist } from "./PromptBuilder";
import { CURRENT_AI_PROVIDER, AI_PROVIDERS } from "./aiConfig";

export interface ActiveModuleContext {
  module: string;            // 'TCGA-GTEx' | 'SBRT Bulk' | 'Single Nucleus' | 'Spatial'
  gene: string | null;
  dataset: string;
  currentFigure: string;
  heatmapGenes: string[];
  filters: {
    log2fcThreshold?: number;
    pValueThreshold?: number;
    adjPValueThreshold?: number;
  };
  tcgaStats?: {
    log2FC?: number;
    pval?: number;
    qval?: number;
    tumorMean?: number;
    normalMean?: number;
    correlationGene1?: string | null;
    correlationGene2?: string | null;
  };
  sbrtStats?: {
    log2FC?: number;
    p_value?: number;
    adj_p_value?: number;
    preMean?: number;
    postMean?: number;
    treatment?: string;
  };
  singleNucleusStats?: {
    selectedCellType?: string | null;
    selectedCluster?: string | null;
    totalNuclei?: string;
    markerGenes?: string[];
    umapCoordinates?: { x: number; y: number } | null;
  };
  spatialStats?: {
    sampleId?: string | null;
    coordinates?: { x: number; y: number } | null;
    currentViewMode?: string;
  };
}

export interface ChatMessageItem {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  evidence?: EvidenceChecklist;
  isError?: boolean;
}

interface AIContextType {
  messages: ChatMessageItem[];
  isChatOpen: boolean;
  isTyping: boolean;
  activeContext: ActiveModuleContext;
  currentProviderName: string;
  setChatOpen: (open: boolean) => void;
  toggleChatOpen: () => void;
  sendMessage: (text: string, taskType?: string) => Promise<void>;
  clearChat: () => void;
  retryLastMessage: () => Promise<void>;
  downloadSummary: () => void;
  registerModuleContext: (partialContext: Partial<ActiveModuleContext>) => void;
}

const defaultContextState: ActiveModuleContext = {
  module: "SBRT Bulk",
  gene: "NFE2L2",
  dataset: "GSE225767: Ductal Adenocarcinoma Bulk RNA-seq",
  currentFigure: "Volcano Plot",
  heatmapGenes: ["NFE2L2", "PHGDH", "PSAT1", "CCDC9B", "CA12"],
  filters: {
    log2fcThreshold: 1.0,
    pValueThreshold: 0.05
  }
};

const AIContext = createContext<AIContextType | undefined>(undefined);

export function AIProvider({ children }: { children: React.ReactNode }) {
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [activeContext, setActiveContext] = useState<ActiveModuleContext>(defaultContextState);

  const initialGreeting: ChatMessageItem = useMemo(() => ({
    id: "init-1",
    role: "assistant",
    content: `Welcome to **PDACopilot** — your context-aware transcriptomic copilot for pancreatic cancer research.

I automatically monitor your active **gene**, **dataset**, **visualizations**, **cell types**, and **statistical filters** in real time.

*How can I assist your transcriptomic analysis today?*`,
    timestamp: new Date(),
    evidence: {
      tcga: true,
      sbrt: true,
      singleNucleus: true,
      spatial: true,
      confidence: 'High'
    }
  }), []);

  const [messages, setMessages] = useState<ChatMessageItem[]>([initialGreeting]);

  const registerModuleContext = useCallback((partialContext: Partial<ActiveModuleContext>) => {
    setActiveContext(prev => {
      // Merge shallow properties intelligently
      return {
        ...prev,
        ...partialContext,
        filters: {
          ...prev.filters,
          ...(partialContext.filters || {})
        },
        heatmapGenes: partialContext.heatmapGenes || prev.heatmapGenes,
        tcgaStats: partialContext.tcgaStats ? { ...prev.tcgaStats, ...partialContext.tcgaStats } : prev.tcgaStats,
        sbrtStats: partialContext.sbrtStats ? { ...prev.sbrtStats, ...partialContext.sbrtStats } : prev.sbrtStats,
        singleNucleusStats: partialContext.singleNucleusStats ? { ...prev.singleNucleusStats, ...partialContext.singleNucleusStats } : prev.singleNucleusStats,
        spatialStats: partialContext.spatialStats ? { ...prev.spatialStats, ...partialContext.spatialStats } : prev.spatialStats,
      };
    });
  }, []);

  const toggleChatOpen = useCallback(() => {
    setIsChatOpen(prev => !prev);
  }, []);

  const setChatOpen = useCallback((open: boolean) => {
    setIsChatOpen(open);
  }, []);

  const clearChat = useCallback(() => {
    setMessages([
      {
        id: `clear-${Date.now()}`,
        role: "assistant",
        content: "Conversation cleared. How can PDACopilot assist your analysis?",
        timestamp: new Date()
      }
    ]);
  }, []);

  const sendMessage = useCallback(async (userText: string, taskType: string = "general") => {
    if (!userText.trim()) return;

    const userMsg: ChatMessageItem = {
      id: `user-${Date.now()}`,
      role: "user",
      content: userText,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setIsChatOpen(true);
    setIsTyping(true);

    try {
      const { prompt, evidence } = buildContextualPrompt(userText, activeContext, taskType);
      const systemPrompt = buildSystemPrompt();

      const response = await sendToAI({
        user_message: prompt,
        task: taskType,
        context: {
          system_prompt: systemPrompt,
          active_module_snapshot: activeContext
        }
      });

      const assistantMsg: ChatMessageItem = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: response.reply,
        timestamp: new Date(),
        evidence,
        isError: response.error
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error("AIProvider send error:", err);
      setMessages(prev => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: "⚠️ Sorry, PDACopilot encountered an internal error. Please try again.",
          timestamp: new Date(),
          isError: true
        }
      ]);
    } finally {
      setIsTyping(false);
    }
  }, [activeContext]);

  const retryLastMessage = useCallback(async () => {
    const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
    if (lastUserMsg) {
      await sendMessage(lastUserMsg.content);
    }
  }, [messages, sendMessage]);

  const downloadSummary = useCallback(() => {
    const providerName = AI_PROVIDERS[CURRENT_AI_PROVIDER]?.name || "Llama Groq Proxy";
    const header = generateExportMetadata(activeContext, providerName, "Context-Aware Research Summary");

    let textContent = header + "\n\n# PDACopilot Conversation Log\n\n";

    messages.forEach(m => {
      const roleLabel = m.role === "user" ? "USER" : "PDACopilot";
      const timeStr = m.timestamp.toLocaleTimeString();
      textContent += `### [${timeStr}] ${roleLabel}:\n${m.content}\n\n`;
      if (m.evidence) {
        textContent += `*Evidence Used: TCGA (${m.evidence.tcga ? '✓' : '✗'}), SBRT (${m.evidence.sbrt ? '✓' : '✗'}), SN (${m.evidence.singleNucleus ? '✓' : '✗'}), Spatial (${m.evidence.spatial ? '✓' : '✗'}) | Confidence: ${m.evidence.confidence}*\n\n`;
      }
      textContent += "---\n\n";
    });

    const blob = new Blob([textContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const geneLabel = activeContext.gene || "gene";
    a.download = `PDACopilot_Summary_${geneLabel}_${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [activeContext, messages]);

  const currentProviderName = AI_PROVIDERS[CURRENT_AI_PROVIDER]?.name || "Llama Proxy";

  return (
    <AIContext.Provider
      value={{
        messages,
        isChatOpen,
        isTyping,
        activeContext,
        currentProviderName,
        setChatOpen,
        toggleChatOpen,
        sendMessage,
        clearChat,
        retryLastMessage,
        downloadSummary,
        registerModuleContext
      }}
    >
      {children}
    </AIContext.Provider>
  );
}

export function useAIContext(): AIContextType {
  const ctx = useContext(AIContext);
  if (!ctx) {
    throw new Error("useAIContext must be used within an <AIProvider>");
  }
  return ctx;
}
