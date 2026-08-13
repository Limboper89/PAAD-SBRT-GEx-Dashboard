// test_pdacopilot_grounding.ts - Strict Data Grounding & Anti-Hallucination Regression Test Suite

import { queryEngine } from "../src/components/ai/QueryEngine";
import { buildSystemPrompt } from "../src/components/ai/PromptBuilder";

interface GroundingTestResult {
  testId: string;
  description: string;
  expected: string;
  actual: string;
  passed: boolean;
}

const groundingResults: GroundingTestResult[] = [];

function assertGrounding(testId: string, description: string, expected: string, actual: string, condition: boolean) {
  groundingResults.push({
    testId,
    description,
    expected,
    actual,
    passed: condition
  });
}

async function runGroundingSuite() {
  console.log("=========================================================================");
  console.log("PDACopilot Strict Data Grounding & Anti-Hallucination Test Suite");
  console.log("=========================================================================\n");

  // Test 1: KRAS SBRT Exact CSV Values
  const krasSbrt = await queryEngine.queryGeneExpression("gse225767", "KRAS");
  assertGrounding(
    "Test 1.1",
    "KRAS SBRT Existence Check",
    "found = true",
    `found = ${krasSbrt.found}`,
    krasSbrt.found && krasSbrt.success
  );

  if (krasSbrt.metrics) {
    assertGrounding(
      "Test 1.2",
      "KRAS SBRT log2FC Grounding",
      "2.1103",
      krasSbrt.metrics.log2FCFormatted,
      Math.abs(krasSbrt.metrics.log2FC - 2.1103187) < 0.001
    );

    assertGrounding(
      "Test 1.3",
      "KRAS SBRT p-value Grounding",
      "0.4698",
      krasSbrt.metrics.pValueFormatted || "",
      Math.abs((krasSbrt.metrics.pValue || 0) - 0.469846) < 0.001
    );

    assertGrounding(
      "Test 1.4",
      "KRAS SBRT Non-Significance Check",
      "isSignificant = false (p=0.4698 > 0.05)",
      `isSignificant = ${krasSbrt.metrics.isSignificant}`,
      krasSbrt.metrics.isSignificant === false
    );
  }

  // Test 2: KRAS TCGA-GTEx Exact Values
  const krasTcga = await queryEngine.queryGeneExpression("tcga_gtex", "KRAS");
  assertGrounding(
    "Test 2.1",
    "KRAS TCGA-GTEx log2FC Grounding",
    "1.9882",
    krasTcga.metrics?.log2FCFormatted || "",
    Math.abs((krasTcga.metrics?.log2FC || 0) - 1.98821) < 0.001
  );

  assertGrounding(
    "Test 2.2",
    "KRAS TCGA-GTEx FDR q-value Grounding",
    "2.0849e-48",
    krasTcga.metrics?.adjPValueFormatted || "",
    krasTcga.metrics?.adjPValue !== undefined && krasTcga.metrics.adjPValue < 1e-45
  );

  // Test 3: SBRT Total Genes and DEG Count Grounding
  const sbrtDeg = await queryEngine.queryDifferentialExpression("gse225767");
  assertGrounding(
    "Test 3.1",
    "SBRT Total Dataset Gene Count Grounding",
    "16138 genes",
    `${sbrtDeg.totalGenes} genes`,
    sbrtDeg.totalGenes === 16138
  );

  assertGrounding(
    "Test 3.2",
    "SBRT Filtered DEG Count Grounding (p < 0.05, |log2FC| >= 1.0)",
    "304 DEGs",
    `${sbrtDeg.filteredCount} DEGs`,
    sbrtDeg.filteredCount === 304
  );

  assertGrounding(
    "Test 3.3",
    "SBRT Top Upregulated DEG Match (NAT8B)",
    "NAT8B",
    sbrtDeg.topUpregulated[0]?.gene || "",
    sbrtDeg.topUpregulated[0]?.gene === "NAT8B"
  );

  // Test 4: Missing Gene Handling
  const fakeGene = await queryEngine.queryGeneExpression("gse225767", "FAKEGENE12345");
  assertGrounding(
    "Test 4.1",
    "Non-Existent Gene Query Grounding",
    "found = false, metrics = null",
    `found = ${fakeGene.found}, metrics = ${fakeGene.metrics}`,
    fakeGene.found === false && fakeGene.metrics === null
  );

  // Test 5: System Prompt Citation Suppression Rule Check
  const systemPrompt = buildSystemPrompt();
  const hasCitationRule = systemPrompt.includes("Do NOT generate formal literature citations") && systemPrompt.includes("Published biological knowledge indicates");
  assertGrounding(
    "Test 5.1",
    "System Prompt Citation Suppression Rule Check",
    "Rule present in buildSystemPrompt()",
    hasCitationRule ? "Present" : "Missing",
    hasCitationRule
  );

  // Print Test Summary Table
  console.table(groundingResults.map(r => ({
    ID: r.testId,
    Description: r.description,
    Expected: r.expected,
    Actual: r.actual,
    Result: r.passed ? "PASS ✓" : "FAIL ✗"
  })));

  const failed = groundingResults.filter(r => !r.passed).length;
  console.log(`\nGrounding Test Suite Summary: ${groundingResults.length - failed}/${groundingResults.length} Tests Passed`);
  if (failed > 0) {
    console.error(`❌ ${failed} grounding regression tests failed!`);
    process.exit(1);
  } else {
    console.log("✅ All strict data-grounding and anti-hallucination tests passed successfully!");
  }
}

runGroundingSuite();
