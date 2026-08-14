# validate_gsea_reference.py - Reference Broad Institute GSEA Validation Script

import json
import math
import numpy as np

def calculate_gsea_reference(ranked_genes, gene_sets, n_perm=500, seed=42):
    """
    Reference GSEA implementation using standard Broad Institute algorithm:
    1. Weighted running enrichment score ES(S) with p=1.0
    2. Gene rank permutation null distribution for NES normalization
    3. Leading-edge gene identification
    """
    np.random.seed(seed)
    
    # Sort ranked list descending
    ranked_genes.sort(key=lambda x: x['rankMetric'], reverse=True)
    symbols = [g['symbol'] for g in ranked_genes]
    ranks = np.array([g['rankMetric'] for g in ranked_genes], dtype=float)
    N = len(symbols)
    symbol_map = {sym: idx for idx, sym in enumerate(symbols)}

    results = []

    for gs in gene_sets:
        set_genes = [g for g in gs['genes'] if g in symbol_map]
        S_size = len(set_genes)
        if S_size < 5 or S_size > 500:
            continue

        S_indices = np.array([symbol_map[g] for g in set_genes])
        
        # Calculate Observed ES
        hit_mask = np.zeros(N, dtype=bool)
        hit_mask[S_indices] = True
        
        weights = np.abs(ranks[hit_mask])
        P_hit_denom = np.sum(weights)
        if P_hit_denom == 0:
            continue
            
        step_hit = np.zeros(N)
        step_hit[hit_mask] = weights / P_hit_denom
        step_miss = np.full(N, 1.0 / (N - S_size))
        step_miss[hit_mask] = 0.0
        
        running_es = np.cumsum(step_hit - step_miss)
        
        max_pos = np.max(running_es)
        min_neg = np.min(running_es)
        
        if abs(max_pos) >= abs(min_neg):
            obs_es = max_pos
            peak_idx = np.argmax(running_es)
            leading_edge = [symbols[i] for i in range(peak_idx + 1) if hit_mask[i]]
        else:
            obs_es = min_neg
            valley_idx = np.argmin(running_es)
            leading_edge = [symbols[i] for i in range(valley_idx, N) if hit_mask[i]]

        # Permutation Null Distribution for NES
        null_es = []
        for _ in range(n_perm):
            perm_mask = np.zeros(N, dtype=bool)
            perm_indices = np.random.choice(N, size=S_size, replace=False)
            perm_mask[perm_indices] = True
            
            p_weights = np.abs(ranks[perm_mask])
            p_denom = np.sum(p_weights)
            if p_denom == 0:
                continue
            p_step_hit = np.zeros(N)
            p_step_hit[perm_mask] = p_weights / p_denom
            p_step_miss = np.full(N, 1.0 / (N - S_size))
            p_step_miss[perm_mask] = 0.0
            
            p_res = np.cumsum(p_step_hit - p_step_miss)
            p_max = np.max(p_res)
            p_min = np.min(p_res)
            p_es = p_max if abs(p_max) >= abs(p_min) else p_min
            null_es.append(p_es)
            
        null_es = np.array(null_es)
        
        if obs_es >= 0:
            pos_null = null_es[null_es >= 0]
            mean_pos_null = np.mean(pos_null) if len(pos_null) > 0 else 1.0
            nes = obs_es / mean_pos_null if mean_pos_null > 0 else 0.0
            p_val = np.sum(null_es >= obs_es) / max(1, np.sum(null_es >= 0))
        else:
            neg_null = null_es[null_es < 0]
            mean_neg_null = abs(np.mean(neg_null)) if len(neg_null) > 0 else 1.0
            nes = obs_es / mean_neg_null if mean_neg_null > 0 else 0.0
            p_val = np.sum(null_es <= obs_es) / max(1, np.sum(null_es < 0))

        results.append({
            'pathwayId': gs['id'],
            'pathwayName': gs['name'],
            'es': float(obs_es),
            'nes': float(nes),
            'pValue': float(max(1e-4, p_val)),
            'geneSetSize': S_size,
            'leadingEdgeCount': len(leading_edge),
            'leadingEdge': leading_edge
        })
        
    return results

if __name__ == '__main__':
    # Load TCGA-PAAD vs GTEx data
    with open('public/data/tcga_gtex/tcga_gtex_DEG_results.json') as f:
        tcga_data = json.load(f)
        
    with open('public/data/pathways/hallmark.json') as f:
        hallmark_data = json.load(f)

    ranked_genes = []
    for d in tcga_data:
        p = max(1e-300, d.get('pval') or 1.0)
        fc = d.get('log2FC') or 0.0
        rank_metric = (1.0 if fc >= 0 else -1.0) * (-math.log10(p))
        ranked_genes.append({'symbol': d['symbol'], 'rankMetric': rank_metric, 'log2FC': fc, 'pValue': p})

    ref_results = calculate_gsea_reference(ranked_genes, hallmark_data['pathways'], n_perm=300)

    # Load TypeScript GSEA results
    with open('public/data/pathways/tcga_gtex_pathways.json') as f:
        ts_data = json.load(f)

    ts_gsea_map = {r['pathwayId']: r for r in ts_data['gseaResults']}

    print("=== GSEA REFERENCE VALIDATION COMPARISON (Python 300-Permutation Reference vs TypeScript Engine) ===")
    print(f"{'Pathway ID':<40} | {'Ref ES':<8} | {'TS ES':<8} | {'Ref NES':<8} | {'TS NES':<8} | {'Leading Edge Overlap'}")
    print("-" * 110)

    es_diffs = []
    nes_diffs = []
    le_overlaps = []

    for ref in ref_results:
        pid = ref['pathwayId']
        ts = ts_gsea_map.get(pid)
        if ts:
            ref_es = ref['es']
            ts_es = ts['enrichmentScore']
            ref_nes = ref['nes']
            ts_nes = ts['nes']
            
            ref_le = set(ref['leadingEdge'])
            ts_le = set(ts.get('leadingEdgeGenes') or [])
            
            overlap_pct = (len(ref_le.intersection(ts_le)) / max(1, len(ref_le.union(ts_le)))) * 100
            
            es_diffs.append(abs(ref_es - ts_es))
            nes_diffs.append(abs(ref_nes - ts_nes))
            le_overlaps.append(overlap_pct)

            print(f"{pid:<40} | {ref_es:8.4f} | {ts_es:8.4f} | {ref_nes:8.4f} | {ts_nes:8.4f} | {overlap_pct:6.1f}%")

    print("\n=== SUMMARY METRICS ===")
    print(f"Mean ES Difference: {np.mean(es_diffs):.6f}")
    print(f"Mean NES Difference: {np.mean(nes_diffs):.6f}")
    print(f"Mean Leading Edge Overlap: {np.mean(le_overlaps):.2f}%")
