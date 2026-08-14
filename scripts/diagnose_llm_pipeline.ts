// diagnose_llm_pipeline.ts - Comprehensive LLM Generation Pipeline Diagnostics for PDACopilot v1.3

import { intentRouter } from "../src/components/ai/IntentRouter";
import { buildContextualPrompt, buildSystemPrompt } from "../src/components/ai/PromptBuilder";
import { AI_PROVIDERS, CURRENT_AI_PROVIDER } from "../src/components/ai/aiConfig";
import { ActiveModuleContext } from "../src/components/ai/AIProvider";

const tcgaPageContext: ActiveModuleContext = {
  module: "TCGA–GTEx",
  dataset: "TCGA-PAAD",
  gene: "KRAS",
  heatmapGenes: ["KRAS", "TP53", "CDKN2A", "SMAD4"],
  currentFigure: "TCGA Tumor vs GTEx Normal Boxplot",
  filters: { log2fcThreshold: 1.5, pValueThreshold: 0.05 }
};

const sbrtPageContext: ActiveModuleContext = {
  module: "SBRT Bulk",
  dataset: "GSE225767",
  gene: "KRAS",
  heatmapGenes: ["KRAS", "NFE2L2"],
  currentFigure: "Volcano Plot",
  filters: { log2fcThreshold: 1.0, pValueThreshold: 0.05 }
};

const testQuestions = [
  {
    id: "Question A",
    question: "What is the expression level of KRAS in PDAC tumor samples compared with normal pancreas?",
    context: tcgaPageContext
  },
  {
    id: "Question B",
    question: "Which genes are significantly upregulated in TCGA-PAAD compared with normal pancreas, using the default differential-expression criteria?",
    context: tcgaPageContext
  },
  {
    id: "Question C",
    question: "Which transcriptomic datasets are available in PDAC BioPortal, and what biological question is each dataset designed to address?",
    context: sbrtPageContext
  }
];

async function runDiagnostic() {
  console.log("=========================================================================");
  console.log("PDACopilot v1.3 - Diagnostic Verification with Correct Payload Key { user_message }");
  console.log("=========================================================================\n");

  const provider = AI_PROVIDERS[CURRENT_AI_PROVIDER];

  for (const item of testQuestions) {
    console.log("-------------------------------------------------------------------------");
    console.log(`[DIAGNOSTIC CASE]: ${item.id}`);
    console.log(`[Question]        : "${item.question}"`);
    console.log("-------------------------------------------------------------------------");

    const plan = await intentRouter.parseIntent(item.question, item.context);
    const executionResult = await intentRouter.executeRoute(plan);
    const { prompt, evidence, provenanceText, questionIntent } = buildContextualPrompt(item.question, item.context, executionResult);
    const systemPrompt = buildSystemPrompt();

    const requestStartTime = Date.now();
    const requestBodyPayload = {
      user_message: prompt,
      system_prompt: systemPrompt
    };

    let rawHttpResponse: Response | null = null;
    let responseData: any = null;

    try {
      rawHttpResponse = await fetch(provider.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBodyPayload)
      });
      const responseTimeMs = Date.now() - requestStartTime;
      responseData = await rawHttpResponse.json();

      console.log(`HTTP Status        : ${rawHttpResponse.status} ${rawHttpResponse.statusText} (${responseTimeMs} ms)`);
      const reply = responseData.reply || responseData.choices?.[0]?.message?.content || JSON.stringify(responseData);
      console.log(`Reply Length       : ${reply.length} characters`);
      console.log(`First 300 chars    :\n${reply.slice(0, 350)}...\n`);

      const genericFallbackString = "I'm ready to assist with computational biology tasks";
      const isGeneric = reply.includes(genericFallbackString);
      console.log(`Result Status      : ${isGeneric ? "❌ GENERIC FALLBACK DETECTED" : "✅ REAL LLM GENERATION SUCCESS"}`);

      const mismatch = intentRouter.detectMismatch(item.question, plan, reply, executionResult, item.context.gene || undefined);
      console.log(`Mismatch Detected  : ${mismatch.isMismatch}`);
      if (mismatch.isMismatch) console.log(`Mismatch Directive : ${mismatch.directive}`);
    } catch (err: any) {
      console.error(`Fetch Error        : ${err.message || err}`);
    }

    console.log("\n=========================================================================\n");
  }
}

runDiagnostic();
