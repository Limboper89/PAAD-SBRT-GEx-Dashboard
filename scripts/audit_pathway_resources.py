# audit_pathway_resources.py - Comprehensive Pathway Resource & Collection Audit

import json
import glob
import numpy as np

print("=== PATHWAY RESOURCE AUDIT REPORT ===")

db_files = [
    "public/data/pathways/hallmark.json",
    "public/data/pathways/reactome.json",
    "public/data/pathways/go_bp.json"
]

for fpath in db_files:
    print(f"\n--------------------------------------------------")
    print(f"Auditing File: {fpath}")
    with open(fpath) as f:
        data = json.load(f)

    prov = data.get("provenance", {})
    pathways = data.get("pathways", [])

    sizes = [len(p["genes"]) for p in pathways]
    all_genes = set()
    pids = []
    names = []

    for p in pathways:
        pids.append(p["id"])
        names.append(p["name"])
        for g in p["genes"]:
            all_genes.add(g)

    dup_ids = len(pids) - len(set(pids))
    dup_names = len(names) - len(set(names))
    empty_sets = sum(1 for s in sizes if s == 0)

    print(f"  Database Name:            {prov.get('database')}")
    print(f"  Version:                  {prov.get('version')}")
    print(f"  Species:                  {prov.get('species')}")
    print(f"  Identifier Type:          {prov.get('identifier')}")
    print(f"  License:                  {prov.get('license')}")
    print(f"  Redistribution Status:    {prov.get('redistributionStatus')}")
    print(f"  Actual Pathways Loaded:   {len(pathways)}")
    print(f"  Unique Member Genes:      {len(all_genes)}")
    print(f"  Min Gene-Set Size:        {min(sizes) if sizes else 0}")
    print(f"  Median Gene-Set Size:     {np.median(sizes) if sizes else 0:.1f}")
    print(f"  Max Gene-Set Size:        {max(sizes) if sizes else 0}")
    print(f"  Empty Gene Sets:          {empty_sets}")
    print(f"  Duplicate Pathway IDs:    {dup_ids}")
    print(f"  Duplicate Pathway Names:  {dup_names}")
    
    assert len(pathways) > 0, "Collection must not be empty"
    assert dup_ids == 0, "Duplicate pathway IDs detected"
    assert empty_sets == 0, "Empty gene sets detected"

print("\n=== RESOURCE AUDIT COMPLETED CLEANLY ===")
