// ToolRegistry.ts - Declarative Tool Registry & Evidence Contract for PDACopilot (v2.0)
// SINGLE SOURCE OF TRUTH PRINCIPLE: Contains purely declarative schemas, metadata, and UI mappings. No duplicate calculations.

export interface ToolDefinition {
  name: string;
  description: string;
  requiredParameters: string[];
  optionalParameters: string[];
  supportedDatasets: string[];
  outputSchema: string;
  validator: string;
  uiDestination?: string;
  actionType?: string;
}

export interface EvidenceObject {
  dataset: string;
  datasetLabel?: string;

  analysisType:
    | "gene_expression"
    | "differential_expression"
    | "ORA"
    | "GSEA"
    | "single_nucleus"
    | "spatial"
    | "cross_study"
    | "top_expressed"
    | "dataset_registry";

  comparison?: {
    type?: string;
    groupA?: string;
    groupB?: string;
    direction?: string;
  };

  studyDesign?: {
    paired?: boolean;
    independentCohorts?: boolean;
    sampleCounts?: Record<string, number>;
  };

  parameters?: Record<string, unknown>;
  results: unknown[];
  statistics?: Record<string, unknown>;
  source: "BioPortal";
  computed: boolean;
  validated: boolean;
  validationWarnings?: string[];
  causalInferenceAllowed?: boolean;

  provenance?: {
    engine?: string;
    version?: string;
    timestamp?: string;
    dataPath?: string;
  };
}

export interface RequiredAnswerContract {
  intent: string;
  dataset: string;
  comparison: string;
  analysis: string;
  requiredOutputs: string[];
  studyDesign: string;
  causalClaimAllowed: boolean;
  targetEntities: string[];
  expectedFormat: string;
  navigationAction?: {
    type: string;
    dataset: string;
    params?: Record<string, any>;
  };
}

export const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  dataset_registry: {
    name: "dataset_registry",
    description: "List all transcriptomic datasets available in PDAC BioPortal with modalities and sample metadata",
    requiredParameters: [],
    optionalParameters: ["datasetId"],
    supportedDatasets: ["tcga_gtex", "gse225767", "gse202051", "gse274103"],
    outputSchema: "DatasetRegistrySummary",
    validator: "validateDatasetRegistry",
    uiDestination: "/",
    actionType: "NAVIGATE_HOME"
  },

  gene_expression: {
    name: "gene_expression",
    description: "Retrieve baseline expression, mean levels, and group differences for a specific gene",
    requiredParameters: ["gene"],
    optionalParameters: ["datasetId"],
    supportedDatasets: ["tcga_gtex", "gse225767"],
    outputSchema: "GeneQueryResult",
    validator: "validateGeneExpression",
    uiDestination: "/#expression",
    actionType: "OPEN_GENE_EXPRESSION"
  },

  differential_expression: {
    name: "differential_expression",
    description: "Retrieve top significantly upregulated or downregulated genes for tumor vs normal or SBRT pre vs post",
    requiredParameters: ["datasetId"],
    optionalParameters: ["log2FCThreshold", "pValueThreshold", "limit"],
    supportedDatasets: ["tcga_gtex", "gse225767"],
    outputSchema: "DifferentialQueryResult",
    validator: "validateDifferentialExpression",
    uiDestination: "/#deg",
    actionType: "OPEN_DEG"
  },

  single_nucleus_expression: {
    name: "single_nucleus_expression",
    description: "Query single-nucleus RNA-seq atlas (224,988 nuclei) for cell-type lineage distribution and expression",
    requiredParameters: ["gene"],
    optionalParameters: ["cellType"],
    supportedDatasets: ["gse202051"],
    outputSchema: "SingleNucleusQueryResult",
    validator: "validateSingleNucleus",
    uiDestination: "/sn-prototype",
    actionType: "OPEN_SINGLE_NUCLEUS"
  },

  spatial_expression: {
    name: "spatial_expression",
    description: "Query 10x Visium spatial transcriptomics section for spot-level localization and microenvironment distribution",
    requiredParameters: ["gene"],
    optionalParameters: ["sampleId"],
    supportedDatasets: ["gse274103"],
    outputSchema: "SpatialQueryResult",
    validator: "validateSpatial",
    uiDestination: "/spatial-prototype",
    actionType: "OPEN_SPATIAL"
  },

  pathway_ora: {
    name: "pathway_ora",
    description: "Execute or retrieve Over-Representation Analysis (ORA) using deterministic hypergeometric engine",
    requiredParameters: ["datasetId"],
    optionalParameters: ["database", "fdrThreshold", "geneList"],
    supportedDatasets: ["tcga_gtex", "gse225767"],
    outputSchema: "PathwayEnrichmentResult[]",
    validator: "validateORA",
    uiDestination: "/pathways",
    actionType: "OPEN_PATHWAYS"
  },

  pathway_gsea: {
    name: "pathway_gsea",
    description: "Execute or retrieve Gene Set Enrichment Analysis (GSEA) using deterministic Wilcoxon/rank-sum engine",
    requiredParameters: ["datasetId"],
    optionalParameters: ["database", "fdrThreshold"],
    supportedDatasets: ["tcga_gtex", "gse225767"],
    outputSchema: "PathwayEnrichmentResult[]",
    validator: "validateGSEA",
    uiDestination: "/pathways",
    actionType: "OPEN_GSEA"
  },

  pathway_gene_membership: {
    name: "pathway_gene_membership",
    description: "Retrieve gene set membership and contributing genes for a specific pathway (Hallmark, Reactome, GO BP)",
    requiredParameters: ["pathwayName"],
    optionalParameters: ["database"],
    supportedDatasets: ["tcga_gtex", "gse225767"],
    outputSchema: "PathwayGeneMembership",
    validator: "validatePathwayMembership",
    uiDestination: "/pathways",
    actionType: "OPEN_PATHWAY_DETAIL"
  },

  cross_study_comparison: {
    name: "cross_study_comparison",
    description: "Compare gene expression, differential direction, or pathway enrichment across TCGA-PAAD and SBRT GSE225767",
    requiredParameters: ["genesOrAnalysis"],
    optionalParameters: ["datasets"],
    supportedDatasets: ["tcga_gtex", "gse225767"],
    outputSchema: "CrossStudyQueryResult",
    validator: "validateCrossStudy",
    uiDestination: "/pathways",
    actionType: "OPEN_CROSS_STUDY"
  }
};

export function getToolDefinition(toolName: string): ToolDefinition | null {
  return TOOL_REGISTRY[toolName] || null;
}
