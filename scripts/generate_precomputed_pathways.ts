// generate_precomputed_pathways.ts - Reproducible Pipeline for Pathway Databases & Cohort Enrichment Results

import fs from "fs";
import path from "path";
import { runORA, runGSEA, RankedGene } from "../src/utils/pathwayEngine";
import {
  PathwayGeneSet,
  DatabaseProvenance,
  PathwayDatabaseIndex
} from "../src/types/pathway";

const PUBLIC_DATA_DIR = path.join(__dirname, "../public/data");
const PATHWAYS_DIR = path.join(PUBLIC_DATA_DIR, "pathways");

if (!fs.existsSync(PATHWAYS_DIR)) {
  fs.mkdirSync(PATHWAYS_DIR, { recursive: true });
}

// 1. Provenance Records
const hallmarkProvenance: DatabaseProvenance = {
  database: "MSigDB Hallmark",
  version: "v2024.1.Hs",
  species: "Homo sapiens",
  identifier: "HGNC gene_symbol",
  retrievalDate: "2026-08-14",
  sourceUrl: "https://www.gsea-msigdb.org/gsea/msigdb/",
  license: "Creative Commons Attribution 4.0 International (CC BY 4.0)",
  redistributionStatus: "permitted"
};

const reactomeProvenance: DatabaseProvenance = {
  database: "Reactome Pathways",
  version: "v88",
  species: "Homo sapiens",
  identifier: "HGNC gene_symbol",
  retrievalDate: "2026-08-14",
  sourceUrl: "https://reactome.org",
  license: "Creative Commons Attribution 4.0 International (CC BY 4.0)",
  redistributionStatus: "permitted"
};

const goBpProvenance: DatabaseProvenance = {
  database: "Gene Ontology Biological Process",
  version: "GO-2024-05",
  species: "Homo sapiens",
  identifier: "HGNC gene_symbol",
  retrievalDate: "2026-08-14",
  sourceUrl: "http://geneontology.org",
  license: "Creative Commons Attribution 4.0 International (CC BY 4.0)",
  redistributionStatus: "permitted"
};

// Load full complete pathway collections from disk
const hallmarkJson = JSON.parse(fs.readFileSync(path.join(PATHWAYS_DIR, "hallmark.json"), "utf-8"));
const reactomeJson = JSON.parse(fs.readFileSync(path.join(PATHWAYS_DIR, "reactome.json"), "utf-8"));
const goBpJson = JSON.parse(fs.readFileSync(path.join(PATHWAYS_DIR, "go_bp.json"), "utf-8"));

const hallmarkGeneSets: PathwayGeneSet[] = hallmarkJson.pathways;
const reactomeGeneSets: PathwayGeneSet[] = reactomeJson.pathways;
const goBpGeneSets: PathwayGeneSet[] = goBpJson.pathways;

// Combine all gene sets into master list for precomputation
const allGeneSets = [...hallmarkGeneSets, ...reactomeGeneSets, ...goBpGeneSets];

// Write master index.json
const indexData: PathwayDatabaseIndex = {
  version: "1.0.0",
  createdAt: "2026-08-14",
  collections: [
    { database: "Hallmark", provenance: hallmarkProvenance, pathwayCount: hallmarkGeneSets.length, totalGenes: hallmarkGeneSets.reduce((sum, p) => sum + p.genes.length, 0), dataPath: "/PAAD-SBRT-GEx-Dashboard/data/pathways/hallmark.json" },
    { database: "Reactome", provenance: reactomeProvenance, pathwayCount: reactomeGeneSets.length, totalGenes: reactomeGeneSets.reduce((sum, p) => sum + p.genes.length, 0), dataPath: "/PAAD-SBRT-GEx-Dashboard/data/pathways/reactome.json" },
    { database: "GO_BP", provenance: goBpProvenance, pathwayCount: goBpGeneSets.length, totalGenes: goBpGeneSets.reduce((sum, p) => sum + p.genes.length, 0), dataPath: "/PAAD-SBRT-GEx-Dashboard/data/pathways/go_bp.json" }
  ]
};

fs.writeFileSync(path.join(PATHWAYS_DIR, "index.json"), JSON.stringify(indexData, null, 2));

// 5. Precompute TCGA-PAAD vs GTEx Pathway Results
const tcgaGtexFile = path.join(PUBLIC_DATA_DIR, "tcga_gtex/tcga_gtex_DEG_results.json");
if (fs.existsSync(tcgaGtexFile)) {
  console.log("Precomputing TCGA-PAAD vs GTEx Pathway Results...");
  const tcgaData = JSON.parse(fs.readFileSync(tcgaGtexFile, "utf-8"));
  
  // Background universe: all 17,943 tested genes in TCGA/GTEx
  const tcgaUniverseSize = tcgaData.length;
  
  // Extract canonical DEGs (Wilcoxon qval < 0.05 and |log2FC| > 1.5)
  const tcgaDegs = tcgaData.filter((d: any) => d.qval !== undefined && d.qval < 0.05 && Math.abs(d.log2FC || 0) > 1.5);
  const tcgaDegSymbols = tcgaDegs.map((d: any) => d.symbol);

  const tcgaExprLookup: any = {};
  tcgaData.forEach((d: any) => {
    tcgaExprLookup[d.symbol] = { log2FC: d.log2FC, pValue: d.pval, adjPValue: d.qval };
  });

  // ORA
  const tcgaOraResults = runORA(
    tcgaDegSymbols,
    allGeneSets,
    tcgaUniverseSize,
    "tcga_gtex",
    "TCGA-PAAD vs GTEx Pancreas",
    "Primary Tumor vs Normal Reference",
    hallmarkProvenance,
    tcgaExprLookup,
    2, 5, 500
  );

  // Ranked List for GSEA
  const tcgaRanked: RankedGene[] = tcgaData.map((d: any) => {
    const p = Math.max(1e-300, d.pval || 1.0);
    const log2FC = d.log2FC || 0;
    const rankMetric = (log2FC >= 0 ? 1 : -1) * (-Math.log10(p));
    return { symbol: d.symbol, rankMetric, log2FC, pValue: p, adjPValue: d.qval };
  });

  const tcgaGseaResults = runGSEA(
    tcgaRanked,
    allGeneSets,
    "tcga_gtex",
    "TCGA-PAAD vs GTEx Pancreas",
    "Primary Tumor vs Normal Reference",
    hallmarkProvenance,
    5, 500
  );

  const tcgaPayload = {
    metadata: {
      datasetId: "tcga_gtex",
      datasetName: "TCGA-PAAD vs GTEx Pancreas Normal Reference",
      comparisonLabel: "Primary Tumor (n=178) vs Normal Pancreas (n=167)",
      generatedAt: new Date().toISOString(),
      backgroundUniverseSize: tcgaUniverseSize,
      backgroundSource: "TCGA-PAAD / GTEx Toil Uniform Processing Pipeline",
      degInputCount: tcgaDegSymbols.length,
      fdrThresholdUsed: 0.05
    },
    oraResults: tcgaOraResults,
    gseaResults: tcgaGseaResults
  };

  fs.writeFileSync(path.join(PATHWAYS_DIR, "tcga_gtex_pathways.json"), JSON.stringify(tcgaPayload, null, 2));
  console.log(`Precomputed ${tcgaOraResults.length} ORA & ${tcgaGseaResults.length} GSEA pathways for TCGA vs GTEx.`);
}

// 6. Precompute GSE225767 SBRT Pathway Results
const sbrtFile = path.join(PUBLIC_DATA_DIR, "GSE225767_DEG_results_with_names.csv");
if (fs.existsSync(sbrtFile)) {
  console.log("Precomputing GSE225767 SBRT Pathway Results...");
  const csvContent = fs.readFileSync(sbrtFile, "utf-8");
  const lines = csvContent.split("\n");
  
  const sbrtData: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(",");
    if (cols.length >= 4) {
      sbrtData.push({
        symbol: cols[0].replace(/"/g, ""),
        log2FC: Number(cols[2]),
        pValue: Number(cols[3]),
        adjPValue: cols[4] ? Number(cols[4]) : Number(cols[3])
      });
    }
  }

  const sbrtUniverseSize = sbrtData.length;
  const sbrtDegs = sbrtData.filter(d => d.pValue < 0.05);
  const sbrtDegSymbols = sbrtDegs.map(d => d.symbol);

  const sbrtExprLookup: any = {};
  sbrtData.forEach(d => {
    sbrtExprLookup[d.symbol] = { log2FC: d.log2FC, pValue: d.pValue, adjPValue: d.adjPValue };
  });

  const sbrtOraResults = runORA(
    sbrtDegSymbols,
    allGeneSets,
    sbrtUniverseSize,
    "gse225767",
    "GSE225767 SBRT Radiotherapy Response",
    "Post-SBRT (n=29) vs Pre-SBRT (n=26)",
    hallmarkProvenance,
    sbrtExprLookup,
    2, 5, 500
  );

  const sbrtRanked: RankedGene[] = sbrtData.map(d => {
    const p = Math.max(1e-300, d.pValue || 1.0);
    const log2FC = d.log2FC || 0;
    const rankMetric = (log2FC >= 0 ? 1 : -1) * (-Math.log10(p));
    return { symbol: d.symbol, rankMetric, log2FC, pValue: p, adjPValue: d.adjPValue };
  });

  const sbrtGseaResults = runGSEA(
    sbrtRanked,
    allGeneSets,
    "gse225767",
    "GSE225767 SBRT Radiotherapy Response",
    "Post-SBRT (n=29) vs Pre-SBRT (n=26)",
    hallmarkProvenance,
    5, 500
  );

  const sbrtPayload = {
    metadata: {
      datasetId: "gse225767",
      datasetName: "PDAC SBRT Radiotherapy Cohort (GSE225767)",
      comparisonLabel: "Post-SBRT Resection (n=29) vs Pre-SBRT Biopsy (n=26)",
      generatedAt: new Date().toISOString(),
      backgroundUniverseSize: sbrtUniverseSize,
      backgroundSource: "GSE225767 Bulk RNA-seq Pipeline",
      degInputCount: sbrtDegSymbols.length,
      fdrThresholdUsed: 0.05
    },
    oraResults: sbrtOraResults,
    gseaResults: sbrtGseaResults
  };

  fs.writeFileSync(path.join(PATHWAYS_DIR, "sbrt_pathways.json"), JSON.stringify(sbrtPayload, null, 2));
  console.log(`Precomputed ${sbrtOraResults.length} ORA & ${sbrtGseaResults.length} GSEA pathways for SBRT.`);
}

console.log("=== PRECOMPUTATION COMPLETE: Pathway files generated in public/data/pathways ===");
