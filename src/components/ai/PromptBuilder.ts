// PromptBuilder.ts - Grounded Prompt Generator with Strict Anti-Hallucination, Scientific Draft Grounding, & Citation Safety (v1.2 Final)

import { ActiveModuleContext } from "./AIProvider";
import { PORTAL_METADATA } from "./aiConfig";
import { listAvailableDatasets } from "./DatasetRegistry";
import { QueryExecutionResult } from "./IntentRouter";

export interface EvidenceChecklist {
  tcga: boolean;
  sbrt: boolean;
  singleNucleus: boolean;
  spatial: boolean;
  confidence: 'High' | 'Moderate' | 'Low (limited data)' | 'Low';
}

export function buildSystemPrompt(): string {
  const datasets = listAvailableDatasets();
  const registrySummary = datasets.map(d => `- **${d.name}** (${d.id}): ${d.modality.join(', ')} | Questions: ${d.biologicalQuestions.join('; ')} | Limitations: ${d.limitations.join('; ')}`).join('\n');

  return `You are PDACopilot, the integrated scientific research copilot for PDAC BioPortal (Pancreatic Ductal Adenocarcinoma transcriptomics dashboard).

GLOBAL DATASET REGISTRY & CAPABILITIES:
${registrySummary}

STRICT GROUNDING & ANTI-HALLUCINATION RULES:
1. ABSOLUTE DATA GROUNDING:
   - Every dataset-specific numerical value, gene-level statistic, fold-change, p-value, adjusted p-value, sample size, gene count, or rank in [Portal Observation] MUST be directly supported by and copied from the QueryEngine tool output provided in the prompt.
   - You are NOT permitted to invent, estimate, or extrapolate missing portal statistics.
   - If a requested gene or metric is absent or query failed, explicitly state in [Portal Observation]: "The requested portal statistic could not be retrieved because the gene was not successfully resolved in the selected dataset."

2. CITATION SAFETY & ZERO FAKE REFERENCES:
   - NEVER create a formal bibliographic citation from model memory. Do NOT generate formal literature citations from memory (e.g., NEVER generate "Jones et al. (2019). KRAS mutations in pancreatic cancer. Nature...").
   - Do NOT generate unverified numbered citations such as (1), (2), or [1].
   - Use general wording such as "Published biological knowledge indicates..." without inventing author names, publication years, or paper titles.

3. DRAFTING & MANUSCRIPT GROUNDING INSTRUCTIONS:
   - When generating a "Draft manuscript section" or "Draft discussion":
     * Generate a draft based ONLY on evidence available from PDAC BioPortal and the structured QueryEngine results provided.
     * Do NOT invent experimental results, numerical values, sample sizes, statistical results, methods, datasets, biological mechanisms, citations, or literature findings.
     * Do NOT transform correlation or association into causal claims.
     * Do NOT claim therapeutic efficacy unless the supplied evidence directly supports such a conclusion.
     * Clearly distinguish: observed portal results, established biological knowledge, and interpretation/hypothesis.
     * If information required for a manuscript statement is unavailable, explicitly state that it is unavailable.
   - Organize a "Draft discussion" as:
     1. Principal finding
     2. Interpretation
     3. Relationship to established biological knowledge
     4. Potential implications
     5. Limitations
     6. Future validation

4. ACTION INTENT GUIDELINES:
   - "PDAC relevance": Summarize the established biological relevance of queried gene(s)/pathways to PDAC. Must NOT imply causal importance, therapeutic validation, clinical utility, or biomarker validation unless supported by empirical data.
   - "Radiotherapy relevance": Distinguish Portal evidence, Published biological knowledge, and Hypothesis. Never convert a non-significant portal result into a significant radiation-response claim (e.g. if p = 0.113, state "showed a numerical increase after SBRT, but the difference was not statistically significant in this cohort").
   - "Presentation summary": Prioritize: 1. Key finding, 2. Supporting quantitative evidence, 3. Biological interpretation, 4. Limitation. Suitable as a starting point for a presentation, not publication-ready text.
   - "Cross-module summary": Explicitly state that independent datasets (bulk TCGA, bulk SBRT, snRNA-seq, spatial Visium) represent independent studies/cohorts and provide complementary rather than matched multi-omic evidence. Do NOT combine statistics as if from the same patients.

5. STATISTICAL TERMINOLOGY & FDR PRECISION:
   - When p < 0.05 but FDR >= 0.05, do NOT describe the result as "FDR-significant".
   - Use exact terminology: "nominally significant by the unadjusted p-value (p < 0.05), but not significant after FDR correction (FDR >= 0.05)."
   - If a gene metric has p >= 0.05 or FDR >= 0.05 (e.g. KRAS in SBRT GSE225767: log2FC = +2.1103, p = 0.4698), explicitly state that the observed difference is NOT statistically significant.

6. DISTINGUISH STATISTICAL RANKING FROM BIOLOGICAL RELEVANCE:
   - Do NOT equate the largest log2FC with "strongest biological association with pancreatic cancer".
   - Rank strictly by statistical metrics in [Portal Observation] and evaluate biological context in [Published Biological Knowledge].

7. QUERY-SPECIFIC BIOLOGICAL RELEVANCE GUARDRAIL (NO KNOWLEDGE DRIFT):
   - The [Published Biological Knowledge] section MUST be centered strictly on the queried gene(s) or returned QueryEngine entities.
   - Do NOT insert unmentioned generic PDAC drivers (such as KRAS, NRF2, PHGDH) into TP53, serine biosynthesis, or SBRT DEG queries unless directly relevant.

8. THREE MANDATORY RESPONSE SECTIONS:
   - [Portal Observation]: Derived ONLY from QueryEngine output results.
   - [Published Biological Knowledge]: Established peer-reviewed biological context relevant strictly to queried entities (no fake citations).
   - [Hypothesis]: Clearly labeled interpretation without overstating causality or clinical utility.

9. EVIDENCE PROVENANCE TAGGING:
   At the end of every response, provide an explicit Evidence Used section matching ACTUAL execution provenance logs:

   **Evidence Used**
   - ✓ [Queried Dataset 1] — [Query detail / comparison]
   - ○ [Unqueried Dataset 2] — Not queried for this question
   - ○ [Failed Dataset 3] — Query failed: [Reason]
   **Confidence**: [High | Moderate | Low]`;
}

export function buildContextualPrompt(
  userQuestion: string,
  currentPageContext: ActiveModuleContext,
  executionResult: QueryExecutionResult
): { prompt: string; evidence: EvidenceChecklist; provenanceText: string } {
  const { plan, datasetResults, provenance, confidence } = executionResult;

  // Single Source of Truth Evidence Checklist
  const tcgaItem = provenance.find(p => p.datasetId === "tcga_gtex");
  const sbrtItem = provenance.find(p => p.datasetId === "gse225767");
  const snItem = provenance.find(p => p.datasetId === "gse202051");
  const spatialItem = provenance.find(p => p.datasetId === "gse274103");

  const evidence: EvidenceChecklist = {
    tcga: tcgaItem?.status === "success",
    sbrt: sbrtItem?.status === "success",
    singleNucleus: snItem?.status === "success",
    spatial: spatialItem?.status === "success",
    confidence: confidence
  };

  // Format single unified provenance text block
  let provenanceText = "**Evidence Used**\n";
  provenance.forEach(p => {
    if (p.status === "success") {
      provenanceText += `- ✓ **${p.datasetName}**: ${p.queryDetails || "Queried successfully"}\n`;
    } else if (p.status === "failed") {
      provenanceText += `- ○ **${p.datasetName}**: Query failed — ${p.queryDetails || "Gene not found"}\n`;
    } else {
      provenanceText += `- ○ **${p.datasetName}**: Not queried for this question\n`;
    }
  });

  provenanceText += `**Confidence**: ${confidence}\n`;

  // Determine target biological entities for biological relevance guardrail
  const targetedGenes: string[] = [...plan.entities.genes];

  // If a list query was executed, append returned top genes to targeted list
  Object.values(datasetResults).forEach((res: any) => {
    if (res && res.topUpregulated) {
      res.topUpregulated.forEach((d: any) => {
        if (d.gene && !targetedGenes.includes(d.gene)) targetedGenes.push(d.gene);
      });
    }
    if (res && res.genes) {
      res.genes.forEach((g: any) => {
        if (g.gene && !targetedGenes.includes(g.gene)) targetedGenes.push(g.gene);
      });
    }
  });

  const focusEntitiesString = targetedGenes.length > 0 ? targetedGenes.join(", ") : "the user's specific query subject";

  let prompt = `SYSTEM METADATA:
App: ${PORTAL_METADATA.appName} v${PORTAL_METADATA.appVersion} (Target: ${PORTAL_METADATA.targetJournal})

==================================================
1. CURRENT PAGE CONTEXT (VISUAL HINT ONLY)
==================================================
- Mounted Page / Route: ${currentPageContext.module} (${currentPageContext.dataset})
- Currently Visible Figure: ${currentPageContext.currentFigure}
- Currently Highlighted Gene: ${currentPageContext.gene || 'None'}

==================================================
2. QUERY PLAN & ROUTER DECISION
==================================================
- User Question: "${userQuestion}"
- Detected Intent: ${plan.intent}
- Identified Target Gene(s): ${plan.entities.genes.join(', ') || 'None'}
- Targeted Dataset(s): ${plan.targetDatasets.join(', ')}
- Router Reasoning: ${plan.reasoning}
- MANDATORY BIOLOGICAL FOCUS: ${focusEntitiesString}

[STRICT RELEVANCE & DRAFT GROUNDING INSTRUCTIONS]:
1. Focus EXCLUSIVELY on ${focusEntitiesString} in [Published Biological Knowledge].
2. Do NOT invent formal citations (e.g. Jones et al. 2019) or numbered citations (1).
3. If drafting a manuscript/discussion, ground strictly in provided QueryEngine outputs and distinguish observed results, biological knowledge, and hypotheses.
4. When p < 0.05 but FDR >= 0.05, state: "nominally significant by unadjusted p-value, but not significant after FDR correction."
5. If this is a cross-module summary, state that independent studies provide complementary rather than matched multi-omic evidence.

==================================================
3. VERIFIED QUERY ENGINE DATA OUTPUT (EXACT GROUNDING TRUTH)
==================================================
`;

  // Inject TCGA-GTEx execution results
  if (datasetResults.tcga_gtex) {
    const res = datasetResults.tcga_gtex as any;
    if (res.genes && res.analysisType) {
      prompt += `[TCGA-GTEx Top Expressed Abundance Tool Result - SUCCESS]:
- Analysis Type: ${res.analysisType}
- Group Specified: ${res.groupSpecified}
- Distinction Note: ${res.distinctionNote}
- Top ${res.genes.length} Expressed Genes: ${res.genes.map((g: any) => `${g.gene} (Mean Abundance=${g.meanExpressionFormatted}, Tumor=${g.tumorMeanFormatted}, Normal=${g.normalMeanFormatted})`).join(', ')}
`;
    } else if (res.found && res.metrics) {
      prompt += `[TCGA-GTEx Tool Result - SUCCESS]:
- Gene: ${res.gene}
- Comparison: ${res.comparisonLabel}
- Wilcoxon log2FC: ${res.metrics.log2FCFormatted}
- Raw P-value: ${res.metrics.pValueFormatted}
- FDR (q-value): ${res.metrics.adjPValueFormatted}
- Tumor Mean: ${res.metrics.tumorMeanFormatted}
- Normal Mean: ${res.metrics.normalMeanFormatted}
- Statistical Summary: ${res.metrics.significanceSummary}
`;
    } else if (res.filteredCount !== undefined) {
      prompt += `[TCGA-GTEx Differential Expression Tool Result - SUCCESS]:
- Comparison: TCGA-PAAD Primary Tumor (n=178) vs GTEx Normal Pancreas (n=167)
- Default Portal Criteria: Wilcoxon FDR < ${res.thresholdsUsed.fdr}, |log2FC| >= ${res.thresholdsUsed.log2FC}
- Total Genes in Dataset: ${res.totalGenes}
- Filtered DEG Count: ${res.filteredCount}
- Top Upregulated DEGs (${res.topUpregulated.length} returned): ${res.topUpregulated.map((d: any) => `${d.gene} (log2FC=${d.log2FCFormatted}, FDR=${d.adjPValueFormatted})`).join(', ')}
- Top Downregulated DEGs (${res.topDownregulated.length} returned): ${res.topDownregulated.map((d: any) => `${d.gene} (log2FC=${d.log2FCFormatted}, FDR=${d.adjPValueFormatted})`).join(', ')}
`;
    } else {
      prompt += `[TCGA-GTEx Tool Result - FAILED]:
- Query Status: FAILED
- Gene: '${plan.entities.genes[0] || 'Requested gene'}' was NOT found in TCGA-GTEx.
- MODEL INSTRUCTION: State in [Portal Observation] that the requested portal statistic could not be retrieved because the gene was not resolved in TCGA-GTEx.
`;
    }
  }

  // Inject SBRT execution results
  if (datasetResults.gse225767) {
    const res = datasetResults.gse225767 as any;
    if (res.genes && res.analysisType) {
      prompt += `[SBRT GSE225767 Top Expressed Abundance Tool Result - SUCCESS]:
- Analysis Type: ${res.analysisType}
- Group Specified: ${res.groupSpecified}
- Distinction Note: ${res.distinctionNote}
- Top ${res.genes.length} Expressed Genes: ${res.genes.map((g: any) => `${g.gene} (Mean Abundance=${g.meanExpressionFormatted}, Pre=${g.preMeanFormatted}, Post=${g.postMeanFormatted})`).join(', ')}
`;
    } else if (res.found && res.metrics) {
      prompt += `[SBRT GSE225767 Tool Result - SUCCESS]:
- Gene: ${res.gene}
- Comparison: ${res.comparisonLabel}
- Calculated Pre/Post log2FC: ${res.metrics.log2FCFormatted}
- Raw P-value: ${res.metrics.pValueFormatted}
- Adjusted P-value (FDR): ${res.metrics.adjPValueFormatted}
- Pre Mean: ${res.metrics.preMeanFormatted}, Post Mean: ${res.metrics.postMeanFormatted}
- Statistical Summary: ${res.metrics.significanceSummary}
`;
    } else if (res.filteredCount !== undefined) {
      prompt += `[SBRT GSE225767 Differential Expression Tool Result - SUCCESS]:
- Comparison: Post-SBRT (n=29) vs Pre-SBRT (n=26) Unpaired Cohorts
- Default Portal Criteria: p < ${res.thresholdsUsed.pValue}, |log2FC| >= ${res.thresholdsUsed.log2FC}
- Total Genes in Dataset: ${res.totalGenes}
- Filtered SBRT DEG Count: ${res.filteredCount}
- Top Upregulated SBRT DEGs (${res.topUpregulated.length} returned): ${res.topUpregulated.map((d: any) => `${d.gene} (log2FC=${d.log2FCFormatted}, p=${d.pValueFormatted})`).join(', ')}
- Top Downregulated SBRT DEGs (${res.topDownregulated.length} returned): ${res.topDownregulated.map((d: any) => `${d.gene} (log2FC=${d.log2FCFormatted}, p=${d.pValueFormatted})`).join(', ')}
`;
    } else {
      prompt += `[SBRT GSE225767 Tool Result - FAILED]:
- Query Status: FAILED
- Gene: '${plan.entities.genes[0] || 'Requested gene'}' was NOT found in SBRT dataset.
- MODEL INSTRUCTION: State in [Portal Observation] that the requested portal statistic could not be retrieved because the gene was not resolved in SBRT dataset.
`;
    }
  }

  // Inject Single Nucleus execution results
  if (datasetResults.gse202051) {
    const res = datasetResults.gse202051;
    if (res.found) {
      prompt += `[Single-Nucleus GSE202051 Tool Result - SUCCESS]:
- Gene: ${res.gene}
- Atlas Nuclei: 224,988 across 43 patients
- Highest Expressing Lineage: ${res.topLineage}
- Lineage Expression Breakdown: ${res.broadCellTypes.map(c => `${c.type}: mean=${c.meanExpr}, ${c.pctPositive}% pos`).join('; ')}
`;
    } else {
      prompt += `[Single-Nucleus GSE202051 Tool Result - FAILED]:
- Query Status: FAILED
- Gene: '${plan.entities.genes[0] || 'Requested gene'}' NOT found in single-nucleus index.
`;
    }
  }

  // Inject Spatial execution results
  if (datasetResults.gse274103) {
    const res = datasetResults.gse274103;
    if (res.found) {
      prompt += `[Spatial Transcriptomics GSE274103 Tool Result - SUCCESS]:
- Gene: ${res.gene}
- Sample ID: ${res.sampleId}
- Max Spot Expression: ${res.maxSpotExpr}
- Spatial Description: ${res.description}
`;
    } else {
      prompt += `[Spatial Transcriptomics GSE274103 Tool Result - FAILED]:
- Query Status: FAILED
- Gene: '${plan.entities.genes[0] || 'Requested gene'}' NOT found in spatial index.
`;
    }
  }

  if (datasetResults.availableDatasets) {
    prompt += `[Global Datasets Summary]:
${datasetResults.availableDatasets.map((d: any) => `- ${d.name} (${d.accession}): ${d.biologicalQuestions.join(', ')}`).join('\n')}
`;
  }

  prompt += `\nPlease generate a grounded scientific answer adhering strictly to [Portal Observation], [Published Biological Knowledge] (focused exclusively on ${focusEntitiesString}), [Hypothesis], and Provenance guidelines.`;

  return { prompt, evidence, provenanceText };
}

export function generateExportMetadata(currentPageContext: ActiveModuleContext, providerName: string, promptMode: string): string {
  const timestamp = new Date().toLocaleString('en-US', { timeZoneName: 'short' });
  return `---
PDAC BioPortal AI Summary Report
================================
PDAC BioPortal Version : ${PORTAL_METADATA.appName} v${PORTAL_METADATA.appVersion}
Target Publication     : ${PORTAL_METADATA.targetJournal}
Date/Time              : ${timestamp}
AI Provider / Model    : ${providerName}
Prompt Mode            : ${promptMode}
Current Route          : ${currentPageContext.module}
Active Dataset         : ${currentPageContext.dataset}
Selected Gene          : ${currentPageContext.gene || 'N/A'}
Active Figure          : ${currentPageContext.currentFigure}
Notice                 : AI-assisted draft — independently verify numerical results, citations, biological interpretations, and scientific claims before use.
---
`;
}
