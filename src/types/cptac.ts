export interface CptacProteinRecord {
  g: string; // Gene / Protein Symbol
  pi: number; // Protein binary row index (0..11661)
  mi: number | null; // mRNA binary row index or null
  nT: number; // Non-missing Tumor protein count
  nN: number; // Non-missing NAT protein count
  tMean: number | null;
  nMean: number | null;
  tMed: number | null;
  nMed: number | null;
  log2FC: number | null;
  mwP: number | null;
  mwQ: number | null;
  welchP: number | null;
  welchQ: number | null;
  nPairedNat: number;
  pairedLog2FC: number | null;
  pairedP: number | null;
  nPairMP: number;
  r: number | null; // Matched mRNA-protein Pearson r
  rP: number | null;
  rho: number | null; // Matched mRNA-protein Spearman rho
  rhoP: number | null;
  coxN: number;
  coxHR: number | null;
  coxCiL: number | null;
  coxCiH: number | null;
  coxP: number | null;
  mLog2FC: number | null;
  mMwP: number | null;
}

export interface CptacMrnaOnlyRecord {
  g: string;
  mi: number;
  nT: number;
  nN: number;
  tMean: number | null;
  nMean: number | null;
  log2FC: number | null;
  mwP: number | null;
  mwQ: number | null;
  coxN: number;
  coxHR: number | null;
  coxCiL: number | null;
  coxCiH: number | null;
  coxP: number | null;
}

export interface CptacClinicalSample {
  case_id: string;
  tumor_idx: number;
  histology: string;
  stage: string | null;
  age: number | null;
  sex: string | null;
  neoplastic_cellularity: number | null;
  stromal_fraction: number | null;
  acinar_fraction: number | null;
  has_paired_nat: boolean;
}

export interface CptacSurvivalSample {
  case_id: string;
  tumor_idx: number;
  os_days: number;
  os_months: number;
  os_event: number;
  histology: string;
  stage: string | null;
}

export interface CptacPreset {
  id: string;
  name: string;
  description: string;
  genes: string[];
  badge?: string;
}

export interface CptacPathwayConcordance {
  id: string;
  name: string;
  category: string;
  total_genes: number;
  quantified_paired: number;
  median_r: number;
  mean_r: number;
  q25_r: number;
  q75_r: number;
  median_rho: number | null;
  median_log2FC: number | null;
  top_concordant: Array<{ g: string; r: number; rho: number | null }>;
  lowest_concordant: Array<{ g: string; r: number; rho: number | null }>;
}

export interface CptacMetadata {
  study_id: string;
  title: string;
  pmid: string;
  doi: string;
  sources: {
    proteomics_and_rna: string;
    cbioportal_parity: string;
  };
  counts: {
    protein_genes: number;
    mrna_indexed_genes: number;
    shared_mrna_protein_genes: number;
    mrna_protein_tested_ge10: number;
    mrna_only_hgnc_genes: number;
    tumor_proteomics_samples: number;
    normal_proteomics_samples: number;
    paired_tumor_normal_proteomics: number;
    unmatched_normal_proteomics: number;
    total_proteomics_samples: number;
    tumor_mrna_samples: number;
    normal_mrna_samples: number;
    paired_mrna_protein_tumors: number;
    clinical_total: number;
    clinical_valid_os: number;
    clinical_os_events: number;
    clinical_valid_os_pdac_only: number;
    clinical_os_events_pdac_only: number;
    clinical_excluded_os: number;
    median_followup_months: number;
    sig_proteins_mw_fdr05: number;
    sig_proteins_up_fdr05: number;
    sig_proteins_down_fdr05: number;
  };
  global_concordance: {
    median_pearson_r: number;
    mean_pearson_r: number;
    median_spearman_rho: number;
    mean_spearman_rho: number;
    pct_positive_r: number;
  };
  protein_samples: {
    tumor_ids: string[];
    normal_ids: string[];
    paired_nat_ids: string[];
    tumor_start: number;
    tumor_end: number;
    normal_start: number;
    normal_end: number;
    total_cols: number;
  };
  mrna_samples: {
    tumor_ids: string[];
    normal_ids: string[];
    tumor_start: number;
    tumor_end: number;
    normal_start: number;
    normal_end: number;
    total_cols: number;
  };
  clinical_samples: CptacClinicalSample[];
  clinical_survival: CptacSurvivalSample[];
  excluded_survival_cases: Array<{
    case_id: string;
    follow_up_days: number | null;
    vital_status: string | null;
    lost_to_followup: string | null;
  }>;
  curated_presets: CptacPreset[];
  pathway_concordance: CptacPathwayConcordance[];
}

export interface CoxPhResult {
  n: number;
  events: number;
  beta: number;
  se: number;
  z: number;
  hr: number;
  ciLower: number;
  ciUpper: number;
  pValue: number;
  lrChi2: number;
  lrPValue: number;
  cIndex: number;
}
