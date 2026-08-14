// ModelCache.ts - Server-side Process-Local Response Cache & Gemini API Quota Safety Guard
// Note: This is an in-memory process-local cache for single-server development deployments.

import crypto from "crypto";

export interface CachedResponse {
  reply: string;
  model: string;
  route: string;
  timestamp: number;
}

export interface TelemetryStats {
  totalQueries: number;
  bioPortalCount: number;
  llamaCount: number;
  geminiApiCalls: number;
  geminiCacheHits: number;
  geminiCallsAvoided: number;
  geminiRetries: number;
  gemini429: number;
  gemini503: number;
}

class ModelCacheManager {
  private cache: Map<string, CachedResponse> = new Map();
  private dailyCallCounts: Map<string, number> = new Map(); // Date string (YYYY-MM-DD) -> count
  private stats: TelemetryStats = {
    totalQueries: 0,
    bioPortalCount: 0,
    llamaCount: 0,
    geminiApiCalls: 0,
    geminiCacheHits: 0,
    geminiCallsAvoided: 0,
    geminiRetries: 0,
    gemini429: 0,
    gemini503: 0
  };

  /**
   * Generates a deterministic cache key from input parameters.
   * If model, question, evidence, contract, or prompt version change -> CACHE MISS.
   */
  public generateCacheKey(
    model: string,
    question: string,
    evidenceObj?: any,
    contract?: any,
    promptVersion: string = "v1.4"
  ): string {
    const raw = JSON.stringify({
      model: model.trim().toLowerCase(),
      question: question.trim().toLowerCase(),
      evidence: evidenceObj || null,
      contract: contract || null,
      promptVersion
    });
    return crypto.createHash("sha256").update(raw).digest("hex");
  }

  /**
   * Retrieves cached response if present.
   */
  public get(cacheKey: string): CachedResponse | null {
    const item = this.cache.get(cacheKey);
    if (item) {
      this.stats.geminiCacheHits++;
      this.stats.geminiCallsAvoided++;
      return item;
    }
    return null;
  }

  /**
   * Stores response in cache.
   */
  public set(cacheKey: string, reply: string, model: string, route: string = "GEMINI"): void {
    this.cache.set(cacheKey, {
      reply,
      model,
      route,
      timestamp: Date.now()
    });
  }

  /**
   * Gets current date key in YYYY-MM-DD format (UTC).
   */
  private getTodayKey(): string {
    return new Date().toISOString().split("T")[0];
  }

  /**
   * Checks if daily Gemini API call limit is reached.
   */
  public isDailyLimitReached(): boolean {
    const maxCalls = parseInt(process.env.PDACOPILOT_MAX_DAILY_GEMINI_CALLS || "50", 10);
    const today = this.getTodayKey();
    const currentCalls = this.dailyCallCounts.get(today) || 0;
    return currentCalls >= maxCalls;
  }

  /**
   * Records an actual Gemini API call (initial request or retry).
   * Cache hits do NOT call this method.
   */
  public recordGeminiApiCall(): void {
    const today = this.getTodayKey();
    const currentCalls = this.dailyCallCounts.get(today) || 0;
    this.dailyCallCounts.set(today, currentCalls + 1);
    this.stats.geminiApiCalls++;
  }

  public recordRetry(): void {
    this.stats.geminiRetries++;
  }

  public record429(): void {
    this.stats.gemini429++;
  }

  public record503(): void {
    this.stats.gemini503++;
  }

  public recordQuery(route: "BIOPORTAL" | "LLAMA" | "GEMINI"): void {
    this.stats.totalQueries++;
    if (route === "BIOPORTAL") this.stats.bioPortalCount++;
    if (route === "LLAMA") this.stats.llamaCount++;
  }

  public getStats(): TelemetryStats & { dailyCallsToday: number; maxDailyCalls: number } {
    const today = this.getTodayKey();
    return {
      ...this.stats,
      dailyCallsToday: this.dailyCallCounts.get(today) || 0,
      maxDailyCalls: parseInt(process.env.PDACOPILOT_MAX_DAILY_GEMINI_CALLS || "50", 10)
    };
  }

  public clearMemoryCache(): void {
    this.cache.clear();
  }

  public resetStats(): void {
    this.dailyCallCounts.clear();
    this.stats = {
      totalQueries: 0,
      bioPortalCount: 0,
      llamaCount: 0,
      geminiApiCalls: 0,
      geminiCacheHits: 0,
      geminiCallsAvoided: 0,
      geminiRetries: 0,
      gemini429: 0,
      gemini503: 0
    };
  }
}

// Global server singleton
export const modelCache = new ModelCacheManager();
