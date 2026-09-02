// DatasetRegistry.ts - Single source of truth for all datasets in PDAC BioPortal

export interface SampleGroupDefinition {
  id: string;
  label: string;
  sampleCount: number;
  description: string;
}

export interface DatasetDefinition {
  id: string;
  name: string;
  accession: string;
  modality: string[];
  biologicalQuestions: string[];
  groups: SampleGroupDefinition[];
  analyses: string[];
  capabilities: {
    geneExpression: boolean;
    differentialExpression: boolean;
    singleNucleus: boolean;
    spatialExpression: boolean;
    pathwayAnalysis?: boolean;
    patientPseudobulk?: boolean;
  };
  limitations: string[];
  queryFunctions: string[];
  dataPath: string;
  pairedPrePost?: boolean;
}

export const DATASET_REGISTRY: Record<string, DatasetDefinition> = {
  tcga_gtex: {
    id: "tcga_gtex",
    name: "TCGA-PAAD vs GTEx Pancreas Normal Reference",
    accession: "TCGA-PAAD / GTEx",
    modality: ["bulk RNA-seq", "tumor-versus-normal"],
    biologicalQuestions: [
      "tumor versus normal pancreas baseline expression",
      "PDAC differential expression",
      "diagnostic biomarker identification",
      "tumor-overexpressed therapeutic targets",
      "pathway enrichment analysis"
    ],
    groups: [
      { id: "tumor", label: "TCGA-PAAD Primary Tumor", sampleCount: 178, description: "Primary Pancreatic Ductal Adenocarcinoma samples from TCGA" },
      { id: "gtex_normal", label: "GTEx Normal Pancreas", sampleCount: 167, description: "Non-diseased normal pancreas tissue from GTEx" },
      { id: "tcga_normal", label: "TCGA Solid Tissue Normal", sampleCount: 4, description: "Adjacent non-tumor tissue from TCGA" }
    ],
    analyses: [
      "gene_expression_comparison",
      "differential_expression",
      "volcano_analysis",
      "gene_gene_correlation",
      "pathway_enrichment"
    ],
    capabilities: {
      geneExpression: true,
      differentialExpression: true,
      singleNucleus: false,
      spatialExpression: false,
      pathwayAnalysis: true
    },
    limitations: [
      "Unmatched cross-study comparison (TCGA vs GTEx batch effects adjusted via Wilcoxon non-parametric testing)",
      "Bulk tissue homogenates contain tumor stroma and immune infiltrates"
    ],
    queryFunctions: [
      "queryGeneExpression",
      "queryDifferentialExpression",
      "queryPathwayEnrichment",
      "queryPathwayGSEA"
    ],
    dataPath: "/PAAD-SBRT-GEx-Dashboard/data/tcga_gtex/tcga_gtex_DEG_results.json",
    pairedPrePost: false
  },

  gse225767: {
    id: "gse225767",
    name: "PDAC SBRT Radiotherapy Response Cohort (GSE225767)",
    accession: "GSE225767",
    modality: ["bulk RNA-seq", "treatment-response", "radiotherapy"],
    biologicalQuestions: [
      "radiotherapy (SBRT) pre vs post treatment response",
      "radiation resistance gene signature",
      "post-irradiation transcriptomic changes"
    ],
    groups: [
      { id: "pre", label: "Pre-SBRT Biopsy", sampleCount: 26, description: "Baseline biopsy prior to stereotactic body radiation therapy" },
      { id: "post", label: "Post-SBRT Resection", sampleCount: 29, description: "Surgical resection following SBRT treatment" }
    ],
    analyses: [
      "treatment_response",
      "differential_expression",
      "pre_post_comparison",
      "gene_gene_correlation"
    ],
    capabilities: {
      geneExpression: true,
      differentialExpression: true,
      singleNucleus: false,
      spatialExpression: false
    },
    limitations: [
      "Unpaired cohorts (26 pre-treatment vs 29 post-treatment samples; NO patient-level longitudinal pairing)",
      "Patient-level pre/post change cannot be inferred for individual subjects"
    ],
    queryFunctions: [
      "queryGeneExpression",
      "queryDifferentialExpression"
    ],
    dataPath: "/PAAD-SBRT-GEx-Dashboard/data/GSE225767_DEG_results_with_names.csv",
    pairedPrePost: false
  },

  gse202051: {
    id: "gse202051",
    name: "PDAC Single-Nucleus Reference Atlas & Treatment Remodeling (GSE202051)",
    accession: "GSE202051",
    modality: ["single-nucleus RNA-seq", "cell-type resolution", "treatment-stratified pseudobulk"],
    biologicalQuestions: [
      "cell-type specific gene expression in human PDAC",
      "treatment remodeling: Treatment-Naïve (n=18) vs Neoadjuvant-Treated (n=25)",
      "100% radiation-exposed clinical cohort (CRT, CRT+Losartan, CRT+Nivolumab, GART, RT)",
      "compartment-specific divergence across malignant ducts, CAFs, and vascular endothelium",
      "patient-aware pseudobulk differential expression"
    ],
    groups: [
      { id: "naive", label: "Treatment-Naïve Baseline", sampleCount: 18, description: "18 untreated patients (U1–U18; 9,689 subset nuclei, 108,964 full atlas)" },
      { id: "treated", label: "Neoadjuvant-Treated (100% RT/CRT)", sampleCount: 25, description: "25 radiation-exposed patients (T1–T25; 10,311 subset nuclei, 116,024 full atlas)" }
    ],
    analyses: [
      "cell_type_expression",
      "patient_pseudobulk_differential",
      "lineage_treatment_comparison",
      "regimen_subgroups",
      "umap_exploration"
    ],
    capabilities: {
      geneExpression: true,
      differentialExpression: true,
      singleNucleus: true,
      spatialExpression: false,
      patientPseudobulk: true
    },
    limitations: [
      "Single-nucleus transcriptomics captures nuclear RNA",
      "Independent cross-sectional cohorts (18 Naïve resections vs 25 Neoadjuvant-treated resections, not longitudinal within-patient tracking)",
      "100% of treated patients received radiation (RT/CRT); no chemo-only without radiation"
    ],
    queryFunctions: [
      "querySingleNucleusExpression",
      "querySingleNucleusTreatmentComparison"
    ],
    dataPath: "/PAAD-SBRT-GEx-Dashboard/data/gse202051/genes_index_chunked.json",
    pairedPrePost: false
  },

  gse274103: {
    id: "gse274103",
    name: "Patient Tumor Visium Spatial Transcriptomics (GSE274103)",
    accession: "GSE274103",
    modality: ["spatial transcriptomics", "10x Visium"],
    biologicalQuestions: [
      "spatial gene expression in intact tumor sections",
      "tumor-stroma boundary localization",
      "histopathological niche expression"
    ],
    groups: [
      { id: "PDAC-p1", label: "Patient Section PDAC-p1", sampleCount: 4987, description: "Visium spatial spots for Patient 1" },
      { id: "PDAC-p2", label: "Patient Section PDAC-p2", sampleCount: 4380, description: "Visium spatial spots for Patient 2" },
      { id: "PDAC-p3", label: "Patient Section PDAC-p3", sampleCount: 4134, description: "Visium spatial spots for Patient 3" },
      { id: "PDAC-p4", label: "Patient Section PDAC-p4", sampleCount: 4983, description: "Visium spatial spots for Patient 4" },
      { id: "PDAC-p5", label: "Patient Section PDAC-p5", sampleCount: 4952, description: "Visium spatial spots for Patient 5" }
    ],
    analyses: [
      "spatial_spot_expression",
      "niche_localization",
      "histology_overlay"
    ],
    capabilities: {
      geneExpression: true,
      differentialExpression: false,
      singleNucleus: false,
      spatialExpression: true
    },
    limitations: [
      "10x Visium spots contain ~1-10 cells per spot (multicellular spatial resolution)",
      "5 patient sections available in current portal build",
      "Targeted FFPE probe panel: KRT19 is absent from feature set; available ductal/epithelial markers include KRT18 and EPCAM"
    ],
    queryFunctions: [
      "querySpatialExpression"
    ],
    dataPath: "/PAAD-SBRT-GEx-Dashboard/data/gse274103/master_index.json",
    pairedPrePost: false
  }
};

export function listAvailableDatasets(): DatasetDefinition[] {
  return Object.values(DATASET_REGISTRY);
}

export function getDatasetMetadata(datasetId: string): DatasetDefinition | null {
  return DATASET_REGISTRY[datasetId] || null;
}
