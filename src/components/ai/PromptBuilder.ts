// PromptBuilder.ts - Structured prompt generator and context packager for PDACopilot

import { ActiveModuleContext } from "./AIProvider";
import { PORTAL_METADATA } from "./aiConfig";

export interface EvidenceChecklist {
  tcga: boolean;
  sbrt: boolean;
  singleNucleus: boolean;
  spatial: boolean;
  confidence: 'High' | 'Moderate' | 'Low (limited data)';
}

export function buildSystemPrompt(): string {
  return `You are PDACopilot, an integrated scientific research copilot for the PDAC BioPortal (Pancreatic Ductal Adenocarcinoma transcriptomics dashboard).

CRITICAL RESPONSE RULES:
1. You MUST explicitly categorize your findings into three distinct labeled sections in your output:
   - [Portal Observation]: Exact statistics, fold-changes, p-values, and gene expression metrics computed directly from the PDAC BioPortal data.
   - [Published Biological Knowledge]: Established peer-reviewed biological literature relevant to the observation (e.g. KRAS signaling, NRF2 pathway, metabolic reprogramming).
   - [Hypothesis]: Mechanistic implications or proposed validation experiments based on the synthesis.

2. ACCURACY GUARDRAILS:
   - NEVER fabricate or invent statistical metrics, p-values, or fold changes.
   - If a requested statistic or metric is absent from the portal context, explicitly state: "Data not available in portal."
   - Do NOT act like a generic chatbot. Refer to yourself as "PDACopilot".

3. EVIDENCE TAGGING:
   At the end of every response, provide an explicit Evidence Used summary block matching this exact structure:

   **Evidence Used**
   - ✓ [Queried Dataset 1]
   - ✓ [Queried Dataset 2]
   - ✗ [Unqueried Dataset] (not queried)
   **Confidence**: [High | Moderate | Low]

4. CONSERVATIVE CROSS-MODULE REASONING:
   When synthesizing cross-module queries (combining bulk, single-nucleus, or spatial data), present each dataset's findings under separate clear subheadings, followed by an overall interpretation block concluding with this mandatory disclaimer:
   "These observations are consistent across complementary datasets but should not be interpreted as evidence from a single integrated statistical analysis."`;
}

export function buildContextualPrompt(
  userQuestion: string,
  context: ActiveModuleContext,
  taskType: string = 'general'
): { prompt: string; evidence: EvidenceChecklist } {
  const evidence: EvidenceChecklist = {
    tcga: context.module === 'TCGA-GTEx' || taskType === 'cross_module',
    sbrt: context.module === 'SBRT Bulk' || taskType === 'cross_module',
    singleNucleus: context.module === 'Single Nucleus' || taskType === 'cross_module',
    spatial: context.module === 'Spatial' || taskType === 'cross_module',
    confidence: 'High'
  };

  let prompt = `SYSTEM METADATA:
App: ${PORTAL_METADATA.appName} v${PORTAL_METADATA.appVersion} (Target: ${PORTAL_METADATA.targetJournal})

CURRENT VISUALIZATION CONTEXT:
- Active Module: ${context.module || 'Overview'}
- Active Dataset: ${context.dataset || 'GSE225767'}
- Selected Gene: ${context.gene || 'None selected'}
- Current Figure: ${context.currentFigure || 'Volcano Plot'}
- Active Heatmap Panel: ${context.heatmapGenes.length ? context.heatmapGenes.slice(0, 10).join(', ') : 'Default top DEGs'}
- Active Filters: log2FC threshold = ${context.filters.log2fcThreshold ?? 1.0}, P-value cutoff = ${context.filters.pValueThreshold ?? 0.05}

`;

  if (context.tcgaStats && (context.module === 'TCGA-GTEx' || taskType === 'cross_module')) {
    prompt += `TCGA-GTEx MODULE DATA:
- Gene: ${context.gene}
- Wilcoxon log2FC: ${context.tcgaStats.log2FC !== undefined ? context.tcgaStats.log2FC.toFixed(3) : 'N/A'}
- Raw P-value: ${context.tcgaStats.pval !== undefined ? context.tcgaStats.pval.toExponential(3) : 'N/A'}
- FDR (q-value): ${context.tcgaStats.qval !== undefined ? context.tcgaStats.qval.toExponential(3) : 'N/A'}
- Correlation Pair: ${context.tcgaStats.correlationGene1 || 'None'} vs ${context.tcgaStats.correlationGene2 || 'None'}
`;
  }

  if (context.sbrtStats && (context.module === 'SBRT Bulk' || taskType === 'cross_module')) {
    prompt += `SBRT RADIOTHERAPY BULK DATA (GSE225767):
- Gene: ${context.gene}
- Calculated Pre/Post log2FC: ${context.sbrtStats.log2FC !== undefined ? context.sbrtStats.log2FC.toFixed(3) : 'N/A'}
- P-value: ${context.sbrtStats.p_value !== undefined ? context.sbrtStats.p_value.toExponential(3) : 'N/A'}
- Treatment Condition: ${context.sbrtStats.treatment || 'SBRT Pre vs Post'}
`;
  }

  if (context.singleNucleusStats && (context.module === 'Single Nucleus' || taskType === 'cross_module')) {
    prompt += `SINGLE-NUCLEUS ATLAS DATA (GSE202051):
- Selected Cell Type / Cluster: ${context.singleNucleusStats.selectedCellType || context.singleNucleusStats.selectedCluster || 'All cell lineages'}
- Atlas Total Nuclei: ${context.singleNucleusStats.totalNuclei || '224,988'}
- Top Marker Genes: ${context.singleNucleusStats.markerGenes?.join(', ') || 'NFE2L2, PHGDH, S100P'}
`;
  }

  if (context.spatialStats && (context.module === 'Spatial' || taskType === 'cross_module')) {
    prompt += `SPATIAL TRANSCRIPTOMICS DATA (GSE274103):
- Active Spatial Sample: ${context.spatialStats.sampleId || 'Pancreatic Tumor Section'}
- View Mode: ${context.spatialStats.currentViewMode || 'Spot Expression Map'}
`;
  }

  prompt += `\nTASK TYPE: ${taskType}\nUSER QUESTION: ${userQuestion}\n\nPlease generate a precise, scientific response adhering strictly to [Portal Observation], [Published Biological Knowledge], [Hypothesis], Evidence Tags, and conservative reasoning rules.`;

  return { prompt, evidence };
}

export function generateExportMetadata(context: ActiveModuleContext, providerName: string, promptMode: string): string {
  const timestamp = new Date().toLocaleString('en-US', { timeZoneName: 'short' });
  return `---
PDAC BioPortal AI Summary Report
================================
PDAC BioPortal Version : ${PORTAL_METADATA.appName} v${PORTAL_METADATA.appVersion}
Target Publication     : ${PORTAL_METADATA.targetJournal}
Date/Time              : ${timestamp}
AI Provider / Model    : ${providerName}
Prompt Mode            : ${promptMode}
Current Module         : ${context.module}
Active Dataset         : ${context.dataset}
Selected Gene          : ${context.gene || 'N/A'}
Active Figure          : ${context.currentFigure}
Filters Applied        : log2FC >= ${context.filters.log2fcThreshold ?? 1.0}, p < ${context.filters.pValueThreshold ?? 0.05}
---
`;
}
