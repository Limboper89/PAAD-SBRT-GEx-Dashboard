# PDAC BioPortal & PDACopilot

### Interactive Multi-Omic Transcriptomics, Proteogenomics, Single-Cell & Spatial Analytics Platform for Pancreatic Ductal Adenocarcinoma

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.22149338.svg)](https://doi.org/10.5281/zenodo.22149338)
[![Live Portal](https://img.shields.io/badge/Live%20Portal-GitHub%20Pages-blue.svg)](https://limboper89.github.io/PAAD-SBRT-GEx-Dashboard/)
[![Next.js 16](https://img.shields.io/badge/Next.js-16.2-black.svg)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue.svg)](https://www.typescriptlang.org/)

**PDAC BioPortal** is a browser-native multi-omic analytics platform for pancreatic ductal adenocarcinoma (PDAC) built with **Next.js 16**, **React 19**, **TypeScript**, and **Tailwind CSS**. All differential abundance statistics, Float32 binary expression queries, survival models, pathway enrichment analyses, and publication-grade figure exports run **100% client-side**. It also integrates **PDACopilot**, a context-aware, evidence-grounded AI research assistant that operates fully decoupled from the visualization engine.

---

## Integrated Datasets & Molecular Modalities

> **Independent Cohorts Notice:** `TCGA-PAAD/GTEx`, `GSE225767`, `CPTAC-PDAC`, `GSE202051`, and `GSE274103` represent independent patient cohorts. Cross-module exploration provides orthogonal validation rather than matched multi-omics from the same patients (within `CPTAC-PDAC`, TMT proteomics, RSEM RNA-seq, and clinical survival are matched across the same 140 tumors).

| Dataset | Modality | Samples & Features | Primary Reference |
|---|---|---|---|
| **TCGA-PAAD vs. GTEx** | Bulk RNA-seq (UCSC Xena Toil) | **349 samples** (178 TCGA primary tumors, 167 GTEx normal pancreas, 4 TCGA solid normal controls); **177 TCGA OS** cases | Vivian et al., *Bioinformatics* 2017 ([PMID:28369201](https://pubmed.ncbi.nlm.nih.gov/28369201/)) |
| **GSE225767** | Bulk RNA-seq (Neoadjuvant Chemo + SBRT) | **55 PDAC samples** (26 pre-treatment FNA biopsies, 29 post-treatment resections); **35 pathologic response** cases | Piper et al., *Cancer Cell* 2023 ([PMID:37116489](https://pubmed.ncbi.nlm.nih.gov/37116489/)) |
| **CPTAC-PDAC (`paad_cptac_2021`)** | TMT-11 Global Proteomics & Paired Proteogenomics | **11,662 proteins** across **215 TMT samples** (140 tumors, 75 NATs; **67 paired Tumor–NAT**); **19,081 paired RNA-seq genes** (140 tumors, 21 NATs; 11,143 paired genes tested); **134 valid OS** cases (76 events; 129 PDAC-only subset) | Cao et al., *Cell* 2021 ([PMID:34534465](https://pubmed.ncbi.nlm.nih.gov/34534465/)) |
| **GSE202051** | Single-Nucleus RNA-seq (snRNA-seq) | **224,988 single nuclei** across **43 primary PDAC patients** (18 treatment-naïve vs. 25 neoadjuvant-treated) | Hwang et al., *Nature Genetics* 2022 ([PMID:35902743](https://pubmed.ncbi.nlm.nih.gov/35902743/)) |
| **GSE274103** | Spatial Transcriptomics (10x Visium) | **5 treatment-naïve human PDAC tissue sections** with H&E histology & spot coordinates | GEO `GSE274103` |

---

## Core Analytical Modules

1. **Differential Expression (`de`):**
   - Interactive high-DPI Volcano plots (DESeq2 BH FDR for SBRT; Wilcoxon + limma-voom concordant DEGs for TCGA vs. GTEx), multi-gene table selection with collision-aware callout labels, and sample-level expression boxplots/bar charts.
2. **Heatmap & Co-Expression (`correlation`):**
   - Cohort-partitioned Z-score heatmaps with live `Row Z-Score` colorbars and a **Paste Gene List** drawer (`comma`, `space`, `tab`, or newline delimited).
   - Single-gene and multi-gene signature correlation (Pearson `r`, exact Student-t `p`, Spearman `ρ`, OLS fit) plus Pairwise M × K correlation matrices.
3. **CPTAC-PDAC Proteomics & Proteogenomics (`cptac`):**
   - **Tumor vs. Normal Abundance:** Proteome-wide volcano plot (Mann-Whitney U or Welch t-test BH FDR), searchable 11,662-protein statistics table, and Tumor vs. NAT distribution plot (with optional 67 paired Tumor–NAT view and automatic mRNA-only fallback for low-abundance targets below TMT detection limits).
   - **Matched mRNA-Protein Concordance:** Dedicated same-gene and cross-omic (`Gene A mRNA vs. Gene B Protein`) proteogenomic scatter plots plus **MSigDB Hallmark** pathway-level median `r` (IQR) concordance ranking.
   - **Heatmap & Co-Expression:** Multi-protein / matched mRNA Z-score heatmap with **Tissue (`NAT` vs. `Tumor`)** and **AJCC Stage (`Stage I–IV`)** top annotation tracks, live colorbar, Paste Gene List drawer, and **Within-Layer Co-Expression** (Pairwise Matrix + synced Protein-vs-Protein or mRNA-vs-mRNA Signature Scatter).
   - **Overall Survival Validation:** Standardized continuous **Cox Proportional Hazards** (Efron ties, HR, 95% CI, Wald/LR p, Harrell's C-index) and **Kaplan-Meier** curves with **Lausen & Schumacher (1992) `maxstat Lau92`** optimal cutpoint p-values, 95% Greenwood CI, and Numbers-at-Risk tables.
4. **Pathway Enrichment (`pathway`):**
   - Client-side **GSEA** (running Enrichment Score mountain curves, hit barcode, leading-edge genes, BH FDR) and **ORA** across MSigDB Hallmark, KEGG, Reactome, and GO Biological Process, with Bar, Bubble, Gene Matrix, Crosstalk Network, Cross-Contrast Comparison, and Custom Gene Set input.
5. **Survival & SBRT Pathologic Response (`survival`):**
   - TCGA-PAAD Kaplan-Meier overall survival (`n=177`) for single genes or pasted multi-gene signatures alongside GSE225767 neoadjuvant SBRT Responder vs. Non-Responder trajectory plots.
6. **Single-Nucleus Reference Atlas (`sn`):**
   - 224,988-nuclei UMAP explorer, lineage/treatment filtering, patient-level pseudobulk Naïve vs. Treated comparisons, paired malignant vs. non-malignant ductal analysis, pathologic response heatmap, and snRNA-seq pathway explorer.
7. **Spatial Transcriptomics (`tme`):**
   - Visium spot-level expression overlays on H&E histology across 5 PDAC patients, zoomable ROI export, and cross-patient spatial coverage vs. mean intensity plots.
8. **PDACopilot (Context-Aware AI Assistant):**
   - Live Context Inspector tracking active dataset, module, gene, figure, filters, and live CPTAC proteomics metrics.
   - Deterministic local data grounding across `TCGA-GTEx`, `GSE225767`, `CPTAC-PDAC`, `GSE202051`, and `GSE274103`, structured `[Portal Observation]` / `[Published Biological Knowledge]` / `[Hypothesis]` output, evidence checklist badges, and reproducible `.md` report export.

---

## Publication-Grade Export Suite

Every chart exports **300 DPI-ready `2400 × 2400 px` PNG**, standalone **SVG** (Light & Dark themes), and **metadata-annotated CSV**:
- Typography is standardized via `PUB_TYPE` in `src/utils/exportUtils.ts` to match multi-panel journal figure proportions (GEPIA2-calibrated: `98–100 px` titles, `84 px` axis titles, `66–70 px` tick labels, `54–62 px` in-plot stats/legend cards on `2400 × 2400 px` canvases) so labels remain crisp when scaled to 60–85 mm print panels.
- Exact scientific p-value formatting prevents `p = 0.00` rounding artifacts.

---

## Quickstart Guide (Local Development)

### 1. Prerequisites
- **Node.js**: v18.0.0+ (v20+ recommended)
- **npm**: v9.0.0+
- *(Optional, only to rebuild CPTAC-PDAC assets)* **Python 3.10+** with `numpy`, `scipy`, `pandas`

### 2. Installation
```bash
git clone https://github.com/Limboper89/PAAD-SBRT-GEx-Dashboard.git
cd PAAD-SBRT-GEx-Dashboard
npm install
```

### 3. Run Local Development Server
```bash
npm run dev
```
Open your browser at:
- **http://localhost:3000/PAAD-SBRT-GEx-Dashboard** *(visiting `http://localhost:3000/` automatically redirects to `/PAAD-SBRT-GEx-Dashboard`)*

*(Optional)* To enable live Gemini responses inside PDACopilot locally, configure `GEMINI_API_KEY` in `.env.local`. All visualizations, statistics, and exports work 100% offline without an API key.

---

## Verification & Build Commands

```bash
# TypeScript type-checking
npx tsc --noEmit

# CPTAC-PDAC proteomics unit & data-parity tests
npx tsx scripts/test_cptac_proteomics.ts

# Production build verification
npm run build

# Start production server locally
npm run start

# (Optional) Rebuild CPTAC-PDAC assets from public LinkedOmics + cBioPortal sources
python scripts/build_cptac_pdac_dataset.py
```

---

## Project Structure

```text
├── public/data/
│   ├── cptac_pdac/                   # CPTAC-PDAC Float32 matrices & stats JSONs
│   ├── tcga_gtex/                    # TCGA-PAAD vs GTEx Float32 matrix & survival data
│   ├── gse202051/                    # 224,988-nuclei snRNA-seq atlas assets
│   ├── gse274103/                    # 5-patient Visium spatial transcriptomics assets
│   ├── pathways/                     # Precomputed MSigDB Hallmark, KEGG, Reactome, GO libraries
│   └── GSE225767_*                   # Neoadjuvant SBRT bulk RNA-seq DEGs & metadata
├── scripts/
│   ├── build_cptac_pdac_dataset.py   # Reproducible CPTAC-PDAC dataset builder
│   ├── test_cptac_proteomics.ts      # CPTAC-PDAC unit & integration verification
│   └── ...                           # Dataset, pathway, & PDACopilot test scripts
├── src/
│   ├── app/
│   │   ├── layout.tsx                # Global layout, metadata/JSON-LD, AIProvider
│   │   ├── page.tsx                  # Main multi-omic dashboard & tab synchronization
│   │   └── api/ai/gemini/            # Optional Gemini proxy route for PDACopilot
│   ├── components/
│   │   ├── cptac/                    # 4-tab CPTAC-PDAC Proteomics & Proteogenomics module
│   │   ├── ai/                       # PDACopilot context, grounding, routing & chat drawer
│   │   ├── pathways/                 # GSEA/ORA charts, custom input, matrix & network views
│   │   ├── singleNucleus/            # snRNA-seq pathologic response heatmap & pathways
│   │   ├── VolcanoPlot.tsx           # Interactive DEG volcano plot
│   │   ├── Heatmap.tsx               # Multi-gene Z-score heatmap + Paste Gene List
│   │   ├── CorrelationPlot.tsx       # Single-gene & multi-gene signature co-expression
│   │   ├── ExpressionComparison.tsx  # TCGA vs GTEx boxplots & SBRT bar plots
│   │   ├── SurvivalExplorer.tsx      # TCGA KM survival & SBRT pathologic response
│   │   ├── SingleNucleusExplorer.tsx # 224,988-nuclei UMAP & pseudobulk explorer
│   │   ├── SpatialPrototypeView.tsx  # Visium H&E + spot expression viewer
│   │   ├── AboutView.tsx             # Provenance, methods, citations & limitations
│   │   └── ExportButton.tsx          # PNG, SVG & CSV publication export controls
│   ├── types/cptac.ts                # CPTAC-PDAC TypeScript schemas
│   └── utils/
│       ├── cptacEngine.ts            # Mann-Whitney, Welch, Pearson/Spearman, Cox PH, maxstat
│       ├── survivalEngine.ts         # Kaplan-Meier, Greenwood CI & log-rank engine
│       ├── pathwayEngine.ts          # Client-side GSEA & ORA engine
│       └── exportUtils.ts            # GEPIA2-calibrated 2400px PNG/SVG & CSV exporters
├── next.config.ts
├── package.json
└── tsconfig.json
```

---

## Citation & Deployment

- **Permanent Archive / DOI:** [10.5281/zenodo.22149338](https://doi.org/10.5281/zenodo.22149338)
- **Live Portal:** [https://limboper89.github.io/PAAD-SBRT-GEx-Dashboard/](https://limboper89.github.io/PAAD-SBRT-GEx-Dashboard/)
- **Source Repository:** [https://github.com/Limboper89/PAAD-SBRT-GEx-Dashboard](https://github.com/Limboper89/PAAD-SBRT-GEx-Dashboard)
