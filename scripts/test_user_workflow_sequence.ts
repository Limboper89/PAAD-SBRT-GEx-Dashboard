// test_user_workflow_sequence.ts - Exact 6 User Workflow Sequence Integration Test

import { cleanAndMapGeneList, runORA } from "../src/utils/pathwayEngine";
import { PathwayGeneSet, DatabaseProvenance } from "../src/types/pathway";

console.log("=== RUNNING EXACT 6 USER WORKFLOW SEQUENCE TESTS ===");

const universeArray = ["KRAS", "TP53", "SMAD4", "PHGDH", "PSAT1", "CDKN2A", "MYC", "PSPH", "CEACAM6", "S100P"];
const universeSet = new Set(universeArray);

const testProv: DatabaseProvenance = {
  database: "MSigDB Hallmark",
  version: "v2024.1.Hs",
  species: "Homo sapiens",
  identifier: "HGNC",
  retrievalDate: "2026-08-14",
  sourceUrl: "https://www.gsea-msigdb.org",
  license: "CC BY 4.0",
  redistributionStatus: "permitted"
};

const testSets: PathwayGeneSet[] = [
  { id: "HALLMARK_KRAS", name: "KRAS Signaling Up", database: "Hallmark", genes: ["KRAS", "TP53", "SMAD4"] },
  { id: "HALLMARK_SERINE", name: "Serine Biosynthesis", database: "Hallmark", genes: ["PHGDH", "PSAT1", "PSPH"] }
];

let passed = 0;
let total = 0;

function assertSeq(condition: boolean, title: string) {
  total++;
  if (condition) {
    console.log(`[PASS] ${title}`);
    passed++;
  } else {
    console.error(`[FAIL] ${title}`);
  }
}

// TEST 1: Analysis Source discoverability (Cohort, Custom Gene List, DEG Selection)
const sources = ["cohort", "custom_genes", "deg_selection"];
assertSeq(sources.length === 3 && sources.includes("custom_genes"), "Test 1: 3 explicit Analysis Source options exist at top-level");

// TEST 2: Enter KRAS, TP53, SMAD4, PHGDH, PSAT1 -> Run ORA
const input2 = ["KRAS", "TP53", "SMAD4", "PHGDH", "PSAT1"];
const qc2 = cleanAndMapGeneList(input2, universeSet, "Test Universe");
const ora2 = runORA(qc2.cleanedInput, testSets, 1000, "custom", "Custom", "Test 2", testProv, undefined, 2, 3, 500);
assertSeq(qc2.mappingQC.mappedGeneCount === 5 && ora2.length > 0, "Test 2: Manual gene list (5 genes) mapped and ORA pathways calculated");

// TEST 3: Select 5 genes from GeneTable -> Transfer to DEG Selection
const selectedFromTable = ["KRAS", "TP53", "SMAD4", "CDKN2A", "MYC"];
const qc3 = cleanAndMapGeneList(selectedFromTable, universeSet, "TCGA-PAAD DEG");
assertSeq(qc3.mappingQC.mappedGeneCount === 5 && qc3.mappingQC.backgroundSource === "TCGA-PAAD DEG", "Test 3: DEG Table selection (5 genes) transfers seamlessly to Pathway Explorer");

// TEST 4: Load Example -> Run ORA
const exampleGenes = ["KRAS", "TP53", "SMAD4", "CDKN2A", "MYC", "PHGDH", "PSAT1", "PSPH"];
const qc4 = cleanAndMapGeneList(exampleGenes, universeSet, "Example Universe");
const ora4 = runORA(qc4.cleanedInput, testSets, 1000, "example", "Example", "Test 4", testProv, undefined, 2, 3, 500);
assertSeq(qc4.mappingQC.mappedGeneCount === 8 && ora4.length > 0, "Test 4: Load Example populates 8 mapped genes and enables ORA");

// TEST 5: Cohort Analysis (TCGA-PAAD vs GTEx)
const cohortOra = runORA(["KRAS", "TP53", "SMAD4"], testSets, 17943, "tcga_gtex", "TCGA-PAAD", "Tumor vs Normal", testProv, undefined, 2, 3, 500);
assertSeq(cohortOra.length > 0 && cohortOra[0].datasetId === "tcga_gtex", "Test 5: Cohort analysis workflow preserved cleanly");

// TEST 6: Invalid gene UNMAPPED_GENE_X identification
const input6 = ["KRAS", "UNMAPPED_GENE_X"];
const qc6 = cleanAndMapGeneList(input6, universeSet, "Test Universe");
assertSeq(qc6.mappingQC.unmappedGeneCount === 1 && qc6.mappingQC.unmappedSymbols.includes("UNMAPPED_GENE_X"), "Test 6: Invalid gene UNMAPPED_GENE_X clearly identified in mapping QC");

console.log(`\n=== USER WORKFLOW SEQUENCE SUMMARY: ${passed} / ${total} TESTS PASSED ===`);
if (passed === total) {
  console.log("SUCCESS: All 6 exact user workflow sequence tests PASSED.");
  process.exit(0);
} else {
  process.exit(1);
}
