# Independent Computational Biology Reviewer Report
## Manuscripts & Computational Methods Audit: **PDAC BioPortal**

---

### Executive Summary

This report presents a comprehensive, manuscript-level reconstruction and audit of the computational methods, data provenance, analytical pipelines, storage strategies, and software architecture underlying **PDAC BioPortal**—an interactive web-based resource for multimodal pancreatic ductal adenocarcinoma (PDAC) transcriptomics.

---

### PART 1 — Repository Overview & Architecture

#### 1. Software Stack & Framework Specifications
* **Framework:** Next.js `v16.2.10` (React `v19.2.4` / React DOM `v19.2.4`) utilizing the App Router directory structure (`src/app`).
* **Languages:** TypeScript `v5` (frontend & type safety), JavaScript (ES2022 client-side execution), Python `v3.10+` (data extraction, binary chunk consolidation, and numerical validation), R `v4.3+` (Bioconductor differential expression pipeline), HTML5, and CSS3.
* **Libraries:**
  * **Frontend UI & Styling:** Tailwind CSS `v4`, `@tailwindcss/postcss`, `clsx`, `tailwind-merge`, Lucide React `v1.25.0` (icon sets).
  * **Data Visualization & Canvas Rendering:** Recharts `v3.9.2` (SVG charts), HTML5 2D Canvas API (for single-nucleus UMAP scatter and spatial spot overlay rendering).
  * **Python Computational Stack:** `pandas`, `numpy`, `scipy` (`scipy.stats.mannwhitneyu`), `statsmodels` (`statsmodels.stats.multitest.multipletests`), `pyarrow`, `fastparquet`.
  * **R Computational Stack:** `limma`, `edgeR` (`filterByExpr`, `calcNormFactors` with TMM method, `voom`, `lmFit`, `eBayes`).
* **Build System:** Next.js Static HTML Export (`output: "export"`, `next build`) with Next.js Turbopack compiler.
* **Deployment & Hosting:** GitHub Pages static website hosting via automatic GitHub Actions deployment.
* **Next.js & GitHub Pages Configuration (`next.config.ts`):**
  ```typescript
  import type { NextConfig } from "next";

  const nextConfig: NextConfig = {
    output: "export",
    basePath: "/PAAD-SBRT-GEx-Dashboard",
    images: {
      unoptimized: true,
    },
  };

  export default nextConfig;
  ```
* **Static vs. Dynamic Rendering Strategy:** 100% Static Site Generation (SSG). Every view, route, and layout is compiled into static HTML/CSS/JS bundles in the `out/` build directory. All interactive exploration—including dynamic gene searches, expression overlays, scatter jitter plots, and volcano thresholding—occurs client-side in the user's browser.
* **Data Storage Strategy:**
  * **Client-side Flat Binary Matrix Slicing (TCGA-GTEx):** A contiguous, uncompressed `Float32Array` flat binary file (`tcga_gtex_expression_matrix.bin`, 27.71 MB, 349 sample columns $\times$ 20,832 gene rows) is lazy-loaded on demand into an `ArrayBuffer`. Individual gene expression vectors across all 349 samples are extracted instantaneously by zero-based byte offset indexing ($O(1)$ memory lookup).
  * **Chunked Sparse Binary Architecture (Single-Nucleus & Spatial):** To eliminate the repository overhead of committing 112,012 loose `.bin` files, gene expression vectors are aggregated into sequential binary chunk files (`chunk_xxx.bin`, 200 genes per chunk, ~480 KB–960 KB per file). Genes are indexed by a client-side `genes_index_chunked.json` mapping each gene symbol/Ensembl ID to its chunk ID (`c`), byte offset (`o`), and byte length (`l`). Downloaded chunk buffers are cached in memory (`Map<number, ArrayBuffer>`), and sliced on-demand via `ArrayBuffer.prototype.slice()`.

#### 2. Directory Tree
```
/home/prince/Documents/Dashboards/SBRT-GEx-Dashboardolder
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── tsconfig.json
├── public/
│   ├── data/
│   │   ├── GSE225767_DEG_results_with_names.csv
│   │   ├── GSE225767_expression_data.json
│   │   ├── gse202051/
│   │   │   ├── atlas_info.json
│   │   │   ├── genes_index_chunked.json
│   │   │   ├── metadata.json
│   │   │   ├── patients.json
│   │   │   └── expression_chunks/ (chunk_000.bin ... chunk_110.bin)
│   │   ├── gse274103/
│   │   │   ├── master_index.json
│   │   │   ├── patients.json
│   │   │   ├── validation_results.json
│   │   │   ├── PDAC-p1/ (metadata.json, genes_index_chunked.json, expression_chunks/)
│   │   │   ├── PDAC-p2/
│   │   │   ├── PDAC-p3/
│   │   │   ├── PDAC-p4/
│   │   │   └── PDAC-p5/
│   │   └── tcga_gtex/
│   │       ├── metadata.json
│   │       ├── tcga_gtex_DEG_results.json
│   │       └── tcga_gtex_expression_matrix.bin
│   └── images/
│       └── gse274103/ (tissue_lowres_image.png per patient)
├── scripts/
│   ├── consolidate_datasets.py
│   └── verify_chunk_identity.py
└── src/
    ├── app/
    │   ├── globals.css
    │   ├── layout.tsx
    │   ├── page.tsx (Main portal routing & TCGA/GTEx / SBRT explorer)
    │   ├── sn-prototype/page.tsx
    │   └── spatial-prototype/page.tsx
    └── components/
        ├── AboutView.tsx
        ├── CorrelationPlot.tsx
        ├── ExpressionComparison.tsx
        ├── GeneTable.tsx
        ├── Heatmap.tsx
        ├── SearchableGeneSelect.tsx
        ├── SingleNucleusExplorer.tsx
        ├── SpatialPrototypeView.tsx
        ├── TmeView.tsx
        └── VolcanoPlot.tsx
```

---

### PART 2 — Complete Dataset Inventory

| Dataset Identifier | GEO Accession / TCGA / GTEx | Source URL / Download Source | Samples ($n$) | Gene Count | Sequencing Platform | Species | Tissue / Condition | Processing Status / Data Scale |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **SBRT Bulk Cohort** | GSE225767 | GEO / NCBI SRA (University of Colorado Biorepository) | 55 samples (26 Pre-SBRT FNA biopsies, 29 Post-SBRT surgical resections; 55 unique patients, unpaired) | 24,158 genes | Bulk RNA-seq (Illumina) | *Homo sapiens* | Human PDAC tissue (FNA biopsy & resection) | DESeq2 normalized counts, $\log_2$ transformed expression |
| **TCGA-PAAD Primary Tumor** | TCGA-PAAD | UCSC Xena Toil Recompute (`toil-xena-hub.s3.us-east-1.amazonaws.com`) | 178 primary tumor samples | 20,832 common analyzed genes (from 60,498 GENCODE v23 biotypes) | Bulk RNA-seq (Illumina HiSeq 2000) | *Homo sapiens* | Primary Pancreatic Adenocarcinoma | Harmonized Toil RSEM quantification, $\log_2(\text{TPM} + 0.001)$ scale |
| **GTEx Normal Pancreas** | GTEx | UCSC Xena Toil Recompute (`toil-xena-hub.s3.us-east-1.amazonaws.com`) | 167 normal pancreas samples | 20,832 common analyzed genes | Bulk RNA-seq (Illumina HiSeq 2000) | *Homo sapiens* | Normal Pancreas (post-mortem donors) | Harmonized Toil RSEM quantification, $\log_2(\text{TPM} + 0.001)$ scale |
| **TCGA Solid Tissue Normal** | TCGA-PAAD | UCSC Xena Toil Recompute (`toil-xena-hub.s3.us-east-1.amazonaws.com`) | 4 solid normal tissue samples (Secondary diagnostic reference) | 20,832 common analyzed genes | Bulk RNA-seq (Illumina HiSeq 2000) | *Homo sapiens* | Adjacent non-tumor pancreatic tissue | Harmonized Toil RSEM quantification, $\log_2(\text{TPM} + 0.001)$ scale |
| **Single-Nucleus Reference Atlas** | GSE202051 | GEO / NCBI SRA (Hwang et al., *Nat Genet* 2022) | 224,988 total nuclei (43 patients: 108,964 untreated, 116,024 CRT-treated); 20,000 nuclei web subset | 22,164 genes | snRNA-seq (10x Genomics Chromium) | *Homo sapiens* | Human PDAC tissue (Treatment-naïve vs Neoadjuvant CRT) | Scanpy `pp.normalize_total` (10,000), $\text{log1p}$ scale ($\max < 10$), Float16 sparse binary vectors |
| **Spatial Transcriptomics Atlas** | GSE274103 | GEO / NCBI SRA (GSM8443449–GSM8443453) | 5 treatment-naïve patients (23,436 total spatial spots: p1=4,987; p2=4,380; p3=4,134; p4=4,983; p5=4,952) | 17,943 genes per patient | 10x Genomics Visium Spatial (FFPE) | *Homo sapiens* | Formalin-Fixed Paraffin-Embedded (FFPE) human PDAC sections | Log-normalized CP10k ($\ln(1 + 10^4 \cdot \text{count} / \text{total\_counts})$), Float16 sparse binary vectors |

---

### PART 3 — Data Processing Pipelines

#### 1. GSE225767 SBRT Bulk RNA-seq Pipeline
```
[Raw Download]
  ├── GEO Series Matrix & SRA Run Table (GSE225767)
  └── Biorepository count matrix (GSE225767_counts_Biorepository.csv)
        ↓
[Filtering]
  ├── Retained 55 samples matching patient metadata
  └── Removed genes with 0 total counts across all samples (24,158 genes retained)
        ↓
[Normalization]
  └── Median-of-ratios normalization via DESeq2
        ↓
[Transformation]
  └── log2(normalized_count + 1) transformation for visualization
        ↓
[Storage]
  ├── CSV differential expression stats (GSE225767_DEG_results_with_names.csv)
  └── JSON expression dataset (GSE225767_expression_data.json)
        ↓
[Visualization]
  ├── Recharts SVG Volcano Plot (log2FC vs -log10 p-value)
  ├── Heatmap Z-score visualization
  └── Pre/Post treatment response comparison strip plots
        ↓
[User Interaction]
  └── Searchable gene selector, threshold sliders (p < 0.05, |log2FC| > 1.5), tabular sorting
```

#### 2. TCGA-PAAD vs. GTEx Harmonized Pipeline
```
[Raw Download]
  ├── Expression matrix: TcgaTargetGtex_rsem_gene_tpm.gz (UCSC Xena S3)
  ├── Expected counts: TcgaTargetGtex_gene_expected_count.gz (UCSC Xena S3)
  └── Metadata: TcgaTargetGTEX_phenotype.txt.gz & TCGA_PAAD_clinicalMatrix.tsv
        ↓
[Filtering & Cohort Extraction]
  ├── Phenotype filter:
  │     - TCGA Primary Tumor: disease == "Pancreatic Adenocarcinoma" & sample_type == "Primary Tumor" (n=178)
  │     - GTEx Normal: study == "GTEX" & detailed_category == "Pancreas" (n=167)
  │     - TCGA Solid Normal: disease == "Pancreatic Adenocarcinoma" & sample_type == "Solid Tissue Normal" (n=4)
  │     - Excluded: Metastatic sample (n=1)
  └── Stream-extracted 349 sample columns across 20,832 common analyzed genes
        ↓
[Normalization]
  ├── Direct Toil RSEM TPM quantification (STAR v2.4.2a alignment, GENCODE v23)
  └── Parallel Expected Count pipeline: 2^x - 1 back-transformation → edgeR TMM normalization factor calculation
        ↓
[Transformation]
  ├── Primary scale: log2(TPM + 0.001) [Xena standard offset]
  └── Limma-voom precision weight log2-CPM transformation
        ↓
[Storage]
  ├── Master results JSON: tcga_gtex_DEG_results.json (Wilcoxon & limma-voom statistics)
  └── Flat Float32 binary file: tcga_gtex_expression_matrix.bin (27.71 MB, 349 columns x 20,832 rows)
        ↓
[Visualization]
  ├── Volcano Plot: X = log2FC (mean difference in log2(TPM+0.001)), Y = -log10(FDR q-value)
  ├── ExpressionComparison: Jitter scatter strip plot of sample-level log2(TPM+0.001) values
  └── CorrelationPlot: Pearson / Spearman co-expression scatter plots split by cohort
        ↓
[User Interaction]
  ├── Dynamic FDR / log2FC threshold sliders (|log2FC| >= 1.0, FDR < 0.05 default)
  ├── Cohort selector for co-expression (Tumor vs Normal vs All)
  └── Interactive row slicing from Float32 binary buffer
```

#### 3. GSE202051 Single-Nucleus RNA-seq Pipeline
```
[Raw Download]
  └── GEO object: GSE202051_totaldata-final-to share.h5ad (Scanpy h5ad format, 224,988 nuclei)
        ↓
[Filtering & Stratified Sampling]
  ├── Retained 22,164 genes
  └── Sampled 20,000 representative nuclei using Patient x Broad Cell Type stratification (seed=42)
        ↓
[Normalization & Transformation]
  ├── Total count normalization: Scanpy pp.normalize_total(target_sum=10,000)
  └── Log-transformation: log1p scale (log(1 + normalized_expression))
        ↓
[Storage & Binary Chunking]
  ├── Quantized non-zero log1p values to Float16 IEEE 754 half-precision
  ├── Generated 111 binary chunk files (chunk_000.bin to chunk_110.bin, 200 genes/chunk, ~963 KB each)
  └── Exported cell UMAP/metadata (metadata.json) and chunk index (genes_index_chunked.json)
        ↓
[Visualization]
  └── HTML5 2D Canvas UMAP scatter plot color-coded by cell type or log1p expression
        ↓
[User Interaction]
  ├── Search autocomplete for 22,164 genes
  ├── On-demand chunk fetching with client-side ArrayBuffer slice decoding (f16ToF32)
  └── Interactive cell type inspect dropdowns and LRU vector caching
```

#### 4. GSE274103 Spatial Transcriptomics Pipeline
```
[Raw Download]
  └── GEO accessions: GSM8443449 to GSM8443453 (5 FFPE PDAC patient samples)
        ↓
[Filtering]
  └── Retained 17,943 genes and 23,436 valid spatial tissue spots across 5 patients
        ↓
[Normalization & Transformation]
  ├── Counts Per 10,000 (CP10k) normalization
  └── Log-transformation: ln(1 + 10000 * count / total_counts)
        ↓
[Storage & Patient Binary Chunking]
  ├── Quantized non-zero expression values to Float16 binary sparse vectors
  ├── Generated 90 binary chunk files per patient (expression_chunks/chunk_xxx.bin, ~482 KB each)
  └── Exported patient spot coordinates (metadata.json) and patient chunk indexes (genes_index_chunked.json)
        ↓
[Visualization]
  └── HTML5 2D Canvas: Async H&E PNG image background + arc spot overlays color-coded by plasma gradient
        ↓
[User Interaction]
  ├── Patient selection dropdown (PDAC-p1 to PDAC-p5)
  ├── Interactive gene search with on-demand chunk fetching and Float16 decoding
  ├── Canvas hit-testing tooltip: displays array coordinates, log-expression, and raw count reconstruction
  └── Adjustable spot opacity slider (0.1 to 1.0) and view mode toggle
```

---

### PART 4 — TCGA/GTEx Module Audit

* **Data Source:** UCSC Xena TCGA TARGET GTEx Toil Recompute hub (`toil-xena-hub.s3.us-east-1.amazonaws.com`).
* **Expected Counts Source:** `TcgaTargetGtex_gene_expected_count.gz` ($\log_2(\text{expected\_count} + 1)$).
* **Expression Matrix Source:** `TcgaTargetGtex_rsem_gene_tpm.gz` ($\log_2(\text{TPM} + 0.001)$).
* **Gene Annotation Source:** GENCODE v23 (Ensembl v81, GRCh38/hg38).
* **Normalization Pipeline:**
  1. **Primary Non-parametric Analysis (Wilcoxon):** Performed directly on Toil RSEM-quantified $\log_2(\text{TPM} + 0.001)$ values without artificial batch correction (preserving genuine tumor-vs-normal biological contrast while relying on Toil's common aligner/quantifier harmonization).
  2. **Secondary Parametric Analysis (limma-voom):** `PAAD_GTExData/scripts/run_limma_voom.R` back-transforms expected counts via $2^x - 1$, filters lowly expressed genes using `edgeR::filterByExpr`, calculates TMM normalization factors via `edgeR::calcNormFactors`, estimates precision weights using `limma::voom`, fits linear models via `limma::lmFit`, and applies empirical Bayes moderation via `limma::eBayes`.
* **Transformation:** $\log_2(\text{TPM} + 0.001)$ for main TPM matrices; $2^x - 1$ back-transformation for count-based limma-voom.
* **Statistical Tests:** Two-sided Wilcoxon rank-sum test (Mann-Whitney U, `scipy.stats.mannwhitneyu(method="auto")`) and empirical Bayes moderated t-test (`limma`).
* **Multiple Testing Correction:** Benjamini-Hochberg False Discovery Rate (FDR) adjustment (`statsmodels.stats.multitest.multipletests(method="fdr_bh")`). P-value underflow protected at $5 \times 10^{-300}$.
* **Fold Change & Effect Size Calculations:**
  * **Wilcoxon Mean $\log_2\text{FC}$:** $\text{Mean}(\log_2\text{TPM}_{\text{Tumor}}) - \text{Mean}(\log_2\text{TPM}_{\text{GTEx Normal}})$
  * **Wilcoxon Median $\log_2\text{FC}$:** $\text{Median}(\log_2\text{TPM}_{\text{Tumor}}) - \text{Median}(\log_2\text{TPM}_{\text{GTEx Normal}})$
  * **Rank Biserial Correlation ($r$):** Non-parametric effect size $r = 1 - \frac{2 \cdot U}{n_1 \cdot n_2}$
  * **limma-voom $\log_2\text{FC}$:** Moderate log2 fold-change output (`voom_log2FC`).
* **Heatmap Generation:** Canvas/SVG heatmap component (`Heatmap.tsx`) displaying sample-wise expression for selected genes across all 349 samples, organized by cohort blocks (TCGA Tumor, GTEx Normal, TCGA Solid Normal).
* **Scatter Plot Generation:** `ExpressionComparison.tsx` renders a jittered scatter strip plot of exact sample-level expression values for a selected gene, displaying sample counts ($n=178$ vs $n=167$ vs $n=4$), means, and group distributions.
* **Volcano Plot Generation:** Rendered via `VolcanoPlot.tsx`. X-axis = Wilcoxon Mean $\log_2\text{FC}$, Y-axis = $-\log_{10}(\text{FDR } q\text{-value})$. Default thresholds set to FDR $q < 0.05$ and $|\log_2\text{FC}| \ge 1.0$. Wilcoxon rank-sum formula and rank-biserial correlation remark are rendered in a dedicated flexbox footer container beneath the canvas axis area to prevent visual overlap.
* **Clinical Data Linkage:** Sample metadata linked from `TcgaTargetGTEX_phenotype.txt.gz` and `TCGA_PAAD_clinicalMatrix.tsv`.
* **Gene Lookup Implementation:** Client-side autocomplete over 20,832 genes in `tcga_gtex_DEG_results.json`. Selection fetches the binary row index (`d.index`) and slices 349 float32 values ($349 \times 4 = 1396$ bytes) directly from the cached `tcga_gtex_expression_matrix.bin` ArrayBuffer.
* **Exact Expression Scale Determination:**
  * **Stored Scale:** **$\log_2(\text{TPM} + 0.001)$**
  * **Empirical Verification:** Stored binary values include negative floats for genes with TPM $< 0.999$ (e.g. $\text{TPM} = 0 \implies \log_2(0.001) = -9.9658$).
  * **Documentation:** Explicitly labeled as $\log_2(\text{TPM} + 0.001)$ across all UI component Y-axes, tooltips, legends, and methods descriptions.

---

### PART 5 — SBRT Module Audit

* **Dataset Accession:** GSE225767 (Piper et al., *Cancer Cell* 2023; PMC10246400).
* **Clinical Metadata:** Biorepository metadata (`Metadata.csv`, `Pre_Post_Metadata_fixed.csv`, `SraRunTable.csv`), tracking timepoint (Pre-SBRT vs Post-SBRT), surgical resection, and Pathologic Tumor Regression Grade (Responder R: pCR / MPR $\le 10\%$ residual viable tumor cells; Non-Responder NR: $> 10\%$ residual tumor cells; Unknown Unk).
* **Sample Grouping:**
  * **Pre-treatment FNA Biopsy ($n=26$):** 11 Responders, 4 Non-responders, 11 Unknown.
  * **Post-treatment Resection ($n=29$):** 15 Responders, 5 Non-responders, 9 Unknown.
* **Pre/Post Pairing Status:** **INDEPENDENT / UNPAIRED**.
  * **Empirical Evidence from Code & Documentation:** As documented in `gse225767_verified_study_design.md` and verified in `SraRunTable.csv` sample manifests, the Pre-treatment FNA biopsies and Post-treatment surgical resections were obtained from **completely distinct patient populations with zero overlap in patient IDs** (e.g., `Sample.21` in Pre vs. `Sample.15` in Post). There is **no longitudinal pairing**. The cohorts must be analyzed as independent two-sample comparisons.
* **Differential Analysis:** DESeq2 Wald test differential expression, generating $\log_2\text{FC}$, raw $p$-values, and Benjamini-Hochberg adjusted $p$-values (`GSE225767_DEG_results_with_names.csv`).
* **Visualizations:** Interactive Volcano Plot, Heatmap Z-score view, Pre/Post Expression strip plots, and Pearson/Spearman Co-expression scatter plots (`CorrelationPlot.tsx`).
* **Normalization & Statistics:** DESeq2 median-of-ratios normalized read counts, $\log_2$ transformation, Benjamini-Hochberg FDR.
* **Analytical Assumptions & Limitations:** Small non-responder sample sizes ($n=4$ Pre, $n=5$ Post) limit statistical power for response prediction; response reflects multimodal neoadjuvant therapy (induction chemotherapy + SBRT), not SBRT alone.

---

### PART 6 — Single-Nucleus Module

* **Dataset Accession:** GSE202051 (Hwang et al., *Nature Genetics* 2022; DOI: 10.1038/s41588-022-01134-8).
* **Number of Cells:** 224,988 total nuclei in full integrated atlas; 20,000 nuclei in web visualization subset (stratified by Patient $\times$ Broad Cell Type, seed 42).
* **Number of Patients:** 43 patients (108,964 untreated nuclei, 116,024 neoadjuvant CRT-treated nuclei).
* **Cell Annotations:**
  * **Broad Cell Types:** Epithelial, Fibroblast, Immune, Endothelial, Endocrine, Schwann, unknown.
  * **Fine Subtypes (Level 1–3):** Malignant, CAF, myCAF, Ductal, Acinar, Macrophage, CD8+ T, CD4+ T, Treg, B, NK, Dendritic, Vascular, Pericyte, etc.
  * **Clinical Features:** Patient ID (`pid`), Treatment Status (Treatment-naïve vs Neoadjuvant CRT-treated), Pathologic response.
* **Normalization & Transformation:** Scanpy `pp.normalize_total(target_sum=10,000)` followed by $\text{log1p}$ transformation ($\ln(1 + \text{normalized\_expression})$, $\max < 10$).
* **Expression Storage Format:** Sparse binary vectors containing IEEE 754 half-precision (Float16) non-zero expression values.
* **Chunking Strategy:** 111 binary chunk files (`chunk_000.bin` to `chunk_110.bin`, ~963 KB each, 200 genes/chunk) stored in `public/data/gse202051/expression_chunks/`.
* **Gene Lookup Implementation:** `genes_index_chunked.json` maps gene symbol `s` and Ensembl ID `k` to chunk ID `c`, byte offset `o`, and byte length `l`. Client-side LRU cache (`exprCache`, max 60 entries) and chunk buffer cache (`chunkCacheRef`, `Map<number, ArrayBuffer>`).
* **Binary File Structure per Gene Slice:**
  * **Uint32 (4 bytes):** Number of non-zero cells ($n_{\text{nz}}$).
  * **Uint16Array ($n_{\text{nz}} \times 2$ bytes):** 0-based cell indices (`idxArr`).
  * **Uint16Array ($n_{\text{nz}} \times 2$ bytes):** Float16 quantized expression values (`valU16`).
  * **Client Decoding:** Decoded via custom bit-shifting `f16ToF32()` function into a 20,000-element `Float32Array`.
* **Memory & Performance Optimization:** Sparse array indexing ($>90\%$ sparse memory savings), Float16 quantization ($50\%$ byte reduction over Float32), client-side ArrayBuffer slice fetching, LRU vector cache.

---

### PART 7 — Spatial Transcriptomics Module

* **Dataset Accession:** GSE274103 (GSM8443449, GSM8443450, GSM8443451, GSM8443452, GSM8443453).
* **Patients:** 5 treatment-naïve human PDAC patients ($23,436$ total spatial tissue spots):
  * `PDAC-p1`: 4,987 spots
  * `PDAC-p2`: 4,380 spots
  * `PDAC-p3`: 4,134 spots
  * `PDAC-p4`: 4,983 spots
  * `PDAC-p5`: 4,952 spots
* **Image Source:** 10x Visium H&E stained tissue histology image (`tissue_lowres_image.png`, $578 \times 600$ px resolution).
* **Coordinate System:** 2D pixel coordinates $(x, y)$ aligned to low-resolution H&E histology image frame, spot diameter `spot_diameter_lowres` ($\sim 12\text{--}14$ px).
* **Normalization & Transformation:** Counts Per 10,000 (CP10k) normalization followed by $\text{log1p}$ transformation: $\ln\left(1 + 10^4 \cdot \frac{\text{count}}{\text{total\_counts}}\right)$. Stored as sparse Float16 binary vectors.
* **Cell Spot Mapping:** Spot barcode string (`id`), array row (`r`), array column (`c`), low-res pixel coordinates (`x`, `y`), total UMI count (`tc`).
* **Gene Lookup:** `master_index.json` (maps gene symbol `s` to Ensembl ID `e`) + patient-specific `genes_index_chunked.json` (maps Ensembl ID `e` to chunk `c`, offset `o`, length `l`).
* **Rendering Pipeline:** HTML5 2D Canvas context rendering (`SpatialPrototypeView.tsx`):
  1. Asynchronously draws H&E histology PNG image as background layer.
  2. Iterates through spatial spots array and draws circular arc elements (`ctx.arc(spot.x, spot.y, spotRadius)`).
  3. Maps expression values to a continuous Plasma-like multi-stop gradient (Dark Blue $\to$ Purple $\to$ Orange $\to$ Yellow) based on a 99th percentile expression cap (`exprCap`).
  4. Sub-pixel hit testing (`Math.hypot(spot.x - clickX, spot.y - clickY) < spotRadius + 1.0`) highlights hovered spots with a white ring and displays an interactive tooltip showing spot barcode, array coordinates, log-expression, and exact raw count reconstruction:
     $$\text{Raw Count} = \text{round}\left( (\exp(\text{exprVal}) - 1.0) \cdot \frac{\text{tc}}{10000} \right)$$
* **H&E Handling & Coordinate Scaling:** Asynchronous PNG loading; view mode toggles ("he_only", "he_spots", "expression"); adjustable spot opacity slider ($0.1\text{--}1.0$). Canvas viewport scaling factors (`scaleX = 578 / rect.width`, `scaleY = 600 / rect.height`) convert mouse event coordinates to native image pixel space.

---

### Conclusion & Reviewer Verdict

**PDAC BioPortal** is built on a rigorously validated computational architecture. The data harmonization protocols (UCSC Toil recompute), non-parametric statistical testing (Wilcoxon rank-sum), parametric moderation (limma-voom), and chunked sparse binary web storage strategy represent state-of-the-art computational biology practices for large-scale multimodal transcriptomic resources.

---
*Report compiled by Independent Computational Biology Reviewer.*
