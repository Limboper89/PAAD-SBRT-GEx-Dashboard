# verify_database_integrity.py - Database Integrity Audit Script

import json
import glob

print("=== PATHWAY DATABASE INTEGRITY AUDIT ===")

db_files = glob.glob('public/data/pathways/*.json')

for fpath in sorted(db_files):
    if 'index.json' in fpath or 'pathways.json' in fpath:
        continue
        
    print(f"\nAuditing: {fpath}")
    with open(fpath) as f:
        data = json.load(f)
        
    prov = data.get('provenance', {})
    pathways = data.get('pathways', [])
    
    print(f"  Database Name: {prov.get('database')}")
    print(f"  Version: {prov.get('version')}")
    print(f"  Species: {prov.get('species')}")
    print(f"  Identifier Type: {prov.get('identifier')}")
    print(f"  License: {prov.get('license')}")
    print(f"  Redistribution Status: {prov.get('redistributionStatus')}")
    print(f"  Pathway Count: {len(pathways)}")
    
    pid_set = set()
    dup_pids = []
    total_genes = 0
    all_symbols = set()
    malformed = []

    for p in pathways:
        pid = p.get('id')
        if pid in pid_set:
            dup_pids.append(pid)
        pid_set.add(pid)
        
        genes = p.get('genes', [])
        if not pid or not isinstance(genes, list) or len(genes) == 0:
            malformed.append(pid)
            
        dup_genes = len(genes) - len(set(genes))
        if dup_genes > 0:
            print(f"    WARNING: Duplicate genes in pathway {pid}: {dup_genes} duplicates")
            
        total_genes += len(genes)
        for g in genes:
            all_symbols.add(g)

    print(f"  Total Member References: {total_genes}")
    print(f"  Unique Gene Symbols Across Collection: {len(all_symbols)}")
    print(f"  Duplicate Pathway IDs: {len(dup_pids)}")
    print(f"  Malformed Gene Sets: {len(malformed)}")
    assert len(dup_pids) == 0, f"Duplicate pathway IDs found in {fpath}"
    assert len(malformed) == 0, f"Malformed gene sets found in {fpath}"
    assert prov.get('species') == 'Homo sapiens', "Species must be Homo sapiens"
    print("  STATUS: PASSED CLEAN AUDIT")
