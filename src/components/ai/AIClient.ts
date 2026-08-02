// AIClient.ts - Network abstraction for sending prompts to AI providers

import { AI_PROVIDERS, CURRENT_AI_PROVIDER, AIProviderType } from "./aiConfig";

export interface AIPayload {
  user_message: string;
  task?: string;
  context?: any;
}

export interface AIResponse {
  reply: string;
  error?: boolean;
  providerUsed?: string;
}

export async function sendToAI(
  payload: AIPayload,
  providerOverride?: AIProviderType
): Promise<AIResponse> {
  const providerKey = providerOverride || CURRENT_AI_PROVIDER;
  const config = AI_PROVIDERS[providerKey] || AI_PROVIDERS['llama-proxy'];

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
