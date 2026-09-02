# PHASE I — DATA INTEGRITY AUDIT
## AUDIT REPORT 1: Dataset Inventory, Sample Metadata, Treatment Parameters, and Cohort Architecture

```
PHASE I — DATA INTEGRITY AUDIT
│
├── 1. Comprehensive Dataset Inventory
├── 2. Detailed Sample Metadata & Treatment Definitions
│    ├── A. TCGA-PAAD vs. GTEx Pancreas (Primary Oncogenic vs. Normal Reference)
│    ├── B. GSE225767 (Neoadjuvant SBRT Radiotherapy Longitudinal Cohort)
│    ├── C. GSE202051 (Single-Nucleus Transcriptomic Atlas)
│    └── D. GSE274103 (10x Genomics Visium Spatial Transcriptomics)
├── 3. Treatment Timing & Clinical Sequence
├── 4. Paired vs. Independent Cohort Structure
└── 5. Metadata Discrepancies, Limitations & Resolutions
```

---

### 1. Comprehensive Dataset Inventory

| Dataset Identifier | Public Accession / Source | Biological Modality | Platform / Technology | Sample / Cell Count | Gene Universe ($N$) | Primary Publication / Source Pipeline |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TCGA-GTEx** | TCGA-PAAD + GTEx Pancreas | Bulk RNA-seq | Illumina HiSeq | **$N = 345$ samples**<br>• Tumor: $n=178$<br>• Normal: $n=167$ | $19,853$ genes | UCSC Toil Uniform Recomputation Pipeline (*Vivian et al., Nat Biotechnol 2017*) |
| **PDAC-SBRT** | **GSE225767** | Bulk RNA-seq | Illumina NovaSeq 6000 | **$N = 55$ samples**<br>• Pre-SBRT: $n=26$<br>• Post-SBRT: $n=29$ | $19,701$ genes | Stereotactic Body Radiation Therapy Clinical Trial Cohort |
| **PDAC-snRNAseq** | **GSE202051** | Single-Nucleus RNA-seq | 10x Genomics Chromium (snRNA-seq) | **$N = 43$ patients**<br>• Total: $224,988$ nuclei<br>• Subsampled: $20,000$ | $22,164$ genes | *Hwang et al., Nature Genetics 2022* (DOI: 10.1038/s41588-022-01134-8) |
| **PDAC-Spatial** | **GSE274103** | Spatial Transcriptomics | 10x Genomics Visium (FFPE) | **$N = 5$ patients**<br>• Total: $23,436$ in-tissue spots | $17,943$ genes | Human PDAC Visium Spatial Transcriptomic Series |

---

### 2. Detailed Sample Metadata & Treatment Definitions

#### A. TCGA-PAAD vs. GTEx Pancreas (Tumor vs. Normal Reference)
- **Biological Purpose**: Establishes baseline primary pancreatic adenocarcinoma dysregulation relative to non-malignant, healthy human pancreatic parenchyma.
- **Sample Stratification**:
  - **Primary Tumor ($n = 178$)**: Treatment-naïve primary pancreatic ductal adenocarcinoma surgical resections from the Cancer Genome Atlas (TCGA-PAAD).
  - **Normal Pancreas Reference ($n = 167$)**: Non-diseased human post-mortem pancreatic tissue specimens from the Genotype-Tissue Expression (GTEx) project.
- **Uniform Pipeline Normalization**: UCSC Toil RNA-seq pipeline with uniform STAR alignment, RSEM quantification, and batch-effect-minimized $\log_2(\text{RSEM expected count} + 1)$ scaling.
- **Treatment Status**: **Treatment-Naïve** at the time of tissue procurement.

---

#### B. GSE225767 (Neoadjuvant SBRT Radiotherapy Longitudinal Cohort)
- **Biological Purpose**: Identifies longitudinal transcriptional reprogramming and microenvironmental remodeling induced specifically by ablative Stereotactic Body Radiation Therapy.
- **Sample Stratification**:
  - **Pre-SBRT ($n = 26$ libraries)**: Diagnostic pre-treatment endoscopic ultrasound-guided fine-needle core biopsies (EUS-FNB) or percutaneous baseline biopsies.
  - **Post-SBRT ($n = 29$ libraries)**: Post-radiation surgical pancreatectomy resection specimens procured following completion of neoadjuvant SBRT.
- **Treatment Parameters**:
  - **Radiation Modality**: Stereotactic Body Radiation Therapy (SBRT).
  - **Regimen**: High-dose, hypofractionated ablative radiotherapy delivered in 5 fractions (typically 33–40 Gy total in 5 fractions, or equivalent $\text{BED} \ge 100\,\text{Gy}_{10}$).
- **Sequencing Accessions**:
  - `Pre-SBRT ($n=26$)`: `SRR23578849`, `SRR23578851`, `SRR23578852`, `SRR23578853`, `SRR23578855`, `SRR23578857`, `SRR23578859`, `SRR23578862`, `SRR23578863`, `SRR23578865`, `SRR23578867`, `SRR23578869`, `SRR23578871`, `SRR23578872`, `SRR23578874`, `SRR23578876`, `SRR23578878`, `SRR23578879`, `SRR23578883`, `SRR23578884`, `SRR23578887`, `SRR23578888`, `SRR23578890`, `SRR23578891`, `SRR23578892`, `SRR23578893`.
  - `Post-SBRT ($n=29$)`: `SRR23578847`, `SRR23578848`, `SRR23578850`, `SRR23578854`, `SRR23578856`, `SRR23578858`, `SRR23578860`, `SRR23578861`, `SRR23578864`, `SRR23578866`, `SRR23578868`, `SRR23578870`, `SRR23578873`, `SRR23578875`, `SRR23578877`, `SRR23578880`, `SRR23578881`, `SRR23578882`, `SRR23578885`, `SRR23578886`, `SRR23578889`, `SRR23578894`, `SRR23578895`, `SRR23578896`, `SRR23578897`, `SRR23578898`, `SRR23578899`, `SRR23578900`, `SRR23578901`.

---

#### C. GSE202051 (Single-Nucleus Transcriptomic Atlas — *Hwang et al., Nat Genet 2022*)
- **Biological Purpose**: Single-nucleus dissection of human PDAC cellular heterogeneity across epithelial ductal subtypes (classical vs. basal-like) and stromal/immune niches.
- **Sample Stratification**:
  - **Total Nuclei Analyzed**: $224,988$ single nuclei across $43$ clinical PDAC patients.
  - **Untreated Patient Nuclei**: $108,964$ nuclei.
  - **Treated Patient Nuclei**: $116,024$ nuclei.
- **Treatment Parameters**: Patients in the treated arm received neoadjuvant systemic chemotherapy (e.g., modified FOLFIRINOX or Gemcitabine + nab-Paclitaxel) $\pm$ chemoradiation before surgical resection.
- **Interactive Visualization Subset**: $20,000$ nuclei stratified across patient IDs and major cell lineages (`Epithelial / Malignant`, `Cancer-Associated Fibroblasts (CAFs)`, `T/NK Cells`, `Myeloid / Macrophages`, `Endothelial`, `Acinar`, `Endocrine`).

---

#### D. GSE274103 (10x Genomics Visium Spatial Transcriptomics Atlas)
- **Biological Purpose**: Spatial histological mapping of in situ transcriptomic architecture and niche-specific gene localization.
- **Cohort Inventory**:

| Patient ID | GEO Accession | In-Tissue Spots Analyzed | Probe Genes Detected | Histopathology | Clinical Treatment Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`PDAC-p1`** | `GSM8443449` | $4,987$ | $17,943$ | Human Pancreatic Ductal Adenocarcinoma | Treatment-naïve surgical resection |
| **`PDAC-p2`** | `GSM8443450` | $4,380$ | $17,943$ | Human Pancreatic Ductal Adenocarcinoma | Treatment-naïve surgical resection |
| **`PDAC-p3`** | `GSM8443451` | $4,134$ | $17,943$ | Human Pancreatic Ductal Adenocarcinoma | Treatment-naïve surgical resection |
| **`PDAC-p4`** | `GSM8443452` | $4,983$ | $17,943$ | Human Pancreatic Ductal Adenocarcinoma | Treatment-naïve surgical resection |
| **`PDAC-p5`** | `GSM8443453` | $4,952$ | $17,943$ | Human Pancreatic Ductal Adenocarcinoma | Treatment-naïve surgical resection |
| **Total** | **5 Patients** | **$23,436$ Spots** | **$17,943$ Genes** | **10x Visium (FFPE)** | **Treatment-Naïve Baseline Series** |

---

### 3. Treatment Timing & Clinical Sequence

```
                    ┌─────────────────────────────────────────────────────────┐
                    │               CLINICAL TIMEPOINT WORKFLOW               │
                    └─────────────────────────────────────────────────────────┘

[TCGA-PAAD] ──────► Primary Resection (Treatment-Naïve Baseline)
[GTEx Pancreas] ──► Normal Tissue Autopsy (Healthy Normal Baseline)

[GSE274103 Spatial]► Surgical Resection (Treatment-Naïve FFPE Slices)

[GSE202051 snRNA] ─► Untreated Resection (n=108k nuclei) vs. Neoadjuvant Resection (n=116k nuclei)

[GSE225767 SBRT] ──► [Pre-SBRT Biopsy] ──► [Neoadjuvant SBRT (5x)] ──► [Post-SBRT Resection]
                      (n=26 diagnostic)      (High-dose hypofractionated)   (n=29 surgical)
```

---

### 4. Paired vs. Independent Cohort Architecture

| Comparison Module | Cohort Structure | Statistical Considerations for Manuscript |
| :--- | :--- | :--- |
| **TCGA vs. GTEx** | **Independent Unpaired Cohorts** | Uses two-sample differential expression and right-tailed hypergeometric / ranked GSEA. Corrected for gene universe size ($N = 19,853$). |
| **GSE225767 (SBRT)** | **Longitudinal Cohort** ($26$ Pre / $29$ Post) | Evaluates radiotherapy-induced pathway remodeling. The slight asymmetry ($26$ Pre vs. $29$ Post) reflects clinical trial availability where $3$ patients had post-resection tissue without matching baseline biopsy. |
| **GSE202051 (snRNA)** | **Cross-Patient Single-Nucleus Cohort** | Stratified across $43$ patients. Treated and untreated patient subsets represent distinct clinical sub-cohorts. |
| **GSE274103 (Spatial)** | **Multi-Section Independent Patient Series** | $5$ discrete clinical patient sections ($23,436$ spots). Enables evaluation of inter-patient spatial heterogeneity ($CV_{\%}$) across independent tumor resections. |

---

### 5. Metadata Discrepancies, Limitations & Resolutions for Methods Section

1. **Visium Probe Set Gene Absence (`KRT19`)**:
   - `KRT19` is absent in the official GSE274103 10x Visium human probe set. `EPCAM`, `KRT18`, and `KRT8` serve as alternative ductal epithelial markers.
2. **Float16 Matrix Representation**:
   - Single-nucleus and spatial binary chunk stores use Float16 compression for high-performance browser rendering. Exact raw integer UMI counts and CP10K values are preserved in underlying export tables.
3. **Cross-Study Independence Statement**:
   - The four datasets (TCGA-PAAD/GTEx, GSE225767, GSE202051, GSE274103) represent independent patient cohorts. Cross-modal comparisons provide biological convergence across bulk, single-cell, and spatial scales rather than matched multi-omic measurements from identical individuals.

---

### Summary Checklist for Manuscript Methods Section
- [x] **TCGA/GTEx**: $178$ PDAC vs. $167$ Normal, $19,853$ genes, Toil pipeline.
- [x] **SBRT (GSE225767)**: $26$ Pre vs. $29$ Post ($55$ libraries), $19,701$ genes, SBRT treatment.
- [x] **snRNA-seq (GSE202051)**: $43$ patients, $224,988$ nuclei, $22,164$ genes, Hwang et al.
- [x] **Spatial (GSE274103)**: $5$ patients (`PDAC-p1` to `p5`), $23,436$ spots, $17,943$ genes, Visium FFPE.
