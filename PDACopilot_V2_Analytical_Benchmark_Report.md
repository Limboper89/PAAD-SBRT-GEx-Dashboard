# PDACopilot V2 — 35-Question Analytical Scientific Benchmark Report
**Model**: Google Gemini 2.5 Flash (`gemini-2.5-flash`)  
**Date**: 8/14/2026, 12:16:53 AM  
**Overall Score**: **342 / 350 (97.7%)**  
**Execution Mode**: Live Gemini 2.5 Flash & Deterministic Tool Execution

---

## Evaluation Criteria Breakdown (10 Criteria)

1. **Dataset Correctness**: Verified dataset routing
2. **Tool Selection Correctness**: ToolRegistry tool mapping
3. **Evidence Grounding**: QueryEngine evidence retrieval
4. **Numerical Correctness**: Exact log2FC, p-value, FDR metrics
5. **Statistical Interpretation**: FDR threshold & uncalculated metric safeguards
6. **Study-Design Correctness**: GSE225767 unpaired cohort limitation
7. **Biological Interpretation**: Domain-accurate synthesis
8. **Causality Control**: Prevention of unsupported causal overclaims
9. **Provenance Check**: Dataset and tool execution metadata
10. **Overall Answer Correctness**: Multi-check EvidenceValidator verification

---

## Question Results Table

| Q# | Category | Question | Intent | Datasets | Score (/10) |
|---|---|---|---|---|---|
| 1 | Dataset Retrieval | What transcriptomic datasets are available in PDAC BioPortal? | `list_available_datasets` | `tcga_gtex, gse225767, gse202051, gse274103` | **10 / 10** |
| 2 | Dataset Retrieval | List the sample groups and cohort sizes in GSE225767. | `general_gene_query` | `gse225767` | **9 / 10** |
| 3 | Gene Expression | What is the expression level of PHGDH in TCGA-PAAD tumor vs normal pancreas? | `tumor_vs_normal_comparison` | `tcga_gtex` | **10 / 10** |
| 4 | Gene Expression | Compare PHGDH, PSAT1, and PSPH expression in PDAC tumor versus normal pancreas. | `tumor_vs_normal_comparison` | `tcga_gtex` | **10 / 10** |
| 5 | Gene Expression | What are the top 10 most abundant transcripts in TCGA-PAAD? | `tumor_vs_normal_comparison` | `tcga_gtex` | **10 / 10** |
| 6 | DEG | Which genes are significantly upregulated in TCGA-PAAD primary tumors? | `differential_expression_list` | `tcga_gtex` | **10 / 10** |
| 7 | DEG | Which genes change significantly after SBRT radiotherapy in GSE225767? | `differential_expression_list` | `gse225767` | **10 / 10** |
| 8 | Statistics | What is the exact log2 fold-change and FDR for KRAS in TCGA-PAAD? | `tumor_vs_normal_comparison` | `tcga_gtex` | **10 / 10** |
| 9 | Statistics | Is KRAS expression significantly altered after SBRT in GSE225767? | `radiotherapy_treatment_response` | `gse225767` | **10 / 10** |
| 10 | Statistics | Does PDAC BioPortal provide a calculated correlation coefficient (Pearson r) between NRF2 and PHGDH? | `tumor_vs_normal_comparison` | `tcga_gtex` | **8 / 10** |
| 11 | Study Design | Can GSE225767 be used to determine individual patient longitudinal gene expression changes after SBRT? | `radiotherapy_treatment_response` | `gse225767` | **10 / 10** |
| 12 | Study Design | Does GSE225767 contain Kaplan-Meier overall survival clinical metadata? | `general_gene_query` | `gse225767` | **9 / 10** |
| 13 | Single Nucleus | Which cell populations express EPCAM in the single-nucleus PDAC dataset? | `cell_type_lineage_expression` | `gse202051` | **10 / 10** |
| 14 | Single Nucleus | What cell populations can be investigated using the PDAC single-nucleus transcriptomic atlas GSE202051? | `cell_type_lineage_expression` | `gse202051` | **9 / 10** |
| 15 | Spatial | Where is KRT19 expressed spatially in Visium section PDAC-p1? | `spatial_localization` | `gse274103` | **9 / 10** |
| 16 | Spatial | What information does spatial transcriptomics provide beyond bulk RNA-seq in PDAC? | `spatial_localization` | `gse274103` | **10 / 10** |
| 17 | ORA | What pathways are enriched among upregulated genes in TCGA-PAAD using Over-Representation Analysis (ORA)? | `pathway_ora` | `tcga_gtex` | **10 / 10** |
| 18 | ORA | Which biological processes are over-represented in SBRT post-treatment resections? | `radiotherapy_treatment_response` | `gse225767` | **10 / 10** |
| 19 | GSEA | Run GSEA on the genes upregulated after SBRT using Hallmark pathways. | `pathway_gsea` | `gse225767` | **10 / 10** |
| 20 | GSEA | Which Hallmark pathways are enriched after SBRT in GSE225767? | `pathway_gsea` | `gse225767` | **10 / 10** |
| 21 | Pathway Interpretation | What does the enrichment of oxidative phosphorylation or serine metabolism mean biologically after SBRT? | `pathway_gsea` | `gse225767` | **10 / 10** |
| 22 | Pathway Interpretation | Which genes are involved in serine biosynthesis in PDAC? | `tumor_vs_normal_comparison` | `tcga_gtex` | **10 / 10** |
| 23 | Cross-Study | Which pathways or gene changes are shared between TCGA-PAAD tumor vs normal and SBRT GSE225767? | `pathway_gsea` | `gse225767` | **10 / 10** |
| 24 | Cross-Study | Integrate bulk RNA-seq, single-nucleus RNA-seq, and spatial transcriptomics to describe PDAC tumor heterogeneity. | `cross_module_synthesis` | `tcga_gtex, gse225767, gse202051, gse274103` | **10 / 10** |
| 25 | Hypothesis Generation | Generate a testable hypothesis explaining how NRF2 signaling and metabolic reprogramming could contribute to radiation resistance. | `radiotherapy_treatment_response` | `gse225767` | **10 / 10** |
| 26 | Hypothesis Generation | Does PDAC BioPortal observational transcriptomics prove that serine metabolism causes radiation resistance? | `radiotherapy_treatment_response` | `gse225767` | **10 / 10** |
| 27 | Adversarial / Context-Reset | Tell me about KRAS. Then: Which genes identify epithelial cells? | `general_gene_query` | `tcga_gtex` | **8 / 10** |
| 28 | Adversarial / Context-Reset | What is the expression of TP53 across all datasets? | `cross_module_synthesis` | `tcga_gtex, gse225767, gse202051, gse274103` | **10 / 10** |
| 29 | Adversarial / Context-Reset | What changed after SBRT? | `differential_expression_list` | `gse225767` | **10 / 10** |
| 30 | Adversarial / Context-Reset | Which transcriptomic datasets are available in PDAC BioPortal? | `list_available_datasets` | `tcga_gtex, gse225767, gse202051, gse274103` | **10 / 10** |
| 31 | Gene Expression | What is NFE2L2 expression in Pre-SBRT vs Post-SBRT cohorts? | `radiotherapy_treatment_response` | `gse225767` | **10 / 10** |
| 32 | Statistics | What is the p-value and FDR of PHGDH in TCGA-PAAD? | `tumor_vs_normal_comparison` | `tcga_gtex` | **10 / 10** |
| 33 | Single Nucleus | Which cell lineage has highest expression of EPCAM in GSE202051? | `cell_type_lineage_expression` | `gse202051` | **10 / 10** |
| 34 | Spatial | Is EPCAM localized in tumor epithelium or stroma in PDAC spatial Visium? | `spatial_localization` | `gse274103` | **10 / 10** |
| 35 | Hypothesis Generation | Propose a research workflow using BioPortal tools to evaluate metabolic adaptation post-radiotherapy. | `radiotherapy_treatment_response` | `gse225767` | **10 / 10** |

