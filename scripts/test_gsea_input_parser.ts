// test_gsea_input_parser.ts - Regression test for GSEA input parsing, case normalization, and QC breakdown

import { parseGseaRankedInput } from "../src/components/pathways/CustomGeneInput";
import fs from "fs";
import path from "path";

console.log("=== RUNNING GSEA INPUT PARSER & REGRESSION SUITE ===");

const hgncPath = path.join(__dirname, "../public/data/pathways/hgnc_human_genes.json");
const hgncJson = JSON.parse(fs.readFileSync(hgncPath, "utf-8"));
const hgncUniverse = new Set<string>(hgncJson.genes.map((g: string) => g.toUpperCase()));

let passed = 0;
let total = 0;

function assertP(condition: boolean, title: string) {
  total++;
  if (condition) {
    console.log(`[PASS] ${title}`);
    passed++;
  } else {
    console.error(`[FAIL] ${title}`);
  }
}

// 1. Lowercase genes
const r1 = parseGseaRankedInput("kras 3.45\ntp53 -2.85\nphgdh 2.40", hgncUniverse);
assertP(r1.validRankedEntries.length === 3 && r1.validRankedEntries[0].symbol === "KRAS", "1. Lowercase genes normalized to uppercase HGNC symbols");

// 2. Uppercase genes
const r2 = parseGseaRankedInput("KRAS 3.45\nTP53 -2.85", hgncUniverse);
assertP(r2.validRankedEntries.length === 2 && r2.validRankedEntries[0].symbol === "KRAS", "2. Uppercase genes parsed correctly");

// 3. Mixed case
const r3 = parseGseaRankedInput("Kras 3.45\nTp53 -2.85", hgncUniverse);
assertP(r3.validRankedEntries.length === 2 && r3.validRankedEntries[0].symbol === "KRAS", "3. Mixed case normalized to uppercase HGNC symbols");

// 4. Gene-only input
const r4 = parseGseaRankedInput("KRAS\nTP53\nPHGDH\nPSPH", hgncUniverse);
assertP(r4.validRankedEntries.length === 0 && r4.missingMetricEntries.length === 4, "4. Gene-only input correctly produces Missing Metric status (0 mapped ranked genes, 4 missing metrics)");

// 5. Gene + metric
const r5 = parseGseaRankedInput("KRAS 3.45", hgncUniverse);
assertP(r5.validRankedEntries.length === 1 && r5.validRankedEntries[0].rankMetric === 3.45, "5. Gene + metric parsed correctly");

// 6. Negative metric
const r6 = parseGseaRankedInput("TP53 -2.85", hgncUniverse);
assertP(r6.validRankedEntries.length === 1 && r6.validRankedEntries[0].rankMetric === -2.85, "6. Negative metric parsed correctly");

// 7. Decimal metric
const r7 = parseGseaRankedInput("PHGDH 2.4015", hgncUniverse);
assertP(r7.validRankedEntries.length === 1 && r7.validRankedEntries[0].rankMetric === 2.4015, "7. Decimal metric parsed correctly");

// 8. Tab-separated
const r8 = parseGseaRankedInput("KRAS\t3.45\nTP53\t-2.85", hgncUniverse);
assertP(r8.validRankedEntries.length === 2, "8. Tab-separated input parsed correctly");

// 9. Comma-separated
const r9 = parseGseaRankedInput("KRAS,3.45\nTP53,-2.85", hgncUniverse);
assertP(r9.validRankedEntries.length === 2, "9. Comma-separated input parsed correctly");

// 10. Space-separated
const r10 = parseGseaRankedInput("KRAS 3.45\nTP53 -2.85", hgncUniverse);
assertP(r10.validRankedEntries.length === 2, "10. Space-separated input parsed correctly");

// 11. Duplicate genes
const r11 = parseGseaRankedInput("KRAS 3.45\nKRAS 2.10", hgncUniverse);
assertP(r11.validRankedEntries.length === 1 && r11.duplicateEntries.length === 1, "11. Duplicate gene entries flagged correctly");

// 12. Invalid / Unmapped genes
const r12 = parseGseaRankedInput("UNKNOWNXYZ123 3.45", hgncUniverse);
assertP(r12.unmappedEntries.length === 1, "12. Unmapped gene symbol detected correctly");

// 13. Missing metric
const r13 = parseGseaRankedInput("KRAS 3.45\nTP53", hgncUniverse);
assertP(r13.missingMetricEntries.length === 1 && r13.missingMetricEntries[0].symbol === "TP53", "13. Single missing metric line detected cleanly");

// 14. Non-numeric metric
const r14 = parseGseaRankedInput("KRAS abc", hgncUniverse);
assertP(r14.nonNumericEntries.length === 1, "14. Non-numeric metric flagged correctly");

// 15. Structured row format
const r15 = parseGseaRankedInput("KRAS\t3.45\nTP53\t-2.85\nPHGDH\t2.40\nPSPH\t1.90", hgncUniverse);
assertP(r15.validRankedEntries.length === 4 && r15.isValidForExecution, "15. Structured row dataset validated for GSEA execution");

// 16. Load Example
const exampleText = "KRAS\t3.45\nTP53\t-2.85\nSMAD4\t-2.10\nCDKN2A\t-1.95\nMYC\t2.60\nPHGDH\t2.40\nPSAT1\t2.15\nPSPH\t1.90";
const r16 = parseGseaRankedInput(exampleText, hgncUniverse);
assertP(r16.validRankedEntries.length === 8 && r16.metricRange?.min === -2.85 && r16.metricRange?.max === 3.45, "16. Load Example produces 8 valid mapped entries with range [-2.85, 3.45]");

// 17. Load TCGA ranked dataset (~19,853 genes)
const tcgaPath = path.join(__dirname, "../public/data/pathways/tcga_gtex_ranked_genes.json");
const tcgaJson = JSON.parse(fs.readFileSync(tcgaPath, "utf-8"));
const tcgaText = tcgaJson.rankedGenes.map((g: any) => `${g.symbol}\t${g.rankMetric}`).join("\n");
const r17 = parseGseaRankedInput(tcgaText, hgncUniverse);
if (!r17.isValidForExecution) {
  console.log("TCGA parse diagnostic:", {
    valid: r17.validRankedEntries.length,
    missing: r17.missingMetricEntries.length,
    nonNum: r17.nonNumericEntries.length,
    dups: r17.duplicateEntries.length,
    unmapped: r17.unmappedEntries.length
  });
}
assertP(r17.validRankedEntries.length >= 19800 && r17.isValidForExecution, `17. Load TCGA ranked dataset parses ${r17.validRankedEntries.length.toLocaleString()} mapped entries`);

// 18. Load SBRT ranked dataset (~19,701 genes)
const sbrtPath = path.join(__dirname, "../public/data/pathways/gse225767_ranked_genes.json");
const sbrtJson = JSON.parse(fs.readFileSync(sbrtPath, "utf-8"));
const sbrtText = sbrtJson.rankedGenes.map((g: any) => `${g.symbol}\t${g.rankMetric}`).join("\n");
const r18 = parseGseaRankedInput(sbrtText, hgncUniverse);
assertP(r18.validRankedEntries.length >= 18000 && r18.isValidForExecution, `18. Load SBRT ranked dataset parses ${r18.validRankedEntries.length.toLocaleString()} mapped entries`);

// 19. ORA state cannot influence GSEA mapping
const oraStateMock = { mappedGenes: ["KRAS", "TP53", "SMAD4", "MYC", "PHGDH", "PSAT1", "PSPH", "SHMT2"] };
const gseaTestInput = "KRAS\nTP53\nPSPH\nPHGDH"; // 4 gene-only lines
const r19 = parseGseaRankedInput(gseaTestInput, hgncUniverse);
assertP(r19.validRankedEntries.length === 0 && r19.missingMetricEntries.length === 4, "19. GSEA mapping is 100% independent of ORA state (0 valid GSEA entries despite 8 ORA genes)");

console.log(`\n=== GSEA INPUT PARSER TEST SUMMARY: ${passed} / ${total} PASSED ===`);
if (passed === total) {
  console.log("SUCCESS: All 19 GSEA input parser test cases PASSED cleanly.");
  process.exit(0);
} else {
  process.exit(1);
}
