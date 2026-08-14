// test_custom_ora.ts - Custom ORA Diagnostic Script for Known & Large Gene Lists

import { cleanAndMapGeneList, runORA } from "../src/utils/pathwayEngine";
import { PathwayGeneSet, DatabaseProvenance } from "../src/types/pathway";
import fs from "fs";
import path from "path";

console.log("=== CUSTOM ORA DIAGNOSTIC REPORT ===");

// 1. Load Global HGNC reference
const hgncPath = path.join(__dirname, "../public/data/pathways/hgnc_human_genes.json");
const hgncJson = JSON.parse(fs.readFileSync(hgncPath, "utf-8"));
const hgncUniverse = new Set<string>(hgncJson.genes);

// 2. Load Hallmark, Reactome, GO BP collections from disk
const hallmarkPath = path.join(__dirname, "../public/data/pathways/hallmark.json");
const reactomePath = path.join(__dirname, "../public/data/pathways/reactome.json");
const goBpPath = path.join(__dirname, "../public/data/pathways/go_bp.json");

const hallmarkJson = JSON.parse(fs.readFileSync(hallmarkPath, "utf-8"));
const reactomeJson = JSON.parse(fs.readFileSync(reactomePath, "utf-8"));
const goBpJson = JSON.parse(fs.readFileSync(goBpPath, "utf-8"));

const allCollections: PathwayGeneSet[] = [
  ...hallmarkJson.pathways,
  ...reactomeJson.pathways,
  ...goBpJson.pathways
];

const prov: DatabaseProvenance = {
  database: "MSigDB / Reactome / GO BP",
  version: "2026.1",
  species: "Homo sapiens",
  identifier: "HGNC",
  retrievalDate: "2026-08-14",
  sourceUrl: "https://www.gsea-msigdb.org",
  license: "CC BY 4.0",
  redistributionStatus: "permitted"
};

// TEST 1: Known biological gene list (10 genes)
console.log("\n1. Testing Known Biological Gene List (10 genes)...");
const testGenes10 = ["KRAS", "TP53", "SMAD4", "CDKN2A", "MYC", "PHGDH", "PSAT1", "PSPH", "SHMT2", "SLC1A5"];
const qc10 = cleanAndMapGeneList(testGenes10, hgncUniverse, "HGNC Global Reference");

console.log(`   Input Symbols:      ${qc10.mappingQC.inputGeneCount}`);
console.log(`   Mapped Symbols:     ${qc10.mappingQC.mappedGeneCount}`);
console.log(`   Unmapped Symbols:   ${qc10.mappingQC.unmappedGeneCount}`);

const ora10 = runORA(
  qc10.cleanedInput,
  allCollections,
  23033,
  "custom_test_10",
  "Known 10 Genes",
  "Custom Analysis",
  prov,
  undefined,
  2, 3, 500
);

console.log(`   Total Tested Pathways: ${allCollections.length}`);
console.log(`   Pathways with Overlap >= 2: ${ora10.length}`);
console.log(`   Top 5 Enriched Pathways for Known 10 Genes:`);

ora10.slice(0, 5).forEach((p, i) => {
  console.log(`     ${i+1}. [${p.database}] ${p.pathwayName} - p=${p.pValue.toExponential(2)}, FDR=${p.adjPValue.toExponential(2)}, Overlap=${p.overlapCount}/${p.geneSetSize}`);
  console.log(`        Genes: ${p.contributingGenes.join(", ")}`);
});

// TEST 2: Very Large Known Gene List (Top 1,000 DEGs from TCGA-PAAD)
console.log("\n2. Testing Very Large Gene List (1,000 TCGA-PAAD DEGs)...");
const tcgaPath = path.join(__dirname, "../public/data/tcga_gtex/tcga_gtex_DEG_results.json");
const tcgaData = JSON.parse(fs.readFileSync(tcgaPath, "utf-8"));
const largeDegList = tcgaData
  .filter((d: any) => d.qval !== undefined && d.qval < 0.01 && Math.abs(d.log2FC || 0) > 2.0)
  .map((d: any) => d.symbol)
  .slice(0, 1000);

const qcLarge = cleanAndMapGeneList(largeDegList, hgncUniverse, "HGNC Global Reference");
console.log(`   Input Symbols:      ${qcLarge.mappingQC.inputGeneCount}`);
console.log(`   Mapped Symbols:     ${qcLarge.mappingQC.mappedGeneCount}`);
console.log(`   Unmapped Symbols:   ${qcLarge.mappingQC.unmappedGeneCount}`);

const oraLarge = runORA(
  qcLarge.cleanedInput,
  allCollections,
  19853,
  "custom_large_1000",
  "1000 TCGA DEGs",
  "Custom Analysis",
  prov,
  undefined,
  2, 5, 500
);

const sigLarge005 = oraLarge.filter(p => p.adjPValue < 0.05).length;
console.log(`   Total Tested Pathways: ${allCollections.length}`);
console.log(`   Pathways with Overlap >= 2: ${oraLarge.length}`);
console.log(`   Pathways Passing FDR < 0.05: ${sigLarge005}`);
console.log(`   Top 5 Enriched Pathways for 1,000 DEGs:`);

oraLarge.slice(0, 5).forEach((p, i) => {
  console.log(`     ${i+1}. [${p.database}] ${p.pathwayName} - p=${p.pValue.toExponential(2)}, FDR=${p.adjPValue.toExponential(2)}, Overlap=${p.overlapCount}/${p.geneSetSize}`);
});

console.log("\n=== CUSTOM ORA DIAGNOSTIC COMPLETED CLEANLY ===");
