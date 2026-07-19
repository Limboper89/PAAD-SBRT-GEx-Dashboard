import os
import json

def chunk_genes_directory(base_dir, index_file_name, bin_dir_name, chunk_size=200):
    index_path = os.path.join(base_dir, index_file_name)
    if not os.path.exists(index_path):
        print(f"Index file not found: {index_path}")
        return
        
    with open(index_path) as f:
        index_data = json.load(f)
        
    bin_dir = os.path.join(base_dir, bin_dir_name)
    chunks_dir = os.path.join(base_dir, "expression_chunks")
    os.makedirs(chunks_dir, exist_ok=True)
    
    # Check if index_data is list or dict
    if isinstance(index_data, dict) and "genes" in index_data:
        # Dict with genes array (Single Nucleus)
        genes_list = index_data["genes"]
        is_dict = False
        is_spatial = False
    elif isinstance(index_data, dict):
        # Dict format (Spatial: key = Ensembl ID)
        genes_list = list(index_data.keys())
        is_dict = True
        is_spatial = True
    elif isinstance(index_data, list):
        # List format
        genes_list = index_data
        is_dict = False
        is_spatial = False
    else:
        raise ValueError("Unknown index format")
        
    n_genes = len(genes_list)
    print(f"Processing {n_genes} genes in {base_dir}...")
    
    for chunk_idx in range(0, n_genes, chunk_size):
        chunk_group = genes_list[chunk_idx : chunk_idx + chunk_size]
        chunk_filename = f"chunk_{chunk_idx//chunk_size:03d}.bin"
        chunk_path = os.path.join(chunks_dir, chunk_filename)
        
        current_offset = 0
        chunk_bytes = bytearray()
        
        for gene_entry in chunk_group:
            if is_spatial:
                ensembl_id = gene_entry
                gene_filename = f"{ensembl_id}.bin"
            else:
                # For Single Nucleus: entry is dict with 'k' key
                gene_filename = f"{gene_entry['k']}.bin"
                
            gene_bin_path = os.path.join(bin_dir, gene_filename)
            
            if os.path.exists(gene_bin_path):
                with open(gene_bin_path, "rb") as gf:
                    gene_data = gf.read()
            else:
                # If gene file is missing, write a default empty vector (4 bytes of 0 for n_nz)
                gene_data = b"\x00\x00\x00\x00"
                
            gene_len = len(gene_data)
            chunk_bytes.extend(gene_data)
            
            if is_spatial:
                index_data[gene_entry]["c"] = chunk_idx // chunk_size
                index_data[gene_entry]["o"] = current_offset
                index_data[gene_entry]["l"] = gene_len
            else:
                gene_entry["c"] = chunk_idx // chunk_size
                gene_entry["o"] = current_offset
                gene_entry["l"] = gene_len
                
            current_offset += gene_len
            
        with open(chunk_path, "wb") as cf:
            cf.write(chunk_bytes)
            
    # Write the new chunked index file
    new_index_path = os.path.join(base_dir, "genes_index_chunked.json")
    with open(new_index_path, "w") as f:
        json.dump(index_data, f, indent=2)
        
    print(f"Created { (n_genes + chunk_size - 1) // chunk_size } chunks in {chunks_dir}")
    print(f"Saved new index to {new_index_path}")

# Run consolidation
if __name__ == "__main__":
    dashboard_dir = "/home/prince/Documents/Dashboards/SBRT-GEx-Dashboardolder"
    
    # 1. Consolidate GSE202051 (Single-Nucleus)
    sn_base = os.path.join(dashboard_dir, "public/data/gse202051")
    print("\n--- Chunking GSE202051 ---")
    chunk_genes_directory(sn_base, "genes_index.json", "genes_bin")
    
    # 2. Consolidate GSE274103 (Spatial)
    spatial_base = os.path.join(dashboard_dir, "public/data/gse274103")
    print("\n--- Chunking GSE274103 Patients ---")
    for patient in ["PDAC-p1", "PDAC-p2", "PDAC-p3", "PDAC-p4", "PDAC-p5"]:
        patient_base = os.path.join(spatial_base, patient)
        print(f"\nProcessing {patient}...")
        chunk_genes_directory(patient_base, "genes_index.json", "genes_bin")
