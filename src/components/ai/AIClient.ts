// AIClient.ts - Network abstraction for sending prompts to AI providers

import { AI_PROVIDERS, CURRENT_AI_PROVIDER, AIProviderType } from "./aiConfig";
import { GoogleGenerativeAI } from "@google/generative-ai";

export interface AIPayload {
  user_message: string;
  system_prompt?: string;
  task?: string;
  context?: any;
}

export interface AIResponse {
  reply: string;
  error?: boolean;
  providerUsed?: string;
}

/**
 * Direct Gemini 2.5 Flash API execution for Node.js scripts / testing environments
 */
export async function callGeminiDirect(userMessage: string, systemPrompt?: string): Promise<AIResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  const modelName = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

  if (!apiKey) {
    return {
      reply: `⚠️ **Gemini API Key Missing**\n\nPlease set the \`GEMINI_API_KEY\` environment variable in your \`.env.local\` or environment file to use ${modelName}.`,
      error: true,
      providerUsed: `Google Gemini (${modelName})`
    };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: systemPrompt || "You are PDACopilot, an expert bioinformatics assistant for pancreatic cancer transcriptomics."
    });

    let result;
    try {
      result = await model.generateContent(userMessage);
    } catch (err: any) {
      const msg = err?.message || err?.toString() || "";
      if (msg.includes("429") || msg.includes("503") || msg.includes("RESOURCE_EXHAUSTED")) {
        // Bounded max 1 retry with exact same model (NO model escalation)
        await new Promise(r => setTimeout(r, 500));
        result = await model.generateContent(userMessage);
      } else {
        throw err;
      }
    }

    const responseText = result.response.text();
    return {
      reply: responseText,
      error: false,
      providerUsed: `Google Gemini (${modelName})`
    };
  } catch (err: any) {
    console.error("callGeminiDirect Error:", err);
    return {
      reply: `⚠️ **Gemini API Execution Error**: ${err?.message || err}`,
      error: true,
      providerUsed: `Google Gemini (${modelName})`
    };
  }
}

export async function sendToAI(

  payload: AIPayload,
  providerOverride?: AIProviderType
): Promise<AIResponse> {
  const providerKey = providerOverride || CURRENT_AI_PROVIDER;
  const config = AI_PROVIDERS[providerKey] || AI_PROVIDERS['gemini'];

  // If node environment and GEMINI_API_KEY is present and provider is gemini, call SDK directly
  if (providerKey === 'gemini' && typeof window === 'undefined' && process.env.GEMINI_API_KEY) {
    return callGeminiDirect(payload.user_message, payload.system_prompt || payload.context?.system_prompt);
  }

  try {
    const res = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      console.error(`AI Client Error (${config.name}): HTTP ${res.status}`);
      return {
        reply: `⚠️ **PDACopilot Offline Notice**\n\nThe AI service (${config.name}) encountered HTTP status ${res.status}.\n\n*All PDAC BioPortal plots, data downloads, heatmaps, and spatial maps remain fully functional.*`,
        error: true,
        providerUsed: config.name
      };
    }

    const json = await res.json();
    const replyText = json.reply || json.text || json.choices?.[0]?.message?.content || "No response received from AI model.";

    return {
      reply: replyText,
      error: false,
      providerUsed: config.name
    };
  } catch (err: any) {
    console.error(`AI Client Network Error (${config.name}):`, err);
    return {
      reply: `⚠️ **PDACopilot Connection Error**\n\nUnable to reach ${config.name} at \`${config.endpoint}\`.\n\n*PDAC BioPortal visualizations, heatmaps, single-nucleus atlas, and spatial tools are completely operational offline.*`,
      error: true,
      providerUsed: config.name
    };
  }
}
