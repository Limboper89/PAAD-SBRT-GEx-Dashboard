import { DATASET_REGISTRY, listAvailableDatasets } from "../src/components/ai/DatasetRegistry";
import { intentRouter } from "../src/components/ai/IntentRouter";
import { buildContextualPrompt, buildSystemPrompt } from "../src/components/ai/PromptBuilder";
import { formatBioPortalDirectResponse } from "../src/components/ai/ModelRouter";

async function testSpatialGrounding() {
  console.log("==========================================================================");
  console.log("  PDACopilot Spatial Feature Grounding & Spot Count Verification Test     ");
  console.log("==========================================================================\n");

  // 1. Verify DatasetRegistry spot counts
  const gse274103 = DATASET_REGISTRY.gse274103;
  console.log("--- 1. VERIFYING DATASET REGISTRY SPOT COUNTS ---");
  gse274103.groups.forEach(g => {
    console.log(`Group ${g.id}: ${g.sampleCount} spots (${g.description})`);
  });

  const expectedCounts: Record<string, number> = {
    "PDAC-p1": 4987,
    "PDAC-p2": 4380,
    "PDAC-p3": 4134,
    "PDAC-p4": 4983,
    "PDAC-p5": 4952
  };

  let countsPass = true;
  for (const group of gse274103.groups) {
    if (group.sampleCount !== expectedCounts[group.id]) {
      console.error(`ERROR: ${group.id} count mismatch! Expected ${expectedCounts[group.id]}, got ${group.sampleCount}`);
      countsPass = false;
    }
  }

  if (countsPass) {
    console.log("-> PASS: All 5 patient spatial spot counts in DatasetRegistry match exact validated values.\n");
  } else {
    console.error("-> FAIL: DatasetRegistry spot counts mismatch!\n");
  }

  // 2. Test Queries
  const testQueries = [
    "Where is KRT19 expressed in PDAC-p1?",
    "How many KRT19-positive spots are there in PDAC-p1?",
    "Compare KRT19 and KRT18 spatial expression.",
    "Where is EPCAM expressed in PDAC-p1?",
    "Where is PHGDH expressed in PDAC-p1?"
  ];

  console.log("--- 2. TESTING PDACopilot GROUNDING PROMPT BUILDER & DIRECT RESPONSES ---\n");

  const dummyContext = {
    module: "Spatial" as const,
    dataset: "gse274103",
    gene: "EPCAM",
    heatmapGenes: [],
    currentFigure: "fig1"
  };

  for (const q of testQueries) {
    console.log(`========================================================================`);
    console.log(`QUERY: "${q}"`);
    console.log(`========================================================================`);

    const plan = await intentRouter.parseIntent(q, dummyContext);
    const execResult = await intentRouter.executeRoute(plan);
    const { prompt } = buildContextualPrompt(q, dummyContext, execResult);
    const directResponse = formatBioPortalDirectResponse(plan, execResult);

    console.log(`[Intent]: ${plan.intent}`);
    console.log(`[Target Datasets]: ${plan.targetDatasets.join(", ")}`);
    console.log(`[Extracted Genes]: ${plan.entities.genes.join(", ") || "None"}`);

    if (q.includes("KRT19")) {
      const promptHasAbsentNotice = prompt.includes("ABSENT / UNAVAILABLE in GSE274103 Visium feature set") || prompt.includes("KRT19 is ABSENT");
      const directResponseHasAbsent = directResponse.includes("NOT available in the GSE274103 Visium FFPE feature set") || directResponse.includes("Feature Status");
      
      console.log(`[Grounding Prompt Contains ABSENT Notice]: ${promptHasAbsentNotice ? "PASS" : "FAIL"}`);
      console.log(`[Direct Response Contains ABSENT Notice]: ${directResponseHasAbsent ? "PASS" : "FAIL"}`);
      console.log(`\n--- PROMPT TOOL DATA TEXT PORTION ---`);
      const toolDataStart = prompt.indexOf("[PRIORITY 3: VERIFIED QUERY ENGINE DATA OUTPUT]");
      console.log(prompt.substring(toolDataStart));
      console.log(`\n--- DIRECT RESPONSE OUTPUT ---`);
      console.log(directResponse);
    } else {
      console.log(`\n--- PROMPT TOOL DATA TEXT PORTION ---`);
      const toolDataStart = prompt.indexOf("[PRIORITY 3: VERIFIED QUERY ENGINE DATA OUTPUT]");
      console.log(prompt.substring(toolDataStart));
      console.log(`\n--- DIRECT RESPONSE OUTPUT ---`);
      console.log(directResponse);
    }
    console.log("\n");
  }

  console.log("==========================================================================");
  console.log("  PDACopilot Grounding Test Complete                                      ");
  console.log("==========================================================================\n");
}

testSpatialGrounding().catch(console.error);
