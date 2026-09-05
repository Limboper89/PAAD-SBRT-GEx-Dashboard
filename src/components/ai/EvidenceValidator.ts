// EvidenceValidator.ts - Scientific Evidence-Consistency & Anti-Hallucination Validator for PDACopilot (v1.4)

import { QueryExecutionResult, QueryPlan } from "./IntentRouter";

export interface ValidationError {
  type: 
    | "NUMERICAL_CONTRADICTION"
    | "UNSUPPORTED_NUMERICAL_CLAIM"
    | "LOG2FC_SIGN_REVERSAL"
    | "SIGNIFICANCE_REVERSAL"
    | "DATASET_SUBSTITUTION"
    | "ASSOCIATION_HALLUCINATION"
    | "CAUSAL_OVERCLAIM"
    | "STUDY_DESIGN_ERROR"
    | "FORMAT_MISMATCH";
  message: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  expected?: string;
  actual?: string;
}

export interface ValidationWarning {
  type: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  correctionDirective?: string;
  sanitizedResponse?: string;
}

export class EvidenceValidator {
  /**
   * Main validation engine for Gemini generated scientific answers
   */
  public static validateResponse(
    question: string,
    plan: QueryPlan,
    responseText: string,
    executionResult: QueryExecutionResult,
    selectedPageGene?: string
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const qLower = question.toLowerCase();
    const respLower = responseText.toLowerCase();

    // 1. Study-Design Validation (GSE225767)
    this.validateStudyDesign(qLower, respLower, plan, executionResult, errors);

    // 2. Dataset Identity & Substitution Validation
    this.validateDatasetIdentity(respLower, plan, errors);

    // 3. Log2FC Sign & Direction Validation
    this.validateLog2FCSign(respLower, executionResult, errors);

    // 4. Statistical Significance Threshold Validation
    this.validateStatisticalSignificance(respLower, executionResult, errors);

    // 5. Association vs Differential Expression Safeguard
    this.validateAssociationVsDifferential(qLower, respLower, plan, executionResult, errors);

    // 6. Causality Safeguard
    this.validateCausality(qLower, respLower, errors);

    // 7. Numerical Contradiction & Provenance Check
    this.validateNumericalProvenance(respLower, executionResult, errors);

    // 8. Pathway & GSEA / ORA Metric Validation
    this.validatePathwayResults(respLower, plan, executionResult, errors);

    // 9. Impossible Value Validation (percentages > 100%, FDR/p-value outside [0, 1])
    this.validateImpossibleValues(respLower, errors);


    const isValid = errors.filter(e => e.severity === "CRITICAL" || e.severity === "HIGH").length === 0;


    let correctionDirective: string | undefined = undefined;
    if (!isValid) {
      const topErrors = errors.map(e => `[${e.type}]: ${e.message}`).join("\n");
      correctionDirective = `MANDATORY SCIENTIFIC CORRECTION DIRECTIVE:\nYour previous response failed evidence-consistency checks:\n${topErrors}\n\nRE-GENERATE ANSWER WITH STRICT EVIDENCE FIDELITY:\n1. Copy exact numerical metrics from QueryEngine tool results.\n2. Do NOT invent uncalculated correlation coefficients, p-values, or sample sizes.\n3. Respect log2FC signs (positive = upregulated, negative = downregulated).\n4. Respect study design (GSE225767 is an UNPAIRED pre=26 vs post=29 cohort comparison).\n5. Clearly separate Portal Evidence from Biological Hypotheses.`;
    }

    return {
      isValid,
      errors,
      warnings,
      correctionDirective,
      sanitizedResponse: isValid ? responseText : this.sanitizeResponse(responseText, errors)
    };
  }

  /**
   * Validate GSE225767 Study Design (Unpaired pre=26 vs post=29)
   */
  private static validateStudyDesign(
    qLower: string,
    respLower: string,
    plan: QueryPlan,
    executionResult: QueryExecutionResult,
    errors: ValidationError[]
  ): void {
    if (plan.targetDatasets.includes("gse225767") || qLower.includes("sbrt")) {
      // Check for longitudinal individual tracking claim
      const claimsPairedLongitudinal = 
        respLower.includes("individual patient's expression changed") ||
        respLower.includes("tracked each patient before and after") ||
        respLower.includes("longitudinal paired tracking") ||
        respLower.includes("same patients before and after");

      if (claimsPairedLongitudinal) {
        errors.push({
          type: "STUDY_DESIGN_ERROR",
          message: "GSE225767 is an UNPAIRED cohort comparison (26 pre-SBRT vs 29 post-SBRT resections), NOT a longitudinal paired patient dataset.",
          severity: "CRITICAL"
        });
      }

      // Check for fabricated KM survival claim on GSE225767
      if ((respLower.includes("kaplan-meier") || respLower.includes("overall survival") || respLower.includes("km analysis")) && !qLower.includes("survival")) {
        errors.push({
          type: "UNSUPPORTED_NUMERICAL_CLAIM",
          message: "GSE225767 does NOT contain Kaplan-Meier (KM) overall survival clinical metadata. Do not generate fake KM survival claims for GSE225767.",
          severity: "CRITICAL"
        });
      }
    }
  }

  /**
   * Validate Dataset Identity to prevent substitution
   */
  private static validateDatasetIdentity(
    respLower: string,
    plan: QueryPlan,
    errors: ValidationError[]
  ): void {
    if (plan.targetDatasets.length === 1 && plan.targetDatasets[0] === "gse225767") {
      if (respLower.includes("tcga-paad vs gtex") && !respLower.includes("unlike tcga")) {
        errors.push({
          type: "DATASET_SUBSTITUTION",
          message: "The question specifically targeted the SBRT cohort (GSE225767), but the response improperly substituted TCGA-GTEx dataset evidence.",
          severity: "HIGH"
        });
      }
    }
  }

  /**
   * Validate Log2FC direction: log2FC > 0 = upregulated; log2FC < 0 = downregulated (Test K)
   */
  private static validateLog2FCSign(
    respLower: string,
    executionResult: QueryExecutionResult,
    errors: ValidationError[]
  ): void {
    const dResults: Record<string, any> = executionResult.datasetResults || (executionResult as any).datasets || {};
    const datasetKeys = ["tcga_gtex", "gse225767"];

    for (const key of datasetKeys) {
      const res: any = dResults[key];
      if (res && res.type === "gene" && res.found && res.metrics) {
        const gene = res.gene.toLowerCase();
        const log2FC = res.metrics.log2FC;

        if (log2FC < 0) {
          // Downregulated in tumor / post-SBRT (e.g. PHGDH = -0.6031)
          const claimsUpregulated = 
            respLower.includes(`${gene} is upregulated`) ||
            respLower.includes(`${gene} is significantly upregulated`) ||
            respLower.includes(`${gene} expression is higher`) ||
            respLower.includes(`${gene} is overexpressed`) ||
            respLower.includes(`increase in ${gene}`) ||
            respLower.includes(`log2fc > 0`);

          if (claimsUpregulated) {
            errors.push({
              type: "LOG2FC_SIGN_REVERSAL",
              message: `${res.gene} has log2FC = ${res.metrics.log2FCFormatted} (downregulated/reduced), but response claimed it was upregulated/overexpressed.`,
              severity: "CRITICAL",
              expected: `log2FC = ${res.metrics.log2FCFormatted} (Downregulated)`,
              actual: "Claimed upregulated"
            });
          }
        } else if (log2FC > 0) {
          // Upregulated in tumor / post-SBRT (e.g. KRAS = +1.9882)
          const claimsDownregulated = 
            respLower.includes(`${gene} is downregulated`) ||
            respLower.includes(`${gene} is significantly downregulated`) ||
            respLower.includes(`${gene} expression is lower`) ||
            respLower.includes(`decrease in ${gene}`) ||
            respLower.includes(`slight decrease`) ||
            respLower.includes(`log2fc < 0`) ||
            respLower.includes(`log2fc = -`) ||
            respLower.includes(`log2fc) of -`);

          if (claimsDownregulated) {
            errors.push({
              type: "LOG2FC_SIGN_REVERSAL",
              message: `${res.gene} has log2FC = ${res.metrics.log2FCFormatted} (upregulated), but response claimed it was downregulated/decreased.`,
              severity: "CRITICAL",
              expected: `log2FC = ${res.metrics.log2FCFormatted} (Upregulated)`,
              actual: "Claimed downregulated"
            });
          }
        }
      }
    }
  }

  /**
   * Validate Statistical Significance Consistency (Test L)
   */
  private static validateStatisticalSignificance(
    respLower: string,
    executionResult: QueryExecutionResult,
    errors: ValidationError[]
  ): void {
    const dResults: Record<string, any> = executionResult.datasetResults || (executionResult as any).datasets || {};
    const datasetKeys = ["tcga_gtex", "gse225767"];

    for (const key of datasetKeys) {
      const res: any = dResults[key];
      if (res && res.type === "gene" && res.found && res.metrics) {
        const gene = res.gene.toLowerCase();
        const pValue = res.metrics.pValue;
        const adjPValue = res.metrics.adjPValue;

        const isSig = (adjPValue !== undefined && adjPValue < 0.05) || (pValue !== undefined && pValue < 0.05);

        if (!isSig) {
          // Non-significant metric (e.g. FDR >= 0.05)
          const statesNonSignificant = 
            respLower.includes("not statistically significant") ||
            respLower.includes("not significant") ||
            respLower.includes("non-significant") ||
            respLower.includes("did not reach statistical significance") ||
            respLower.includes("does not reach statistical significance") ||
            respLower.includes("did not achieve statistical significance") ||
            respLower.includes("does not achieve statistical significance") ||
            respLower.includes("failed to reach statistical significance") ||
            respLower.includes("fails to reach statistical significance") ||
            respLower.includes("no statistically significant") ||
            respLower.includes("without statistical significance") ||
            respLower.includes("without statistically significant") ||
            respLower.includes("not statistically significantly");

          if (!statesNonSignificant) {
            const explicitlyClaimsSignificant = 
              respLower.includes(`${gene} is significantly`) ||
              respLower.includes(`${gene} was significantly`) ||
              respLower.includes("is statistically significant") ||
              respLower.includes("was statistically significant") ||
              respLower.includes("demonstrates statistically significant") ||
              respLower.includes("achieved statistical significance") ||
              respLower.includes("reached statistical significance");

            if (explicitlyClaimsSignificant) {
              errors.push({
                type: "SIGNIFICANCE_REVERSAL",
                message: `${res.gene} has FDR = ${res.metrics.adjPValueFormatted || res.metrics.pValueFormatted} (NOT statistically significant), but response claimed it was statistically significant.`,
                severity: "HIGH",
                expected: `FDR = ${res.metrics.adjPValueFormatted || res.metrics.pValueFormatted} (Not statistically significant)`,
                actual: "Claimed statistically significant"
              });
            }
          }
        } else {
          // Significant metric (e.g. FDR = 2.92e-12 or 2.08e-48)
          const claimsNotSignificant = 
            respLower.includes("not statistically significant") ||
            respLower.includes("not significantly different") ||
            respLower.includes("statistically non-significant") ||
            respLower.includes("non-significant") ||
            respLower.includes("no significant difference") ||
            respLower.includes("no significant change");

          if (claimsNotSignificant) {
            errors.push({
              type: "SIGNIFICANCE_REVERSAL",
              message: `${res.gene} has FDR = ${res.metrics.adjPValueFormatted} (statistically significant), but response claimed it was not statistically significant.`,
              severity: "CRITICAL",
              expected: `FDR = ${res.metrics.adjPValueFormatted} (Statistically significant)`,
              actual: "Claimed not statistically significant"
            });
          }
        }
      }
    }
  }


  /**
   * Validate Association / Correlation vs Differential Expression
   */
  private static validateAssociationVsDifferential(
    qLower: string,
    respLower: string,
    plan: QueryPlan,
    executionResult: QueryExecutionResult,
    errors: ValidationError[]
  ): void {
    const isAssociationQuestion = 
      qLower.includes("associated") ||
      qLower.includes("association") ||
      qLower.includes("correlated") ||
      qLower.includes("correlation") ||
      qLower.includes("co-expressed") ||
      qLower.includes("coexpression");

    if (isAssociationQuestion) {
      // Check if LLM fabricated an uncalculated Pearson/Spearman r value (e.g., "r = 0.42", "r = 0.78", "correlation coefficient of")
      const rMatch = respLower.match(/\b[r|R]\s*=\s*0\.\d+/g) || respLower.match(/pearson\s*=\s*0\.\d+/gi);
      if (rMatch) {
        errors.push({
          type: "ASSOCIATION_HALLUCINATION",
          message: `QueryEngine did not calculate a pairwise correlation coefficient, but response fabricated correlation value (${rMatch[0]}). State explicitly that pairwise correlation was not calculated in the retrieved portal evidence.`,
          severity: "CRITICAL"
        });
      }

      // Ensure response clearly notes that correlation/association statistic was not computed in portal results if not present
      const acknowledgesMissingCorrelation = 
        respLower.includes("correlation coefficient") ||
        respLower.includes("association statistic") ||
        respLower.includes("not calculated") ||
        respLower.includes("does not provide a gene-gene correlation") ||
        respLower.includes("differential expression") ||
        respLower.includes("co-expression");

      if (!acknowledgesMissingCorrelation) {
        errors.push({
          type: "ASSOCIATION_HALLUCINATION",
          message: "Association question was asked, but response did not state whether correlation was computed vs derived from differential expression.",
          severity: "HIGH"
        });
      }
    }
  }

  /**
   * Validate Causality Claims (Semantic Validation: Reject affirmative causal overclaims, permit hedging)
   */
  private static validateCausality(

    qLower: string,
    respLower: string,
    errors: ValidationError[]
  ): void {
    const isCausalQuestion = qLower.includes("cause") || qLower.includes("causes") || qLower.includes("causality") || qLower.includes("drive") || qLower.includes("drives");

    if (isCausalQuestion) {
      // Check if response makes an affirmative causal overclaim
      const affirmativeCausalClaim = 
        (respLower.includes("data prove") && !respLower.includes("do not prove") && !respLower.includes("does not prove")) ||
        respLower.includes("demonstrates that serine metabolism causes") ||
        respLower.includes("proves that serine metabolism causes") ||
        respLower.includes("establishes causality");

      if (affirmativeCausalClaim) {
        errors.push({
          type: "CAUSAL_OVERCLAIM",
          message: "Observational transcriptomic evidence cannot prove causality. The response overclaimed affirmative causation instead of distinguishing association/hypothesis from causality.",
          severity: "CRITICAL"
        });
      }
    }
  }


  /**
   * Validate Numerical Contradiction & Provenance
   */
  private static validateNumericalProvenance(
    respLower: string,
    executionResult: QueryExecutionResult,
    errors: ValidationError[]
  ): void {
    const dResults: Record<string, any> = executionResult.datasetResults || (executionResult as any).datasets || {};
    const datasetKeys = ["tcga_gtex", "gse225767"];

    for (const key of datasetKeys) {
      const res: any = dResults[key];
      if (res && res.type === "gene" && res.found && res.metrics) {
        const geneStr = res.gene.toLowerCase();
        const actualLog2FC = res.metrics.log2FC;
        const actualFDR = res.metrics.adjPValue !== undefined ? res.metrics.adjPValue : res.metrics.pValue;

        if (respLower.includes(geneStr)) {
          // 1. Scan for log2FC numbers in prose or tables
          const allLog2FcMatches = Array.from(respLower.matchAll(/(?:log2fc|fold change)[^\d\-+]{0,30}(-?\d+\.\d+)|(-?\d+\.\d+)[^\d\-+]{0,30}(?:log2fc|fold change)|\|\s*\*?\*?[a-z0-9]+\*?\*?\s*\|\s*(-?\d+\.\d+)\s*\|/gi));
          
          for (const match of allLog2FcMatches) {
            const valStr = match[1] || match[2] || match[3];
            if (valStr) {
              const val = parseFloat(valStr);
              // Ignore standard reference values / thresholds (like 0.05)
              if (Math.abs(val) !== 0.05 && Math.abs(val) !== 0.01 && Math.abs(val) !== 0.001) {
                if (Math.abs(val - actualLog2FC) > 0.05) {
                  errors.push({
                    type: "NUMERICAL_CONTRADICTION",
                    message: `Reported log2FC = ${val} for ${res.gene} in ${res.datasetName}, but QueryEngine authoritative value is ${actualLog2FC}.`,
                    severity: "CRITICAL",
                    expected: String(actualLog2FC),
                    actual: String(val)
                  });
                }
              }
            }
          }

          // 2. Scan for FDR / P-value numbers in prose or tables
          const allFdrMatches = Array.from(respLower.matchAll(/(?:fdr|p-value|pval|qval)[^\d]{0,30}(\d+\.\d+)|\|\s*(-?\d+\.\d+)\s*\|\s*(\d+\.\d+)\s*\|/gi));
          for (const match of allFdrMatches) {
            const valStr = match[1] || match[3];
            if (valStr) {
              const val = parseFloat(valStr);
              if (val > 0.05 && actualFDR < 0.05) {
                errors.push({
                  type: "NUMERICAL_CONTRADICTION",
                  message: `Reported FDR/P-value = ${val} for ${res.gene} in ${res.datasetName}, but QueryEngine authoritative FDR is ${actualFDR} (Significant).`,
                  severity: "CRITICAL",
                  expected: String(actualFDR),
                  actual: String(val)
                });
              }
            }
          }
        }
      }
    }
  }


  /**
   * Validate Pathway GSEA / ORA Metrics & Prevent Fabricated Pathway Stats
   */
  private static validatePathwayResults(
    respLower: string,
    plan: QueryPlan,
    executionResult: QueryExecutionResult,
    errors: ValidationError[]
  ): void {
    // Validate GSEA NES values if GSEA query was executed
    const effectivePlan = executionResult.plan || plan;
    if (effectivePlan.intent === "pathway_gsea" || effectivePlan.intent === "pathway_ora" || effectivePlan.intent === "pathway_query") {

      const gseaData: any = executionResult.datasetResults.tcga_gtex || executionResult.datasetResults.gse225767 || executionResult.datasetResults.pathway;
      if (gseaData && gseaData.pathways && gseaData.pathways.length === 0) {
        // If query engine returned zero enriched pathways under FDR < 0.05, ensure response does not invent NES scores
        const nesMatches = respLower.match(/\bnes\s*=\s*(-?\d+\.\d+)/g);
        if (nesMatches) {
          errors.push({
            type: "UNSUPPORTED_NUMERICAL_CLAIM",
            message: `QueryEngine returned zero enriched pathways under FDR threshold, but response generated pathway NES scores (${nesMatches.join(', ')}).`,
            severity: "CRITICAL"
          });
        }
      }

      // Check for fabricated KEGG hsaXXXXX IDs if not present in evidence
      const fakeHsaMatches = respLower.match(/\bhsa\d{5}\b/gi);
      if (fakeHsaMatches) {
        const verifiedHsa: string[] = [];
        if (gseaData && Array.isArray(gseaData.pathways)) {
          gseaData.pathways.forEach((p: any) => {
            if (p.pathwayId) verifiedHsa.push(p.pathwayId.toLowerCase());
          });
        }
        const unverified = fakeHsaMatches.filter(code => !verifiedHsa.includes(code.toLowerCase()));
        if (unverified.length > 0) {
          errors.push({
            type: "UNSUPPORTED_NUMERICAL_CLAIM",
            message: `Response cited unverified KEGG pathway IDs (${Array.from(new Set(unverified)).join(', ')}) not found in QueryEngine evidence.`,
            severity: "HIGH"
          });
        }
      }
    }
  }



  /**
   * Validate Mathematically / Biologically Impossible Values (e.g. percentages > 100%, FDR/p-values out of [0, 1])
   */
  private static validateImpossibleValues(
    respLower: string,
    errors: ValidationError[]
  ): void {
    // 1. Scan for percentages > 100% (e.g., 4250.0%, 425%, 1250%)
    const pctMatches = Array.from(respLower.matchAll(/(\d+(?:\.\d+)?)\s*%/g));
    for (const match of pctMatches) {
      const val = parseFloat(match[1]);
      if (val > 100) {
        errors.push({
          type: "UNSUPPORTED_NUMERICAL_CLAIM",
          message: `Biologically impossible percentage detected: ${val}% (percentages must be between 0% and 100%).`,
          severity: "CRITICAL",
          expected: "0% - 100%",
          actual: `${val}%`
        });
      }
    }

    // 2. Scan for FDR / p-value outside [0, 1] (e.g., FDR = 2.5 or p = -0.1)
    const statMatches = Array.from(respLower.matchAll(/(?:fdr|p-value|pval|qval)\s*=\s*(-?\d+(?:\.\d+)?(?:e-?\d+)?)/gi));
    for (const match of statMatches) {
      const val = parseFloat(match[1]);
      if (val < 0 || val > 1.0) {
        errors.push({
          type: "NUMERICAL_CONTRADICTION",
          message: `Mathematically impossible statistical value detected: ${val} (FDR/p-values must be between 0 and 1).`,
          severity: "CRITICAL",
          expected: "0.0 - 1.0",
          actual: String(val)
        });
      }
    }
  }

  /**
   * Sanitize response by removing unsupported numerical claims or formatting cleanly
   */
  private static sanitizeResponse(responseText: string, errors: ValidationError[]): string {
    let sanitized = responseText;

    errors.forEach(err => {
      if (err.type === "ASSOCIATION_HALLUCINATION") {
        // Strip out fabricated r=0.xx numbers
        sanitized = sanitized.replace(/r\s*=\s*0\.\d+/g, "(correlation statistic not computed)");
      }
    });

    return sanitized;
  }
}
