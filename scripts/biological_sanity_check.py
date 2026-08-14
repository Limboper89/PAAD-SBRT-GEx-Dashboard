# biological_sanity_check.py - Generate Biological Sanity Check Reports

import json

print("=== BIOLOGICAL SANITY CHECK REPORT ===")

with open('public/data/pathways/tcga_gtex_pathways.json') as f:
    tcga_p = json.load(f)

with open('public/data/pathways/sbrt_pathways.json') as f:
    sbrt_p = json.load(f)

def print_top(title, items):
    print(f"\n--- {title} ---")
    print(f"{'Rank':<4} | {'Pathway Name':<45} | {'DB':<10} | {'NES':<8} | {'FDR':<10} | {'Direction'}")
    print("-" * 90)
    for idx, r in enumerate(items[:20], 1):
        nes_str = f"{r.get('nes', 0.0):.3f}" if r.get('nes') is not None else f"{r.get('foldEnrichment', 0.0):.2f}x"
        print(f"{idx:<4} | {r['pathwayName'][:45]:<45} | {r['database']:<10} | {nes_str:<8} | {r['adjPValue']:<10.2e} | {r['direction']}")

tcga_gsea = sorted(tcga_p['gseaResults'], key=lambda x: abs(x.get('nes', 0.0)), reverse=True)
sbrt_gsea = sorted(sbrt_p['gseaResults'], key=lambda x: abs(x.get('nes', 0.0)), reverse=True)

tcga_hallmark = [r for r in tcga_gsea if r['database'] == 'Hallmark']
tcga_reactome = [r for r in tcga_gsea if r['database'] == 'Reactome']

sbrt_hallmark = [r for r in sbrt_gsea if r['database'] == 'Hallmark']
sbrt_reactome = [r for r in sbrt_gsea if r['database'] == 'Reactome']

print_top("1. TCGA-PAAD vs GTEx Hallmark GSEA", tcga_hallmark)
print_top("2. TCGA-PAAD vs GTEx Reactome GSEA", tcga_reactome)
print_top("3. SBRT Post vs Pre Hallmark GSEA", sbrt_hallmark)
print_top("4. SBRT Post vs Pre Reactome GSEA", sbrt_reactome)
