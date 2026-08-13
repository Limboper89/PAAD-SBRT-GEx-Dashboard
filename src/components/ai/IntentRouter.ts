// IntentRouter.ts - Biological Intent Parser & Dataset Router for PDACopilot (v1.2 Conversation-Aware Resolution)

import { DATASET_REGISTRY, listAvailableDatasets } from "./DatasetRegistry";
import { queryEngine, GeneQueryResult, DifferentialQueryResult, TopExpressedQueryResult, SingleNucleusQueryResult, SpatialQueryResult } from "./QueryEngine";
import { ActiveModuleContext } from "./AIProvider";

export interface QueryPlan {
  intent: string;
  entities: {
    genes: string[];
    cellTypes?: string[];
    samples?: string[];
  };
  comparison?: {
    type: string;
    group1?: string;
    group2?: string;
  };
  targetDatasets: string[];
  isPageSpecificQuestion: boolean;
  reasoning: string;
}

export interface ProvenanceItem {
  datasetId: string;
  datasetName: string;
  status: "success" | "failed" | "not_required";
  operation?: string;
  queryDetails?: string;
}

export interface QueryExecutionResult {
  plan: QueryPlan;
  datasetResults: {
    tcga_gtex?: GeneQueryResult | DifferentialQueryResult | TopExpressedQueryResult;
    gse225767?: GeneQueryResult | DifferentialQueryResult | TopExpressedQueryResult;
    gse202051?: SingleNucleusQueryResult;
    gse274103?: SpatialQueryResult;
    availableDatasets?: any[];
  };
  provenance: ProvenanceItem[];
  confidence: "High" | "Moderate" | "Low";
}

export class IntentRouter {
  /**
   * Extract gene symbols dynamically using pattern matching, English stopword suppression, & dynamic dataset index validation (NO HARDCODED LIST)
   */
  public async extractGenes(question: string, currentPageContext?: ActiveModuleContext): Promise<string[]> {
    const foundGenes = new Set<string>();

    const geneRegex = /\b[A-Z0-9]{2,10}\b/g;
    const matches = question.toUpperCase().match(geneRegex) || [];

    const stopwords = new Set([
      "WHAT", "HOW", "WHY", "THE", "AND", "FOR", "ARE", "WAS", "WHO", "CAN", "DID", "WHICH",
      "IS", "IN", "IT", "IF", "OF", "ON", "OR", "AT", "TO", "BY", "AS", "AN", "AM", "WE", "DO", "GO", "NO", "SO", "UP", "US", "MY", "ME", "HE", "HI", "OH",
      "HAS", "HAD", "HAVE", "DOES", "LEVEL", "LEVELS", "EXPRESSION", "EXPRESSED", "SAMPLE", "SAMPLES",
      "COMPARE", "COMPARED", "COMPARING", "BETWEEN", "WITH", "WITHOUT", "VERSUS", "CHANGE", "CHANGES",
      "DIFFERENCE", "DIFFERENCES", "HIGHER", "LOWER", "PAAD", "TCGA", "GTEX", "PDAC", "SBRT", "UMAP",
      "PANCREAS", "PANCREATIC", "TUMOR", "TUMORS", "NORMAL", "PRE", "POST", "BULK", "SINGLE", "NUCLEI", "CELL", "CELLS",
      "SPATIAL", "SPATIALLY", "VISIUM", "ATLAS", "DEG", "DEGS", "FC", "LOG2FC", "FDR", "PVAL", "VALUE", "VALUES",
      "DATASET", "DATASETS", "AVAILABLE", "USING", "DEFAULT", "CRITERIA", "FILTER", "FILTERS", "LIST", "SHOW",
      "GET", "FIND", "GIVE", "TELL", "TOP", "MOST", "ABUNDANT", "ABUNDANCE", "BOTH", "ALL", "ANY", "EACH", "MORE", "LESS",
      "AFTER", "BEFORE", "DURING", "ABOUT", "INTO", "OVER", "ALSO", "THAN", "THEN", "FROM", "THEM", "THAT", "THIS", "THESE", "THOSE",
      "AMONG", "ONES", "ABOVE", "THESE", "THOSE", "THEIR", "STRONGLY", "ASSOCIATED", "BIOLOGY", "BIOLOGICAL", "RELEVANT"
    ]);

    for (const m of matches) {
      if (!stopwords.has(m) && !/^\d+$/.test(m)) {
        const valid = await queryEngine.isValidGeneSymbol(m);
        if (valid) {
          foundGenes.add(m);
        }
      }
    }

    if (foundGenes.size === 0 && currentPageContext?.gene) {
      const activeGene = currentPageContext.gene.toUpperCase();
      const valid = await queryEngine.isValidGeneSymbol(activeGene);
      if (valid) {
        foundGenes.add(activeGene);
      }
    }

    return Array.from(foundGenes);
  }

  /**
   * Detect conversational anaphora referring to previous query results
   */
  private isConversationalAnaphora(qLower: string): boolean {
    const anaphoricPhrases = [
      "which ones",
      "among them",
      "among these",
      "among the",
      "these genes",
      "those genes",
      "the above",
      "of these",
      "which of these",
      "which of the",
      "their biological",
      "those degs",
      "most strongly changed",
      "most biologically"
    ];
    return anaphoricPhrases.some(phrase => qLower.includes(phrase));
  }

  /**
   * Parse user question into a structured QueryPlan with v1.2 Conversation-Aware Dataset Resolution
   */
  public async parseIntent(
    question: string,
    currentPageContext?: ActiveModuleContext,
    previousPlan?: QueryPlan
  ): Promise<QueryPlan> {
    const qLower = question.toLowerCase();
    let genes = await this.extractGenes(question, currentPageContext);

    // Resolution Priority 1: Explicit Dataset Mention in Current Question (Highest Priority)
    const hasExplicitTcga = qLower.includes("tcga") || qLower.includes("gtex") || qLower.includes("paad");
    const hasExplicitSbrt = qLower.includes("sbrt") || qLower.includes("gse225767") || qLower.includes("radiotherapy") || qLower.includes("radiation") || qLower.includes("after sbrt");
    const hasExplicitSn = qLower.includes("single-nucleus") || qLower.includes("single nucleus") || qLower.includes("gse202051");
    const hasExplicitSpatial = qLower.includes("spatial") || qLower.includes("visium") || qLower.includes("gse274103");

    // Resolution Priority 2: Explicit Biological Comparison in Current Question
    const hasExplicitTumorNormal = qLower.includes("tumor vs normal") || qLower.includes("tumor versus normal") || qLower.includes("normal pancreas");
    const hasExplicitPrePost = qLower.includes("pre vs post") || qLower.includes("pre- vs post-") || qLower.includes("after treatment");

    // Check 1: Explicit Datasets List Overview
    if (qLower.includes("available datasets") || qLower.includes("what datasets") || qLower.includes("list datasets") || (qLower.includes("datasets") && qLower.includes("available"))) {
      return {
        intent: "list_available_datasets",
        entities: { genes },
        targetDatasets: ["tcga_gtex", "gse225767", "gse202051", "gse274103"],
        isPageSpecificQuestion: false,
        reasoning: "Query requests list of all available PDAC BioPortal datasets"
      };
    }

    // Resolution Priority 3: Conversational Anaphora Resolution (Inherit dataset & genes from previous turn)
    const isAnaphoric = this.isConversationalAnaphora(qLower);
    if (isAnaphoric && previousPlan && !hasExplicitTcga && !hasExplicitSbrt && !hasExplicitSn && !hasExplicitSpatial && !hasExplicitTumorNormal && !hasExplicitPrePost) {
      if (genes.length === 0 && previousPlan.entities.genes.length > 0) {
        genes = [...previousPlan.entities.genes];
      }
      return {
        intent: previousPlan.intent.includes("differential_expression") ? "differential_expression_followup" : "conversational_followup",
        entities: { genes },
        targetDatasets: [...previousPlan.targetDatasets],
        isPageSpecificQuestion: false,
        reasoning: `Conversational reference ("which ones/these genes") resolved from previous turn: inherited dataset (${previousPlan.targetDatasets.join(", ")})`
      };
    }

    // Check 2: Top Expressed Genes Abundance (Absolute expression level, NOT DEGs)
    if (
      (qLower.includes("top") && qLower.includes("expressed")) ||
      qLower.includes("highest expressed") ||
      qLower.includes("most abundant") ||
      qLower.includes("expression abundance")
    ) {
      let targets = ["gse225767"];
      if (hasExplicitTcga || hasExplicitTumorNormal) targets = ["tcga_gtex"];
      else if (hasExplicitSbrt || hasExplicitPrePost) targets = ["gse225767"];
      else if (currentPageContext?.module.includes("TCGA")) targets = ["tcga_gtex"];

      return {
        intent: "top_expressed_genes_list",
        entities: { genes },
        targetDatasets: targets,
        isPageSpecificQuestion: false,
        reasoning: "Question requests top baseline expressed genes by absolute matrix abundance (distinct from differential expression DEGs)"
      };
    }

    // Check 3: Page-Specific Figure / Plot Explanation Questions
    if (
      qLower.includes("this plot") ||
      qLower.includes("current figure") ||
      qLower.includes("this figure") ||
      qLower.includes("explain plot") ||
      qLower.includes("explain heatmap") ||
      qLower.includes("explain volcano")
    ) {
      const pageModule = currentPageContext?.module || "";
      let targets = ["gse225767"];
      if (pageModule.includes("TCGA")) targets = ["tcga_gtex"];
      else if (pageModule.includes("SBRT")) targets = ["gse225767"];
      else if (pageModule.includes("Single")) targets = ["gse202051"];
      else if (pageModule.includes("Spatial")) targets = ["gse274103"];

      return {
        intent: "explain_current_figure",
        entities: { genes },
        targetDatasets: targets,
        isPageSpecificQuestion: true,
        reasoning: `Question refers specifically to current page visualization (${currentPageContext?.currentFigure || "active plot"})`
      };
    }

    // Check 4: Multi-dataset / Cross-module synthesis
    if (
      qLower.includes("compare bulk") ||
      qLower.includes("across all modules") ||
      qLower.includes("cross-module") ||
      qLower.includes("all datasets") ||
      qLower.includes("across all datasets") ||
      (qLower.includes("bulk") && qLower.includes("single-nucleus") && qLower.includes("spatial"))
    ) {
      return {
        intent: "cross_module_synthesis",
        entities: { genes },
        targetDatasets: ["tcga_gtex", "gse225767", "gse202051", "gse274103"],
        isPageSpecificQuestion: false,
        reasoning: "Question explicitly requests multimodal cross-dataset comparison"
      };
    }

    // Check 5: Differential Expression Query List
    if (qLower.includes("differentially expressed") || qLower.includes("upregulated") || qLower.includes("downregulated") || qLower.includes("top deg") || qLower.includes("differential-expression")) {
      let targets = ["gse225767"];
      if (hasExplicitTcga || hasExplicitTumorNormal) targets = ["tcga_gtex"];
      else if (hasExplicitSbrt || hasExplicitPrePost) targets = ["gse225767"];
      else if (currentPageContext?.module.includes("TCGA")) targets = ["tcga_gtex"];

      return {
        intent: "differential_expression_list",
        entities: { genes },
        targetDatasets: targets,
        isPageSpecificQuestion: false,
        reasoning: "Question intent requests top differentially expressed gene lists using default threshold criteria"
      };
    }

    // Check 6: Explicit Tumor vs Normal / Baseline Expression (TCGA-GTEx)
    if (hasExplicitTcga || hasExplicitTumorNormal) {
      return {
        intent: "tumor_vs_normal_comparison",
        entities: { genes },
        comparison: { type: "tumor_vs_normal", group1: "TCGA-PAAD Primary Tumor", group2: "GTEx Normal Pancreas" },
        targetDatasets: ["tcga_gtex"],
        isPageSpecificQuestion: false,
        reasoning: "Explicit TCGA / tumor-vs-normal comparison in question routes to TCGA-GTEx regardless of current page context"
      };
    }

    // Check 7: Explicit Radiotherapy / SBRT Treatment Response (GSE225767)
    if (hasExplicitSbrt || hasExplicitPrePost) {
      return {
        intent: "radiotherapy_treatment_response",
        entities: { genes },
        comparison: { type: "pre_vs_post_SBRT", group1: "Pre-SBRT Biopsy", group2: "Post-SBRT Resection" },
        targetDatasets: ["gse225767"],
        isPageSpecificQuestion: false,
        reasoning: "Explicit SBRT / radiation response in question routes to GSE225767 regardless of current page context"
      };
    }

    // Check 8: Explicit Single-Nucleus / Cell-Type Lineage (GSE202051)
    if (hasExplicitSn || qLower.includes("cell population") || qLower.includes("cell type") || qLower.includes("lineage") || qLower.includes("epithelial") || qLower.includes("caf")) {
      return {
        intent: "cell_type_lineage_expression",
        entities: { genes },
        targetDatasets: ["gse202051"],
        isPageSpecificQuestion: false,
        reasoning: "Question intent targets single-nucleus cell population specificity (GSE202051 dataset)"
      };
    }

    // Check 9: Explicit Spatial Localization (GSE274103)
    if (hasExplicitSpatial || qLower.includes("spatially") || qLower.includes("spot") || qLower.includes("tumor boundary")) {
      return {
        intent: "spatial_localization",
        entities: { genes },
        targetDatasets: ["gse274103"],
        isPageSpecificQuestion: false,
        reasoning: "Question intent targets spatial tissue spot localization (GSE274103 dataset)"
      };
    }

    // Fallback A: If query contains a specific gene, route to both TCGA-GTEx and SBRT for complete coverage
    if (genes.length > 0) {
      return {
        intent: "gene_expression_lookup",
        entities: { genes },
        targetDatasets: ["tcga_gtex", "gse225767"],
        isPageSpecificQuestion: false,
        reasoning: `Gene lookup for ${genes.join(", ")} routed to TCGA-GTEx and SBRT datasets`
      };
    }

    // Fallback B: Current page context fallback
    const pageModule = currentPageContext?.module || "";
    let defaultTarget = ["gse225767"];
    if (pageModule.includes("TCGA")) defaultTarget = ["tcga_gtex"];
    else if (pageModule.includes("SBRT")) defaultTarget = ["gse225767"];
    else if (pageModule.includes("Single")) defaultTarget = ["gse202051"];
    else if (pageModule.includes("Spatial")) defaultTarget = ["gse274103"];

    return {
      intent: "general_portal_query",
      entities: { genes: [] },
      targetDatasets: defaultTarget,
      isPageSpecificQuestion: false,
      reasoning: "General biological query fallback using current page context"
    };
  }

  /**
   * Route plan to QueryEngine and track actual provenance + deterministic confidence
   */
  public async executeRoute(plan: QueryPlan): Promise<QueryExecutionResult> {
    const datasetResults: QueryExecutionResult["datasetResults"] = {};
    const provenance: ProvenanceItem[] = [];

    const targetSet = new Set(plan.targetDatasets);
    const primaryGene = plan.entities.genes[0];

    // 1. Dataset List Query
    if (plan.intent === "list_available_datasets") {
      datasetResults.availableDatasets = listAvailableDatasets();
    }

    // 2. Query TCGA-GTEx if targeted
    if (targetSet.has("tcga_gtex")) {
      if (plan.intent === "top_expressed_genes_list") {
        const topRes = await queryEngine.queryTopExpressedGenes("tcga_gtex");
        datasetResults.tcga_gtex = topRes;
        provenance.push({
          datasetId: "tcga_gtex",
          datasetName: DATASET_REGISTRY.tcga_gtex.name,
          status: topRes.success ? "success" : "failed",
          operation: "queryTopExpressedGenes",
          queryDetails: topRes.success ? `Calculated top ${topRes.genes.length} expressed genes by baseline abundance` : "Failed to calculate top expressed genes"
        });
      } else if (plan.intent === "differential_expression_list" || plan.intent === "differential_expression_followup") {
        const diffRes = await queryEngine.queryDifferentialExpression("tcga_gtex");
        datasetResults.tcga_gtex = diffRes;
        provenance.push({
          datasetId: "tcga_gtex",
          datasetName: DATASET_REGISTRY.tcga_gtex.name,
          status: diffRes.success ? "success" : "failed",
          operation: "queryDifferentialExpression",
          queryDetails: diffRes.success
            ? `Filtered ${diffRes.filteredCount} DEGs (Wilcoxon FDR < 0.05, log2FC >= 1.5)`
            : "Failed to read TCGA-GTEx differential expression file"
        });
      } else if (primaryGene) {
        const geneRes = await queryEngine.queryGeneExpression("tcga_gtex", primaryGene);
        datasetResults.tcga_gtex = geneRes;
        provenance.push({
          datasetId: "tcga_gtex",
          datasetName: DATASET_REGISTRY.tcga_gtex.name,
          status: geneRes.success && geneRes.found ? "success" : "failed",
          operation: "queryGeneExpression",
          queryDetails: geneRes.found && geneRes.metrics
            ? `Retrieved ${primaryGene} log2FC=${geneRes.metrics.log2FCFormatted}, FDR=${geneRes.metrics.adjPValueFormatted}`
            : `Query failed: gene '${primaryGene}' not found in TCGA-GTEx dataset`
        });
      } else {
        provenance.push({
          datasetId: "tcga_gtex",
          datasetName: DATASET_REGISTRY.tcga_gtex.name,
          status: "failed",
          operation: "queryGeneExpression",
          queryDetails: "Query failed: no valid gene symbol identified in question"
        });
      }
    } else {
      provenance.push({
        datasetId: "tcga_gtex",
        datasetName: DATASET_REGISTRY.tcga_gtex.name,
        status: "not_required",
        queryDetails: "Not queried for this question"
      });
    }

    // 3. Query SBRT if targeted
    if (targetSet.has("gse225767")) {
      if (plan.intent === "top_expressed_genes_list") {
        const topRes = await queryEngine.queryTopExpressedGenes("gse225767");
        datasetResults.gse225767 = topRes;
        provenance.push({
          datasetId: "gse225767",
          datasetName: DATASET_REGISTRY.gse225767.name,
          status: topRes.success ? "success" : "failed",
          operation: "queryTopExpressedGenes",
          queryDetails: topRes.success ? `Calculated top ${topRes.genes.length} expressed genes from baseline matrix abundance` : "Failed to calculate top expressed genes"
        });
      } else if (plan.intent === "differential_expression_list" || plan.intent === "differential_expression_followup") {
        const diffRes = await queryEngine.queryDifferentialExpression("gse225767");
        datasetResults.gse225767 = diffRes;
        provenance.push({
          datasetId: "gse225767",
          datasetName: DATASET_REGISTRY.gse225767.name,
          status: diffRes.success ? "success" : "failed",
          operation: "queryDifferentialExpression",
          queryDetails: diffRes.success
            ? `Filtered ${diffRes.filteredCount} SBRT DEGs (p < 0.05, log2FC >= 1.0)`
            : "Failed to read SBRT differential expression file"
        });
      } else if (primaryGene) {
        const geneRes = await queryEngine.queryGeneExpression("gse225767", primaryGene);
        datasetResults.gse225767 = geneRes;
        provenance.push({
          datasetId: "gse225767",
          datasetName: DATASET_REGISTRY.gse225767.name,
          status: geneRes.success && geneRes.found ? "success" : "failed",
          operation: "queryGeneExpression",
          queryDetails: geneRes.found && geneRes.metrics
            ? `Retrieved ${primaryGene} Pre/Post log2FC=${geneRes.metrics.log2FCFormatted}, p=${geneRes.metrics.pValueFormatted}`
            : `Query failed: gene '${primaryGene}' not found in SBRT dataset`
        });
      } else {
        provenance.push({
          datasetId: "gse225767",
          datasetName: DATASET_REGISTRY.gse225767.name,
          status: "failed",
          operation: "queryGeneExpression",
          queryDetails: "Query failed: no valid gene symbol identified in question"
        });
      }
    } else {
      provenance.push({
        datasetId: "gse225767",
        datasetName: DATASET_REGISTRY.gse225767.name,
        status: "not_required",
        queryDetails: "Not queried for this question"
      });
    }

    // 4. Query Single Nucleus if targeted
    if (targetSet.has("gse202051")) {
      if (primaryGene) {
        const snRes = await queryEngine.querySingleNucleusExpression(primaryGene);
        datasetResults.gse202051 = snRes;
        provenance.push({
          datasetId: "gse202051",
          datasetName: DATASET_REGISTRY.gse202051.name,
          status: snRes.success && snRes.found ? "success" : "failed",
          operation: "querySingleNucleusExpression",
          queryDetails: snRes.found
            ? `Queried ${primaryGene} across 224,988 nuclei (Top lineage: ${snRes.topLineage})`
            : `Query failed: gene '${primaryGene}' not found in single-nucleus index`
        });
      } else {
        provenance.push({
          datasetId: "gse202051",
          datasetName: DATASET_REGISTRY.gse202051.name,
          status: "not_required",
          queryDetails: "Not queried for this question"
        });
      }
    } else {
      provenance.push({
        datasetId: "gse202051",
        datasetName: DATASET_REGISTRY.gse202051.name,
        status: "not_required",
        queryDetails: "Not queried for this question"
      });
    }

    // 5. Query Spatial if targeted
    if (targetSet.has("gse274103")) {
      if (primaryGene) {
        const spatialRes = await queryEngine.querySpatialExpression(primaryGene);
        datasetResults.gse274103 = spatialRes;
        provenance.push({
          datasetId: "gse274103",
          datasetName: DATASET_REGISTRY.gse274103.name,
          status: spatialRes.success && spatialRes.found ? "success" : "failed",
          operation: "querySpatialExpression",
          queryDetails: spatialRes.found
            ? `Queried ${primaryGene} spatial distribution in Visium section PDAC-p1`
            : `Query failed: gene '${primaryGene}' not found in spatial index`
        });
      } else {
        provenance.push({
          datasetId: "gse274103",
          datasetName: DATASET_REGISTRY.gse274103.name,
          status: "not_required",
          queryDetails: "Not queried for this question"
        });
      }
    } else {
      provenance.push({
        datasetId: "gse274103",
        datasetName: DATASET_REGISTRY.gse274103.name,
        status: "not_required",
        queryDetails: "Not queried for this question"
      });
    }

    // Single unified confidence calculation rule
    const successCount = provenance.filter(p => p.status === "success").length;
    const failedCount = provenance.filter(p => p.status === "failed").length;

    let confidence: "High" | "Moderate" | "Low" = "Low";

    if (failedCount > 0 && successCount === 0) {
      confidence = "Low";
    } else if (successCount > 0) {
      if (plan.targetDatasets.includes("gse225767") || plan.intent === "cross_module_synthesis") {
        confidence = "Moderate"; // SBRT unpaired cohorts limitation
      } else {
        confidence = "High";
      }
    }

    return {
      plan,
      datasetResults,
      provenance,
      confidence
    };
  }
}

export const intentRouter = new IntentRouter();
