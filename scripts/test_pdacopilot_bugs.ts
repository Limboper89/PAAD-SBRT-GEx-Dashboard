// test_pdacopilot_bugs.ts - Final Pre-GitHub Regression Verification Test Suite

import fs from "fs";
import path from "path";
import { intentRouter } from "../src/components/ai/IntentRouter";
import { queryEngine } from "../src/components/ai/QueryEngine";
import { buildContextualPrompt, buildSystemPrompt } from "../src/components/ai/PromptBuilder";
import { ActiveModuleContext } from "../src/components/ai/AIProvider";

interface BugTestResult {
  testId: string;
  description: string;
  expected: string;
  actual: string;
  passed: boolean;
}

const testResults: BugTestResult[] = [];

function assertBug(testId: string, description: string, expected: string, actual: string, condition: boolean) {
  testResults.push({
    testId,
    description,
    expected,
    actual,
    passed: condition
  });
}

const mockSbrtContext: ActiveModuleContext = {
  module: "SBRT Bulk",
  dataset: "GSE225767",
  gene: "KRAS",
  heatmapGenes: ["KRAS", "NFE2L2"],
  currentFigure: "Volcano Plot",
  filters: {}
};

async function runBugRegressionSuite() {
  console.log("=========================================================================");
  console.log("PDACopilot Final Pre-GitHub Refinement & Regression Suite");
  console.log("=========================================================================\n");

  // 1. UI Button Labels Check
  const quickActionsFile = path.join(process.cwd(), "src/components/ai/QuickActions.tsx");
  const quickActionsContent = fs.readFileSync(quickActionsFile, "utf-8");
  const hasDraftManuscript = quickActionsContent.includes('label: "Draft manuscript section"');
  const hasDraftDiscussion = quickActionsContent.includes('label: "Draft discussion"');
  const hasNoOldManuscript = !quickActionsContent.includes('label: "Generate manuscript text"');
  const hasNoOldDiscussion = !quickActionsContent.includes('label: "Generate discussion"');

  assertBug(
    "UI Label 1",
    "Quick Actions Button Labels Renamed ('Draft manuscript section' & 'Draft discussion')",
    "New labels present, old labels absent",
    `Draft manuscript: ${hasDraftManuscript}, Draft discussion: ${hasDraftDiscussion}`,
    hasDraftManuscript && hasDraftDiscussion && hasNoOldManuscript && hasNoOldDiscussion
  );

  // 2. Scientific AI-Draft Disclaimer Notice Check in ChatMessage.tsx
  const chatMessageFile = path.join(process.cwd(), "src/components/ai/ChatMessage.tsx");
  const chatMessageContent = fs.readFileSync(chatMessageFile, "utf-8");
  const hasDisclaimer = chatMessageContent.includes("AI-assisted draft — independently verify numerical results, citations, biological interpretations, and scientific claims before use.");

  assertBug(
    "UI Disclaimer 2",
    "ChatMessage Renders Unobtrusive Scientific AI-Draft Disclaimer Notice",
    "Notice present in ChatMessage.tsx",
    hasDisclaimer ? "Present" : "Missing",
    hasDisclaimer
  );

  // 3. Citation Safety & Zero Fake Bibliographic References Check
  const sysPrompt = buildSystemPrompt();
  const hasCitationSafety = sysPrompt.includes("CITATION SAFETY & ZERO FAKE REFERENCES") && sysPrompt.includes("NEVER create a formal bibliographic citation from model memory");

  assertBug(
    "Citation Safety 3",
    "System Prompt Forbids Fabricated Bibliographic References (Jones et al.)",
    "Rule present in buildSystemPrompt()",
    hasCitationSafety ? "Present" : "Missing",
    hasCitationSafety
  );

  // 4. Draft Grounding & Structured Discussion Rules Check
  const hasDraftRules = sysPrompt.includes("DRAFTING & MANUSCRIPT GROUNDING INSTRUCTIONS") && sysPrompt.includes("Principal finding") && sysPrompt.includes("Future validation");

  assertBug(
    "Draft Grounding 4",
    "System Prompt Structured Discussion & Draft Grounding Rules Present",
    "Rule present in buildSystemPrompt()",
    hasDraftRules ? "Present" : "Missing",
    hasDraftRules
  );

  // 5. Conversational Anaphora Dataset Resolution (TCGA vs SBRT)
  const qA1 = "Which genes are significantly upregulated in TCGA-PAAD compared with normal pancreas?";
  const planA1 = await intentRouter.parseIntent(qA1, mockSbrtContext);
  const qA2 = "Among the significantly upregulated genes, which ones are most strongly associated with pancreatic cancer biology?";
  const planA2 = await intentRouter.parseIntent(qA2, mockSbrtContext, planA1);

  assertBug(
    "v1.2 Test A",
    "Conversational Anaphora Retains TCGA-GTEx Dataset Context",
    "targetDatasets = ['tcga_gtex']",
    `targetDatasets = [${planA2.targetDatasets.join(", ")}]`,
    planA2.targetDatasets.includes("tcga_gtex") && !planA2.targetDatasets.includes("gse225767")
  );

  // 6. Non-Significant Statistical Result Caution Check
  const sbrtKrasRes = await queryEngine.queryGeneExpression("gse225767", "KRAS");
  const krasSummary = sbrtKrasRes.metrics?.significanceSummary || "";

  assertBug(
    "Scientific Caution 6",
    "Non-Significant Result (KRAS SBRT p=0.4698) Reported as Not Significant",
    "significanceSummary contains 'Not statistically significant'",
    `significanceSummary = '${krasSummary}'`,
    krasSummary.includes("Not statistically significant")
  );

  // 7. Biological Relevance Guardrail Check (TP53 query excludes KRAS)
  const qTp53 = "What is TP53 expression across all datasets?";
  const planTp53 = await intentRouter.parseIntent(qTp53, mockSbrtContext);
  const resTp53 = await intentRouter.executeRoute(planTp53);
  const promptTp53 = buildContextualPrompt(qTp53, mockSbrtContext, resTp53).prompt;
  const tp53HasFocus = promptTp53.includes("MANDATORY BIOLOGICAL FOCUS: TP53");

  assertBug(
    "Guardrail 7",
    "TP53 Query Biological Relevance Focus (No KRAS Drift)",
    "Biological Focus = TP53",
    `Focus in prompt: ${tp53HasFocus ? "TP53 present" : "Missing"}`,
    tp53HasFocus
  );

  // Print Summary Table
  console.table(testResults.map(r => ({
    ID: r.testId,
    Description: r.description,
    Expected: r.expected,
    Actual: r.actual,
    Result: r.passed ? "PASS ✓" : "FAIL ✗"
  })));

  const failedCount = testResults.filter(r => !r.passed).length;
  console.log(`\nRegression Test Summary: ${testResults.length - failedCount}/${testResults.length} Tests Passed`);

  if (failedCount > 0) {
    console.error(`❌ ${failedCount} tests failed!`);
    process.exit(1);
  } else {
    console.log("✅ All final pre-GitHub refinement tests passed successfully!");
  }
}

runBugRegressionSuite();
