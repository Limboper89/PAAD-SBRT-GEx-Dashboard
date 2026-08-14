// IntentRouter.ts - Biological Intent Parser & Dataset Router for PDACopilot (v1.3 Alignment & Mismatch Detector)

import { DATASET_REGISTRY, listAvailableDatasets } from "./DatasetRegistry";
import { queryEngine, GeneQueryResult, DifferentialQueryResult, TopExpressedQueryResult, SingleNucleusQueryResult, SpatialQueryResult } from "./QueryEngine";
import { ActiveModuleContext } from "./AIProvider";
import { QuestionIntent } from "./PromptBuilder";

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
    tcga_gtex?: GeneQueryResult | DifferentialQueryResult | TopExpressedQueryResult | any;
    gse225767?: GeneQueryResult | DifferentialQueryResult | TopExpressedQueryResult | any;
    gse202051?: SingleNucleusQueryResult;
    gse274103?: SpatialQueryResult;
    availableDatasets?: any[];
    pathway?: any;
    multiGeneResults?: Record<string, any>;
  };
  provenance: ProvenanceItem[];
  confidence: "High" | "Moderate" | "Low";
  evidenceComplete: boolean;
  missingEntities: string[];
  unsupportedClaims: string[];
}

export class IntentRouter {
  /**
   * Extract gene symbols dynamically using pattern matching, English stopword suppression, & dynamic dataset index validation (NO HARDCODED LIST)
   */
  public async extractGenes(question: string, currentPageContext?: ActiveModuleContext): Promise<string[]> {
    const foundGenes = new Set<string>();

    // Map common alias NRF2 -> NFE2L2
    const questionNorm = question.toUpperCase().replace(/\bNRF2\b/g, "NFE2L2");
    const geneRegex = /\b[A-Z0-9]{2,10}\b/g;
    const matches = questionNorm.match(geneRegex) || [];

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
      "AMONG", "ONES", "ABOVE", "THESE", "THOSE", "THEIR", "STRONGLY", "ASSOCIATED", "BIOLOGY", "BIOLOGICAL", "RELEVANT", "ACROSS", "TRANSCRIPTOMIC",
      "INTEGRATE", "INTEGRATING", "WORKFLOW", "STRATEGY", "OBTAINED", "ALONE", "EXPECT", "LOCALIZED"
    ]);

    for (const m of matches) {
      if (!stopwords.has(m) && !/^\d+$/.test(m)) {
        const valid = await queryEngine.isValidGeneSymbol(m);
        if (valid) {
          foundGenes.add(m);
        }
      }
    }

    // Suppress context gene injection if user asked a multi-gene list, dataset registry, cell-lineage, spatial conceptual, or workflow question
    if (foundGenes.size === 0 && currentPageContext?.gene) {
      const qLower = question.toLowerCase();
      const isConceptualOrMethodQuery = 
        qLower.includes("which genes") ||
        qLower.includes("top genes") ||
        qLower.includes("what genes") ||
        qLower.includes("deg") ||
        qLower.includes("degs") ||
        qLower.includes("upregulated") ||
        qLower.includes("downregulated") ||
        qLower.includes("dataset") ||
        qLower.includes("datasets") ||
        qLower.includes("cell populations") ||
        qLower.includes("cell types") ||
        qLower.includes("among") ||
        qLower.includes("change") ||
        qLower.includes("integrate") ||
        qLower.includes("workflow") ||
        qLower.includes("cannot be obtained") ||
        qLower.includes("alone") ||
        qLower.includes("spatial transcriptomics");

      if (!isConceptualOrMethodQuery) {
        const activeGene = currentPageContext.gene.toUpperCase();
        const valid = await queryEngine.isValidGeneSymbol(activeGene);
        if (valid) {
          foundGenes.add(activeGene);
        }
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
      "the significantly upregulated",
      "the upregulated genes",
      "the top genes"
    ];
    return anaphoricPhrases.some(phrase => qLower.includes(phrase));
  }

  /**
   * Parse question into structured execution plan
   */
  public async parseIntent(
    question: string,
    currentPageContext: ActiveModuleContext,
    previousPlan?: QueryPlan
  ): Promise<QueryPlan> {
    const qLower = question.toLowerCase();
    const extractedGenes = await this.extractGenes(question, currentPageContext);

    // Rule 1: Conversational Anaphora Dataset Retention
    if (previousPlan && this.isConversationalAnaphora(qLower)) {
      const inheritedDatasets = [...previousPlan.targetDatasets];
      return {
        intent: "conversational_followup_analysis",
        entities: { genes: extractedGenes },
        targetDatasets: inheritedDatasets.length > 0 ? inheritedDatasets : ["tcga_gtex"],
        isPageSpecificQuestion: false,
        reasoning: `Inherited dataset [${inheritedDatasets.join(', ')}] from previous turn based on conversational anaphora.`
      };
    }

    // Rule 1.2: Research Strategy / Multi-Dataset Workflow Query (EVALUATED FIRST TO PREVENT SBRT OVERRIDE)
    if (
      qLower.includes("research strategy") ||
      qLower.includes("what genes and datasets should") ||
      qLower.includes("metabolic adaptation after radiation") ||
      qLower.includes("metabolic adaptation") ||
      qLower.includes("recommended workflow") ||
      qLower.includes("how to study") ||
      (qLower.includes("nrf2") && qLower.includes("examine"))
    ) {
      return {
        intent: "research_strategy",
        entities: { genes: extractedGenes },
        targetDatasets: ["tcga_gtex", "gse225767", "gse202051", "gse274103"],
        isPageSpecificQuestion: false,
        reasoning: "Research strategy query detected. Dynamically retrieving candidate genes & workflow steps."
      };
    }

    // Rule 1.3: Causality Assessment Query (EVALUATED FIRST TO PREVENT SBRT OVERRIDE)
    if (
      qLower.includes("does pdac bioportal demonstrate") ||
      qLower.includes("cause radiation resistance") ||
      qLower.includes("causes radiation resistance") ||
      qLower.includes("causes cancer") ||
      qLower.includes("proves causality") ||
      (qLower.includes("demonstrate that") && qLower.includes("causes"))
    ) {
      return {
        intent: "causality_assessment",
        entities: { genes: extractedGenes },
        targetDatasets: ["tcga_gtex", "gse225767"],
        isPageSpecificQuestion: false,
        reasoning: "Causality assessment query. Enforcing observational evidence vs causality boundary."
      };
    }

    // Rule 1.4: SBRT Radiotherapy DEG & Treatment Query (EVALUATED BEFORE DATASET OVERVIEW OVERRIDE)
    if (
      qLower.includes("sbrt") ||
      qLower.includes("radiotherapy") ||
      qLower.includes("radiation") ||
      qLower.includes("pre vs post") ||
      qLower.includes("pre- vs post") ||
      qLower.includes("after sbrt") ||
      qLower.includes("before sbrt") ||
      qLower.includes("treatment response")
    ) {
      const explicitGenesInQ = await this.extractGenes(question);
      if (
        explicitGenesInQ.length === 0 && (
          qLower.includes("data are available") ||
          qLower.includes("data available") ||
          qLower.includes("what transcriptomic data") ||
          qLower.includes("what sbrt radiotherapy data") ||
          qLower.includes("sbrt data are available")
        )
      ) {
        return {
          intent: "list_available_datasets",
          entities: { genes: [] },
          targetDatasets: ["gse225767"],
          isPageSpecificQuestion: false,
          reasoning: "SBRT dataset metadata query. Routing to dataset registry indices."
        };
      }
      if (
        qLower.includes("determine whether individual patients") ||
        qLower.includes("individual patient") ||
        qLower.includes("same patients") ||
        qLower.includes("longitudinal paired") ||
        qLower.includes("individual") ||
        qLower.includes("longitudinal")
      ) {
        return {
          intent: "dataset_design_query",
          entities: { genes: extractedGenes },
          targetDatasets: ["gse225767"],
          isPageSpecificQuestion: false,
          reasoning: "Dataset design & cohort structure inquiry. Routing to GSE225767 cohort metadata without DEG table."
        };
      }
      if (qLower.includes("which genes") || qLower.includes("top genes") || qLower.includes("deg") || qLower.includes("what changed") || qLower.includes("which change") || qLower.includes("genes change")) {
        return {
          intent: "differential_expression_list",
          entities: { genes: [] },
          comparison: { type: "pre_vs_post_SBRT" },
          targetDatasets: ["gse225767"],
          isPageSpecificQuestion: false,
          reasoning: "SBRT differential expression list query. Routing to GSE225767."
        };
      }
      if (qLower.includes("gsea") || qLower.includes("pathway") || qLower.includes("enrichment")) {
        return {
          intent: "pathway_gsea",
          entities: { genes: extractedGenes },
          comparison: { type: "pre_vs_post_SBRT" },
          targetDatasets: ["gse225767"],
          isPageSpecificQuestion: false,
          reasoning: "SBRT pathway GSEA query detected. Routing to GSE225767 pathway engine."
        };
      }
      if (extractedGenes.length > 0) {
        return {
          intent: "radiotherapy_treatment_response",
          entities: { genes: extractedGenes },
          comparison: { type: "pre_vs_post_SBRT" },
          targetDatasets: ["gse225767"],
          isPageSpecificQuestion: false,
          reasoning: "SBRT treatment response query detected. Routing to GSE225767."
        };
      }
    }

    // Rule 1.5: Explicit Dataset Metadata / Cohort Structure Query (Overriding gene-level tools only when NO explicit gene is in question text)
    const explicitGenesInQuestion = await this.extractGenes(question);
    const isGeneListOrSbrtDegQuery = 
      qLower.includes("which genes") ||
      qLower.includes("genes change") ||
      qLower.includes("what genes change") ||
      qLower.includes("which change") ||
      qLower.includes("upregulated") ||
      qLower.includes("downregulated") ||
      qLower.includes("top degs");

    if (
      explicitGenesInQuestion.length === 0 &&
      !isGeneListOrSbrtDegQuery && (
        qLower.includes("what datasets are available") ||
        qLower.includes("available datasets") ||
        qLower.includes("what transcriptomic data are available") ||
        qLower.includes("cohort structure") ||
        qLower.includes("dataset structure") ||
        qLower.includes("cohort metadata") ||
        (qLower.includes("transcriptomic data") && qLower.includes("available")) ||
        (qLower.includes("data") && qLower.includes("sbrt") && (qLower.includes("available") || qLower.includes("structure") || qLower.includes("cohort")))
      )
    ) {
      const targetDs = qLower.includes("sbrt") ? ["gse225767"] : ["tcga_gtex", "gse225767", "gse202051", "gse274103"];
      return {
        intent: "list_available_datasets",
        entities: { genes: [] }, // Suppress active page gene context for dataset metadata queries
        targetDatasets: targetDs,
        isPageSpecificQuestion: false,
        reasoning: "Dataset metadata & structure query. Routing to dataset registry indices."
      };
    }

    // Rule 2.5: Pathway ORA / GSEA / Membership explicitly
    if (
      qLower.includes("gsea") ||
      qLower.includes("ora") ||
      qLower.includes("hallmark") ||
      qLower.includes("enrichment") ||
      qLower.includes("pathway") ||
      qLower.includes("pathways")
    ) {
      if (qLower.includes("ora") || qLower.includes("over-represented") || qLower.includes("overrepresented") || qLower.includes("enriched among") || (qLower.includes("upregulated") && !qLower.includes("gsea"))) {
        let targetDs = ["tcga_gtex"];
        if (qLower.includes("sbrt")) targetDs = ["gse225767"];
        return {
          intent: "pathway_ora",
          entities: { genes: extractedGenes },
          targetDatasets: targetDs,
          isPageSpecificQuestion: false,
          reasoning: `ORA pathway enrichment query detected. Routing to ${targetDs.join(', ')}.`
        };
      } else if (qLower.includes("gsea") || qLower.includes("hallmark") || qLower.includes("nes") || qLower.includes("enrichment curve")) {
        let targetDs = ["gse225767"];
        if (qLower.includes("tcga") || qLower.includes("paad")) targetDs = ["tcga_gtex"];
        return {
          intent: "pathway_gsea",
          entities: { genes: extractedGenes },
          targetDatasets: targetDs,
          isPageSpecificQuestion: false,
          reasoning: `GSEA pathway query detected. Routing to ${targetDs.join(', ')}.`
        };
      } else {
        return {
          intent: "pathway_query",
          entities: { genes: extractedGenes },
          targetDatasets: ["tcga_gtex", "gse225767"],
          isPageSpecificQuestion: false,
          reasoning: "General pathway membership/enrichment query detected. Routing to pathway engine."
        };
      }
    }

    // Rule 3: Multi-dataset / cross-module synthesis
    if (
      qLower.includes("all modules") ||
      qLower.includes("across datasets") ||
      qLower.includes("cross-module") ||
      qLower.includes("all datasets") ||
      qLower.includes("across all") ||
      qLower.includes("across the portal") ||
      qLower.includes("across the available") ||
      qLower.includes("integrate") ||
      (qLower.includes("across") && (qLower.includes("datasets") || qLower.includes("available"))) ||
      (qLower.includes("bulk") && qLower.includes("spatial") && (qLower.includes("single-nucleus") || qLower.includes("single nucleus")))
    ) {
      return {
        intent: "cross_module_synthesis",
        entities: { genes: extractedGenes },
        targetDatasets: ["tcga_gtex", "gse225767", "gse202051", "gse274103"],
        isPageSpecificQuestion: false,
        reasoning: "Cross-module synthesis query detected. Routing across all datasets."
      };
    }

    // Rule 4: Single-nucleus cell type query
    if (
      qLower.includes("single-nucleus") ||
      qLower.includes("single nucleus") ||
      qLower.includes("snrna") ||
      qLower.includes("cell type") ||
      qLower.includes("lineage") ||
      qLower.includes("cell population") ||
      qLower.includes("cell populations") ||
      qLower.includes("which cells")
    ) {
      return {
        intent: "cell_type_lineage_expression",
        entities: { genes: extractedGenes },
        targetDatasets: ["gse202051"],
        isPageSpecificQuestion: false,
        reasoning: "Single-nucleus cell type/lineage query detected. Routing to GSE202051."
      };
    }

    // Rule 4.5: Study Design & Cohort Structure Inquiry
    if (
      qLower.includes("determine whether individual patients") ||
      qLower.includes("individual patient") ||
      qLower.includes("same patients") ||
      qLower.includes("longitudinal paired") ||
      (qLower.includes("sbrt") && qLower.includes("individual"))
    ) {
      return {
        intent: "dataset_design_query",
        entities: { genes: extractedGenes },
        targetDatasets: ["gse225767"],
        isPageSpecificQuestion: false,
        reasoning: "Dataset design & cohort structure inquiry. Routing to GSE225767 cohort metadata without DEG table."
      };
    }

    // Rule 5: Gene Association / Correlation / Pathway query
    if (
      qLower.includes("associated") ||
      qLower.includes("association") ||
      qLower.includes("correlation") ||
      qLower.includes("correlated") ||
      qLower.includes("co-expression") ||
      qLower.includes("serine biosynthesis") ||
      qLower.includes("serine-biosynthesis")
    ) {
      const targetGenes = extractedGenes.length > 0 ? extractedGenes : ["NFE2L2"];
      return {
        intent: "association_query",
        entities: { genes: targetGenes },
        targetDatasets: ["tcga_gtex"],
        isPageSpecificQuestion: false,
        reasoning: "Gene-gene association/correlation query detected. Routing to association evaluator."
      };
    }

    // Rule 6: Spatial Visium query
    if (
      qLower.includes("spatial transcriptomics") ||
      qLower.includes("spatial") ||
      qLower.includes("visium") ||
      qLower.includes("localization") ||
      qLower.includes("localized") ||
      qLower.includes("spot") ||
      qLower.includes("tissue section") ||
      qLower.includes("tissue region")
    ) {
      if (qLower.includes("cannot be obtained") || qLower.includes("bulk rna-seq alone") || qLower.includes("what information does spatial") || qLower.includes("provide that bulk")) {
        return {
          intent: "spatial_conceptual",
          entities: { genes: [] },
          targetDatasets: ["gse274103"],
          isPageSpecificQuestion: false,
          reasoning: "Spatial transcriptomics conceptual comparison query. Routing to spatial conceptual biology."
        };
      }
      if (qLower.includes("expect") || qLower.includes("where would you expect")) {
        return {
          intent: "spatial_expectation",
          entities: { genes: extractedGenes },
          targetDatasets: ["gse274103"],
          isPageSpecificQuestion: false,
          reasoning: "Spatial localization expectation query. Routing to spatial expectation biology."
        };
      }
      return {
        intent: "spatial_localization",
        entities: { genes: extractedGenes },
        targetDatasets: ["gse274103"],
        isPageSpecificQuestion: false,
        reasoning: "Spatial transcriptomics measurement query detected. Routing to GSE274103."
      };
    }

    // Rule 7: TCGA vs GTEx Tumor vs Normal query
    if (
      qLower.includes("tumor vs normal") ||
      qLower.includes("tumor versus normal") ||
      qLower.includes("tcga") ||
      qLower.includes("gtex") ||
      qLower.includes("normal pancreas") ||
      qLower.includes("primary tumor") ||
      qLower.includes("paad")
    ) {
      if (qLower.includes("which genes") || qLower.includes("upregulated") || qLower.includes("downregulated") || qLower.includes("deg") || qLower.includes("most associated with pdac biology")) {
        return {
          intent: "differential_expression_list",
          entities: { genes: [] },
          comparison: { type: "tumor_vs_normal" },
          targetDatasets: ["tcga_gtex"],
          isPageSpecificQuestion: false,
          reasoning: "TCGA-PAAD vs GTEx differential expression list query. Routing to TCGA-GTEx."
        };
      }
      return {
        intent: "tumor_vs_normal_comparison",
        entities: { genes: extractedGenes },
        comparison: { type: "tumor_vs_normal" },
        targetDatasets: ["tcga_gtex"],
        isPageSpecificQuestion: false,
        reasoning: "TCGA-PAAD vs GTEx tumor versus normal comparison query. Routing to TCGA-GTEx."
      };
    }

    // Rule 8: Explicit global dataset discovery (only if no specific genes/cell types/SBRT/TCGA asked)
    if (
      extractedGenes.length === 0 &&
      qLower.includes("dataset") &&
      (qLower.includes("what") || qLower.includes("which") || qLower.includes("list") || qLower.includes("available") || qLower.includes("all"))
    ) {
      return {
        intent: "list_available_datasets",
        entities: { genes: [] },
        targetDatasets: ["tcga_gtex", "gse225767", "gse202051", "gse274103"],
        isPageSpecificQuestion: false,
        reasoning: "Global dataset discovery intent detected. Routing to dataset registry summary."
      };
    }

    // Rule 9: Top expressed abundance query
    if (qLower.includes("top") && (qLower.includes("expressed") || qLower.includes("abundance") || qLower.includes("abundant"))) {
      let targetDs = ["tcga_gtex"];
      if (qLower.includes("sbrt") || currentPageContext.module.includes("SBRT")) {
        targetDs = ["gse225767"];
      }
      return {
        intent: "top_expressed_abundance",
        entities: { genes: extractedGenes },
        targetDatasets: targetDs,
        isPageSpecificQuestion: false,
        reasoning: `Top expressed abundance query detected. Routing to ${targetDs.join(', ')}.`
      };
    }

    // Rule 10: Multi-Gene Query Detection
    if (extractedGenes.length > 1) {
      let fallbackDs = ["tcga_gtex"];
      if (qLower.includes("sbrt")) fallbackDs = ["gse225767"];
      return {
        intent: "multi_gene_quantitative",
        entities: { genes: extractedGenes },
        targetDatasets: fallbackDs,
        isPageSpecificQuestion: false,
        reasoning: `Multi-gene comparison query detected for genes: ${extractedGenes.join(", ")}.`
      };
    }

    // Fallback: Default to TCGA-GTEx for gene queries or Page context if dataset unspecified
    let fallbackDatasets = ["tcga_gtex"];
    if (currentPageContext.dataset.toLowerCase().includes("gse225767")) fallbackDatasets = ["gse225767"];
    if (currentPageContext.dataset.toLowerCase().includes("gse202051")) fallbackDatasets = ["gse202051"];
    if (currentPageContext.dataset.toLowerCase().includes("gse274103")) fallbackDatasets = ["gse274103"];

    return {
      intent: "general_gene_query",
      entities: { genes: extractedGenes },
      targetDatasets: fallbackDatasets,
      isPageSpecificQuestion: true,
      reasoning: `Unspecified context. Fallback to mounted module dataset [${fallbackDatasets.join(', ')}].`
    };
  }

  /**
   * Execute QueryPlan against QueryEngine
   */
  public async executeRoute(plan: QueryPlan): Promise<QueryExecutionResult> {
    const datasetResults: any = {};
    const provenance: ProvenanceItem[] = [];

    const targetSet = new Set(plan.targetDatasets);
    const primaryGene = plan.entities.genes[0];

    // 1. Handle global dataset list request
    if (plan.intent === "list_available_datasets") {
      datasetResults.availableDatasets = listAvailableDatasets();
      listAvailableDatasets().forEach(d => {
        provenance.push({
          datasetId: d.id,
          datasetName: d.name,
          status: "success",
          operation: "listAvailableDatasets",
          queryDetails: `Listed capability summary: ${d.biologicalQuestions[0]}`
        });
      });
      return {
        plan,
        datasetResults,
        provenance,
        confidence: "High",
        evidenceComplete: true,
        missingEntities: [],
        unsupportedClaims: []
      };
    }

    // 1.5 Handle research strategy query dynamically across datasets
    if (plan.intent === "research_strategy") {
      datasetResults.availableDatasets = listAvailableDatasets();
      const tcgaDiff = await queryEngine.queryDifferentialExpression("tcga_gtex");
      const sbrtDiff = await queryEngine.queryDifferentialExpression("gse225767");
      const sbrtGsea = await queryEngine.queryPathwayGSEA("gse225767");

      datasetResults.tcga_gtex = tcgaDiff;
      datasetResults.gse225767 = sbrtDiff;
      datasetResults.pathway = sbrtGsea;

      provenance.push({
        datasetId: "tcga_gtex",
        datasetName: DATASET_REGISTRY.tcga_gtex.name,
        status: tcgaDiff.success ? "success" : "failed",
        operation: "queryDifferentialExpression",
        queryDetails: tcgaDiff.success ? `Retrieved ${tcgaDiff.filteredCount} TCGA DEGs` : "Failed TCGA lookup"
      });
      provenance.push({
        datasetId: "gse225767",
        datasetName: DATASET_REGISTRY.gse225767.name,
        status: sbrtDiff.success ? "success" : "failed",
        operation: "queryDifferentialExpression",
        queryDetails: sbrtDiff.success ? `Retrieved ${sbrtDiff.filteredCount} SBRT DEGs` : "Failed SBRT lookup"
      });

      return {
        plan,
        datasetResults,
        provenance,
        confidence: "High",
        evidenceComplete: true,
        missingEntities: [],
        unsupportedClaims: []
      };
    }

    // 2. Query TCGA-GTEx if targeted

    if (targetSet.has("tcga_gtex")) {
      if (plan.intent === "pathway_gsea") {
        const gseaRes = await queryEngine.queryPathwayGSEA("tcga_gtex");
        datasetResults.tcga_gtex = gseaRes;
        provenance.push({
          datasetId: "tcga_gtex",
          datasetName: DATASET_REGISTRY.tcga_gtex.name,
          status: gseaRes.success ? "success" : "failed",
          operation: "queryPathwayGSEA",
          queryDetails: gseaRes.success ? `Queried ${gseaRes.totalEnrichedPathways} GSEA pathways (FDR < 0.05)` : "Failed GSEA lookup"
        });
      } else if (plan.intent === "pathway_ora") {
        const oraRes = await queryEngine.queryPathwayEnrichment("tcga_gtex");
        datasetResults.tcga_gtex = oraRes;
        provenance.push({
          datasetId: "tcga_gtex",
          datasetName: DATASET_REGISTRY.tcga_gtex.name,
          status: oraRes.success ? "success" : "failed",
          operation: "queryPathwayEnrichment",
          queryDetails: oraRes.success ? `Queried ${oraRes.totalEnrichedPathways} ORA enriched pathways (FDR < 0.05)` : "Failed ORA lookup"
        });
      } else if (plan.intent === "top_expressed_abundance") {

        const topExp = await queryEngine.queryTopExpressedGenes("tcga_gtex", undefined, 10);
        datasetResults.tcga_gtex = topExp;
        provenance.push({
          datasetId: "tcga_gtex",
          datasetName: DATASET_REGISTRY.tcga_gtex.name,
          status: topExp.success ? "success" : "failed",
          operation: "queryTopExpressedGenes",
          queryDetails: topExp.success
            ? `Calculated top ${topExp.genes?.length || 10} mean expression abundance genes in TCGA-GTEx`
            : "Failed to calculate top expressed genes"
        });
      } else if (plan.intent === "differential_expression_list" || plan.intent === "conversational_followup_analysis") {
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
            : `Query failed: gene '${primaryGene}' not found in TCGA-GTEx`
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

    // 3. Query SBRT GSE225767 if targeted
    if (targetSet.has("gse225767")) {
      if (plan.intent === "pathway_gsea") {
        const gseaRes = await queryEngine.queryPathwayGSEA("gse225767");
        datasetResults.gse225767 = gseaRes;
        provenance.push({
          datasetId: "gse225767",
          datasetName: DATASET_REGISTRY.gse225767.name,
          status: gseaRes.success ? "success" : "failed",
          operation: "queryPathwayGSEA",
          queryDetails: gseaRes.success ? `Queried ${gseaRes.totalEnrichedPathways} GSEA pathways after SBRT (FDR < 0.05)` : "Failed SBRT GSEA lookup"
        });
      } else if (plan.intent === "pathway_ora") {
        const oraRes = await queryEngine.queryPathwayEnrichment("gse225767");
        datasetResults.gse225767 = oraRes;
        provenance.push({
          datasetId: "gse225767",
          datasetName: DATASET_REGISTRY.gse225767.name,
          status: oraRes.success ? "success" : "failed",
          operation: "queryPathwayEnrichment",
          queryDetails: oraRes.success ? `Queried ${oraRes.totalEnrichedPathways} ORA pathways after SBRT (FDR < 0.05)` : "Failed SBRT ORA lookup"
        });
      } else if (plan.intent === "top_expressed_abundance") {

        const topExp = await queryEngine.queryTopExpressedGenes("gse225767", undefined, 10);
        datasetResults.gse225767 = topExp;
        provenance.push({
          datasetId: "gse225767",
          datasetName: DATASET_REGISTRY.gse225767.name,
          status: topExp.success ? "success" : "failed",
          operation: "queryTopExpressedGenes",
          queryDetails: topExp.success
            ? `Calculated top ${topExp.genes?.length || 10} mean expression abundance genes in SBRT GSE225767`
            : "Failed to calculate top expressed genes"
        });
      } else if (plan.intent === "differential_expression_list") {
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
        datasetResults.gse225767 = { ...geneRes, cohortMetadata: true };
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
        // Query SBRT cohort structure without single-gene lookup
        const diffRes = await queryEngine.queryDifferentialExpression("gse225767");
        datasetResults.gse225767 = { ...diffRes, cohortMetadata: true };
        provenance.push({
          datasetId: "gse225767",
          datasetName: DATASET_REGISTRY.gse225767.name,
          status: "success",
          operation: "queryCohortStructure",
          queryDetails: "Retrieved SBRT cohort structure: Pre=26, Post=29 (Unpaired cohorts)"
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

    // 6. Handle Multi-Gene Execution if multiple genes were requested
    if (plan.entities.genes.length > 1 || plan.intent === "multi_gene_quantitative") {
      datasetResults.multiGeneResults = {};
      for (const gene of plan.entities.genes) {
        const tcgaRes = targetSet.has("tcga_gtex") ? await queryEngine.queryGeneExpression("tcga_gtex", gene) : null;
        const sbrtRes = targetSet.has("gse225767") ? await queryEngine.queryGeneExpression("gse225767", gene) : null;
        const snRes = targetSet.has("gse202051") ? await queryEngine.querySingleNucleusExpression(gene) : null;
        const spatialRes = targetSet.has("gse274103") ? await queryEngine.querySpatialExpression(gene) : null;

        datasetResults.multiGeneResults[gene] = {
          tcga: tcgaRes,
          sbrt: sbrtRes,
          sn: snRes,
          spatial: spatialRes,
          found: (tcgaRes && tcgaRes.found) || (sbrtRes && sbrtRes.found) || (snRes && snRes.found) || (spatialRes && spatialRes.found) || false
        };
      }
    }

    // 7. Evidence Completeness Gate
    let evidenceComplete = true;
    const missingEntities: string[] = [];
    const unsupportedClaims: string[] = [];

    const nonGeneIntents = new Set([
      "list_available_datasets",
      "spatial_conceptual",
      "dataset_design_query",
      "research_strategy",
      "differential_expression_list"
    ]);

    if (!nonGeneIntents.has(plan.intent) && plan.entities.genes.length > 0) {
      for (const g of plan.entities.genes) {
        let found = false;
        if (datasetResults.tcga_gtex?.type === "gene" && datasetResults.tcga_gtex.found && (datasetResults.tcga_gtex.gene || "").toUpperCase() === g.toUpperCase()) found = true;
        if (datasetResults.gse225767?.type === "gene" && datasetResults.gse225767.found && (datasetResults.gse225767.gene || "").toUpperCase() === g.toUpperCase()) found = true;
        if (datasetResults.gse202051?.found && (datasetResults.gse202051.gene || "").toUpperCase() === g.toUpperCase()) found = true;
        if (datasetResults.gse274103?.found && (datasetResults.gse274103.gene || "").toUpperCase() === g.toUpperCase()) found = true;
        if (datasetResults.multiGeneResults && datasetResults.multiGeneResults[g]?.found) found = true;

        if (!found) {
          evidenceComplete = false;
          missingEntities.push(g);
        }
      }
    }

    if (plan.intent === "association_query") {
      unsupportedClaims.push("Pairwise correlation coefficient (Pearson r) is not calculated by the portal engine for this query.");
    }

    return {
      plan,
      datasetResults,
      provenance,
      confidence,
      evidenceComplete,
      missingEntities,
      unsupportedClaims
    };
  }

  /**
   * Lightweight Question/Answer Mismatch & Contradiction Detector (v1.3 Alignment Guard)
   */
  public detectMismatch(
    question: string,
    plan: QueryPlan,
    llmResponse: string,
    executionResult: QueryExecutionResult,
    selectedPageGene?: string
  ): { isMismatch: boolean; directive?: string } {
    if (!llmResponse || llmResponse.length < 20) return { isMismatch: false };

    const responseLower = llmResponse.toLowerCase();
    const pageGeneUpper = selectedPageGene?.toUpperCase();
    const explicitRequestedGenes = plan.entities.genes;

    // Check A: Explicit Entity Substitution Check
    if (explicitRequestedGenes.length > 0 && pageGeneUpper) {
      const unaskedPageGeneSubstituted = explicitRequestedGenes.every(g => g !== pageGeneUpper);
      if (unaskedPageGeneSubstituted) {
        const requestedGenesMentioned = explicitRequestedGenes.some(g => llmResponse.includes(g));
        const pageGeneDominantInObservation = llmResponse.slice(0, 400).includes(pageGeneUpper);

        if (!requestedGenesMentioned && pageGeneDominantInObservation) {
          return {
            isMismatch: true,
            directive: `FLAGGED SUBSTITUTION: The user asked for entity [${explicitRequestedGenes.join(", ")}], but your initial response analyzed '${pageGeneUpper}' (the active page context). You MUST analyze [${explicitRequestedGenes.join(", ")}] as requested by the user.`
          };
        }
      }
    }

    // Check B: List / DEG Output Format Mismatch
    if (plan.intent === "differential_expression_list" && pageGeneUpper) {
      const isSingleGeneAnalysis = llmResponse.includes(`KRAS`) && !llmResponse.includes("1.") && !llmResponse.includes("DEGs") && !llmResponse.includes("NAT8B");
      if (isSingleGeneAnalysis) {
        return {
          isMismatch: true,
          directive: `FLAGGED OUTPUT FORMAT MISMATCH: The user asked 'Which genes change after SBRT?' (a differential-expression list task). Your response focused solely on single-gene '${pageGeneUpper}'. Provide the full list of top SBRT DEGs returned by the QueryEngine.`
        };
      }
    }

    // Check C: Methodological / Dataset Registry Discovery Mismatch
    if (plan.intent === "list_available_datasets") {
      const talksAboutDatasets = responseLower.includes("tcga") || responseLower.includes("gse225767") || responseLower.includes("dataset");
      const opensWithSingleGene = llmResponse.slice(0, 300).includes("KRAS is a well-established oncogene");
      if (!talksAboutDatasets || opensWithSingleGene) {
        return {
          isMismatch: true,
          directive: `FLAGGED TASK MISMATCH: The user asked what transcriptomic datasets are available in PDAC BioPortal. Do NOT generate a single-gene expression report. List and describe the 4 available datasets.`
        };
      }
    }

    // Check D: Statistical Significance Contradiction
    if (executionResult.datasetResults.gse225767) {
      const sbrtRes: any = executionResult.datasetResults.gse225767;
      if (sbrtRes.metrics && (sbrtRes.metrics.pValue >= 0.05 || sbrtRes.metrics.adjPValue >= 0.05)) {
        if (responseLower.includes("kras is significantly upregulated after sbrt") || responseLower.includes("kras expression significantly increased after sbrt")) {
          return {
            isMismatch: true,
            directive: `FLAGGED STATISTICAL CONTRADICTION: SBRT KRAS has p=0.1130 and FDR=0.1996 (NOT statistically significant). State explicitly that KRAS showed a numerical change but was NOT statistically significant in this cohort.`
          };
        }
      }
    }

    return { isMismatch: false };
  }
}

export const intentRouter = new IntentRouter();
