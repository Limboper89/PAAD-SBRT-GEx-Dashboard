// AIProvider.tsx - Global Context & Chat State Manager for PDACopilot (v1.4 Scientific Evidence-Consistency)

"use client";

import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import { AI_PROVIDERS, CURRENT_AI_PROVIDER } from "./aiConfig";
import { buildContextualPrompt, buildSystemPrompt, generateExportMetadata, EvidenceChecklist } from "./PromptBuilder";
import { intentRouter, QueryExecutionResult, QueryPlan, ProvenanceItem } from "./IntentRouter";
import { EvidenceValidator } from "./EvidenceValidator";
import { selectModelRoute, formatBioPortalDirectResponse, formatVerifiedQuantitativeBlock } from "./ModelRouter";

/**
 * Assembles production response combining deterministic quantitative block with LLM interpretation & fail-closed enforcement
 */
export function assembleProductionResponse(
  userText: string,
  plan: QueryPlan,
  llmReply: string,
  executionResult: QueryExecutionResult,
  selectedGene?: string
): string {
  const dResults: Record<string, any> = executionResult.datasetResults || (executionResult as any).datasets || {};
  const hasQuantitativeData = !!(dResults.tcga_gtex?.metrics || dResults.gse225767?.metrics);

  const deterministicBlock = formatVerifiedQuantitativeBlock(plan, executionResult);

  // 1. Strip ALL markdown table lines and table markers completely from LLM prose
  let cleanedLlmText = llmReply
    .split('\n')
    .filter(line => {
      const l = line.trim();
      return (
        !l.startsWith('|') &&
        !l.startsWith('[Verified') &&
        !l.toLowerCase().includes("verified bioportal")
      );
    })
    .join('\n')
    .replace(/KRAS Expression Comparison:/gi, "")
    .replace(/Expression Comparison:/gi, "")
    .replace(/\n\s*\n\s*\n/g, "\n\n")
    .trim();


  // 2. Strip GSE225767 study design leakages if question targeted TCGA only
  if (plan.targetDatasets.includes("tcga_gtex") && !plan.targetDatasets.includes("gse225767")) {
    cleanedLlmText = cleanedLlmText
      .split('\n')
      .filter(line => {
        const l = line.toLowerCase();
        return (
          !l.includes("gse225767") &&
          !l.includes("pre=26") &&
          !l.includes("post=29") &&
          !l.includes("pre-treatment") &&
          !l.includes("post-treatment")
        );
      })
      .join('\n');
  }

  // 3. Combine response
  let assembled = "";
  if (hasQuantitativeData && deterministicBlock) {
    assembled = `${deterministicBlock}\n\n### Biological Interpretation\n\n${cleanedLlmText}`;
  } else {
    assembled = llmReply;
  }

  // 3.5 Append missing entities notice if evidence gate detected missing requested entities
  if (executionResult.missingEntities && executionResult.missingEntities.length > 0) {
    const missingNotice = `\n\n*Note: No verified measurement is available in current BioPortal datasets for: ${executionResult.missingEntities.join(", ")}.*`;
    if (!assembled.includes("No verified measurement is available")) {
      assembled += missingNotice;
    }
  }

  // 4. Validate assembled response
  const validation = EvidenceValidator.validateResponse(userText, plan, assembled, executionResult, selectedGene);

  if (!validation.isValid) {
    const hasCriticalContradiction = validation.errors.some(e =>
      e.type === "NUMERICAL_CONTRADICTION" ||
      e.type === "LOG2FC_SIGN_REVERSAL" ||
      e.type === "SIGNIFICANCE_REVERSAL" ||
      e.type === "STUDY_DESIGN_ERROR"
    );

    if (hasCriticalContradiction && deterministicBlock) {
      const tcgaMetrics = dResults.tcga_gtex?.metrics;
      const sbrtMetrics = dResults.gse225767?.metrics;
      const primaryGene = plan.entities.genes[0] || "Target Gene";
      
      let interpretationText = "";
      if (tcgaMetrics) {
        const up = tcgaMetrics.log2FC > 0;
        interpretationText = `BioPortal analysis demonstrates that **${primaryGene}** is **${up ? 'significantly upregulated' : 'downregulated'}** in TCGA-PAAD primary pancreatic tumor samples relative to GTEx normal pancreas tissue (log2FC = \`${tcgaMetrics.log2FCFormatted}\`, FDR = \`${tcgaMetrics.adjPValueFormatted}\`).`;
      } else if (sbrtMetrics) {
        const up = sbrtMetrics.log2FC > 0;
        interpretationText = `BioPortal analysis indicates that **${primaryGene}** expression is **${up ? 'increased' : 'decreased'}** following SBRT radiotherapy in GSE225767 (log2FC = \`${sbrtMetrics.log2FCFormatted}\`, FDR = \`${sbrtMetrics.adjPValueFormatted}\`).`;
      } else {
        interpretationText = `BioPortal verified quantitative evidence is presented in the table above.`;
      }

      assembled = `${deterministicBlock}\n\n### Biological Interpretation\n\n${interpretationText}\n\n*Note: Quantitative metrics above are served directly from the verified BioPortal analytical engine.*`;
    }
  }

  return assembled;
}




export interface ActiveModuleContext {
  module: string;
  dataset: string;
  gene?: string | null;
  heatmapGenes: string[];
  currentFigure: string;
  filters?: {
    log2fcThreshold?: number;
    pValueThreshold?: number;
  };
  tcgaStats?: {
    log2FC?: number;
    pValue?: number;
    pval?: number;
    adjPValue?: number;
    qval?: number;
    tumorMean?: number;
    normalMean?: number;
    correlationGene1?: string | null;
    correlationGene2?: string | null;
  };
  sbrtStats?: {
    log2FC?: number;
    pValue?: number;
    p_value?: number;
    adjPValue?: number;
    adj_p_value?: number;
    preMean?: number;
    postMean?: number;
    treatment?: string;
  };
  singleNucleusStats?: {
    topLineage?: string;
    meanExpr?: number;
    pctPositive?: number;
    selectedCellType?: string;
    totalNuclei?: string;
    markerGenes?: string[];
  };
  spatialStats?: {
    sampleId?: string;
    maxSpotExpr?: number;
    spatialDescription?: string;
    currentViewMode?: string;
  };
  visualState?: {
    zoomLevel?: number;
    selectedSamples?: string[];
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
    return AI_PROVIDERS[CURRENT_AI_PROVIDER]?.name || "Google Gemini 3.1 Flash Lite";
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
        ...(prev.filters || {}),
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

  const sendToAI = async (
    payload: { user_message: string; task: string; context: any },
    targetProviderId: 'gemini' | 'llama-proxy' = 'gemini'
  ): Promise<{ reply: string; error?: boolean; providerUsed?: string }> => {
    try {
      const provider = AI_PROVIDERS[targetProviderId] || AI_PROVIDERS['gemini'];

      console.log(`[PDACopilot Model Route Execution] Provider: ${provider.name} | Endpoint: ${provider.endpoint}`);

      const res = await fetch(provider.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_message: payload.user_message, system_prompt: payload.context.system_prompt })
      });

      const contentType = res.headers.get("content-type");
      if (!res.ok || (contentType && !contentType.includes("application/json"))) {
        console.warn(`[PDACopilot AIProvider]: ${provider.name} endpoint returned ${res.status}. Falling back to Llama...`);
        if (targetProviderId !== 'llama-proxy') {
          const fallbackRes = await fetch(AI_PROVIDERS['llama-proxy'].endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_message: payload.user_message, system_prompt: payload.context.system_prompt })
          });
          if (fallbackRes.ok) {
            const fallbackData = await fallbackRes.json();
            return {
              reply: fallbackData.reply || fallbackData.choices?.[0]?.message?.content || "Fallback response received.",
              providerUsed: "Llama (Groq Worker Proxy)"
            };
          }
        }

        return {
          reply: `⚠️ **AI Service Notice**\n\nThe ${provider.name} endpoint returned status ${res.status}.`,
          error: true
        };
      }

      const data = await res.json();

      // Fallback if Gemini key is missing
      if (data.error && targetProviderId === 'gemini') {
        console.warn("[PDACopilot AIProvider]: Gemini API key missing -> Fallback to Llama (Groq Proxy)...");
        const fallbackRes = await fetch(AI_PROVIDERS['llama-proxy'].endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_message: payload.user_message, system_prompt: payload.context.system_prompt })
        });
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          return {
            reply: fallbackData.reply || fallbackData.choices?.[0]?.message?.content || "Fallback response received.",
            providerUsed: "Llama (Groq Worker Proxy)"
          };
        }
      }

      const rawReply = data.reply || data.choices?.[0]?.message?.content || JSON.stringify(data);
      return { reply: rawReply, providerUsed: provider.name };
    } catch (e: any) {
      console.error("sendToAI Error:", e);
      return { reply: `Error connecting to AI service: ${e?.message || e}`, error: true };
    }
  };

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

      // 3. Build contextual prompt & system prompt
      const { prompt, evidence, provenanceText } = buildContextualPrompt(userText, activeContext, executionResult);
      const systemPrompt = buildSystemPrompt();

      // 4. Deterministically select 3-Level Model Route (Level 0 BioPortal, Level 1 Llama, Level 2 Gemini)
      const routingDecision = selectModelRoute(userText, plan, executionResult);
      console.log(`[PDACopilot 3-Level Router]: Route = ${routingDecision.route} | Rationale = ${routingDecision.reason} | LLM Calls = ${routingDecision.llmCallsNeeded}`);

      let response: { reply: string; error?: boolean; providerUsed?: string };

      if (routingDecision.route === "BIOPORTAL") {
        // LEVEL 0: BioPortal Direct Execution (0 LLM Calls)
        // Use assembleProductionResponse so the verified quantitative block is ALWAYS the source of truth
        const directReply = formatBioPortalDirectResponse(plan, executionResult);
        response = {
          reply: directReply,
          error: false,
          providerUsed: "BioPortal Deterministic Engine (Level 0 - 0 LLM Calls)"
        };

      } else if (routingDecision.route === "LLAMA") {
        // LEVEL 1: Llama for Simple Explanations (Low Cost)
        response = await sendToAI({
          user_message: prompt,
          task: taskType,
          context: {
            system_prompt: systemPrompt,
            query_plan: plan,
            current_page_context: activeContext
          }
        }, 'llama-proxy');
      } else {
        // LEVEL 2: Gemini for Complex Scientific Reasoning
        response = await sendToAI({
          user_message: prompt,
          task: taskType,
          context: {
            system_prompt: systemPrompt,
            query_plan: plan,
            current_page_context: activeContext
          }
        }, 'gemini');
      }


      // 5. Lightweight Mismatch & Contradiction Check (v1.3 Alignment Guard)
      const mismatch = intentRouter.detectMismatch(userText, plan, response.reply, executionResult, activeContext.gene || undefined);

      if (mismatch.isMismatch && mismatch.directive && !response.error) {
        console.warn("[PDACopilot v1.3 Alignment Guard]: Mismatch detected -> Triggering targeted regeneration:", mismatch.directive);
        const retryPrompt = buildContextualPrompt(userText, activeContext, executionResult, mismatch.directive).prompt;
        const retryResponse = await sendToAI({
          user_message: retryPrompt,
          task: taskType,
          context: {
            system_prompt: systemPrompt,
            query_plan: plan,
            current_page_context: activeContext
          }
        });

        if (retryResponse.reply && !retryResponse.error) {
          response = retryResponse;
        }
      }

      // 6. Scientific Evidence-Consistency Validation (v1.4 Guard)
      const validation = EvidenceValidator.validateResponse(userText, plan, response.reply, executionResult, activeContext.gene || undefined);

      if (!validation.isValid && validation.correctionDirective && !response.error) {
        console.warn("[PDACopilot v1.4 Evidence Guard]: Evidence inconsistency detected -> Triggering targeted regeneration:", validation.errors);
        const retryPrompt = buildContextualPrompt(userText, activeContext, executionResult, validation.correctionDirective).prompt;
        const retryResponse = await sendToAI({
          user_message: retryPrompt,
          task: taskType,
          context: {
            system_prompt: systemPrompt,
            query_plan: plan,
            current_page_context: activeContext
          }
        });

        if (retryResponse.reply && !retryResponse.error) {
          // Verify retry response
          const retryValidation = EvidenceValidator.validateResponse(userText, plan, retryResponse.reply, executionResult, activeContext.gene || undefined);
          response = {
            reply: retryValidation.sanitizedResponse || retryResponse.reply,
            error: false
          };
        } else if (validation.sanitizedResponse) {
          response = { reply: validation.sanitizedResponse, error: false };
        }
      }

      const finalContent = response.error 
        ? response.reply 
        : assembleProductionResponse(userText, plan, response.reply, executionResult, activeContext.gene || undefined);

      const assistantMsg: ChatMessageItem = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: finalContent,
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

    messages.forEach(msg => {
      if (msg.role === "user") {
        textContent += `### [${msg.timestamp.toLocaleTimeString()}] USER:\n${msg.content}\n\n`;
      } else {
        textContent += `### [${msg.timestamp.toLocaleTimeString()}] PDACopilot:\n${msg.content}\n\n`;
        if (msg.provenanceText) {
          textContent += `${msg.provenanceText}\n\n`;
        }
      }
    });

    const blob = new Blob([textContent], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `PDAC_BioPortal_AI_Summary_${Date.now()}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [activeContext, currentProviderName, messages]);

  return (
    <AIContext.Provider
      value={{
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
      }}
    >
      {children}
    </AIContext.Provider>
  );
}

export function useAIContext() {
  const ctx = useContext(AIContext);
  if (!ctx) {
    throw new Error("useAIContext must be used within an AIProvider");
  }
  return ctx;
}
