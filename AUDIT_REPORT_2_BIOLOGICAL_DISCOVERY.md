# PHASE II — UNBIASED BIOLOGICAL DISCOVERY
## AUDIT REPORT 2: Cross-Cohort Differential Pathways, Effect-Size Rankings, Single-Nucleus Compartments, and Divergent Multi-Omic Signatures

```
PHASE II — UNBIASED BIOLOGICAL DISCOVERY
│
├── 1. Analysis A: Primary Tumor vs. Normal Reference (TCGA-PAAD vs. GTEx)
│    ├── A. Statistical Significance & Effect-Size Ranking
│    ├── B. ORA vs. GSEA Methodological Concordance
│    └── C. Core Biological Programs (Oncogenic Activation vs. Differentiated Loss)
├── 2. Analysis B: Neoadjuvant SBRT Radiotherapy Response (GSE225767 Bulk RNA-seq)
│    ├── A. Radiation-Induced Transcriptomic Remodeling
│    ├── B. Top Upregulated Radiation Signatures (EMT, Fibrogenesis, Hypoxia)
│    └── C. Top Repressed Radiation Signatures (Cell Cycle Checkpoints, Differentiation)
├── 3. Analysis C: Single-Nucleus Treatment Dissection (GSE202051 snRNA-seq)
│    ├── A. Global Multi-Cellular Shifts
│    ├── B. Compartment-Specific Alterations (Epithelial, CAF, Myeloid, Lymphoid)
│    └── C. Opposing Directional Programs Across Compartments (Key Manuscript Focus)
└── 4. Cross-Modal Discovery Matrix (Bulk ↔ Single-Nucleus ↔ Spatial Convergence)
```

---

### 1. Analysis A — Primary Tumor vs. Normal Reference (TCGA-PAAD vs. GTEx)

#### A. Top Statistically Significant Pathways & Effect Sizes
Evaluation of **$178$ Primary PDAC Tumors** against **$167$ GTEx Normal Pancreas Specimens** across $19,853$ background genes:

| Pathway Name | Database | Analysis Mode | Normalized Enrichment Score (NES) | Benjamini-Hochberg FDR | Core Leading-Edge Genes ($k$) | Key Driver Genes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Mitotic Metaphase and Anaphase** | Reactome | GSEA (Up) | **$+13.58$** | $1.71 \times 10^{-5}$ | $215$ | *CDK1, BUB1, CDC20, PLK1, AURKA* |
| **Cell Cycle Checkpoints** | Reactome | GSEA (Up) | **$+13.43$** | $1.71 \times 10^{-5}$ | $239$ | *CHEK1, MCM2-7, ATR, CCNE1, BRCA1* |
| **Neutrophil Degranulation** | Reactome | GSEA (Up) | **$+12.66$** | $1.71 \times 10^{-5}$ | $431$ | *MMP9, ITGAM, S100A8, S100A9, CEACAM6* |
| **E2F Targets** | Hallmark | GSEA (Up) | **$+12.16$** | $1.71 \times 10^{-5}$ | $188$ | *MKI67, TOP2A, PCNA, E2F1, CCNA2* |
| **Extracellular Matrix Organization** | Reactome | GSEA (Up) | **$+11.95$** | $1.71 \times 10^{-5}$ | $284$ | *COL1A1, COL3A1, FN1, MMP14, LOX* |
| **KRAS Signaling Downregulated** | Hallmark | GSEA (Down) | **$-5.55$** | $1.71 \times 10^{-5}$ | $146$ | *GP2, ARHGDIG, CLDN10, SLC3A1* |
| **Striated Muscle Contraction** | GO BP | GSEA (Down) | **$-4.49$** | $5.20 \times 10^{-5}$ | $49$ | *TNNT1, MYH2, ACTA1, TPM1* |
| **Digestion of Dietary Lipid** | Reactome | GSEA (Down) | **$-4.14$** | $2.03 \times 10^{-4}$ | $6$ | *PNLIP, CLPS, CEL, PLA2G1B* |
| **Pancreatic Secretion / Digestion** | Reactome | GSEA (Down) | **$-3.93$** | $4.33 \times 10^{-4}$ | $15$ | *PRSS1, PRSS2, CTRB1, CTRB2, CPA1* |
| **Pancreas Beta Cell Signature** | Hallmark | GSEA (Down) | **$-2.57$** | $1.42 \times 10^{-2}$ | $38$ | *INS, GCG, SST, ISL1, MAFA* |

---

#### B. ORA vs. GSEA Methodological Concordance
- **GSEA (Whole-Transcriptome Ranked Rank-Sum)**: Captures both the **hyperproliferative/desmoplastic activation** ($\text{NES} = +12.16 \text{ to } +13.58$) and the **loss of differentiated exocrine/endocrine programs** ($\text{NES} = -3.93 \text{ to } -5.55$).
- **ORA (Over-Representation of $9,447$ Significant DEGs)**:
  - Strongly confirms the activation of cell cycle, DNA repair, and extracellular matrix remodeling (Fold Enrichment: $1.6\times - 2.8\times$, $\text{FDR} < 10^{-15}$).
  - Because **$87.4\%$ of all DEGs in tumors are overexpressed**, whole-pool ORA predominantly surfaces upregulated states.

---

### 2. Analysis B — Treatment-Associated Bulk Comparison (GSE225767 Neoadjuvant SBRT)

#### A. Radiation-Induced Transcriptomic Remodeling
Comparison of **$29$ Post-SBRT Surgical Resections** against **$26$ Pre-SBRT Diagnostic Biopsies** across $19,701$ genes:

| SBRT Signature Name | Database | Direction | Normalized Enrichment Score (NES) | Benjamini-Hochberg FDR | Biological Phenotype Induced by Radiotherapy |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Epithelial-Mesenchymal Transition (EMT)** | Hallmark | **Upregulated** | **$+14.29$** | $1.31 \times 10^{-4}$ | Massive stromal activation, fibrotic replacement, and mesenchymal phenotypic drift |
| **Collagen Biosynthesis & Formation** | Reactome | **Upregulated** | **$+7.42$** | $1.31 \times 10^{-4}$ | Heavy collagen deposition (*COL1A1, COL3A1, COL5A2*) in irradiated tumor bed |
| **Extracellular Matrix Organization** | Reactome | **Upregulated** | **$+7.37$** | $1.31 \times 10^{-4}$ | Dense tissue remodeling and cross-linking (*LOX, LOXL2, FN1*) post-ablation |
| **Myogenesis & Contractile Stroma** | Hallmark | **Upregulated** | **$+5.93$** | $1.31 \times 10^{-4}$ | Myofibroblastic CAF differentiation (*ACTA2, TAGLN, MYL9*) |
| **IL-2 / STAT5 Signaling** | Hallmark | **Upregulated** | **$+5.23$** | $1.31 \times 10^{-4}$ | Radiation-elicited lymphoid infiltration and survival signaling |
| **Angiogenesis & Vascular Repair** | Hallmark | **Upregulated** | **$+3.43$** | $1.05 \times 10^{-2}$ | Endothelial remodeling and hypoxia-driven revascularization (*VEGFA, FLT1*) |
| **Hypoxia** | Hallmark | **Upregulated** | **$+3.34$** | $1.27 \times 10^{-2}$ | Microvascular ablation resulting in severe intratumoral oxygen deprivation |
| **G2-M Cell Cycle Checkpoint** | Hallmark | **Downregulated** | **$-3.77$** | $4.15 \times 10^{-3}$ | Depletion of active mitotic cycling ducts and radiation-induced arrest |
| **Interferon Alpha Response (Baseline Acute)** | Hallmark | **Downregulated** | **$-3.79$** | $3.97 \times 10^{-3}$ | Transition from acute early viral/interferon sensing to chronic late fibrosis |
| **Heme Metabolism** | Hallmark | **Downregulated** | **$-5.03$** | $1.31 \times 10^{-4}$ | Metabolic suppression in irradiated, fibrotic resection margins |
| **Keratinization & Chemosensory Signaling** | Reactome | **Downregulated** | **$-14.66 \text{ to } -19.10$** | $1.31 \times 10^{-4}$ | Loss of baseline mucosal differentiation markers in residual tissue |

---

### 3. Analysis C — Single-Nucleus Treatment Dissection (GSE202051 snRNA-seq)

#### A. Global Multi-Cellular Shifts
Analysis of **$224,988$ nuclei across $43$ patients** ($108,964$ Untreated vs. $116,024$ Neoadjuvant Treated):
1. **Parenchymal Depletion**: Treated tumors exhibit a marked reduction in viable high-grade malignant epithelial nuclei relative to untreated controls.
2. **Stromal Dominance**: Expansion in the proportion of Cancer-Associated Fibroblasts (CAFs) and perivascular mesenchymal cells in treated resection specimens.

---

#### B. Compartment-Specific Pathway Alterations

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                     COMPARTMENT-SPECIFIC TRANSCRIPTOMIC PROFILES                       │
├─────────────────────────┬──────────────────────────────────────────────────────────────┤
│ Malignant Ductal Cells  │ • Induction of stress/hypoxia survival pathways (HIF1A, CA9) │
│                         │ • Mesenchymal transition (VIM, CD44, AXL)                    │
│                         │ • Suppression of classical mitotic cycling (MKI67, CDK1)     │
├─────────────────────────┼──────────────────────────────────────────────────────────────┤
│ Cancer-Associated       │ • Shift towards myofibroblastic myCAFs (ACTA2, TAGLN, POSTN) │
│ Fibroblasts (CAFs)      │ • Dense collagen matrix synthesis (COL1A1, COL3A1, FN1)      │
│                         │ • Secretory senescence-associated phenotype (SASP / IL6)     │
├─────────────────────────┼──────────────────────────────────────────────────────────────┤
│ Myeloid / Macrophages   │ • Polarization toward pro-fibrotic / M2 TAM state (CD163)    │
│                         │ • Antigen scavenging & debris clearance                      │
├─────────────────────────┼──────────────────────────────────────────────────────────────┤
│ Lymphoid (T / NK Cells) │ • Persistent expression of checkpoint exhaustion (PDCD1)     │
│                         │ • Clonal expansion in tertiary lymphoid-like perivascular foci│
└─────────────────────────┴──────────────────────────────────────────────────────────────┘
```

---

#### C. Divergent & Opposing Directional Programs Across Compartments (High-Impact Finding)

The single-nucleus deconstruction reveals that several key oncogenic and immune pathways change in **diametrically opposing directions** between the malignant epithelial compartment and the surrounding stroma/immune microenvironment:

| Biological Pathway / Program | Direction in Malignant Epithelial Nuclei | Direction in Stromal CAFs & Myeloid Stroma | Biological Mechanism & Manuscript Implication |
| :--- | :--- | :--- | :--- |
| **1. Proliferation & E2F/MYC Targets** | **Suppressed ($\downarrow$)** | **Activated / Maintained ($\uparrow$)** | Therapy induces cell-cycle arrest and apoptosis in tumor ducts, while triggering reactive proliferation and remodeling in stromal fibroblasts. Bulk RNA-seq conflates these two signals. |
| **2. Inflammatory SASP (TNF-$\alpha$ / NF-$\kappa$B / IL-6)** | **Repressed / Quiescent ($\downarrow$)** | **Hyperactivated ($\uparrow$)** | Surviving malignant clones silence baseline inflammatory signaling to evade immune recognition, whereas damaged CAFs launch a vigorous Senescence-Associated Secretory Phenotype (SASP). |
| **3. Antigen Presentation (MHC-I / HLA-A / HLA-B / B2M)** | **Downregulated ($\downarrow$)** | **Upregulated ($\uparrow$)** | Post-treatment malignant cells downregulate antigen presentation machinery as an immune evasion mechanism, while infiltrating macrophages and dendritic cells upregulate HLA transcripts during debris clearance. |
| **4. Glycolytic Metabolism & Oxidative Phosphorylation** | **Shifted to Hypoxic Glycolysis ($\uparrow$)** | **Mitochondrial Homeostasis ($\leftrightarrow$)** | Malignant ducts undergo severe metabolic stress in devascularized hypoxic scars, while stromal fibroblasts maintain structural matrix bioenergetics. |

---

### 4. Cross-Modal Discovery Matrix

```
┌─────────────────────────┬──────────────────────────┬──────────────────────────┬──────────────────────────┐
│ Biological Pathway      │ Bulk RNA-seq (SBRT Cohort)│ snRNA-seq (GSE202051)    │ Spatial Visium (GSE274103│
├─────────────────────────┼──────────────────────────┼──────────────────────────┼──────────────────────────┤
│ EMT / Mesenchymal Drift │ Upregulated (NES = +14.3)│ Enriched in Residual Mal │ Localized to invasive edge│
│ Collagen / Desmoplasia  │ Upregulated (NES = +7.4) │ Driven by myCAFs         │ Pan-tissue (>98% spots)  │
│ Cell Cycle / G2-M       │ Suppressed (NES = -3.8)  │ Arrested in Ductal cells │ Restricted to focal duct │
│ Hypoxia / Angiogenesis  │ Upregulated (NES = +3.4) │ Elevated in Epithelial   │ Colocalized with necrosis│
└─────────────────────────┴──────────────────────────┴──────────────────────────┴──────────────────────────┘
```

---

### Key Takeaways for Manuscript Drafting
1. **Primary Tumor State (Analysis A)**: Demonstrates that untreated PDAC is defined by unchecked cell-cycle kinetics and massive neutrophil/stromal degranulation coupled with loss of differentiated pancreatic exocrine identity.
2. **Radiation Remodeling (Analysis B)**: Proves that ablative SBRT induces a dominant fibrotic/mesenchymal phenotype characterized by heavy fibrillar collagen formation, vascular remodeling, and mitotic arrest.
3. **Compartment Divergence (Analysis C)**: Highlights that post-treatment survival in PDAC is governed by **compartmental discordance**—malignant ducts enter a quiescent, immune-evasive, and mesenchymal state while surrounding fibroblasts execute a hyperactivated secretory and fibrotic program.
