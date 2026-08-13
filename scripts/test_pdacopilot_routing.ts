// test_pdacopilot_routing.ts - Automated Benchmark Test Suite for Cross-Page Intent Routing

import { intentRouter, QueryPlan } from "../src/components/ai/IntentRouter";
import { ActiveModuleContext } from "../src/components/ai/AIProvider";

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

const snPageContext: ActiveModuleContext = {
  module: "Single Nucleus",
  dataset: "GSE202051",
  gene: "EPCAM",
  heatmapGenes: ["EPCAM", "PDGFRB", "PTPRC"],
  currentFigure: "Single-Nucleus Cell Type UMAP",
  filters: {}
};

const spatialPageContext: ActiveModuleContext = {
  module: "Spatial Visium",
  dataset: "GSE274103",
  gene: "EPCAM",
  heatmapGenes: ["EPCAM", "COL1A1"],
  currentFigure: "Spatial Visium Tissue Spot Map",
  filters: {}
};

interface TestResult {
  testId: string;
  question: string;
  activePage: string;
  expectedDataset: string;
  actualDatasets: string[];
  intent: string;
  passed: boolean;
  notes: string;
}

const testResults: TestResult[] = [];

async function runTest(
  testId: string,
  question: string,
  activeContext: ActiveModuleContext,
  expectedDataset: string,
  assertFunc: (plan: QueryPlan) => boolean,
  notes: string = ""
) {
  const plan = await intentRouter.parseIntent(question, activeContext);
  const passed = assertFunc(plan);

  testResults.push({
    testId,
    question,
    activePage: activeContext.module,
    expectedDataset,
    actualDatasets: plan.targetDatasets,
    intent: plan.intent,
    passed,
    notes
  });
}

async function runBenchmark() {
  console.log("=========================================================================");
  console.log("PDACopilot Cross-Page Intent Routing & Dataset Awareness Benchmark");
  console.log("=========================================================================\n");

  // Test 1: Available Datasets Overview
  await runTest(
    "Test 1",
    "Which transcriptomic datasets are available in PDAC BioPortal, and what biological question is each dataset designed to address?",
    sbrtPageContext,
    "all_datasets",
    plan => plan.intent === "list_available_datasets" && plan.targetDatasets.length === 4,
    "Queries global registry independently of active page"
  );

  // Test 2: KRAS tumor vs normal while on SBRT page
  await runTest(
    "Test 2 (From SBRT Page)",
    "What is the expression level of KRAS in PDAC tumor samples compared with normal pancreas?",
    sbrtPageContext,
    "tcga_gtex",
    plan => plan.targetDatasets.includes("tcga_gtex") && !plan.targetDatasets.includes("gse225767"),
    "MUST route to TCGA-GTEx tumor-vs-normal despite user being on SBRT page"
  );

  // Test 2 (Reverse): KRAS tumor vs normal while on TCGA page
  await runTest(
    "Test 2 (From TCGA Page)",
    "What is the expression level of KRAS in PDAC tumor samples compared with normal pancreas?",
    tcgaPageContext,
    "tcga_gtex",
    plan => plan.targetDatasets.includes("tcga_gtex") && !plan.targetDatasets.includes("gse225767"),
    "Routes to TCGA-GTEx on TCGA page"
  );

  // Test 3: Upregulated DEG query while on SBRT page
  await runTest(
    "Test 3",
    "Which genes are significantly upregulated in TCGA-PAAD compared with normal pancreas, using the default differential-expression criteria?",
    sbrtPageContext,
    "tcga_gtex",
    plan => plan.targetDatasets.includes("tcga_gtex") && !plan.targetDatasets.includes("gse225767"),
    "Routes to TCGA-GTEx DEGs from SBRT page"
  );

  // Test 4: SBRT changes while on TCGA page
  await runTest(
    "Test 4 (From TCGA Page)",
    "Which genes change after SBRT?",
    tcgaPageContext,
    "gse225767",
    plan => plan.targetDatasets.includes("gse225767") && !plan.targetDatasets.includes("tcga_gtex"),
    "MUST route to SBRT radiotherapy dataset despite user being on TCGA-GTEx page"
  );

  // Test 5: SBRT individual changes while on SBRT page
  await runTest(
    "Test 5",
    "Can the SBRT dataset determine whether an individual patient increased or decreased NFE2L2 expression after radiation?",
    sbrtPageContext,
    "gse225767",
    plan => plan.targetDatasets.includes("gse225767"),
    "Target dataset GSE225767 to explain unpaired cohort limitation"
  );

  // Test 6: Spatial query while on SBRT page
  await runTest(
    "Test 6",
    "Where is EPCAM spatially localized within PDAC tissue sections?",
    sbrtPageContext,
    "gse274103",
    plan => plan.targetDatasets.includes("gse274103"),
    "Routes to Spatial Visium dataset"
  );

  // Test 7: Single-nucleus lineage query while on SBRT page
  await runTest(
    "Test 7",
    "Which cell populations express EPCAM in the single-nucleus dataset?",
    sbrtPageContext,
    "gse202051",
    plan => plan.targetDatasets.includes("gse202051"),
    "Routes to Single-Nucleus dataset"
  );

  // Test 8: Cross-module synthesis query while on TCGA page
  await runTest(
    "Test 8",
    "Compare evidence for EPCAM expression across bulk, single-nucleus, and spatial datasets.",
    tcgaPageContext,
    "multiple_datasets",
    plan => plan.targetDatasets.length >= 3,
    "Routes to multimodal datasets for cross-module synthesis"
  );

  // Print Benchmark Results Table
  console.table(testResults.map(r => ({
    ID: r.testId,
    ActivePage: r.activePage,
    Expected: r.expectedDataset,
    RoutedDatasets: r.actualDatasets.join(", "),
    Intent: r.intent,
    Passed: r.passed ? "PASS ✓" : "FAIL ✗"
  })));

  const failedCount = testResults.filter(r => !r.passed).length;
  console.log(`\nBenchmark Summary: ${testResults.length - failedCount}/${testResults.length} Tests Passed`);

  if (failedCount > 0) {
    console.error(`❌ ${failedCount} benchmark tests failed!`);
    process.exit(1);
  } else {
    console.log("✅ All cross-page dataset routing benchmark tests passed successfully!");
  }
}

runBenchmark();
