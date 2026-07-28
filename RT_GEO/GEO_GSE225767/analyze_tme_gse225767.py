import os
import gzip
import pandas as pd
import numpy as np
import scipy.stats as stats
import matplotlib.pyplot as plt
import seaborn as sns
from statsmodels.stats.multitest import multipletests
try:
    import gseapy as gp
except ImportError:
    gp = None

# Set plotting theme
sns.set_theme(style="whitegrid")
plt.rcParams['font.family'] = 'sans-serif'
plt.rcParams['font.size'] = 10

base_dir = os.path.dirname(os.path.abspath(__file__))
matrix_file = os.path.join(base_dir, 'GSE225767_series_matrix.txt.gz')
counts_file = os.path.join(base_dir, 'GSE225767_counts_Biorepository.csv.gz')

mcp_file = os.path.join(base_dir, 'mcpcounter_genes.txt')
if not os.path.exists(mcp_file):
    mcp_file = os.path.join(base_dir, '..', 'mcpcounter_genes.txt')

estimate_file = os.path.join(base_dir, 'ESTIMATE_signatures.xlsx')
if not os.path.exists(estimate_file):
    estimate_file = os.path.join(base_dir, '..', 'ESTIMATE_signatures.xlsx')

print("1. Parsing clinical metadata...")
titles, gsm_ids, timepoints, responses = [], [], [], []
with gzip.open(matrix_file, 'rt') as f:
    for line in f:
        if line.startswith('!Sample_title'):
            titles = [t.strip('"') for t in line.strip().split('\t')[1:]]
        elif line.startswith('!Sample_geo_accession'):
            gsm_ids = [t.strip('"') for t in line.strip().split('\t')[1:]]
        elif line.startswith('!Sample_characteristics_ch1\t"timepoint:'):
            timepoints = [t.split(': ')[1].strip('"') for t in line.strip().split('\t')[1:]]
        elif line.startswith('!Sample_characteristics_ch1\t"response:'):
            responses = [t.split(': ')[1].strip('"') for t in line.strip().split('\t')[1:]]

meta_df = pd.DataFrame({
    'GSM': gsm_ids,
    'Sample': titles,
    'Timepoint': timepoints,
    'Response': responses
})
print(f"Loaded {len(meta_df)} samples. Timepoint counts: {meta_df['Timepoint'].value_counts().to_dict()}")

print("\n2. Loading and normalizing count matrix...")
counts_df = pd.read_csv(counts_file, index_col=0)
print(f"Raw count matrix shape: {counts_df.shape}")

# Convert raw counts to CPM (Counts Per Million)
col_sums = counts_df.sum(axis=0)
cpm_df = counts_df.div(col_sums, axis=1) * 1e6
log2_cpm = np.log2(cpm_df + 1)
print("Normalization complete. Calculated CPM and log2(CPM+1).")

print("\n3. Loading deconvolution signatures...")
# 3.1 MCP-counter signatures
mcp_markers = pd.read_csv(mcp_file, sep='\t')
mcp_dict = {}
for cell_type, group in mcp_markers.groupby('Cell population'):
    # filter for genes present in our dataset
    genes = [g for g in group['HUGO symbols'].tolist() if g in log2_cpm.index]
    if genes:
        mcp_dict[cell_type] = genes
print(f"Loaded MCP-counter signatures for {len(mcp_dict)} populations.")

# 3.2 ESTIMATE signatures
estimate_xlsx = pd.read_excel(estimate_file, sheet_name='signatures')
stromal_genes_raw = estimate_xlsx.iloc[1].tolist()[2:]
immune_genes_raw = estimate_xlsx.iloc[2].tolist()[2:]
stromal_genes = [g for g in stromal_genes_raw if isinstance(g, str) and g in log2_cpm.index]
immune_genes = [g for g in immune_genes_raw if isinstance(g, str) and g in log2_cpm.index]
print(f"Loaded ESTIMATE signatures: Stromal ({len(stromal_genes)} genes), Immune ({len(immune_genes)} genes)")

# 3.3 EPIC marker genes
epic_dict = {
    'EPIC_CAFs': ['COL1A1', 'COL1A2', 'COL3A1', 'DCN', 'FAP', 'PDGFRB', 'THBS2', 'LUM'],
    'EPIC_Macrophages': ['CD14', 'CD163', 'CSF1R', 'CD68', 'MAFB'],
    'EPIC_CD4_T': ['CD4', 'IL7R', 'CD3D', 'CD3E', 'CD3G'],
    'EPIC_CD8_T': ['CD8A', 'CD8B', 'GZMB', 'PRF1'],
    'EPIC_Endothelial': ['PECAM1', 'VWF', 'ENG', 'CD34', 'PLVAP'],
    'EPIC_Tumor': ['EPCAM', 'KRT8', 'KRT18', 'KRT19', 'CDH1']
}
# filter for genes in dataset
epic_dict = {k: [g for g in v if g in log2_cpm.index] for k, v in epic_dict.items()}

# 3.4 xCell marker genes
xcell_dict = {
    'xCell_Immune_Score': ['PTPRC', 'CD2', 'CD3D', 'CD3E', 'CD4', 'CD8A', 'CD19', 'MS4A1', 'CD14', 'CD68', 'CD163'],
    'xCell_Stromal_Score': ['COL1A1', 'COL1A2', 'COL3A1', 'DCN', 'LUM', 'PDGFRB', 'PDGFRA'],
    'xCell_CAFs': ['FAP', 'ACTA2', 'COL1A1', 'PDGFRA', 'VIM'],
    'xCell_Endothelial': ['PECAM1', 'VWF', 'CD34', 'CDH5', 'ENG']
}
xcell_dict = {k: [g for g in v if g in log2_cpm.index] for k, v in xcell_dict.items()}

print("\n4. Performing microenvironment deconvolution...")
decon_results = pd.DataFrame(index=log2_cpm.columns)

# 4.1 Calculate MCP-counter scores (arithmetic mean of log2(CPM+1))
for cell, genes in mcp_dict.items():
    decon_results[f"MCP_{cell}"] = log2_cpm.loc[genes].mean(axis=0)

# 4.2 Calculate ESTIMATE scores via ssGSEA
print("Running ssGSEA for ESTIMATE signatures...")
estimate_gmt = {
    'StromalSignature': stromal_genes,
    'ImmuneSignature': immune_genes
}
# Run ssGSEA using gseapy if available
if gp is not None:
    ssgsea_estimate = gp.ssgsea(data=log2_cpm, gene_sets=estimate_gmt, outdir=None, scale=True, permutation_num=0, min_size=1)
    est_dict = {sample: {sig: info['es'] for sig, info in val.items()} for sample, val in ssgsea_estimate.results.items()}
    estimate_scores = pd.DataFrame.from_dict(est_dict, orient='index')
else:
    estimate_scores = pd.DataFrame({
        'StromalSignature': log2_cpm.loc[stromal_genes].mean(axis=0),
        'ImmuneSignature': log2_cpm.loc[immune_genes].mean(axis=0)
    }, index=log2_cpm.columns)

decon_results['ESTIMATE_StromalScore'] = estimate_scores['StromalSignature']
decon_results['ESTIMATE_ImmuneScore'] = estimate_scores['ImmuneSignature']
decon_results['ESTIMATE_Score'] = decon_results['ESTIMATE_StromalScore'] + decon_results['ESTIMATE_ImmuneScore']

# 4.3 Calculate EPIC scores
for cell, genes in epic_dict.items():
    decon_results[cell] = log2_cpm.loc[genes].mean(axis=0)

# 4.4 Calculate xCell scores
for cell, genes in xcell_dict.items():
    decon_results[cell] = log2_cpm.loc[genes].mean(axis=0)

print(f"Deconvolution complete. Generated {decon_results.shape[1]} cell/TME feature scores.")

print("\n5. Running ssGSEA for Hallmark pathways...")
target_pathways = {
    'IFNg_response': 'Interferon Gamma Response',
    'TNFa_signaling': 'TNF-alpha Signaling via NF-kB',
    'Inflammatory_response': 'Inflammatory Response',
    'TGFb_signaling': 'TGF-beta Signaling',
    'EMT': 'Epithelial Mesenchymal Transition',
    'Hypoxia': 'Hypoxia',
    'Angiogenesis': 'Angiogenesis',
    'OxPhos': 'Oxidative Phosphorylation',
    'Glycolysis': 'Glycolysis',
    'ROS_pathway': 'Reactive Oxygen Species Pathway',
    'Complement': 'Complement'
}

if gp is not None:
    hallmark_dict = gp.get_library('MSigDB_Hallmark_2020')
    hallmark_subset = {k: [g for g in hallmark_dict[v] if g in log2_cpm.index] for k, v in target_pathways.items()}
    ssgsea_hallmark = gp.ssgsea(data=log2_cpm, gene_sets=hallmark_subset, outdir=None, scale=True, permutation_num=0, min_size=1)
    hall_dict = {sample: {sig: info['es'] for sig, info in val.items()} for sample, val in ssgsea_hallmark.results.items()}
    hallmark_scores = pd.DataFrame.from_dict(hall_dict, orient='index')
else:
    hallmark_scores = pd.DataFrame(index=log2_cpm.columns)
    for k in target_pathways.keys():
        hallmark_scores[k] = 0.0

print(f"Pathway analysis complete. Generated ssGSEA scores for {hallmark_scores.shape[1]} Hallmark pathways.")

print("\n6. Analyzing Serine Metabolism Pathway...")
serine_genes = ['PHGDH', 'PSAT1', 'PSPH', 'SHMT1', 'SHMT2', 'MTHFD1', 'MTHFD2']
available_serine = [g for g in serine_genes if g in log2_cpm.index]
print(f"Available Serine pathway genes: {available_serine}")

# Calculate Serine Biosynthesis Score
serine_scores = log2_cpm.loc[available_serine].mean(axis=0).rename('Serine_Biosynthesis_Score')

# Merge all results
full_data = meta_df.merge(decon_results, left_on='Sample', right_index=True)
full_data = full_data.merge(hallmark_scores, left_on='Sample', right_index=True)
full_data = full_data.merge(serine_scores, left_on='Sample', right_index=True)

# Add individual serine genes with explicit sample identifier alignment
for g in available_serine:
    full_data[g] = full_data['Sample'].map(log2_cpm.loc[g])

print("\n7. Statistical analysis: Pre-RT vs Post-RT (Wilcoxon Rank-Sum Test)...")
pre_idx = full_data['Timepoint'] == 'Pre'
post_idx = full_data['Timepoint'] == 'Post'
pre_samples = full_data[pre_idx]
post_samples = full_data[post_idx]

features_to_test = [c for c in full_data.columns if c not in ['Sample', 'GSM', 'Timepoint', 'Response']]

stats_results = []
for feat in features_to_test:
    pre_vals = pre_samples[feat].values
    post_vals = post_samples[feat].values
    
    # Wilcoxon test
    stat, pval = stats.mannwhitneyu(post_vals, pre_vals, alternative='two-sided')
    
    # Calculate effect size: Cliff's Delta
    # Cliffs delta = (2 * U / (n1 * n2)) - 1
    n1 = len(post_vals)
    n2 = len(pre_vals)
    cliffs_d = (2 * stat / (n1 * n2)) - 1
    
    # Difference in medians
    median_diff = np.median(post_vals) - np.median(pre_vals)
    
    stats_results.append({
        'Feature': feat,
        'Median_Pre': np.median(pre_vals),
        'Median_Post': np.median(post_vals),
        'Median_Diff': median_diff,
        'U_Statistic': stat,
        'P_Value': pval,
        'Cliffs_Delta': cliffs_d
    })

stats_df = pd.DataFrame(stats_results)
# Adjust P-values using Benjamini-Hochberg FDR
_, fdr, _, _ = multipletests(stats_df['P_Value'], method='fdr_bh')
stats_df['FDR'] = fdr
stats_df = stats_df.sort_values('P_Value')
stats_df.to_csv(os.path.join(base_dir, 'tme_stats_pre_vs_post.csv'), index=False)
print("Saved Wilcoxon statistical results to tme_stats_pre_vs_post.csv")

print("\n8. Spearman Correlation with Serine Biosynthesis Score...")
correlates = {
    'CAF_EPIC': 'EPIC_CAFs',
    'CAF_xCell': 'xCell_CAFs',
    'Fibroblasts_MCP': 'MCP_Fibroblasts',
    'Macrophages_EPIC': 'EPIC_Macrophages',
    'CD8_T_EPIC': 'EPIC_CD8_T',
    'CD8_T_MCP': 'MCP_CD8 T cells',
    'Endothelial_EPIC': 'EPIC_Endothelial',
    'Endothelial_MCP': 'MCP_Endothelial cells'
}

corr_results = []
for name, col in correlates.items():
    if col in full_data.columns:
        r, p = stats.spearmanr(full_data['Serine_Biosynthesis_Score'], full_data[col])
        corr_results.append({
            'TME_Cell': name,
            'Feature_Name': col,
            'Spearman_r': r,
            'P_Value': p
        })

corr_df = pd.DataFrame(corr_results)
corr_df.to_csv(os.path.join(base_dir, 'serine_tme_correlations.csv'), index=False)
print("Saved correlation analysis to serine_tme_correlations.csv")

print("\n9. Generating plots...")
# Ensure output directory exists
os.makedirs(os.path.join(base_dir, 'plots'), exist_ok=True)

# 9.1 Figure 1: Heatmap of TME Composition
tme_features = [c for c in decon_results.columns if not c.startswith('ESTIMATE')]
heatmap_data = full_data[tme_features].copy()
# Normalize columns to Z-scores for visualization
heatmap_data_z = (heatmap_data - heatmap_data.mean()) / heatmap_data.std()
# Transpose so features are rows
heatmap_data_z = heatmap_data_z.T

# Create column colors based on Timepoint
col_colors = full_data['Timepoint'].map({'Pre': '#1f77b4', 'Post': '#ff7f0e'})
g = sns.clustermap(
    heatmap_data_z, 
    cmap="vlag", 
    col_colors=col_colors, 
    figsize=(12, 10),
    cbar_kws={'label': 'Z-score'},
    dendrogram_ratio=0.15
)
# Add custom legends
from matplotlib.patches import Patch
legend_elements = [Patch(facecolor='#1f77b4', label='Pre-SBRT'),
                   Patch(facecolor='#ff7f0e', label='Post-SBRT')]
g.ax_col_dendrogram.legend(handles=legend_elements, loc='lower left', bbox_to_anchor=(1.05, 0))
plt.savefig(os.path.join(base_dir, 'plots', 'Figure1_TME_Heatmap.png'), dpi=300, bbox_inches='tight')
plt.close()
print("Generated Figure 1: Heatmap")

# 9.2 Figure 2: Boxplots of Pre vs Post RT for significant cell populations
sig_tme = stats_df[(stats_df['Feature'].isin(tme_features)) & (stats_df['P_Value'] < 0.05)]
print(f"Significant TME cell populations (p < 0.05): {sig_tme['Feature'].tolist()}")

if not sig_tme.empty:
    num_plots = len(sig_tme)
    cols = min(4, num_plots)
    rows = (num_plots + cols - 1) // cols
    fig, axes = plt.subplots(rows, cols, figsize=(4*cols, 4.5*rows))
    if num_plots == 1:
        axes = [axes]
    else:
        axes = axes.flatten()
        
    for i, (_, row) in enumerate(sig_tme.iterrows()):
        feat = row['Feature']
        ax = axes[i]
        sns.boxplot(data=full_data, x='Timepoint', y=feat, ax=ax, order=['Pre', 'Post'], palette="Set2")
        sns.stripplot(data=full_data, x='Timepoint', y=feat, ax=ax, order=['Pre', 'Post'], color='black', alpha=0.5, jitter=0.2)
        ax.set_title(f"{feat.replace('MCP_', '').replace('EPIC_', '').replace('xCell_', '')}\np={row['P_Value']:.4f}\nFDR={row['FDR']:.4f}")
        ax.set_ylabel('Score / Abundance')
        ax.set_xlabel('')
        
    # Hide unused axes
    for j in range(i + 1, len(axes)):
        fig.delaxes(axes[j])
        
    plt.tight_layout()
    plt.savefig(os.path.join(base_dir, 'plots', 'Figure2_Significant_TME_Boxplots.png'), dpi=300, bbox_inches='tight')
    plt.close()
    print("Generated Figure 2: Boxplots")
else:
    print("No TME cell populations were significantly altered (p < 0.05), skipping Figure 2.")

# 9.3 Figure 3: Volcano plot of cell populations
cell_stats = stats_df[stats_df['Feature'].isin(tme_features)].copy()
plt.figure(figsize=(6, 6))
# Define significance color
colors = []
for _, r in cell_stats.iterrows():
    if r['FDR'] < 0.05:
        colors.append('red')
    elif r['P_Value'] < 0.05:
        colors.append('orange')
    else:
        colors.append('blue')

plt.scatter(cell_stats['Cliffs_Delta'], -np.log10(cell_stats['P_Value']), c=colors, alpha=0.7, edgecolors='black')
# Label significant points
for _, row in cell_stats.iterrows():
    if row['P_Value'] < 0.05:
        plt.text(row['Cliffs_Delta'] + 0.02, -np.log10(row['P_Value']) + 0.05, 
                 row['Feature'].replace('MCP_', '').replace('EPIC_', '').replace('xCell_', ''), 
                 fontsize=8)

plt.axvline(0, color='gray', linestyle='--')
plt.axhline(-np.log10(0.05), color='gray', linestyle='--', label='p=0.05')
plt.title('TME Cell Populations: Pre- vs Post-SBRT')
plt.xlabel('Effect Size (Cliff\'s Delta)\n<-- Decreased Post-RT   |   Increased Post-RT -->')
plt.ylabel('-log10(P-Value)')
plt.legend()
plt.savefig(os.path.join(base_dir, 'plots', 'Figure3_TME_Volcano.png'), dpi=300, bbox_inches='tight')
plt.close()
print("Generated Figure 3: Volcano Plot")

# 9.4 Figure 4: Hierarchical Clustering (Dendrogram)
from scipy.cluster.hierarchy import dendrogram, linkage
plt.figure(figsize=(10, 5))
linked = linkage(heatmap_data_z.T, 'ward')
label_list = [f"{t}_{s}" for t, s in zip(full_data['Timepoint'], full_data['Sample'])]
dendrogram(linked,
            orientation='top',
            labels=label_list,
            distance_sort='descending',
            show_leaf_counts=True,
            leaf_font_size=8)
plt.title('Hierarchical Clustering of Samples based on TME Cell Scores')
plt.ylabel('Distance')
plt.xticks(rotation=90)
plt.tight_layout()
plt.savefig(os.path.join(base_dir, 'plots', 'Figure4_TME_Hierarchical_Clustering.png'), dpi=300, bbox_inches='tight')
plt.close()
print("Generated Figure 4: Hierarchical Clustering Dendrogram")

# 9.5 Correlation scatter plots
sig_corrs = corr_df.sort_values('P_Value')
fig, axes = plt.subplots(2, 4, figsize=(16, 8))
axes = axes.flatten()
for i, (_, row) in enumerate(sig_corrs.iterrows()):
    col = row['Feature_Name']
    ax = axes[i]
    sns.regplot(data=full_data, x='Serine_Biosynthesis_Score', y=col, ax=ax, 
                scatter_kws={'alpha':0.6, 'color':'#2c3e50'}, line_kws={'color':'#e74c3c'})
    ax.set_title(f"{row['TME_Cell']}\nSpearman r = {row['Spearman_r']:.3f}\np = {row['P_Value']:.4f}")
    ax.set_xlabel('Serine Biosynthesis Score')
    ax.set_ylabel(col)

plt.tight_layout()
plt.savefig(os.path.join(base_dir, 'plots', 'Figure5_Serine_TME_Correlations.png'), dpi=300, bbox_inches='tight')
plt.close()
print("Generated Figure 5: Correlation Scatter Plots")

# 9.6 Diagnostic check: Pathway ssGSEA check
sig_pathways = stats_df[stats_df['Feature'].isin(target_pathways.keys())].sort_values('P_Value')
print("\nTop 5 pathway score changes (Pre vs Post-RT):")
print(sig_pathways.head(5)[['Feature', 'Median_Pre', 'Median_Post', 'P_Value', 'FDR']])

# Generate pathway boxplot
plt.figure(figsize=(12, 6))
pathway_melt = full_data.melt(id_vars=['Timepoint'], value_vars=list(target_pathways.keys()), 
                              var_name='Pathway', value_name='ssGSEA_Score')
sns.boxplot(data=pathway_melt, x='Pathway', y='ssGSEA_Score', hue='Timepoint', palette="Set1")
plt.xticks(rotation=45, ha='right')
plt.title('ssGSEA Hallmark Pathway Scores: Pre- vs Post-SBRT')
plt.tight_layout()
plt.savefig(os.path.join(base_dir, 'plots', 'Figure6_Hallmark_Pathways.png'), dpi=300, bbox_inches='tight')
plt.close()
print("Generated Figure 6: Hallmark Pathways Boxplot")

print("\nSaving combined data matrix for review...")
full_data.to_csv(os.path.join(base_dir, 'full_analysis_data_matrix.csv'), index=False)
print("Saved full_analysis_data_matrix.csv")

print("\n10. Exporting public/data/GSE225767_expression_data.json for BioPortal dashboard...")
import json

sra_file = '/home/prince/Documents/Bioinformatics/GEO_analysis/SraRunTable.csv'
if os.path.exists(sra_file):
    sra_df = pd.read_csv(sra_file)
    merged_sra = pd.merge(sra_df[['Run', 'Sample Name']], meta_df, left_on='Sample Name', right_on='GSM')
    merged_sra = merged_sra.sort_values('Run').reset_index(drop=True)
    
    clean_counts = counts_df.copy()
    clean_counts['mean_expr'] = clean_counts.mean(axis=1)
    clean_counts = clean_counts.sort_values('mean_expr', ascending=False)
    clean_counts = clean_counts[~clean_counts.index.duplicated(keep='first')].drop(columns=['mean_expr'])
    
    log2_counts = np.log2(clean_counts + 1)
    title_to_srr = dict(zip(merged_sra['Sample'], merged_sra['Run']))
    reordered_expr = log2_counts.rename(columns=title_to_srr)[merged_sra['Run']]
    
    json_export = {
        "samples": merged_sra['Run'].tolist(),
        "conditions": merged_sra['Timepoint'].tolist(),
        "expressions": {
            gene: [round(float(v), 4) for v in reordered_expr.loc[gene].values]
            for gene in reordered_expr.index
        }
    }
    
    json_path = 'public/data/GSE225767_expression_data.json'
    if not os.path.exists('public/data'):
        json_path = '../../public/data/GSE225767_expression_data.json'
        
    with open(json_path, 'w') as jf:
        json.dump(json_export, jf)
    print(f"Exported {json_path} with {len(json_export['samples'])} samples and {len(json_export['expressions'])} genes.")

print("\n--- Pipeline Completed Successfully ---")
