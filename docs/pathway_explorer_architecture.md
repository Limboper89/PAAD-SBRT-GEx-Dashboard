# PDAC BioPortal — Pathway Explorer Module Architecture & Documentation

## 1. Executive Summary & Design Principles

The **Pathway Explorer** module provides a production-quality, scientifically reproducible environment for pathway-level biological interpretation of transcriptomic results within PDAC BioPortal.

### 3-Layer Architecture
The module separates concerns into three decoupled layers:

1. **Layer 1: Deterministic Analysis Engine (`src/utils/pathwayEngine.ts`)**
   - Pure, deterministic statistical calculations (Hypergeometric ORA, Benjamini-Hochberg FDR, GSEA ES/NES, Leading-Edge Analysis).
   - Zero dependency on external AI/LLM components for statistical computation.

2. **Layer 2: Pathway Resource & Provenance Layer (`public/data/pathways/`)**
   - Compact, indexed, chunked gene-set databases with complete embedded versioning, source URLs, and redistribution licenses.

3. **Layer 3: Visualization & UI Layer (`src/components/pathways/`)**
   - High-performance, accessible visual tools (Bubble plot, Horizontal Bar plot, Ranked Table with CSV/JSON exporters, Pathway-Gene Matrix, Cross-Study Comparative View, Pathway Detail View with Gene Expression Overlay).

---

## 2. Statistical & Scientific Methodology

### Over-Representation Analysis (ORA)
- **Formula**: Evaluates overlap between input gene list $n$ and pathway gene set $K$ in background universe $N$ via right-tail hypergeometric cumulative distribution $P(X \ge k)$:
  $$P(X \ge k) = \sum_{x=k}^{\min(n, K)} \frac{\binom{K}{x} \binom{N - K}{n - x}}{\binom{N}{n}}$$
  computed using Lanczos log-gamma Stirling approximation to avoid numerical overflow.
- **Fold Enrichment**:
  $$\text{Fold Enrichment} = \frac{k / n}{K / N}$$
- **Gene Universes ($N$)**:
  - **TCGA-PAAD vs GTEx Pancreas**: $N = 17,943$ (all measured genes in Toil uniform re-processing pipeline).
  - **GSE225767 SBRT**: $N = 16,104$ (all measured genes in bulk RNA-seq cohort).
  - **Custom User Input**: $N =$ size of background universe formed by all unique gene set members across loaded databases ($N \sim 10,000+$).

### Gene Set Enrichment Analysis (GSEA)
- **Ranked Gene List**: Ordered by rank metric $r_i = \text{sign}(\text{log2FC}) \times -\log_{10}(p)$.
- **Running Enrichment Score ($ES$)**: Evaluates peak cumulative deviation of weighted hit steps ($p=1$) minus unweighted miss steps.
- **Normalized Enrichment Score ($NES$)**: Normalized by expected set-size mean.
- **Leading-Edge Identification**: Mapped pathway members located at or before the peak ES deviation rank.

### Multiple-Testing Correction
- **Benjamini-Hochberg (BH) FDR**:
  $$q_{(i)} = \min \left( 1, \min_{j \ge i} \left( \frac{m}{j} p_{(j)} \right) \right)$$
  enforcing strict monotonicity across all evaluated pathways in the collection.

---

## 3. Database Provenance & Licensing Compliance

| Collection | Database Version | Identifier | Source URL | License | Redistribution |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **MSigDB Hallmark** | v2024.1.Hs | HGNC symbol | [MSigDB](https://www.gsea-msigdb.org/gsea/msigdb/) | CC BY 4.0 | Permitted |
| **Reactome** | v88 | HGNC symbol | [Reactome.org](https://reactome.org) | CC BY 4.0 / CC0 | Permitted |
| **GO Biological Process** | GO-2024-05 | HGNC symbol | [GeneOntology.org](http://geneontology.org) | CC BY 4.0 | Permitted |
| **KEGG** | External Only | HGNC symbol | [KEGG.jp](https://www.kegg.jp) | Copyrighted | External / Precomputed Only |

> **KEGG Licensing Decision**: Raw KEGG gene-set collection files are NOT bundled in the public repository to strictly observe KEGG commercial and redistribution terms. KEGG pathways are supported via precomputed derived statistics or user-side external API adapters.

---

## 4. Precomputation Pipeline

The precomputation script `scripts/generate_precomputed_pathways.ts`:
1. Reads exact DEG results from `public/data/tcga_gtex/tcga_gtex_DEG_results.json` and `public/data/GSE225767_DEG_results_with_names.csv`.
2. Evaluates exact ORA and GSEA across all database collections.
3. Embeds provenance, universe size $N$, run timestamp, and statistical parameter metadata.
4. Outputs optimized JSON files: `public/data/pathways/tcga_gtex_pathways.json` and `public/data/pathways/sbrt_pathways.json`.

---

## 5. Numerical Validation Suite

The script `scripts/validate_gsea_reference.ts`:
- Validates Stirling Lanczos `logGamma` against $\Gamma(5) = 24$.
- Validates combination calculation against $\binom{10}{3} = 120$.
- Validates hypergeometric tail $P(X \ge 5)$ for $N=100, K=20, n=10$ against analytical standard $P = 0.025465$.
- Validates BH FDR monotonicity and exact adjusted p-values.
- Validates GSEA running $ES$ and leading-edge gene capture.

Run validation:
```bash
npx tsx scripts/validate_gsea_reference.ts
```

---

## 6. PDACopilot AI Assistant Integration API

PDACopilot is strictly an interpretation layer. It queries pathway data via `queryEngine.queryPathwayEnrichment(datasetId, database, fdrThreshold)`:
- Returns structured JSON containing exact pathway IDs, names, NES, fold enrichment, p-value, BH FDR, and mapped gene lists.
- Gemini restricts its responses to grounded numerical values returned by the deterministic engine, avoiding hallucinated enrichment values.

---

## 7. Future Extension Architecture

Interfaces in `src/types/pathway.ts` include definitions for:
- `SamplePathwayScore`: Future ssGSEA / GSVA sample-level pathway scores.
- `CellTypePathwayScore`: Future Single-Nucleus (GSE202051) lineage pathway scores.
- `SpatialSpotPathwayScore`: Future Spatial (GSE274103) spot pathway maps.
