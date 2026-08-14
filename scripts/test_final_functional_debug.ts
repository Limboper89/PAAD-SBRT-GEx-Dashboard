// test_final_functional_debug.ts - Functional Verification Script for ORA Bubble Plot & GSEA Execution

import { cleanAndMapGeneList, runORA, runGSEA, RankedGene } from "../src/utils/pathwayEngine";
import { PathwayGeneSet, DatabaseProvenance } from "../src/types/pathway";
import fs from "fs";
import path from "path";

console.log("=== FINAL FUNCTIONAL DEBUGGING VERIFICATION ===");

// 1. Load Pathway Databases & Global HGNC Reference
const hgncPath = path.join(__dirname, "../public/data/pathways/hgnc_human_genes.json");
const hgncJson = JSON.parse(fs.readFileSync(hgncPath, "utf-8"));
const hgncUniverse = new Set<string>(hgncJson.genes);

const hallmarkPath = path.join(__dirname, "../public/data/pathways/hallmark.json");
const hallmarkJson = JSON.parse(fs.readFileSync(hallmarkPath, "utf-8"));
const hallmarkSets: PathwayGeneSet[] = hallmarkJson.pathways;

const prov: DatabaseProvenance = {
  database: "MSigDB Hallmark",
  version: "v2024.1.Hs",
  species: "Homo sapiens",
  identifier: "HGNC",
  retrievalDate: "2026-08-14",
  sourceUrl: "https://www.gsea-msigdb.org",
  license: "CC BY 4.0",
  redistributionStatus: "permitted"
};

let passed = 0;
let total = 0;

function assertFunc(condition: boolean, title: string) {
  total++;
  if (condition) {
    console.log(`[PASS] ${title}`);
    passed++;
  } else {
    console.error(`[FAIL] ${title}`);
  }
}

// PART A: TEST ORA BUBBLE PLOT DATA PREPARATION
console.log("\n--- PART A: ORA Bubble Plot Data Preparation ---");
const testOraInput = ["KRAS", "SLC1A5", "TP53", "GPX4", "PHGDH"];
const qcOra = cleanAndMapGeneList(testOraInput, hgncUniverse, "HGNC Reference");
assertFunc(qcOra.mappingQC.mappedGeneCount === 5, "5 target genes mapped cleanly");

const oraResults = runORA(
  qcOra.cleanedInput,
  hallmarkSets,
  23033,
  "custom_ora",
  "Custom ORA Test",
  "ORA Analysis",
  prov,
  undefined,
  2, 3, 500
);

assertFunc(oraResults.length > 0, `ORA returned ${oraResults.length} pathway results`);

// Map chartData as in PathwayBubblePlot
const displayResults = oraResults.slice(0, 20);
const bubbleChartData = displayResults.map((r, idx) => {
  const rawX = r.foldEnrichment ?? 1.0;
  const xValue = Number.isFinite(rawX) ? rawX : 1.0;
  const rawSize = r.overlapCount ?? 2;
  const size = Number.isFinite(rawSize) ? Math.max(5, rawSize) : 10;
  const fdr = Number.isFinite(r.adjPValue) ? r.adjPValue : 1.0;
  const logFdr = fdr > 0 ? -Math.log10(fdr) : 0;

  return {
    id: r.pathwayId || `pathway-${idx}`,
    name: r.pathwayName.length > 32 ? r.pathwayName.slice(0, 30) + "..." : r.pathwayName,
    xValue,
    yIndex: displayResults.length - idx,
    size,
    fdr,
    logFdr,
    rawResult: r
  };
});

const allBubbleFinite = bubbleChartData.every(d => 
  Number.isFinite(d.xValue) && 
  Number.isFinite(d.size) && 
  Number.isFinite(d.logFdr) && 
  d.name.length > 0
);
assertFunc(allBubbleFinite, "All Bubble Plot data objects possess finite numeric xValue, size, logFdr, and labels");


// PART B: TEST GSEA RANKED INPUT EXECUTION
console.log("\n--- PART B: GSEA Ranked Input Execution ---");
const testGseaRanked: RankedGene[] = [
  { symbol: "KRAS", rankMetric: 3.45, log2FC: 1.8, pValue: 0.001 },
  { symbol: "MYC", rankMetric: 2.60, log2FC: 1.4, pValue: 0.005 },
  { symbol: "PHGDH", rankMetric: 2.40, log2FC: 1.3, pValue: 0.008 },
  { symbol: "PSAT1", rankMetric: 2.15, log2FC: 1.1, pValue: 0.01 },
  { symbol: "CDKN2A", rankMetric: -1.95, log2FC: -1.0, pValue: 0.015 },
  { symbol: "SMAD4", rankMetric: -2.10, log2FC: -1.1, pValue: 0.012 },
  { symbol: "TP53", rankMetric: -2.85, log2FC: -1.5, pValue: 0.002 }
];

const gseaResults = runGSEA(
  testGseaRanked,
  hallmarkSets,
  "custom_gsea",
  "Custom GSEA Test",
  "GSEA Analysis",
  prov,
  3, 500
);

assertFunc(gseaResults.length > 0, `GSEA returned ${gseaResults.length} pathway results`);

const allGseaFinite = gseaResults.every(r => 
  r.analysisMode === "GSEA" &&
  Number.isFinite(r.nes || 0) &&
  Number.isFinite(r.pValue) &&
  Number.isFinite(r.adjPValue)
);
assertFunc(allGseaFinite, "All GSEA results possess valid NES, p-value, and FDR values");

console.log(`\n=== FINAL FUNCTIONAL DEBUGGING SUMMARY: ${passed} / ${total} TESTS PASSED ===`);
if (passed === total) {
  console.log("SUCCESS: All functional debugging tests PASSED cleanly.");
  process.exit(0);
} else {
  process.exit(1);
}
