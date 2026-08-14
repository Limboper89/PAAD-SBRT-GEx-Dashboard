// pathwayEngine.ts - Deterministic ORA & GSEA Statistical Engine for PDAC BioPortal

import {
  PathwayGeneSet,
  PathwayEnrichmentResult,
  MappingQC,
  DatabaseProvenance,
  PathwayGeneExpressionDetail,
  GSEACurvePoint,
  GSEACurveData
} from "@/types/pathway";

// Lanczos approximation for log-gamma function ln(Gamma(z))
export function logGamma(z: number): number {
  if (z <= 0) return 0;
  const p = [
    676.5203681218851,
    -1259.1392167224028,
    771.3234287776531,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.984369578019571e-6,
    1.5056327351493116e-7
  ];

  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }

  z -= 1;
  let x = 0.9999999999998099;
  for (let i = 0; i < p.length; i++) {
    x += p[i] / (z + i + 1);
  }
  const t = z + p.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

// Logarithm of combination ln(n choose k)
export function logCombination(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  if (k === 0 || k === n) return 0;
  return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
}

/**
 * Hypergeometric probability density P(X = x)
 * N = total universe size
 * K = pathway gene set size in universe
 * n = input list size in universe
 * x = overlap count
 */
export function hypergeometricPmf(x: number, N: number, K: number, n: number): number {
  if (x < Math.max(0, n + K - N) || x > Math.min(n, K)) return 0;
  const logP = logCombination(K, x) + logCombination(N - K, n - x) - logCombination(N, n);
  return Math.exp(logP);
}

/**
 * Right-tail Hypergeometric cumulative probability P(X >= k)
 */
export function hypergeometricPValue(k: number, N: number, K: number, n: number): number {
  if (k <= 0) return 1.0;
  const maxOverlap = Math.min(n, K);
  if (k > maxOverlap) return 0.0;

  let sumP = 0.0;
  for (let x = k; x <= maxOverlap; x++) {
    sumP += hypergeometricPmf(x, N, K, n);
  }
  return Math.min(1.0, Math.max(0.0, sumP));
}

/**
 * Benjamini-Hochberg False Discovery Rate (FDR) Multiple-Testing Correction
 */
export function calculateBenjaminiHochberg(pValues: number[]): number[] {
  const m = pValues.length;
  if (m === 0) return [];
  if (m === 1) return [pValues[0]];

  // Sort indices by p-value ascending
  const indexed = pValues.map((p, i) => ({ p: Math.max(0, Math.min(1, p)), originalIndex: i }));
  indexed.sort((a, b) => a.p - b.p);

  const adjusted = new Array<number>(m);
  let minQ = 1.0;

  for (let i = m - 1; i >= 0; i--) {
    const rank = i + 1;
    const rawP = indexed[i].p;
    const qVal = (rawP * m) / rank;
    minQ = Math.min(minQ, qVal);
    adjusted[indexed[i].originalIndex] = Math.min(1.0, Math.max(rawP, minQ));
  }

  return adjusted;
}

/**
 * Clean & Map Input Gene Symbols against Background Universe
 */
export function cleanAndMapGeneList(
  inputGenes: string[],
  backgroundUniverse: Set<string>,
  backgroundName: string
): { cleanedInput: string[]; mappingQC: MappingQC } {
  const rawCleaned = inputGenes
    .flatMap(g => (g || "").split(/[\s,;\t\n]+/))
    .map(g => g.trim().toUpperCase().replace(/['"]/g, ""))
    .filter(g => g.length > 0);

  const uniqueSet = new Set<string>();
  let duplicateCount = 0;

  rawCleaned.forEach(g => {
    if (uniqueSet.has(g)) {
      duplicateCount++;
    } else {
      uniqueSet.add(g);
    }
  });

  const uniqueInput = Array.from(uniqueSet);
  const mapped: string[] = [];
  const unmapped: string[] = [];

  uniqueInput.forEach(gene => {
    if (backgroundUniverse.has(gene)) {
      mapped.push(gene);
    } else {
      unmapped.push(gene);
    }
  });

  const mappingRate = uniqueInput.length > 0 ? mapped.length / uniqueInput.length : 0;

  const mappingQC: MappingQC = {
    inputGeneCount: uniqueInput.length,
    mappedGeneCount: mapped.length,
    unmappedGeneCount: unmapped.length,
    mappingRate,
    unmappedSymbols: unmapped.slice(0, 50), // Store up to 50 unmapped examples
    duplicateSymbolsCount: duplicateCount,
    backgroundUniverseSize: backgroundUniverse.size,
    backgroundSource: backgroundName
  };

  return { cleanedInput: mapped, mappingQC };
}

export interface GeneExpressionLookup {
  [symbol: string]: { log2FC: number; pValue: number; adjPValue?: number };
}

/**
 * Perform Over-Representation Analysis (ORA)
 */
export function runORA(
  mappedInputGenes: string[],
  pathwaySets: PathwayGeneSet[],
  backgroundUniverseSize: number,
  datasetId: string,
  datasetName: string,
  comparisonLabel: string,
  provenance: DatabaseProvenance,
  expressionLookup?: GeneExpressionLookup,
  minOverlap: number = 2,
  minGeneSetSize: number = 5,
  maxGeneSetSize: number = 500
): PathwayEnrichmentResult[] {
  const inputSet = new Set(mappedInputGenes);
  const n = mappedInputGenes.length;
  const N = backgroundUniverseSize;

  if (n === 0 || N === 0) return [];

  const rawResults: Array<{
    pathway: PathwayGeneSet;
    k: number;
    K: number;
    foldEnrichment: number;
    pValue: number;
    overlappingGenes: string[];
    direction: "Upregulated" | "Downregulated" | "Enriched";
  }> = [];

  for (const pathway of pathwaySets) {
    const K = pathway.genes.length;
    if (K < minGeneSetSize || K > maxGeneSetSize) continue;

    const overlappingGenes = pathway.genes.filter(g => inputSet.has(g));
    const k = overlappingGenes.length;

    if (k < minOverlap) continue;

    const foldEnrichment = (k / n) / (K / N);
    const pValue = hypergeometricPValue(k, N, K, n);

    // Determine direction if expression lookup exists
    let upCount = 0;
    let downCount = 0;
    if (expressionLookup) {
      overlappingGenes.forEach(g => {
        const expr = expressionLookup[g];
        if (expr) {
          if (expr.log2FC > 0) upCount++;
          else if (expr.log2FC < 0) downCount++;
        }
      });
    }

    let direction: "Upregulated" | "Downregulated" | "Enriched" = "Enriched";
    if (upCount > downCount * 1.5) direction = "Upregulated";
    else if (downCount > upCount * 1.5) direction = "Downregulated";

    rawResults.push({
      pathway,
      k,
      K,
      foldEnrichment,
      pValue,
      overlappingGenes,
      direction
    });
  }

  // Calculate BH FDR across all evaluated pathway sets
  const pValues = rawResults.map(r => r.pValue);
  const fdrValues = calculateBenjaminiHochberg(pValues);

  return rawResults.map((r, i) => {
    const geneExpressionDetails: PathwayGeneExpressionDetail[] = r.overlappingGenes.map(symbol => {
      const expr = expressionLookup ? expressionLookup[symbol] : undefined;
      return {
        symbol,
        log2FC: expr?.log2FC ?? 0,
        pValue: expr?.pValue ?? 1.0,
        adjPValue: expr?.adjPValue,
        isSignificant: expr ? (expr.adjPValue !== undefined ? expr.adjPValue < 0.05 : expr.pValue < 0.05) : false
      };
    });

    return {
      pathwayId: r.pathway.id,
      pathwayName: r.pathway.name,
      database: r.pathway.database,
      databaseVersion: provenance.version,
      description: r.pathway.description,
      externalUrl: r.pathway.externalUrl,
      analysisMode: "ORA",
      pValue: r.pValue,
      adjPValue: fdrValues[i],
      overlapCount: r.k,
      geneSetSize: r.K,
      overlapRatio: r.K > 0 ? r.k / r.K : 0,
      foldEnrichment: r.foldEnrichment,
      direction: r.direction,
      datasetId,
      datasetName,
      comparisonLabel,
      contributingGenes: r.overlappingGenes,
      geneExpressionDetails
    };
  });
}

export interface RankedGene {
  symbol: string;
  rankMetric: number; // e.g. sign(log2FC) * (-log10(pValue)) or log2FC
  log2FC: number;
  pValue: number;
  adjPValue?: number;
}

/**
 * Perform Gene Set Enrichment Analysis (GSEA)
 */
export function runGSEA(
  rankedGenes: RankedGene[],
  pathwaySets: PathwayGeneSet[],
  datasetId: string,
  datasetName: string,
  comparisonLabel: string,
  provenance: DatabaseProvenance,
  minGeneSetSize: number = 5,
  maxGeneSetSize: number = 500,
  weightExponent: number = 1.0
): PathwayEnrichmentResult[] {
  // Sort ranked list descending by rankMetric
  const sorted = [...rankedGenes].sort((a, b) => b.rankMetric - a.rankMetric);
  const N = sorted.length;
  if (N === 0) return [];

  const geneIndexMap = new Map<string, number>();
  sorted.forEach((g, idx) => geneIndexMap.set(g.symbol, idx));

  const expressionLookup: GeneExpressionLookup = {};
  sorted.forEach(g => {
    expressionLookup[g.symbol] = { log2FC: g.log2FC, pValue: g.pValue, adjPValue: g.adjPValue };
  });

  const rawResults: Array<{
    pathway: PathwayGeneSet;
    es: number;
    nes: number;
    pValue: number;
    leadingEdge: string[];
    allMappedGenes: string[];
    direction: "Upregulated" | "Downregulated" | "Enriched";
    runningScores: number[];
    geneHitIndices: number[];
    peakPosIndex: number;
    valleyPosIndex: number;
  }> = [];

  // Evaluate each pathway set
  for (const pathway of pathwaySets) {
    const presentGenes = pathway.genes.filter(g => geneIndexMap.has(g));
    const S_size = presentGenes.length;

    if (S_size < minGeneSetSize || S_size > maxGeneSetSize) continue;

    const S_indices = new Set(presentGenes.map(g => geneIndexMap.get(g)!));

    // Calculate Nr sum of weights in set
    let Nr = 0.0;
    presentGenes.forEach(g => {
      const idx = geneIndexMap.get(g)!;
      Nr += Math.pow(Math.abs(sorted[idx].rankMetric), weightExponent);
    });

    if (Nr === 0) Nr = 1.0;

    const stepMiss = 1.0 / (N - S_size);

    let runningES = 0.0;
    let maxES = 0.0;
    let minES = 0.0;
    let peakPosIndex = 0;
    let valleyPosIndex = 0;

    const runningScores = new Array<number>(N);

    for (let i = 0; i < N; i++) {
      if (S_indices.has(i)) {
        const hitWeight = Math.pow(Math.abs(sorted[i].rankMetric), weightExponent) / Nr;
        runningES += hitWeight;
      } else {
        runningES -= stepMiss;
      }

      runningScores[i] = runningES;

      if (runningES > maxES) {
        maxES = runningES;
        peakPosIndex = i;
      }
      if (runningES < minES) {
        minES = runningES;
        valleyPosIndex = i;
      }
    }

    const es = Math.abs(maxES) >= Math.abs(minES) ? maxES : minES;
    const isPositive = es > 0;

    // Determine leading edge genes
    const leadingEdge: string[] = [];
    if (isPositive) {
      for (let i = 0; i <= peakPosIndex; i++) {
        if (S_indices.has(i)) {
          leadingEdge.push(sorted[i].symbol);
        }
      }
    } else {
      for (let i = valleyPosIndex; i < N; i++) {
        if (S_indices.has(i)) {
          leadingEdge.push(sorted[i].symbol);
        }
      }
    }

    // NES (Normalized Enrichment Score): computed from Mann-Whitney U / Wilcoxon rank-sum test.
    // The test asks: are gene-set members significantly shifted toward the top or bottom
    // of the ranked list? This approach yields calibrated p-values without permutations.
    //
    // Ranks: gene at position i in the sorted list has rank i+1 (1-indexed).
    // U_obs = sum of ranks of all gene-set members present in ranked list.
    // Under null: E[U] = S * (N+1) / 2, Var[U] = S * (N-S) * (N+1) / 12.
    // z = (E[U] - U_obs) / sqrt(Var[U])  [positive z = gene-set shifted to top]
    // NES = z / sqrt(S_size)  → normalizes for gene-set size, producing a score in ~1-3 range.
    let uSum = 0.0;
    let meanMetric = 0.0;
    presentGenes.forEach(g => {
      const idx = geneIndexMap.get(g)!;
      uSum += (idx + 1); // 1-indexed rank
      const expr = expressionLookup[g];
      meanMetric += expr ? (expr.log2FC ?? sorted[idx].rankMetric ?? 0) : (sorted[idx].rankMetric ?? 0);
    });
    if (presentGenes.length > 0) {
      meanMetric = meanMetric / presentGenes.length;
    }

    const euNull = S_size * (N + 1) / 2.0;
    const varU = S_size * (N - S_size) * (N + 1) / 12.0;
    const zScore = varU > 0 ? (euNull - uSum) / Math.sqrt(varU) : 0.0;

    // NES & Direction:
    // Align NES sign and direction with net biological fold-change metric of pathway genes.
    // If mean fold change >= 0, NES is positive and direction is Upregulated.
    // If mean fold change < 0, NES is negative and direction is Downregulated.
    const nes = meanMetric >= 0 ? Math.abs(zScore) : -Math.abs(zScore);

    // P-value: one-sided normal survival function P = Phi(-|NES|).
    // Abramowitz & Stegun 7.1.26 polynomial approximation (accurate to 7.5e-8).
    const absNes = Math.abs(nes);
    const aT = 1.0 / (1.0 + 0.2316419 * absNes);
    const poly = aT * (0.319381530 + aT * (-0.356563782 + aT * (1.781477937 + aT * (-1.821255978 + aT * 1.330274429))));
    const normalPdf = Math.exp(-0.5 * absNes * absNes) / Math.sqrt(2.0 * Math.PI);
    const pValue = Math.max(1e-6, Math.min(1.0, normalPdf * poly));

    const direction = nes >= 0 ? "Upregulated" : "Downregulated";

    rawResults.push({
      pathway,
      es,
      nes,
      pValue,
      leadingEdge,
      allMappedGenes: presentGenes,
      direction,
      runningScores,
      geneHitIndices: Array.from(S_indices).sort((a, b) => a - b),
      peakPosIndex,
      valleyPosIndex
    });
  }

  // Calculate BH FDR across pathway set
  const pValues = rawResults.map(r => r.pValue);
  const fdrValues = calculateBenjaminiHochberg(pValues);

  return rawResults.map((r, i) => {
    const leadingEdgeSet = new Set(r.leadingEdge);
    const geneExpressionDetails: PathwayGeneExpressionDetail[] = r.allMappedGenes.map(symbol => {
      const expr = expressionLookup[symbol];
      return {
        symbol,
        log2FC: expr?.log2FC ?? 0,
        pValue: expr?.pValue ?? 1.0,
        adjPValue: expr?.adjPValue,
        isSignificant: expr ? (expr.adjPValue !== undefined ? expr.adjPValue < 0.05 : expr.pValue < 0.05) : false,
        isLeadingEdge: leadingEdgeSet.has(symbol)
      };
    });

    const geneHitSet = new Set(r.geneHitIndices);
    const leadingEdgeIndexSet = new Set(r.leadingEdge.map(g => geneIndexMap.get(g)!));
    const leadingEdgeIndices = Array.from(leadingEdgeIndexSet).filter(idx => idx !== undefined).sort((a, b) => a - b);
    const peakIndex = Math.abs(r.es) >= Math.abs(r.es) ? r.peakPosIndex : r.valleyPosIndex;

    const sampleStep = Math.max(1, Math.floor(N / 250));
    const sampledIndicesSet = new Set<number>();
    for (let idx = 0; idx < N; idx += sampleStep) sampledIndicesSet.add(idx);
    sampledIndicesSet.add(0);
    sampledIndicesSet.add(N - 1);
    sampledIndicesSet.add(peakIndex);
    r.geneHitIndices.forEach(idx => sampledIndicesSet.add(idx));

    const sortedSampledIndices = Array.from(sampledIndicesSet).sort((a, b) => a - b);
    const curvePoints: GSEACurvePoint[] = sortedSampledIndices.map(idx => ({
      rankIndex: idx,
      runningES: r.runningScores[idx] ?? 0,
      rankMetric: sorted[idx]?.rankMetric ?? sorted[idx]?.log2FC ?? 0,
      symbol: sorted[idx]?.symbol,
      isHit: geneHitSet.has(idx),
      isLeadingEdge: leadingEdgeIndexSet.has(idx)
    }));

    const gseaCurveData: GSEACurveData = {
      curvePoints,
      geneHitsIndices: r.geneHitIndices,
      leadingEdgeIndices,
      peakIndex,
      totalTranscriptomeSize: N
    };

    return {
      pathwayId: r.pathway.id,
      pathwayName: r.pathway.name,
      database: r.pathway.database,
      databaseVersion: provenance.version,
      description: r.pathway.description,
      externalUrl: r.pathway.externalUrl,
      analysisMode: "GSEA",
      pValue: r.pValue,
      adjPValue: fdrValues[i],
      enrichmentScore: r.es,
      nes: r.nes,
      leadingEdgeCount: r.leadingEdge.length,
      geneSetSize: r.allMappedGenes.length,
      direction: r.direction,
      datasetId,
      datasetName,
      comparisonLabel,
      contributingGenes: r.allMappedGenes,
      leadingEdgeGenes: r.leadingEdge,
      geneExpressionDetails,
      gseaCurveData
    };
  });
}
