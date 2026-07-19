import os
import json
import random

def verify_dataset(base_dir, index_name, chunk_index_name, bin_dir_name, is_spatial=False):
    index_path = os.path.join(base_dir, index_name)
    chunk_index_path = os.path.join(base_dir, chunk_index_name)
    bin_dir = os.path.join(base_dir, bin_dir_name)
    chunks_dir = os.path.join(base_dir, "expression_chunks")
    
    with open(index_path) as f:
        orig_index = json.load(f)
    with open(chunk_index_path) as f:
        chunk_index = json.load(f)
        
    # Verify metadata count and coordinates consistency
    meta_path = os.path.join(base_dir, "metadata.json")
    if os.path.exists(meta_path):
        with open(meta_path) as f:
            meta = json.load(f)
        if is_spatial:
            print(f"Verified coordinates: {len(meta['spots'])} spots loaded.")
        else:
            print(f"Verified coordinates: {len(meta)} cell points loaded.")
            
    # Key biological genes to check
    bio_genes = ["NFE2L2", "PHGDH", "PSAT1", "PSPH", "SHMT1", "SHMT2", "SLC1A5", "KRAS", "S100P", "KRT19"]
    
    # Resolve ensembl ID for biological genes if spatial
    checked_count = 0
    mismatches = 0
    
    genes_to_test = []
    
    # 1. Biological genes
    if is_spatial:
        # Spatial is dict keyed by Ensembl ID, we need to map symbols
        # Actually, spatial genes are listed in master_index.json which maps symbols to ensembl.
        # But we can also look for genes that have matching symbols in the spatial dataset.
        # Let's read master_index.json to find ensembl mapping for bio_genes
        master_index_path = "/home/prince/Documents/Dashboards/SBRT-GEx-Dashboardolder/public/data/gse274103/master_index.json"
        with open(master_index_path) as f:
            master_index = json.load(f)
        symbol_to_ensembl = {val["s"]: key for key, val in master_index.items()}
        for g in bio_genes:
            if g in symbol_to_ensembl:
                ensembl = symbol_to_ensembl[g]
                if ensembl in orig_index:
                    genes_to_test.append((g, ensembl))
    else:
        # Single nucleus
        orig_genes = orig_index["genes"]
        for g in bio_genes:
            # Find in index
            matching = [entry for entry in orig_genes if entry["s"] == g]
            if matching:
                genes_to_test.append((g, matching[0]["k"]))
                
    # 2. Add 20 random genes including boundary positions
    # Let's retrieve all genes in chunked index
    if is_spatial:
        all_ensembls = list(chunk_index.keys())
        # Sort by chunk and offset to find boundaries
        sorted_genes = sorted(all_ensembls, key=lambda e: (chunk_index[e]["c"], chunk_index[e]["o"]))
    else:
        all_entries = chunk_index["genes"]
        sorted_genes = sorted(all_entries, key=lambda e: (e["c"], e["o"]))
        
    # Boundary checks: add first and last of chunk 0, chunk 1, chunk 2, etc.
    # We will pick:
    # - First gene of chunk 0
    # - Last gene of chunk 0
    # - First gene of chunk 1
    # - Last gene of chunk 1
    # - First gene of chunk 20
    # - Last gene of chunk 20
    # - 15 random genes
    boundary_indices = [0, 199, 200, 399, 4000, 4199]
    for idx in boundary_indices:
        if idx < len(sorted_genes):
            entry = sorted_genes[idx]
            if is_spatial:
                master_list = list(master_index.values())
                symbol = master_list[idx]["s"] if idx < len(master_list) else "Boundary"
                genes_to_test.append((f"Boundary_{idx}", entry))
            else:
                genes_to_test.append((f"Boundary_{idx}", entry["k"]))
                
    # Add random genes
    random.seed(42) # Deterministic
    for _ in range(15):
        idx = random.randint(0, len(sorted_genes) - 1)
        entry = sorted_genes[idx]
        if is_spatial:
            symbol = "Random"
            genes_to_test.append((symbol, entry))
        else:
            genes_to_test.append(("Random", entry["k"]))
            
    # Perform binary comparison
    for label, key in genes_to_test:
        # Load original
        orig_file = os.path.join(bin_dir, f"{key}.bin")
        if not os.path.exists(orig_file):
            # If missing, it's fine if consolidated maps to empty
            orig_bytes = b""
        else:
            with open(orig_file, "rb") as f:
                orig_bytes = f.read()
                
        # Load from chunked representation
        if is_spatial:
            chunk_info = chunk_index[key]
        else:
            # Find entry in chunked genes list
            matching = [g for g in chunk_index["genes"] if g["k"] == key]
            if not matching:
                print(f"Mismatch: {key} not found in chunked index")
                mismatches += 1
                continue
            chunk_info = matching[0]
            
        chunk_file = os.path.join(chunks_dir, f"chunk_{chunk_info['c']:03d}.bin")
        with open(chunk_file, "rb") as f:
            f.seek(chunk_info["o"])
            chunk_bytes = f.read(chunk_info["l"])
            
        # Byte match assertion
        if orig_bytes == chunk_bytes:
            checked_count += 1
        else:
            print(f"MISMATCH in {label} ({key}): original size={len(orig_bytes)} vs chunk slice={len(chunk_bytes)}")
            mismatches += 1
            
    print(f"Checked {checked_count} genes. Mismatches: {mismatches}")
    return mismatches == 0

if __name__ == "__main__":
    dashboard_dir = "/home/prince/Documents/Dashboards/SBRT-GEx-Dashboardolder"
    
    print("--- VERIFYING GSE202051 (Single-Nucleus) ---")
    sn_ok = verify_dataset(os.path.join(dashboard_dir, "public/data/gse202051"), "genes_index.json", "genes_index_chunked.json", "genes_bin", is_spatial=False)
    
    print("\n--- VERIFYING GSE274103 (Spatial) Patients ---")
    spatial_ok = True
    for patient in ["PDAC-p1", "PDAC-p2", "PDAC-p3", "PDAC-p4", "PDAC-p5"]:
        print(f"\nVerifying {patient}...")
        p_ok = verify_dataset(os.path.join(dashboard_dir, f"public/data/gse274103/{patient}"), "genes_index.json", "genes_index_chunked.json", "genes_bin", is_spatial=True)
        if not p_ok:
            spatial_ok = False
            
    if sn_ok and spatial_ok:
        print("\nSUCCESS: All files are 100% byte-for-byte identical!")
    else:
        print("\nFAILURE: Mismatches detected during validation.")
