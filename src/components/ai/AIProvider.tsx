// AIProvider.tsx - Global Context & Intent-Driven Copilot Provider for PDAC BioPortal (v1.2 Conversation-Aware)

"use client";

import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import { intentRouter, QueryPlan, QueryExecutionResult, ProvenanceItem } from "./IntentRouter";
import { buildContextualPrompt, buildSystemPrompt, generateExportMetadata, EvidenceChecklist } from "./PromptBuilder";
import { sendToAI } from "./AIClient";
import { CURRENT_AI_PROVIDER, AI_PROVIDERS } from "./aiConfig";

export interface ActiveModuleContext {
  module: string;
  dataset: string;
  gene?: string | null;
  heatmapGenes: string[];
  currentFigure: string;
  filters: {
    log2fcThreshold?: number;
    pValueThreshold?: number;
    fdrThreshold?: number;
  };
  tcgaStats?: {
    log2FC?: number;
    pVal?: number;
    pval?: number;
    qVal?: number;
    qval?: number;
    correlationGene1?: string | null;
    correlationGene2?: string | null;
  };
  sbrtStats?: {
    prePostFC?: number;
    log2FC?: number;
    pVal?: number;
    p_value?: number;
    adj_p_value?: number;
    treatment?: string;
  };
  singleNucleusStats?: {
    cellType?: string;
    selectedCellType?: string;
    pctExpressed?: number;
    totalNuclei?: string;
    markerGenes?: string[];
  };
  spatialStats?: {
    spotCluster?: string;
    sampleId?: string;
    maxExpr?: number;
    currentViewMode?: string;
  };
}

export interface ChatMessageItem {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  evidence?: EvidenceChecklist;
  provenanceText?: string;
  provenanceItems?: ProvenanceItem[];
  confidence?: "High" | "Moderate" | "Low";
  queryPlanDebug?: QueryPlan;
  isError?: boolean;
}

interface AIContextType {
  isChatOpen: boolean;
  isTyping: boolean;
  activeContext: ActiveModuleContext;
  messages: ChatMessageItem[];
  currentProviderName: string;
  toggleChatOpen: () => void;
  setChatOpen: (open: boolean) => void;
  sendMessage: (text: string, taskType?: string) => Promise<void>;
  registerModuleContext: (partialContext: Partial<ActiveModuleContext>) => void;
  clearChat: () => void;
  downloadSummary: () => void;
  retryLastMessage: () => Promise<void>;
}

const defaultModuleContext: ActiveModuleContext = {
  module: "SBRT Bulk",
  dataset: "GSE225767",
  gene: "NFE2L2",
  heatmapGenes: ["NFE2L2", "SLC1A5", "PHGDH", "PSPH", "SHMT2", "MTHFD1", "MTHFD2"],
  currentFigure: "Volcano Plot (Pre vs Post SBRT)",
  filters: { log2fcThreshold: 1.0, pValueThreshold: 0.05 }
};

const AIContext = createContext<AIContextType | null>(null);

export function AIProvider({ children }: { children: React.ReactNode }) {
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [activeContext, setActiveContext] = useState<ActiveModuleContext>(defaultModuleContext);

  const currentProviderName = useMemo(() => {
    return AI_PROVIDERS[CURRENT_AI_PROVIDER]?.name || "Llama Groq Proxy";
  }, []);

  const initialGreeting: ChatMessageItem = useMemo(() => ({
    id: "init-welcome",
    role: "assistant",
    content: `Welcome to **PDACopilot** — your global dataset-aware transcriptomic copilot for pancreatic cancer research.

I can analyze **TCGA-PAAD vs GTEx**, **SBRT Radiotherapy (GSE225767)**, **Single-Nucleus Atlas (GSE202051)**, and **Spatial Visium (GSE274103)** datasets independently of whichever page you are currently viewing.

*How can I assist your transcriptomic research today?*`,
    timestamp: new Date(),
    evidence: {
      tcga: true,
      sbrt: true,
      singleNucleus: true,
      spatial: true,
      confidence: 'High'
    },
    provenanceItems: [
      { datasetId: "tcga_gtex", datasetName: "TCGA-PAAD vs GTEx", status: "success", queryDetails: "Tumor vs normal reference" },
      { datasetId: "gse225767", datasetName: "SBRT Bulk (GSE225767)", status: "success", queryDetails: "Radiotherapy pre vs post response" },
      { datasetId: "gse202051", datasetName: "Single-Nucleus (GSE202051)", status: "success", queryDetails: "Cell-type lineage atlas" },
      { datasetId: "gse274103", datasetName: "Spatial Visium (GSE274103)", status: "success", queryDetails: "Tumor section localization" }
    ],
    confidence: "High",
    provenanceText: `**Global Datasets Available**
- ✓ **TCGA-PAAD vs GTEx**: Tumor vs normal reference
- ✓ **SBRT Bulk (GSE225767)**: Radiotherapy pre vs post response
- ✓ **Single-Nucleus (GSE202051)**: Cell-type lineage atlas
- ✓ **Spatial Visium (GSE274103)**: Tumor section localization`
  }), []);

  const [messages, setMessages] = useState<ChatMessageItem[]>([initialGreeting]);

  const registerModuleContext = useCallback((partialContext: Partial<ActiveModuleContext>) => {
    setActiveContext(prev => ({
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
    }));
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

    // Find previous turn's query plan for conversation-aware dataset resolution
    const lastAssistantMsg = [...messages].reverse().find(m => m.role === "assistant" && m.queryPlanDebug);
    const previousPlan = lastAssistantMsg?.queryPlanDebug;

    setMessages(prev => [...prev, userMsg]);
    setIsChatOpen(true);
    setIsTyping(true);

    try {
      // 1. IntentRouter parses intent & resolves dataset using conversation context
      const plan = await intentRouter.parseIntent(userText, activeContext, previousPlan);

      // 2. IntentRouter executes plan against QueryEngine across datasets
      const executionResult: QueryExecutionResult = await intentRouter.executeRoute(plan);

      // 3. Build contextual prompt with separated global & current page context
      const { prompt, evidence, provenanceText } = buildContextualPrompt(userText, activeContext, executionResult);
      const systemPrompt = buildSystemPrompt();

      // 4. Send query payload to AI backend API
      const response = await sendToAI({
        user_message: prompt,
        task: taskType,
        context: {
          system_prompt: systemPrompt,
          query_plan: plan,
          current_page_context: activeContext
        }
      });

      const assistantMsg: ChatMessageItem = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: response.reply,
        timestamp: new Date(),
        evidence,
        provenanceText,
        provenanceItems: executionResult.provenance,
        confidence: executionResult.confidence,
        queryPlanDebug: plan,
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
          content: "⚠️ Sorry, PDACopilot encountered an internal error processing your query. Please try again.",
          timestamp: new Date(),
          isError: true
        }
      ]);
    } finally {
      setIsTyping(false);
    }
  }, [activeContext, messages]);

  const retryLastMessage = useCallback(async () => {
    const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
    if (lastUserMsg) {
      await sendMessage(lastUserMsg.content);
    }
  }, [messages, sendMessage]);

  const downloadSummary = useCallback(() => {
    const header = generateExportMetadata(activeContext, currentProviderName, "Context-Aware Research Summary");

    let textContent = header + "\n\n# PDACopilot Conversation Log\n\n";

    messages.forEach(m => {
      const roleLabel = m.role === "user" ? "USER" : "PDACopilot";
      const timeStr = m.timestamp.toLocaleTimeString();
      textContent += `### [${timeStr}] ${roleLabel}:\n${m.content}\n\n`;
      if (m.provenanceText) {
        textContent += `${m.provenanceText}\n\n`;
      }
    });

    const blob = new Blob([textContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `PDAC_BioPortal_AI_Summary_${Date.now()}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [activeContext, currentProviderName, messages]);

  const value = useMemo(() => ({
    isChatOpen,
    isTyping,
    activeContext,
    messages,
    currentProviderName,
    toggleChatOpen,
    setChatOpen,
    sendMessage,
    registerModuleContext,
    clearChat,
    downloadSummary,
    retryLastMessage
  }), [
    isChatOpen,
    isTyping,
    activeContext,
    messages,
    currentProviderName,
    toggleChatOpen,
    setChatOpen,
    sendMessage,
    registerModuleContext,
    clearChat,
    downloadSummary,
    retryLastMessage
  ]);

  return <AIContext.Provider value={value}>{children}</AIContext.Provider>;
}

export function useAIContext(): AIContextType {
  const ctx = useContext(AIContext);
  if (!ctx) throw new Error("useAIContext must be used within an AIProvider");
  return ctx;
}
