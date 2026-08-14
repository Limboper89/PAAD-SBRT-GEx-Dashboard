// test_custom_input_mapping.ts - Edge Case Mapping QC & ORA Test Suite

import { cleanAndMapGeneList, runORA } from "../src/utils/pathwayEngine";
import { PathwayGeneSet, DatabaseProvenance } from "../src/types/pathway";

console.log("=== CUSTOM INPUT MAPPING & EDGE CASE TEST SUITE ===");

const universeSet = new Set(["S100P", "MSLN", "CEACAM6", "NFE2L2", "PHGDH", "PSAT1", "HK2", "LDHA", "KRAS", "TP53"]);

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
  { id: "SET1", name: "Set 1", database: "Hallmark", genes: ["S100P", "MSLN", "CEACAM6", "NFE2L2"] },
  { id: "SET2", name: "Set 2", database: "Hallmark", genes: ["PHGDH", "PSAT1", "HK2", "LDHA"] }
];

let testsPassed = 0;
let totalTests = 0;

function check(cond: boolean, name: string) {
  totalTests++;
  if (cond) {
    console.log(`[PASS] ${name}`);
    testsPassed++;
  } else {
    console.error(`[FAIL] ${name}`);
  }
}

// Case 1: Valid + Invalid + Duplicate
const input1 = ["S100P", "msln", "INVALID_GENE_123", "S100P", "   nfe2l2   "];
const qc1 = cleanAndMapGeneList(input1, universeSet, "Test Universe").mappingQC;
check(qc1.inputGeneCount === 4, "Duplicates & spaces cleaned (unique = 4)");
check(qc1.mappedGeneCount === 3, "Mapped count = 3");
check(qc1.unmappedGeneCount === 1, "Unmapped count = 1 (INVALID_GENE_123)");
check(qc1.duplicateSymbolsCount === 1, "Duplicate count = 1");

// Case 2: Empty input
const qc2 = cleanAndMapGeneList([], universeSet, "Test Universe").mappingQC;
check(qc2.inputGeneCount === 0 && qc2.mappedGeneCount === 0, "Empty input handled safely");

// Case 3: 1-2 small gene list
const input3 = ["S100P"];
const qc3 = cleanAndMapGeneList(input3, universeSet, "Test Universe").mappingQC;
const ora3 = runORA(qc3.unmappedSymbols, testSets, 1000, "c3", "Custom", "Test", testProv, undefined, 1, 2, 500);
check(qc3.mappedGeneCount === 1, "1-gene list mapped cleanly");

console.log(`\n=== CUSTOM INPUT SUITE: ${testsPassed} / ${totalTests} TESTS PASSED ===`);
if (testsPassed === totalTests) {
  console.log("SUCCESS: All custom input edge cases handled gracefully.");
  process.exit(0);
} else {
  process.exit(1);
}
