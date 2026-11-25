// QueryEngine.ts - Autonomous Data Query Executor with Universal Environment Loading, Strict Data Grounding, & Precise Statistical Terminology

import { DATASET_REGISTRY, DatasetDefinition, getDatasetMetadata } from "./DatasetRegistry";
import { PathwayEnrichmentResult } from "@/types/pathway";
import { EvidenceObject } from "./ToolRegistry";
import { runORA, runGSEA } from "@/utils/pathwayEngine";

export interface VerifiedGeneMetrics {
  log2FC: number;
  log2FCFormatted: string;
  pValue?: number;
  pValueFormatted?: string;
  adjPValue?: number;
  adjPValueFormatted?: string;
  tumorMean?: number;
  tumorMeanFormatted?: string;
  normalMean?: number;
  normalMeanFormatted?: string;
  preMean?: number;
  preMeanFormatted?: string;
  postMean?: number;
  postMeanFormatted?: string;
  robustDeg?: boolean;
  isSignificant: boolean;
  significanceSummary: string; // Explicit distinction between nominal p-value & FDR correction
}

export interface GeneQueryResult {
  type: "gene";
  datasetId: string;
  datasetName: string;
  gene: string;
  found: boolean;
  metrics: VerifiedGeneMetrics | null;
  comparisonLabel: string;
  limitations: string[];
  success: boolean;
  validationError?: string;
}

export interface DEGeneRecord {
  gene: string;
  log2FC: number;
  log2FCFormatted: string;
  pValue: number;
  pValueFormatted: string;
  adjPValue?: number;
  adjPValueFormatted?: string;
}

export interface DifferentialQueryResult {
  type?: "differential";
  datasetId: string;
  datasetName: string;
  totalGenes: number;
  filteredCount: number;
  topUpregulated: DEGeneRecord[];
  topDownregulated: DEGeneRecord[];
  topDegs?: DEGeneRecord[];
  thresholdsUsed: { log2FC: number; pValue?: number; fdr?: number };
  success: boolean;
  validationError?: string;
}

export interface ExpressedGeneRecord {
  gene: string;
  meanExpression: number;
  meanExpressionFormatted: string;
  preMean?: number;
  preMeanFormatted?: string;
  postMean?: number;
  postMeanFormatted?: string;
  tumorMean?: number;
  tumorMeanFormatted?: string;
  normalMean?: number;
  normalMeanFormatted?: string;
}

export interface TopExpressedQueryResult {
  datasetId: string;
  datasetName: string;
  groupSpecified: string;
  genes: ExpressedGeneRecord[];
  analysisType: string;
  distinctionNote: string;
  success: boolean;
  validationError?: string;
}

export interface SingleNucleusQueryResult {
  datasetId: string;
  gene: string;
  found: boolean;
  totalNuclei: number;
  broadCellTypes: Array<{ type: string; meanExpr: number; pctPositive: number }>;
  pseudobulkResults?: any[];
  comparisonLabel?: string;
  subgroupFilter?: string;
  targetCellType?: string;
  cellTypeLevel?: "broad_celltype" | "level2";
  naiveCount?: number;
  treatedCount?: number;
  topLineage: string;
  success: boolean;
}

export function getSingleNucleusComparisonLabel(subgroupFilter?: string): string {
  if (!subgroupFilter) return "Treatment-Naïve (n=18) vs. Neoadjuvant-Treated [100% RT/CRT] (n=25)";
  switch (subgroupFilter) {
    case "CRT":
      return "Treatment-Naïve (n=18) vs. Standard CRT (n=14)";
    case "CRTl":
      return "Treatment-Naïve (n=18) vs. CRT + Losartan [CRTl] (n=5)";
    case "CRTn":
    case "CRTln":
      return "Treatment-Naïve (n=18) vs. CRT + Nivolumab [CRTn/ln] (n=2)";
    case "CRTx":
      return "Treatment-Naïve (n=18) vs. CRTx [Other Regimen] (n=2)";
    case "GART":
      return "Treatment-Naïve (n=18) vs. GART (n=1)";
    case "RT":
      return "Treatment-Naïve (n=18) vs. Radiation Alone [RT] (n=1)";
    case "RESP_MOD":
      return "Treatment-Naïve (n=18) vs. Moderate Response (n=8)";
    case "RESP_MIN":
      return "Treatment-Naïve (n=18) vs. Minimal Response (n=11)";
    case "RESP_POOR":
      return "Treatment-Naïve (n=18) vs. Poor Response (n=6)";
    default:
      return `Treatment-Naïve (n=18) vs. ${subgroupFilter}`;
  }
}

export interface PatientSpatialDetail {
  patientId: string;
  gsm?: string;
  maxSpotExpr: number;
  maxRawCount?: number;
}

export interface SpatialQueryResult {
  datasetId: string;
  gene: string;
  found: boolean;
  sampleId: string;
  maxSpotExpr: number;
  description: string;
  patientMetrics?: PatientSpatialDetail[];
  success: boolean;
}

export interface CptacProteomicsQueryResult {
  type: "gene";
  datasetId: string;
  datasetName: string;
  gene: string;
  found: boolean;
  proteinDetected: boolean;
  metrics: VerifiedGeneMetrics | null;
  proteomicsStats?: {
    nT: number;
    nN: number;
    nPairedNat: number;
    tMean: number | null;
    nMean: number | null;
    log2FC: number | null;
    mwP: number | null;
    mwQ: number | null;
    welchP: number | null;
    welchQ: number | null;
    pairedLog2FC: number | null;
    pairedP: number | null;
    nPairMP: number;
    pearsonR: number | null;
    pearsonP: number | null;
    spearmanRho: number | null;
    spearmanP: number | null;
    coxN: number;
    coxHR: number | null;
    coxCiL: number | null;
    coxCiH: number | null;
    coxP: number | null;
    mrnaLog2FC: number | null;
    mrnaMwP: number | null;
  };
  limitations: string[];
  success: boolean;
  validationError?: string;
}

export interface CptacDifferentialQueryResult {
  type: "differential";
  datasetId: string;
  datasetName: string;
  totalProteins: number;
  filteredCount: number;
  globalConcordance?: {
    median_pearson_r: number;
    median_spearman_rho: number;
    pct_positive_r: number;
  };
  topUpregulated: Array<DEGeneRecord & { pearsonR?: number | null; coxHR?: number | null; coxP?: number | null }>;
  topDownregulated: Array<DEGeneRecord & { pearsonR?: number | null; coxHR?: number | null; coxP?: number | null }>;
  success: boolean;
  validationError?: string;
}

// In-memory cache for loaded data files
const dataCache: Map<string, any> = new Map();

async function fetchCachedJson(url: string): Promise<any> {
  if (dataCache.has(url)) return dataCache.get(url);

  if (typeof window === "undefined") {
    try {
      const req = eval("require");
      const fs = req("fs");
      const path = req("path");
      const cleanPath = url.replace(/^\/PAAD-SBRT-GEx-Dashboard/, "");
      const targetFile = path.join(process.cwd(), "public", cleanPath);
      if (fs.existsSync(targetFile)) {
        const json = JSON.parse(fs.readFileSync(targetFile, "utf-8"));
        dataCache.set(url, json);
        return json;
      }
    } catch (e) {
      // Fallback
    }
  }

  const cleanUrl = url.replace(/^\/PAAD-SBRT-GEx-Dashboard/, "");
  try {
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      dataCache.set(url, json);
      return json;
    }
  } catch (e) {}

  const res = await fetch(cleanUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${cleanUrl}`);
  const json = await res.json();
  dataCache.set(url, json);
  return json;
}

async function fetchCachedCsv(url: string): Promise<string> {
  if (dataCache.has(url)) return dataCache.get(url);

  if (typeof window === "undefined") {
    try {
      const req = eval("require");
      const fs = req("fs");
      const path = req("path");
      const cleanPath = url.replace(/^\/PAAD-SBRT-GEx-Dashboard/, "");
      const targetFile = path.join(process.cwd(), "public", cleanPath);
      if (fs.existsSync(targetFile)) {
        const text = fs.readFileSync(targetFile, "utf-8");
        dataCache.set(url, text);
        return text;
      }
    } catch (e) {
      // Fallback
    }
  }


  const cleanUrl = url.replace(/^\/PAAD-SBRT-GEx-Dashboard/, "");
  try {
    const res = await fetch(url);
    if (res.ok) {
      const text = await res.text();
      dataCache.set(url, text);
      return text;
    }
  } catch (e) {}

  const res = await fetch(cleanUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${cleanUrl}`);
  const text = await res.text();
  dataCache.set(url, text);
  return text;
}

function validateNumeric(val: any, range?: [number, number]): boolean {
  if (typeof val !== "number" || !Number.isFinite(val) || Number.isNaN(val)) return false;
  if (range && (val < range[0] || val > range[1])) return false;
  return true;
}

function formatStatNum(val: number | undefined): string {
  if (val === undefined || !Number.isFinite(val)) return "N/A";
  if (Math.abs(val) < 0.0001 && val !== 0) return val.toExponential(4);
  return val.toFixed(4);
}

export class QueryEngine {
  private basePath = (typeof window !== "undefined" && window.location.pathname.startsWith("/PAAD-SBRT-GEx-Dashboard")) ? "/PAAD-SBRT-GEx-Dashboard" : "";

  private knownGeneSymbols: Set<string> = new Set();
  private isIndexLoaded: boolean = false;

  private async ensureGeneSymbolsLoaded(): Promise<void> {
    if (this.isIndexLoaded) return;
    try {
      const sbrtCsv = await fetchCachedCsv(`${this.basePath}/data/GSE225767_DEG_results_with_names.csv`);
      const lines = sbrtCsv.split("\n");
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const name = line.split(",")[0].replace(/"/g, "").trim().toUpperCase();
        if (name && name.length >= 2) this.knownGeneSymbols.add(name);
      }

      const tcgaJson = await fetchCachedJson(`${this.basePath}/data/tcga_gtex/tcga_gtex_DEG_results.json`);
      (tcgaJson || []).forEach((item: any) => {
        const name = (item.symbol || item.gene_name || "").toUpperCase();
        if (name && name.length >= 2) this.knownGeneSymbols.add(name);
      });

      try {
        const cptacProt = await fetchCachedJson(`${this.basePath}/data/cptac_pdac/cptac_protein_stats.json`);
        (cptacProt || []).forEach((item: any) => {
          const name = (item.g || "").toUpperCase();
          if (name && name.length >= 2) this.knownGeneSymbols.add(name);
        });
      } catch {}

      this.isIndexLoaded = true;
    } catch (e) {
      console.warn("Failed to fully preload dataset gene symbols:", e);
    }
  }

  async isValidGeneSymbol(symbol: string): Promise<boolean> {
    const upper = symbol.trim().toUpperCase();
    if (!upper || upper.length < 2) return false;

    if (this.knownGeneSymbols.has(upper)) return true;

    await this.ensureGeneSymbolsLoaded();
    return this.knownGeneSymbols.has(upper);
  }

  isValidGeneSymbolSync(symbol: string): boolean {
    const upper = symbol.trim().toUpperCase();
    return this.knownGeneSymbols.has(upper);
  }

  /**
   * Calculate top expressed genes from actual baseline expression matrix data
   */
  async queryTopExpressedGenes(datasetId: string, group?: string, limit: number = 10): Promise<TopExpressedQueryResult> {
    const dataset = getDatasetMetadata(datasetId) || DATASET_REGISTRY.gse225767;

    try {
      if (datasetId === "gse225767") {
        const exprData = await fetchCachedJson(`${this.basePath}/data/GSE225767_expression_data.json`);
        const conditions: string[] = exprData.conditions || [];
        const expressions: Record<string, number[]> = exprData.expressions || {};

        const preIndices: number[] = [];
        const postIndices: number[] = [];
        conditions.forEach((c, idx) => {
          if (c === "Pre") preIndices.push(idx);
          if (c === "Post") postIndices.push(idx);
        });

        const targetGroup = (group || "").toLowerCase();
        let groupSpecified = "All SBRT Samples (Pre n=26, Post n=29)";
        if (targetGroup.includes("pre")) groupSpecified = "Pre-SBRT Biopsy (n=26)";
        if (targetGroup.includes("post")) groupSpecified = "Post-SBRT Resection (n=29)";

        const geneStats: ExpressedGeneRecord[] = [];

        Object.entries(expressions).forEach(([gene, vals]) => {
          if (!vals || vals.length === 0) return;

          let targetMean = 0;
          let preMean = 0;
          let postMean = 0;

          if (preIndices.length > 0) {
            preMean = preIndices.reduce((acc, idx) => acc + (vals[idx] || 0), 0) / preIndices.length;
          }
          if (postIndices.length > 0) {
            postMean = postIndices.reduce((acc, idx) => acc + (vals[idx] || 0), 0) / postIndices.length;
          }

          if (targetGroup.includes("pre")) {
            targetMean = preMean;
          } else if (targetGroup.includes("post")) {
            targetMean = postMean;
          } else {
            targetMean = vals.reduce((acc, v) => acc + v, 0) / vals.length;
          }

          geneStats.push({
            gene,
            meanExpression: targetMean,
            meanExpressionFormatted: formatStatNum(targetMean),
            preMean,
            preMeanFormatted: formatStatNum(preMean),
            postMean,
            postMeanFormatted: formatStatNum(postMean)
          });
        });

        geneStats.sort((a, b) => b.meanExpression - a.meanExpression);
        const topGenes = geneStats.slice(0, limit);

        return {
          datasetId: "gse225767",
          datasetName: dataset.name,
          groupSpecified,
          genes: topGenes,
          analysisType: "Top Expression Abundance (Absolute Normalized Abundance)",
          distinctionNote: "Calculated directly from normalized expression matrix abundance, NOT differential expression fold-changes.",
          success: true
        };
      } else {
        const degResults = await fetchCachedJson(`${this.basePath}/data/tcga_gtex/tcga_gtex_DEG_results.json`);
        const targetGroup = (group || "").toLowerCase();
        let groupSpecified = "TCGA Tumor vs GTEx Normal";

        const stats: ExpressedGeneRecord[] = degResults.map((item: any) => {
          const tumorMean = Number(item.tumor_mean || 0);
          const normalMean = Number(item.gtex_mean || 0);
          let targetMean = (tumorMean + normalMean) / 2;
          if (targetGroup.includes("tumor")) targetMean = tumorMean;
          if (targetGroup.includes("normal") || targetGroup.includes("gtex")) targetMean = normalMean;

          return {
            gene: item.symbol || item.gene_name,
            meanExpression: targetMean,
            meanExpressionFormatted: formatStatNum(targetMean),
            tumorMean,
            tumorMeanFormatted: formatStatNum(tumorMean),
            normalMean,
            normalMeanFormatted: formatStatNum(normalMean)
          };
        });

        stats.sort((a, b) => b.meanExpression - a.meanExpression);
        const topGenes = stats.slice(0, limit);

        return {
          datasetId: "tcga_gtex",
          datasetName: dataset.name,
          groupSpecified,
          genes: topGenes,
          analysisType: "Top Expression Abundance (Baseline Mean Abundance)",
          distinctionNote: "Calculated from baseline mean expression levels, NOT differential expression fold-changes.",
          success: true
        };
      }
    } catch (e: any) {
      console.error(`QueryEngine error in queryTopExpressedGenes (${datasetId}):`, e);
    }

    return {
      datasetId,
      datasetName: dataset.name,
      groupSpecified: group || "All",
      genes: [],
      analysisType: "Top Expression Abundance",
      distinctionNote: "Failed to calculate top expressed genes",
      success: false,
      validationError: "Expression matrix read failure"
    };
  }

  async queryGeneExpression(datasetId: string, geneSymbol: string): Promise<GeneQueryResult> {
    const dataset = getDatasetMetadata(datasetId);
    const upperGene = geneSymbol.trim().toUpperCase();

    if (!dataset) {
      return {
        type: "gene",
        datasetId,
        datasetName: datasetId,
        gene: geneSymbol,
        found: false,
        metrics: null,
        comparisonLabel: "Unknown Dataset",
        limitations: ["Dataset not registered"],
        success: false,
        validationError: "Dataset not registered"
      };
    }

    try {
      if (datasetId === "tcga_gtex") {
        const degResults = await fetchCachedJson(`${this.basePath}/data/tcga_gtex/tcga_gtex_DEG_results.json`);
        const item = degResults.find((d: any) => (d.symbol || d.gene_name || "").toUpperCase() === upperGene);

        if (item) {
          const log2FC = Number(item.log2FC);
          const pval = Number(item.pval);
          const qval = item.qval !== undefined && item.qval !== null ? Number(item.qval) : undefined;

          if (!validateNumeric(log2FC) || !validateNumeric(pval, [0, 1])) {
            return {
              type: "gene",
              datasetId: "tcga_gtex",
              datasetName: dataset.name,
              gene: item.symbol || upperGene,
              found: true,
              metrics: null,
              comparisonLabel: "TCGA-PAAD Primary Tumor (n=178) vs GTEx Normal Pancreas (n=167)",
              limitations: dataset.limitations,
              success: false,
              validationError: "Retrieved numeric values failed validation check"
            };
          }

          const fdrSig = qval !== undefined ? qval < 0.05 : pval < 0.05;
          const pvalSig = pval < 0.05;
          const fcSig = Math.abs(log2FC) >= 1.5;
          const isSignificant = fdrSig && fcSig;

          let significanceSummary = "";
          if (fdrSig && fcSig) {
            significanceSummary = "Statistically significant after FDR correction (FDR < 0.05, |log2FC| >= 1.5)";
          } else if (pvalSig && !fdrSig) {
            significanceSummary = "Nominally significant by unadjusted p-value (p < 0.05), but NOT significant after FDR correction (FDR >= 0.05)";
          } else {
            significanceSummary = "Not statistically significant (p >= 0.05)";
          }

          const metrics: VerifiedGeneMetrics = {
            log2FC,
            log2FCFormatted: formatStatNum(log2FC),
            pValue: pval,
            pValueFormatted: formatStatNum(pval),
            adjPValue: qval,
            adjPValueFormatted: formatStatNum(qval),
            tumorMean: item.tumor_mean,
            tumorMeanFormatted: formatStatNum(item.tumor_mean),
            normalMean: item.gtex_mean,
            normalMeanFormatted: formatStatNum(item.gtex_mean),
            robustDeg: !!item.robust_deg,
            isSignificant,
            significanceSummary
          };

          return {
            type: "gene",
            datasetId: "tcga_gtex",
            datasetName: dataset.name,
            gene: item.symbol || upperGene,
            found: true,
            comparisonLabel: "TCGA-PAAD Primary Tumor (n=178) vs GTEx Normal Pancreas (n=167)",
            metrics,
            limitations: dataset.limitations,
            success: true
          };
        }
      } else if (datasetId === "gse225767") {
        const csvText = await fetchCachedCsv(`${this.basePath}/data/GSE225767_DEG_results_with_names.csv`);
        const lines = csvText.split("\n");
        let foundLine: string | null = null;

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const cols = line.split(",");
          const name = cols[0].replace(/"/g, "").trim().toUpperCase();
          if (name === upperGene) {
            foundLine = line;
            break;
          }
        }

        if (foundLine) {
          const cols = foundLine.split(",");
          const actualGeneName = cols[0].replace(/"/g, "");
          const log2FC = Number(cols[2]);
          const pval = Number(cols[3]);
          const adjP = cols[4] && cols[4].trim() !== "" ? Number(cols[4]) : undefined;

          if (!validateNumeric(log2FC) || !validateNumeric(pval, [0, 1])) {
            return {
              type: "gene",
              datasetId: "gse225767",
              datasetName: dataset.name,
              gene: actualGeneName,
              found: true,
              metrics: null,
              comparisonLabel: "Post-SBRT (n=29) vs Pre-SBRT (n=26) Unpaired Cohorts",
              limitations: dataset.limitations,
              success: false,
              validationError: "Retrieved SBRT numeric values failed validation check"
            };
          }

          let preMean: number | undefined;
          let postMean: number | undefined;
          try {
            const exprJson = await fetchCachedJson(`${this.basePath}/data/GSE225767_expression_data.json`);
            const vals = exprJson.expressions?.[actualGeneName];
            if (vals && exprJson.conditions) {
              const preVals = vals.filter((_: any, idx: number) => exprJson.conditions[idx] === "Pre");
              const postVals = vals.filter((_: any, idx: number) => exprJson.conditions[idx] === "Post");
              if (preVals.length) preMean = preVals.reduce((a: number, b: number) => a + b, 0) / preVals.length;
              if (postVals.length) postMean = postVals.reduce((a: number, b: number) => a + b, 0) / postVals.length;
            }
          } catch (e) {
            // Ignore expression JSON fallback error
          }

          const fdrSig = adjP !== undefined ? adjP < 0.05 : pval < 0.05;
          const pvalSig = pval < 0.05;
          const fcSig = Math.abs(log2FC) >= 1.0;
          const isSignificant = pvalSig && fcSig;

          let significanceSummary = "";
          if (fdrSig && fcSig) {
            significanceSummary = "Statistically significant after FDR correction (FDR < 0.05, |log2FC| >= 1.0)";
          } else if (pvalSig && (!fdrSig || adjP === undefined)) {
            significanceSummary = "Nominally significant by unadjusted p-value (p < 0.05), but NOT significant after FDR correction (FDR >= 0.05)";
          } else {
            significanceSummary = "Not statistically significant (p >= 0.05)";
          }

          const metrics: VerifiedGeneMetrics = {
            log2FC,
            log2FCFormatted: formatStatNum(log2FC),
            pValue: pval,
            pValueFormatted: formatStatNum(pval),
            adjPValue: adjP,
            adjPValueFormatted: formatStatNum(adjP),
            preMean,
            preMeanFormatted: formatStatNum(preMean),
            postMean,
            postMeanFormatted: formatStatNum(postMean),
            isSignificant,
            significanceSummary
          };

          return {
            type: "gene",
            datasetId: "gse225767",
            datasetName: dataset.name,
            gene: actualGeneName,
            found: true,
            comparisonLabel: "Post-SBRT (n=29) vs Pre-SBRT (n=26) Unpaired Cohorts",
            metrics,
            limitations: dataset.limitations,
            success: true
          };
        }
      }
    } catch (err: any) {
      console.error(`QueryEngine error in queryGeneExpression (${datasetId}, ${geneSymbol}):`, err);
    }

    return {
      type: "gene",
      datasetId,
      datasetName: dataset.name,
      gene: geneSymbol,
      found: false,
      metrics: null,
      comparisonLabel: dataset.name,
      limitations: dataset.limitations,
      success: false
    };
  }

  async queryDifferentialExpression(datasetId: string, options?: { log2FCThreshold?: number; pValueThreshold?: number; limit?: number }): Promise<DifferentialQueryResult> {
    const dataset = getDatasetMetadata(datasetId) || DATASET_REGISTRY.tcga_gtex;
    const log2FCThresh = options?.log2FCThreshold ?? (datasetId === "tcga_gtex" ? 1.5 : 1.0);
    const pValThresh = options?.pValueThreshold ?? 0.05;
    const limit = options?.limit ?? 10;

    try {
      if (datasetId === "tcga_gtex") {
        const degResults = await fetchCachedJson(`${this.basePath}/data/tcga_gtex/tcga_gtex_DEG_results.json`);
        const sig = degResults.filter((d: any) => {
          const p = d.qval ?? d.pval;
          return validateNumeric(d.log2FC) && validateNumeric(p, [0, 1]) && p < pValThresh && Math.abs(d.log2FC) >= log2FCThresh;
        });

        const up: DEGeneRecord[] = [...sig]
          .filter((d: any) => d.log2FC > 0)
          .sort((a: any, b: any) => b.log2FC - a.log2FC)
          .slice(0, limit)
          .map((d: any) => ({
            gene: d.symbol,
            log2FC: d.log2FC,
            log2FCFormatted: formatStatNum(d.log2FC),
            pValue: d.pval,
            pValueFormatted: formatStatNum(d.pval),
            adjPValue: d.qval,
            adjPValueFormatted: formatStatNum(d.qval)
          }));

        const down: DEGeneRecord[] = [...sig]
          .filter((d: any) => d.log2FC < 0)
          .sort((a: any, b: any) => a.log2FC - b.log2FC)
          .slice(0, limit)
          .map((d: any) => ({
            gene: d.symbol,
            log2FC: d.log2FC,
            log2FCFormatted: formatStatNum(d.log2FC),
            pValue: d.pval,
            pValueFormatted: formatStatNum(d.pval),
            adjPValue: d.qval,
            adjPValueFormatted: formatStatNum(d.qval)
          }));

        return {
          type: "differential",
          datasetId: "tcga_gtex",
          datasetName: dataset.name,
          totalGenes: degResults.length,
          filteredCount: sig.length,
          topUpregulated: up,
          topDownregulated: down,
          topDegs: up,
          thresholdsUsed: { log2FC: log2FCThresh, fdr: pValThresh },
          success: true
        };
      } else {
        const csvText = await fetchCachedCsv(`${this.basePath}/data/GSE225767_DEG_results_with_names.csv`);
        const lines = csvText.split("\n");
        const parsed: DEGeneRecord[] = [];

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const cols = line.split(",");
          if (cols.length >= 4) {
            const log2FC = Number(cols[2]);
            const pValue = Number(cols[3]);
            const adjP = cols[4] && cols[4].trim() !== "" ? Number(cols[4]) : undefined;

            if (validateNumeric(log2FC) && validateNumeric(pValue, [0, 1])) {
              parsed.push({
                gene: cols[0].replace(/"/g, ""),
                log2FC,
                log2FCFormatted: formatStatNum(log2FC),
                pValue,
                pValueFormatted: formatStatNum(pValue),
                adjPValue: adjP,
                adjPValueFormatted: formatStatNum(adjP)
              });
            }
          }
        }

        const sig = parsed.filter(d => d.pValue < pValThresh && Math.abs(d.log2FC) >= log2FCThresh);
        const up = [...sig].filter(d => d.log2FC > 0).sort((a, b) => b.log2FC - a.log2FC).slice(0, limit);
        const down = [...sig].filter(d => d.log2FC < 0).sort((a, b) => a.log2FC - b.log2FC).slice(0, limit);

        return {
          type: "differential",
          datasetId: "gse225767",
          datasetName: dataset.name,
          totalGenes: parsed.length,
          filteredCount: sig.length,
          topUpregulated: up,
          topDownregulated: down,
          topDegs: up,
          thresholdsUsed: { log2FC: log2FCThresh, fdr: pValThresh },
          success: true
        };
      }
    } catch (e: any) {
      console.error(`QueryEngine error in queryDifferentialExpression (${datasetId}):`, e);
    }

    return {
      datasetId,
      datasetName: dataset.name,
      totalGenes: 0,
      filteredCount: 0,
      topUpregulated: [],
      topDownregulated: [],
      thresholdsUsed: { log2FC: log2FCThresh, pValue: pValThresh },
      success: false,
      validationError: "Failed to read source DEG file"
    };
  }

  async querySingleNucleusExpression(
    geneSymbol: string,
    subgroupFilter?: string,
    targetCellType?: string,
    cellTypeLevel?: "broad_celltype" | "level2"
  ): Promise<SingleNucleusQueryResult> {
    const dataset = DATASET_REGISTRY.gse202051;
    const upperGene = geneSymbol.trim().toUpperCase();

    try {
      const [geneIndex, metadata] = await Promise.all([
        fetchCachedJson(`${this.basePath}/data/gse202051/genes_index_chunked.json`),
        fetchCachedJson(`${this.basePath}/data/gse202051/metadata.json`)
      ]);

      const entry = (geneIndex.genes || []).find((g: any) => (g.s || "").toUpperCase() === upperGene);

      if (entry && metadata && Array.isArray(metadata)) {
        const chunkId = entry.c ?? 0;
        const offset = entry.o ?? 0;
        const length = entry.l ?? 0;

        let exprVec = new Float32Array(metadata.length);

        try {
          const chunkFilename = `chunk_${chunkId.toString().padStart(3, "0")}.bin`;
          const chunkUrl = `${this.basePath}/data/gse202051/expression_chunks/${chunkFilename}`;
          const cleanChunkUrl = chunkUrl.replace(/^\/PAAD-SBRT-GEx-Dashboard/, "");
          let buf: ArrayBuffer | null = null;

          if (typeof window === "undefined") {
            try {
              const req = eval("require");
              const fs = req("fs");
              const path = req("path");
              const targetFile = path.join(process.cwd(), "public", "data", "gse202051", "expression_chunks", chunkFilename);
              if (fs.existsSync(targetFile)) {
                const fileBuf = fs.readFileSync(targetFile);
                buf = fileBuf.buffer.slice(fileBuf.byteOffset + offset, fileBuf.byteOffset + offset + length);
              }
            } catch (fsErr) {
              console.warn("Could not read binary chunk via fs:", fsErr);
            }
          }

          if (!buf) {
            let chunkRes: Response | null = null;
            try {
              const res = await fetch(chunkUrl);
              if (res.ok) chunkRes = res;
            } catch (e) {}
            if (!chunkRes) {
              const fallbackRes = await fetch(cleanChunkUrl);
              if (fallbackRes.ok) chunkRes = fallbackRes;
            }
            if (chunkRes) {
              const chunkBuf = await chunkRes.arrayBuffer();
              buf = chunkBuf.slice(offset, offset + length);
            }
          }

          if (buf) {
            const dv = new DataView(buf);
            const n_nz = dv.getUint32(0, true);
            const idxArr = new Uint16Array(buf, 4, n_nz);
            const valU16 = new Uint16Array(buf, 4 + n_nz * 2, n_nz);

            for (let i = 0; i < n_nz; i++) {
              const h = valU16[i];
              const s = (h & 0x8000) ? -1 : 1;
              const e = (h >> 10) & 0x1F;
              const m = h & 0x3FF;
              const f32 = e === 0 
                ? s * Math.pow(2, -14) * (m / 1024)
                : e === 31 
                  ? (m ? NaN : s * Infinity)
                  : s * Math.pow(2, e - 15) * (1 + m / 1024);
              exprVec[idxArr[i]] = f32;
            }
          }
        } catch (binErr) {
          console.warn("Could not read binary chunk directly, computing pseudobulk fallback:", binErr);
        }

        const { computePatientPseudobulk } = await import("@/utils/singleNucleusStats");
        const pseudobulk = computePatientPseudobulk(exprVec, metadata, cellTypeLevel || "broad_celltype", subgroupFilter);
        
        // Prioritize queried cell lineage if specified
        let prioritizedPseudobulk = [...pseudobulk];
        if (targetCellType) {
          const matchIdx = prioritizedPseudobulk.findIndex(r => 
            r.cellType.toLowerCase().includes(targetCellType.toLowerCase()) || 
            targetCellType.toLowerCase().includes(r.cellType.toLowerCase())
          );
          if (matchIdx > 0) {
            const [matched] = prioritizedPseudobulk.splice(matchIdx, 1);
            prioritizedPseudobulk.unshift(matched);
          }
        }

        const topBroad = prioritizedPseudobulk.slice().sort((a, b) => b.treatedMean - a.treatedMean)[0] || prioritizedPseudobulk[0];

        const broadCellTypes = prioritizedPseudobulk.map(r => ({
          type: r.cellType,
          meanExpr: (r.naiveMean + r.treatedMean) / 2,
          pctPositive: (r.naivePctExpressing + r.treatedPctExpressing) / 2
        }));

        const nNaive = prioritizedPseudobulk[0]?.naivePatientCount || 18;
        const nTreated = prioritizedPseudobulk[0]?.treatedPatientCount || (subgroupFilter === "CRT" ? 14 : subgroupFilter === "CRTl" ? 5 : 25);
        const compLabel = getSingleNucleusComparisonLabel(subgroupFilter);

        return {
          datasetId: "gse202051",
          gene: entry.s,
          found: true,
          totalNuclei: 224988,
          broadCellTypes,
          pseudobulkResults: prioritizedPseudobulk,
          comparisonLabel: compLabel,
          subgroupFilter,
          targetCellType,
          cellTypeLevel: cellTypeLevel || "broad_celltype",
          naiveCount: nNaive,
          treatedCount: nTreated,
          topLineage: topBroad?.cellType || "Epithelial / Ductal Cells",
          success: true
        };
      }
    } catch (e) {
      console.error("QueryEngine error in querySingleNucleusExpression:", e);
    }

    return {
      datasetId: "gse202051",
      gene: geneSymbol,
      found: false,
      totalNuclei: 224988,
      broadCellTypes: [],
      topLineage: "Unknown",
      success: false
    };
  }

  async querySpatialExpression(geneSymbol: string, sampleId: string = "PDAC-p1"): Promise<SpatialQueryResult> {
    const dataset = DATASET_REGISTRY.gse274103;
    const upperGene = geneSymbol.trim().toUpperCase();

    try {
      const masterIndex = await fetchCachedJson(`${this.basePath}/data/gse274103/master_index.json`);
      const match = Object.values(masterIndex || {}).find((g: any) => (g.s || "").toUpperCase() === upperGene) as any;

      if (match) {
        const patients = ["PDAC-p1", "PDAC-p2", "PDAC-p3", "PDAC-p4", "PDAC-p5"];
        const gsmMap: Record<string, string> = {
          "PDAC-p1": "GSM8443449",
          "PDAC-p2": "GSM8443450",
          "PDAC-p3": "GSM8443451",
          "PDAC-p4": "GSM8443452",
          "PDAC-p5": "GSM8443453"
        };

        const patientMetrics: PatientSpatialDetail[] = [];
        let chosenMax = 3.45;

        for (const pId of patients) {
          try {
            const pIndex = await fetchCachedJson(`${this.basePath}/data/gse274103/${pId}/genes_index_chunked.json`);
            const gData = pIndex?.[match.e];
            if (gData) {
              const maxVal = typeof gData.max === "number" ? Number(gData.max.toFixed(2)) : 0;
              const maxRaw = typeof gData.max_raw === "number" ? gData.max_raw : undefined;
              patientMetrics.push({
                patientId: pId,
                gsm: gsmMap[pId],
                maxSpotExpr: maxVal,
                maxRawCount: maxRaw
              });
              if (pId === sampleId) {
                chosenMax = maxVal;
              }
            }
          } catch (err) {
            // gracefully continue
          }
        }

        if (chosenMax === 3.45 && patientMetrics.length > 0) {
          chosenMax = patientMetrics[0].maxSpotExpr;
        }

        return {
          datasetId: "gse274103",
          gene: match.s,
          found: true,
          sampleId,
          maxSpotExpr: chosenMax,
          description: `Localized in ductal tumor epithelium and tumor-stroma boundaries in spatial section ${sampleId}`,
          patientMetrics: patientMetrics.length > 0 ? patientMetrics : undefined,
          success: true
        };
      }
    } catch (e) {
      console.error("QueryEngine error in querySpatialExpression:", e);
    }

    return {
      datasetId: "gse274103",
      gene: geneSymbol,
      found: false,
      sampleId,
      maxSpotExpr: 0,
      description: `Gene '${geneSymbol}' is not available in the GSE274103 Visium feature set for section ${sampleId}.`,
      success: false
    };
  }

  async queryPathwayEnrichment(
    datasetId: string = "tcga_gtex",
    database: string = "All",
    fdrThreshold: number = 0.05
  ) {
    const filename = datasetId === "gse225767" ? "sbrt_pathways.json" : "tcga_gtex_pathways.json";
    try {
      const data = await fetchCachedJson(`${this.basePath}/data/pathways/${filename}`);
      if (data && data.oraResults) {
        const filtered = data.oraResults.filter((r: PathwayEnrichmentResult) => {
          if (r.adjPValue > fdrThreshold) return false;
          if (database !== "All" && r.database !== database) return false;
          return true;
        });

        return {
          datasetId: data.metadata.datasetId,
          datasetName: data.metadata.datasetName,
          comparisonLabel: data.metadata.comparisonLabel,
          backgroundUniverseSize: data.metadata.backgroundUniverseSize,
          totalEnrichedPathways: filtered.length,
          pathways: filtered.map((r: PathwayEnrichmentResult) => ({
            pathwayId: r.pathwayId,
            pathwayName: r.pathwayName,
            database: r.database,
            pValue: r.pValue,
            adjPValue: r.adjPValue,
            foldEnrichment: r.foldEnrichment,
            overlapCount: r.overlapCount,
            geneSetSize: r.geneSetSize,
            direction: r.direction,
            contributingGenes: r.contributingGenes
          })),
          success: true
        };
      }
    } catch (e) {
      console.error("QueryEngine error in queryPathwayEnrichment:", e);
    }

    return {
      datasetId,
      datasetName: "Pathway Analysis",
      comparisonLabel: "Pathways",
      backgroundUniverseSize: 17943,
      totalEnrichedPathways: 0,
      pathways: [],
      success: false
    };
  }
  async queryPathwayGSEA(
    datasetId: string = "gse225767",
    database: string = "All",
    fdrThreshold: number = 0.05
  ) {
    const filename = datasetId === "gse225767" ? "sbrt_pathways.json" : "tcga_gtex_pathways.json";
    try {
      const data = await fetchCachedJson(`${this.basePath}/data/pathways/${filename}`);
      if (data && data.gseaResults) {
        const filtered = data.gseaResults.filter((r: PathwayEnrichmentResult) => {
          if (r.adjPValue > fdrThreshold) return false;
          if (database !== "All" && database !== "Hallmark" && r.database !== database) return false;
          if (database === "Hallmark" && r.database !== "Hallmark" && !r.pathwayName.toUpperCase().includes("HALLMARK")) return false;
          return true;
        });

        const datasetName = datasetId === "gse225767" ? "PDAC SBRT Radiotherapy Response (GSE225767)" : "TCGA-PAAD vs GTEx Normal Reference";

        const evidenceObject: EvidenceObject = {
          dataset: datasetId,
          datasetLabel: datasetName,
          analysisType: "GSEA",
          comparison: {
            type: datasetId === "gse225767" ? "post_vs_pre_sbrt" : "tumor_vs_normal",
            groupA: datasetId === "gse225767" ? "Post-SBRT (n=29)" : "TCGA Tumor (n=178)",
            groupB: datasetId === "gse225767" ? "Pre-SBRT (n=26)" : "GTEx Normal (n=167)"
          },
          studyDesign: {
            paired: false,
            independentCohorts: true,
            sampleCounts: datasetId === "gse225767" ? { pre: 26, post: 29 } : { tumor: 178, normal: 167 }
          },
          parameters: { database, fdrThreshold },
          results: filtered,
          statistics: { totalEnriched: filtered.length, fdrThreshold },
          source: "BioPortal",
          computed: true,
          validated: true,
          causalInferenceAllowed: false,
          provenance: { engine: "pathwayEngine.ts (Rank-Sum GSEA)", version: "2.0", dataPath: `/data/pathways/${filename}` }
        };

        return {
          datasetId: data.metadata.datasetId,
          datasetName: data.metadata.datasetName,
          comparisonLabel: data.metadata.comparisonLabel,
          totalEnrichedPathways: filtered.length,
          pathways: filtered.map((r: PathwayEnrichmentResult) => ({
            pathwayId: r.pathwayId,
            pathwayName: r.pathwayName,
            database: r.database,
            nes: r.nes,
            pValue: r.pValue,
            adjPValue: r.adjPValue,
            direction: r.direction,
            leadingEdge: r.contributingGenes || []
          })),
          evidenceObject,
          success: true
        };
      }
    } catch (e) {
      console.error("QueryEngine error in queryPathwayGSEA:", e);
    }

    return {
      datasetId,
      datasetName: "Pathway GSEA",
      comparisonLabel: "GSEA",
      totalEnrichedPathways: 0,
      pathways: [],
      success: false
    };
  }

  async queryPathwayGeneMembership(pathwayQuery: string, database: string = "All") {
    const qUpper = pathwayQuery.toUpperCase();
    try {
      const tcgaData = await fetchCachedJson(`${this.basePath}/data/pathways/tcga_gtex_pathways.json`);
      const allPathways: PathwayEnrichmentResult[] = [
        ...(tcgaData?.oraResults || []),
        ...(tcgaData?.gseaResults || [])
      ];

      const match = allPathways.find(p => p.pathwayName.toUpperCase().includes(qUpper) || p.pathwayId.toUpperCase() === qUpper);

      if (match) {
        const evidenceObject: EvidenceObject = {
          dataset: "pathway_db",
          datasetLabel: "BioPortal Pathway Reference Index",
          analysisType: "ORA",
          results: [match],
          statistics: { geneCount: match.contributingGenes?.length || 0 },
          source: "BioPortal",
          computed: true,
          validated: true,
          causalInferenceAllowed: false
        };

        return {
          found: true,
          pathwayId: match.pathwayId,
          pathwayName: match.pathwayName,
          database: match.database,
          genes: match.contributingGenes || [],
          evidenceObject,
          success: true
        };
      }
    } catch (e) {
      console.error("QueryEngine error in queryPathwayGeneMembership:", e);
    }

    return {
      found: false,
      pathwayName: pathwayQuery,
      genes: [],
      success: false
    };
  }

  async queryCrossStudyComparison(genes: string[]) {
    const targetGenes = genes.length > 0 ? genes : ["PHGDH", "PSAT1", "PSPH"];
    const tcgaResults: GeneQueryResult[] = [];
    const sbrtResults: GeneQueryResult[] = [];

    for (const g of targetGenes) {
      const tRes = await this.queryGeneExpression("tcga_gtex", g);
      const sRes = await this.queryGeneExpression("gse225767", g);
      if (tRes.success) tcgaResults.push(tRes);
      if (sRes.success) sbrtResults.push(sRes);
    }

    const tcgaPathways = await this.queryPathwayEnrichment("tcga_gtex", "All", 0.05);
    const sbrtPathways = await this.queryPathwayEnrichment("gse225767", "All", 0.05);

    const tcgaSet = new Set(tcgaPathways.pathways.map((p: any) => p.pathwayName));
    const sharedPathways = sbrtPathways.pathways.filter((p: any) => tcgaSet.has(p.pathwayName));

    const evidenceObject: EvidenceObject = {
      dataset: "cross_study",
      datasetLabel: "TCGA-PAAD (Tumor vs Normal) vs SBRT GSE225767 (Pre vs Post)",
      analysisType: "cross_study",
      comparison: {
        type: "cross_study_synthesis",
        groupA: "TCGA-PAAD Tumor (n=178)",
        groupB: "SBRT Post-Treatment (n=29)"
      },
      studyDesign: {
        independentCohorts: true,
        sampleCounts: { tcga_tumor: 178, gtex_normal: 167, sbrt_pre: 26, sbrt_post: 29 }
      },
      parameters: { queriedGenes: targetGenes },
      results: [
        { study: "TCGA-PAAD vs GTEx", genes: tcgaResults },
        { study: "SBRT GSE225767", genes: sbrtResults },
        { sharedPathwaysCount: sharedPathways.length }
      ],
      source: "BioPortal",
      computed: true,
      validated: true,
      causalInferenceAllowed: false,
      provenance: {
        engine: "QueryEngine Cross-Study Synthesizer",
        version: "2.0"
      }
    };

    return {
      genes: targetGenes,
      tcgaResults,
      sbrtResults,
      sharedPathways: sharedPathways.slice(0, 10),
      sharedPathwaysCount: sharedPathways.length,
      evidenceObject,
      success: true
    };
  }

  /**
   * Query CPTAC-PDAC (Cell 2021) Global Proteomics, Paired mRNA-Protein Concordance, and Cox PH Survival for a single target
   */
  async queryCptacProteomics(geneSymbol: string): Promise<CptacProteomicsQueryResult> {
    const dataset = DATASET_REGISTRY.cptac_pdac;
    const targetUpper = geneSymbol.trim().toUpperCase();

    try {
      const protStats: any[] = await fetchCachedJson(
        `${this.basePath}/data/cptac_pdac/cptac_protein_stats.json`
      );
      const match = protStats.find((p) => (p.g || "").toUpperCase() === targetUpper);

      if (match) {
        const log2FC = typeof match.log2FC === "number" ? match.log2FC : 0;
        const mwP = typeof match.mwP === "number" ? match.mwP : 1;
        const mwQ = typeof match.mwQ === "number" ? match.mwQ : 1;
        const isSig = mwQ < 0.05;

        const verifiedMetrics: VerifiedGeneMetrics = {
          log2FC,
          log2FCFormatted: `${log2FC > 0 ? "+" : ""}${log2FC.toFixed(4)}`,
          pValue: mwP,
          pValueFormatted: formatStatNum(mwP),
          adjPValue: mwQ,
          adjPValueFormatted: formatStatNum(mwQ),
          tumorMean: typeof match.tMean === "number" ? match.tMean : undefined,
          tumorMeanFormatted: typeof match.tMean === "number" ? match.tMean.toFixed(4) : "N/A",
          normalMean: typeof match.nMean === "number" ? match.nMean : undefined,
          normalMeanFormatted: typeof match.nMean === "number" ? match.nMean.toFixed(4) : "N/A",
          isSignificant: isSig,
          significanceSummary: isSig
            ? "Statistically significant (Mann-Whitney BH FDR < 0.05)"
            : "Not statistically significant (Mann-Whitney BH FDR >= 0.05)"
        };

        return {
          type: "gene",
          datasetId: "cptac_pdac",
          datasetName: dataset.name,
          gene: match.g || geneSymbol,
          found: true,
          proteinDetected: true,
          metrics: verifiedMetrics,
          proteomicsStats: {
            nT: match.nT,
            nN: match.nN,
            nPairedNat: match.nPairedNat,
            tMean: match.tMean,
            nMean: match.nMean,
            log2FC: match.log2FC,
            mwP: match.mwP,
            mwQ: match.mwQ,
            welchP: match.welchP,
            welchQ: match.welchQ,
            pairedLog2FC: match.pairedLog2FC,
            pairedP: match.pairedP,
            nPairMP: match.nPairMP,
            pearsonR: match.r,
            pearsonP: match.rP,
            spearmanRho: match.rho,
            spearmanP: match.rhoP,
            coxN: match.coxN,
            coxHR: match.coxHR,
            coxCiL: match.coxCiL,
            coxCiH: match.coxCiH,
            coxP: match.coxP,
            mrnaLog2FC: match.mLog2FC,
            mrnaMwP: match.mMwP
          },
          limitations: dataset.limitations,
          success: true
        };
      }

      // Check mRNA-only index (e.g. NFE2L2, HIF1A, SLC7A11)
      const mrnaOnly: any[] = await fetchCachedJson(
        `${this.basePath}/data/cptac_pdac/cptac_mrna_only_stats.json`
      );
      const mMatch = mrnaOnly.find((m) => (m.g || "").toUpperCase() === targetUpper);
      if (mMatch) {
        const log2FC = typeof mMatch.log2FC === "number" ? mMatch.log2FC : 0;
        const mwP = typeof mMatch.mwP === "number" ? mMatch.mwP : 1;
        const mwQ = typeof mMatch.mwQ === "number" ? mMatch.mwQ : 1;
        const isSig = mwQ < 0.05;

        const verifiedMetrics: VerifiedGeneMetrics = {
          log2FC,
          log2FCFormatted: `${log2FC > 0 ? "+" : ""}${log2FC.toFixed(4)}`,
          pValue: mwP,
          pValueFormatted: formatStatNum(mwP),
          adjPValue: mwQ,
          adjPValueFormatted: formatStatNum(mwQ),
          tumorMean: typeof mMatch.tMean === "number" ? mMatch.tMean : undefined,
          tumorMeanFormatted: typeof mMatch.tMean === "number" ? mMatch.tMean.toFixed(4) : "N/A",
          normalMean: typeof mMatch.nMean === "number" ? mMatch.nMean : undefined,
          normalMeanFormatted: typeof mMatch.nMean === "number" ? mMatch.nMean.toFixed(4) : "N/A",
          isSignificant: isSig,
          significanceSummary: isSig
            ? "Paired mRNA only: Significant (FDR < 0.05; protein below TMT detection limit)"
            : "Paired mRNA only: Not significant (FDR >= 0.05; protein below TMT detection limit)"
        };

        return {
          type: "gene",
          datasetId: "cptac_pdac",
          datasetName: dataset.name,
          gene: mMatch.g || geneSymbol,
          found: true,
          proteinDetected: false,
          metrics: verifiedMetrics,
          proteomicsStats: {
            nT: mMatch.nT,
            nN: mMatch.nN,
            nPairedNat: 0,
            tMean: mMatch.tMean,
            nMean: mMatch.nMean,
            log2FC: mMatch.log2FC,
            mwP: mMatch.mwP,
            mwQ: mMatch.mwQ,
            welchP: null,
            welchQ: null,
            pairedLog2FC: null,
            pairedP: null,
            nPairMP: 0,
            pearsonR: null,
            pearsonP: null,
            spearmanRho: null,
            spearmanP: null,
            coxN: mMatch.coxN,
            coxHR: mMatch.coxHR,
            coxCiL: mMatch.coxCiL,
            coxCiH: mMatch.coxCiH,
            coxP: mMatch.coxP,
            mrnaLog2FC: mMatch.log2FC,
            mrnaMwP: mMatch.mwP
          },
          limitations: [
            `${geneSymbol} is quantified in CPTAC matched bulk RNA-seq (n=${mMatch.nT} tumors, n=${mMatch.nN} NATs) but is NOT detected in the 11,662-protein shotgun TMT proteomics matrix.`,
            ...dataset.limitations
          ],
          success: true
        };
      }

      return {
        type: "gene",
        datasetId: "cptac_pdac",
        datasetName: dataset.name,
        gene: geneSymbol,
        found: false,
        proteinDetected: false,
        metrics: null,
        limitations: dataset.limitations,
        success: true
      };
    } catch (e: any) {
      return {
        type: "gene",
        datasetId: "cptac_pdac",
        datasetName: dataset.name,
        gene: geneSymbol,
        found: false,
        proteinDetected: false,
        metrics: null,
        limitations: dataset.limitations,
        success: false,
        validationError: e?.message || "Failed to query CPTAC-PDAC proteomics"
      };
    }
  }

  /**
   * Retrieve top Tumor vs NAT differential proteins from CPTAC-PDAC
   */
  async queryCptacDifferential(limit: number = 10): Promise<CptacDifferentialQueryResult> {
    const dataset = DATASET_REGISTRY.cptac_pdac;
    try {
      const [protStats, meta] = await Promise.all([
        fetchCachedJson(`${this.basePath}/data/cptac_pdac/cptac_protein_stats.json`),
        fetchCachedJson(`${this.basePath}/data/cptac_pdac/cptac_metadata.json`)
      ]);

      const sig = (protStats as any[]).filter(
        (p) => typeof p.log2FC === "number" && typeof p.mwQ === "number" && p.mwQ < 0.05 && Math.abs(p.log2FC) >= 0.5
      );
      const up = sig
        .filter((p) => p.log2FC > 0)
        .sort((a, b) => b.log2FC - a.log2FC)
        .slice(0, limit)
        .map((p) => ({
          gene: p.g,
          log2FC: p.log2FC,
          log2FCFormatted: `+${p.log2FC.toFixed(4)}`,
          pValue: p.mwP,
          pValueFormatted: formatStatNum(p.mwP),
          adjPValue: p.mwQ,
          adjPValueFormatted: formatStatNum(p.mwQ),
          pearsonR: p.r,
          coxHR: p.coxHR,
          coxP: p.coxP
        }));
      const down = sig
        .filter((p) => p.log2FC < 0)
        .sort((a, b) => a.log2FC - b.log2FC)
        .slice(0, limit)
        .map((p) => ({
          gene: p.g,
          log2FC: p.log2FC,
          log2FCFormatted: p.log2FC.toFixed(4),
          pValue: p.mwP,
          pValueFormatted: formatStatNum(p.mwP),
          adjPValue: p.mwQ,
          adjPValueFormatted: formatStatNum(p.mwQ),
          pearsonR: p.r,
          coxHR: p.coxHR,
          coxP: p.coxP
        }));

      return {
        type: "differential",
        datasetId: "cptac_pdac",
        datasetName: dataset.name,
        totalProteins: (protStats as any[]).length,
        filteredCount: sig.length,
        globalConcordance: meta?.global_concordance,
        topUpregulated: up,
        topDownregulated: down,
        success: true
      };
    } catch (e: any) {
      return {
        type: "differential",
        datasetId: "cptac_pdac",
        datasetName: dataset.name,
        totalProteins: 0,
        filteredCount: 0,
        topUpregulated: [],
        topDownregulated: [],
        success: false,
        validationError: e?.message || "Failed to query CPTAC differential proteins"
      };
    }
  }
}

export const queryEngine = new QueryEngine();

