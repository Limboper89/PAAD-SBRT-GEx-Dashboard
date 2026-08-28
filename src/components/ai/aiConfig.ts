// aiConfig.ts - Pluggable AI Provider Configuration for PDAC BioPortal

export type AIProviderType = 'gemini' | 'llama-proxy' | 'openai' | 'groq' | 'ollama';

export interface AIProviderConfig {
  id: AIProviderType;
  name: string;
  endpoint: string;
  model: string;
  description: string;
  isCustom?: boolean;
}

export const PORTAL_METADATA = {
  appName: "PDAC BioPortal",
  appVersion: "1.3.0",
  targetJournal: "Nature Communications",
  datasetVersions: {
    sbrtBulk: "GSE225767 (Radiotherapy Pre/Post Paired Bulk RNA-seq)",
    tcgaGtex: "TCGA-PAAD vs GTEx Pancreas (349-sample Normal Reference Atlas)",
    singleNucleus: "GSE202051 (224,988 Nuclei PDAC Single-Nucleus Atlas)",
    spatial: "GSE274103 (Patient Tumor Visium Spatial Transcriptomics)"
  }
};

export const AI_PROVIDERS: Record<AIProviderType, AIProviderConfig> = {
  'gemini': {
    id: 'gemini',
    name: 'Google Gemini 3.1 Flash Lite',
    endpoint: 'https://paad-groq-proxy.kumarprincebt.workers.dev/api/chat',
    model: 'gemini-3.1-flash-lite',
    description: 'High-quota Google Gemini 3.1 Flash Lite model for grounded scientific reasoning (500 RPD tier)'
  },

  'llama-proxy': {
    id: 'llama-proxy',
    name: 'Llama (Groq Worker Proxy)',
    endpoint: 'https://paad-groq-proxy.kumarprincebt.workers.dev/api/chat',
    model: 'llama-3.3-70b-versatile',
    description: 'Current low-latency Llama endpoint hosted on Cloudflare Workers (A/B Benchmark option)'
  },
  'openai': {
    id: 'openai',
    name: 'OpenAI GPT-4o',
    endpoint: '/api/ai/openai',
    model: 'gpt-4o',
    description: 'Future provider option'
  },
  'groq': {
    id: 'groq',
    name: 'Groq Llama 3.3 Direct',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
    description: 'Direct Groq API endpoint'
  },
  'ollama': {
    id: 'ollama',
    name: 'Ollama Local LLM',
    endpoint: 'http://localhost:11434/api/generate',
    model: 'llama3:8b',
    description: 'Self-hosted offline local LLM server'
  }
};

// Current active AI provider setting (defaults to Gemini 2.5 Flash; can be swapped via env NEXT_PUBLIC_LLM_PROVIDER)
export const CURRENT_AI_PROVIDER: AIProviderType = 
  (process.env.NEXT_PUBLIC_LLM_PROVIDER as AIProviderType) || 'gemini';
