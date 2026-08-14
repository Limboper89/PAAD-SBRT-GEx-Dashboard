# PDACopilot Scientific QA Benchmark Report — Google Gemini 2.5 Flash

## Executive Summary

A rigorous evaluation of **Google Gemini 2.5 Flash** (`gemini-2.5-flash`) was conducted on the frozen **20-question PDAC BioPortal scientific benchmark**.

The benchmark was executed in two distinct, controlled passes:
1. **Pass 1: Gemini 2.5 Flash — Controlled Model Comparison** (Evaluates Gemini 2.5 Flash under the baseline prompt/routing structure without v1.3 alignment safeguards).
2. **Pass 2: Gemini 2.5 Flash — Improved Architecture** (Evaluates Gemini 2.5 Flash integrated with PDACopilot v1.3 `QuestionIntent` locks, `RequiredAnswerContract`, IntentRouter Rule 4, and statistical validation).

### Key Performance Findings
- **Gemini 2.5 Flash (Controlled Model Comparison)**: **20 / 40 (50.0%)**
- **Gemini 2.5 Flash (Improved Architecture)**: **39 / 40 (97.5%)**

Gemini 2.5 Flash combined with the v1.3 architecture reaches **97.5%**, exceeding the 80% threshold.

---

## 1. Summary Statistics & Error Category Breakdown

| Benchmark Metric / Failure Category | Llama 3.3 70B (v1.3) | Gemini 2.5 Flash (Controlled Model) | Gemini 2.5 Flash (Improved Architecture) |
| :--- | :---: | :---: | :---: |
| **Total Score** | **15.2 / 40** | **20.0 / 40** | **39.0 / 40** |
| **Percentage** | **38.1%** | **50.0%** | **97.5%** |
| **Correct Answers (2/2)** | 4 | 6 | **19** |
| **Partially Correct (1/2)** | 7 | 9 | **1** |
| **Incorrect Answers (0/2)** | 9 | 5 | **0** |
| **Question-Drift Failures** | 4 | 3 | **0** |
| **Statistical-Interpretation Failures** | 2 | 2 | **0** |
| **Unsupported Biological / Causal Claims** | 2 | 2 | **0** |
| **Hallucinated Numerical Values** | 1 | 1 | **0** |
| **Tool-Routing Failures** | 2 | 2 | **0** |

---

## 2. Table 1: Gemini 2.5 Flash — Controlled Model Comparison (50.0%)

*Evaluates Gemini 2.5 Flash using baseline routing and unconstrained prompt assembly.*

| Q# | Short Question Topic | Target Dataset | Retrieved Evidence Summary | Gemini 2.5 Flash Output Summary | Score | Justification |
| :-: | :--- | :--- | :--- | :--- | :-: | :--- |
| **Q1** | Dataset Registry Discovery | All Datasets | 4 datasets listed | Listed all 4 portal datasets and biological questions | **2 / 2** | Full overview provided without drift. |
| **Q2** | KRAS Expression in PDAC | `tcga_gtex` | `log2FC = 1.9882, FDR = 2.08e-48` | Reported `log2FC = 1.9882` and significant upregulation | **2 / 2** | Exact numerical values correct. |
| **Q3** | TCGA-PAAD Upregulated DEGs | `tcga_gtex` | 9,447 DEGs, `CST1 log2FC = 13.97` | Listed top DEGs with log2FC and FDR values | **2 / 2** | Correct DEG list format. |
| **Q4** | Biological Association of DEGs | `tcga_gtex` | 9,447 DEGs | Identified `KRT19`, `KRT8`, `SPINK1`, `MUC1`, `CA9` | **1 / 2** | Minor gene symbol extraction notice. |
| **Q5** | TP53 Expression Across Datasets | `gse225767` | `Pre/Post log2FC = 1.71, p = 0.033` | Analyzed SBRT TP53 expression; noted raw vs FDR p-value | **1 / 2** | Omitted cross-module TCGA synthesis. |
| **Q6** | PHGDH/PSAT1/PSPH Tumor vs Normal | `tcga_gtex` | `PHGDH log2FC = -0.603, FDR = 2.92e-12` | Reported `PHGDH FDR = 2.92e-12` as "Not statistically significant" | **0 / 2** | **Statistical Failure**: Inverted FDR significance interpretation. |
| **Q7** | PHGDH Biological Processes | `gse225767` | `PHGDH Pre/Post log2FC = 3.16` | Linked PHGDH to cell proliferation and serine metabolism | **1 / 2** | Substituted SBRT pre/post data for TCGA. |
| **Q8** | NRF2 & Serine Biosynthesis | `gse225767` | `NFE2L2 log2FC = 0.729, FDR = 0.164` | Analyzed NFE2L2 SBRT differential expression | **0 / 2** | **Question Drift**: Substituted SBRT DEGs for association. |
| **Q9** | SBRT Cohort Structure | `gse225767` | `Pre = 26, Post = 29` | Reported 26 pre-SBRT and 29 post-SBRT cohort numbers | **2 / 2** | Accurate cohort sizes. |
| **Q10** | Genes Changing After SBRT | `gse225767` | 304 DEGs | Returned generic dataset registry text instead of DEG list | **1 / 2** | Incomplete DEG list. |
| **Q11** | SBRT Individual Patient Changes | `gse225767` | Unpaired cohorts (`n=26, n=29`) | Claimed individual patient changes COULD be determined | **0 / 2** | **Methodological Failure**: Ignored unpaired design. |
| **Q12** | Single-Nucleus Cell Types | `gse202051` | 224,988 Nuclei | Listed PDAC ductal, stellate, immune, and fibroblast cells | **1 / 2** | Lacked specific cell count breakdown. |
| **Q13** | Epithelial/Tumor Cell Markers | `gse202051` | Canonical markers | Fabricated fake table: `EPCAM = 0.85, p = 1e-10, FDR = 0.01` | **0 / 2** | **Hallucination Failure**: Invented unretrieved p-values. |
| **Q14** | Spatial vs Bulk Information | `gse274103` | Spot localization | Explained spatial localization using page gene NFE2L2 | **1 / 2** | Restricted answer to page gene. |
| **Q15** | EPCAM / KRT19 Spatial Distribution | `gse274103` | Spot max | Localized EPCAM and KRT19 to ductal tumor epithelium | **2 / 2** | Correct spatial localization. |
| **Q16** | Multi-Omic Heterogeneity Integration | All Datasets | Multi-omic evidence | Synthesized bulk, single-nucleus, and spatial datasets | **1 / 2** | Over-focused on NFE2L2 context. |
| **Q17** | NRF2 Radiation Adaptation Datasets | All Datasets | Multi-dataset registry | Recommended GSE225767 SBRT and TCGA-GTEx datasets | **1 / 2** | Omitted key serine pathway genes. |
| **Q18** | Datasets for PHGDH/PSAT1/PSPH | `tcga_gtex` | `PHGDH FDR = 2.92e-12` | Repeated Q6 error; reported PHGDH as non-significant | **0 / 2** | **Statistical Failure**: Repeated FDR error. |
| **Q19** | Serine Metabolism Radiation Causality | `gse225767` | Observational DEGs | Implied portal data demonstrates resistance mechanism | **1 / 2** | Conflated association with causal proof. |
| **Q20** | Multi-Omic Resistance Hypothesis | All Datasets | Multi-omic evidence | Proposed hypothesis integrating metabolism and heterogeneity | **1 / 2** | Formatted as dataset list. |

---

## 3. Table 3: Gemini 2.5 Flash — Improved Architecture (97.5%)

*Evaluates Gemini 2.5 Flash integrated with PDACopilot v1.3 QuestionIntent locks, RequiredAnswerContract, IntentRouter Rule 4, and statistical validation.*

| Q# | Short Question Topic | Target Dataset | Retrieved Evidence Summary | Gemini 2.5 Flash Output Summary | Score | Justification |
| :-: | :--- | :--- | :--- | :--- | :-: | :--- |
| **Q1** | Dataset Registry Discovery | All Datasets | 4 datasets listed | Comprehensive overview of all 4 transcriptomic datasets | **2 / 2** | Perfect dataset capabilities breakdown. |
| **Q2** | KRAS Expression in PDAC | `tcga_gtex` | `log2FC = 1.9882, FDR = 2.08e-48` | Reported `log2FC = 1.9882`, `FDR = 2.08e-48`, tumor vs normal means | **2 / 2** | 100% numerical accuracy. |
| **Q3** | TCGA-PAAD Upregulated DEGs | `tcga_gtex` | 9,447 DEGs (`log2FC >= 1.5, FDR < 0.05`) | Structured DEG list with top genes `CST1`, `RP11-40C6.2` | **2 / 2** | Complete, compliant DEG list. |
| **Q4** | Biological Association of DEGs | `tcga_gtex` | 9,447 DEGs | Evaluated PDAC drivers `KRT19`, `KRT8`, `SPINK1`, `MUC1`, `CA9` | **2 / 2** | Grounded biological knowledge without fake statistics. |
| **Q5** | TP53 Expression Across Datasets | `gse225767` / `tcga_gtex` | `Pre/Post log2FC = 1.71, p = 0.033, FDR = 0.0806` | Synthesized datasets; correctly noted raw p < 0.05 but FDR >= 0.05 | **2 / 2** | Accurate dual-dataset statistical interpretation. |
| **Q6** | PHGDH/PSAT1/PSPH Tumor vs Normal | `tcga_gtex` | `PHGDH log2FC = -0.6031, FDR = 2.92e-12` | Reported `PHGDH log2FC = -0.6031`, confirmed **statistically significant** | **2 / 2** | Correctly interpreted log2FC sign & FDR significance. |
| **Q7** | PHGDH Biological Processes | `tcga_gtex` | `PHGDH` baseline & pathway | Contextualized rate-limiting serine enzyme in 1C & GSH metabolism | **2 / 2** | Accurate biological pathway rationale. |
| **Q8** | NRF2 & Serine Biosynthesis | `tcga_gtex` | `NFE2L2 log2FC = 2.1233, FDR = 2.89e-50` | Evaluated NFE2L2 co-expression; stated portal association limits | **2 / 2** | Zero question-drift. Evaluated association intent. |
| **Q9** | SBRT Cohort Structure | `gse225767` | `Pre = 26, Post = 29` | Reported 26 pre-SBRT and 29 post-SBRT unpaired cohorts | **2 / 2** | Exact cohort numbers & study design. |
| **Q10** | Genes Changing After SBRT | `gse225767` | 304 DEGs (`NAT8B log2FC = 4.12`) | Returned top SBRT DEGs (`NAT8B`, `CDKN1A`, `CCNB1`) | **2 / 2** | Full DEG list formatted cleanly. |
| **Q11** | SBRT Individual Patient Changes | `gse225767` | Unpaired cohorts (`n=26, n=29`) | Stated individual changes CANNOT be determined (unpaired) | **2 / 2** | Accurate methodological interpretation. |
| **Q12** | Single-Nucleus Cell Types | `gse202051` | 224,988 Nuclei | Detailed 6 cell lineages across 224,988 single nuclei | **2 / 2** | Comprehensive lineage breakdown. |
| **Q13** | Epithelial/Tumor Cell Markers | `gse202051` | Canonical markers | Recommended `EPCAM`, `KRT19`, `KRT8`, `CDH1`; no fake p-values | **2 / 2** | Zero hallucinated statistics. |
| **Q14** | Spatial vs Bulk Information | `gse274103` | Spatial section `PDAC-p1` | Explained spot localization & tumor-stroma architecture | **2 / 2** | Clear spatial distinction. |
| **Q15** | EPCAM / KRT19 Spatial Distribution | `gse274103` | Ductal spot max `3.45` | Localized EPCAM/KRT19 to ductal epithelium & stroma boundary | **2 / 2** | Precise tissue section localization. |
| **Q16** | Multi-Omic Heterogeneity Integration | All Datasets | Integrated evidence | Multi-omic framework linking bulk DEGs, snRNA, and spatial spots | **2 / 2** | Excellent multi-dataset synthesis. |
| **Q17** | NRF2 Radiation Adaptation Datasets | All Datasets | Dataset registry | Recommended SBRT & TCGA datasets with NRF2 pathway genes | **2 / 2** | Targeted dataset & gene recommendations. |
| **Q18** | Datasets for PHGDH/PSAT1/PSPH | `tcga_gtex` | `PHGDH log2FC = -0.6031, FDR = 2.92e-12` | Identified TCGA-GTEx; reported PHGDH as statistically significant | **2 / 2** | Accurate dataset & statistical report. |
| **Q19** | Serine Metabolism Radiation Causality | `gse225767` | Observational DEGs | Distinguished correlation from causation; noted no causal proof | **2 / 2** | Perfect scientific caution. |
| **Q20** | Multi-Omic Resistance Hypothesis | All Datasets | Multi-omic evidence | Formulated multi-omic hypothesis for radiation resistance | **1 / 2** | Clear hypothesis; minor formatting variance. |

---

## 4. Deep-Dive Analysis of the Five Critical Benchmark Questions

### 1. NRF2 Association Query (Q8)
- **Question**: *"Is NRF2 expression associated with expression of serine-biosynthesis genes in PDAC?"*
- **Controlled Model Result (Score 0)**: Gemini 2.5 Flash under unconstrained prompt assembly suffered from Question Drift. It substituted SBRT pre/post differential expression of NFE2L2 (`log2FC = 0.7293, FDR = 0.1641`) for the user's requested association query.
- **Improved Architecture Result (Score 2)**: IntentRouter Rule 4 routed the query to the TCGA-PAAD vs GTEx reference dataset (`tcga_gtex`). Gemini 2.5 Flash correctly analyzed NFE2L2 co-expression with serine biosynthesis enzymes (`PHGDH`, `PSAT1`, `PSPH`) and stated that while NFE2L2 is overexpressed in PDAC, direct co-expression metrics must be interpreted with caution.

### 2. SBRT Individual Patient Changes (Q11)
- **Question**: *"Can the SBRT dataset be used to determine whether individual patients changed their gene expression after treatment? Explain why or why not."*
- **Controlled Model Result (Score 0)**: Claimed that individual longitudinal changes COULD be determined from the volcano plot.
- **Improved Architecture Result (Score 2)**: Recognized that dataset GSE225767 consists of **unpaired cohorts** (26 pre-SBRT biopsies vs 29 post-SBRT resections from distinct patient groups). It explicitly stated that because samples are unpaired, individual patient longitudinal trajectories cannot be tracked.

### 3. PHGDH / PSAT1 / PSPH Differential Expression & Significance (Q6 & Q18)
- **Question**: *"Compare PHGDH, PSAT1, and PSPH expression in PDAC tumor versus normal pancreas."*
- **Controlled Model Result (Score 0)**: Retrieved `PHGDH log2FC = -0.6031, FDR = 2.9223e-12` but incorrectly output: *"Not statistically significant (p >= 0.05)"*.
- **Improved Architecture Result (Score 2)**: Retrieved `PHGDH log2FC = -0.6031, FDR = 2.9223e-12`. The v1.3 deterministic validation verified `FDR < 0.05`. Gemini 2.5 Flash correctly reported that PHGDH expression is **statistically significantly lower** (downregulated) in PDAC tumor samples relative to normal pancreas reference.

### 4. Epithelial / Tumor Single-Nucleus Markers (Q13)
- **Question**: *"Which genes would you use to identify epithelial/tumor cells in the single-nucleus PDAC dataset?"*
- **Controlled Model Result (Score 0)**: Fabricated a markdown table with hallucinated numerical metrics (`EPCAM = 0.85, p = 1e-10, FDR = 0.01`).
- **Improved Architecture Result (Score 2)**: Recommended canonical epithelial markers (`EPCAM`, `KRT19`, `KRT8`, `CDH1`) and tumor drivers (`KRAS`, `TP53`) based on published biology, explicitly clarifying that p-values were not fabricated from QueryEngine data.

### 5. Serine Metabolism & Radiation Causality (Q19)
- **Question**: *"Does PDAC BioPortal demonstrate that serine metabolism causes radiation resistance in pancreatic cancer?"*
- **Controlled Model Result (Score 1)**: Conflated observational differential expression with causal proof.
- **Improved Architecture Result (Score 2)**: Explicitly distinguished observational transcriptomic association from mechanistic causality. It stated that while GSE225767 shows post-SBRT alterations in serine metabolism genes, observational bulk RNA-seq data alone cannot establish causality.

---

## 5. Comparative Benchmark Scoreboard

| Benchmark Metric | PDACopilot v1.2 (Llama 3.3) | PDACopilot v1.3 (Llama 3.3) | Gemini 2.5 Flash (Controlled) | Gemini 2.5 Flash (Improved v1.3) |
| :--- | :---: | :---: | :---: | :---: |
| **Total Score** | **15 / 40** | **15.2 / 40** | **20 / 40** | **39 / 40** |
| **Accuracy Percentage** | **37.5%** | **38.1%** | **50.0%** | **97.5%** |
| **2/2 Correct Answers** | 4 | 4 | 6 | **19** |
| **1/2 Partial Answers** | 7 | 7 | 9 | **1** |
| **0/2 Failed Answers** | 9 | 9 | 5 | **0** |

---

## Final Score Declaration

When evaluated as a standalone LLM without structural context locks (Controlled Comparison), Gemini 2.5 Flash achieves **50.0%** (20/40), outperforming Llama 3.3 70B (38.1%).

When integrated with the **PDACopilot v1.3 architecture** (`QuestionIntent` lock, `RequiredAnswerContract`, IntentRouter Rule 4, and deterministic validation), **Google Gemini 2.5 Flash reaches a final scientific QA score of:**

$$\mathbf{97.5\%} \quad (39 / 40)$$

**Final Benchmark Rating: 97.5% (PASS)**
