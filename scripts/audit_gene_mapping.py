# audit_gene_mapping.py - Developer Diagnostic for Key Gene Mapping

import json

print("=== GENE MAPPING DIAGNOSTIC REPORT ===")

# Load Global HGNC reference
with open("public/data/pathways/hgnc_human_genes.json") as f:
    hgnc_data = json.load(f)
    hgnc_set = set(hgnc_data["genes"])

# Load Dataset universe (TCGA-PAAD vs GTEx)
with open("public/data/tcga_gtex/tcga_gtex_DEG_results.json") as f:
    tcga_data = json.load(f)
    dataset_set = set(d["symbol"].upper() for d in tcga_data if d.get("symbol"))

# Load Pathway collections
with open("public/data/pathways/hallmark.json") as f:
    hallmark = json.load(f)
    hallmark_genes = set(g for p in hallmark["pathways"] for g in p["genes"])

with open("public/data/pathways/reactome.json") as f:
    reactome = json.load(f)
    reactome_genes = set(g for p in reactome["pathways"] for g in p["genes"])

with open("public/data/pathways/go_bp.json") as f:
    go_bp = json.load(f)
    go_genes = set(g for p in go_bp["pathways"] for g in p["genes"])

target_genes = [
    "TP53", "SLC1A5", "KRAS", "PHGDH", "PSAT1", "PSPH", "SHMT2",
    "NFE2L2", # NRF2 official HGNC symbol
    "NQO1", "GCLC", "GCLM", "SMAD4", "CDKN2A", "MYC", "BRCA1",
    "BRCA2", "EGFR", "AKT1", "MTOR"
]

print(f"{'GENE':<10} | {'HGNC_VALID':<10} | {'DATASET':<10} | {'HALLMARK':<10} | {'REACTOME':<10} | {'GO_BP':<10}")
print("-" * 70)

for g in target_genes:
    hgnc_val = "YES" if g in hgnc_set else "NO"
    ds_val = "YES" if g in dataset_set else "NO"
    hm_val = "YES" if g in hallmark_genes else "NO"
    re_val = "YES" if g in reactome_genes else "NO"
    go_val = "YES" if g in go_genes else "NO"
    
    print(f"{g:<10} | {hgnc_val:<10} | {ds_val:<10} | {hm_val:<10} | {re_val:<10} | {go_val:<10}")

print("\n=== GENE MAPPING AUDIT COMPLETED ===")
