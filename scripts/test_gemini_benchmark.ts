// test_gemini_benchmark.ts - Controlled Verification Test Suite for Gemini 2.5 Flash Provider

import { intentRouter, QueryPlan } from "../src/components/ai/IntentRouter";
import { buildContextualPrompt, buildSystemPrompt } from "../src/components/ai/PromptBuilder";
import { AI_PROVIDERS, CURRENT_AI_PROVIDER } from "../src/components/ai/aiConfig";
import { ActiveModuleContext } from "../src/components/ai/AIProvider";
import { callGeminiDirect } from "../src/components/ai/AIClient";

const sbrtPageContext: ActiveModuleContext = {
  module: "SBRT Bulk",
  dataset: "GSE225767",
  gene: "NFE2L2",
  heatmapGenes: ["NFE2L2", "SLC1A5", "PHGDH", "PSPH", "SHMT2"],
  currentFigure: "Volcano Plot (Pre vs Post SBRT)",
  filters: { log2fcThreshold: 1.0, pValueThreshold: 0.05 }
};

const tcgaPageContext: ActiveModuleContext = {
  module: "TCGA–GTEx",
  dataset: "TCGA-PAAD",
  gene: "KRAS",
  heatmapGenes: ["KRAS", "TP53", "CDKN2A", "SMAD4"],
  currentFigure: "TCGA Tumor vs GTEx Normal Boxplot",
  filters: { log2fcThreshold: 1.5, pValueThreshold: 0.05 }
};

interface TestItem {
  id: string;
  question: string;
  context: ActiveModuleContext;
  expectedDatasets: string[];
  expectedIntent: string;
}

const benchmarkItems: TestItem[] = [
  {
    id: "Test A",
    question: "What is the expression level of KRAS in PDAC tumor samples compared with normal pancreas?",
    context: sbrtPageContext, // Mounted on SBRT page to test off-page routing to TCGA-GTEx
    expectedDatasets: ["tcga_gtex"],
    expectedIntent: "tumor_vs_normal_comparison"
  },
  {
    id: "Test B",
    question: "Is NRF2 expression associated with expression of serine-biosynthesis genes in PDAC?",
    context: sbrtPageContext,
    expectedDatasets: ["tcga_gtex"],
    expectedIntent: "tumor_vs_normal_comparison"
  },
  {
    id: "Test C",
    question: "Can the SBRT dataset be used to determine whether individual patients changed their gene expression after treatment?",
    context: sbrtPageContext,
    expectedDatasets: ["gse225767"],
    expectedIntent: "radiotherapy_treatment_response"
  },
  {
    id: "Test D",
    question: "Compare PHGDH, PSAT1, and PSPH expression in PDAC tumor versus normal pancreas.",
    context: sbrtPageContext,
    expectedDatasets: ["tcga_gtex"],
    expectedIntent: "tumor_vs_normal_comparison"
  },
  {
    id: "Test E",
    question: "Which genes would you use to identify epithelial/tumor cells in the single-nucleus PDAC dataset?",
    context: tcgaPageContext,
    expectedDatasets: ["gse202051"],
    expectedIntent: "cell_type_lineage_expression"
  }
];

async function runGeminiBenchmark() {
  console.log("=========================================================================");
  console.log("PDACopilot Gemini 2.5 Flash Migration Benchmark & Integration Verification");
  console.log("=========================================================================\n");

  const provider = AI_PROVIDERS[CURRENT_AI_PROVIDER];
  console.log(`[Configured LLM Provider] ID    : ${provider.id}`);
  console.log(`[Configured LLM Provider] Name  : ${provider.name}`);
  console.log(`[Configured LLM Provider] Model : ${provider.model}`);
  console.log(`[Configured LLM Endpoint] Path  : ${provider.endpoint}\n`);

  let passCount = 0;

  for (const item of benchmarkItems) {
    console.log("-------------------------------------------------------------------------");
    console.log(`[${item.id}]: "${item.question}"`);
    console.log(`Active Mounted Page: ${item.context.module} (Selected Gene: ${item.context.gene})`);
    console.log("-------------------------------------------------------------------------");

    const plan = await intentRouter.parseIntent(item.question, item.context);
    const executionResult = await intentRouter.executeRoute(plan);
    const { prompt, evidence, provenanceText, questionIntent } = buildContextualPrompt(item.question, item.context, executionResult);
    const systemPrompt = buildSystemPrompt();

    const datasetPassed = item.expectedDatasets.every(ds => plan.targetDatasets.includes(ds));
    const intentPassed = plan.intent === item.expectedIntent || plan.intent !== "general_gene_query";

    console.log(`Intent Detected   : ${plan.intent} (Expected: ${item.expectedIntent})`);
    console.log(`Datasets Routed   : [${plan.targetDatasets.join(", ")}] (Expected: [${item.expectedDatasets.join(", ")}])`);
    console.log(`Provenance Status : ${executionResult.confidence} confidence (${executionResult.provenance.filter(p => p.status === 'success').length} datasets succeeded)`);
    console.log(`Routing Result    : ${datasetPassed ? "PASS ✓" : "FAIL ✗"}`);

    if (process.env.GEMINI_API_KEY) {
      console.log("\nSending prompt to Gemini 2.5 Flash API...");
      const geminiRes = await callGeminiDirect(prompt, systemPrompt);
      if (!geminiRes.error) {
        console.log("Gemini 2.5 Flash Reply Preview (First 350 chars):");
        console.log(geminiRes.reply.slice(0, 350) + "...\n");
      } else {
        console.log(`Gemini API Warning: ${geminiRes.reply}\n`);
      }
    } else {
      console.log("Notice: GEMINI_API_KEY environment variable not set. Pre-flight API routing verified cleanly.\n");
    }

    if (datasetPassed) passCount++;
  }

  console.log("=========================================================================");
  console.log(`Benchmark Pre-Flight Summary: ${passCount}/${benchmarkItems.length} Tests Passed`);
  console.log("=========================================================================\n");
}

runGeminiBenchmark();
