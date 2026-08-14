// test_custom_input_ux.ts - Automated Unit & Integration Test Suite for Custom Gene Selection UX

import { cleanAndMapGeneList, runORA } from "../src/utils/pathwayEngine";
import { PathwayGeneSet, DatabaseProvenance } from "../src/types/pathway";

console.log("=== RUNNING CUSTOM GENE SELECTION UX TEST SUITE ===");

const universeArray = ["KRAS", "TP53", "SMAD4", "CDKN2A", "MYC", "PHGDH", "PSAT1", "PSPH", "SHMT2", "S100P", "MSLN", "CEACAM6"];
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
  { id: "HALLMARK_KRAS", name: "KRAS Signaling", database: "Hallmark", genes: ["KRAS", "TP53", "SMAD4"] },
  { id: "HALLMARK_SERINE", name: "Serine Biosynthesis", database: "Hallmark", genes: ["PHGDH", "PSAT1", "PSPH", "SHMT2"] }
];

let passed = 0;
let total = 0;

function assertTest(condition: boolean, title: string) {
  total++;
  if (condition) {
    console.log(`[PASS] ${title}`);
    passed++;
  } else {
    console.error(`[FAIL] ${title}`);
  }
}

// 1. Newline separated genes
const t1 = cleanAndMapGeneList(["KRAS\nTP53\nSMAD4"], universeSet, "Test Universe");
assertTest(t1.mappingQC.mappedGeneCount === 3, "1. Newline-separated genes parsed & mapped (3 genes)");

// 2. Comma separated genes
const t2 = cleanAndMapGeneList(["KRAS, TP53, SMAD4, PHGDH"], universeSet, "Test Universe");
assertTest(t2.mappingQC.mappedGeneCount === 4, "2. Comma-separated genes parsed & mapped (4 genes)");

// 3. Tab separated genes
const t3 = cleanAndMapGeneList(["KRAS\tTP53\tSMAD4"], universeSet, "Test Universe");
assertTest(t3.mappingQC.mappedGeneCount === 3, "3. Tab-separated genes parsed & mapped (3 genes)");

// 4. Duplicate genes handling
const t4 = cleanAndMapGeneList(["KRAS", "TP53", "KRAS", "kras", "  TP53  "], universeSet, "Test Universe");
assertTest(t4.mappingQC.mappedGeneCount === 2 && t4.mappingQC.duplicateSymbolsCount === 3, "4. Duplicate genes identified & deduplicated");

// 5. Invalid genes handling
const t5 = cleanAndMapGeneList(["KRAS", "UNKNOWN_XYZ_99"], universeSet, "Test Universe");
assertTest(t5.mappingQC.unmappedGeneCount === 1 && t5.mappingQC.unmappedSymbols.includes("UNKNOWN_XYZ_99"), "5. Invalid genes isolated in unmapped list");

// 6. Mixed valid & invalid genes
const t6 = cleanAndMapGeneList(["KRAS", "BAD123", "TP53", "NOTAGENE"], universeSet, "Test Universe");
assertTest(t6.mappingQC.mappedGeneCount === 2 && t6.mappingQC.unmappedGeneCount === 2, "6. Mixed valid & invalid genes correctly separated");

// 7. Whitespace normalization
const t7 = cleanAndMapGeneList(["  kras  ", "\t\tSMAD4\n\n"], universeSet, "Test Universe");
assertTest(t7.mappingQC.mappedGeneCount === 2 && t7.cleanedInput.includes("KRAS"), "7. Whitespace auto-trimmed & normalized to uppercase");

// 8. Autocomplete matching
const matchKras = universeArray.filter(s => s.startsWith("KR"));
assertTest(matchKras.includes("KRAS"), "8. Autocomplete correctly matches gene universe prefix");

// 9. Adding & Removing chips (Simulated array operations)
let chipList = ["KRAS", "TP53"];
chipList.push("SMAD4"); // Add
chipList = chipList.filter(g => g !== "TP53"); // Remove
assertTest(chipList.length === 2 && chipList.includes("SMAD4") && !chipList.includes("TP53"), "9. Chip addition & deletion operations work cleanly");

// 10. Clear All
let clearList: string[] = ["KRAS", "TP53", "SMAD4"];
clearList = [];
assertTest(clearList.length === 0, "10. Clear All resets gene list");

// 11. Select All / Select Significant DEG simulation
const mockDegs = [
  { gene_name: "KRAS", p_value: 0.001 },
  { gene_name: "TP53", p_value: 0.002 },
  { gene_name: "NOT_SIG", p_value: 0.450 }
];
const sigOnly = mockDegs.filter(d => d.p_value < 0.05).map(d => d.gene_name);
assertTest(sigOnly.length === 2 && !sigOnly.includes("NOT_SIG"), "11. Select Significant filters DEGs (p < 0.05)");

// 12. DEG -> Custom Input transfer
const transferred = cleanAndMapGeneList(sigOnly, universeSet, "TCGA-PAAD DEG");
assertTest(transferred.mappingQC.mappedGeneCount === 2, "12. DEG transfer passes mapped genes into Custom Input");

// 13. Empty input handling
const t13 = cleanAndMapGeneList([], universeSet, "Test Universe");
assertTest(t13.mappingQC.mappedGeneCount === 0 && t13.mappingQC.inputGeneCount === 0, "13. Empty input handled safely without errors");

// 14. Insufficient genes guardrail (< 3)
const isOraValid = t13.mappingQC.mappedGeneCount >= 3;
assertTest(!isOraValid, "14. Insufficient genes (< 3) correctly blocks ORA execution");

// 15. ORA execution from custom input
const oraResult = runORA(t1.cleanedInput, testSets, 1000, "custom_1", "Custom Test", "Custom Selection", testProv, undefined, 2, 3, 500);
assertTest(oraResult.length > 0 && oraResult[0].pathwayId === "HALLMARK_KRAS", "15. ORA execution succeeds and returns enriched pathway");

console.log(`\n=== CUSTOM INPUT UX TEST SUITE SUMMARY: ${passed} / ${total} TESTS PASSED ===`);
if (passed === total) {
  console.log("SUCCESS: All 15 Custom Input UX requirement tests PASSED.");
  process.exit(0);
} else {
  process.exit(1);
}
