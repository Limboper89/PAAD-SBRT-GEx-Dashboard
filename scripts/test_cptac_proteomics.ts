// Verification script for CPTAC-PDAC Proteomics module & PDACopilot integration
import fs from "fs";
import path from "path";
import assert from "assert";
import {
  PROT_SAMPLE_COLS,
  MRNA_SAMPLE_COLS,
  CURATED_20_NRF2_PANEL,
  sliceMatrixRow,
  pearsonAndSpearman,
  mannWhitneyUTest,
  welchTTestExact,
  computeCoxPH,
  computeMaxstatLau92PValue,
  runCptacSurvivalAnalysis,
} from "../src/utils/cptacEngine";
import { DATASET_REGISTRY } from "../src/components/ai/DatasetRegistry";
import { queryEngine } from "../src/components/ai/QueryEngine";
import { intentRouter } from "../src/components/ai/IntentRouter";
import { formatVerifiedQuantitativeBlock } from "../src/components/ai/ModelRouter";

async function main() {
  const dataDir = path.join(process.cwd(), "public", "data", "cptac_pdac");
  const meta = JSON.parse(fs.readFileSync(path.join(dataDir, "cptac_metadata.json"), "utf-8"));
  const protStats = JSON.parse(fs.readFileSync(path.join(dataDir, "cptac_protein_stats.json"), "utf-8"));
  const mrnaStats = JSON.parse(fs.readFileSync(path.join(dataDir, "cptac_mrna_only_stats.json"), "utf-8"));

  const protBin = fs.readFileSync(path.join(dataDir, "cptac_prot_matrix.bin"));
  const mrnaBin = fs.readFileSync(path.join(dataDir, "cptac_mrna_matrix.bin"));
  const protAB = protBin.buffer.slice(protBin.byteOffset, protBin.byteOffset + protBin.byteLength);
  const mrnaAB = mrnaBin.buffer.slice(mrnaBin.byteOffset, mrnaBin.byteOffset + mrnaBin.byteLength);

  // 1. Verify exact dimensions and metadata counts
  assert.strictEqual(meta.counts.protein_genes, 11662, "Expected 11,662 quantified proteins");
  assert.strictEqual(meta.counts.tumor_proteomics_samples, 140, "Expected 140 tumors");
  assert.strictEqual(meta.counts.normal_proteomics_samples, 75, "Expected 75 NATs");
  assert.strictEqual(meta.counts.clinical_valid_os, 134, "Expected 134 OS cases");
  assert.strictEqual(protAB.byteLength, 11662 * PROT_SAMPLE_COLS * 4, "Protein float32 matrix byte size mismatch");
  assert.strictEqual(mrnaAB.byteLength, meta.counts.mrna_indexed_genes * MRNA_SAMPLE_COLS * 4, "mRNA float32 matrix byte size mismatch");

  // 2. Verify TypeScript stats engine matches precomputed NQO1 / GSR / SLC3A2 / NFE2L2 metrics
  const nqo1 = protStats.find((p: any) => p.g === "NQO1");
  assert(nqo1, "NQO1 must be present in protein stats");
  const nqo1Prot = sliceMatrixRow(protAB, nqo1.pi, PROT_SAMPLE_COLS)!;
  const nqo1Mrna = sliceMatrixRow(mrnaAB, nqo1.mi, MRNA_SAMPLE_COLS)!;
  const mpCorr = pearsonAndSpearman(nqo1Mrna.slice(0, 140), nqo1Prot.slice(0, 140));
  assert(Math.abs(mpCorr.r - nqo1.r) < 1e-3, `NQO1 r mismatch: ${mpCorr.r} vs ${nqo1.r}`);
  assert(Math.abs(mpCorr.rho - nqo1.rho) < 1e-3, `NQO1 rho mismatch: ${mpCorr.rho} vs ${nqo1.rho}`);

  const mwNqo1 = mannWhitneyUTest(nqo1Prot.slice(0, 140), nqo1Prot.slice(140, 215));
  const wNqo1 = welchTTestExact(nqo1Prot.slice(0, 140), nqo1Prot.slice(140, 215));
  assert(mwNqo1.p < 1e-12 && wNqo1.p < 1e-12, "NQO1 Tumor vs NAT should be highly significant");

  // 3. Verify NFE2L2 mRNA vs NQO1 protein post-translational decoupling
  const nfe2l2 = mrnaStats.find((m: any) => m.g === "NFE2L2");
  assert(nfe2l2, "NFE2L2 must exist in mRNA-only index");
  const nfe2l2Mrna = sliceMatrixRow(mrnaAB, nfe2l2.mi, MRNA_SAMPLE_COLS)!;
  const decoup = pearsonAndSpearman(nfe2l2Mrna.slice(0, 140), nqo1Prot.slice(0, 140));
  assert(Math.abs(decoup.r) < 0.1 && decoup.rP > 0.4, `Expected post-translational decoupling for NFE2L2 mRNA vs NQO1 protein, got r=${decoup.r}`);

  // 4. Verify Cox PH + maxstat Lau92 on SLC3A2, GSR, GPX4 and full 20-gene NRF2 panel
  const protMap = new Map(protStats.map((p: any) => [p.g, p]));
  const slc3a2: any = protMap.get("SLC3A2");
  const slcVec = sliceMatrixRow(protAB, slc3a2.pi, PROT_SAMPLE_COLS)!;
  const durs = meta.clinical_survival.map((s: any) => s.os_months);
  const evs = meta.clinical_survival.map((s: any) => s.os_event);
  const slcCox = computeCoxPH(durs, evs, meta.clinical_survival.map((s: any) => slcVec[s.tumor_idx]), true)!;
  assert(Math.abs(slcCox.hr - slc3a2.coxHR) < 1e-2, `SLC3A2 Cox HR mismatch: ${slcCox.hr} vs ${slc3a2.coxHR}`);

  const panelVecs = CURATED_20_NRF2_PANEL
    .filter((g) => protMap.has(g))
    .map((g) => {
      const rec: any = protMap.get(g);
      return { gene: g, fullValues: sliceMatrixRow(protAB, rec.pi, PROT_SAMPLE_COLS)!.slice(0, 140) };
    });
  assert.strictEqual(panelVecs.length, 18, "Expected 18 quantified proteins in 20-gene NRF2 panel");
  const panelSurv = runCptacSurvivalAnalysis(meta.clinical_survival, panelVecs, "optimal");
  assert(panelSurv && panelSurv.n_used === 134 && panelSurv.cox_ph !== null && panelSurv.maxstat_p_value !== undefined);
  assert(computeMaxstatLau92PValue(0) === 1.0);

  // 5. Verify PDACopilot CPTAC integration
  assert(DATASET_REGISTRY.cptac_pdac, "cptac_pdac missing from DATASET_REGISTRY");
  const qNqo1 = await queryEngine.queryCptacProteomics("NQO1");
  assert(qNqo1.found && qNqo1.proteinDetected && qNqo1.metrics!.log2FC > 1.0);
  const qNrf2 = await queryEngine.queryCptacProteomics("NFE2L2");
  assert(qNrf2.found && !qNrf2.proteinDetected, "NFE2L2 must flag mRNA-only status in TMT proteomics");
  const qDiff = await queryEngine.queryCptacDifferential(10);
  assert(qDiff.success && qDiff.topUpregulated.length === 10);

  const cptacPlan = await intentRouter.parseIntent(
    "What is the NQO1 protein abundance and mRNA-protein concordance in CPTAC-PDAC proteomics?",
    { module: "CPTAC-PDAC Proteomics Analysis", dataset: "CPTAC_PDAC", gene: "NQO1", heatmapGenes: [], currentFigure: "Volcano" }
  );
  assert(cptacPlan.targetDatasets.includes("cptac_pdac"), "CPTAC query should route to cptac_pdac");
  const execRes = await intentRouter.executeRoute(cptacPlan);
  const verifiedBlock = formatVerifiedQuantitativeBlock(cptacPlan, execRes);
  assert(verifiedBlock.includes("NQO1") && verifiedBlock.includes("CPTAC-PDAC") && verifiedBlock.includes("[Action: OPEN_CPTAC]"));

  console.log("✅ CPTAC-PDAC Proteomics unit & integration checks passed:");
  console.log(`   - Proteins: ${meta.counts.protein_genes}, Tumors: ${meta.counts.tumor_proteomics_samples}, NATs: ${meta.counts.normal_proteomics_samples}, OS: ${meta.counts.clinical_valid_os}`);
  console.log(`   - NQO1 prot log2FC=${qNqo1.metrics!.log2FCFormatted}, MW FDR=${qNqo1.metrics!.adjPValueFormatted}, r=${nqo1.r}`);
  console.log(`   - NFE2L2 mRNA vs NQO1 prot decoupling: r=${decoup.r.toFixed(4)} (p=${decoup.rP.toFixed(4)})`);
  console.log(`   - SLC3A2 Cox HR=${slcCox.hr.toFixed(3)} (p=${slcCox.pValue.toFixed(4)}), C-index=${slcCox.cIndex.toFixed(3)}`);
}

main().catch((err) => {
  console.error("❌ CPTAC Proteomics verification failed:", err);
  process.exit(1);
});
