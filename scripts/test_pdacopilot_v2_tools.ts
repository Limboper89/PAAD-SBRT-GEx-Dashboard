// test_pdacopilot_v2_tools.ts - PDACopilot V2 Declarative Tool Registry & Pathway Engine Integration Test Suite

import { TOOL_REGISTRY, getToolDefinition } from "../src/components/ai/ToolRegistry";
import { intentRouter } from "../src/components/ai/IntentRouter";
import { queryEngine } from "../src/components/ai/QueryEngine";
import { EvidenceValidator } from "../src/components/ai/EvidenceValidator";
import { ActiveModuleContext } from "../src/components/ai/AIProvider";

const defaultSbrtContext: ActiveModuleContext = {
  module: "SBRT Bulk",
  dataset: "GSE225767",
  gene: "NFE2L2",
  heatmapGenes: ["NFE2L2", "SLC1A5", "PHGDH", "PSPH"],
  currentFigure: "Volcano Plot",
  filters: { log2fcThreshold: 1.0, pValueThreshold: 0.05 }
};

const defaultKrasContext: ActiveModuleContext = {
  module: "TCGA-PAAD",
  dataset: "TCGA-PAAD",
  gene: "KRAS",
  heatmapGenes: ["KRAS", "TP53"],
  currentFigure: "Boxplot",
  filters: { log2fcThreshold: 1.5, pValueThreshold: 0.05 }
};

async function runV2ToolTests() {
  console.log("=========================================================================");
  console.log("PDACopilot V2 Declarative Tool Registry & Pathway Integration Test Suite");
  console.log("=========================================================================\n");

  const results: any[] = [];

  // TEST 1: Tool Registry Schema Integrity
  const gseaTool = getToolDefinition("pathway_gsea");
  const isGseaValid = gseaTool !== null && gseaTool.requiredParameters.includes("datasetId") && gseaTool.actionType === "OPEN_GSEA";
  results.push({
    ID: 1,
    Test: "Tool Registry GSEA Schema",
    Expected: "Declarative GSEA tool definition present with OPEN_GSEA action",
    Actual: isGseaValid ? "GSEA tool present with OPEN_GSEA action" : "Tool missing",
    Result: isGseaValid ? "PASS ✓" : "FAIL ✗"
  });

  // TEST 2: GSEA Intent Routing
  const gseaPlan = await intentRouter.parseIntent("Run GSEA on the genes upregulated after SBRT using Hallmark.", defaultSbrtContext);
  const isGseaRouted = gseaPlan.intent === "pathway_gsea" && gseaPlan.targetDatasets.includes("gse225767");
  results.push({
    ID: 2,
    Test: "GSEA Intent Routing",
    Expected: "intent = pathway_gsea, targetDataset = [gse225767]",
    Actual: `intent = ${gseaPlan.intent}, targetDataset = [${gseaPlan.targetDatasets.join(", ")}]`,
    Result: isGseaRouted ? "PASS ✓" : "FAIL ✗"
  });

  // TEST 3: ORA Intent Routing
  const oraPlan = await intentRouter.parseIntent("What pathways are enriched among upregulated genes in TCGA-PAAD?", defaultSbrtContext);
  const isOraRouted = oraPlan.intent === "pathway_ora" && oraPlan.targetDatasets.includes("tcga_gtex");
  results.push({
    ID: 3,
    Test: "ORA Intent Routing",
    Expected: "intent = pathway_ora, targetDataset = [tcga_gtex]",
    Actual: `intent = ${oraPlan.intent}, targetDataset = [${oraPlan.targetDatasets.join(", ")}]`,
    Result: isOraRouted ? "PASS ✓" : "FAIL ✗"
  });

  // TEST 4: Context Anchoring Protection (KRAS Context Reset)
  const cellTypePlan = await intentRouter.parseIntent("Which genes identify epithelial cells?", defaultKrasContext);
  const isKrasSuppressed = !cellTypePlan.entities.genes.includes("KRAS");
  results.push({
    ID: 4,
    Test: "Context Anchoring Reset",
    Expected: "KRAS context gene suppressed for explicit cell lineage query",
    Actual: `Entities: [${cellTypePlan.entities.genes.join(", ")}]`,
    Result: isKrasSuppressed ? "PASS ✓" : "FAIL ✗"
  });

  // TEST 5: QueryEngine GSEA Execution via pathwayEngine
  const gseaResult = await queryEngine.queryPathwayGSEA("gse225767", "All", 0.05);
  const isGseaExecValid = gseaResult.success && Array.isArray(gseaResult.pathways) && gseaResult.evidenceObject?.source === "BioPortal";
  results.push({
    ID: 5,
    Test: "QueryEngine GSEA Execution",
    Expected: "Returns GSEA pathways via pathwayEngine.ts with EvidenceObject",
    Actual: `Success: ${gseaResult.success}, Total Enriched: ${gseaResult.totalEnrichedPathways}, Source: ${gseaResult.evidenceObject?.source}`,
    Result: isGseaExecValid ? "PASS ✓" : "FAIL ✗"
  });

  // TEST 6: QueryEngine Cross-Study Comparison Execution
  const crossResult = await queryEngine.queryCrossStudyComparison(["PHGDH", "PSAT1", "PSPH"]);
  const isCrossValid = crossResult.success && crossResult.tcgaResults.length > 0 && crossResult.sbrtResults.length > 0 && crossResult.evidenceObject?.analysisType === "cross_study";
  results.push({
    ID: 6,
    Test: "QueryEngine Cross-Study Execution",
    Expected: "Executes TCGA vs SBRT comparative synthesis with EvidenceObject",
    Actual: `Success: ${crossResult.success}, TCGA count: ${crossResult.tcgaResults.length}, SBRT count: ${crossResult.sbrtResults.length}`,
    Result: isCrossValid ? "PASS ✓" : "FAIL ✗"
  });

  console.table(results);
  const passedCount = results.filter(r => r.Result.includes("PASS")).length;
  console.log(`V2 Tool & Pathway Test Summary: ${passedCount}/${results.length} Tests Passed`);

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

runV2ToolTests();
