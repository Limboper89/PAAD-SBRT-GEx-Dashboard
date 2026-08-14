// test_pdacopilot_q2_production_grounding.ts - Q2 Production Grounding & Response Assembly Regression Test Suite
// Verifies production assembly, fail-closed behavior, LLM table suppression, and context isolation with ZERO live Gemini API calls.

import { assembleProductionResponse } from "../src/components/ai/AIProvider";
import { intentRouter, QueryPlan, QueryExecutionResult } from "../src/components/ai/IntentRouter";

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
  console.log(`[Production Test ${id}] ${name}: ${passed ? "PASS ✓" : "FAIL ✗"}`);
  if (!passed) {
    console.error(`   Expected: ${expected}`);
    console.error(`   Actual:   ${actual}`);
  }
}

async function runQ2ProductionGroundingTestSuite() {
  console.log("=========================================================================");
  console.log("PDACopilot V2 — Q2 Production Grounding & Response Assembly Test Suite");
  console.log("=========================================================================\n");

  let q2FinalResponseOutput = "";

  // TEST 1: Q2 KRAS Production Response Assembly & Fail-Closed Test
  {
    const q2Question = "What is the expression level of KRAS in PDAC tumor samples compared with normal pancreas?";
    const q2Plan: QueryPlan = {
      intent: "tumor_vs_normal_comparison",
      targetDatasets: ["tcga_gtex"],
      entities: { genes: ["KRAS"] },
      isPageSpecificQuestion: false,
      reasoning: "TCGA tumor vs normal comparison for KRAS"
    };

    const q2ExecutionResult: QueryExecutionResult = {
      plan: q2Plan,
      provenance: [
        {
          datasetId: "tcga_gtex",
          datasetName: "TCGA-PAAD vs GTEx Pancreas Normal Reference",
          status: "success",
          operation: "queryGeneExpression",
          queryDetails: "Retrieved KRAS log2FC=1.9882, FDR=2.0849e-48"
        }
      ],
      confidence: "High",
      datasetResults: {
        tcga_gtex: {
          type: "gene",
          gene: "KRAS",
          found: true,
          metrics: {
            log2FC: 1.9882,
            log2FCFormatted: "+1.9882",
            pValue: 2.0849e-48,
            pValueFormatted: "2.08e-48",
            adjPValue: 2.0849e-48,
            adjPValueFormatted: "2.08e-48",
            tumorMean: 8.45,
            tumorMeanFormatted: "8.45",
            normalMean: 6.46,
            normalMeanFormatted: "6.46",
            isSignificant: true,
            significanceSummary: "Significant (FDR < 0.001)"
          }
        }
      }
    };

    // Bad simulated LLM reply (matches the latest production bug screenshot!)
    const badLlmReply =
      "**Tumor vs Normal Comparison of KRAS Expression in PDAC**\n\n" +
      "**Dataset:** TCGA-PAAD (primary tumor, n=178) vs GTEx normal pancreas (n=167)\n\n" +
      "**KRAS Expression Comparison:**\n\n" +
      "| Gene | log2FC (Tumor vs Normal) | FDR |\n" +
      "| --- | --- | --- |\n" +
      "| KRAS | -0.05 | 0.82 |\n\n" +
      "**Interpretation:** KRAS expression is not significantly different between PDAC tumor samples and normal pancreas (FDR = 0.82). The log2 fold change (log2FC) of -0.05 indicates a slight decrease in KRAS expression in tumor samples compared to normal pancreas, but this difference is not statistically significant (FDR > 0.05).\n\n" +
      "**Note:** The FDR (False Discovery Rate) threshold of 0.05 is used to determine statistical significance. A FDR < 0.05 indicates a statistically significant result, while a FDR >= 0.05 indicates a non-significant result.";

    const finalResponse = assembleProductionResponse(
      q2Question,
      q2Plan,
      badLlmReply,
      q2ExecutionResult,
      "KRAS"
    );



    q2FinalResponseOutput = finalResponse;

    const containsRequired =
      finalResponse.includes("KRAS") &&
      (finalResponse.includes("+1.9882") || finalResponse.includes("1.9882")) &&
      (finalResponse.includes("2.0849e-48") || finalResponse.includes("2.08e-48")) &&
      finalResponse.toLowerCase().includes("upregulated") &&
      finalResponse.toLowerCase().includes("significant") &&
      (finalResponse.includes("TCGA-PAAD") || finalResponse.includes("TCGA"));

    const containsForbidden =
      finalResponse.includes("-0.12") ||
      finalResponse.includes("0.34") ||
      finalResponse.toLowerCase().includes("not significant") ||
      finalResponse.toLowerCase().includes("pre-treatment") ||
      finalResponse.toLowerCase().includes("post-treatment") ||
      finalResponse.includes("26 pre") ||
      finalResponse.includes("29 post");

    const passed = containsRequired && !containsForbidden;
    recordTest(
      "1",
      "Q2 KRAS Production Response Assembly & Fail-Closed",
      "MUST contain +1.9882, 2.08e-48, Upregulated, Significant; MUST NOT contain -0.12, 0.34, pre-treatment vs post-treatment",
      `Passed = ${passed}, Contains Required = ${containsRequired}, Contains Forbidden = ${containsForbidden}`,
      passed
    );
  }

  // TEST 2: PHGDH Production Grounding & Hallucination Suppression
  {
    const phgdhPlan: QueryPlan = {
      intent: "tumor_vs_normal_comparison",
      targetDatasets: ["tcga_gtex"],
      entities: { genes: ["PHGDH"] },
      isPageSpecificQuestion: false,
      reasoning: "PHGDH tumor vs normal comparison"
    };

    const phgdhExecutionResult: QueryExecutionResult = {
      plan: phgdhPlan,
      provenance: [],
      confidence: "High",
      datasetResults: {
        tcga_gtex: {
          type: "gene",
          gene: "PHGDH",
          found: true,
          metrics: {
            log2FC: -0.6031,
            log2FCFormatted: "-0.6031",
            adjPValue: 2.9223e-12,
            adjPValueFormatted: "2.92e-12",
            isSignificant: true,
            significanceSummary: "Significant (FDR < 0.001)"
          }
        }
      }
    };

    const badLlmReply = "PHGDH log2FC = -0.35, FDR = 0.21. PHGDH shows non-significant change.";
    const finalResponse = assembleProductionResponse(
      "Compare PHGDH expression in PDAC tumor versus normal pancreas.",
      phgdhPlan,
      badLlmReply,
      phgdhExecutionResult,
      "PHGDH"
    );

    const containsRequired =
      finalResponse.includes("-0.6031") &&
      (finalResponse.includes("2.9223e-12") || finalResponse.includes("2.92e-12")) &&
      finalResponse.toLowerCase().includes("downregulated") &&
      finalResponse.toLowerCase().includes("significant");

    const containsForbidden = finalResponse.includes("-0.35") || finalResponse.includes("0.21");

    const passed = containsRequired && !containsForbidden;
    recordTest(
      "2",
      "PHGDH Production Grounding & Hallucination Suppression",
      "MUST contain -0.6031, 2.92e-12, Downregulated, Significant; MUST NOT contain -0.35, 0.21",
      `Passed = ${passed}`,
      passed
    );
  }

  // TEST 3: Context Contamination Protection (Stale active page GSE225767 context override)
  {
    const plan = await intentRouter.parseIntent(
      "What is the expression of KRAS in TCGA PDAC versus normal pancreas?",
      { module: "SBRT Bulk", dataset: "gse225767", gene: "NFE2L2", heatmapGenes: [], currentFigure: "fig1" }
    );

    const isTcga = plan.targetDatasets.length === 1 && plan.targetDatasets[0] === "tcga_gtex";
    const isKras = plan.entities.genes.length === 1 && plan.entities.genes[0] === "KRAS";

    const passed = isTcga && isKras;
    recordTest(
      "3",
      "Context Contamination Protection (Active page GSE225767 override)",
      "Explicit TCGA query resolves to tcga_gtex and KRAS (ignoring active page GSE225767 & NFE2L2)",
      `targetDatasets = [${plan.targetDatasets.join(", ")}], genes = [${plan.entities.genes.join(", ")}]`,
      passed
    );
  }

  console.log("\n=========================================================================");
  console.log("EXACT FINAL PRODUCTION RESPONSE FOR Q2:");
  console.log("=========================================================================");
  console.log(q2FinalResponseOutput);
  console.log("=========================================================================\n");

  const totalPassed = results.filter(r => r.passed).length;
  console.log(`Q2 Production Regression Test Summary: ${totalPassed} / ${results.length} Tests Passed`);
  console.log("=========================================================================\n");

  if (totalPassed < results.length) {
    process.exit(1);
  }
}

runQ2ProductionGroundingTestSuite().catch(err => {
  console.error("Test Suite Execution Failed:", err);
  process.exit(1);
});
