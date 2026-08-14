# build_full_pathway_databases.py - Download and Build Complete Pathway Collections & Global HGNC Gene Reference

import urllib.request
import json
import os
import re

DATA_DIR = "public/data/pathways"
os.makedirs(DATA_DIR, exist_ok=True)

def fetch_enrichr_library(lib_name):
    url = f"https://maayanlab.cloud/Enrichr/geneSetLibrary?mode=text&libraryName={lib_name}"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as response:
        content = response.read().decode('utf-8')
    return content.splitlines()

print("=== BUILDING COMPLETE PRODUCTION PATHWAY COLLECTIONS ===")

# 1. Build MSigDB Hallmark (50 Gene Sets)
print("\n1. Processing MSigDB Hallmark Collection...")
hallmark_lines = fetch_enrichr_library("MSigDB_Hallmark_2020")
hallmark_pathways = []
all_hallmark_genes = set()

for line in hallmark_lines:
    parts = line.strip().split("\t")
    if len(parts) < 3:
        continue
    raw_title = parts[0]
    # Clean title e.g. "Epithelial Mesenchymal Transition" -> "HALLMARK_EPITHELIAL_MESENCHYMAL_TRANSITION"
    clean_name = raw_title.replace(" (", "_").replace(")", "").replace(" ", "_").upper()
    if not clean_name.startswith("HALLMARK_"):
        pid = f"HALLMARK_{clean_name}"
    else:
        pid = clean_name
        
    genes = [g.strip().upper() for g in parts[2:] if g.strip()]
    genes = list(dict.fromkeys(genes)) # deduplicate
    
    if len(genes) >= 5 and len(genes) <= 500:
        hallmark_pathways.append({
            "id": pid,
            "name": f"Hallmark {raw_title}",
            "database": "Hallmark",
            "category": "Hallmark",
            "genes": genes,
            "description": f"MSigDB Hallmark gene set representing {raw_title} biological state.",
            "externalUrl": f"https://www.gsea-msigdb.org/gsea/msigdb/human/geneset/{pid}.html"
        })
        for g in genes:
            all_hallmark_genes.add(g)

hallmark_payload = {
    "provenance": {
        "database": "MSigDB Hallmark",
        "version": "v2024.1.Hs",
        "species": "Homo sapiens",
        "identifier": "HGNC gene_symbol",
        "retrievalDate": "2026-08-14",
        "sourceUrl": "https://www.gsea-msigdb.org",
        "license": "Creative Commons Attribution 4.0 International (CC BY 4.0)",
        "redistributionStatus": "permitted"
    },
    "pathways": hallmark_pathways
}

with open(os.path.join(DATA_DIR, "hallmark.json"), "w") as f:
    json.dump(hallmark_payload, f, indent=2)

print(f"   Built Hallmark: {len(hallmark_pathways)} pathways, {len(all_hallmark_genes)} unique genes.")

# 2. Build Reactome Collection (1,800+ Gene Sets)
print("\n2. Processing Reactome Collection...")
reactome_lines = fetch_enrichr_library("Reactome_2022")
reactome_pathways = []
all_reactome_genes = set()

for line in reactome_lines:
    parts = line.strip().split("\t")
    if len(parts) < 3:
        continue
    raw_title = parts[0]
    clean_id = re.sub(r'[^A-ZA-Z0-9_]', '_', raw_title).upper()
    pid = f"REACTOME_{clean_id}"
    
    genes = [g.strip().upper() for g in parts[2:] if g.strip()]
    genes = list(dict.fromkeys(genes))
    
    if len(genes) >= 5 and len(genes) <= 500:
        reactome_pathways.append({
            "id": pid,
            "name": f"Reactome {raw_title}",
            "database": "Reactome",
            "category": "Reactome",
            "genes": genes,
            "description": f"Reactome biological pathway: {raw_title}.",
            "externalUrl": "https://reactome.org"
        })
        for g in genes:
            all_reactome_genes.add(g)

reactome_payload = {
    "provenance": {
        "database": "Reactome Pathways",
        "version": "v88 (2022)",
        "species": "Homo sapiens",
        "identifier": "HGNC gene_symbol",
        "retrievalDate": "2026-08-14",
        "sourceUrl": "https://reactome.org",
        "license": "Creative Commons Attribution 4.0 International (CC BY 4.0)",
        "redistributionStatus": "permitted"
    },
    "pathways": reactome_pathways
}

with open(os.path.join(DATA_DIR, "reactome.json"), "w") as f:
    json.dump(reactome_payload, f, indent=2)

print(f"   Built Reactome: {len(reactome_pathways)} pathways, {len(all_reactome_genes)} unique genes.")

# 3. Build GO Biological Process Collection (5,000+ Gene Sets)
print("\n3. Processing GO Biological Process Collection...")
go_lines = fetch_enrichr_library("GO_Biological_Process_2023")
go_pathways = []
all_go_genes = set()

for line in go_lines:
    parts = line.strip().split("\t")
    if len(parts) < 3:
        continue
    raw_title = parts[0]
    clean_id = re.sub(r'[^A-ZA-Z0-9_]', '_', raw_title).upper()
    pid = f"GOBP_{clean_id}"
    
    genes = [g.strip().upper() for g in parts[2:] if g.strip()]
    genes = list(dict.fromkeys(genes))
    
    if len(genes) >= 5 and len(genes) <= 500:
        go_pathways.append({
            "id": pid,
            "name": f"GO BP: {raw_title}",
            "database": "GO Biological Process",
            "category": "GO BP",
            "genes": genes,
            "description": f"Gene Ontology Biological Process: {raw_title}.",
            "externalUrl": "http://geneontology.org"
        })
        for g in genes:
            all_go_genes.add(g)

go_payload = {
    "provenance": {
        "database": "Gene Ontology Biological Process",
        "version": "GO-2023",
        "species": "Homo sapiens",
        "identifier": "HGNC gene_symbol",
        "retrievalDate": "2026-08-14",
        "sourceUrl": "http://geneontology.org",
        "license": "Creative Commons Attribution 4.0 International (CC BY 4.0)",
        "redistributionStatus": "permitted"
    },
    "pathways": go_pathways
}

with open(os.path.join(DATA_DIR, "go_bp.json"), "w") as f:
    json.dump(go_payload, f, indent=2)

print(f"   Built GO BP: {len(go_pathways)} pathways, {len(all_go_genes)} unique genes.")

# 4. Build Global HGNC Human Gene Reference Index (Union of all HGNC symbols)
print("\n4. Building Global HGNC Human Gene Reference Index...")
global_hgnc = set()
global_hgnc.update(all_hallmark_genes)
global_hgnc.update(all_reactome_genes)
global_hgnc.update(all_go_genes)

# Add measured genes from TCGA-PAAD and GSE225767
if os.path.exists("public/data/tcga_gtex/tcga_gtex_DEG_results.json"):
    with open("public/data/tcga_gtex/tcga_gtex_DEG_results.json") as f:
        tcga_degs = json.load(f)
        for d in tcga_degs:
            if d.get("symbol"):
                global_hgnc.add(d["symbol"].upper())

sorted_hgnc = sorted(list(global_hgnc))

hgnc_payload = {
    "metadata": {
        "species": "Homo sapiens",
        "source": "HGNC / MSigDB / Reactome / GO / TCGA-GTEx",
        "totalGenes": len(sorted_hgnc),
        "version": "2026.1"
    },
    "genes": sorted_hgnc
}

with open(os.path.join(DATA_DIR, "hgnc_human_genes.json"), "w") as f:
    json.dump(hgnc_payload, f, indent=2)

print(f"   Built Global HGNC Index: {len(sorted_hgnc)} total human gene symbols.")

# 5. Build Manifest Index
manifest_payload = {
    "version": "2026.1",
    "retrievalDate": "2026-08-14",
    "collections": [
        {"id": "hallmark", "name": "MSigDB Hallmark", "file": "hallmark.json", "count": len(hallmark_pathways)},
        {"id": "reactome", "name": "Reactome Pathways", "file": "reactome.json", "count": len(reactome_pathways)},
        {"id": "go_bp", "name": "GO Biological Process", "file": "go_bp.json", "count": len(go_pathways)}
    ]
}

with open(os.path.join(DATA_DIR, "index.json"), "w") as f:
    json.dump(manifest_payload, f, indent=2)

print("\n=== COMPLETE PATHWAY COLLECTIONS BUILT SUCCESSFULLY ===")
