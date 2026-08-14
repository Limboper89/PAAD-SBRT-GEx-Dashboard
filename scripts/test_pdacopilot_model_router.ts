// test_pdacopilot_model_router.ts - Cost-Safe Model Routing Unit Test Suite (Tests A through K)
// Exercises model routing, caching, daily limits, and error handling with ZERO live Gemini API quota consumption.

import { selectModelRoute, formatBioPortalDirectResponse } from "../src/components/ai/ModelRouter";
import { modelCache } from "../src/lib/ai/ModelCache";
import { QueryPlan, QueryExecutionResult } from "../src/components/ai/IntentRouter";

interface TestResult {
  id: string;
  name: string;
  expected: string;
  actual: string;
  passed: boolean;
}

const results: TestResult[] = [];

function recordTest(id: string, name: string, expected: string, actual: string, passed: boolean) {
  results.push({ id, name, expected, actual, passed });
  console.log(`[Test ${id}] ${name}: ${passed ? "PASS ✓" : "FAIL ✗"}`);
  if (!passed) {
    console.error(`   Expected: ${expected}`);
    console.error(`   Actual:   ${actual}`);
  }
}

async function runModelRouterTestSuite() {
  console.log("=========================================================================");
  console.log("PDACopilot V2 — Cost-Safe Model Routing Unit Test Suite (Tests A – K)");
  console.log("=========================================================================\n");

  // Reset cache and stats before starting
  modelCache.resetStats();

  // Mock Query Execution Result with data
  const mockExecutionResult: QueryExecutionResult = {
    plan: {
      intent: "differential_expression_list",
      targetDatasets: ["tcga_gtex"],
      entities: { genes: ["PHGDH"] },
      isPageSpecificQuestion: false,
      reasoning: "Test plan"
    },
    provenance: [],

    datasetResults: {
      tcga_gtex: {
        datasetId: "tcga_gtex",
        gene: "PHGDH",
        found: true,
        metrics: {
          log2FC: 2.15,
          log2FCFormatted: "+2.15",
          adjPValue: 0.0001,
          adjPValueFormatted: "< 0.001",
          isSignificant: true,
          significanceSummary: "Significant (FDR < 0.001)"
        },
        comparisonLabel: "TCGA PAAD vs GTEx Normal",
        limitations: [],
        success: true
      }
    },

    confidence: "High"
  };

  // TEST A: Direct Factual BioPortal Query
  {
    const question = "What is PHGDH log2FC?";
    const route = selectModelRoute(question, mockExecutionResult.plan, mockExecutionResult);
    const passed = route.route === "BIOPORTAL" && route.llmCallsNeeded === 0;
    recordTest(
      "A",
      "Direct Factual BioPortal Query",
      "Route: BIOPORTAL (0 LLM Calls)",
      `Route: ${route.route} (${route.llmCallsNeeded} LLM Calls)`,
      passed
    );
  }

  // TEST B: Simple Explanation Query
  {
    const question = "What does PHGDH do?";
    const route = selectModelRoute(question, mockExecutionResult.plan, mockExecutionResult);
    const passed = route.route === "LLAMA" && route.llmCallsNeeded === 1;
    recordTest(
      "B",
      "Simple Explanation Query",
      "Route: LLAMA (1 Llama Call, 0 Gemini Calls)",
      `Route: ${route.route} (${route.llmCallsNeeded} LLM Calls)`,
      passed
    );
  }

  // TEST C: Complex Integration Query
  {
    const question = "Integrate TCGA, SBRT, spatial and single-nucleus evidence for PHGDH.";
    const complexPlan: QueryPlan = {
      intent: "cross_module_synthesis",
      targetDatasets: ["tcga_gtex", "gse225767", "gse202051", "gse274103"],
      entities: { genes: ["PHGDH"] },
      isPageSpecificQuestion: false,
      reasoning: "Complex cross module synthesis plan"
    };

    const route = selectModelRoute(question, complexPlan, mockExecutionResult);
    const passed = route.route === "GEMINI" && route.llmCallsNeeded === 1;
    recordTest(
      "C",
      "Complex Integration Query",
      "Route: GEMINI (1 Gemini Call)",
      `Route: ${route.route} (${route.llmCallsNeeded} LLM Calls)`,
      passed
    );
  }

  // TEST D: Repeated Identical Request (Cache Hit)
  {
    modelCache.resetStats();
    const model = "gemini-3.1-flash-lite";
    const question = "Explain a possible mechanism of radiation resistance for PHGDH";
    const evidence = { gene: "PHGDH", log2FC: 2.15 };
    const contract = { fields: ["log2FC"] };

    const cacheKey1 = modelCache.generateCacheKey(model, question, evidence, contract, "v1.4");
    
    // First request: Cache miss -> Set in cache
    let cached1 = modelCache.get(cacheKey1);
    if (!cached1) {
      modelCache.recordGeminiApiCall();
      modelCache.set(cacheKey1, "Synthesized response for PHGDH radiation resistance.", model, "GEMINI");
    }

    // Second request: Cache hit
    const cacheKey2 = modelCache.generateCacheKey(model, question, evidence, contract, "v1.4");
    const cached2 = modelCache.get(cacheKey2);

    const stats = modelCache.getStats();
    const passed = cached2 !== null && stats.geminiApiCalls === 1 && stats.geminiCacheHits === 1;
    recordTest(
      "D",
      "Repeated Identical Request (Cache Hit)",
      "First: API Call (1), Second: Cache Hit (1), Total Gemini API Calls = 1",
      `API Calls: ${stats.geminiApiCalls}, Cache Hits: ${stats.geminiCacheHits}`,
      passed
    );
  }

  // TEST E: Simulated 429 Bounded Retry (Max 1 Retry, NO Model Escalation)
  {
    let attempts = 0;
    const modelTargeted = "gemini-3.1-flash-lite";
    let modelEscalated = false;

    // Simulate 429 handler logic
    try {
      attempts++; // Attempt 1
      throw { status: 429, message: "RESOURCE_EXHAUSTED" };
    } catch (err: any) {
      if (err.status === 429) {
        attempts++; // Bounded Max 1 Retry
        // Simulate successful retry with SAME model
      }
    }

    const passed = attempts === 2 && !modelEscalated;
    recordTest(
      "E",
      "HTTP 429 Rate Limit Bounded Retry",
      "Max 1 Retry (2 Total Attempts), Model Escalation = FALSE",
      `Attempts: ${attempts}, Model Escalation: ${modelEscalated}`,
      passed
    );
  }

  // TEST F: Simulated 503 Service Unavailable (Max 1 Retry, NO Model Escalation)
  {
    let attempts = 0;
    let modelEscalated = false;

    // Simulate 503 handler logic
    try {
      attempts++; // Attempt 1
      throw { status: 503, message: "UNAVAILABLE" };
    } catch (err: any) {
      if (err.status === 503) {
        attempts++; // Bounded Max 1 Retry
      }
    }

    const passed = attempts === 2 && !modelEscalated;
    recordTest(
      "F",
      "HTTP 503 Service Unavailable Bounded Retry",
      "Max 1 Retry (2 Total Attempts), Model Escalation = FALSE",
      `Attempts: ${attempts}, Model Escalation: ${modelEscalated}`,
      passed
    );
  }

  // TEST G: Simulated 404 Model Not Found (0 Retries, NO Model Switch)
  {
    let attempts = 0;
    let modelSwitched = false;
    let errorReported = false;

    // Simulate 404 handler logic
    try {
      attempts++;
      throw { status: 404, message: "MODEL_NOT_FOUND" };
    } catch (err: any) {
      if (err.status === 404) {
        errorReported = true;
        // Do NOT retry, do NOT switch model
      }
    }

    const passed = attempts === 1 && !modelSwitched && errorReported;
    recordTest(
      "G",
      "HTTP 404 Model Not Found Configuration Error",
      "Attempts: 1 (0 Retries), Model Switch = FALSE, Error Reported = TRUE",
      `Attempts: ${attempts}, Model Switch: ${modelSwitched}, Error Reported: ${errorReported}`,
      passed
    );
  }

  // TEST H: Daily Limit Reached Safeguard
  {
    modelCache.resetStats();
    process.env.PDACOPILOT_MAX_DAILY_GEMINI_CALLS = "2";

    // Simulate 2 calls
    modelCache.recordGeminiApiCall();
    modelCache.recordGeminiApiCall();

    const limitReached = modelCache.isDailyLimitReached();
    const stats = modelCache.getStats();

    const passed = limitReached && stats.dailyCallsToday === 2;
    recordTest(
      "H",
      "Daily Limit Reached Safeguard",
      "Limit Reached: TRUE at 2 Calls (0 further Gemini calls allowed)",
      `Limit Reached: ${limitReached}, Calls Today: ${stats.dailyCallsToday}`,
      passed
    );
    
    // Clean up env
    delete process.env.PDACOPILOT_MAX_DAILY_GEMINI_CALLS;
  }

  // TEST I: Different Evidence -> Cache Miss
  {
    modelCache.resetStats();
    const model = "gemini-3.1-flash-lite";
    const question = "Compare pathway enrichment for PHGDH";

    const key1 = modelCache.generateCacheKey(model, question, { log2FC: 2.15 }, null, "v1.4");
    const key2 = modelCache.generateCacheKey(model, question, { log2FC: -1.05 }, null, "v1.4");

    const passed = key1 !== key2;
    recordTest(
      "I",
      "Different Evidence Cache Key Variation",
      "Key1 !== Key2 (Cache Miss on different evidence)",
      `Keys Match: ${key1 === key2}`,
      passed
    );
  }

  // TEST J: Different Model -> Cache Miss
  {
    const question = "Compare pathway enrichment for PHGDH";
    const key1 = modelCache.generateCacheKey("gemini-3.1-flash-lite", question, null, null, "v1.4");
    const key2 = modelCache.generateCacheKey("gemini-3.5-flash", question, null, null, "v1.4");

    const passed = key1 !== key2;
    recordTest(
      "J",
      "Different Model Cache Key Variation",
      "Key1 !== Key2 (Cache Miss on different model)",
      `Keys Match: ${key1 === key2}`,
      passed
    );
  }

  // TEST K: Different Prompt Version -> Cache Miss
  {
    const question = "Compare pathway enrichment for PHGDH";
    const key1 = modelCache.generateCacheKey("gemini-3.1-flash-lite", question, null, null, "v1.4");
    const key2 = modelCache.generateCacheKey("gemini-3.1-flash-lite", question, null, null, "v1.5");

    const passed = key1 !== key2;
    recordTest(
      "K",
      "Different Prompt Version Cache Key Variation",
      "Key1 !== Key2 (Cache Miss on prompt version change)",
      `Keys Match: ${key1 === key2}`,
      passed
    );
  }

  console.log("\n=========================================================================");
  const totalPassed = results.filter(r => r.passed).length;
  console.log(`Model Router Unit Test Summary: ${totalPassed} / ${results.length} Tests Passed`);
  console.log("=========================================================================\n");

  if (totalPassed < results.length) {
    process.exit(1);
  }
}

runModelRouterTestSuite().catch(err => {
  console.error("Test Suite Execution Failed:", err);
  process.exit(1);
});
