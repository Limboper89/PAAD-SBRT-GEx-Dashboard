// test_pdacopilot_v13_dev.ts - Development-Set Alignment Test Suite for PDACopilot v1.3

import { intentRouter } from "../src/components/ai/IntentRouter";
import { queryEngine } from "../src/components/ai/QueryEngine";
import { buildContextualPrompt, buildQuestionIntent } from "../src/components/ai/PromptBuilder";
import { ActiveModuleContext } from "../src/components/ai/AIProvider";

interface DevTestResult {
  testId: number;
  description: string;
  selectedGene: string;
  question: string;
  expectedBehavior: string;
  actualResult: string;
  passed: boolean;
}

const devResults: DevTestResult[] = [];

function assertDev(
  testId: number,
  description: string,
  selectedGene: string,
  question: string,
  expectedBehavior: string,
  actualResult: string,
  passed: boolean
) {
  devResults.push({
    testId,
    description,
    selectedGene,
    question,
    expectedBehavior,
    actualResult,
    passed
  });
}

async function runDevAlignmentSuite() {
  console.log("=========================================================================");
  console.log("PDACopilot v1.3 Development-Set Alignment Verification Suite");
  console.log("=========================================================================\n");

  // Mock Context 1: Selected Gene = KRAS, Mounted Page = SBRT Bulk
  const contextKras: ActiveModuleContext = {
    module: "SBRT Bulk",
    dataset: "GSE225767",
    gene: "KRAS",
    heatmapGenes: ["KRAS", "NFE2L2"],
    currentFigure: "Volcano Plot",
    filters: { log2fcThreshold: 1.0, pValueThreshold: 0.05 }
  };

  // Test 1: Selected gene = KRAS, Question = "Which genes change after SBRT?"
  const q1 = "Which genes change after SBRT?";
  const plan1 = await intentRouter.parseIntent(q1, contextKras);
  const qIntent1 = buildQuestionIntent(q1, plan1, contextKras);
  const pass1 = plan1.intent === "differential_expression_list" && plan1.targetDatasets.includes("gse225767") && qIntent1.requiredOutputType === "gene_list_with_statistics";
  assertDev(
    1,
    "Selected gene = KRAS, Question = 'Which genes change after SBRT?'",
    "KRAS",
    q1,
    "Intent: differential_expression_list, Output: gene_list_with_statistics",
    `Intent: ${plan1.intent}, Output: ${qIntent1.requiredOutputType}`,
    pass1
  );

  // Test 2: Selected gene = KRAS, Question = "What cell populations are represented in the single-nucleus dataset?"
  const q2 = "What cell populations are represented in the single-nucleus dataset?";
  const plan2 = await intentRouter.parseIntent(q2, contextKras);
  const qIntent2 = buildQuestionIntent(q2, plan2, contextKras);
  const pass2 = plan2.intent === "cell_type_lineage_expression" && plan2.targetDatasets.includes("gse202051") && qIntent2.requiredOutputType === "cell_type_distribution";
  assertDev(
    2,
    "Selected gene = KRAS, Question = 'What cell populations are represented in the single-nucleus dataset?'",
    "KRAS",
    q2,
    "Intent: cell_type_lineage_expression, Output: cell_type_distribution",
    `Intent: ${plan2.intent}, Output: ${qIntent2.requiredOutputType}`,
    pass2
  );

  // Test 3: Selected gene = KRAS, Question = "What does spatial transcriptomics provide beyond bulk RNA-seq?"
  const q3 = "What does spatial transcriptomics provide beyond bulk RNA-seq?";
  const plan3 = await intentRouter.parseIntent(q3, contextKras);
  const qIntent3 = buildQuestionIntent(q3, plan3, contextKras);
  const pass3 = plan3.intent === "spatial_localization" && plan3.targetDatasets.includes("gse274103");
  assertDev(
    3,
    "Selected gene = KRAS, Question = 'What does spatial transcriptomics provide beyond bulk RNA-seq?'",
    "KRAS",
    q3,
    "Intent: spatial_localization, Target: gse274103",
    `Intent: ${plan3.intent}, Target: ${plan3.targetDatasets.join(", ")}`,
    pass3
  );

  // Test 4: Selected gene = KRAS, Question = "What biological processes are associated with PHGDH?"
  const q4 = "What biological processes are associated with PHGDH?";
  const plan4 = await intentRouter.parseIntent(q4, contextKras);
  const qIntent4 = buildQuestionIntent(q4, plan4, contextKras);
  const pass4 = plan4.entities.genes.includes("PHGDH") && !plan4.entities.genes.includes("KRAS") && qIntent4.requestedEntities.includes("PHGDH");
  assertDev(
    4,
    "Selected gene = KRAS, Question = 'What biological processes are associated with PHGDH?'",
    "KRAS",
    q4,
    "Requested Entity = PHGDH (KRAS suppressed as primary target)",
    `Requested Entities: [${qIntent4.requestedEntities.join(", ")}]`,
    pass4
  );

  // Test 5: Selected gene = KRAS, Question = "What datasets are available in PDAC BioPortal?"
  const q5 = "What datasets are available in PDAC BioPortal?";
  const plan5 = await intentRouter.parseIntent(q5, contextKras);
  const qIntent5 = buildQuestionIntent(q5, plan5, contextKras);
  const pass5 = plan5.intent === "list_available_datasets" && qIntent5.requiredOutputType === "dataset_registry_overview";
  assertDev(
    5,
    "Selected gene = KRAS, Question = 'What datasets are available in PDAC BioPortal?'",
    "KRAS",
    q5,
    "Intent: list_available_datasets, Output: dataset_registry_overview",
    `Intent: ${plan5.intent}, Output: ${qIntent5.requiredOutputType}`,
    pass5
  );

  // Mock Context 2: Selected Gene = PHGDH, Mounted Page = TCGA-GTEx
  const contextPhgdh: ActiveModuleContext = {
    module: "TCGA–GTEx",
    dataset: "tcga_gtex",
    gene: "PHGDH",
    heatmapGenes: ["PHGDH", "PSAT1", "PSPH"],
    currentFigure: "Bar Plot",
    filters: { log2fcThreshold: 1.5, pValueThreshold: 0.05 }
  };

  // Test 6: Selected gene = PHGDH, Question = "What is the expression of TP53 across datasets?"
  const q6 = "What is the expression of TP53 across datasets?";
  const plan6 = await intentRouter.parseIntent(q6, contextPhgdh);
  const qIntent6 = buildQuestionIntent(q6, plan6, contextPhgdh);
  const pass6 = plan6.entities.genes.includes("TP53") && !plan6.entities.genes.includes("PHGDH") && qIntent6.requestedEntities.includes("TP53");
  assertDev(
    6,
    "Selected gene = PHGDH, Question = 'What is the expression of TP53 across datasets?'",
    "PHGDH",
    q6,
    "Requested Entity = TP53 (PHGDH suppressed as primary target)",
    `Requested Entities: [${qIntent6.requestedEntities.join(", ")}]`,
    pass6
  );

  // Mock Context 3: Selected Gene = NFE2L2, Mounted Page = SBRT Bulk
  const contextNfe2l2: ActiveModuleContext = {
    module: "SBRT Bulk",
    dataset: "GSE225767",
    gene: "NFE2L2",
    heatmapGenes: ["NFE2L2"],
    currentFigure: "Volcano Plot",
    filters: { log2fcThreshold: 1.0, pValueThreshold: 0.05 }
  };

  // Test 7: Selected gene = NFE2L2, Question = "Compare PHGDH, PSAT1, and PSPH in tumor vs normal."
  const q7 = "Compare PHGDH, PSAT1, and PSPH in tumor vs normal.";
  const plan7 = await intentRouter.parseIntent(q7, contextNfe2l2);
  const qIntent7 = buildQuestionIntent(q7, plan7, contextNfe2l2);
  const pass7 = plan7.entities.genes.includes("PHGDH") && plan7.entities.genes.includes("PSAT1") && plan7.entities.genes.includes("PSPH") && !plan7.entities.genes.includes("NFE2L2");
  assertDev(
    7,
    "Selected gene = NFE2L2, Question = 'Compare PHGDH, PSAT1, and PSPH in tumor vs normal.'",
    "NFE2L2",
    q7,
    "Requested Entities = [PHGDH, PSAT1, PSPH] (NFE2L2 suppressed)",
    `Requested Entities: [${qIntent7.requestedEntities.join(", ")}]`,
    pass7
  );

  // Mock Context 4: Selected Page = TCGA-GTEx, Question = "What changed after SBRT?"
  const contextTcga: ActiveModuleContext = {
    module: "TCGA–GTEx",
    dataset: "tcga_gtex",
    gene: "KRAS",
    heatmapGenes: ["KRAS"],
    currentFigure: "Box Plot",
    filters: { log2fcThreshold: 1.5, pValueThreshold: 0.05 }
  };

  // Test 8: Selected page = TCGA-GTEx, Question = "What changed after SBRT?"
  const q8 = "What changed after SBRT?";
  const plan8 = await intentRouter.parseIntent(q8, contextTcga);
  const qIntent8 = buildQuestionIntent(q8, plan8, contextTcga);
  const pass8 = plan8.targetDatasets.includes("gse225767") && !plan8.targetDatasets.includes("tcga_gtex");
  assertDev(
    8,
    "Selected page = TCGA-GTEx, Question = 'What changed after SBRT?'",
    "KRAS",
    q8,
    "Target Dataset = GSE225767 (TCGA page context overridden by explicit SBRT query)",
    `Target Datasets: [${plan8.targetDatasets.join(", ")}]`,
    pass8
  );

  // Print Summary Table
  console.table(devResults.map(r => ({
    ID: r.testId,
    SelectedGene: r.selectedGene,
    Question: r.question,
    Expected: r.expectedBehavior,
    Actual: r.actualResult,
    Result: r.passed ? "PASS ✓" : "FAIL ✗"
  })));

  const failedCount = devResults.filter(r => !r.passed).length;
  console.log(`\nv1.3 Development Alignment Test Summary: ${devResults.length - failedCount}/${devResults.length} Tests Passed`);

  if (failedCount > 0) {
    console.error(`❌ ${failedCount} dev alignment tests failed!`);
    process.exit(1);
  } else {
    console.log("✅ All v1.3 development alignment tests passed successfully!");
  }
}

runDevAlignmentSuite();
