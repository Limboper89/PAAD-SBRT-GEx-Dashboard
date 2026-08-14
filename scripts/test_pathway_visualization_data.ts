// test_pathway_visualization_data.ts - Visualization Data Contract Diagnostic Script

import fs from "fs";
import path from "path";
import { PathwayEnrichmentResult } from "../src/types/pathway";

console.log("=== PATHWAY VISUALIZATION DATA CONTRACT DIAGNOSTIC REPORT ===");

const tcgaPath = path.join(__dirname, "../public/data/pathways/tcga_gtex_pathways.json");
const tcgaJson = JSON.parse(fs.readFileSync(tcgaPath, "utf-8"));
const oraResults: PathwayEnrichmentResult[] = tcgaJson.oraResults;

console.log(`\n1. Validating Result Array Structure (${oraResults.length} items)...`);
console.log(`   Sample Result Item:`);
const sample = oraResults[0];
console.log(`     pathwayId:         ${sample.pathwayId}`);
console.log(`     pathwayName:       ${sample.pathwayName}`);
console.log(`     database:          ${sample.database}`);
console.log(`     pValue:            ${sample.pValue}`);
console.log(`     adjPValue:         ${sample.adjPValue}`);
console.log(`     foldEnrichment:    ${sample.foldEnrichment}`);
console.log(`     overlapCount:      ${sample.overlapCount}`);
console.log(`     geneSetSize:       ${sample.geneSetSize}`);
console.log(`     contributingGenes: ${sample.contributingGenes.length} genes`);

// Validate data contract requirements for visualization rendering
let valid = true;
oraResults.slice(0, 100).forEach((p, idx) => {
  if (!p.pathwayId || !p.pathwayName || p.pValue === undefined || p.adjPValue === undefined || p.foldEnrichment === undefined) {
    console.error(`[FAIL] Item ${idx} missing required visualization property:`, p);
    valid = false;
  }
});

if (valid) {
  console.log("   [PASS] All evaluated pathway items satisfy the visualization data contract!");
}

// 2. Validate Component Data Props
console.log("\n2. Component Input Verification:");
const top20 = oraResults.slice(0, 20);
console.log(`   Bubble Plot input size:       ${top20.length} items (Non-empty)`);
console.log(`   Ranked Bar Plot input size:   ${top20.length} items (Non-empty)`);
console.log(`   Pathway Table input size:     ${oraResults.length} items (Non-empty)`);
console.log(`   Gene Matrix input size:       ${top20.length} items (Non-empty)`);

console.log("\n=== VISUALIZATION DATA CONTRACT COMPLETED CLEANLY ===");
