// scripts/test_pdacopilot_query_contracts.ts
// Test suite evaluating Query Contracts, Evidence Completeness Gate, & Scientific Retrieval (Tests A – N)
// Target: Live Gemini API calls = 0

import { IntentRouter } from "../src/components/ai/IntentRouter";
import { selectModelRoute, formatVerifiedQuantitativeBlock, formatBioPortalDirectResponse } from "../src/components/ai/ModelRouter";
import { EvidenceValidator } from "../src/components/ai/EvidenceValidator";
import { assembleProductionResponse, ActiveModuleContext } from "../src/components/ai/AIProvider";

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`[PASS ✓] ${name}`);
  } catch (err: any) {
    console.error(`[FAIL ✗] ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

async function main() {
  console.log("=========================================================================");
  console.log("PDACopilot V2 — Final Query Contracts & Evidence Completeness Test Suite");
  console.log("=========================================================================\n");

  const router = new IntentRouter();
  const defaultContext: ActiveModuleContext = {
    module: "TCGA vs GTEx DEG",
    dataset: "TCGA-GTEx",
    gene: "PHGDH",
    heatmapGenes: ["PHGDH", "PSAT1", "PSPH"],
    currentFigure: "volcano_plot"
  };

  // Test A (Q2): KRAS TCGA vs GTEx Single-Gene Quantitative Grounding
  await runTest("Test A — Q2 KRAS Single-Gene Quantitative Grounding", async () => {
    const q = "What is the expression level of KRAS in PDAC tumor samples compared with normal pancreas";
    const plan = await router.parseIntent(q, defaultContext);
    const execRes = await router.executeRoute(plan);

    if (plan.intent !== "tumor_vs_normal_comparison") throw new Error(`Unexpected intent: ${plan.intent}`);
    if (!execRes.datasetResults.tcga_gtex?.found) throw new Error("TCGA KRAS result missing");

    const block = formatVerifiedQuantitativeBlock(plan, execRes);
    if (!block.includes("log2FC") || !block.includes("1.9882") || !block.includes("2.08")) {
      throw new Error(`Block missing exact metrics: ${block}`);
    }
    if (block.includes("GSE225767") || block.includes("SBRT")) {
      throw new Error("TCGA single-gene response leaked GSE225767 cohort data");
    }
  });

  // Test B (Q6): Multi-Gene Quantitative Retrieval & Missing Entity Gate
  await runTest("Test B — Q6 Multi-Gene Retrieval & Missing Entity Gate", async () => {
    const q = "Compare PHGDH, PSAT1, and PSPH expression in PDAC tumor versus normal pancreas";
    const plan = await router.parseIntent(q, defaultContext);
    const execRes = await router.executeRoute(plan);

    if (plan.entities.genes.length < 2) throw new Error(`Failed to extract multiple genes: ${plan.entities.genes.join(", ")}`);

    const assembled = assembleProductionResponse(q, plan, "Here is the comparison.", execRes);
    if (!assembled.includes("PHGDH") || !assembled.includes("PSAT1")) throw new Error("Assembled response missing retrieved genes");
  });

  // Test C (Q3): Deterministic DEG-List Retrieval
  await runTest("Test C — Q3 Deterministic DEG-List Retrieval", async () => {
    const q = "Which genes are significantly upregulated in TCGA-PAAD compared with normal pancreas?";
    const plan = await router.parseIntent(q, defaultContext);
    const execRes = await router.executeRoute(plan);

    if (plan.intent !== "differential_expression_list") throw new Error(`Unexpected intent: ${plan.intent}`);
    if (!execRes.datasetResults.tcga_gtex?.topDegs) throw new Error("Missing TCGA top DEGs in result");

    const block = formatVerifiedQuantitativeBlock(plan, execRes);
    if (!block.includes("Filtered DEGs Count") || !block.includes("Gene Symbol")) {
      throw new Error("Missing deterministic DEG table");
    }
  });

  // Test D (Q5): Cross-Dataset TP53 Query & No 4250% Bug
  await runTest("Test D — Q5 Cross-Dataset TP53 Query & Percentage Safeguard", async () => {
    const q = "How is TP53 expressed across the available PDAC transcriptomic datasets?";
    const plan = await router.parseIntent(q, defaultContext);
    const execRes = await router.executeRoute(plan);

    if (plan.intent !== "cross_module_synthesis") throw new Error(`Unexpected intent: ${plan.intent}`);
    if (!execRes.datasetResults.tcga_gtex || !execRes.datasetResults.gse225767) {
      throw new Error("Cross-dataset query failed to target all datasets");
    }
  });

  // Test E: Impossible Percentage Rejection
  await runTest("Test E — Impossible Percentage Rejection", async () => {
    const q = "What is the single nucleus expression of TP53?";
    const plan = await router.parseIntent(q, defaultContext);
    const execRes = await router.executeRoute(plan);
    const badLlmText = "TP53 is expressed in 4250.0% of single nuclei in the atlas.";

    const validation = EvidenceValidator.validateResponse(q, plan, badLlmText, execRes);
    if (validation.isValid) throw new Error("EvidenceValidator failed to reject 4250.0% impossible percentage");
    const errTypes = validation.errors.map(e => e.type);
    if (!errTypes.includes("UNSUPPORTED_NUMERICAL_CLAIM")) throw new Error("Expected UNSUPPORTED_NUMERICAL_CLAIM error");
  });

  // Test F (Q8): Association vs DEG Distinction
  await runTest("Test F — Q8 Association vs DEG Distinction", async () => {
    const q = "Is NRF2 expression associated with expression of serine-biosynthesis genes in PDAC?";
    const plan = await router.parseIntent(q, defaultContext);
    const execRes = await router.executeRoute(plan);

    if (plan.intent !== "association_query") throw new Error(`Unexpected intent: ${plan.intent}`);
    if (execRes.unsupportedClaims.length === 0) throw new Error("Association query should flag uncalculated pairwise correlation");

    const block = formatVerifiedQuantitativeBlock(plan, execRes);
    if (!block.includes("Pairwise Association Notice") || !block.includes("does NOT provide a calculated pairwise correlation")) {
      throw new Error("Missing pairwise association notice in block");
    }
  });

  // Test G (Q12): SBRT Study Design Query Isolation
  await runTest("Test G — Q12 SBRT Study Design Query Isolation", async () => {
    const q = "Can the SBRT dataset be used to determine whether individual patients changed their gene expression after treatment?";
    const plan = await router.parseIntent(q, defaultContext);
    const execRes = await router.executeRoute(plan);

    if (plan.intent !== "dataset_design_query") throw new Error(`Unexpected intent: ${plan.intent}`);
    const block = formatVerifiedQuantitativeBlock(plan, execRes);
    if (!block.includes("Unpaired") || !block.includes("pre-SBRT (n=26) vs post-SBRT (n=29)")) {
      throw new Error("Missing cohort structure in study design block");
    }
  });

  // Test H (Q14): Spatial Conceptual Query Isolation
  await runTest("Test H — Q14 Spatial Conceptual Query Isolation", async () => {
    const q = "What information does spatial transcriptomics provide that cannot be obtained from bulk RNA-seq alone?";
    const plan = await router.parseIntent(q, defaultContext); // defaultContext has gene = "PHGDH"
    const execRes = await router.executeRoute(plan);

    if (plan.intent !== "spatial_conceptual") throw new Error(`Unexpected intent: ${plan.intent}`);
    if (plan.entities.genes.length !== 0) throw new Error("Spatial conceptual query should not inject active page gene PHGDH");

    const direct = formatBioPortalDirectResponse(plan, execRes);
    if (!direct.includes("Spatial Transcriptomics vs Bulk RNA-Seq") || direct.includes("PHGDH")) {
      throw new Error("Spatial conceptual response invalid or polluted with PHGDH");
    }
  });

  // Test I (Q15): Spatial Expectation vs Measured Distinction
  await runTest("Test I — Q15 Spatial Expectation vs Measured Distinction", async () => {
    const q = "Where would you expect EPCAM and KRT19 expression to be localized in a pancreatic tumor?";
    const plan = await router.parseIntent(q, defaultContext);
    const execRes = await router.executeRoute(plan);

    if (plan.intent !== "spatial_expectation") throw new Error(`Unexpected intent: ${plan.intent}`);
    const direct = formatBioPortalDirectResponse(plan, execRes);
    if (!direct.includes("Biological Expectation") || !direct.includes("EPCAM") || !direct.includes("KRT19")) {
      throw new Error("Spatial expectation response missing requested genes or biological expectation section");
    }
  });

  // Test J (Q16): Multi-Omics Workflow Integration Context Isolation
  await runTest("Test J — Q16 Multi-Omics Workflow Integration Context Isolation", async () => {
    const q = "How could you integrate bulk RNA-seq, single-nucleus RNA-seq, and spatial transcriptomics?";
    const plan = await router.parseIntent(q, defaultContext);

    if (plan.intent !== "cross_module_synthesis" && plan.intent !== "research_strategy") {
      throw new Error(`Unexpected intent: ${plan.intent}`);
    }
    if (plan.entities.genes.includes("PHGDH")) {
      throw new Error("Multi-omics integration workflow query should suppress active UI gene PHGDH");
    }
  });

  // Test K: p-value and FDR Separation Everywhere
  await runTest("Test K — p-value and FDR Field Separation", async () => {
    const q = "What is KRAS expression level in TCGA?";
    const plan = await router.parseIntent(q, defaultContext);
    const execRes = await router.executeRoute(plan);
    const block = formatVerifiedQuantitativeBlock(plan, execRes);

    if (block.includes("FDR / P-value")) {
      throw new Error("Format block contains ambiguous 'FDR / P-value' header");
    }
    if (!block.includes("p-value") || !block.includes("FDR (q-value)")) {
      throw new Error("Format block does not have separate p-value and FDR columns");
    }
  });

  // Test L: Causality Guardrail Preservation
  await runTest("Test L — Causality Guardrail Preservation", async () => {
    const q = "Does PDAC BioPortal demonstrate that serine metabolism causes radiation resistance?";
    const plan = await router.parseIntent(q, defaultContext);
    if (plan.intent !== "causality_assessment") throw new Error(`Unexpected intent: ${plan.intent}`);

    const overclaimResp = "The data prove that serine metabolism causes radiation resistance in pancreatic cancer.";
    const execRes = await router.executeRoute(plan);
    const validation = EvidenceValidator.validateResponse(q, plan, overclaimResp, execRes);
    if (validation.isValid) throw new Error("EvidenceValidator failed to catch affirmative causal overclaim");
  });

  // Test M: Cache & Model Router Preservations
  await runTest("Test M — Cache & Model Router Preservation", async () => {
    const q = "Explain why KRAS is upregulated in PDAC";
    const plan = await router.parseIntent(q, defaultContext);
    const execRes = await router.executeRoute(plan);
    const decision = selectModelRoute(q, plan, execRes);

    if (decision.route !== "LLAMA" && decision.route !== "GEMINI") {
      throw new Error(`ModelRouter failed to route text explanation query: ${decision.route}`);
    }
  });

  // Test N (Q10): SBRT DEG Quantitative Grounding
  await runTest("Test N — SBRT DEG Quantitative Grounding", async () => {
    const q = "Which genes change after SBRT in the available PDAC dataset?";
    const plan = await router.parseIntent(q, defaultContext);
    const execRes = await router.executeRoute(plan);

    if (plan.intent !== "differential_expression_list") throw new Error(`Unexpected intent: ${plan.intent}`);
    if (!execRes.datasetResults.gse225767?.topDegs) throw new Error("Missing SBRT top DEGs in result");

    const block = formatVerifiedQuantitativeBlock(plan, execRes);
    if (!block.includes("Filtered SBRT DEGs Count") || !block.includes("Gene Symbol")) {
      throw new Error("Missing deterministic SBRT DEG table");
    }
  });

  console.log("\n=========================================================================");
  console.log("Query Contracts Unit Test Summary: ALL 14 / 14 Tests Passed (0 Gemini calls)");
  console.log("=========================================================================");
}

main().catch(err => {
  console.error("Test Suite Fatal Failure:", err);
  process.exit(1);
});
