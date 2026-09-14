import json
import gzip
import pandas as pd
import numpy as np

with open('d:/DATA/PDAC_BioPortal/public/data/GSE225767_expression_data.json') as f:
    json_data = json.load(f)

df_counts = pd.read_csv('d:/DATA/RT_GEO/GEO_GSE225767/GSE225767_counts_Biorepository.csv.gz', index_col=0)

titles = []
gsms = []
timepoints = []
responses = []

with gzip.open('d:/DATA/RT_GEO/GEO_GSE225767/GSE225767_series_matrix.txt.gz', 'rt') as f:
    for line in f:
        if line.startswith('!Sample_title'):
            titles = [t.strip().strip('"') for t in line.strip().split('\t')[1:]]
        elif line.startswith('!Sample_geo_accession'):
            gsms = [t.strip().strip('"') for t in line.strip().split('\t')[1:]]
        elif line.startswith('!Sample_characteristics_ch1\t"timepoint:'):
            timepoints = [t.split(': ')[1].strip().strip('"') for t in line.strip().split('\t')[1:]]
        elif line.startswith('!Sample_characteristics_ch1\t"response:'):
            responses = [t.split(': ')[1].strip().strip('"') for t in line.strip().split('\t')[1:]]

meta_map = {}
for i in range(len(titles)):
    meta_map[titles[i]] = {
        'gsm': gsms[i],
        'timepoint': timepoints[i],
        'response': responses[i]
    }

common_genes = [g for g in json_data['expressions'].keys() if g in df_counts.index][:100]

matched_metadata = []
unmatched = 0

for i in range(len(json_data['samples'])):
    s_id = json_data['samples'][i]
    cond = json_data['conditions'][i]
    vec = [json_data['expressions'][g][i] for g in common_genes]
    best_col = None
    best_r = -1
    for col in df_counts.columns:
        cvec = np.log2(df_counts.loc[common_genes, col].values + 1)
        r = np.corrcoef(vec, cvec)[0, 1]
        if r > best_r:
            best_r = r
            best_col = col

    meta = meta_map.get(best_col, {'gsm': 'NA', 'timepoint': cond, 'response': 'Unk'})
    matched_metadata.append({
        'sample_index': i,
        'srr_id': s_id,
        'title': best_col,
        'gsm': meta['gsm'],
        'timepoint': meta['timepoint'],
        'response': meta['response'],
        'correlation': round(float(best_r), 4)
    })

df_matched = pd.DataFrame(matched_metadata)
print(df_matched.head(10))
print('\nResponse cross-tab with timepoint:')
print(pd.crosstab(df_matched['timepoint'], df_matched['response']))
print('Min correlation across all 55:', df_matched['correlation'].min())

# Save to public/data/gse225767_sample_metadata.json
with open('d:/DATA/PDAC_BioPortal/public/data/gse225767_sample_metadata.json', 'w') as f:
    json.dump(matched_metadata, f, indent=2)

print('Saved public/data/gse225767_sample_metadata.json successfully!')
