// src/utils/singleNucleusStats.ts
// Patient-Aware Single-Nucleus Pseudobulk Statistics Engine for GSE202051

export interface CellMeta {
  id: string;
  x: number;
  y: number;
  pid: string;
  broad_celltype: string;
  level1: string;
  level2: string;
  level3: string;
  treatment: string;
  treatment_group: string;
  response: string;
}

export interface PatientPseudobulkResult {
  cellType: string;
  cellTypeLevel: "broad" | "level2";
  
  // Patient sample sizes
  naivePatientCount: number;
  treatedPatientCount: number;
  
  // Nucleus counts
  naiveNucleusCount: number;
  treatedNucleusCount: number;
  
  // % Expressing nuclei
  naivePctExpressing: number;
  treatedPctExpressing: number;
  
  // Patient pseudobulk means & SDs
  naiveMean: number;
  naiveSD: number;
  naiveSE: number;
  treatedMean: number;
  treatedSD: number;
  treatedSE: number;
  
  // Effect sizes & differences
  deltaPseudobulk: number;
  log2FC: number;
  cohensD: number;
  ci95Lower: number;
  ci95Upper: number;
  
  // Statistical hypothesis tests
  tStatistic: number;
  pValueWelch: number;
  pValueMannWhitney: number;
  qValue: number; // Benjamini-Hochberg FDR
  
  // Interaction & Compartment flags
  isSignificant: boolean;
  direction: "UP" | "DOWN" | "NS";
  compartmentTrend: string;
}

/**
 * Standard Normal CDF approximation (Abramowitz & Stegun)
 */
function normalCDF(x: number): number {
  const b1 = 0.319381530;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;
  const p = 0.2316419;
  const c = 0.39894228;

  if (x >= 0) {
    const t = 1.0 / (1.0 + p * x);
    return 1.0 - c * Math.exp(-x * x / 2.0) * t * (t * (t * (t * (t * b5 + b4) + b3) + b2) + b1);
  } else {
    const t = 1.0 / (1.0 - p * x);
    return c * Math.exp(-x * x / 2.0) * t * (t * (t * (t * (t * b5 + b4) + b3) + b2) + b1);
  }
}

/**
 * Student's t-distribution two-tailed p-value approximation via Welch-Satterthwaite
 */
function tDistTwoTailedPValue(t: number, df: number): number {
  if (df <= 0 || !Number.isFinite(df)) return 1.0;
  const absT = Math.abs(t);
  if (absT === 0) return 1.0;
  
  // For df >= 30, normal approximation is very accurate
  if (df >= 30) {
    return 2 * (1.0 - normalCDF(absT));
  }
  
  // High-precision approximation for t-distribution tail
  const z = absT * (1 - 1 / (4 * df)) / Math.sqrt(1 + absT * absT / (2 * df));
  const p = 2 * (1.0 - normalCDF(z));
  return Math.max(1e-15, Math.min(1.0, p));
}

/**
 * Non-parametric Mann-Whitney U test p-value calculation (two-tailed)
 */
export function calculateMannWhitneyU(sample1: number[], sample2: number[]): number {
  const n1 = sample1.length;
  const n2 = sample2.length;
  if (n1 === 0 || n2 === 0) return 1.0;

  // Combine and rank
  const combined = [
    ...sample1.map(v => ({ val: v, group: 1 })),
    ...sample2.map(v => ({ val: v, group: 2 }))
  ].sort((a, b) => a.val - b.val);

  // Assign average ranks for ties
  const ranks: number[] = new Array(combined.length);
  let i = 0;
  while (i < combined.length) {
    let j = i;
    while (j < combined.length - 1 && combined[j + 1].val === combined[j].val) {
      j++;
    }
    const avgRank = (i + 1 + j + 1) / 2;
    for (let k = i; k <= j; k++) {
      ranks[k] = avgRank;
    }
    i = j + 1;
  }

  let rankSum1 = 0;
  for (let idx = 0; idx < combined.length; idx++) {
    if (combined[idx].group === 1) {
      rankSum1 += ranks[idx];
    }
  }

  const u1 = rankSum1 - (n1 * (n1 + 1)) / 2;
  const u2 = n1 * n2 - u1;
  const u = Math.min(u1, u2);

  const meanU = (n1 * n2) / 2;
  // Tie correction for exact variance
  const N = n1 + n2;
  let tieCorrection = 0;
  let ti = 0;
  while (ti < combined.length) {
    let tj = ti;
    while (tj < combined.length - 1 && combined[tj + 1].val === combined[tj].val) tj++;
    const tCount = tj - ti + 1;
    if (tCount > 1) tieCorrection += tCount * tCount * tCount - tCount;
    ti = tj + 1;
  }
  const varU = ((n1 * n2) / 12) * ((N + 1) - tieCorrection / (N * (N - 1) || 1));
  const sigmaU = Math.sqrt(Math.max(0, varU));
  if (sigmaU === 0) return 1.0;

  const z = (u - meanU) / sigmaU;
  return Math.min(1.0, Math.max(1e-15, 2 * normalCDF(z)));
}

/**
 * Paired Wilcoxon signed-rank test (two-tailed, exact for n <= 20, normal approx for n > 20)
 */
export function calculateWilcoxonSignedRank(a: number[], b: number[]): number {
  const diffs: number[] = [];
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const d = a[i] - b[i];
    if (Math.abs(d) > 1e-12) diffs.push(d);
  }
  const n = diffs.length;
  if (n < 2) return 1.0;

  const absSorted = diffs
    .map(d => ({ abs: Math.abs(d), sign: d > 0 ? 1 : -1 }))
    .sort((x, y) => x.abs - y.abs);

  const ranks: number[] = new Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j < n - 1 && Math.abs(absSorted[j + 1].abs - absSorted[j].abs) < 1e-12) j++;
    const avgRank = (i + 1 + j + 1) / 2;
    for (let k = i; k <= j; k++) ranks[k] = avgRank;
    i = j + 1;
  }

  let wPos = 0;
  let wNeg = 0;
  for (let k = 0; k < n; k++) {
    if (absSorted[k].sign > 0) wPos += ranks[k];
    else wNeg += ranks[k];
  }
  const wMin = Math.min(wPos, wNeg);

  // Exact permutation p-value when n <= 18 and no ties (fast: 2^16 = 65,536)
  const hasTies = ranks.some((r, idx) => idx > 0 && r === ranks[idx - 1]);
  if (n <= 18 && !hasTies) {
    const total = 1 << n;
    let extreme = 0;
    for (let mask = 0; mask < total; mask++) {
      let s = 0;
      for (let bit = 0; bit < n; bit++) {
        if ((mask >> bit) & 1) s += bit + 1;
      }
      if (s <= wMin + 1e-9) extreme++;
    }
    return Math.min(1.0, (2 * extreme) / total);
  }

  const meanW = (n * (n + 1)) / 4;
  const sdW = Math.sqrt((n * (n + 1) * (2 * n + 1)) / 24);
  if (sdW === 0) return 1.0;
  const z = (wMin - meanW + 0.5) / sdW;
  return Math.min(1.0, Math.max(1e-15, 2 * normalCDF(z)));
}

/**
 * Calculate Benjamini-Hochberg FDR correction
 */
export function applyBenjaminiHochberg(pValues: number[]): number[] {
  const n = pValues.length;
  if (n === 0) return [];
  
  const indexed = pValues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const qValues = new Array(n);
  
  let minQ = 1.0;
  for (let rank = n; rank >= 1; rank--) {
    const item = indexed[rank - 1];
    const q = (item.p * n) / rank;
    minQ = Math.min(minQ, q);
    qValues[item.i] = Math.min(1.0, Math.max(0.0, minQ));
  }
  
  return qValues;
}

/**
 * Computes patient-level pseudobulk comparison across all cell types for a selected gene expression vector
 */
export function computePatientPseudobulk(
  exprVector: Float32Array,
  metadata: CellMeta[],
  cellTypeKey: "broad_celltype" | "level2" = "broad_celltype",
  treatedSubgroupFilter?: string // optional filter for treated patients e.g. "CRT", "CRTl", "RESP_MOD"
): PatientPseudobulkResult[] {
  if (!exprVector || exprVector.length === 0 || !metadata || metadata.length === 0) {
    return [];
  }

  // 1. Group expression values by (cellType, patientId, treatmentGroup)
  const cellTypePatients = new Map<string, {
    naivePatients: Map<string, number[]>;
    treatedPatients: Map<string, number[]>;
    naiveNucleiAll: number[];
    treatedNucleiAll: number[];
  }>();

  const isDirectResponseMode =
    treatedSubgroupFilter === "RESP_MOD_VS_POOR" ||
    treatedSubgroupFilter === "RESP_MOD_VS_NONMOD";

  for (let i = 0; i < metadata.length; i++) {
    const cell = metadata[i];
    const expr = exprVector[i] || 0;
    const cType = cell[cellTypeKey] || "Unknown";
    const pid = cell.pid || "";
    
    // Robust Naive vs. Treated discrimination (pid U1-U18 vs T1-T25)
    const isNaive = pid.startsWith("U") || cell.treatment === "Untreated";
    const isTreated = !isNaive && (pid.startsWith("T") || (cell.treatment_group || "").toLowerCase().includes("treated"));

    let assignToGroupA = false;
    let assignToGroupB = false;

    if (isDirectResponseMode) {
      if (!isTreated) continue;
      const resp = (cell.response || "").toLowerCase();
      if (treatedSubgroupFilter === "RESP_MOD_VS_POOR") {
        if (resp.includes("moderate")) assignToGroupA = true;
        else if (resp.includes("poor")) assignToGroupB = true;
        else continue;
      } else {
        // RESP_MOD_VS_NONMOD: Moderate (Responder) vs Minimal + Poor (Non-Responder)
        if (resp.includes("moderate")) assignToGroupA = true;
        else if (resp.includes("minimal") || resp.includes("poor")) assignToGroupB = true;
        else continue;
      }
    } else {
      // Subgroup filtering for Treated patients vs Treatment-Naïve baseline
      if (treatedSubgroupFilter && isTreated) {
        if (treatedSubgroupFilter.startsWith("RESP_")) {
          const respKeyword = treatedSubgroupFilter.replace("RESP_", "").toLowerCase();
          if (!(cell.response || "").toLowerCase().includes(respKeyword)) {
            continue;
          }
        } else if (treatedSubgroupFilter === "RT_CRT") {
          const tr = (cell.treatment || "").trim();
          if (tr !== "CRT" && tr !== "RT") {
            continue;
          }
        } else if (treatedSubgroupFilter === "CRTn") {
          const tr = (cell.treatment || "").trim();
          if (tr !== "CRTn" && tr !== "CRTln") {
            continue;
          }
        } else {
          if ((cell.treatment || "").trim() !== treatedSubgroupFilter.trim()) {
            continue;
          }
        }
      }
      assignToGroupA = isNaive;
      assignToGroupB = isTreated;
    }

    if (!cellTypePatients.has(cType)) {
      cellTypePatients.set(cType, {
        naivePatients: new Map(),
        treatedPatients: new Map(),
        naiveNucleiAll: [],
        treatedNucleiAll: []
      });
    }

    const groupData = cellTypePatients.get(cType)!;
    if (assignToGroupA) {
      groupData.naiveNucleiAll.push(expr);
      if (!groupData.naivePatients.has(pid)) {
        groupData.naivePatients.set(pid, []);
      }
      groupData.naivePatients.get(pid)!.push(expr);
    } else if (assignToGroupB) {
      groupData.treatedNucleiAll.push(expr);
      if (!groupData.treatedPatients.has(pid)) {
        groupData.treatedPatients.set(pid, []);
      }
      groupData.treatedPatients.get(pid)!.push(expr);
    }
  }

  const results: PatientPseudobulkResult[] = [];

  // 2. Compute pseudobulk means for each patient in each cell type
  cellTypePatients.forEach((groupData, cType) => {
    // Patient pseudobulk means
    const naivePtMeans: number[] = [];
    groupData.naivePatients.forEach(values => {
      if (values.length > 0) {
        naivePtMeans.push(values.reduce((a, b) => a + b, 0) / values.length);
      }
    });

    const treatedPtMeans: number[] = [];
    groupData.treatedPatients.forEach(values => {
      if (values.length > 0) {
        treatedPtMeans.push(values.reduce((a, b) => a + b, 0) / values.length);
      }
    });

    const nNaive = naivePtMeans.length;
    const nTreated = treatedPtMeans.length;

    // We require at least 2 patients in each group for pseudobulk comparison
    if (nNaive < 2 || nTreated < 2) return;

    // Means & SDs
    const meanNaive = naivePtMeans.reduce((a, b) => a + b, 0) / nNaive;
    const meanTreated = treatedPtMeans.reduce((a, b) => a + b, 0) / nTreated;

    const varNaive = nNaive > 1 
      ? naivePtMeans.map(x => Math.pow(x - meanNaive, 2)).reduce((a, b) => a + b, 0) / (nNaive - 1)
      : 0;
    const varTreated = nTreated > 1
      ? treatedPtMeans.map(x => Math.pow(x - meanTreated, 2)).reduce((a, b) => a + b, 0) / (nTreated - 1)
      : 0;

    const sdNaive = Math.sqrt(varNaive);
    const sdTreated = Math.sqrt(varTreated);
    const seNaive = sdNaive / Math.sqrt(nNaive);
    const seTreated = sdTreated / Math.sqrt(nTreated);

    // Differences & Effect sizes
    const delta = meanTreated - meanNaive;
    const log2FC = Math.log2((meanTreated + 0.01) / (meanNaive + 0.01));

    // Pooled SD for Cohen's d
    const pooledSD = Math.sqrt(((nNaive - 1) * varNaive + (nTreated - 1) * varTreated) / (nNaive + nTreated - 2)) || 1e-4;
    const cohensD = delta / pooledSD;

    // 95% Confidence Interval for difference of means
    const seDiff = Math.sqrt(varNaive / nNaive + varTreated / nTreated);
    const ci95Lower = delta - 1.96 * seDiff;
    const ci95Upper = delta + 1.96 * seDiff;

    // Welch's t-test
    const tStat = seDiff > 0 ? delta / seDiff : 0;
    const dfWelch = seDiff > 0 
      ? Math.pow(varNaive / nNaive + varTreated / nTreated, 2) / 
        (Math.pow(varNaive / nNaive, 2) / (nNaive - 1) + Math.pow(varTreated / nTreated, 2) / (nTreated - 1))
      : 1;
    const pWelch = tDistTwoTailedPValue(tStat, dfWelch);

    // Mann-Whitney U test (Nonparametric sensitivity)
    const pMannWhitney = calculateMannWhitneyU(treatedPtMeans, naivePtMeans);

    // % Expressing nuclei
    const nNaiveNuc = groupData.naiveNucleiAll.length;
    const nTreatNuc = groupData.treatedNucleiAll.length;
    const naivePct = nNaiveNuc > 0 ? (groupData.naiveNucleiAll.filter(v => v > 0).length / nNaiveNuc) * 100 : 0;
    const treatPct = nTreatNuc > 0 ? (groupData.treatedNucleiAll.filter(v => v > 0).length / nTreatNuc) * 100 : 0;

    results.push({
      cellType: cType,
      cellTypeLevel: cellTypeKey === "broad_celltype" ? "broad" : "level2",
      naivePatientCount: nNaive,
      treatedPatientCount: nTreated,
      naiveNucleusCount: nNaiveNuc,
      treatedNucleusCount: nTreatNuc,
      naivePctExpressing: naivePct,
      treatedPctExpressing: treatPct,
      naiveMean: meanNaive,
      naiveSD: sdNaive,
      naiveSE: seNaive,
      treatedMean: meanTreated,
      treatedSD: sdTreated,
      treatedSE: seTreated,
      deltaPseudobulk: delta,
      log2FC,
      cohensD,
      ci95Lower,
      ci95Upper,
      tStatistic: tStat,
      pValueWelch: pWelch,
      pValueMannWhitney: pMannWhitney,
      qValue: 1.0,
      isSignificant: false,
      direction: delta > 0 ? "UP" : (delta < 0 ? "DOWN" : "NS"),
      compartmentTrend: Math.abs(delta) > 0.15 ? (delta > 0 ? "Enriched in Treated" : "Depleted in Treated") : "Stable"
    });
  });

  // 3. Compute FDR q-values across all cell types
  const pVals = results.map(r => r.pValueWelch);
  const qVals = applyBenjaminiHochberg(pVals);
  results.forEach((r, idx) => {
    r.qValue = qVals[idx];
    r.isSignificant = r.qValue < 0.05;
    if (!r.isSignificant) {
      r.direction = "NS";
    }
  });

  // Sort by statistical significance (smallest p-value first)
  results.sort((a, b) => a.pValueWelch - b.pValueWelch);

  return results;
}

// ─── Multi-Gene Pathologic Response (Moderate vs. Minimal vs. Poor) ──────────

export interface ResponseGroupSummary {
  patientCount: number;
  nucleusCount: number;
  mean: number;
  se: number;
  pctExpressing: number;
  patientValues: { pid: string; mean: number; nNuclei: number }[];
}

export interface PathologicResponseGeneRow {
  gene: string;
  naive: ResponseGroupSummary;
  moderate: ResponseGroupSummary;
  minimal: ResponseGroupSummary;
  poor: ResponseGroupSummary;
  poorVsModLog2FC: number;
  poorVsModPValue: number;
  poorVsModWelchP: number;
  rowMax: number;
}

function summarizePatientGroup(
  patientMap: Map<string, number[]>,
  minNucleiPerPatient: number
): ResponseGroupSummary {
  const patientValues: { pid: string; mean: number; nNuclei: number }[] = [];
  let totalNuc = 0;
  let posNuc = 0;

  patientMap.forEach((vals, pid) => {
    if (vals.length >= minNucleiPerPatient) {
      const m = vals.reduce((a, b) => a + b, 0) / vals.length;
      patientValues.push({ pid, mean: m, nNuclei: vals.length });
      totalNuc += vals.length;
      for (let i = 0; i < vals.length; i++) {
        if (vals[i] > 0) posNuc++;
      }
    }
  });

  const n = patientValues.length;
  if (n === 0) {
    return { patientCount: 0, nucleusCount: 0, mean: 0, se: 0, pctExpressing: 0, patientValues: [] };
  }
  const mean = patientValues.reduce((s, p) => s + p.mean, 0) / n;
  const variance = n > 1
    ? patientValues.reduce((s, p) => s + Math.pow(p.mean - mean, 2), 0) / (n - 1)
    : 0;
  const se = Math.sqrt(variance) / Math.sqrt(n);
  const pctExpressing = totalNuc > 0 ? (posNuc / totalNuc) * 100 : 0;

  return { patientCount: n, nucleusCount: totalNuc, mean, se, pctExpressing, patientValues };
}

/**
 * Computes patient-level pseudobulk means across Treatment-Naïve (baseline) and
 * Moderate, Minimal, and Poor pathologic response groups inside Neoadjuvant-treated
 * GSE202051 patients, with an optional treatment regimen predicate.
 */
export function computePathologicResponseRow(
  gene: string,
  exprVector: Float32Array,
  metadata: CellMeta[],
  compartmentFilter: (cell: CellMeta) => boolean,
  minNucleiPerPatient: number = 5,
  treatedRegimenFilter?: (cell: CellMeta) => boolean
): PathologicResponseGeneRow {
  const naiveMap = new Map<string, number[]>();
  const modMap = new Map<string, number[]>();
  const minMap = new Map<string, number[]>();
  const poorMap = new Map<string, number[]>();

  for (let i = 0; i < metadata.length; i++) {
    const cell = metadata[i];
    if (!compartmentFilter(cell)) continue;
    const pid = cell.pid || "";
    const isNaive = pid.startsWith("U") || cell.treatment === "Untreated";
    const expr = exprVector[i] || 0;

    if (isNaive) {
      if (!naiveMap.has(pid)) naiveMap.set(pid, []);
      naiveMap.get(pid)!.push(expr);
      continue;
    }

    if (treatedRegimenFilter && !treatedRegimenFilter(cell)) continue;

    const resp = (cell.response || "").toLowerCase();
    let target: Map<string, number[]> | null = null;
    if (resp.includes("moderate")) target = modMap;
    else if (resp.includes("minimal")) target = minMap;
    else if (resp.includes("poor")) target = poorMap;

    if (!target) continue;
    if (!target.has(pid)) target.set(pid, []);
    target.get(pid)!.push(expr);
  }

  const naive = summarizePatientGroup(naiveMap, minNucleiPerPatient);
  const moderate = summarizePatientGroup(modMap, minNucleiPerPatient);
  const minimal = summarizePatientGroup(minMap, minNucleiPerPatient);
  const poor = summarizePatientGroup(poorMap, minNucleiPerPatient);

  const modVals = moderate.patientValues.map(p => p.mean);
  const poorVals = poor.patientValues.map(p => p.mean);
  const poorVsModPValue = (modVals.length >= 2 && poorVals.length >= 2)
    ? calculateMannWhitneyU(poorVals, modVals)
    : 1.0;

  // Welch sensitivity p-value
  let poorVsModWelchP = 1.0;
  if (modVals.length >= 2 && poorVals.length >= 2) {
    const varM = modVals.reduce((s, v) => s + Math.pow(v - moderate.mean, 2), 0) / (modVals.length - 1);
    const varP = poorVals.reduce((s, v) => s + Math.pow(v - poor.mean, 2), 0) / (poorVals.length - 1);
    const seDiff = Math.sqrt(varM / modVals.length + varP / poorVals.length);
    if (seDiff > 1e-9) {
      const t = (poor.mean - moderate.mean) / seDiff;
      const df = Math.pow(varM / modVals.length + varP / poorVals.length, 2) /
        (Math.pow(varM / modVals.length, 2) / (modVals.length - 1) +
         Math.pow(varP / poorVals.length, 2) / (poorVals.length - 1));
      poorVsModWelchP = tDistTwoTailedPValue(t, df);
    }
  }

  const eps = 0.005;
  const poorVsModLog2FC = Math.log2((poor.mean + eps) / (moderate.mean + eps));
  const rowMax = Math.max(moderate.mean, minimal.mean, poor.mean, 1e-6);

  return {
    gene,
    naive,
    moderate,
    minimal,
    poor,
    poorVsModLog2FC,
    poorVsModPValue,
    poorVsModWelchP,
    rowMax,
  };
}

// ─── Paired Within-Patient Malignant vs. Normal Ductal (Eliminates Acinar Bias) ──

export interface PairedMalignantDuctalRow {
  gene: string;
  pairedPatientCount: number;
  ductalMean: number;
  malignantMean: number;
  log2FC: number;
  upregulatedPatients: number;
  pValueWilcoxon: number;
  patientPairs: { pid: string; ductal: number; malignant: number }[];
}

export function computePairedMalignantVsDuctal(
  gene: string,
  exprVector: Float32Array,
  metadata: CellMeta[],
  minNucleiPerCompartment: number = 5,
  cellFilter?: (cell: CellMeta) => boolean
): PairedMalignantDuctalRow {
  const malMap = new Map<string, number[]>();
  const ductMap = new Map<string, number[]>();

  for (let i = 0; i < metadata.length; i++) {
    const cell = metadata[i];
    if (cellFilter && !cellFilter(cell)) continue;
    const pid = cell.pid || "";
    const expr = exprVector[i] || 0;
    if (cell.level2 === "Malignant") {
      if (!malMap.has(pid)) malMap.set(pid, []);
      malMap.get(pid)!.push(expr);
    } else if (cell.level2 === "Ductal") {
      if (!ductMap.has(pid)) ductMap.set(pid, []);
      ductMap.get(pid)!.push(expr);
    }
  }

  const patientPairs: { pid: string; ductal: number; malignant: number }[] = [];
  malMap.forEach((mVals, pid) => {
    const dVals = ductMap.get(pid);
    if (dVals && mVals.length >= minNucleiPerCompartment && dVals.length >= minNucleiPerCompartment) {
      const mMean = mVals.reduce((a, b) => a + b, 0) / mVals.length;
      const dMean = dVals.reduce((a, b) => a + b, 0) / dVals.length;
      patientPairs.push({ pid, ductal: dMean, malignant: mMean });
    }
  });

  const n = patientPairs.length;
  if (n === 0) {
    return {
      gene,
      pairedPatientCount: 0,
      ductalMean: 0,
      malignantMean: 0,
      log2FC: 0,
      upregulatedPatients: 0,
      pValueWilcoxon: 1.0,
      patientPairs: [],
    };
  }

  const ductVals = patientPairs.map(p => p.ductal);
  const malVals = patientPairs.map(p => p.malignant);
  const ductalMean = ductVals.reduce((a, b) => a + b, 0) / n;
  const malignantMean = malVals.reduce((a, b) => a + b, 0) / n;
  const upregulatedPatients = patientPairs.filter(p => p.malignant > p.ductal).length;
  const log2FC = Math.log2((malignantMean + 0.005) / (ductalMean + 0.005));
  const pValueWilcoxon = calculateWilcoxonSignedRank(malVals, ductVals);

  return {
    gene,
    pairedPatientCount: n,
    ductalMean,
    malignantMean,
    log2FC,
    upregulatedPatients,
    pValueWilcoxon,
    patientPairs,
  };
}
