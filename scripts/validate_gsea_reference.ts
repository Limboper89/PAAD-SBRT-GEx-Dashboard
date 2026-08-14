// validate_gsea_reference.ts - Numerical Validation Suite for Pathway Engine

import {
  hypergeometricPValue,
  calculateBenjaminiHochberg,
  runORA,
  runGSEA,
  logGamma,
  logCombination
} from "../src/utils/pathwayEngine";
import { PathwayGeneSet, DatabaseProvenance } from "../src/types/pathway";

console.log("=== RUNNING PATHWAY ENGINE NUMERICAL VALIDATION SUITE ===");

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${testName}${detail ? `: ${detail}` : ""}`);
  }
}

// 1. Validate Log-Gamma Function
const gamma5 = Math.exp(logGamma(5)); // Gamma(5) = 4! = 24
assert(Math.abs(gamma5 - 24) < 1e-6, "Log-Gamma Function accuracy (Gamma(5) == 24)");

// 2. Validate Log-Combination
const nCr = Math.round(Math.exp(logCombination(10, 3))); // 10C3 = 120
assert(nCr === 120, "Log-Combination accuracy (10C3 == 120)");

// 3. Validate Hypergeometric Tail P-value against known Fisher Exact expectation
// Example: N=100 (universe), K=20 (pathway size), n=10 (sample size), k=5 (overlap count)
// Exact hypergeometric cumulative tail p-value P(X >= 5) = 0.025465
const pValHyper = hypergeometricPValue(5, 100, 20, 10);
assert(
  Math.abs(pValHyper - 0.025465) < 0.0001,
  "Hypergeometric Tail P-Value against analytical Fisher standard (P = 0.025465)",
  `Got ${pValHyper.toFixed(6)}, expected 0.025465`
);

// 4. Validate Benjamini-Hochberg FDR Monotonicity and Monotonic Correction
const rawPValues = [0.001, 0.01, 0.03, 0.04, 0.20];
const bhAdjusted = calculateBenjaminiHochberg(rawPValues);

// Expected BH values for [0.001, 0.01, 0.03, 0.04, 0.20] with m=5:
// rank 5: p=0.20 * (5/5) = 0.20
// rank 4: p=0.04 * (5/4) = 0.05
// rank 3: p=0.03 * (5/3) = 0.05
// rank 2: p=0.01 * (5/2) = 0.025
// rank 1: p=0.001 * (5/1) = 0.005
assert(
  Math.abs(bhAdjusted[0] - 0.005) < 1e-4 &&
  Math.abs(bhAdjusted[1] - 0.025) < 1e-4 &&
  Math.abs(bhAdjusted[2] - 0.05) < 1e-4 &&
  Math.abs(bhAdjusted[4] - 0.20) < 1e-4,
  "Benjamini-Hochberg FDR calculation accuracy against reference values"
);

// 5. Validate GSEA Running ES & Leading Edge
const testPathway: PathwayGeneSet = {
  id: "HALLMARK_TEST",
  name: "Hallmark Test Pathway",
  database: "Hallmark",
  genes: ["GENE_A", "GENE_B", "GENE_C", "GENE_D"]
};

const testProvenance: DatabaseProvenance = {
  database: "MSigDB Hallmark",
  version: "v2024.1.Hs",
  species: "Homo sapiens",
  identifier: "HGNC",
  retrievalDate: "2026-08-14",
  sourceUrl: "https://www.gsea-msigdb.org",
  license: "CC BY 4.0",
  redistributionStatus: "permitted"
};

// Create top-ranked gene list where GENE_A, GENE_B, GENE_C appear at top (indices 0, 1, 2)
const rankedGenes = [
  { symbol: "GENE_A", rankMetric: 5.0, log2FC: 2.5, pValue: 0.0001 },
  { symbol: "GENE_B", rankMetric: 4.5, log2FC: 2.1, pValue: 0.0002 },
  { symbol: "GENE_C", rankMetric: 4.0, log2FC: 1.9, pValue: 0.0005 },
  { symbol: "GENE_X", rankMetric: 2.0, log2FC: 0.5, pValue: 0.05 },
  { symbol: "GENE_Y", rankMetric: 1.0, log2FC: 0.2, pValue: 0.2 },
  { symbol: "GENE_Z", rankMetric: -1.0, log2FC: -0.2, pValue: 0.4 },
  { symbol: "GENE_D", rankMetric: -3.0, log2FC: -1.5, pValue: 0.01 }
];

const gseaResults = runGSEA(rankedGenes, [testPathway], "test_dataset", "Test Dataset", "Top vs Bottom", testProvenance, 2, 500);

assert(gseaResults.length === 1, "GSEA Engine executes and returns result for test set");
if (gseaResults.length > 0) {
  const res = gseaResults[0];
  assert(res.enrichmentScore! > 0.5, `GSEA ES is strongly positive (ES=${res.enrichmentScore?.toFixed(3)})`);
  assert(Boolean(res.leadingEdgeGenes?.includes("GENE_A") && res.leadingEdgeGenes?.includes("GENE_B")), "GSEA Leading Edge correctly captures top-ranked pathway genes");
}

console.log(`\n=== VALIDATION SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED ===`);

if (passedTests === totalTests) {
  console.log("SUCCESS: Pathway Engine numerical calculations are verified.");
  process.exit(0);
} else {
  console.error("FAILURE: Some numerical tests failed.");
  process.exit(1);
}
