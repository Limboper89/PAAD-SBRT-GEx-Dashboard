/**
 * Survival Analysis Engine for TCGA-PAAD Dynamic Kaplan-Meier Curves
 * Computes multi-gene composite index, patient stratification,
 * Kaplan-Meier survival curves, Greenwood CI, Mantel-Cox log-rank test,
 * Peto/Cox Hazard Ratio with 95% CI, and Numbers at Risk table.
 */

export interface MatchedSurvivalSample {
  sample_id: string;
  patient_id: string;
  tumor_idx: number;
  os_days: number;
  os_months: number;
  os_event: number; // 1 = dead, 0 = censored
}

export interface KmCurvePoint {
  time: number; // months
  survival: number; // 0 to 1
  ci_lower: number;
  ci_upper: number;
  n_risk: number;
  n_event: number;
  n_censor: number;
  is_censor?: boolean;
}

export interface RiskTableRow {
  time: number;
  high_risk: number;
  low_risk: number;
}

export interface PatientSurvivalRecord {
  patient_id: string;
  sample_id: string;
  score: number;
  group: "High" | "Low" | "Intermediate";
  os_months: number;
  os_event: number;
}

export interface SurvivalAnalysisResult {
  high_curve: KmCurvePoint[];
  low_curve: KmCurvePoint[];
  high_median_os: number | null; // null if Not Reached (NR)
  low_median_os: number | null;
  high_n: number;
  low_n: number;
  high_events: number;
  low_events: number;
  logrank_p_value: number;
  logrank_chi2: number;
  hazard_ratio: number;
  hr_ci_lower: number;
  hr_ci_upper: number;
  risk_table: RiskTableRow[];
  patient_records: PatientSurvivalRecord[];
}

/**
 * Complementary error function for accurate p-value from normal / chi-square (df=1)
 */
function erfc(x: number): number {
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

/**
 * Compute Kaplan-Meier step function curve and Greenwood's formula 95% CI
 */
export function computeKaplanMeier(
  durations: number[],
  events: number[]
): { curve: KmCurvePoint[]; medianOS: number | null; totalEvents: number } {
  const n = durations.length;
  if (n === 0) {
    return {
      curve: [{ time: 0, survival: 1, ci_lower: 1, ci_upper: 1, n_risk: 0, n_event: 0, n_censor: 0 }],
      medianOS: null,
      totalEvents: 0,
    };
  }

  // Combine and sort by duration ascending; if equal, deaths before censors
  const records = durations
    .map((time, idx) => ({ time, event: events[idx] }))
    .sort((a, b) => (a.time !== b.time ? a.time - b.time : b.event - a.event));

  // Find all unique times
  const timeMap = new Map<number, { deaths: number; censors: number }>();
  for (const r of records) {
    const entry = timeMap.get(r.time) || { deaths: 0, censors: 0 };
    if (r.event === 1) entry.deaths += 1;
    else entry.censors += 1;
    timeMap.set(r.time, entry);
  }

  const sortedTimes = Array.from(timeMap.keys()).sort((a, b) => a - b);

  let currentS = 1.0;
  let currentAtRisk = n;
  let greenwoodSum = 0.0;
  let totalDeaths = 0;

  const curve: KmCurvePoint[] = [];
  curve.push({
    time: 0,
    survival: 1.0,
    ci_lower: 1.0,
    ci_upper: 1.0,
    n_risk: n,
    n_event: 0,
    n_censor: 0,
    is_censor: false,
  });

  let medianOS: number | null = null;

  for (const t of sortedTimes) {
    const { deaths, censors } = timeMap.get(t)!;

    if (deaths > 0) {
      const stepBefore = currentS;
      currentS = currentS * (1.0 - deaths / currentAtRisk);
      if (currentAtRisk > deaths) {
        greenwoodSum += deaths / (currentAtRisk * (currentAtRisk - deaths));
      }
      totalDeaths += deaths;

      const varS = currentS * currentS * greenwoodSum;
      const seS = Math.sqrt(Math.max(0, varS));
      const ciLower = Math.max(0, currentS - 1.96 * seS);
      const ciUpper = Math.min(1, currentS + 1.96 * seS);

      curve.push({
        time: t,
        survival: stepBefore,
        ci_lower: Math.max(0, stepBefore - 1.96 * seS),
        ci_upper: Math.min(1, stepBefore + 1.96 * seS),
        n_risk: currentAtRisk,
        n_event: 0,
        n_censor: 0,
        is_censor: false,
      });

      curve.push({
        time: t,
        survival: currentS,
        ci_lower: ciLower,
        ci_upper: ciUpper,
        n_risk: currentAtRisk - deaths,
        n_event: deaths,
        n_censor: 0,
        is_censor: false,
      });

      if (medianOS === null && currentS <= 0.5) {
        medianOS = t;
      }
    }

    if (censors > 0) {
      const varS = currentS * currentS * greenwoodSum;
      const seS = Math.sqrt(Math.max(0, varS));
      curve.push({
        time: t,
        survival: currentS,
        ci_lower: Math.max(0, currentS - 1.96 * seS),
        ci_upper: Math.min(1, currentS + 1.96 * seS),
        n_risk: currentAtRisk - deaths,
        n_event: 0,
        n_censor: censors,
        is_censor: true,
      });
    }

    currentAtRisk -= deaths + censors;
  }

  return { curve, medianOS, totalEvents: totalDeaths };
}

/**
 * Log-rank (Mantel-Cox) test and Peto Hazard Ratio calculation
 */
export function computeLogRankAndHR(
  group1Durations: number[],
  group1Events: number[],
  group2Durations: number[],
  group2Events: number[]
): {
  logrank_p: number;
  logrank_chi2: number;
  hazard_ratio: number;
  hr_ci_lower: number;
  hr_ci_upper: number;
} {
  const deathTimesSet = new Set<number>();
  group1Durations.forEach((t, i) => {
    if (group1Events[i] === 1) deathTimesSet.add(t);
  });
  group2Durations.forEach((t, i) => {
    if (group2Events[i] === 1) deathTimesSet.add(t);
  });

  const deathTimes = Array.from(deathTimesSet).sort((a, b) => a - b);

  let sumO1 = 0;
  let sumE1 = 0;
  let sumV = 0;

  for (const t of deathTimes) {
    let n1 = 0;
    let d1 = 0;
    for (let i = 0; i < group1Durations.length; i++) {
      if (group1Durations[i] >= t) n1++;
      if (group1Durations[i] === t && group1Events[i] === 1) d1++;
    }

    let n2 = 0;
    let d2 = 0;
    for (let i = 0; i < group2Durations.length; i++) {
      if (group2Durations[i] >= t) n2++;
      if (group2Durations[i] === t && group2Events[i] === 1) d2++;
    }

    const n = n1 + n2;
    const d = d1 + d2;

    if (n > 1 && d > 0) {
      const e1 = (n1 * d) / n;
      const v = (n1 * n2 * d * (n - d)) / (n * n * (n - 1));

      sumO1 += d1;
      sumE1 += e1;
      sumV += v;
    }
  }

  if (sumV <= 1e-9) {
    return {
      logrank_p: 1.0,
      logrank_chi2: 0,
      hazard_ratio: 1.0,
      hr_ci_lower: 1.0,
      hr_ci_upper: 1.0,
    };
  }

  const chi2 = Math.pow(sumO1 - sumE1, 2) / sumV;
  const pValue = Math.min(1.0, erfc(Math.sqrt(chi2 / 2.0)));

  const logHR = (sumO1 - sumE1) / sumV;
  const hr = Math.exp(logHR);
  const seLogHR = Math.sqrt(1.0 / sumV);
  const ciLower = Math.exp(logHR - 1.96 * seLogHR);
  const ciUpper = Math.exp(logHR + 1.96 * seLogHR);

  return {
    logrank_p: pValue,
    logrank_chi2: chi2,
    hazard_ratio: hr,
    hr_ci_lower: ciLower,
    hr_ci_upper: ciUpper,
  };
}

/**
 * Perform complete dynamic multi-gene survival analysis
 */
export function runCustomSurvivalAnalysis(
  survivalSamples: MatchedSurvivalSample[],
  geneExpressions: number[][],
  method: "median" | "quartile" | "tertile" = "median"
): SurvivalAnalysisResult {
  const nPatients = survivalSamples.length;
  if (nPatients === 0 || geneExpressions.length === 0) {
    throw new Error("No samples or gene expression provided for survival analysis.");
  }

  const compositeScores = new Float64Array(nPatients);

  for (let g = 0; g < geneExpressions.length; g++) {
    const exprs = geneExpressions[g];
    let sum = 0;
    for (let i = 0; i < nPatients; i++) sum += exprs[i];
    const mean = sum / nPatients;

    let sqDiffSum = 0;
    for (let i = 0; i < nPatients; i++) {
      const diff = exprs[i] - mean;
      sqDiffSum += diff * diff;
    }
    const std = Math.sqrt(sqDiffSum / (nPatients - 1)) || 1e-6;

    for (let i = 0; i < nPatients; i++) {
      const z = (exprs[i] - mean) / std;
      compositeScores[i] += z / geneExpressions.length;
    }
  }

  const sortedScores = Array.from(compositeScores).sort((a, b) => a - b);
  let highCutoff: number;
  let lowCutoff: number;

  if (method === "quartile") {
    const q1Idx = Math.floor(nPatients * 0.25);
    const q3Idx = Math.floor(nPatients * 0.75);
    lowCutoff = sortedScores[q1Idx];
    highCutoff = sortedScores[q3Idx];
  } else if (method === "tertile") {
    const t1Idx = Math.floor(nPatients * 0.333);
    const t2Idx = Math.floor(nPatients * 0.667);
    lowCutoff = sortedScores[t1Idx];
    highCutoff = sortedScores[t2Idx];
  } else {
    const medIdx = Math.floor(nPatients * 0.5);
    const med = sortedScores[medIdx];
    highCutoff = med;
    lowCutoff = med;
  }

  const patientRecords: PatientSurvivalRecord[] = [];
  const highDurations: number[] = [];
  const highEvents: number[] = [];
  const lowDurations: number[] = [];
  const lowEvents: number[] = [];

  for (let i = 0; i < nPatients; i++) {
    const s = survivalSamples[i];
    const score = Number(compositeScores[i].toFixed(4));
    let grp: "High" | "Low" | "Intermediate";

    if (method === "median") {
      if (score >= highCutoff) {
        grp = "High";
        highDurations.push(s.os_months);
        highEvents.push(s.os_event);
      } else {
        grp = "Low";
        lowDurations.push(s.os_months);
        lowEvents.push(s.os_event);
      }
    } else {
      if (score >= highCutoff) {
        grp = "High";
        highDurations.push(s.os_months);
        highEvents.push(s.os_event);
      } else if (score <= lowCutoff) {
        grp = "Low";
        lowDurations.push(s.os_months);
        lowEvents.push(s.os_event);
      } else {
        grp = "Intermediate";
      }
    }

    patientRecords.push({
      patient_id: s.patient_id,
      sample_id: s.sample_id,
      score,
      group: grp,
      os_months: s.os_months,
      os_event: s.os_event,
    });
  }

  const highKm = computeKaplanMeier(highDurations, highEvents);
  const lowKm = computeKaplanMeier(lowDurations, lowEvents);

  const { logrank_p, logrank_chi2, hazard_ratio, hr_ci_lower, hr_ci_upper } = computeLogRankAndHR(
    highDurations,
    highEvents,
    lowDurations,
    lowEvents
  );

  const maxTime = Math.max(...survivalSamples.map((s) => s.os_months));
  const timeGrid = [0, 12, 24, 36, 48, 60, 72].filter((t) => t <= maxTime + 6);
  const riskTable: RiskTableRow[] = timeGrid.map((t) => {
    const highRisk = highDurations.filter((dur) => dur >= t).length;
    const lowRisk = lowDurations.filter((dur) => dur >= t).length;
    return { time: t, high_risk: highRisk, low_risk: lowRisk };
  });

  return {
    high_curve: highKm.curve,
    low_curve: lowKm.curve,
    high_median_os: highKm.medianOS,
    low_median_os: lowKm.medianOS,
    high_n: highDurations.length,
    low_n: lowDurations.length,
    high_events: highKm.totalEvents,
    low_events: lowKm.totalEvents,
    logrank_p_value: logrank_p,
    logrank_chi2,
    hazard_ratio,
    hr_ci_lower,
    hr_ci_upper,
    risk_table: riskTable,
    patient_records: patientRecords,
  };
}

// -------------------------------------------------------------
// SBRT Pathologic Treatment Response (Responders vs Non-Responders)
// -------------------------------------------------------------

export interface SbrtSampleMetadata {
  sample_index: number;
  srr_id: string;
  title: string;
  gsm: string;
  timepoint: "Pre" | "Post";
  response: "R" | "NR" | "Unk";
  correlation?: number;
}

export interface SbrtGroupStats {
  id: "Pre_NR" | "Pre_R" | "Post_NR" | "Post_R";
  label: string;
  timepoint: "Pre" | "Post";
  response: "R" | "NR";
  n: number;
  mean: number;
  median: number;
  sd: number;
  min: number;
  max: number;
  points: { sample_id: string; title: string; gsm: string; score: number }[];
}

export interface SbrtComparisonStats {
  diff: number; // Mean(R) - Mean(NR)
  t_stat: number;
  df: number;
  p_value: number;
  foldChangeLog2: number;
}

export interface SbrtResponseAnalysisResult {
  groups: {
    Pre_NR: SbrtGroupStats;
    Pre_R: SbrtGroupStats;
    Post_NR: SbrtGroupStats;
    Post_R: SbrtGroupStats;
  };
  pre_comparison: SbrtComparisonStats; // Pre R vs Pre NR
  post_comparison: SbrtComparisonStats; // Post R vs Post NR
  delta_r: { mean_pre: number; mean_post: number; delta: number };
  delta_nr: { mean_pre: number; mean_post: number; delta: number };
  all_samples: {
    sample_id: string;
    title: string;
    gsm: string;
    timepoint: "Pre" | "Post";
    response: "R" | "NR" | "Unk";
    score: number;
  }[];
}

/**
 * Welch's two-sample t-test
 */
export function computeWelchTTest(
  groupA: number[],
  groupB: number[]
): { t: number; df: number; p: number; diff: number } {
  const nA = groupA.length;
  const nB = groupB.length;
  if (nA < 2 || nB < 2) return { t: 0, df: 1, p: 1, diff: 0 };

  const meanA = groupA.reduce((a, b) => a + b, 0) / nA;
  const meanB = groupB.reduce((a, b) => a + b, 0) / nB;

  const varA = groupA.reduce((sum, v) => sum + Math.pow(v - meanA, 2), 0) / (nA - 1);
  const varB = groupB.reduce((sum, v) => sum + Math.pow(v - meanB, 2), 0) / (nB - 1);

  const seDiff = Math.sqrt(varA / nA + varB / nB);
  if (seDiff <= 1e-9) return { t: 0, df: 1, p: 1, diff: 0 };

  const t = (meanA - meanB) / seDiff;
  const dfNum = Math.pow(varA / nA + varB / nB, 2);
  const dfDenom =
    Math.pow(varA / nA, 2) / (nA - 1) + Math.pow(varB / nB, 2) / (nB - 1);
  const df = dfDenom > 0 ? dfNum / dfDenom : 1;

  // Two-tailed p-value
  const p = Math.min(1.0, erfc(Math.abs(t) / Math.sqrt(2.0)));

  return { t, df, p, diff: meanA - meanB };
}

/**
 * Run SBRT Pathologic Treatment Response analysis on GSE225767
 */
export function runSbrtResponseAnalysis(
  metadata: SbrtSampleMetadata[],
  geneExpressions: number[][] // [geneIdx][sampleIdx 0..54]
): SbrtResponseAnalysisResult {
  const nSamples = metadata.length;
  if (nSamples === 0 || geneExpressions.length === 0) {
    throw new Error("No metadata or expressions provided for SBRT response analysis.");
  }

  // 1. Compute composite score for all 55 samples
  const scores = new Float64Array(nSamples);

  for (let g = 0; g < geneExpressions.length; g++) {
    const exprs = geneExpressions[g];
    let sum = 0;
    for (let i = 0; i < nSamples; i++) sum += exprs[i];
    const mean = sum / nSamples;

    let sqDiffSum = 0;
    for (let i = 0; i < nSamples; i++) {
      const diff = exprs[i] - mean;
      sqDiffSum += diff * diff;
    }
    const std = Math.sqrt(sqDiffSum / (nSamples - 1)) || 1e-6;

    for (let i = 0; i < nSamples; i++) {
      const z = (exprs[i] - mean) / std;
      scores[i] += z / geneExpressions.length;
    }
  }

  // Helper to get stats for a subcohort
  const getSubStats = (
    id: "Pre_NR" | "Pre_R" | "Post_NR" | "Post_R",
    label: string,
    tp: "Pre" | "Post",
    resp: "R" | "NR"
  ): SbrtGroupStats => {
    const matched = metadata.filter((m) => m.timepoint === tp && m.response === resp);
    const vals = matched.map((m) => ({
      sample_id: m.srr_id,
      title: m.title,
      gsm: m.gsm,
      score: Number(scores[m.sample_index].toFixed(4)),
    }));
    const numericVals = vals.map((v) => v.score);
    const n = numericVals.length;

    if (n === 0) {
      return { id, label, timepoint: tp, response: resp, n: 0, mean: 0, median: 0, sd: 0, min: 0, max: 0, points: [] };
    }

    const mean = numericVals.reduce((a, b) => a + b, 0) / n;
    const sorted = [...numericVals].sort((a, b) => a - b);
    const median = sorted[Math.floor(n / 2)];
    const sd =
      n > 1
        ? Math.sqrt(numericVals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (n - 1))
        : 0;

    return {
      id,
      label,
      timepoint: tp,
      response: resp,
      n,
      mean: Number(mean.toFixed(4)),
      median: Number(median.toFixed(4)),
      sd: Number(sd.toFixed(4)),
      min: Number(sorted[0].toFixed(4)),
      max: Number(sorted[n - 1].toFixed(4)),
      points: vals,
    };
  };

  const preNR = getSubStats("Pre_NR", "Pre-SBRT (Non-Responder)", "Pre", "NR");
  const preR = getSubStats("Pre_R", "Pre-SBRT (Responder)", "Pre", "R");
  const postNR = getSubStats("Post_NR", "Post-SBRT (Non-Responder)", "Post", "NR");
  const postR = getSubStats("Post_R", "Post-SBRT (Responder)", "Post", "R");

  // Pre comparison: R vs NR
  const preTest = computeWelchTTest(
    preR.points.map((p) => p.score),
    preNR.points.map((p) => p.score)
  );

  // Post comparison: R vs NR
  const postTest = computeWelchTTest(
    postR.points.map((p) => p.score),
    postNR.points.map((p) => p.score)
  );

  return {
    groups: {
      Pre_NR: preNR,
      Pre_R: preR,
      Post_NR: postNR,
      Post_R: postR,
    },
    pre_comparison: {
      diff: Number(preTest.diff.toFixed(4)),
      t_stat: Number(preTest.t.toFixed(3)),
      df: Number(preTest.df.toFixed(1)),
      p_value: preTest.p,
      foldChangeLog2: Number(preTest.diff.toFixed(3)),
    },
    post_comparison: {
      diff: Number(postTest.diff.toFixed(4)),
      t_stat: Number(postTest.t.toFixed(3)),
      df: Number(postTest.df.toFixed(1)),
      p_value: postTest.p,
      foldChangeLog2: Number(postTest.diff.toFixed(3)),
    },
    delta_r: {
      mean_pre: preR.mean,
      mean_post: postR.mean,
      delta: Number((postR.mean - preR.mean).toFixed(4)),
    },
    delta_nr: {
      mean_pre: preNR.mean,
      mean_post: postNR.mean,
      delta: Number((postNR.mean - preNR.mean).toFixed(4)),
    },
    all_samples: metadata.map((m) => ({
      sample_id: m.srr_id,
      title: m.title,
      gsm: m.gsm,
      timepoint: m.timepoint,
      response: m.response,
      score: Number(scores[m.sample_index].toFixed(4)),
    })),
  };
}
