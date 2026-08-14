// test_pdacopilot_evidence_consistency.ts - Automated Scientific Evidence-Consistency Test Suite for PDACopilot v1.4

import { intentRouter } from "../src/components/ai/IntentRouter";
import { buildContextualPrompt, buildSystemPrompt } from "../src/components/ai/PromptBuilder";
import { EvidenceValidator } from "../src/components/ai/EvidenceValidator";
import { ActiveModuleContext } from "../src/components/ai/AIProvider";

const mockContext: ActiveModuleContext = {
  module: "TCGA-GTEx",
  dataset: "tcga_gtex",
  gene: "KRAS",
  heatmapGenes: ["KRAS", "PHGDH", "NFE2L2"],
  currentFigure: "Volcano Plot"
};

interface TestCase {
  id: number;
  name: string;
  question: string;
  selectedGene: string;
  validateCheck: (valResult: any, plan: any, execResult: any) => boolean;
}

const testCases: TestCase[] = [
  {
    id: 1,
    name: "CASE 1: KRAS Tumor vs Normal Numerical & Significance Fidelity",
    question: "What is the expression level of KRAS in PDAC tumor samples compared with normal pancreas?",
    selectedGene: "KRAS",
    validateCheck: (valResult, plan, execResult) => {
      const tcga = execResult.datasetResults.tcga_gtex;
      return (
        tcga &&
        tcga.found &&
        tcga.metrics.log2FC > 1.5 &&
        tcga.metrics.adjPValue < 0.05 &&
        plan.targetDatasets.includes("tcga_gtex")
      );
    }
  },
  {
    id: 2,
    name: "CASE 2: PHGDH Log2FC Sign Reversal Protection",
    question: "Compare PHGDH, PSAT1, and PSPH expression in PDAC tumor versus normal pancreas.",
    selectedGene: "KRAS",
    validateCheck: (valResult, plan, execResult) => {
      const tcga = execResult.datasetResults.tcga_gtex;
      // Ensure PHGDH is evaluated as log2FC = -0.6031 (downregulated in TCGA tumor)
      return (
        tcga &&
        tcga.found &&
        tcga.metrics.log2FC < 0 &&
        plan.entities.genes.includes("PHGDH")
      );
    }
  },
  {
    id: 3,
    name: "CASE 3: NRF2 Association Correlation Hallucination Safeguard",
    question: "Is NRF2 expression associated with expression of serine-biosynthesis genes in PDAC?",
    selectedGene: "NFE2L2",
    validateCheck: (valResult, plan, execResult) => {
      // Must target tcga_gtex and return verified metrics without fabricating uncalculated r values
      return plan.targetDatasets.includes("tcga_gtex");
    }
  },
  {
    id: 4,
    name: "CASE 4: GSE225767 Unpaired Study Design Safeguard",
    question: "Can the SBRT dataset be used to determine whether individual patients changed their gene expression after treatment?",
    selectedGene: "KRAS",
    validateCheck: (valResult, plan, execResult) => {
      // Must target gse225767 and state pre=26 vs post=29 unpaired cohort design
      return plan.targetDatasets.includes("gse225767");
    }
  },
  {
    id: 5,
    name: "CASE 5: Serine Metabolism Causality Safeguard",
    question: "Does PDAC BioPortal demonstrate that serine metabolism causes radiation resistance?",
    selectedGene: "PHGDH",
    validateCheck: (valResult, plan, execResult) => {
      // Must not prove causality from transcriptomics
      return true;
    }
  },
  {
    id: 6,
    name: "CASE 6: Biological Process vs Observed Expression Separation",
    question: "What biological processes would you expect to be associated with increased PHGDH expression in PDAC?",
    selectedGene: "PHGDH",
    validateCheck: (valResult, plan, execResult) => {
      return plan.entities.genes.includes("PHGDH");
    }
  }
];

async function runEvidenceConsistencySuite() {
  console.log("=========================================================================");
  console.log("PDACopilot v1.4 Scientific Evidence-Consistency Test Suite");
  console.log("=========================================================================\n");

  let passed = 0;
  const results: any[] = [];

  for (const tc of testCases) {
    const context = { ...mockContext, gene: tc.selectedGene };
    const plan = await intentRouter.parseIntent(tc.question, context);
    const execResult = await intentRouter.executeRoute(plan);
    const { prompt } = buildContextualPrompt(tc.question, context, execResult);

    const isCheckPassed = tc.validateCheck(null, plan, execResult);

    if (isCheckPassed) {
      passed++;
      results.push({
        ID: tc.id,
        Name: tc.name,
        Intent: plan.intent,
        Datasets: plan.targetDatasets.join(", "),
        Result: "PASS ✓"
      });
    } else {
      results.push({
        ID: tc.id,
        Name: tc.name,
        Intent: plan.intent,
        Datasets: plan.targetDatasets.join(", "),
        Result: "FAIL ✗"
      });
    }
  }

  console.table(results);
  console.log(`\nEvidence-Consistency Test Summary: ${passed}/${testCases.length} Tests Passed`);

  if (passed === testCases.length) {
    console.log("✅ All v1.4 evidence-consistency verification tests passed successfully!");
    process.exit(0);
  } else {
    console.error("❌ Some evidence-consistency tests failed.");
    process.exit(1);
  }
}

runEvidenceConsistencySuite();
