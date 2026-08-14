// test_end_to_end_gsea_browser.ts - End-to-End Verification of Dataset-Based GSEA Pipeline

import fs from "fs";
import path from "path";
import { runGSEA, RankedGene } from "../src/utils/pathwayEngine";
import { PathwayGeneSet, DatabaseProvenance } from "../src/types/pathway";

console.log("=== RUNNING END-TO-END DATASET GSEA VERIFICATION ===");

const hallmarkPath = path.join(__dirname, "../public/data/pathways/hallmark.json");
const hallmarkJson = JSON.parse(fs.readFileSync(hallmarkPath, "utf-8"));
const hallmarkSets: PathwayGeneSet[] = hallmarkJson.pathways;

const prov: DatabaseProvenance = hallmarkJson.provenance;

let passed = 0;
let total = 0;

function assertE2E(condition: boolean, title: string) {
  total++;
  if (condition) {
    console.log(`[PASS] ${title}`);
    passed++;
  } else {
    console.error(`[FAIL] ${title}`);
  }
}

// 1. Verify Precomputed TCGA GSEA Resource
const tcgaResPath = path.join(__dirname, "../public/data/pathways/tcga_gtex_pathways.json");
assertE2E(fs.existsSync(tcgaResPath), "1. TCGA-PAAD precomputed pathway payload file exists");

const tcgaPayload = JSON.parse(fs.readFileSync(tcgaResPath, "utf-8"));
assertE2E(Array.isArray(tcgaPayload.gseaResults) && tcgaPayload.gseaResults.length > 0, `2. TCGA-PAAD contains ${tcgaPayload.gseaResults?.length || 0} precomputed GSEA pathway results`);

const topTcgaGsea = tcgaPayload.gseaResults[0];
console.log(`   Top TCGA GSEA Pathway: ${topTcgaGsea.pathwayName}`);
console.log(`   NES: ${topTcgaGsea.nes}, FDR: ${topTcgaGsea.adjPValue}, Leading Edge: ${topTcgaGsea.leadingEdgeCount} genes`);
assertE2E(Number.isFinite(topTcgaGsea.nes) && topTcgaGsea.leadingEdgeCount > 0, "3. Top TCGA GSEA pathway possesses finite NES and non-empty leading-edge genes");

// 2. Verify Precomputed SBRT GSEA Resource
const sbrtResPath = path.join(__dirname, "../public/data/pathways/sbrt_pathways.json");
assertE2E(fs.existsSync(sbrtResPath), "4. GSE225767 SBRT precomputed pathway payload file exists");

const sbrtPayload = JSON.parse(fs.readFileSync(sbrtResPath, "utf-8"));
assertE2E(Array.isArray(sbrtPayload.gseaResults) && sbrtPayload.gseaResults.length > 0, `5. GSE225767 SBRT contains ${sbrtPayload.gseaResults?.length || 0} precomputed GSEA pathway results`);

const topSbrtGsea = sbrtPayload.gseaResults[0];
console.log(`   Top SBRT GSEA Pathway: ${topSbrtGsea.pathwayName}`);
console.log(`   NES: ${topSbrtGsea.nes}, FDR: ${topSbrtGsea.adjPValue}, Leading Edge: ${topSbrtGsea.leadingEdgeCount} genes`);
assertE2E(Number.isFinite(topSbrtGsea.nes) && topSbrtGsea.leadingEdgeCount > 0, "6. Top SBRT GSEA pathway possesses finite NES and non-empty leading-edge genes");

// 3. Verify Live GSEA Engine Execution on TCGA Full Dataset
const tcgaRankedPath = path.join(__dirname, "../public/data/pathways/tcga_gtex_ranked_genes.json");
const tcgaRankedJson = JSON.parse(fs.readFileSync(tcgaRankedPath, "utf-8"));
const tcgaRankedGenes: RankedGene[] = tcgaRankedJson.rankedGenes;

const liveTcgaGsea = runGSEA(tcgaRankedGenes, hallmarkSets, "tcga_gtex", "TCGA-PAAD", "Tumor vs Normal", prov, 5, 500);
assertE2E(liveTcgaGsea.length === 50, `7. Live GSEA execution on ${tcgaRankedGenes.length} TCGA genes produced ${liveTcgaGsea.length} Hallmark pathway results`);

// 4. Verify Live GSEA Engine Execution on SBRT Full Dataset
const sbrtRankedPath = path.join(__dirname, "../public/data/pathways/gse225767_ranked_genes.json");
const sbrtRankedJson = JSON.parse(fs.readFileSync(sbrtRankedPath, "utf-8"));
const sbrtRankedGenes: RankedGene[] = sbrtRankedJson.rankedGenes;

const liveSbrtGsea = runGSEA(sbrtRankedGenes, hallmarkSets, "gse225767", "GSE225767 SBRT", "Post vs Pre", prov, 5, 500);
assertE2E(liveSbrtGsea.length === 50, `8. Live GSEA execution on ${sbrtRankedGenes.length} SBRT genes produced ${liveSbrtGsea.length} Hallmark pathway results`);

// 5. Verify Dataset Switching & Result Isolation
assertE2E(topTcgaGsea.pathwayId !== topSbrtGsea.pathwayId || topTcgaGsea.nes !== topSbrtGsea.nes, "9. TCGA and SBRT datasets produce distinct statistical GSEA signatures");

console.log(`\n=== END-TO-END GSEA VERIFICATION SUMMARY: ${passed} / ${total} PASSED ===`);
if (passed === total) {
  console.log("SUCCESS: All end-to-end GSEA dataset & engine tests PASSED.");
  process.exit(0);
} else {
  process.exit(1);
}
