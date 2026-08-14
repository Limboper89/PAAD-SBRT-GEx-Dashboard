# build_ranked_datasets.py - Generate Full Genome-Wide Ranked Gene Lists for GSEA

import json
import math
import os

DATA_DIR = "public/data/pathways"
os.makedirs(DATA_DIR, exist_ok=True)

print("=== GENERATING FULL TRANSCRIPTOMIC RANKED DATASETS FOR GSEA ===")

# 1. Generate TCGA-PAAD vs GTEx Full Ranked List
tcga_file = "public/data/tcga_gtex/tcga_gtex_DEG_results.json"
if os.path.exists(tcga_file):
    with open(tcga_file) as f:
        tcga_data = json.load(f)

    tcga_dict = {}
    for d in tcga_data:
      sym = d.get("symbol")
      if not sym:
        continue
      clean_sym = sym.upper().strip()
      p = max(1e-300, d.get("pval", 1.0))
      log2fc = d.get("log2FC", 0.0)
      rank_metric = (1.0 if log2fc >= 0 else -1.0) * (-math.log10(p))
      
      if clean_sym not in tcga_dict or abs(rank_metric) > abs(tcga_dict[clean_sym]["rankMetric"]):
        tcga_dict[clean_sym] = {
          "symbol": clean_sym,
          "rankMetric": round(rank_metric, 4),
          "log2FC": round(log2fc, 4),
          "pValue": p,
          "adjPValue": d.get("qval")
        }

    ranked_tcga = list(tcga_dict.values())
    ranked_tcga.sort(key=lambda x: x["rankMetric"], reverse=True)

    with open(os.path.join(DATA_DIR, "tcga_gtex_ranked_genes.json"), "w") as f:
      json.dump({
        "metadata": {
          "datasetId": "tcga_gtex",
          "datasetName": "TCGA-PAAD vs GTEx Pancreas Normal Reference",
          "totalGenes": len(ranked_tcga),
          "rankingMetric": "sign(log2FC) * -log10(pval)"
        },
        "rankedGenes": ranked_tcga
      }, f, indent=2)

    print(f"1. Built TCGA-PAAD vs GTEx Ranked Dataset: {len(ranked_tcga)} unique genes.")

# 2. Generate GSE225767 SBRT Full Ranked List
sbrt_file = "public/data/GSE225767_DEG_results_with_names.csv"
if os.path.exists(sbrt_file):
    with open(sbrt_file) as f:
      lines = f.read().splitlines()

    sbrt_dict = {}
    for line in lines[1:]:
      parts = line.strip().split(",")
      if len(parts) >= 4:
        sym = parts[0].replace('"', "").strip().upper()
        if not sym:
          continue
        log2fc = float(parts[2])
        p = max(1e-300, float(parts[3]))
        adj_p = float(parts[4]) if len(parts) > 4 else p
        rank_metric = (1.0 if log2fc >= 0 else -1.0) * (-math.log10(p))
        
        if sym not in sbrt_dict or abs(rank_metric) > abs(sbrt_dict[sym]["rankMetric"]):
          sbrt_dict[sym] = {
            "symbol": sym,
            "rankMetric": round(rank_metric, 4),
            "log2FC": round(log2fc, 4),
            "pValue": p,
            "adjPValue": adj_p
          }

    ranked_sbrt = list(sbrt_dict.values())
    ranked_sbrt.sort(key=lambda x: x["rankMetric"], reverse=True)

    with open(os.path.join(DATA_DIR, "gse225767_ranked_genes.json"), "w") as f:
      json.dump({
        "metadata": {
          "datasetId": "gse225767",
          "datasetName": "GSE225767 SBRT Radiotherapy Response",
          "totalGenes": len(ranked_sbrt),
          "rankingMetric": "sign(log2FC) * -log10(pval)"
        },
        "rankedGenes": ranked_sbrt
      }, f, indent=2)

    print(f"2. Built GSE225767 SBRT Ranked Dataset: {len(ranked_sbrt)} unique genes.")

print("\n=== RANKED DATASETS BUILT SUCCESSFULLY ===")
