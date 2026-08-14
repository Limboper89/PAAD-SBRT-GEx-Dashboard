# test_cohort_pathways.py - Precomputed Cohort Pathway Diagnostic Script

import json
import numpy as np

print("=== PRECOMPUTED COHORT PATHWAYS DIAGNOSTIC REPORT ===")

cohort_files = [
    ("TCGA-PAAD vs GTEx Pancreas", "public/data/pathways/tcga_gtex_pathways.json"),
    ("GSE225767 SBRT Radiotherapy", "public/data/pathways/sbrt_pathways.json")
]

for label, fpath in cohort_files:
    print(f"\n==================================================")
    print(f"Dataset: {label}")
    print(f"File: {fpath}")
    
    with open(fpath) as f:
        data = json.load(f)

    meta = data.get("metadata", {})
    ora_results = data.get("oraResults", [])
    gsea_results = data.get("gseaResults", [])

    fdrs = [p.get("adjPValue", p.get("adjustedPValue", 1.0)) for p in ora_results]
    
    fdr_005 = sum(1 for f in fdrs if f < 0.05)
    fdr_010 = sum(1 for f in fdrs if f < 0.10)
    fdr_025 = sum(1 for f in fdrs if f < 0.25)
    
    min_fdr = min(fdrs) if fdrs else 1.0
    median_fdr = np.median(fdrs) if fdrs else 1.0

    print(f"  Background Universe Size: {meta.get('backgroundUniverseSize')}")
    print(f"  DEG Input Count:          {meta.get('degInputCount')}")
    print(f"  Total Tested ORA Pathways:{len(ora_results)}")
    print(f"  Pathways (FDR < 0.05):     {fdr_005}")
    print(f"  Pathways (FDR < 0.10):     {fdr_010}")
    print(f"  Pathways (FDR < 0.25):     {fdr_025}")
    print(f"  Minimum Observed FDR:     {min_fdr:.4e}")
    print(f"  Median Observed FDR:      {median_fdr:.4e}")

    print(f"\n  Top 20 Enriched ORA Pathways for {label}:")
    print(f"  {'RANK':<5} | {'PATHWAY_ID':<45} | {'P-VALUE':<10} | {'FDR (q-val)':<10} | {'OVERLAP'}")
    print(f"  {'-'*85}")

    top_20 = ora_results[:20]
    for idx, p in enumerate(top_20, 1):
        pid = p["pathwayId"][:44]
        pval = f"{p['pValue']:.2e}"
        fdr = f"{p.get('adjPValue', p.get('adjustedPValue', 1.0)):.2e}"
        overlap = f"{p.get('overlapCount', 0)}/{p.get('geneSetSize', len(p.get('genes', [])))}"
        print(f"  {idx:<5} | {pid:<45} | {pval:<10} | {fdr:<10} | {overlap}")

print("\n=== COHORT PATHWAYS DIAGNOSTIC COMPLETED CLEANLY ===")
