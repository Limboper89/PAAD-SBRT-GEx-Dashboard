"use client";

import React from "react";
import { Database, Info, AlertTriangle, Cpu, BarChart2, BookOpen, Layers, GitBranch, Calendar } from "lucide-react";

export default function AboutView() {
  return (
    <div className="flex flex-col gap-6 w-full animate-fade-in text-slate-300">
      {/* Page Header */}
      <div>
        <h3 className="text-slate-200 font-semibold text-xl flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-teal-400" />
          Study Overview & Methods
        </h3>
        <p className="text-xs text-slate-400 mt-1 font-mono">
          Biological context, study designs, sample characteristics, normalizations, and scientific limitations of the integrated datasets.
        </p>
      </div>

      {/* Global Cross-Study Disclaimer Banner */}
      <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl flex gap-3 shadow-md">
        <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <h5 className="text-amber-200 font-bold text-xs uppercase tracking-wider font-mono">Independent Cohorts Notice</h5>
          <p className="text-[11px] text-amber-300 leading-relaxed mt-1 font-mono">
            <strong>GSE225767, GSE202051, GSE274103, and the TCGA/GTEx resources are independent studies involving different patient cohorts.</strong> Cross-modal views in this BioPortal provide complementary biological context and should not be interpreted as matched multi-omics measurements. No patients are shared across these independent studies.
          </p>
        </div>
      </div>

      {/* Summary Table Grid */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
        <h4 className="text-slate-100 font-semibold text-sm flex items-center gap-2 mb-3 border-b border-slate-850 pb-2 font-mono">
          <Layers className="w-4 h-4 text-indigo-400" />
          Dataset Integration Index
        </h4>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xxs font-mono">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/80">
                <th className="p-3 font-semibold">Dataset / Study</th>
                <th className="p-3 font-semibold">Modality</th>
                <th className="p-3 font-semibold">Cohort Details</th>
                <th className="p-3 font-semibold">Scientific &amp; Translational Purpose</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850 bg-slate-900/40">
              <tr className="hover:bg-slate-850/30 transition-colors">
                <td className="p-3 font-bold text-teal-400">TCGA-PAAD vs GTEx</td>
                <td className="p-3">Bulk Transcriptomics</td>
                <td className="p-3 text-slate-300">178 TCGA primary tumors, 167 GTEx normal pancreas specimens, and 4 TCGA solid tissue normal adjacent controls (sensitivity diagnostic).</td>
                <td className="p-3 text-slate-400">Investigate Tumor vs. Normal baseline transcriptomic differences using Toil recomputed pipelines. Expose Wilcoxon and limma-voom concordant DEGs.</td>
              </tr>
              <tr className="hover:bg-slate-850/30 transition-colors">
                <td className="p-3 font-bold text-teal-400">GSE225767</td>
                <td className="p-3">Bulk RNA-seq (SBRT)</td>
                <td className="p-3 text-slate-300">55 unique PDAC samples (26 pre-treatment FNA biopsies, 29 post-treatment surgical resections)</td>
                <td className="p-3 text-slate-400">Explore gene expression patterns associated with neoadjuvant chemo + SBRT and pathologic response.</td>
              </tr>
              <tr className="hover:bg-slate-850/30 transition-colors">
                <td className="p-3 font-bold text-teal-400">GSE202051</td>
                <td className="p-3">Single-nucleus RNA-seq</td>
                <td className="p-3 text-slate-300">43 primary PDAC specimens (comparing treatment-naïve vs. neoadjuvant treated)</td>
                <td className="p-3 text-slate-400">Explore cell-type resolved expression patterns in a pancreatic reference atlas.</td>
              </tr>
              <tr className="hover:bg-slate-850/30 transition-colors">
                <td className="p-3 font-bold text-teal-400">GSE274103</td>
                <td className="p-3">Spatial transcriptomics</td>
                <td className="p-3 text-slate-300">5 treatment-naïve human PDAC patients (10x Genomics Visium Spatial)</td>
                <td className="p-3 text-slate-400">Explore tissue-level spatial coordinates and gene-expression overlays.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column: Methods & Citations */}
        <div className="flex flex-col gap-6">
          {/* TCGA vs GTEx Methods */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col gap-3">
            <h4 className="text-slate-100 font-semibold text-sm flex items-center gap-2 border-b border-slate-850 pb-2 font-mono">
              <BarChart2 className="w-4 h-4 text-amber-400" />
              TCGA-PAAD vs GTEx Methods & Provenance
            </h4>
            <div className="text-xs leading-relaxed text-slate-400 flex flex-col gap-2.5 font-mono text-[10px]">
              <p>• **Data Source:** Gene expression measurements were downloaded from the UCSC Xena TCGA TARGET GTEx / Toil recompute resource. log₂(TPM + 0.001) expression values were used for sample-level plots, and RSEM expected counts were used for linear modeling.</p>
              <p>• **Reprocessing comparability:** TCGA and GTEx RNA-seq data were reprocessed through a common Toil computational pipeline, reducing computational processing heterogeneity and improving cross-cohort comparability. Residual cohort, pre-analytical, biological, and tissue-composition differences may remain.</p>
              <p>• **Wilcoxon rank-sum (TPM):** Non-parametric test performed on log₂(TPM + 0.001) matrices. Wilcoxon log2FC was calculated as the difference of cohort means: {"\\(\\text{mean}(\\text{log}_2(\\text{TPM}+0.001)_{\\text{tumor}}) - \\text{mean}(\\text{log}_2(\\text{TPM}+0.001)_{\\text{normal}})\\)"}.</p>
              <p>• **limma-voom (counts):** Multi-step linear modeling performed in R. RSEM expected counts were back-transformed ($2^x - 1$) and filtered. Mean-variance modeling and empirical Bayes moderation were applied to calculate count-based log2FC and false discovery rates (FDR).</p>
              <p>• **Concordant DEG:** Annotation category representing genes that are significantly differentially expressed (FDR &lt; 0.05, |log2FC| &ge; 1.0) with consistent direction in both the Wilcoxon and limma-voom workflows.</p>
              <p>• **Citations:** Vivian J, et al. *"Toil enables reproducible, open, and efficient data analysis."* **Bioinformatics** (2017) | PMID: [28369201](https://pubmed.ncbi.nlm.nih.gov/28369201/) | Law CW, et al. *"voom: Precision weights unlock linear model analysis tools for RNA-seq read counts."* **Genome Biology** (2014) | PMID: [24485249](https://pubmed.ncbi.nlm.nih.gov/24485249/)</p>
            </div>
          </div>

          {/* GSE225767 Bulk Methods */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col gap-3">
            <h4 className="text-slate-100 font-semibold text-sm flex items-center gap-2 border-b border-slate-850 pb-2 font-mono">
              <BarChart2 className="w-4 h-4 text-emerald-400" />
              GSE225767 Bulk RNA-seq Methods
            </h4>
            <div className="text-xs leading-relaxed text-slate-400 flex flex-col gap-2 font-mono text-[10px]">
              <p>• **Differential Expression:** Calculated using DESeq2 in R, contrasting 29 post-treatment surgical resections against 26 pre-treatment FNA biopsies.</p>
              <p>• **Significance thresholds:** Adjusted p-values computed using the Benjamini-Hochberg (BH) false discovery rate (FDR) correction.</p>
              <p>• **Citations:** Piper M, Hoen M, Knitz MW, et al. *"Simultaneous targeting of PD-1 and IL-2Rβγ with radiation therapy to inhibit pancreatic cancer growth and metastasis."* **Cancer Cell** (2023) | PMID: [37116489](https://pubmed.ncbi.nlm.nih.gov/37116489/)</p>
            </div>
          </div>
        </div>

        {/* Right Column: Scientific Limitations */}
        <div className="flex flex-col gap-6">
          {/* Detailed Scientific Limitations */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
            <h4 className="text-slate-100 font-semibold text-sm flex items-center gap-2 mb-3 border-b border-slate-850 pb-2 font-mono">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Scientific & Technical Data Limitations
            </h4>
            
            <div className="text-xs leading-relaxed flex flex-col gap-4 text-slate-400 font-mono text-[10px]">
              <div className="flex flex-col gap-1.5">
                <span className="font-bold text-slate-300">1. Cohort Confounding Sampling Factors</span>
                <p className="pl-3 border-l border-slate-800">
                  GTEx samples are derived from organ donors (rapid post-mortem harvesting), while TCGA samples are surgical resections from cancer patients. Technical or pre-analytical differences (ischemia time, tissue handling) could confound cohort-level results.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="font-bold text-slate-300">2. Adjacent Normal Pancreas Tissue Warning</span>
                <p className="pl-3 border-l border-slate-800">
                  TCGA tumor-adjacent solid-normal tissues (n=4) showed transcriptional profiles distinct from healthy GTEx pancreas and closer to TCGA-PAAD tumors; given the small sample size and potential tissue-composition/field effects, these samples were used only as a secondary diagnostic reference.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="font-bold text-slate-300">3. Bulk Confounding FNA vs Resection</span>
                <p className="pl-3 border-l border-slate-800">
                  In GSE225767, pre-treatment bulk samples represent Fine Needle Aspirate (FNA) biopsies, whereas post-treatment samples are surgical resections. Transcriptomic shifts may reflect biopsy vs resection content differences (e.g. stroma-to-epithelial ratios) in addition to treatment-induced changes.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="font-bold text-slate-300">4. Spatial Spot Composition</span>
                <p className="pl-3 border-l border-slate-800">
                  Visium capture spots are 55µm in diameter and contain mixed cellular populations (typically 1-10 cells per spot). Individual marker expression overlays do not resolve single-cell expression or guarantee specific cell presence.
                </p>
              </div>
            </div>
          </div>

          {/* Single Nucleus Methods */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col gap-3">
            <h4 className="text-slate-100 font-semibold text-sm flex items-center gap-2 border-b border-slate-850 pb-2 font-mono">
              <Cpu className="w-4 h-4 text-sky-400" />
              GSE202051 Single-Nucleus Methods
            </h4>
            <div className="text-xs leading-relaxed text-slate-400 flex flex-col gap-2 font-mono text-[10px]">
              <p>• **Cell Profiling:** Analysis of primary tumor cell types (Malignant ductal, CAFs, immune, endothelial) at single-nucleus resolution.</p>
              <p>• **UMAP Embeddings:** Dimensionality reduction representing cells grouped by transcriptomic similarity.</p>
              <p>• **Citations:** Hwang WL, Jagadeesh KA, Guo JA, et al. *"Single-nucleus and spatial transcriptome profiling of pancreatic cancer identifies multicellular dynamics associated with neoadjuvant treatment."* **Nature Genetics** (2022) | PMID: [35902743](https://pubmed.ncbi.nlm.nih.gov/35902743/)</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
