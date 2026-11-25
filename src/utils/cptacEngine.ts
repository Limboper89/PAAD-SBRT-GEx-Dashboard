import {
  computeKaplanMeier,
  computeLogRankAndHR,
  findOptimalCutpoint,
  SurvivalAnalysisResult,
  PatientSurvivalRecord,
  RiskTableRow,
} from "@/utils/survivalEngine";
import { CptacSurvivalSample, CoxPhResult } from "@/types/cptac";

export const PROT_SAMPLE_COLS = 215; // 140 Tumors + 75 NATs
export const PROT_TUMOR_COUNT = 140;
export const PROT_NAT_COUNT = 75;

export const MRNA_SAMPLE_COLS = 161; // 140 Tumors + 21 NATs
export const MRNA_TUMOR_COUNT = 140;
export const MRNA_NAT_COUNT = 21;

export const CURATED_20_NRF2_PANEL = [
  "NFE2L2", "KEAP1", "NQO1", "HMOX1", "GCLC",
  "GCLM", "GSS", "GSR", "TXNRD1", "TXN",
  "PRDX1", "SRXN1", "G6PD", "PGD", "FTL",
  "FTH1", "GPX4", "SLC7A11", "SLC3A2", "AIFM2",
];

/**
 * Slice a row from IEEE 754 Float32 row-major matrix ArrayBuffer.
 */
export function sliceMatrixRow(
  buffer: ArrayBuffer | null,
  rowIndex: number | null | undefined,
  numCols: number
): number[] | null {
  if (!buffer || rowIndex === null || rowIndex === undefined || rowIndex < 0) {
    return null;
  }
  const byteOffset = rowIndex * numCols * 4;
  if (byteOffset + numCols * 4 > buffer.byteLength) return null;
  return Array.from(new Float32Array(buffer, byteOffset, numCols));
}

function logGamma(z: number): number {
  const g = 7;
  const p = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let x = p[0];
  for (let i = 1; i < g + 2; i++) x += p[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function betainc(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const logBt = logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x);
  const bt = Math.exp(logBt);
  const cf = (xVal: number, aVal: number, bVal: number) => {
    const fpmin = 1e-300;
    let c = 1;
    let d = 1 - ((aVal + bVal) * xVal) / (aVal + 1);
    if (Math.abs(d) < fpmin) d = fpmin;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= 200; m++) {
      const m2 = 2 * m;
      let aa = (m * (bVal - m) * xVal) / ((aVal + m2 - 1) * (aVal + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < fpmin) d = fpmin;
      c = 1 + aa / c;
      if (Math.abs(c) < fpmin) c = fpmin;
      d = 1 / d;
      h *= d * c;
      aa = (-(aVal + m) * (aVal + bVal + m) * xVal) / ((aVal + m2) * (aVal + m2 + 1));
      d = 1 + aa * d;
      if (Math.abs(d) < fpmin) d = fpmin;
      c = 1 + aa / c;
      if (Math.abs(c) < fpmin) c = fpmin;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 1e-12) break;
    }
    return h;
  };
  if (x < (a + 1) / (a + b + 2)) {
    return (bt * cf(x, a, b)) / a;
  }
  return 1 - (bt * cf(1 - x, b, a)) / b;
}

export function erfcApprox(x: number): number {
  const z = Math.abs(x);
  const t = 1.0 / (1.0 + 0.5 * z);
  const ans =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t *
                              (-1.13520398 +
                                t *
                                  (1.48851587 +
                                    t * (-0.82215223 + t * 0.17087277))))))))
    );
  return x >= 0 ? ans : 2.0 - ans;
}

export function correlationPValue(r: number, n: number): number {
  if (n <= 2 || !Number.isFinite(r)) return 1.0;
  const absR = Math.min(Math.abs(r), 0.9999999999);
  const df = n - 2;
  const t2 = (absR * absR * df) / (1 - absR * absR);
  const x = df / (df + t2);
  return Math.max(Math.min(betainc(x, df / 2, 0.5), 1.0), 1e-300);
}

export function pearsonAndSpearman(
  xRaw: number[],
  yRaw: number[]
): {
  n: number;
  r: number;
  rP: number;
  rho: number;
  rhoP: number;
  slope: number;
  intercept: number;
} {
  const xs: number[] = [];
  const ys: number[] = [];
  const len = Math.min(xRaw.length, yRaw.length);
  for (let i = 0; i < len; i++) {
    const xv = xRaw[i];
    const yv = yRaw[i];
    if (Number.isFinite(xv) && Number.isFinite(yv)) {
      xs.push(xv);
      ys.push(yv);
    }
  }
  const n = xs.length;
  if (n < 3) {
    return { n, r: 0, rP: 1, rho: 0, rhoP: 1, slope: 0, intercept: 0 };
  }

  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const r = denX > 0 && denY > 0 ? num / Math.sqrt(denX * denY) : 0;
  const slope = denX > 0 ? num / denX : 0;
  const intercept = meanY - slope * meanX;
  const rP = correlationPValue(r, n);

  const getRanks = (arr: number[]) => {
    const sorted = arr.map((val, idx) => ({ val, idx })).sort((a, b) => a.val - b.val);
    const ranks = new Array<number>(n);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j < n && sorted[j].val === sorted[i].val) j++;
      const avgRank = (i + 1 + j) / 2;
      for (let k = i; k < j; k++) ranks[sorted[k].idx] = avgRank;
      i = j;
    }
    return ranks;
  };

  const rx = getRanks(xs);
  const ry = getRanks(ys);
  const mRx = rx.reduce((a, b) => a + b, 0) / n;
  const mRy = ry.reduce((a, b) => a + b, 0) / n;
  let sNum = 0;
  let sDenX = 0;
  let sDenY = 0;
  for (let i = 0; i < n; i++) {
    const dx = rx[i] - mRx;
    const dy = ry[i] - mRy;
    sNum += dx * dy;
    sDenX += dx * dx;
    sDenY += dy * dy;
  }
  const rho = sDenX > 0 && sDenY > 0 ? sNum / Math.sqrt(sDenX * sDenY) : 0;
  const rhoP = correlationPValue(rho, n);

  return { n, r, rP, rho, rhoP, slope, intercept };
}

/**
 * Two-sided Welch t-test using exact Student-t incomplete beta CDF.
 */
export function welchTTestExact(groupA: number[], groupB: number[]): { t: number; df: number; p: number; diff: number } {
  const a = groupA.filter(Number.isFinite);
  const b = groupB.filter(Number.isFinite);
  const nA = a.length;
  const nB = b.length;
  if (nA < 2 || nB < 2) return { t: 0, df: 1, p: 1, diff: 0 };

  const meanA = a.reduce((s, v) => s + v, 0) / nA;
  const meanB = b.reduce((s, v) => s + v, 0) / nB;
  const varA = a.reduce((s, v) => s + (v - meanA) ** 2, 0) / (nA - 1);
  const varB = b.reduce((s, v) => s + (v - meanB) ** 2, 0) / (nB - 1);
  const se2 = varA / nA + varB / nB;
  if (se2 <= 1e-18) return { t: 0, df: 1, p: 1, diff: meanA - meanB };

  const t = (meanA - meanB) / Math.sqrt(se2);
  const dfDenom = (varA / nA) ** 2 / (nA - 1) + (varB / nB) ** 2 / (nB - 1);
  const df = dfDenom > 0 ? (se2 * se2) / dfDenom : 1;
  const x = df / (df + t * t);
  const p = Math.max(Math.min(betainc(x, df / 2, 0.5), 1.0), 1e-300);
  return { t, df, p, diff: meanA - meanB };
}

/**
 * Two-sided Mann-Whitney U test with tie correction.
 */
export function mannWhitneyUTest(groupA: number[], groupB: number[]): { u: number; z: number; p: number } {
  const a = groupA.filter(Number.isFinite);
  const b = groupB.filter(Number.isFinite);
  const n1 = a.length;
  const n2 = b.length;
  if (n1 < 2 || n2 < 2) return { u: 0, z: 0, p: 1 };

  const combined = [
    ...a.map((v) => ({ v, grp: 1 })),
    ...b.map((v) => ({ v, grp: 2 })),
  ].sort((x, y) => x.v - y.v);

  const N = n1 + n2;
  let rankSum1 = 0;
  let tieCorrection = 0;
  let i = 0;
  while (i < N) {
    let j = i;
    while (j < N && combined[j].v === combined[i].v) j++;
    const tCount = j - i;
    const avgRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) {
      if (combined[k].grp === 1) rankSum1 += avgRank;
    }
    if (tCount > 1) {
      tieCorrection += tCount ** 3 - tCount;
    }
    i = j;
  }

  const u1 = rankSum1 - (n1 * (n1 + 1)) / 2;
  const meanU = (n1 * n2) / 2;
  const varU = ((n1 * n2) / 12) * (N + 1 - tieCorrection / (N * (N - 1)));
  if (varU <= 1e-18) return { u: u1, z: 0, p: 1 };

  const z = (u1 - meanU) / Math.sqrt(varU);
  const p = Math.min(1.0, Math.max(1e-300, erfcApprox(Math.abs(z) / Math.sqrt(2.0))));
  return { u: u1, z, p };
}

/**
 * Lausen & Schumacher (1992) maximally selected rank statistic adjusted p-value
 * matching R `maxstat::maxstat.test(..., smethod="LogRank", pmethod="Lau92")`.
 */
export function computeMaxstatLau92PValue(
  chi2: number,
  minProp: number = 0.15,
  maxProp: number = 0.85
): number {
  if (!Number.isFinite(chi2) || chi2 <= 1.0) return 1.0;
  const b = Math.sqrt(chi2);
  if (b <= 1.0) return 1.0;
  const phi = Math.exp(-0.5 * b * b) / Math.sqrt(2 * Math.PI);
  const ratio = ((1 - minProp) * maxProp) / ((1 - maxProp) * minProp);
  const p = (4 * phi) / b + phi * (b - 1.0 / b) * Math.log(ratio);
  return Math.min(1.0, Math.max(1e-300, p));
}

/**
 * Continuous Univariate Cox Proportional Hazards model (Newton-Raphson, Efron tie handling)
 * matching Python lifelines.CoxPHFitter and R survival::coxph(method="efron").
 */
export function computeCoxPH(
  durations: number[],
  events: number[],
  scoresRaw: number[],
  standardize: boolean = true
): CoxPhResult | null {
  const validIdx: number[] = [];
  for (let i = 0; i < durations.length; i++) {
    if (
      Number.isFinite(durations[i]) &&
      durations[i] > 0 &&
      Number.isFinite(events[i]) &&
      Number.isFinite(scoresRaw[i])
    ) {
      validIdx.push(i);
    }
  }
  const n = validIdx.length;
  if (n < 15) return null;

  const times = validIdx.map((i) => durations[i]);
  const evs = validIdx.map((i) => (events[i] === 1 ? 1 : 0));
  const totalEvents = evs.reduce<number>((a, b) => a + b, 0);
  if (totalEvents < 5) return null;

  const rawVals = validIdx.map((i) => scoresRaw[i]);
  const mean = rawVals.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(rawVals.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
  if (!Number.isFinite(sd) || sd < 1e-8) return null;

  const xArr = standardize ? rawVals.map((v) => (v - mean) / sd) : rawVals;

  // Sort descending by time
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => times[b] - times[a]);
  const tS = order.map((i) => times[i]);
  const eS = order.map((i) => evs[i]);
  const xS = order.map((i) => xArr[i]);

  interface EventBlock {
    endIdx: number;
    dK: number;
    evIndices: number[];
    sumXEv: number;
  }

  const blocks: EventBlock[] = [];
  let i = 0;
  while (i < n) {
    let j = i + 1;
    while (j < n && tS[j] === tS[i]) j++;
    const evIndices: number[] = [];
    let sumXEv = 0;
    for (let k = i; k < j; k++) {
      if (eS[k] === 1) {
        evIndices.push(k);
        sumXEv += xS[k];
      }
    }
    if (evIndices.length > 0) {
      blocks.push({ endIdx: j - 1, dK: evIndices.length, evIndices, sumXEv });
    }
    i = j;
  }
  if (blocks.length === 0) return null;

  const evalPartialLL = (betaVal: number): { ll: number; grad: number; hess: number } => {
    const expBx = new Float64Array(n);
    const xExp = new Float64Array(n);
    const x2Exp = new Float64Array(n);
    const s0Cum = new Float64Array(n);
    const s1Cum = new Float64Array(n);
    const s2Cum = new Float64Array(n);

    let r0Acc = 0;
    let r1Acc = 0;
    let r2Acc = 0;
    for (let k = 0; k < n; k++) {
      const clamped = Math.max(-30, Math.min(30, betaVal * xS[k]));
      const eb = Math.exp(clamped);
      const xe = xS[k] * eb;
      const x2e = xS[k] * xe;
      expBx[k] = eb;
      xExp[k] = xe;
      x2Exp[k] = x2e;
      r0Acc += eb;
      r1Acc += xe;
      r2Acc += x2e;
      s0Cum[k] = r0Acc;
      s1Cum[k] = r1Acc;
      s2Cum[k] = r2Acc;
    }

    let ll = 0;
    let grad = 0;
    let hess = 0;

    for (const blk of blocks) {
      const r0 = s0Cum[blk.endIdx];
      const r1 = s1Cum[blk.endIdx];
      const r2 = s2Cum[blk.endIdx];
      ll += betaVal * blk.sumXEv;
      grad += blk.sumXEv;

      if (blk.dK === 1) {
        if (r0 > 0) {
          ll -= Math.log(r0);
          const mx = r1 / r0;
          grad -= mx;
          hess += r2 / r0 - mx * mx;
        }
      } else {
        let d0 = 0;
        let d1 = 0;
        let d2 = 0;
        for (const idx of blk.evIndices) {
          d0 += expBx[idx];
          d1 += xExp[idx];
          d2 += x2Exp[idx];
        }
        for (let l = 0; l < blk.dK; l++) {
          const frac = l / blk.dK;
          const s0 = r0 - frac * d0;
          if (s0 <= 0) continue;
          const s1 = r1 - frac * d1;
          const s2 = r2 - frac * d2;
          ll -= Math.log(s0);
          const mx = s1 / s0;
          grad -= mx;
          hess += s2 / s0 - mx * mx;
        }
      }
    }
    return { ll, grad, hess };
  };

  const ll0 = evalPartialLL(0).ll;
  let beta = 0;
  let finalInfo = 0;
  let finalLL = ll0;

  for (let iter = 0; iter < 35; iter++) {
    const { ll, grad, hess } = evalPartialLL(beta);
    finalLL = ll;
    finalInfo = hess;
    if (!Number.isFinite(hess) || hess <= 1e-12) return null;
    const step = grad / hess;
    beta += step;
    if (Math.abs(step) < 1e-8) {
      const fin = evalPartialLL(beta);
      finalLL = fin.ll;
      finalInfo = fin.hess;
      break;
    }
  }

  if (!Number.isFinite(beta) || finalInfo <= 1e-12) return null;
  const se = 1.0 / Math.sqrt(finalInfo);
  if (Math.abs(beta) > 15 || Math.abs(beta) + 1.96 * se > 50) return null;
  const z = beta / se;
  const pValue = Math.min(1.0, Math.max(1e-300, erfcApprox(Math.abs(z) / Math.sqrt(2.0))));
  const lrChi2 = Math.max(0, 2 * (finalLL - ll0));
  const lrPValue = Math.min(1.0, Math.max(1e-300, erfcApprox(Math.sqrt(lrChi2 / 2.0))));

  // Harrell's C-index (for beta >= 0 higher score -> shorter survival; for beta < 0 lower score -> shorter survival)
  const riskScore = xArr.map((x) => beta * x);
  let concordant = 0;
  let permissible = 0;
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      if (times[a] === times[b]) {
        if (evs[a] !== evs[b]) {
          // One died, one censored at same time -> event died first
          const evIdx = evs[a] === 1 ? a : b;
          const cenIdx = evs[a] === 1 ? b : a;
          permissible += 1;
          if (riskScore[evIdx] > riskScore[cenIdx]) concordant += 1;
          else if (riskScore[evIdx] === riskScore[cenIdx]) concordant += 0.5;
        }
        continue;
      }
      const earlier = times[a] < times[b] ? a : b;
      const later = times[a] < times[b] ? b : a;
      if (evs[earlier] !== 1) continue;
      permissible += 1;
      if (riskScore[earlier] > riskScore[later]) concordant += 1;
      else if (riskScore[earlier] === riskScore[later]) concordant += 0.5;
    }
  }
  const cIndex = permissible > 0 ? concordant / permissible : 0.5;

  return {
    n,
    events: totalEvents,
    beta,
    se,
    z,
    hr: Math.exp(beta),
    ciLower: Math.exp(beta - 1.96 * se),
    ciUpper: Math.exp(beta + 1.96 * se),
    pValue,
    lrChi2,
    lrPValue,
    cIndex,
  };
}

export interface CptacSurvivalResult extends SurvivalAnalysisResult {
  maxstat_p_value?: number;
  cox_ph: CoxPhResult | null;
  n_used: number;
  events_used: number;
}

/**
 * Compute per-patient composite score (handles NaNs per protein across valid panel members)
 * and run Continuous Cox PH + KM stratification (median, tertile, quartile, or optimal maxstat).
 */
export function runCptacSurvivalAnalysis(
  survivalSamples: CptacSurvivalSample[],
  geneVectors: Array<{ gene: string; fullValues: number[] }>, // fullValues indexed by tumor_idx (0..139)
  method: "median" | "quartile" | "tertile" | "optimal" = "optimal"
): CptacSurvivalResult | null {
  if (survivalSamples.length === 0 || geneVectors.length === 0) return null;

  // Standardize each gene across the valid clinical survival samples
  const zVectors: Array<Map<number, number>> = geneVectors.map(({ fullValues }) => {
    const validPairs: Array<{ tumorIdx: number; val: number }> = [];
    for (const s of survivalSamples) {
      const v = fullValues[s.tumor_idx];
      if (Number.isFinite(v)) validPairs.push({ tumorIdx: s.tumor_idx, val: v });
    }
    const map = new Map<number, number>();
    if (validPairs.length < 15) return map;
    const mean = validPairs.reduce((a, b) => a + b.val, 0) / validPairs.length;
    const sd = Math.sqrt(
      validPairs.reduce((acc, p) => acc + (p.val - mean) ** 2, 0) / (validPairs.length - 1)
    );
    if (!Number.isFinite(sd) || sd < 1e-8) return map;
    for (const p of validPairs) {
      map.set(p.tumorIdx, (p.val - mean) / sd);
    }
    return map;
  });

  // Compute composite score per patient across non-missing panel members
  const validPatients: Array<{ sample: CptacSurvivalSample; score: number }> = [];
  for (const s of survivalSamples) {
    let sum = 0;
    let cnt = 0;
    for (const zMap of zVectors) {
      const zv = zMap.get(s.tumor_idx);
      if (zv !== undefined && Number.isFinite(zv)) {
        sum += zv;
        cnt++;
      }
    }
    if (cnt > 0) {
      // When single gene, preserve raw abundance for intuitive cutpoint display if desired, or z-score for multi-gene
      const score = geneVectors.length === 1 ? geneVectors[0].fullValues[s.tumor_idx] : sum / cnt;
      validPatients.push({ sample: s, score });
    }
  }

  const nPatients = validPatients.length;
  if (nPatients < 15) return null;

  const durations = validPatients.map((p) => p.sample.os_months);
  const events = validPatients.map((p) => p.sample.os_event);
  const scores = validPatients.map((p) => p.score);

  const coxPh = computeCoxPH(durations, events, scores, true);

  const sortedScores = [...scores].sort((a, b) => a - b);
  let highCutoff: number;
  let lowCutoff: number;
  let reportedCutoffVal: number;
  let reportedPercentile: number;
  let maxstatP: number | undefined = undefined;

  if (method === "optimal") {
    const opt = findOptimalCutpoint(durations, events, scores, 0.15, 0.85);
    highCutoff = opt.cutoff;
    lowCutoff = opt.cutoff;
    reportedCutoffVal = Number(opt.cutoff.toFixed(4));
    reportedPercentile = opt.percentile;
    maxstatP = computeMaxstatLau92PValue(opt.chi2, 0.15, 0.85);
  } else if (method === "quartile") {
    lowCutoff = sortedScores[Math.floor(nPatients * 0.25)];
    highCutoff = sortedScores[Math.floor(nPatients * 0.75)];
    reportedCutoffVal = Number(highCutoff.toFixed(4));
    reportedPercentile = 75;
  } else if (method === "tertile") {
    lowCutoff = sortedScores[Math.floor(nPatients * 0.333)];
    highCutoff = sortedScores[Math.floor(nPatients * 0.667)];
    reportedCutoffVal = Number(highCutoff.toFixed(4));
    reportedPercentile = 66.7;
  } else {
    const med = sortedScores[Math.floor(nPatients * 0.5)];
    highCutoff = med;
    lowCutoff = med;
    reportedCutoffVal = Number(med.toFixed(4));
    reportedPercentile = 50;
  }

  const patientRecords: PatientSurvivalRecord[] = [];
  const highDur: number[] = [];
  const highEv: number[] = [];
  const lowDur: number[] = [];
  const lowEv: number[] = [];

  for (let i = 0; i < nPatients; i++) {
    const { sample, score } = validPatients[i];
    let grp: "High" | "Low" | "Intermediate";
    if (method === "median" || method === "optimal") {
      if (score >= highCutoff) {
        grp = "High";
        highDur.push(sample.os_months);
        highEv.push(sample.os_event);
      } else {
        grp = "Low";
        lowDur.push(sample.os_months);
        lowEv.push(sample.os_event);
      }
    } else {
      if (score >= highCutoff) {
        grp = "High";
        highDur.push(sample.os_months);
        highEv.push(sample.os_event);
      } else if (score <= lowCutoff) {
        grp = "Low";
        lowDur.push(sample.os_months);
        lowEv.push(sample.os_event);
      } else {
        grp = "Intermediate";
      }
    }

    patientRecords.push({
      patient_id: sample.case_id,
      sample_id: sample.case_id,
      score: Number(score.toFixed(4)),
      group: grp,
      os_months: sample.os_months,
      os_event: sample.os_event,
    });
  }

  const highKm = computeKaplanMeier(highDur, highEv);
  const lowKm = computeKaplanMeier(lowDur, lowEv);
  const { logrank_p, logrank_chi2, hazard_ratio, hr_ci_lower, hr_ci_upper } = computeLogRankAndHR(
    highDur,
    highEv,
    lowDur,
    lowEv
  );

  const maxTime = Math.max(...durations);
  const riskTable: RiskTableRow[] = [0, 12, 24, 36, 48, 60]
    .filter((t) => t <= maxTime + 6)
    .map((t) => ({
      time: t,
      high_risk: highDur.filter((d) => d >= t).length,
      low_risk: lowDur.filter((d) => d >= t).length,
    }));

  return {
    high_curve: highKm.curve,
    low_curve: lowKm.curve,
    high_median_os: highKm.medianOS,
    low_median_os: lowKm.medianOS,
    high_n: highDur.length,
    low_n: lowDur.length,
    high_events: highKm.totalEvents,
    low_events: lowKm.totalEvents,
    logrank_p_value: logrank_p,
    logrank_chi2,
    hazard_ratio,
    hr_ci_lower,
    hr_ci_upper,
    risk_table: riskTable,
    patient_records: patientRecords,
    cutoff_value: reportedCutoffVal,
    cutoff_percentile: reportedPercentile,
    strat_method: method,
    maxstat_p_value: maxstatP,
    cox_ph: coxPh,
    n_used: nPatients,
    events_used: events.reduce((a, b) => a + b, 0),
  };
}
