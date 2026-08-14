// route.ts - Next.js API Route for Google Gemini Provider (Server Single Source of Truth)

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { modelCache } from "@/lib/ai/ModelCache";

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    // Server single source of truth for Gemini model selection
    const modelName = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

    if (!apiKey) {
      console.warn("[Gemini Server Route]: GEMINI_API_KEY environment variable is not set.");
      return NextResponse.json(
        {
          reply: `⚠️ **Gemini API Key Missing**\n\nPlease set the \`GEMINI_API_KEY\` environment variable in your \`.env.local\` or deployment environment to enable ${modelName}.\n\n*All PDAC BioPortal plots, QueryEngine lookups, heatmaps, and spatial tools remain completely functional.*`,
          error: true,
          isKeyMissing: true,
          provider: "google",
          model: modelName,
          route: "GEMINI"
        },
        { status: 200 }
      );
    }

    const body = await req.json();
    const userMessage = body.user_message || body.message || body.prompt || "";
    const systemPrompt = body.system_prompt || "You are PDACopilot, an expert transcriptomics assistant for pancreatic cancer research.";

    if (!userMessage) {
      return NextResponse.json(
        { reply: "User message payload is empty.", error: true },
        { status: 400 }
      );
    }

    // 1. Check daily API usage limit prior to calling Gemini
    if (modelCache.isDailyLimitReached()) {
      console.warn(`[Gemini Server Route]: Daily Gemini call limit reached (PDACOPILOT_MAX_DAILY_GEMINI_CALLS=${process.env.PDACOPILOT_MAX_DAILY_GEMINI_CALLS || 50}).`);
      return NextResponse.json({
        reply: "Advanced AI synthesis is temporarily unavailable because the configured Gemini usage limit has been reached.\n\n*All deterministic BioPortal plots, differential expression tables, and spatial tools remain fully functional.*",
        error: false,
        limitReached: true,
        provider: "google",
        model: modelName,
        route: "GEMINI",
        cached: false
      });
    }

    // 2. Check server-side process-local response cache
    const cacheKey = modelCache.generateCacheKey(
      modelName,
      userMessage,
      body.context?.evidence || body.evidence,
      body.context?.query_plan?.requiredContract || body.contract,
      "v1.4"
    );

    const cachedItem = modelCache.get(cacheKey);
    if (cachedItem) {
      console.log(`[Gemini Server Route]: Cache HIT for query (0 API calls needed)`);
      return NextResponse.json({
        reply: cachedItem.reply,
        error: false,
        provider: "google",
        model: modelName,
        route: "GEMINI",
        cached: true
      });
    }

    // 3. Initialize Generative AI SDK with explicit server-configured model (NO model escalation)
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: systemPrompt
    });

    console.log(`[Gemini Server Route]: Dispatching request to ${modelName} (${userMessage.length} chars prompt)`);
    const startTime = Date.now();

    let result;
    try {
      // Record actual API request
      modelCache.recordGeminiApiCall();
      result = await model.generateContent(userMessage);
    } catch (err: any) {
      const msg = err?.message || err?.toString() || "";
      const status = err?.status || err?.response?.status;

      // Handle 401 / 403 (Auth/Permission error - 0 retries, never expose API key)
      if (status === 401 || status === 403 || msg.includes("401") || msg.includes("403") || msg.includes("API_KEY_INVALID") || msg.includes("unauthorized")) {
        console.error(`[Gemini Server Route Auth Error]: ${msg}`);
        return NextResponse.json({
          reply: `⚠️ **Gemini Authentication Error**: Please verify that your \`GEMINI_API_KEY\` is valid and has permission to access ${modelName}.`,
          error: true,
          provider: "google",
          model: modelName,
          route: "GEMINI"
        }, { status: 200 });
      }

      // Handle 404 (Model Not Found / Invalid model - 0 retries, NO model switch)
      if (status === 404 || msg.includes("404") || msg.includes("not found") || msg.includes("is not supported")) {
        console.error(`[Gemini Server Route Config Error]: Model ${modelName} not found or unsupported.`);
        return NextResponse.json({
          reply: `⚠️ **Gemini Configuration Error**: Model \`${modelName}\` is unavailable or invalid. Please check your \`GEMINI_MODEL\` setting in \`.env.local\`.`,
          error: true,
          provider: "google",
          model: modelName,
          route: "GEMINI"
        }, { status: 200 });
      }

      // Handle 429 (Rate Limit / Quota Exceeded - Max 1 retry, NO model switch)
      if (status === 429 || msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota")) {
        modelCache.record429();
        console.warn(`[Gemini Server Route 429]: Rate limit encountered. Retrying bounded (max 1 retry)...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        try {
          modelCache.recordRetry();
          modelCache.recordGeminiApiCall(); // Retry is an actual API call
          result = await model.generateContent(userMessage);
        } catch (retryErr: any) {
          console.error(`[Gemini Server Route 429 Retry Failed]:`, retryErr);
          return NextResponse.json({
            reply: `⚠️ **Gemini Rate Limit Notice**: The Gemini API quota/rate-limit has been reached. Please wait a moment before asking another complex synthesis question.\n\n*BioPortal deterministic search and Llama explanations remain active.*`,
            error: true,
            provider: "google",
            model: modelName,
            route: "GEMINI"
          }, { status: 200 });
        }
      } else if (status === 503 || msg.includes("503") || msg.includes("UNAVAILABLE") || msg.includes("high demand") || msg.includes("overloaded")) {
        // Handle 503 (Service Unavailable - Max 1 retry, NO model switch)
        modelCache.record503();
        console.warn(`[Gemini Server Route 503]: Service unavailable. Retrying bounded (max 1 retry)...`);
        await new Promise(resolve => setTimeout(resolve, 500));
        try {
          modelCache.recordRetry();
          modelCache.recordGeminiApiCall(); // Retry is an actual API call
          result = await model.generateContent(userMessage);
        } catch (retryErr: any) {
          console.error(`[Gemini Server Route 503 Retry Failed]:`, retryErr);
          return NextResponse.json({
            reply: `The BioPortal evidence is available, but advanced AI synthesis is temporarily unavailable.`,
            error: true,
            provider: "google",
            model: modelName,
            route: "GEMINI"
          }, { status: 200 });
        }
      } else {
        throw err;
      }
    }

    const responseText = result.response.text();
    const durationMs = Date.now() - startTime;

    console.log(`[Gemini Server Route]: Response generated in ${durationMs} ms (${responseText.length} chars, model: ${modelName})`);

    // Store successful response in server-side cache
    modelCache.set(cacheKey, responseText, modelName, "GEMINI");

    return NextResponse.json({
      reply: responseText,
      error: false,
      provider: "google",
      model: modelName,
      route: "GEMINI",
      cached: false,
      durationMs
    });

  } catch (error: any) {
    console.error("[Gemini Server Route Internal Error]:", error);
    return NextResponse.json(
      {
        reply: `⚠️ **Gemini Execution Error**\n\n${error?.message || error || "An unexpected error occurred while communicating with the Gemini API."}\n\n*PDAC BioPortal visualizations and QueryEngine indices are fully operational.*`,
        error: true,
        provider: "google",
        route: "GEMINI"
      },
      { status: 500 }
    );
  }
}
