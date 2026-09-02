# compute_gse202051_pathways.py
# High-Performance Vectorized 3-Layer Unbiased Pathway Analysis for GSE202051 Single-Nucleus PDAC Atlas

import os
import sys
import json
import struct
import numpy as np
import pandas as pd
from scipy import stats
import statsmodels.api as sm
import statsmodels.formula.api as smf
from collections import defaultdict

OUT_DIR = "public/data/gse202051/pathways"
os.makedirs(OUT_DIR, exist_ok=True)

print("=" * 80)
print("3-LAYER UNBIASED PATIENT-AWARE PATHWAY ANALYSIS: GSE202051")
print("=" * 80, flush=True)

# 1. Load Metadata and Cohorts
with open("public/data/gse202051/metadata.json") as f:
    cells = json.load(f)

with open("public/data/gse202051/patients.json") as f:
    patients = json.load(f)

with open("public/data/gse202051/genes_index_chunked.json") as f:
    gene_index = json.load(f)["genes"]

n_cells = len(cells)
n_genes = len(gene_index)
print(f"Loaded {n_cells} nuclei and {n_genes} genes across {len(patients)} patients.", flush=True)

naive_pids = set(pid for pid, info in patients.items() if pid.startswith("U") or info.get("treatment_group") == "Treatment-naïve")
crt_pids = set(pid for pid, info in patients.items() if info.get("treatment_status") == "CRT")
all_treated_pids = set(pid for pid, info in patients.items() if pid.startswith("T") or info.get("treatment_group") != "Treatment-naïve")

print(f"Cohorts: Naïve = {len(naive_pids)}, Standard CRT = {len(crt_pids)}, All Treated = {len(all_treated_pids)}", flush=True)

# 2. Select Well-Represented Compartments
COMPARTMENTS = {
    # Level 2 Subtypes (Tier 1: >=10 Naive & >=8 CRT)
    "Malignant": {"field": "level2", "name": "Malignant Epithelium", "category": "Level 2"},
    "CAF": {"field": "level2", "name": "Cancer-Associated Fibroblasts", "category": "Level 2"},
    "Ductal": {"field": "level2", "name": "Normal/Non-Malignant Ductal", "category": "Level 2"},
    "Vascular": {"field": "level2", "name": "Vascular Endothelium", "category": "Level 2"},
    "Pericyte": {"field": "level2", "name": "Pericytes / Mural Cells", "category": "Level 2"},
    "myCAF": {"field": "level2", "name": "Myofibroblastic CAFs", "category": "Level 2"},
    "Macrophage": {"field": "level2", "name": "Tumor-Associated Macrophages", "category": "Level 2"},
    "CD8+ T": {"field": "level2", "name": "CD8+ Cytotoxic T Cells", "category": "Level 2"},
    "Dendritic": {"field": "level2", "name": "Dendritic Cells", "category": "Level 2"},
    # Broad Lineages
    "Epithelial": {"field": "broad_celltype", "name": "Broad Epithelial", "category": "Broad"},
    "Fibroblast": {"field": "broad_celltype", "name": "Broad Fibroblast / Stroma", "category": "Broad"},
    "Immune": {"field": "broad_celltype", "name": "Broad Immune", "category": "Broad"},
    "Endothelial": {"field": "broad_celltype", "name": "Broad Endothelial", "category": "Broad"},
}

# 3. Vectorized Pseudobulk Aggregation Matrix Construction
pt_comp_keys = []
M_rows = []

for comp_id, comp_info in COMPARTMENTS.items():
    field = comp_info["field"]
    for pid in patients.keys():
        # Find cell indices for this (pid, comp_id)
        indices = [i for i, c in enumerate(cells) if c["pid"] == pid and (c.get(field) == comp_id)]
        if len(indices) >= 2: # At least 2 cells to form a valid pseudobulk replicate
            pt_comp_keys.append((pid, comp_id))
            row = np.zeros(n_cells, dtype=np.float32)
            row[indices] = 1.0 / len(indices)
            M_rows.append(row)

M = np.array(M_rows, dtype=np.float32) # Shape: (n_pairs, n_cells)
n_pairs = len(pt_comp_keys)
print(f"Constructed vectorized aggregation matrix M: shape {M.shape} ({n_pairs} patient-compartment biological replicates)", flush=True)

# Pre-allocate Pseudobulk Matrix: shape (n_pairs, n_genes)
E_mat = np.zeros((n_pairs, n_genes), dtype=np.float32)

chunks_dir = "public/data/gse202051/expression_chunks"
chunk_files = sorted([f for f in os.listdir(chunks_dir) if f.endswith(".bin")])
print(f"Reading {len(chunk_files)} expression chunks into memory...", flush=True)

chunk_data_cache = {}
for cf in chunk_files:
    with open(os.path.join(chunks_dir, cf), "rb") as f:
        chunk_data_cache[cf] = f.read()

gene_symbols = [g["s"] for g in gene_index]
gene_to_idx = {g["s"].upper(): i for i, g in enumerate(gene_index)}

print("Computing genome-wide pseudobulk across all 22,164 genes...", flush=True)
for g_idx, g_meta in enumerate(gene_index):
    cid = g_meta.get("c", 0)
    offset = g_meta.get("o", 0)
    length = g_meta.get("l", 0)
    
    cf_name = f"chunk_{cid:03d}.bin"
    raw = chunk_data_cache[cf_name][offset : offset + length]
    
    nnz = struct.unpack("<I", raw[:4])[0]
    indices = struct.unpack(f"<{nnz}H", raw[4 : 4 + nnz * 2])
    f16_vals = np.frombuffer(raw[4 + nnz * 2 : 4 + nnz * 4], dtype=np.float16)
    
    if nnz > 0:
        # Sparse vector dot product with M columns
        # M[:, indices] is (n_pairs, nnz), dot with f16_vals (nnz,)
        vals_f32 = f16_vals.astype(np.float32)
        E_mat[:, g_idx] = M[:, indices] @ vals_f32

print(f"Genome-wide pseudobulk matrix computed successfully! Shape: {E_mat.shape}", flush=True)

# Map (pid, comp_id) to row index in E_mat
pair_to_row = {k: i for i, k in enumerate(pt_comp_keys)}

# 4. Load Pathway Gene Sets
with open("public/data/pathways/hallmark.json") as f:
    hallmark_db = json.load(f)["pathways"]

with open("public/data/pathways/reactome.json") as f:
    reactome_db = json.load(f)["pathways"]

print(f"Loaded {len(hallmark_db)} Hallmark gene sets and {len(reactome_db)} Reactome gene sets.", flush=True)

# 5. Fast Pre-Ranked GSEA Implementation
def run_preranked_gsea(gene_ranks, gene_set, n_perm=500):
    ranked_genes = [g for g, s in gene_ranks]
    stats_arr = np.array([s for g, s in gene_ranks], dtype=np.float32)
    N = len(ranked_genes)
    
    gene_set_list = [g.upper() for g in gene_set]
    in_set_mask = np.isin(ranked_genes, gene_set_list)
    k = int(np.sum(in_set_mask))
    if k < 5 or k > 500:
        return None
        
    hit_weights = np.abs(stats_arr) * in_set_mask
    sum_hit = np.sum(hit_weights)
    if sum_hit == 0:
        return None
        
    hit_step = hit_weights / sum_hit
    miss_step = (1.0 - in_set_mask) / (N - k)
    running_sum = np.cumsum(hit_step - miss_step)
    
    max_idx = np.argmax(running_sum)
    min_idx = np.argmin(running_sum)
    max_es = running_sum[max_idx]
    min_es = running_sum[min_idx]
    
    es = float(max_es if abs(max_es) > abs(min_es) else min_es)
    peak_idx = int(max_idx if abs(max_es) > abs(min_es) else min_idx)
    
    if es > 0:
        leading_edge = [ranked_genes[i] for i in range(peak_idx + 1) if in_set_mask[i]]
    else:
        leading_edge = [ranked_genes[i] for i in range(peak_idx, N) if in_set_mask[i]]
        
    perm_es = []
    for _ in range(n_perm):
        rand_idx = np.random.choice(N, size=k, replace=False)
        p_mask = np.zeros(N, dtype=bool)
        p_mask[rand_idx] = True
        
        p_hw = np.abs(stats_arr) * p_mask
        p_sh = np.sum(p_hw)
        if p_sh == 0:
            continue
        p_hs = p_hw / p_sh
        p_ms = (1.0 - p_mask) / (N - k)
        p_rs = np.cumsum(p_hs - p_ms)
        p_mx = np.max(p_rs)
        p_mn = np.min(p_rs)
        perm_es.append(p_mx if abs(p_mx) > abs(p_mn) else p_mn)
        
    perm_es = np.array(perm_es)
    if es >= 0:
        pos_perms = perm_es[perm_es >= 0]
        mean_pos = np.mean(pos_perms) if len(pos_perms) > 0 else 1.0
        nes = es / mean_pos if mean_pos > 0 else 0.0
        pval = float(np.sum(perm_es >= es) / max(1, len(perm_es)))
    else:
        neg_perms = perm_es[perm_es < 0]
        mean_neg = abs(np.mean(neg_perms)) if len(neg_perms) > 0 else 1.0
        nes = es / mean_neg if mean_neg > 0 else 0.0
        pval = float(np.sum(perm_es <= es) / max(1, len(perm_es)))
        
    return {
        "es": es,
        "nes": nes,
        "pval": max(1.0 / n_perm, pval),
        "size": k,
        "leading_edge": leading_edge[:25]
    }

# 6. LAYER 1: Compute Ranked GSEA across Compartments & Comparisons
def compute_layer1_gsea(pathway_db, db_name):
    print(f"\nComputing Layer 1 GSEA for {db_name} ({len(pathway_db)} pathways)...", flush=True)
    results = {
        "primary_naive_vs_crt": {},
        "secondary_naive_vs_treated": {}
    }
    
    comparisons = [
        ("primary_naive_vs_crt", naive_pids, crt_pids, "Naïve (n=18) vs Standard CRT (n=14)"),
        ("secondary_naive_vs_treated", naive_pids, all_treated_pids, "Naïve (n=18) vs All Treated (n=25)")
    ]
    
    for comp_key, group1_pids, group2_pids, comp_label in comparisons:
        results[comp_key] = {"label": comp_label, "compartments": {}}
        
        for comp_id, comp_info in COMPARTMENTS.items():
            g1_rows = [pair_to_row[(pid, comp_id)] for pid in group1_pids if (pid, comp_id) in pair_to_row]
            g2_rows = [pair_to_row[(pid, comp_id)] for pid in group2_pids if (pid, comp_id) in pair_to_row]
            
            n1 = len(g1_rows)
            n2 = len(g2_rows)
            if n1 < 3 or n2 < 3:
                continue
                
            mat1 = E_mat[g1_rows, :]
            mat2 = E_mat[g2_rows, :]
            
            mean1 = np.mean(mat1, axis=0)
            mean2 = np.mean(mat2, axis=0)
            var1 = np.var(mat1, axis=0, ddof=1)
            var2 = np.var(mat2, axis=0, ddof=1)
            
            denom = np.sqrt(var1 / n1 + var2 / n2)
            denom[denom == 0] = 1e-6
            t_stats = (mean2 - mean1) / denom
            
            gene_ranks = sorted([(gene_symbols[i], float(t_stats[i])) for i in range(n_genes)], key=lambda x: x[1], reverse=True)
            
            comp_pathway_res = []
            for p in pathway_db:
                p_id = p["id"]
                p_name = p["name"]
                p_genes = set(g.upper() for g in p["genes"])
                
                gsea_out = run_preranked_gsea(gene_ranks, p_genes, n_perm=500)
                if gsea_out:
                    comp_pathway_res.append({
                        "id": p_id,
                        "name": p_name,
                        "database": p.get("database", db_name),
                        "nes": gsea_out["nes"],
                        "es": gsea_out["es"],
                        "pval": gsea_out["pval"],
                        "size": gsea_out["size"],
                        "direction": "Upregulated in Treated" if gsea_out["nes"] > 0 else "Downregulated in Treated",
                        "leading_edge": gsea_out["leading_edge"],
                        "n_naive_patients": n1,
                        "n_treated_patients": n2
                    })
                    
            if comp_pathway_res:
                pvals = [x["pval"] for x in comp_pathway_res]
                _, qvals, _, _ = sm.stats.multipletests(pvals, method="fdr_bh")
                for idx, qv in enumerate(qvals):
                    comp_pathway_res[idx]["fdr"] = float(qv)
                    
            results[comp_key]["compartments"][comp_id] = {
                "name": comp_info["name"],
                "category": comp_info["category"],
                "n_naive_patients": n1,
                "n_treated_patients": n2,
                "pathways": comp_pathway_res
            }
            print(f"  {comp_key} -> {comp_id:<12}: {len(comp_pathway_res)} pathways enriched (n1={n1}, n2={n2})", flush=True)
            
    return results

hallmark_layer1 = compute_layer1_gsea(hallmark_db, "Hallmark")

# 7. LAYER 2: Compartmental Divergence Analysis (CDS)
def compute_layer2_divergence(layer1_results, pathway_db):
    print("\nComputing Layer 2 Compartmental Divergence Scores (CDS)...", flush=True)
    divergence_results = {}
    
    for comp_key in ["primary_naive_vs_crt", "secondary_naive_vs_treated"]:
        comp_data = layer1_results[comp_key]
        comp_dict = comp_data["compartments"]
        
        pathway_compartment_matrix = defaultdict(dict)
        
        for comp_id, c_data in comp_dict.items():
            for p in c_data["pathways"]:
                pathway_compartment_matrix[p["id"]][comp_id] = p
                
        divergent_list = []
        for p in pathway_db:
            p_id = p["id"]
            p_name = p["name"]
            
            comp_entries = pathway_compartment_matrix.get(p_id, {})
            if len(comp_entries) < 3:
                continue
                
            nes_vals = [entry["nes"] for entry in comp_entries.values()]
            fdr_vals = [entry["fdr"] for entry in comp_entries.values()]
            
            max_nes = max(nes_vals)
            min_nes = min(nes_vals)
            nes_range = max_nes - min_nes
            min_fdr = min(fdr_vals)
            
            is_opposing = (max_nes > 0 and min_nes < 0)
            sign_factor = 1.0 if is_opposing else 0.5 * (nes_range / max(0.1, max(abs(max_nes), abs(min_nes))))
            confidence_weight = np.sqrt(-np.log10(max(1e-6, min_fdr)))
            
            cds = float(nes_range * sign_factor * confidence_weight)
            
            comp_sorted = sorted(comp_entries.items(), key=lambda x: x[1]["nes"], reverse=True)
            top_pos_comp = comp_sorted[0]
            top_neg_comp = comp_sorted[-1]
            
            divergent_list.append({
                "id": p_id,
                "name": p_name,
                "database": p.get("database", "Hallmark"),
                "cds": cds,
                "is_opposing": is_opposing,
                "max_nes": float(max_nes),
                "min_nes": float(min_nes),
                "nes_range": float(nes_range),
                "min_fdr": float(min_fdr),
                "top_positive_compartment": top_pos_comp[0],
                "top_positive_nes": float(top_pos_comp[1]["nes"]),
                "top_positive_fdr": float(top_pos_comp[1]["fdr"]),
                "top_negative_compartment": top_neg_comp[0],
                "top_negative_nes": float(top_neg_comp[1]["nes"]),
                "top_negative_fdr": float(top_neg_comp[1]["fdr"]),
                "compartment_values": {c: {"nes": entry["nes"], "fdr": entry["fdr"], "pval": entry["pval"]} for c, entry in comp_entries.items()}
            })
            
        divergent_list.sort(key=lambda x: x["cds"], reverse=True)
        divergence_results[comp_key] = divergent_list
        
        print(f"\nTop 5 Divergent Pathways ({comp_key}):", flush=True)
        for rank, p in enumerate(divergent_list[:5], 1):
            print(f"  {rank}. {p['name']:<45} | CDS={p['cds']:.2f} | Pos: {p['top_positive_compartment']} ({p['top_positive_nes']:+.2f}) vs Neg: {p['top_negative_compartment']} ({p['top_negative_nes']:+.2f}) | Min FDR={p['min_fdr']:.4f}", flush=True)
            
    return divergence_results

hallmark_layer2 = compute_layer2_divergence(hallmark_layer1, hallmark_db)

# 8. LAYER 3: Patient-Level Pathway Scoring & Linear Mixed-Effects Model
def compute_layer3_mixed_models(pathway_db, db_name):
    print(f"\nComputing Layer 3 Patient Pathway Scores and Linear Mixed-Effects Models for {db_name}...", flush=True)
    
    score_records = []
    
    for (pid, comp_id), row_idx in pair_to_row.items():
        is_naive = pid in naive_pids
        is_crt = pid in crt_pids
        is_treated = pid in all_treated_pids
        
        treat_status = "Naive" if is_naive else ("CRT" if is_crt else "Other_Treated")
        expr_profile = E_mat[row_idx, :]
        
        for p in pathway_db:
            p_id = p["id"]
            p_gene_indices = [gene_to_idx[g.upper()] for g in p["genes"] if g.upper() in gene_to_idx]
            if len(p_gene_indices) < 5:
                continue
                
            p_score = float(np.mean(expr_profile[p_gene_indices]))
            score_records.append({
                "patient_id": pid,
                "compartment": comp_id,
                "treatment": treat_status,
                "is_crt_comparison": "Naive" if is_naive else ("CRT" if is_crt else "Exclude"),
                "is_all_treated_comparison": "Naive" if is_naive else "Treated",
                "pathway_id": p_id,
                "score": p_score
            })
            
    df_scores = pd.DataFrame(score_records)
    print(f"Computed {len(df_scores)} patient-compartment-pathway scores.", flush=True)
    
    mixed_results = {
        "primary_naive_vs_crt": {},
        "secondary_naive_vs_treated": {}
    }
    
    core_comps = ["Malignant", "CAF", "Vascular", "Macrophage", "Ductal", "myCAF"]
    
    for comp_mode, sub_df in [
        ("primary_naive_vs_crt", df_scores[df_scores["is_crt_comparison"] != "Exclude"]),
        ("secondary_naive_vs_treated", df_scores)
    ]:
        print(f"  Fitting MixedLM for {comp_mode} across pathways...", flush=True)
        pathway_mixed_list = []
        
        for p in pathway_db:
            p_id = p["id"]
            p_name = p["name"]
            
            p_df = sub_df[(sub_df["pathway_id"] == p_id) & (sub_df["compartment"].isin(core_comps))].copy()
            if len(p_df["patient_id"].unique()) < 10 or len(p_df["compartment"].unique()) < 3:
                continue
                
            p_df["score_z"] = (p_df["score"] - p_df["score"].mean()) / max(1e-6, p_df["score"].std())
            
            treat_col = "is_crt_comparison" if comp_mode == "primary_naive_vs_crt" else "is_all_treated_comparison"
            
            try:
                formula = f"score_z ~ C({treat_col}, Treatment(reference='Naive')) * C(compartment, Treatment(reference='Malignant'))"
                model = smf.mixedlm(formula, p_df, groups=p_df["patient_id"])
                fit = model.fit(reml=False, maxiter=200)
                
                int_pvals = [pval for param, pval in fit.pvalues.items() if ":" in param]
                int_params = [val for param, val in fit.params.items() if ":" in param]
                
                min_int_pval = float(min(int_pvals)) if int_pvals else 1.0
                max_int_effect = float(max(abs(x) for x in int_params)) if int_params else 0.0
                
                pathway_mixed_list.append({
                    "id": p_id,
                    "name": p_name,
                    "interaction_min_pval": min_int_pval,
                    "interaction_max_effect": max_int_effect,
                    "model_converged": fit.converged,
                    "n_patients": int(len(p_df["patient_id"].unique())),
                    "n_obs": int(len(p_df))
                })
            except Exception as ex:
                continue
                
        if pathway_mixed_list:
            raw_p = [x["interaction_min_pval"] for x in pathway_mixed_list]
            _, qvals, _, _ = sm.stats.multipletests(raw_p, method="fdr_bh")
            for i, q in enumerate(qvals):
                pathway_mixed_list[i]["interaction_fdr"] = float(q)
                
        pathway_mixed_list.sort(key=lambda x: x["interaction_min_pval"])
        mixed_results[comp_mode] = pathway_mixed_list
        
        print(f"    Top 3 MixedLM Interactions ({comp_mode}):", flush=True)
        for rank, x in enumerate(pathway_mixed_list[:3], 1):
            print(f"      {rank}. {x['name']:<40} | Min Int p={x['interaction_min_pval']:.4f} | Int FDR={x.get('interaction_fdr', 1.0):.4f} | Max Effect={x['interaction_max_effect']:.2f}", flush=True)
            
    return mixed_results, df_scores

hallmark_layer3, df_scores = compute_layer3_mixed_models(hallmark_db, "Hallmark")

# 9. POST-HOC NRF2 / REDOX EVALUATION
print("\n" + "=" * 80)
print("POST-HOC NRF2 / OXIDATIVE STRESS EVALUATION (OBJECTIVE RANKINGS)")
print("=" * 80, flush=True)

for comp_key, comp_label in [("primary_naive_vs_crt", "Primary: Naïve vs CRT"), ("secondary_naive_vs_treated", "Secondary: Naïve vs All Treated")]:
    div_list = hallmark_layer2[comp_key]
    print(f"\n{comp_label} (Total Hallmark Pathways = {len(div_list)}):", flush=True)
    
    ros_entry = next((item for item in div_list if "REACTIVE_OXYGEN_SPECIES" in item["id"]), None)
    if ros_entry:
        ros_rank = div_list.index(ros_entry) + 1
        print(f"  * ROS Pathway Rank: #{ros_rank} / {len(div_list)}", flush=True)
        print(f"    - CDS Score: {ros_entry['cds']:.2f}", flush=True)
        print(f"    - Top Positive Compartment: {ros_entry['top_positive_compartment']} (NES = {ros_entry['top_positive_nes']:+.2f}, FDR = {ros_entry['top_positive_fdr']:.4f})", flush=True)
        print(f"    - Top Negative Compartment: {ros_entry['top_negative_compartment']} (NES = {ros_entry['top_negative_nes']:+.2f}, FDR = {ros_entry['top_negative_fdr']:.4f})", flush=True)
        nes_strs = [f"{c}: {d.get('nes', 0):+.2f}" for c, d in ros_entry['compartment_values'].items()]
        print(f"    - Compartment NES Profile: {', '.join(nes_strs)}", flush=True)
        
    mixed_list = hallmark_layer3[comp_key]
    ros_mixed = next((item for item in mixed_list if "REACTIVE_OXYGEN_SPECIES" in item["id"]), None)
    if ros_mixed:
        ros_m_rank = mixed_list.index(ros_mixed) + 1
        print(f"    - MixedLM Interaction Rank: #{ros_m_rank} / {len(mixed_list)} (Interaction p = {ros_mixed['interaction_min_pval']:.4f}, FDR = {ros_mixed['interaction_fdr']:.4f})", flush=True)

# 10. Save Complete Integrated Data Structures for PDAC BioPortal
print("\nSaving integrated pathway data to public/data/gse202051/pathways/...", flush=True)

output_payload = {
    "metadata": {
        "dataset": "GSE202051",
        "description": "Unbiased 3-Layer Single-Nucleus Pathway Analysis in PDAC",
        "total_nuclei": n_cells,
        "n_naive_patients": len(naive_pids),
        "n_crt_patients": len(crt_pids),
        "n_treated_patients": len(all_treated_pids),
        "primary_comparison": "Treatment-Naïve (n=18) vs Standard CRT (n=14)",
        "secondary_comparison": "Treatment-Naïve (n=18) vs All Radiation-Treated (n=25)",
        "compartments_included": list(COMPARTMENTS.keys())
    },
    "layer1_gsea": hallmark_layer1,
    "layer2_divergence": hallmark_layer2,
    "layer3_mixed_models": hallmark_layer3
}

class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (np.integer, int)):
            return int(obj)
        elif isinstance(obj, (np.floating, float)):
            return float(obj)
        elif isinstance(obj, (np.bool_, bool)):
            return bool(obj)
        elif isinstance(obj, np.ndarray):
            return obj.tolist()
        return super().default(obj)

with open(os.path.join(OUT_DIR, "hallmark_pathway_results.json"), "w") as f:
    json.dump(output_payload, f, indent=2, cls=NumpyEncoder)

pt_scores_summary = defaultdict(lambda: defaultdict(dict))
for _, row in df_scores.iterrows():
    pt_scores_summary[row["pathway_id"]][row["compartment"]][row["patient_id"]] = {
        "score": round(float(row["score"]), 4),
        "treatment": str(row["treatment"])
    }

with open(os.path.join(OUT_DIR, "patient_pathway_scores.json"), "w") as f:
    json.dump(pt_scores_summary, f, cls=NumpyEncoder)

print("Saved hallmark_pathway_results.json and patient_pathway_scores.json successfully!", flush=True)
print("=" * 80, flush=True)
