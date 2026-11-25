"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Database,
  Activity,
  BarChart3,
  GitCompare,
  Grid3X3,
  Loader2,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import {
  CptacMetadata,
  CptacProteinRecord,
  CptacMrnaOnlyRecord,
} from "@/types/cptac";
import { CURATED_20_NRF2_PANEL } from "@/utils/cptacEngine";
import CptacVolcanoAndDist from "@/components/cptac/CptacVolcanoAndDist";
import CptacProteogenomicsConcordance from "@/components/cptac/CptacProteogenomicsConcordance";
import CptacHeatmapAndCorrelation from "@/components/cptac/CptacHeatmapAndCorrelation";
import CptacSurvivalExplorer from "@/components/cptac/CptacSurvivalExplorer";
import { useAIContext } from "@/components/ai/AIProvider";

interface CptacProteomicsExplorerProps {
  basePath: string;
  selectedGene: string;
  onSelectGene: (gene: string) => void;
}

type CptacSubTab = "abundance" | "concordance" | "heatmap" | "survival";

export default function CptacProteomicsExplorer({
  basePath,
  selectedGene,
  onSelectGene,
}: CptacProteomicsExplorerProps) {
  const { registerModuleContext } = useAIContext();

  const [subTab, setSubTab] = useState<CptacSubTab>("abundance");
  const [metadata, setMetadata] = useState<CptacMetadata | null>(null);
  const [proteins, setProteins] = useState<CptacProteinRecord[]>([]);
  const [mrnaOnly, setMrnaOnly] = useState<CptacMrnaOnlyRecord[]>([]);
  const [protBuffer, setProtBuffer] = useState<ArrayBuffer | null>(null);
  const [mrnaBuffer, setMrnaBuffer] = useState<ArrayBuffer | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [matrixLoading, setMatrixLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [activeGene, setActiveGene] = useState<string>(selectedGene || "KRAS");
  const [panelGenes, setPanelGenes] = useState<string[]>([
    "KRAS",
    "TP53",
    "SMAD4",
    "CDKN2A",
    "GATA6",
    "EPCAM",
    "KRT19",
    "COL1A1",
    "ACTA2",
    "FN1",
  ]);
  const [survivalGenes, setSurvivalGenes] = useState<string[]>(["KRAS"]);

  useEffect(() => {
    if (selectedGene) {
      setActiveGene(selectedGene);
    }
  }, [selectedGene]);

  useEffect(() => {
    let cancelled = false;
    async function loadSummaryData() {
      try {
        setLoading(true);
        const [metaRes, protRes, mrnaRes] = await Promise.all([
          fetch(`${basePath}/data/cptac_pdac/cptac_metadata.json`),
          fetch(`${basePath}/data/cptac_pdac/cptac_protein_stats.json`),
          fetch(`${basePath}/data/cptac_pdac/cptac_mrna_only_stats.json`),
        ]);
        if (!metaRes.ok || !protRes.ok || !mrnaRes.ok) {
          throw new Error("Failed to load CPTAC-PDAC summary data assets");
        }
        const [metaJson, protJson, mrnaJson] = await Promise.all([
          metaRes.json(),
          protRes.json(),
          mrnaRes.json(),
        ]);
        if (cancelled) return;
        setMetadata(metaJson);
        setProteins(protJson);
        setMrnaOnly(mrnaJson);
        setLoading(false);

        // Stream float32 binary matrices for distributions, scatter, heatmaps, and survival
        setMatrixLoading(true);
        const [pBinRes, mBinRes] = await Promise.all([
          fetch(`${basePath}/data/cptac_pdac/cptac_prot_matrix.bin`),
          fetch(`${basePath}/data/cptac_pdac/cptac_mrna_matrix.bin`),
        ]);
        if (!pBinRes.ok || !mBinRes.ok) {
          throw new Error("Failed to load CPTAC-PDAC binary expression matrices");
        }
        const [pBuf, mBuf] = await Promise.all([
          pBinRes.arrayBuffer(),
          mBinRes.arrayBuffer(),
        ]);
        if (cancelled) return;
        setProtBuffer(pBuf);
        setMrnaBuffer(mBuf);
        setMatrixLoading(false);
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Failed to initialize CPTAC-PDAC module");
          setLoading(false);
          setMatrixLoading(false);
        }
      }
    }
    loadSummaryData();
    return () => {
      cancelled = true;
    };
  }, [basePath]);

  const pairedNatSet = useMemo(() => {
    return new Set<string>(metadata?.protein_samples?.paired_nat_ids || []);
  }, [metadata]);

  // Register live module state with PDACopilot
  useEffect(() => {
    if (!metadata) return;
    const protMatch = proteins.find(
      (p) => p.g.toUpperCase() === activeGene.toUpperCase()
    );
    const subTabLabel =
      subTab === "abundance"
        ? "Tumor vs Normal Protein Volcano & Distribution"
        : subTab === "concordance"
        ? "Matched mRNA-vs-Protein Proteogenomics Concordance"
        : subTab === "heatmap"
        ? "Multi-Protein Heatmap & Signature Correlation"
        : "CPTAC-PDAC Overall Survival (Cox PH & maxstat KM)";

    registerModuleContext({
      module: "CPTAC-PDAC Proteomics Analysis",
      dataset: "CPTAC_PDAC",
      gene: activeGene,
      heatmapGenes: panelGenes.slice(0, 20),
      currentFigure: subTabLabel,
      availableFigures: [
        "Tumor vs Normal Protein Volcano & Distribution",
        "Matched mRNA-vs-Protein Proteogenomics Concordance",
        "Multi-Protein Heatmap & Signature Correlation",
        "CPTAC-PDAC Overall Survival (Cox PH & maxstat KM)",
      ],
      cptacStats: {
        quantifiedProteins: metadata.counts.protein_genes,
        tumorSamples: metadata.counts.tumor_proteomics_samples,
        natSamples: metadata.counts.normal_proteomics_samples,
        pairedNatSamples: metadata.counts.paired_tumor_normal_proteomics,
        validOsSamples: metadata.counts.clinical_valid_os,
        medianConcordanceR: metadata.global_concordance.median_pearson_r,
        log2FC: protMatch?.log2FC ?? undefined,
        mwQ: protMatch?.mwQ ?? undefined,
        mrnaProteinR: protMatch?.r ?? undefined,
        coxHR: protMatch?.coxHR ?? undefined,
        coxP: protMatch?.coxP ?? undefined,
      },
    });
  }, [metadata, proteins, activeGene, subTab, panelGenes, registerModuleContext]);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-12 flex flex-col items-center justify-center gap-3 text-slate-300">
        <Loader2 className="w-7 h-7 animate-spin text-sky-400" />
        <div className="text-sm font-semibold">
          Loading CPTAC-PDAC Proteomics &amp; Proteogenomics Discovery Cohort...
        </div>
        <div className="text-xs text-slate-400">
          Cao et al., Cell 2021 (PMID:34534465) &middot; 11,662 Proteins &middot; 215 TMT Samples &middot; 140 Paired RNA-seq
        </div>
      </div>
    );
  }

  if (error || !metadata) {
    return (
      <div className="rounded-xl border border-rose-500/40 bg-rose-950/20 p-6 flex items-center gap-3 text-rose-200 text-sm">
        <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
        <div>{error || "CPTAC-PDAC metadata unavailable."}</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* CPTAC Cohort Provenance & Navigation Header */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                <Database className="w-3 h-3" />
                CPTAC-PDAC &middot; Cao et al., Cell 2021
              </span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-slate-800 text-slate-300">
                PMID: {metadata.pmid} &middot; {metadata.study_id}
              </span>
              {matrixLoading && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-sky-500/15 text-sky-300 border border-sky-500/30">
                  <Loader2 className="w-3 h-3 animate-spin" /> Streaming float32 matrices...
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Authentic TMT global proteomics ({metadata.counts.tumor_proteomics_samples} tumors vs.{" "}
              {metadata.counts.normal_proteomics_samples} NAT controls;{" "}
              {metadata.counts.paired_tumor_normal_proteomics} case-matched tumor–NAT pairs), matched RSEM RNA-seq (
              {metadata.counts.tumor_mrna_samples} tumors, {metadata.counts.normal_mrna_samples} NATs), and{" "}
              {metadata.counts.clinical_valid_os} overall survival follow-up cases ({metadata.counts.clinical_os_events} events, median {metadata.counts.median_followup_months} mo). LinkedOmics + cBioPortal <code className="text-sky-300">paad_cptac_2021</code> 1:1 tumor parity verified.
            </p>
          </div>
          <a
            href={`https://pubmed.ncbi.nlm.nih.gov/${metadata.pmid}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-sky-400 hover:text-sky-300 inline-flex items-center gap-1 shrink-0"
          >
            Cell 2021 Paper <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* Sub-Navigation Pills */}
        <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-slate-800/80">
          {(
            [
              {
                id: "abundance",
                label: "1. Tumor vs. Normal Abundance",
                icon: BarChart3,
              },
              {
                id: "concordance",
                label: "2. Matched mRNA-Protein Concordance",
                icon: GitCompare,
              },
              {
                id: "heatmap",
                label: "3. Heatmap & Co-Expression",
                icon: Grid3X3,
              },
              {
                id: "survival",
                label: "4. OS Survival Validation (Cox & maxstat)",
                icon: Activity,
              },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSubTab(tab.id)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border ${
                  active
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm"
                    : "bg-slate-950/70 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sub-Views */}
      {subTab === "abundance" && (
        <CptacVolcanoAndDist
          proteins={proteins}
          mrnaOnly={mrnaOnly}
          protBuffer={protBuffer}
          mrnaBuffer={mrnaBuffer}
          tumorIds={metadata.protein_samples.tumor_ids}
          normalIds={metadata.protein_samples.normal_ids}
          mrnaNormalIds={metadata.mrna_samples.normal_ids}
          pairedNatSet={pairedNatSet}
          selectedGene={activeGene}
          onSelectGene={(g) => {
            setActiveGene(g);
            onSelectGene(g);
          }}
          onSendToHeatmap={(genes) => {
            setPanelGenes(genes);
            setSubTab("heatmap");
          }}
          onSendToSurvival={(genes) => {
            setSurvivalGenes(genes);
            setSubTab("survival");
          }}
        />
      )}

      {subTab === "concordance" && (
        <CptacProteogenomicsConcordance
          proteins={proteins}
          mrnaOnly={mrnaOnly}
          protBuffer={protBuffer}
          mrnaBuffer={mrnaBuffer}
          tumorIds={metadata.protein_samples.tumor_ids}
          normalIds={metadata.protein_samples.normal_ids}
          mrnaNormalIds={metadata.mrna_samples.normal_ids}
          clinicalSamples={metadata.clinical_samples}
          pathwayConcordance={metadata.pathway_concordance}
          globalConcordance={metadata.global_concordance}
          testedPairedCount={metadata.counts.mrna_protein_tested_ge10}
          sharedCount={metadata.counts.shared_mrna_protein_genes}
          selectedGene={activeGene}
          onSelectGene={(g) => {
            setActiveGene(g);
            onSelectGene(g);
          }}
        />
      )}

      {subTab === "heatmap" && (
        <CptacHeatmapAndCorrelation
          proteins={proteins}
          mrnaOnly={mrnaOnly}
          protBuffer={protBuffer}
          mrnaBuffer={mrnaBuffer}
          tumorIds={metadata.protein_samples.tumor_ids}
          normalIds={metadata.protein_samples.normal_ids}
          mrnaNormalIds={metadata.mrna_samples.normal_ids}
          clinicalSamples={metadata.clinical_samples}
          curatedPresets={metadata.curated_presets}
          panelGenes={panelGenes}
          onChangePanelGenes={setPanelGenes}
        />
      )}

      {subTab === "survival" && (
        <CptacSurvivalExplorer
          proteins={proteins}
          mrnaOnly={mrnaOnly}
          protBuffer={protBuffer}
          mrnaBuffer={mrnaBuffer}
          survivalSamples={metadata.clinical_survival}
          excludedCases={metadata.excluded_survival_cases}
          curatedPresets={metadata.curated_presets}
          survivalGenes={survivalGenes}
          onChangeSurvivalGenes={setSurvivalGenes}
        />
      )}
    </div>
  );
}
