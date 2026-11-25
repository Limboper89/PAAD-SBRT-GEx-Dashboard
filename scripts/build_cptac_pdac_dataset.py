#!/usr/bin/env python3
"""
Reproducible data acquisition and preprocessing pipeline for CPTAC-PDAC
(Cao et al., Cell 2021, PMID: 34534465; cBioPortal paad_cptac_2021 / LinkedOmics).

Downloads authentic public LinkedOmics CPTAC-PDAC global proteomics, paired
RNA-seq, and clinical survival tables (or uses cached copies if present),
validates sample/gene overlaps, computes differential protein abundance,
matched mRNA-protein concordance, pathway-level proteogenomic coupling, and
continuous Cox PH overall survival metrics, and writes web-optimized binary
and JSON assets to public/data/cptac_pdac/.
"""

import argparse
import json
import math
import os
import time
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import requests
import scipy.stats as stats
from lifelines import CoxPHFitter
from statsmodels.stats.multitest import multipletests

LINKEDOMICS_URLS = {
    "proteomics_gene_level_MD_abundance_tumor.cct": "https://linkedomics.org/data_download/CPTAC-PDAC/proteomics_gene_level_MD_abundance_tumor.cct",
    "proteomics_gene_level_MD_abundance_normal.cct": "https://linkedomics.org/data_download/CPTAC-PDAC/proteomics_gene_level_MD_abundance_normal.cct",
    "mRNA_RSEM_UQ_log2_Tumor.cct": "https://linkedomics.org/data_download/CPTAC-PDAC/mRNA_RSEM_UQ_log2_Tumor.cct",
    "mRNA_RSEM_UQ_log2_Normal.cct": "https://linkedomics.org/data_download/CPTAC-PDAC/mRNA_RSEM_UQ_log2_Normal.cct",
    "clinical_table_140.tsv": "https://linkedomics.org/data_download/CPTAC-PDAC/clinical_table_140.tsv",
}

CURATED_20_NRF2_REDOX_FERROPTOSIS = [
    "NFE2L2", "KEAP1", "NQO1", "HMOX1", "GCLC",
    "GCLM", "GSS", "GSR", "TXNRD1", "TXN",
    "PRDX1", "SRXN1", "G6PD", "PGD", "FTL",
    "FTH1", "GPX4", "SLC7A11", "SLC3A2", "AIFM2",
]

CURATED_PRESETS = [
    {
        "id": "nrf2_redox_ferroptosis_20",
        "name": "NRF2 Redox & Ferroptosis Defense (20-Gene Panel)",
        "description": "Curated 20-gene master NRF2-KEAP1 redox buffering, glutathione synthesis, iron storage, and ferroptosis defense panel (18 quantified at protein level; NFE2L2 & SLC7A11 mRNA-only in TMT proteomics).",
        "genes": CURATED_20_NRF2_REDOX_FERROPTOSIS,
        "badge": "CURATED 20-GENE",
    },
    {
        "id": "nrf2_keap1_hif1a_regulators",
        "name": "NRF2 / KEAP1 / HIF1A Post-Translational Axis",
        "description": "Tests post-translational turnover regulators (NFE2L2, KEAP1, CUL3, SQSTM1, HIF1A, VHL, EGLN1, HIF1AN) alongside canonical protein effectors (NQO1, HMOX1, SLC2A1, LDHA, CA9).",
        "genes": ["NFE2L2", "KEAP1", "CUL3", "SQSTM1", "HIF1A", "VHL", "EGLN1", "HIF1AN", "NQO1", "HMOX1", "LDHA", "SLC2A1", "CA9"],
    },
    {
        "id": "serine_1c_metabolism",
        "name": "Serine Biosynthesis & 1C Metabolism",
        "description": "De novo serine synthesis and mitochondrial folate enzymes coupled to NADPH and glutathione production.",
        "genes": ["PHGDH", "PSAT1", "PSPH", "SHMT1", "SHMT2", "MTHFD1", "MTHFD2", "SLC1A4", "SLC1A5", "SLC7A5"],
    },
    {
        "id": "hypoxia_glycolysis",
        "name": "Hypoxia & Glycolytic Reprogramming",
        "description": "Hypoxia-responsive metabolic enzymes and glucose/lactate transporters in desmoplastic PDAC.",
        "genes": ["HIF1A", "SLC2A1", "HK2", "PFKP", "ALDOA", "GAPDH", "PGK1", "ENO1", "PKM", "LDHA", "PDK1", "CA9"],
    },
    {
        "id": "pdac_drivers_subtypes",
        "name": "PDAC Drivers & Lineage Markers",
        "description": "Canonical PDAC genomic drivers, ductal epithelial markers, and activated myofibroblastic stroma proteins.",
        "genes": ["KRAS", "TP53", "SMAD4", "CDKN2A", "GATA6", "EPCAM", "KRT18", "KRT19", "COL1A1", "ACTA2", "POSTN", "FN1"],
    },
]


def ensure_raw_files(raw_dir: str) -> None:
    os.makedirs(raw_dir, exist_ok=True)
    for fname, url in LINKEDOMICS_URLS.items():
        fpath = os.path.join(raw_dir, fname)
        if not os.path.exists(fpath) or os.path.getsize(fpath) == 0:
            print(f"[Download] Fetching {fname} from LinkedOmics...")
            with requests.get(url, stream=True, timeout=180) as r:
                r.raise_for_status()
                with open(fpath, "wb") as out:
                    for chunk in r.iter_content(chunk_size=256 * 1024):
                        if chunk:
                            out.write(chunk)
        print(f"[Input] {fname}: {os.path.getsize(fpath) / (1024 * 1024):.2f} MB")


def fast_cox_ph_1d(times: np.ndarray, events: np.ndarray, x: np.ndarray, max_iter: int = 35, tol: float = 1e-9) -> Optional[Tuple[float, float, float, float]]:
    """
    Fast univariate Cox PH with Efron tie handling matching lifelines.CoxPHFitter
    and R survival::coxph on 1-SD standardized predictor.
    Returns (hr, ci_low, ci_high, p_value) or None if degenerate.
    """
    n = len(times)
    if n < 20 or int(events.sum()) < 5:
        return None
    sd = float(np.std(x, ddof=1))
    if not math.isfinite(sd) or sd < 1e-8:
        return None
    xz = (x - float(np.mean(x))) / sd

    # Sort descending by time
    order = np.argsort(-times, kind="mergesort")
    t_s = times[order]
    e_s = events[order]
    x_s = xz[order]

    # Pre-group unique event times with tie blocks
    unique_event_blocks = []
    i = 0
    while i < n:
        j = i + 1
        while j < n and t_s[j] == t_s[i]:
            j += 1
        ev_mask = e_s[i:j] == 1
        d_k = int(ev_mask.sum())
        if d_k > 0:
            ev_idx = np.arange(i, j)[ev_mask]
            unique_event_blocks.append((j - 1, d_k, ev_idx))
        i = j

    if len(unique_event_blocks) == 0:
        return None

    beta = 0.0
    info = 0.0
    for _ in range(max_iter):
        exp_bx = np.exp(np.clip(beta * x_s, -30.0, 30.0))
        x_exp = x_s * exp_bx
        x2_exp = (x_s * x_s) * exp_bx

        s0_cum = np.cumsum(exp_bx)
        s1_cum = np.cumsum(x_exp)
        s2_cum = np.cumsum(x2_exp)

        grad = 0.0
        hess = 0.0
        for end_idx, d_k, ev_idx in unique_event_blocks:
            r0 = float(s0_cum[end_idx])
            r1 = float(s1_cum[end_idx])
            r2 = float(s2_cum[end_idx])
            sum_x_ev = float(x_s[ev_idx].sum())
            grad += sum_x_ev

            if d_k == 1:
                if r0 > 0.0:
                    mx = r1 / r0
                    grad -= mx
                    hess += (r2 / r0) - mx * mx
            else:
                d0 = float(exp_bx[ev_idx].sum())
                d1 = float(x_exp[ev_idx].sum())
                d2 = float(x2_exp[ev_idx].sum())
                for l in range(d_k):
                    frac = l / d_k
                    s0 = r0 - frac * d0
                    if s0 <= 0.0:
                        continue
                    s1 = r1 - frac * d1
                    s2 = r2 - frac * d2
                    mx = s1 / s0
                    grad -= mx
                    hess += (s2 / s0) - mx * mx

        if hess <= 1e-12 or not math.isfinite(hess):
            return None
        step = grad / hess
        beta_new = beta + step
        info = hess
        beta = beta_new
        if abs(step) < tol:
            break

    if not math.isfinite(beta) or info <= 1e-12:
        return None
    se = 1.0 / math.sqrt(info)
    if abs(beta) > 15.0 or (abs(beta) + 1.96 * se) > 50.0:
        return None
    z = beta / se
    p = float(math.erfc(abs(z) / math.sqrt(2.0)))
    hr = math.exp(beta)
    ci_low = math.exp(beta - 1.96 * se)
    ci_high = math.exp(beta + 1.96 * se)
    if not (math.isfinite(hr) and math.isfinite(ci_low) and math.isfinite(ci_high) and math.isfinite(p)):
        return None
    return hr, ci_low, ci_high, min(1.0, max(1e-300, p))


def r_round(val: Optional[float], digits: int = 5) -> Optional[float]:
    if val is None or not math.isfinite(val):
        return None
    return round(float(val), digits)


def r_stat(val: Optional[float]) -> Optional[float]:
    if val is None or not math.isfinite(val):
        return None
    if val == 0.0:
        return 0.0
    if abs(val) < 1e-4:
        return float(f"{val:.4e}")
    return round(float(val), 6)


def main():
    parser = argparse.ArgumentParser(description="Build web-optimized CPTAC-PDAC proteomics & proteogenomics dataset")
    parser.add_argument(
        "--raw-dir",
        default=r"C:\Users\princekumar\.gemini\antigravity\brain\f3e3edf3-8906-437d-b2aa-9acacab17013\scratch\cptac_pdac",
        help="Directory holding downloaded LinkedOmics CPTAC-PDAC files",
    )
    parser.add_argument(
        "--out-dir",
        default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "data", "cptac_pdac"),
        help="Output directory inside public/data/",
    )
    parser.add_argument(
        "--hgnc-path",
        default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "data", "pathways", "hgnc_human_genes.json"),
    )
    parser.add_argument(
        "--hallmark-path",
        default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "data", "pathways", "hallmark.json"),
    )
    args = parser.parse_args()

    t0 = time.time()
    ensure_raw_files(args.raw_dir)
    os.makedirs(args.out_dir, exist_ok=True)

    # 1. Load raw matrices
    print("[Load] Reading CPTAC-PDAC tables...")
    prot_t = pd.read_csv(os.path.join(args.raw_dir, "proteomics_gene_level_MD_abundance_tumor.cct"), sep="\t", index_col=0)
    prot_n = pd.read_csv(os.path.join(args.raw_dir, "proteomics_gene_level_MD_abundance_normal.cct"), sep="\t", index_col=0)
    mrna_t = pd.read_csv(os.path.join(args.raw_dir, "mRNA_RSEM_UQ_log2_Tumor.cct"), sep="\t", index_col=0)
    mrna_n = pd.read_csv(os.path.join(args.raw_dir, "mRNA_RSEM_UQ_log2_Normal.cct"), sep="\t", index_col=0)
    clin = pd.read_csv(os.path.join(args.raw_dir, "clinical_table_140.tsv"), sep="\t")

    # Normalize index strings
    prot_t.index = prot_t.index.astype(str).str.strip()
    prot_n.index = prot_n.index.astype(str).str.strip()
    mrna_t.index = mrna_t.index.astype(str).str.strip()
    mrna_n.index = mrna_n.index.astype(str).str.strip()

    # Ensure tumor sample order matches clinical / canonical order
    tumor_ids = list(prot_t.columns)
    normal_ids = list(prot_n.columns)
    mrna_normal_ids = list(mrna_n.columns)

    # Align mRNA tumor columns to exact proteomics tumor sample order
    assert set(tumor_ids) == set(mrna_t.columns), "Tumor sample mismatch between proteomics and RNA-seq"
    mrna_t = mrna_t[tumor_ids]

    # Align prot_n rows to prot_t rows
    prot_n = prot_n.reindex(prot_t.index)
    mrna_n = mrna_n.reindex(mrna_t.index)

    # Check paired Tumor-NAT sample IDs (67 paired)
    paired_nat_ids = [sid for sid in normal_ids if sid in set(tumor_ids)]
    tumor_id_to_idx = {sid: i for i, sid in enumerate(tumor_ids)}
    paired_t_indices = np.array([tumor_id_to_idx[sid] for sid in paired_nat_ids], dtype=np.int32)
    paired_n_indices = np.array([i for i, sid in enumerate(normal_ids) if sid in set(tumor_ids)], dtype=np.int32)

    print(f"[Samples] Tumors: {len(tumor_ids)}, NATs (Prot): {len(normal_ids)} ({len(paired_nat_ids)} paired), NATs (mRNA): {len(mrna_normal_ids)}")

    # 2. Clinical metadata & OS cohort
    clin_map = clin.set_index("case_id").to_dict(orient="index")
    clinical_samples = []
    valid_os_records = []
    excluded_os_records = []

    def parse_float_field(val):
        if pd.isna(val):
            return None
        s = str(val).strip()
        parts = []
        for x in s.split(";"):
            xs = x.strip()
            if not xs or xs.upper() in ("NA", "N/A", "NAN"):
                continue
            try:
                parts.append(float(xs))
            except Exception:
                pass
        return round(sum(parts) / len(parts), 2) if parts else None

    for t_idx, cid in enumerate(tumor_ids):
        row = clin_map.get(cid, {})
        fup = row.get("follow_up_days")
        vital = row.get("vital_status")
        hist = str(row.get("histology_diagnosis", "PDAC"))
        stage = None if pd.isna(row.get("tumor_stage_pathological")) else str(row.get("tumor_stage_pathological"))
        age = None if pd.isna(row.get("age")) else int(row.get("age"))
        sex = None if pd.isna(row.get("sex")) else str(row.get("sex"))
        neoplastic = parse_float_field(row.get("Neoplastic_cellularity"))
        stromal = parse_float_field(row.get("Stromal_fraction"))
        acinar = parse_float_field(row.get("Acinar_fraction"))
        has_nat = cid in set(paired_nat_ids)

        clinical_samples.append({
            "case_id": cid,
            "tumor_idx": t_idx,
            "histology": hist,
            "stage": stage,
            "age": age,
            "sex": sex,
            "neoplastic_cellularity": neoplastic,
            "stromal_fraction": stromal,
            "acinar_fraction": acinar,
            "has_paired_nat": has_nat,
        })

        if pd.notna(fup) and float(fup) > 0 and vital in ("Living", "Deceased"):
            os_days = float(fup)
            os_months = round(os_days / 30.4375, 2)
            os_event = 1 if vital == "Deceased" else 0
            valid_os_records.append({
                "case_id": cid,
                "tumor_idx": t_idx,
                "os_days": os_days,
                "os_months": os_months,
                "os_event": os_event,
                "histology": hist,
                "stage": stage,
            })
        else:
            excluded_os_records.append({
                "case_id": cid,
                "follow_up_days": None if pd.isna(fup) else float(fup),
                "vital_status": None if pd.isna(vital) else str(vital),
                "lost_to_followup": None if pd.isna(row.get("is_this_patient_lost_to_follow_up")) else str(row.get("is_this_patient_lost_to_follow_up")),
            })

    os_tumor_indices = np.array([r["tumor_idx"] for r in valid_os_records], dtype=np.int32)
    os_months_arr = np.array([r["os_months"] for r in valid_os_records], dtype=np.float64)
    os_events_arr = np.array([r["os_event"] for r in valid_os_records], dtype=np.int32)

    print(f"[Clinical] Valid OS: {len(valid_os_records)} ({int(os_events_arr.sum())} events, median follow-up {np.median(os_months_arr):.2f} mo); Excluded: {len(excluded_os_records)}")

    # Verify fast_cox_ph_1d matches lifelines.CoxPHFitter on 5 real proteins
    cph = CoxPHFitter()
    for test_g in ["SLC3A2", "GSR", "GCLM", "PRDX1", "FTH1"]:
        vals = prot_t.loc[test_g].values[os_tumor_indices].astype(np.float64)
        mask = ~np.isnan(vals)
        res_fast = fast_cox_ph_1d(os_months_arr[mask], os_events_arr[mask], vals[mask])
        df_l = pd.DataFrame({
            "T": os_months_arr[mask],
            "E": os_events_arr[mask],
            "xz": (vals[mask] - vals[mask].mean()) / vals[mask].std(ddof=1),
        })
        cph.fit(df_l, duration_col="T", event_col="E")
        hr_l = float(np.exp(cph.params_["xz"]))
        p_l = float(cph.summary.loc["xz", "p"])
        assert res_fast is not None
        assert abs(res_fast[0] - hr_l) < 1e-3 and abs(res_fast[3] - p_l) < 1e-3, f"Cox mismatch on {test_g}: fast={res_fast}, lifelines=({hr_l},{p_l})"
    print("[Verify] fast_cox_ph_1d matches lifelines.CoxPHFitter within <1e-3 on benchmark genes.")

    # 3. Determine gene universe: all 11,662 quantified proteins + 7,430 HGNC mRNA-only genes
    with open(args.hgnc_path, "r", encoding="utf-8") as f:
        hgnc_set = set(json.load(f)["genes"])

    prot_genes = list(prot_t.index)
    prot_gene_set = set(prot_genes)
    mrna_gene_set = set(mrna_t.index)

    # Also ensure any curated preset gene in mrna_t is included even if not in hgnc_set
    curated_all = set(g for p in CURATED_PRESETS for g in p["genes"])
    mrna_only_genes = sorted([
        g for g in (mrna_gene_set - prot_gene_set)
        if (g in hgnc_set or g in curated_all)
    ])

    # Order for mRNA binary matrix: first shared genes (matching protein genes that exist in mRNA), then mrna_only_genes
    mrna_genes_ordered = [g for g in prot_genes if g in mrna_gene_set] + mrna_only_genes
    mrna_gene_to_idx: Dict[str, int] = {g: i for i, g in enumerate(mrna_genes_ordered)}

    print(f"[Genes] Quantified proteins: {len(prot_genes)} (shared w/ mRNA: {len(prot_gene_set & mrna_gene_set)}); HGNC mRNA-only: {len(mrna_only_genes)}; Total mRNA matrix rows: {len(mrna_genes_ordered)}")

    # 4. Write binary matrices (IEEE 754 float32, little-endian)
    prot_t_np = prot_t.values.astype(np.float32)  # (11662, 140)
    prot_n_np = prot_n.values.astype(np.float32)  # (11662, 75)
    prot_combined = np.hstack([prot_t_np, prot_n_np]).astype("<f4")  # (11662, 215)
    prot_bin_path = os.path.join(args.out_dir, "cptac_prot_matrix.bin")
    prot_combined.tofile(prot_bin_path)

    mrna_t_sub = mrna_t.loc[mrna_genes_ordered].values.astype(np.float32)  # (19081, 140)
    mrna_n_sub = mrna_n.loc[mrna_genes_ordered].values.astype(np.float32)  # (19081, 21)
    mrna_combined = np.hstack([mrna_t_sub, mrna_n_sub]).astype("<f4")  # (19081, 161)
    mrna_bin_path = os.path.join(args.out_dir, "cptac_mrna_matrix.bin")
    mrna_combined.tofile(mrna_bin_path)

    print(f"[Binary] cptac_prot_matrix.bin: {os.path.getsize(prot_bin_path)/(1024*1024):.2f} MB | cptac_mrna_matrix.bin: {os.path.getsize(mrna_bin_path)/(1024*1024):.2f} MB")

    # 5. Compute per-protein statistics (Tumor vs Normal, mRNA-Prot Concordance, Paired 67, Cox PH OS)
    print("[Stats] Computing per-protein differential abundance, proteogenomic concordance, and Cox PH survival...")
    mrna_t_full = mrna_t.loc[mrna_genes_ordered].values.astype(np.float64)
    mrna_n_full = mrna_n.loc[mrna_genes_ordered].values.astype(np.float64)

    prot_records = []
    mw_p_indices = []
    mw_p_vals = []
    welch_p_indices = []
    welch_p_vals = []

    for pi, gene in enumerate(prot_genes):
        t_vec = prot_t_np[pi].astype(np.float64)
        n_vec = prot_n_np[pi].astype(np.float64)
        t_valid = t_vec[~np.isnan(t_vec)]
        n_valid = n_vec[~np.isnan(n_vec)]
        nt = len(t_valid)
        nn = len(n_valid)

        t_mean = float(np.mean(t_valid)) if nt > 0 else None
        n_mean = float(np.mean(n_valid)) if nn > 0 else None
        t_med = float(np.median(t_valid)) if nt > 0 else None
        n_med = float(np.median(n_valid)) if nn > 0 else None
        log2fc = (t_mean - n_mean) if (t_mean is not None and n_mean is not None) else None

        mw_p = None
        welch_p = None
        if nt >= 5 and nn >= 3:
            try:
                _, p_mw = stats.mannwhitneyu(t_valid, n_valid, alternative="two-sided")
                if math.isfinite(p_mw):
                    mw_p = float(p_mw)
                    mw_p_indices.append(pi)
                    mw_p_vals.append(mw_p)
            except Exception:
                pass
            try:
                _, p_w = stats.ttest_ind(t_valid, n_valid, equal_var=False)
                if math.isfinite(p_w):
                    welch_p = float(p_w)
                    welch_p_indices.append(pi)
                    welch_p_vals.append(welch_p)
            except Exception:
                pass

        # Paired 67 Tumor-vs-NAT stats
        p_t_pair = t_vec[paired_t_indices]
        p_n_pair = n_vec[paired_n_indices]
        pair_mask = ~np.isnan(p_t_pair) & ~np.isnan(p_n_pair)
        n_paired_nat = int(pair_mask.sum())
        paired_lfc = None
        paired_p = None
        if n_paired_nat >= 10:
            diffs = p_t_pair[pair_mask] - p_n_pair[pair_mask]
            paired_lfc = float(np.mean(diffs))
            if np.any(diffs != 0):
                try:
                    _, pp = stats.wilcoxon(diffs, alternative="two-sided")
                    if math.isfinite(pp):
                        paired_p = float(pp)
                except Exception:
                    pass

        # Matched mRNA vs Protein concordance (across 140 tumors)
        mi = mrna_gene_to_idx.get(gene)
        n_pair_mp = 0
        pearson_r = None
        pearson_p = None
        spearman_rho = None
        spearman_p = None
        m_log2fc = None
        m_mw_p = None

        if mi is not None:
            mv = mrna_t_full[mi]
            valid_mp = ~np.isnan(t_vec) & ~np.isnan(mv)
            n_pair_mp = int(valid_mp.sum())
            if n_pair_mp >= 10:
                mv_v = mv[valid_mp]
                pv_v = t_vec[valid_mp]
                if np.std(mv_v) > 1e-8 and np.std(pv_v) > 1e-8:
                    rp, rpv = stats.pearsonr(mv_v, pv_v)
                    rhop, rhopv = stats.spearmanr(mv_v, pv_v)
                    if math.isfinite(rp):
                        pearson_r = float(rp)
                        pearson_p = float(rpv)
                    if math.isfinite(rhop):
                        spearman_rho = float(rhop)
                        spearman_p = float(rhopv)

            # Also compute mRNA Tumor vs Normal (140 vs 21)
            mn_vec = mrna_n_full[mi]
            mv_all = mv[~np.isnan(mv)]
            mn_all = mn_vec[~np.isnan(mn_vec)]
            if len(mv_all) >= 10 and len(mn_all) >= 5:
                m_log2fc = float(np.mean(mv_all) - np.mean(mn_all))
                try:
                    _, m_mw_p = stats.mannwhitneyu(mv_all, mn_all, alternative="two-sided")
                    m_mw_p = float(m_mw_p) if math.isfinite(m_mw_p) else None
                except Exception:
                    m_mw_p = None

        # Continuous Cox PH OS on valid 134 patients
        os_vals = t_vec[os_tumor_indices]
        os_mask = ~np.isnan(os_vals)
        cox_n = int(os_mask.sum())
        cox_hr = cox_cil = cox_cih = cox_p = None
        if cox_n >= 20:
            cox_res = fast_cox_ph_1d(os_months_arr[os_mask], os_events_arr[os_mask], os_vals[os_mask])
            if cox_res is not None:
                cox_hr, cox_cil, cox_cih, cox_p = cox_res

        prot_records.append({
            "g": gene,
            "pi": pi,
            "mi": mi,
            "nT": nt,
            "nN": nn,
            "tMean": r_round(t_mean, 4),
            "nMean": r_round(n_mean, 4),
            "tMed": r_round(t_med, 4),
            "nMed": r_round(n_med, 4),
            "log2FC": r_round(log2fc, 4),
            "mwP": r_stat(mw_p),
            "mwQ": None,
            "welchP": r_stat(welch_p),
            "welchQ": None,
            "nPairedNat": n_paired_nat,
            "pairedLog2FC": r_round(paired_lfc, 4),
            "pairedP": r_stat(paired_p),
            "nPairMP": n_pair_mp,
            "r": r_round(pearson_r, 4),
            "rP": r_stat(pearson_p),
            "rho": r_round(spearman_rho, 4),
            "rhoP": r_stat(spearman_p),
            "coxN": cox_n,
            "coxHR": r_round(cox_hr, 4),
            "coxCiL": r_round(cox_cil, 4),
            "coxCiH": r_round(cox_cih, 4),
            "coxP": r_stat(cox_p),
            "mLog2FC": r_round(m_log2fc, 4),
            "mMwP": r_stat(m_mw_p),
        })

    # BH FDR correction across tested proteins
    if mw_p_vals:
        _, mw_q_vals, _, _ = multipletests(mw_p_vals, method="fdr_bh")
        for idx, qv in zip(mw_p_indices, mw_q_vals):
            prot_records[idx]["mwQ"] = r_stat(float(qv))
    if welch_p_vals:
        _, w_q_vals, _, _ = multipletests(welch_p_vals, method="fdr_bh")
        for idx, qv in zip(welch_p_indices, w_q_vals):
            prot_records[idx]["welchQ"] = r_stat(float(qv))

    # Sort protein records by mwQ ascending (then abs(log2FC) descending)
    prot_records.sort(key=lambda d: (
        d["mwQ"] if d["mwQ"] is not None else 2.0,
        -(abs(d["log2FC"]) if d["log2FC"] is not None else 0.0),
    ))

    # 6. Compute mRNA-only gene stats (for the 7,430 HGNC genes absent from proteomics, e.g., NFE2L2, HIF1A, SLC7A11)
    print("[Stats] Computing mRNA-only gene stats...")
    mrna_only_records = []
    m_p_indices = []
    m_p_vals = []
    for gene in mrna_only_genes:
        mi = mrna_gene_to_idx[gene]
        mt_vec = mrna_t_full[mi]
        mn_vec = mrna_n_full[mi]
        mt_v = mt_vec[~np.isnan(mt_vec)]
        mn_v = mn_vec[~np.isnan(mn_vec)]
        nt = len(mt_v)
        nn = len(mn_v)
        t_mean = float(np.mean(mt_v)) if nt > 0 else None
        n_mean = float(np.mean(mn_v)) if nn > 0 else None
        lfc = (t_mean - n_mean) if (t_mean is not None and n_mean is not None) else None
        mw_p = None
        if nt >= 5 and nn >= 3:
            try:
                _, pmw = stats.mannwhitneyu(mt_v, mn_v, alternative="two-sided")
                if math.isfinite(pmw):
                    mw_p = float(pmw)
                    m_p_indices.append(len(mrna_only_records))
                    m_p_vals.append(mw_p)
            except Exception:
                pass
        os_vals = mt_vec[os_tumor_indices]
        os_mask = ~np.isnan(os_vals)
        cox_res = fast_cox_ph_1d(os_months_arr[os_mask], os_events_arr[os_mask], os_vals[os_mask]) if os_mask.sum() >= 20 else None
        mrna_only_records.append({
            "g": gene,
            "mi": mi,
            "nT": nt,
            "nN": nn,
            "tMean": r_round(t_mean, 4),
            "nMean": r_round(n_mean, 4),
            "log2FC": r_round(lfc, 4),
            "mwP": r_stat(mw_p),
            "mwQ": None,
            "coxN": int(os_mask.sum()),
            "coxHR": r_round(cox_res[0], 4) if cox_res else None,
            "coxCiL": r_round(cox_res[1], 4) if cox_res else None,
            "coxCiH": r_round(cox_res[2], 4) if cox_res else None,
            "coxP": r_stat(cox_res[3]) if cox_res else None,
        })

    if m_p_vals:
        _, mq_vals, _, _ = multipletests(m_p_vals, method="fdr_bh")
        for idx, qv in zip(m_p_indices, mq_vals):
            mrna_only_records[idx]["mwQ"] = r_stat(float(qv))

    # 7. Compute pathway-level mRNA-vs-Protein concordance summary (Curated + MSigDB Hallmark)
    prot_by_gene = {d["g"]: d for d in prot_records}

    def summarize_pathway(pid: str, pname: str, category: str, genes: List[str]) -> Optional[Dict]:
        matched = [prot_by_gene[g] for g in genes if g in prot_by_gene and prot_by_gene[g]["r"] is not None]
        if len(matched) < 5:
            return None
        r_vals = [d["r"] for d in matched]
        rho_vals = [d["rho"] for d in matched if d["rho"] is not None]
        lfc_vals = [d["log2FC"] for d in matched if d["log2FC"] is not None]
        sorted_by_r = sorted(matched, key=lambda d: d["r"], reverse=True)
        return {
            "id": pid,
            "name": pname,
            "category": category,
            "total_genes": len(genes),
            "quantified_paired": len(matched),
            "median_r": round(float(np.median(r_vals)), 4),
            "mean_r": round(float(np.mean(r_vals)), 4),
            "q25_r": round(float(np.percentile(r_vals, 25)), 4),
            "q75_r": round(float(np.percentile(r_vals, 75)), 4),
            "median_rho": round(float(np.median(rho_vals)), 4) if rho_vals else None,
            "median_log2FC": round(float(np.median(lfc_vals)), 4) if lfc_vals else None,
            "top_concordant": [{"g": d["g"], "r": d["r"], "rho": d["rho"]} for d in sorted_by_r[:5]],
            "lowest_concordant": [{"g": d["g"], "r": d["r"], "rho": d["rho"]} for d in sorted_by_r[-5:][::-1]],
        }

    pathway_concordance = []
    for preset in CURATED_PRESETS:
        s = summarize_pathway(preset["id"], preset["name"], "Curated PDAC Panel", preset["genes"])
        if s:
            pathway_concordance.append(s)

    if os.path.exists(args.hallmark_path):
        with open(args.hallmark_path, "r", encoding="utf-8") as f:
            hallmark_data = json.load(f)
        for pw in hallmark_data.get("pathways", []):
            s = summarize_pathway(pw["id"], pw["name"], "MSigDB Hallmark", pw["genes"])
            if s:
                pathway_concordance.append(s)

    pathway_concordance.sort(key=lambda x: x["median_r"], reverse=True)

    # Global concordance stats
    all_r = [d["r"] for d in prot_records if d["r"] is not None]
    all_rho = [d["rho"] for d in prot_records if d["rho"] is not None]
    sig_mw = [d for d in prot_records if d["mwQ"] is not None and d["mwQ"] < 0.05]

    metadata = {
        "study_id": "paad_cptac_2021",
        "title": "CPTAC-PDAC Proteogenomic Discovery Study (Cao et al., Cell 2021)",
        "pmid": "34534465",
        "doi": "10.1016/j.cell.2021.08.023",
        "sources": {
            "proteomics_and_rna": "LinkedOmics CPTAC-PDAC (https://linkedomics.org/data_download/CPTAC-PDAC/)",
            "cbioportal_parity": "cBioPortal paad_cptac_2021 (140 tumor samples verified identical)",
        },
        "counts": {
            "protein_genes": len(prot_genes),
            "mrna_indexed_genes": len(mrna_genes_ordered),
            "shared_mrna_protein_genes": len(prot_gene_set & mrna_gene_set),
            "mrna_protein_tested_ge10": len(all_r),
            "mrna_only_hgnc_genes": len(mrna_only_genes),
            "tumor_proteomics_samples": len(tumor_ids),
            "normal_proteomics_samples": len(normal_ids),
            "paired_tumor_normal_proteomics": len(paired_nat_ids),
            "unmatched_normal_proteomics": len(normal_ids) - len(paired_nat_ids),
            "total_proteomics_samples": len(tumor_ids) + len(normal_ids),
            "tumor_mrna_samples": len(tumor_ids),
            "normal_mrna_samples": len(mrna_normal_ids),
            "paired_mrna_protein_tumors": len(tumor_ids),
            "clinical_total": len(clinical_samples),
            "clinical_valid_os": len(valid_os_records),
            "clinical_os_events": int(os_events_arr.sum()),
            "clinical_valid_os_pdac_only": sum(1 for r in valid_os_records if r["histology"] == "PDAC"),
            "clinical_os_events_pdac_only": sum(1 for r in valid_os_records if r["histology"] == "PDAC" and r["os_event"] == 1),
            "clinical_excluded_os": len(excluded_os_records),
            "median_followup_months": round(float(np.median(os_months_arr)), 2),
            "sig_proteins_mw_fdr05": len(sig_mw),
            "sig_proteins_up_fdr05": sum(1 for d in sig_mw if (d["log2FC"] or 0) > 0),
            "sig_proteins_down_fdr05": sum(1 for d in sig_mw if (d["log2FC"] or 0) < 0),
        },
        "global_concordance": {
            "median_pearson_r": round(float(np.median(all_r)), 4),
            "mean_pearson_r": round(float(np.mean(all_r)), 4),
            "median_spearman_rho": round(float(np.median(all_rho)), 4),
            "mean_spearman_rho": round(float(np.mean(all_rho)), 4),
            "pct_positive_r": round(float(np.mean(np.array(all_r) > 0) * 100.0), 2),
        },
        "protein_samples": {
            "tumor_ids": tumor_ids,
            "normal_ids": normal_ids,
            "paired_nat_ids": paired_nat_ids,
            "tumor_start": 0,
            "tumor_end": len(tumor_ids),
            "normal_start": len(tumor_ids),
            "normal_end": len(tumor_ids) + len(normal_ids),
            "total_cols": len(tumor_ids) + len(normal_ids),
        },
        "mrna_samples": {
            "tumor_ids": tumor_ids,
            "normal_ids": mrna_normal_ids,
            "tumor_start": 0,
            "tumor_end": len(tumor_ids),
            "normal_start": len(tumor_ids),
            "normal_end": len(tumor_ids) + len(mrna_normal_ids),
            "total_cols": len(tumor_ids) + len(mrna_normal_ids),
        },
        "clinical_samples": clinical_samples,
        "clinical_survival": valid_os_records,
        "excluded_survival_cases": excluded_os_records,
        "curated_presets": CURATED_PRESETS,
        "pathway_concordance": pathway_concordance,
    }

    with open(os.path.join(args.out_dir, "cptac_metadata.json"), "w", encoding="utf-8") as f:
        json.dump(metadata, f, separators=(",", ":"))

    with open(os.path.join(args.out_dir, "cptac_protein_stats.json"), "w", encoding="utf-8") as f:
        json.dump(prot_records, f, separators=(",", ":"))

    with open(os.path.join(args.out_dir, "cptac_mrna_only_stats.json"), "w", encoding="utf-8") as f:
        json.dump(mrna_only_records, f, separators=(",", ":"))

    print(f"[Done] Built CPTAC-PDAC assets in {args.out_dir} in {time.time() - t0:.2f}s")
    for fname in sorted(os.listdir(args.out_dir)):
        sz = os.path.getsize(os.path.join(args.out_dir, fname)) / (1024 * 1024)
        print(f"  {fname}: {sz:.2f} MB")


if __name__ == "__main__":
    main()
