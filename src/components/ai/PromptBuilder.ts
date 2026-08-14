// PromptBuilder.ts - Grounded Prompt Generator with Strict Anti-Hallucination, Question Intent Lock, & Required-Answer Contract (v1.4 Scientific Evidence-Consistency)

import { ActiveModuleContext } from "./AIProvider";
import { PORTAL_METADATA } from "./aiConfig";
import { listAvailableDatasets } from "./DatasetRegistry";
import { QueryExecutionResult, QueryPlan } from "./IntentRouter";

export interface QuestionIntent {
  originalQuestion: string;
  requestedTask: string;
  requestedEntities: string[];
  requestedComparison: string;
  requiredDatasetIds: string[];
  requiredOutputType: string;
  currentPageContext: string;
  selectedGeneContext: string;
}

export interface EvidenceChecklist {
  tcga: boolean;
  sbrt: boolean;
  singleNucleus: boolean;
  spatial: boolean;
  confidence: 'High' | 'Moderate' | 'Low (limited data)' | 'Low';
}

export function buildQuestionIntent(
  userQuestion: string,
  plan: QueryPlan,
  currentPageContext: ActiveModuleContext
): QuestionIntent {
  const qLower = userQuestion.toLowerCase();
  
  let requiredOutputType = "analytical_summary";
  if (plan.intent === "list_available_datasets") requiredOutputType = "dataset_registry_overview";
  else if (plan.intent === "differential_expression_list") requiredOutputType = "gene_list_with_statistics";
  else if (plan.intent === "top_expressed_abundance") requiredOutputType = "abundance_ranking_list";
  else if (plan.intent === "cell_type_lineage_expression") requiredOutputType = "cell_type_distribution";
  else if (plan.intent === "spatial_localization") requiredOutputType = "spatial_tissue_localization";

  let requestedComparison = "none";
  if (plan.comparison?.type) requestedComparison = plan.comparison.type;
  else if (qLower.includes("tumor versus normal") || qLower.includes("tumor vs normal")) requestedComparison = "tumor_vs_normal";
  else if (qLower.includes("sbrt") || qLower.includes("radiation")) requestedComparison = "pre_vs_post_sbrt";

  return {
    originalQuestion: userQuestion,
    requestedTask: plan.intent,
    requestedEntities: plan.entities.genes,
    requestedComparison: requestedComparison,
    requiredDatasetIds: plan.targetDatasets,
    requiredOutputType: requiredOutputType,
    currentPageContext: `${currentPageContext.module} (${currentPageContext.dataset})`,
    selectedGeneContext: currentPageContext.gene || "None"
  };
}

export function buildRequiredAnswerContract(intentObj: QuestionIntent): string {
  const entityStr = intentObj.requestedEntities.length > 0 
    ? intentObj.requestedEntities.join(", ") 
    : "the specific biological subject asked in the question (NOT the currently selected gene)";
  
  const focusStr = intentObj.requestedEntities.length > 0 ? `\nMANDATORY BIOLOGICAL FOCUS: ${entityStr}` : "";

  let studyDesignRule = "Respect study design of the queried dataset. Do NOT mix cohort parameters across datasets.";
  if (intentObj.requiredDatasetIds.includes("tcga_gtex") && !intentObj.requiredDatasetIds.includes("gse225767")) {
    studyDesignRule = "Respect study design: TCGA-PAAD primary tumor (n=178) vs GTEx normal pancreas (n=167) independent cohort comparison. Do NOT cite pre/post SBRT cohort parameters.";
  } else if (intentObj.requiredDatasetIds.includes("gse225767")) {
    studyDesignRule = "Respect study design: GSE225767 is UNPAIRED pre-SBRT (n=26) vs post-SBRT (n=29) cohort resections (NOT longitudinal paired tracking).";
  }

  return `- Address EXCLUSIVELY the user's requested task: '${intentObj.requestedTask}' and entities: [${entityStr}].${focusStr}
- Use retrieved evidence from dataset(s): [${intentObj.requiredDatasetIds.join(", ")}].
- Required output format: ${intentObj.requiredOutputType}.
- STRICT CONSTRAINTS:
  1. Do NOT convert this question into an analysis of the selected page gene '${intentObj.selectedGeneContext}' unless '${intentObj.selectedGeneContext}' was explicitly asked in the question.
  2. If the user asked for a list of DEGs or available datasets, provide the full requested list rather than a single-gene summary.
  3. Distinguish statistically significant results (FDR < 0.05) from non-significant results (FDR >= 0.05) based strictly on QueryEngine outputs.
  4. Respect log2FC signs (log2FC > 0 = increased/upregulated in tumor; log2FC < 0 = decreased/downregulated in tumor).
  5. Do NOT invent uncalculated correlation coefficients (Pearson r), p-values, or sample sizes.
  6. ${studyDesignRule}
  7. Do NOT output meta-commentary, system prompt acknowledgments, or synthetic placeholders (e.g. "Let's assume..."). Output direct, grounded scientific analysis.`;
}


export function buildSystemPrompt(): string {
  const datasets = listAvailableDatasets();
  const registrySummary = datasets.map(d => `- **${d.name}** (${d.id}): ${d.modality.join(', ')} | Questions: ${d.biologicalQuestions.join('; ')} | Limitations: ${d.limitations.join('; ')}`).join('\n');

  return `You are PDACopilot, the integrated scientific research copilot for PDAC BioPortal (Pancreatic Ductal Adenocarcinoma transcriptomics dashboard).

GLOBAL DATASET REGISTRY & CAPABILITIES:
${registrySummary}

CONTEXT PRIORITY HIERARCHY (STRICT OVERRIDE RULES):
PRIORITY 1: Explicit user question
PRIORITY 2: Structured QuestionIntent & Required-Answer Contract
PRIORITY 3: Verified QueryEngine Tool Results
PRIORITY 4: Dataset Metadata
PRIORITY 5: Current page context (VISUAL HINT ONLY)
PRIORITY 6: Currently selected gene (VISUAL HINT ONLY)

CRITICAL INSTRUCTION ON CONTEXT SUBSTITUTION:
"The currently selected gene and active page are contextual state, not the user's requested biological target. Never substitute the selected gene/page for an entity or task that is not explicitly requested in the user question."

STRICT SCIENTIFIC EVIDENCE-CONSISTENCY & ANTI-HALLUCINATION RULES:

1. ABSOLUTE DATA GROUNDING & AUTHORITATIVE METRICS:
   - QueryEngine evidence is authoritative for portal-derived numerical claims.
   - Every log2FC, p-value, FDR, sample size, mean expression, or DEG count MUST be directly copied from QueryEngine tool results provided in the prompt.
   - Do NOT alter, replace, reverse, invent, or estimate portal-derived numerical values.
   - If QueryEngine does NOT provide a statistic, explicitly state: "The retrieved portal evidence does not provide this statistic."

2. LOG2FC DIRECTION & COMPARISON ORIENTATION:
   - If log2FC > 0 (e.g. KRAS log2FC = +1.9882 in TCGA-PAAD primary tumor vs normal pancreas), describe the gene as increased or upregulated in tumor.
   - If log2FC < 0 (e.g. PHGDH log2FC = -0.6031 in TCGA-PAAD primary tumor vs normal pancreas), describe the gene as decreased or downregulated in tumor relative to normal. NEVER describe log2FC < 0 as upregulated in tumor.

3. STATISTICAL SIGNIFICANCE PRECISION:
   - If FDR < 0.05 or p < 0.05, describe the result as statistically significant.
   - If FDR >= 0.05 or p >= 0.05 (e.g. KRAS in SBRT GSE225767: log2FC = +0.6332, p = 0.1130, FDR = 0.1996), explicitly state that the observed difference is NOT statistically significant.

4. ASSOCIATION / CORRELATION VS DIFFERENTIAL EXPRESSION:
   - Differential expression (tumor vs normal log2FC) is NOT a correlation coefficient.
   - If the user asks for correlation or association between genes (e.g. NRF2 and PHGDH/PSAT1/PSPH) and QueryEngine has NOT calculated a correlation coefficient (e.g. Pearson r), state explicitly: "The retrieved portal evidence reports differential expression metrics, but does not provide a calculated gene-gene correlation coefficient. Therefore, pairwise correlation cannot be established from the retrieved result." Do NOT invent uncalculated r or p values.

5. CAUSALITY SAFEGUARD:
   - Observational transcriptomics cannot prove causation. Distinguish transcriptomic associations from causal claims. State clearly that observed expression changes represent a transcriptomic association or hypothesis, not direct causal proof.

6. STUDY-DESIGN FIDELITY:
   - Match study design strictly to the queried dataset (TCGA-PAAD vs GTEx is primary tumor vs normal pancreas; GSE225767 is unpaired pre=26 vs post=29 SBRT). NEVER mix cohort parameters across datasets.


7. CITATION SAFETY & ZERO FAKE REFERENCES:
   - CITATION SAFETY & ZERO FAKE REFERENCES: NEVER create a formal bibliographic citation from model memory. Do NOT generate formal literature citations from memory (e.g., NEVER generate "Jones et al. (2019). KRAS mutations in pancreatic cancer. Nature...").
   - Do NOT generate unverified numbered citations such as (1), (2), or [1].
   - Use general wording such as "Published biological knowledge indicates..." without inventing author names, publication years, or paper titles.

8. DRAFTING & MANUSCRIPT GROUNDING INSTRUCTIONS:
   - DRAFTING & MANUSCRIPT GROUNDING INSTRUCTIONS: Organize a draft discussion as:
     1. Principal finding
     2. Interpretation
     3. Relationship to established biological knowledge
     4. Potential implications
     5. Limitations
     6. Future validation

9. ZERO META-COMMENTARY & DIRECT RESPONSE REQUIRED:
   - Do NOT output prompt-reading meta-commentary, system instruction recitations, or step-by-step thinking scripts (e.g. "Based on the provided context...", "To address this question...", "Step 1: Retrieve...").

10. ABSOLUTE PATHWAY GROUNDING:
   - Do NOT invent fake KEGG pathway IDs (e.g. hsa04020, hsa04210, hsa04010) or unverified pathway statistics.
   - Only cite pathway names, databases, NES, and FDR values provided in the Verified QueryEngine Data Output.
   - If Hallmark/Reactome gene sets were requested, report MSigDB Hallmark/Reactome pathways (e.g., HALLMARK_OXIDATIVE_PHOSPHORYLATION, REACTOME_SERINE_BIOSYNTHESIS) instead of fabricated KEGG hsa codes.


REQUIRED CONDITIONAL RESPONSE STRUCTURE:
Use Markdown headers adaptively based on question complexity:

1. Simple factual query (e.g. dataset discovery or gene availability):
### Answer
### Evidence

2. Analytical result:
### Answer
### Evidence
### Biological Interpretation

3. Study-design-sensitive result (e.g. GSE225767 unpaired cohorts or non-significant results):
### Answer
### Evidence
### Biological Interpretation
### Caveat

4. Result with associated BioPortal visualization:
### Answer
### Evidence
### Biological Interpretation
### Explore
Provide structured navigation links/buttons using exact format:
- [Action: OPEN_DEG | Dataset: TCGA-PAAD]
- [Action: OPEN_GSEA | Dataset: GSE225767]
- [Action: OPEN_PATHWAYS | Dataset: TCGA-PAAD]
- [Action: OPEN_SPATIAL | Gene: <GENE>]
- [Action: OPEN_SINGLE_NUCLEUS | Gene: <GENE>]
`;

}

export function buildContextualPrompt(
  userQuestion: string,
  currentPageContext: ActiveModuleContext,
  executionResult: QueryExecutionResult,
  correctionDirective?: string
): {
  prompt: string;
  evidence: EvidenceChecklist;
  provenanceText: string;
  questionIntent: QuestionIntent;
} {
  const plan = executionResult.plan;
  const questionIntent = buildQuestionIntent(userQuestion, plan, currentPageContext);
  const contract = buildRequiredAnswerContract(questionIntent);

  const evidence: EvidenceChecklist = {
    tcga: plan.targetDatasets.includes("tcga_gtex"),
    sbrt: plan.targetDatasets.includes("gse225767"),
    singleNucleus: plan.targetDatasets.includes("gse202051"),
    spatial: plan.targetDatasets.includes("gse274103"),
    confidence: executionResult.confidence
  };

  // Build provenance summary
  const provenanceLines = executionResult.provenance.map(p => {
    const symbol = p.status === "success" ? "✓" : p.status === "failed" ? "✗" : "○";
    return `- ${symbol} **${p.datasetName}**: ${p.queryDetails || p.status}`;
  });

  const provenanceText = `**Evidence Used**\n${provenanceLines.join("\n")}\n**Confidence**: ${executionResult.confidence}`;

  // Format QueryEngine tool results for LLM context with Deterministic Markdown Tables
  let toolDataText = "";
  if (executionResult.datasetResults.availableDatasets) {
    toolDataText += `\n[DETERMINISTIC DATASET REGISTRY OVERVIEW TABLE]\n` +
      `| Dataset ID | Name | Modality | Biological Question |\n|---|---|---|---|\n` +
      executionResult.datasetResults.availableDatasets.map((d: any) =>
        `| \`${d.id}\` | **${d.name}** | ${d.modality.join(', ')} | ${d.biologicalQuestions[0]} |`
      ).join('\n') + '\n';
  }

  if (executionResult.datasetResults.tcga_gtex) {
    const tcga: any = executionResult.datasetResults.tcga_gtex;
    if (tcga.type === "gene" && tcga.found && tcga.metrics) {
      toolDataText += `\n[DETERMINISTIC METRIC TABLE: TCGA-PAAD vs GTEx Normal]\n` +
        `| Dataset | Gene | Comparison | Wilcoxon log2FC | Direction | Raw P-value | Adjusted P-value (FDR) | Significance |\n` +
        `|---|---|---|---|---|---|---|---|\n` +
        `| TCGA-PAAD vs GTEx | **${tcga.gene}** | Primary Tumor (n=178) vs Normal (n=167) | \`${tcga.metrics.log2FCFormatted}\` | ${tcga.metrics.log2FC > 0 ? "Upregulated in Tumor" : "Downregulated in Tumor"} | \`${tcga.metrics.pValueFormatted}\` | \`${tcga.metrics.adjPValueFormatted}\` | ${tcga.metrics.significanceSummary} |\n`;
    } else if (tcga.type === "differential" && tcga.success) {
      const topDegs = tcga.topDegs?.slice(0, 10).map((g: any, i: number) => `| ${i+1} | **${g.symbol}** | \`${g.log2FCFormatted}\` | \`${g.adjPValueFormatted}\` |`).join('\n') || '';
      toolDataText += `\n[DETERMINISTIC DEG TABLE: TCGA-PAAD vs GTEx (Filtered DEGs: ${tcga.filteredCount})]\n` +
        `| Rank | Gene Symbol | log2FC | FDR (q-value) |\n|---|---|---|---|\n${topDegs}\n`;
    } else if (tcga.pathways && Array.isArray(tcga.pathways) && tcga.pathways.length > 0) {
      const topP = tcga.pathways.slice(0, 10).map((p: any, i: number) =>
        `| ${i+1} | **${p.pathwayName}** | ${p.database || 'MSigDB'} | \`${p.nes !== undefined ? p.nes.toFixed(2) : 'N/A'}\` | \`${p.adjPValue !== undefined ? (p.adjPValue < 0.0001 ? p.adjPValue.toExponential(2) : p.adjPValue.toFixed(4)) : 'N/A'}\` | ${p.direction || 'Upregulated'} |`
      ).join('\n');
      toolDataText += `\n[DETERMINISTIC PATHWAY TABLE: TCGA-GTEx (Total Enriched Pathways: ${tcga.totalEnrichedPathways || tcga.pathways.length})]\n` +
        `| Rank | Pathway Name | Database | NES | FDR | Direction |\n|---|---|---|---|---|---|\n${topP}\n`;
    }
  }

  if (executionResult.datasetResults.gse225767) {
    const sbrt: any = executionResult.datasetResults.gse225767;
    toolDataText += `\n[SBRT GSE225767 DATASET COHORT STRUCTURE]\n` +
      `* Total Bulk RNA-seq Samples: 55 samples\n` +
      `* Pre-SBRT Cohort: 26 patients (untreated pre-irradiation resections)\n` +
      `* Post-SBRT Cohort: 29 patients (post-radiotherapy resections)\n` +
      `* Study Design: Unpaired pre/post SBRT cohorts (NOT longitudinal paired tracking).\n` +
      `* Clinical Annotations: GSE225767 does NOT contain Kaplan-Meier (KM) survival or overall survival clinical metadata.\n`;

    if (sbrt.type === "gene" && sbrt.found && sbrt.metrics) {
      toolDataText += `\n[DETERMINISTIC METRIC TABLE: SBRT GSE225767 Post vs Pre]\n` +
        `| Dataset | Gene | Comparison | Calculated log2FC | Direction | Raw P-value | Adjusted P-value (FDR) | Significance |\n` +
        `|---|---|---|---|---|---|---|---|\n` +
        `| GSE225767 SBRT | **${sbrt.gene}** | Post-SBRT (n=29) vs Pre-SBRT (n=26) Unpaired | \`${sbrt.metrics.log2FCFormatted}\` | ${sbrt.metrics.log2FC > 0 ? "Increased post-SBRT" : "Decreased post-SBRT"} | \`${sbrt.metrics.pValueFormatted}\` | \`${sbrt.metrics.adjPValueFormatted}\` | ${sbrt.metrics.significanceSummary} |\n`;
    } else if (sbrt.pathways && Array.isArray(sbrt.pathways) && sbrt.pathways.length > 0) {
      const topP = sbrt.pathways.slice(0, 10).map((p: any, i: number) =>
        `| ${i+1} | **${p.pathwayName}** | ${p.database || 'MSigDB'} | \`${p.nes !== undefined ? p.nes.toFixed(2) : 'N/A'}\` | \`${p.adjPValue !== undefined ? (p.adjPValue < 0.0001 ? p.adjPValue.toExponential(2) : p.adjPValue.toFixed(4)) : 'N/A'}\` | ${p.direction || 'Upregulated'} |`
      ).join('\n');
      toolDataText += `\n[DETERMINISTIC PATHWAY TABLE: SBRT GSE225767 (Total Enriched Pathways: ${sbrt.totalEnrichedPathways || sbrt.pathways.length})]\n` +
        `| Rank | Pathway Name | Database | NES | FDR | Direction |\n|---|---|---|---|---|---|\n${topP}\n`;
    } else if (sbrt.type === "differential" || sbrt.success) {
      const topSbrt = sbrt.topDegs?.slice(0, 10).map((g: any, i: number) => `| ${i+1} | **${g.symbol}** | \`${g.log2FCFormatted}\` | \`${g.pValueFormatted}\` |`).join('\n') || '';
      toolDataText += `\n[DETERMINISTIC SBRT DEG TABLE: GSE225767 (Filtered DEGs: ${sbrt.filteredCount || 304})]\n` +
        `| Rank | Gene Symbol | log2FC | P-value |\n|---|---|---|---|\n${topSbrt}\n`;
    }
  }

  if (executionResult.datasetResults.gse202051) {
    const sn: any = executionResult.datasetResults.gse202051;
    if (sn.found && sn.metrics) {
      toolDataText += `\n[DETERMINISTIC SINGLE-NUCLEUS TABLE: GSE202051]\n` +
        `| Gene | Highest Expressing Lineage | Atlas Nuclei Count |\n|---|---|---|\n` +
        `| **${sn.gene}** | ${sn.topLineage} | 224,988 nuclei across 43 patients |\n`;
    }
  }

  if (executionResult.datasetResults.gse274103) {
    const spatial: any = executionResult.datasetResults.gse274103;
    if (spatial.found && spatial.metrics) {
      toolDataText += `\n[DETERMINISTIC SPATIAL VISIUM TABLE: GSE274103]\n` +
        `| Gene | Sample ID | Tissue Region / Localization | Max Spot Expression |\n|---|---|---|---|\n` +
        `| **${spatial.gene}** | ${spatial.metrics.sampleId} | ${spatial.metrics.spatialDescription} | \`${spatial.metrics.maxSpotExprFormatted}\` |\n`;
    }
  }


  const correctionBlock = correctionDirective ? `\n[CORRECTION DIRECTIVE - RETRY MANDATE]\n${correctionDirective}\n` : "";

  const heatmapGenesStr = currentPageContext.heatmapGenes && currentPageContext.heatmapGenes.length > 0 
    ? currentPageContext.heatmapGenes.join(', ')
    : "None";

  const quantitativeNotice = (executionResult.datasetResults.tcga_gtex?.metrics || executionResult.datasetResults.gse225767?.metrics)
    ? "\n[MANDATORY NO-TABLE RULE]\n" +
      "A verified BioPortal quantitative evidence table is AUTOMATICALLY rendered above your text response.\n" +
      "DO NOT generate Markdown tables or log2FC/FDR numbers in your text.\n" +
      "DO NOT invent or recalculate quantitative values.\n" +
      "Provide ONLY plain-text biological interpretation, functional mechanism in PDAC, and study caveats.\n"
    : "";

  const prompt = `[SYSTEM METADATA]
Active Module: ${currentPageContext.module} (${currentPageContext.dataset})
Selected Page Gene Context (VISUAL HINT ONLY): ${currentPageContext.gene || "None"}
Active Heatmap Genes in Context: ${heatmapGenesStr}


[PRIORITY 1: EXPLICIT USER QUESTION]
"${userQuestion}"

[PRIORITY 2: QUESTION INTENT LOCK & REQUIRED-ANSWER CONTRACT]
Requested Task: ${questionIntent.requestedTask}
Requested Entities: ${questionIntent.requestedEntities.length > 0 ? questionIntent.requestedEntities.join(', ') : 'None explicitly requested'}
Target Datasets: [${questionIntent.requiredDatasetIds.join(', ')}]
Required Output Type: ${questionIntent.requiredOutputType}

REQUIRED-ANSWER CONTRACT:
${contract}
${correctionBlock}
${quantitativeNotice}
[PRIORITY 3: VERIFIED QUERY ENGINE DATA OUTPUT]
${toolDataText || "No dataset metrics required for this specific question intent."}

Provide a direct, grounded, publication-ready scientific response adhering to the CONTEXT PRIORITY HIERARCHY and REQUIRED RESPONSE STRUCTURE.`;


  return {
    prompt,
    evidence,
    provenanceText,
    questionIntent
  };
}

export function generateExportMetadata(
  context: ActiveModuleContext,
  providerName: string,
  promptMode: string = "Context-Aware Research Summary"
): string {
  return `---
PDAC BioPortal AI Summary Report
================================
PDAC BioPortal Version : ${PORTAL_METADATA.appVersion}
Target Publication     : ${PORTAL_METADATA.targetJournal}
Date/Time              : ${new Date().toLocaleString()}
AI Provider / Model    : ${providerName}
Prompt Mode            : ${promptMode}
Current Route          : ${context.module}
Active Dataset         : ${context.dataset}
Selected Gene          : ${context.gene || "None"}
Active Figure          : ${context.currentFigure}
Notice                 : AI-assisted draft — independently verify numerical results, citations, biological interpretations, and scientific claims before use.
---`;
}
