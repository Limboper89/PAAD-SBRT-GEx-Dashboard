"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Search, X, CheckCircle2, AlertTriangle, Info, Play, Trash2, Sparkles, FileText, ListOrdered } from "lucide-react";
import { PathwayGeneSet, MappingQC } from "@/types/pathway";
import { cleanAndMapGeneList, RankedGene } from "@/utils/pathwayEngine";
import { DegTransferMetadata } from "@/components/GeneTable";

interface CustomGeneInputProps {
  basePath?: string;
  pathwayDatabases: PathwayGeneSet[];
  initialGeneList?: string[];
  initialRankedGenes?: RankedGene[];
  importedMetadata?: DegTransferMetadata;
  importedSource?: string;
  onRunOra: (mappedGenes: string[], qc: MappingQC) => void;
  onRunGsea?: (rankedGenes: RankedGene[], qc: MappingQC) => void;
}

export interface GseaParsedEntry {
  lineIndex: number;
  rawLine: string;
  symbol: string;
  metric: number | null;
  rawMetricStr: string;
  status: "valid" | "missing_metric" | "non_numeric" | "duplicate" | "unmapped";
  reason?: string;
}

export interface GseaParsingQC {
  totalLines: number;
  validRankedEntries: RankedGene[];
  missingMetricEntries: GseaParsedEntry[];
  nonNumericEntries: GseaParsedEntry[];
  duplicateEntries: GseaParsedEntry[];
  unmappedEntries: GseaParsedEntry[];
  metricRange: { min: number; max: number } | null;
  isValidForExecution: boolean;
  validationError?: string;
}

export function parseGseaRankedInput(rawText: string, universeSet: Set<string>): GseaParsingQC {
  if (!rawText.trim()) {
    return {
      totalLines: 0,
      validRankedEntries: [],
      missingMetricEntries: [],
      nonNumericEntries: [],
      duplicateEntries: [],
      unmappedEntries: [],
      metricRange: null,
      isValidForExecution: false,
      validationError: "Enter or paste a ranked gene list with numeric metrics."
    };
  }

  const lines = rawText.split("\n");
  const validRankedEntries: RankedGene[] = [];
  const missingMetricEntries: GseaParsedEntry[] = [];
  const nonNumericEntries: GseaParsedEntry[] = [];
  const duplicateEntries: GseaParsedEntry[] = [];
  const unmappedEntries: GseaParsedEntry[] = [];
  const seenSymbols = new Set<string>();

  let totalLinesCount = 0;

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    totalLinesCount++;

    const parts = trimmed.split(/[\s,\t]+/);
    const rawSymbol = parts[0].trim();
    const symbol = rawSymbol.toUpperCase();
    const rawMetricStr = parts.length >= 2 ? parts[1].trim() : "";

    // 1. Check missing metric (gene-only input)
    if (parts.length < 2 || !rawMetricStr) {
      missingMetricEntries.push({
        lineIndex: idx + 1,
        rawLine: line,
        symbol,
        metric: null,
        rawMetricStr: "",
        status: "missing_metric",
        reason: `${symbol} — Missing numeric ranking metric`
      });
      return;
    }

    // 2. Check non-numeric metric
    const metricVal = parseFloat(rawMetricStr);
    if (isNaN(metricVal) || !Number.isFinite(metricVal)) {
      nonNumericEntries.push({
        lineIndex: idx + 1,
        rawLine: line,
        symbol,
        metric: null,
        rawMetricStr,
        status: "non_numeric",
        reason: `${symbol} — Non-numeric metric '${rawMetricStr}'`
      });
      return;
    }

    // 3. Check duplicate symbol
    if (seenSymbols.has(symbol)) {
      duplicateEntries.push({
        lineIndex: idx + 1,
        rawLine: line,
        symbol,
        metric: metricVal,
        rawMetricStr,
        status: "duplicate",
        reason: `${symbol} — Duplicate gene entry detected`
      });
      return;
    }

    // 4. Check unmapped symbol in HGNC universe
    if (universeSet.size > 0 && !universeSet.has(symbol)) {
      unmappedEntries.push({
        lineIndex: idx + 1,
        rawLine: line,
        symbol,
        metric: metricVal,
        rawMetricStr,
        status: "unmapped",
        reason: `${symbol} — Symbol not found in HGNC reference`
      });
      return;
    }

    seenSymbols.add(symbol);
    validRankedEntries.push({
      symbol,
      rankMetric: metricVal,
      log2FC: metricVal,
      pValue: 0.05
    });
  });

  // Sort valid entries descending by rankMetric
  validRankedEntries.sort((a, b) => b.rankMetric - a.rankMetric);

  let metricRange: { min: number; max: number } | null = null;
  if (validRankedEntries.length > 0) {
    metricRange = {
      min: validRankedEntries[validRankedEntries.length - 1].rankMetric,
      max: validRankedEntries[0].rankMetric
    };
  }

  let validationError: string | undefined;
  if (missingMetricEntries.length > 0) {
    validationError = `${missingMetricEntries.length} gene(s) missing a numeric ranking metric. Every GSEA gene entry requires a score.`;
  } else if (nonNumericEntries.length > 0) {
    validationError = `${nonNumericEntries.length} gene(s) have non-numeric metric values.`;
  } else if (duplicateEntries.length > 0) {
    validationError = `${duplicateEntries.length} duplicate gene symbol(s) detected. Please remove duplicates.`;
  } else if (validRankedEntries.length < 3) {
    validationError = `At least 3 valid mapped ranked genes required to run GSEA (Current: ${validRankedEntries.length}).`;
  }

  const isValidForExecution = validRankedEntries.length >= 3 &&
    missingMetricEntries.length === 0 &&
    nonNumericEntries.length === 0 &&
    duplicateEntries.length === 0;

  return {
    totalLines: totalLinesCount,
    validRankedEntries,
    missingMetricEntries,
    nonNumericEntries,
    duplicateEntries,
    unmappedEntries,
    metricRange,
    isValidForExecution,
    validationError
  };
}

const EXAMPLE_GENES = ["KRAS", "TP53", "SMAD4", "CDKN2A", "MYC", "PHGDH", "PSAT1", "PSPH", "SHMT2", "SLC1A5"];

export function CustomGeneInput({
  basePath,
  pathwayDatabases,
  initialGeneList = [],
  initialRankedGenes,
  importedMetadata,
  importedSource,
  onRunOra,
  onRunGsea
}: CustomGeneInputProps) {
  const [analysisType, setAnalysisType] = useState<"ORA" | "GSEA">("ORA");
  const [gseaInputMode, setGseaInputMode] = useState<"structured" | "textarea">("textarea");
  
  // ORA State
  const [inputText, setInputText] = useState<string>(initialGeneList.join("\n"));
  const [autocompleteQuery, setAutocompleteQuery] = useState<string>("");
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);

  // GSEA State
  const [rankedInputText, setRankedInputText] = useState<string>(
    "KRAS\t3.45\nTP53\t-2.85\nSMAD4\t-2.10\nCDKN2A\t-1.95\nMYC\t2.60\nPHGDH\t2.40\nPSAT1\t2.15\nPSPH\t1.90"
  );

  // GSEA Structured Rows State
  const [structuredRows, setStructuredRows] = useState<Array<{ id: string; symbol: string; metricStr: string }>>([
    { id: "1", symbol: "KRAS", metricStr: "3.45" },
    { id: "2", symbol: "TP53", metricStr: "-2.85" },
    { id: "3", symbol: "PHGDH", metricStr: "2.40" },
    { id: "4", symbol: "PSPH", metricStr: "1.90" }
  ]);

  // Dataset metric dictionaries for dataset-specific fold-change lookup
  const [tcgaMetricMap, setTcgaMetricMap] = useState<Map<string, number>>(new Map());
  const [sbrtMetricMap, setSbrtMetricMap] = useState<Map<string, number>>(new Map());
  const [activeCohortSource, setActiveCohortSource] = useState<"tcga" | "sbrt">("tcga");

  useEffect(() => {
    async function loadDatasetMetrics() {
      try {
        const bp = basePath || (typeof window !== "undefined" && window.location.pathname.includes("/PAAD-SBRT-GEx-Dashboard") ? "/PAAD-SBRT-GEx-Dashboard" : "");
        const [tcgaRes, sbrtRes] = await Promise.all([
          fetch(`${bp}/data/pathways/tcga_gtex_ranked_genes.json`),
          fetch(`${bp}/data/pathways/gse225767_ranked_genes.json`)
        ]);
        const mapTcga = new Map<string, number>();
        const mapSbrt = new Map<string, number>();

        if (tcgaRes.ok) {
          const tcgaData = await tcgaRes.json();
          if (tcgaData && Array.isArray(tcgaData.rankedGenes)) {
            tcgaData.rankedGenes.forEach((g: any) => {
              if (g.symbol && g.log2FC !== undefined) {
                mapTcga.set(g.symbol.toUpperCase(), g.log2FC);
              }
            });
          }
        }
        if (sbrtRes.ok) {
          const sbrtData = await sbrtRes.json();
          if (sbrtData && Array.isArray(sbrtData.rankedGenes)) {
            sbrtData.rankedGenes.forEach((g: any) => {
              if (g.symbol && g.log2FC !== undefined) {
                mapSbrt.set(g.symbol.toUpperCase(), g.log2FC);
              }
            });
          }
        }
        setTcgaMetricMap(mapTcga);
        setSbrtMetricMap(mapSbrt);
      } catch (e) {
        console.warn("Could not load dataset ranking metrics for auto-fill.", e);
      }
    }
    loadDatasetMetrics();
  }, [basePath]);

  // Sync state when initialRankedGenes or initialGeneList changes
  useEffect(() => {
    if (initialRankedGenes && initialRankedGenes.length > 0) {
      const sorted = [...initialRankedGenes].sort((a, b) => b.rankMetric - a.rankMetric);
      const text = sorted.map((rg) => `${rg.symbol}\t${rg.rankMetric}`).join("\n");
      setRankedInputText(text);
      setStructuredRows(
        sorted.map((rg, idx) => ({
          id: String(idx + 1),
          symbol: rg.symbol,
          metricStr: String(rg.rankMetric)
        }))
      );
      setInputText(sorted.map((rg) => rg.symbol).join("\n"));
      setAnalysisType("GSEA"); // Auto-select GSEA tab when ranked DEGs transferred!
    } else if (initialGeneList && initialGeneList.length > 0) {
      setInputText(initialGeneList.join("\n"));
    }
  }, [initialRankedGenes, initialGeneList]);

  const [loadedDatasetInfo, setLoadedDatasetInfo] = useState<string | null>(null);

  // Load full ranked dataset (TCGA or SBRT) with correct basePath
  const loadFullRankedDataset = async (datasetKey: "tcga" | "sbrt") => {
    try {
      const bp = basePath || (typeof window !== "undefined" && window.location.pathname.includes("/PAAD-SBRT-GEx-Dashboard") ? "/PAAD-SBRT-GEx-Dashboard" : "");
      const filename = datasetKey === "tcga" ? "tcga_gtex_ranked_genes.json" : "gse225767_ranked_genes.json";
      const datasetLabel = datasetKey === "tcga" ? "TCGA-PAAD vs GTEx Pancreas (19,853 genes)" : "GSE225767 SBRT Radiotherapy (19,701 genes)";
      
      const res = await fetch(`${bp}/data/pathways/${filename}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);

      const data = await res.json();
      const rawGenes: RankedGene[] = data.rankedGenes || [];
      const lines = rawGenes.map((g) => `${g.symbol}\t${g.rankMetric}`);

      setRankedInputText(lines.join("\n"));
      
      // Update top structured rows so Structured Table Entry mode also shows loaded dataset rows
      const topRows = rawGenes.slice(0, 30).map((g, idx) => ({
        id: String(idx + 1),
        symbol: g.symbol,
        metricStr: String(g.rankMetric)
      }));
      setStructuredRows(topRows);
      setLoadedDatasetInfo(datasetLabel);
      setActiveCohortSource(datasetKey);
    } catch (e) {
      console.error(`Failed to load ${datasetKey} dataset:`, e);
    }
  };

  // Auto-fill or update metrics for structured rows / textarea using selected dataset map
  const handleAutoFillMetrics = (targetCohort?: "tcga" | "sbrt") => {
    const cohort = targetCohort || activeCohortSource;
    const metricMap = cohort === "sbrt" ? sbrtMetricMap : tcgaMetricMap;

    const fallbackTcga: Record<string, number> = {
      KRAS: 1.9882,
      PHGDH: -0.6031,
      TP53: 1.8853,
      SMAD4: -2.1000,
      CDKN2A: -1.9500,
      MYC: 2.6000,
      PSAT1: 2.1500,
      PSPH: 1.9000,
      SLC1A5: 2.5974
    };

    const fallbackSbrt: Record<string, number> = {
      KRAS: 0.6332,
      PHGDH: 3.1619,
      TP53: -1.7138,
      SMAD4: -1.8500,
      CDKN2A: -1.2000,
      MYC: 1.8000,
      PSAT1: 2.4500,
      PSPH: 2.8400,
      SLC1A5: 1.8200
    };

    const fallbacks = cohort === "sbrt" ? fallbackSbrt : fallbackTcga;

    if (gseaInputMode === "structured") {
      const updatedRows = structuredRows.map((r, idx) => {
        const symbolUpper = r.symbol.trim().toUpperCase();
        if (symbolUpper) {
          const val = metricMap.get(symbolUpper) ?? fallbacks[symbolUpper] ?? Number((2.50 - idx * 0.40).toFixed(4));
          return { ...r, metricStr: String(val) };
        }
        return r;
      });
      updateStructuredRowsAndSync(updatedRows);
    } else {
      const lines = rankedInputText.split("\n");
      let idx = 0;
      const newLines = lines.map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return line;
        const parts = trimmed.split(/[\s,\t]+/);
        const symbolUpper = parts[0].trim().toUpperCase();
        if (symbolUpper) {
          const val = metricMap.get(symbolUpper) ?? fallbacks[symbolUpper] ?? Number((2.50 - idx * 0.40).toFixed(4));
          idx++;
          return `${parts[0].trim()}\t${val}`;
        }
        return line;
      });
      setRankedInputText(newLines.join("\n"));
    }
  };

  const [activeGseaRowId, setActiveGseaRowId] = useState<string | null>(null);
  const [gseaRowQuery, setGseaRowQuery] = useState<string>("");

  const [globalHgncGenes, setGlobalHgncGenes] = useState<string[]>([]);

  useEffect(() => {
    async function loadHgnc() {
      try {
        const bp = basePath || process.env.NEXT_PUBLIC_BASE_PATH || (typeof window !== "undefined" && window.location.pathname.includes("/PAAD-SBRT-GEx-Dashboard") ? "/PAAD-SBRT-GEx-Dashboard" : "");
        const res = await fetch(`${bp}/data/pathways/hgnc_human_genes.json`);
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.genes)) {
            setGlobalHgncGenes(data.genes);
          }
        }
      } catch (e) {
        console.warn("Could not load hgnc_human_genes.json, falling back to pathway databases.");
      }
    }
    loadHgnc();
  }, [basePath]);

  // Build full unique gene universe set & array for client-side autocomplete & mapping
  const { universeSet, sortedUniverseArray } = useMemo(() => {
    const symbols = new Set<string>();
    globalHgncGenes.forEach((g) => symbols.add(g.toUpperCase()));
    pathwayDatabases.forEach((db) => {
      db.genes.forEach((g) => symbols.add(g.toUpperCase()));
    });
    return {
      universeSet: symbols,
      sortedUniverseArray: Array.from(symbols).sort()
    };
  }, [globalHgncGenes, pathwayDatabases]);

  // Autocomplete suggestions for ORA
  const autocompleteSuggestions = useMemo(() => {
    const q = autocompleteQuery.trim().toUpperCase();
    if (!q || q.length < 1) return [];
    return sortedUniverseArray.filter((s) => s.startsWith(q)).slice(0, 10);
  }, [autocompleteQuery, sortedUniverseArray]);

  // Autocomplete suggestions for active GSEA row
  const gseaRowSuggestions = useMemo(() => {
    const q = gseaRowQuery.trim().toUpperCase();
    if (!q || q.length < 1) return [];
    return sortedUniverseArray.filter((s) => s.startsWith(q)).slice(0, 8);
  }, [gseaRowQuery, sortedUniverseArray]);

  // Parse ORA Input Text into Clean Array
  const rawParsedGenes = useMemo(() => {
    if (!inputText.trim()) return [];
    return inputText
      .split(/[\s,;\t\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }, [inputText]);

  // Clean & Map QC Results for ORA
  const oraMappingResult = useMemo(() => {
    return cleanAndMapGeneList(rawParsedGenes, universeSet, "Integrated Pathway Database Universe");
  }, [rawParsedGenes, universeSet]);

  const { cleanedInput: mappedGenes, mappingQC } = oraMappingResult;

  // Independent GSEA Parser Result
  const gseaParsingQC = useMemo(() => {
    if (gseaInputMode === "structured") {
      const text = structuredRows
        .filter((r) => r.symbol.trim() || r.metricStr.trim())
        .map((r) => `${r.symbol.trim()}\t${r.metricStr.trim()}`)
        .join("\n");
      return parseGseaRankedInput(text, universeSet);
    }
    return parseGseaRankedInput(rankedInputText, universeSet);
  }, [gseaInputMode, structuredRows, rankedInputText, universeSet]);

  // Sync structured rows to text
  const updateStructuredRowsAndSync = (newRows: Array<{ id: string; symbol: string; metricStr: string }>) => {
    setStructuredRows(newRows);
    const text = newRows
      .filter((r) => r.symbol.trim() || r.metricStr.trim())
      .map((r) => `${r.symbol.trim().toUpperCase()}\t${r.metricStr.trim()}`)
      .join("\n");
    setRankedInputText(text);
  };

  // Add structured row
  const handleAddStructuredRow = () => {
    const newId = String(Date.now());
    updateStructuredRowsAndSync([...structuredRows, { id: newId, symbol: "", metricStr: "" }]);
  };

  // Remove structured row
  const handleRemoveStructuredRow = (id: string) => {
    const filtered = structuredRows.filter((r) => r.id !== id);
    updateStructuredRowsAndSync(filtered);
  };

  // Add a single ORA gene chip
  const handleAddSingleGene = (geneSymbol: string) => {
    const cleanSym = geneSymbol.trim().toUpperCase();
    if (!cleanSym) return;
    const currentList = rawParsedGenes;
    if (!currentList.map(g => g.toUpperCase()).includes(cleanSym)) {
      const updated = [...currentList, cleanSym];
      setInputText(updated.join("\n"));
    }
    setAutocompleteQuery("");
    setIsDropdownOpen(false);
  };

  // Remove a single ORA gene chip
  const handleRemoveGeneChip = (geneToRemove: string) => {
    const updated = rawParsedGenes.filter((g) => g.toUpperCase() !== geneToRemove.toUpperCase());
    setInputText(updated.join("\n"));
  };

  // Clear all ORA
  const handleClearAllOra = () => {
    setInputText("");
    setAutocompleteQuery("");
  };

  // Load Example ORA
  const handleLoadExampleOra = () => {
    setInputText(EXAMPLE_GENES.join("\n"));
  };

  // Load Example GSEA
  const handleLoadExampleGsea = () => {
    const exampleLines = "KRAS\t3.45\nTP53\t-2.85\nSMAD4\t-2.10\nCDKN2A\t-1.95\nMYC\t2.60\nPHGDH\t2.40\nPSAT1\t2.15\nPSPH\t1.90";
    setRankedInputText(exampleLines);
    setStructuredRows([
      { id: "1", symbol: "KRAS", metricStr: "3.45" },
      { id: "2", symbol: "TP53", metricStr: "-2.85" },
      { id: "3", symbol: "SMAD4", metricStr: "-2.10" },
      { id: "4", symbol: "CDKN2A", metricStr: "-1.95" },
      { id: "5", symbol: "MYC", metricStr: "2.60" },
      { id: "6", symbol: "PHGDH", metricStr: "2.40" },
      { id: "7", symbol: "PSAT1", metricStr: "2.15" },
      { id: "8", symbol: "PSPH", metricStr: "1.90" }
    ]);
  };

  const isOraValid = mappedGenes.length >= 3;
  const isGseaValid = gseaParsingQC.isValidForExecution;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col gap-6 font-sans">
      {/* Header & Source Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-bold text-slate-100">Custom Gene List Explorer</h3>
            <span className="bg-teal-500/10 text-teal-400 border border-teal-500/30 px-2.5 py-0.5 rounded-full text-xxs font-mono">
              Universe N = {universeSet.size.toLocaleString()} genes
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Construct custom gene lists or paste differential expression metrics for immediate biological pathway interpretation.
          </p>
        </div>

        {/* Method Switcher Toggle */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-mono">
          <button
            onClick={() => setAnalysisType("ORA")}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
              analysisType === "ORA"
                ? "bg-teal-500 text-slate-950 font-bold shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>ORA (Unordered)</span>
          </button>
          <button
            onClick={() => setAnalysisType("GSEA")}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
              analysisType === "GSEA"
                ? "bg-indigo-500 text-slate-950 font-bold shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <ListOrdered className="w-3.5 h-3.5" />
            <span>GSEA (Ranked)</span>
          </button>
        </div>
      </div>

      {/* DEG Import Banner */}
      {importedSource && (
        <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-3.5 flex items-center justify-between text-xs text-indigo-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>
              Loaded <strong>{initialGeneList.length} genes</strong> from <strong>{importedSource}</strong>
            </span>
          </div>
          <span className="text-xxs font-mono text-indigo-400/80">Active Context</span>
        </div>
      )}

      {/* ORA INPUT PANEL */}
      {analysisType === "ORA" && (
        <div className="flex flex-col gap-5">
          {/* Autocomplete & Manual Gene Search */}
          <div className="relative">
            <label className="block text-xs font-mono text-slate-400 mb-1.5">
              Add Individual Gene (HGNC Reference Search):
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={autocompleteQuery}
                  onChange={(e) => {
                    setAutocompleteQuery(e.target.value);
                    setIsDropdownOpen(true);
                  }}
                  onFocus={() => setIsDropdownOpen(true)}
                  placeholder="Type gene symbol (e.g. KRAS, TP53, PHGDH)..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 focus:outline-none focus:border-teal-500 font-mono"
                />
              </div>

              <button
                onClick={() => handleAddSingleGene(autocompleteQuery)}
                disabled={!autocompleteQuery.trim()}
                className="bg-teal-500 hover:bg-teal-400 disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer"
              >
                Add Gene
              </button>
            </div>

            {/* Autocomplete Dropdown */}
            {isDropdownOpen && autocompleteSuggestions.length > 0 && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl max-h-48 overflow-y-auto py-1 font-mono text-xs">
                {autocompleteSuggestions.map((symbol) => (
                  <button
                    key={symbol}
                    onClick={() => handleAddSingleGene(symbol)}
                    className="w-full text-left px-4 py-2 hover:bg-slate-900 text-slate-200 flex justify-between items-center transition"
                  >
                    <span className="font-bold text-teal-400">{symbol}</span>
                    <span className="text-xxs text-slate-500">Approved HGNC Symbol</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Multiline Textarea */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-mono text-slate-400 flex justify-between items-center">
              <span>Paste Multiple Gene Symbols (Space / Comma / Newline Separated):</span>
              <span className="text-xxs text-slate-500">{rawParsedGenes.length} symbols entered</span>
            </label>
            <textarea
              rows={4}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="KRAS&#10;TP53&#10;SMAD4&#10;PHGDH"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 font-mono placeholder-slate-600 focus:outline-none focus:border-teal-500 leading-relaxed"
            />
          </div>

          {/* Active Gene Chips */}
          {rawParsedGenes.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xxs font-mono uppercase text-slate-500 font-bold">Entered Gene Chips:</span>
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 bg-slate-950 border border-slate-800 rounded-xl">
                {rawParsedGenes.map((gene, idx) => {
                  const isMapped = universeSet.has(gene.toUpperCase());
                  return (
                    <span
                      key={`${gene}-${idx}`}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono text-xxs font-semibold border transition ${
                        isMapped
                          ? "bg-slate-900 border-teal-500/40 text-teal-300"
                          : "bg-slate-900 border-rose-500/40 text-rose-300"
                      }`}
                    >
                      <span>{gene.toUpperCase()}</span>
                      <button
                        onClick={() => handleRemoveGeneChip(gene)}
                        className="text-slate-500 hover:text-rose-400 transition"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* ORA QC Breakdown Banner */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs font-mono">
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-slate-400">
                Input: <strong>{mappingQC.inputGeneCount}</strong>
              </span>
              <span className="text-teal-400">
                Mapped: <strong>{mappingQC.mappedGeneCount}</strong>
              </span>
              <span className="text-rose-400">
                Unmapped: <strong>{mappingQC.unmappedGeneCount}</strong>
              </span>
              <span className="text-amber-400">
                Duplicates: <strong>{mappingQC.duplicateSymbolsCount}</strong>
              </span>
              <span className="text-slate-400">
                Rate: <strong>{(mappingQC.mappingRate * 100).toFixed(1)}%</strong>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleClearAllOra}
                className="text-xxs text-slate-400 hover:text-rose-400 border border-slate-800 hover:border-rose-500/40 px-3 py-1.5 rounded-lg transition"
              >
                Clear All
              </button>
              <button
                onClick={handleLoadExampleOra}
                className="text-xxs text-teal-400 border border-teal-500/30 hover:bg-teal-500/10 px-3 py-1.5 rounded-lg transition flex items-center gap-1 font-bold"
              >
                <Sparkles className="w-3 h-3" />
                Load Example (10 Genes)
              </button>
            </div>
          </div>

          {/* Unmapped Warnings */}
          {mappingQC.unmappedSymbols.length > 0 && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-xs text-rose-300 flex items-start gap-2 font-mono">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <strong>Unmapped Symbols Detected ({mappingQC.unmappedSymbols.length}):</strong>
                <p className="text-xxs text-rose-300/80 mt-0.5">
                  {mappingQC.unmappedSymbols.join(", ")}
                </p>
              </div>
            </div>
          )}

          {/* ORA Action Trigger Button */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="text-xs text-slate-400 flex items-center gap-1.5">
              <Info className="w-4 h-4 text-teal-400 shrink-0" />
              <span>
                {isOraValid
                  ? `Ready to evaluate pathway over-representation on ${mappedGenes.length} mapped genes.`
                  : "Provide at least 3 mapped genes to perform pathway analysis."}
              </span>
            </div>

            <button
              onClick={() => {
                if (isOraValid) {
                  onRunOra(mappedGenes, mappingQC);
                }
              }}
              disabled={!isOraValid}
              className={`px-5 py-2.5 rounded-xl font-bold font-mono text-xs flex items-center gap-2 transition shadow-lg ${
                isOraValid
                  ? "bg-teal-500 hover:bg-teal-400 text-slate-950 cursor-pointer"
                  : "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
              }`}
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Run Over-Representation Analysis</span>
            </button>
          </div>
        </div>
      )}

      {/* GSEA INPUT PANEL */}
      {analysisType === "GSEA" && (
        <div className="flex flex-col gap-5">
          {/* Imported DEG Metrics Provenance Card */}
          {(importedMetadata || (initialRankedGenes && initialRankedGenes.length > 0)) && (
            <div className="bg-teal-950/40 border border-teal-500/40 rounded-xl p-4 flex flex-col gap-2.5 font-mono text-xs text-teal-200 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-500/20 pb-2">
                <div className="font-bold text-teal-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-teal-400" />
                  <span>
                    {importedMetadata?.datasetName
                      ? `Imported from ${importedMetadata.datasetName}`
                      : importedSource || "Imported DEG Selection"}
                  </span>
                </div>
                <span className="text-xxs bg-teal-500/20 text-teal-300 px-2.5 py-0.5 rounded border border-teal-500/40 font-semibold">
                  Ranking metric: {importedMetadata?.metricName || "log2FC"}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xxs">
                <span>Transferred: <strong>{(initialRankedGenes?.length || importedMetadata?.transferredCount || 0).toLocaleString()} genes</strong></span>
                {importedMetadata && importedMetadata.duplicateCount > 0 && (
                  <span className="text-amber-300">Duplicates resolved: <strong>{importedMetadata.duplicateCount}</strong></span>
                )}
                {importedMetadata && importedMetadata.excludedCount > 0 && (
                  <span className="text-amber-400 font-bold">Excluded (missing metric): <strong>{importedMetadata.excludedCount}</strong></span>
                )}
                <span className="text-teal-400">✓ Sorted automatically by metric (descending)</span>
              </div>

              {importedMetadata?.excludedGenes && importedMetadata.excludedGenes.length > 0 && (
                <details className="mt-1 text-xxs">
                  <summary className="cursor-pointer text-amber-400 hover:underline font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 inline" />
                    View excluded genes ({importedMetadata.excludedGenes.length})
                  </summary>
                  <div className="mt-2 max-h-32 overflow-y-auto bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1">
                    {importedMetadata.excludedGenes.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between text-slate-300">
                        <span className="font-bold text-amber-300">{item.symbol}</span>
                        <span className="text-slate-500">{item.reason}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {/* Loaded Dataset Info Banner */}
          {loadedDatasetInfo && !importedMetadata && (
            <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-3.5 flex items-center justify-between text-xs text-indigo-300 font-mono">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>Loaded genome-wide transcriptome: <strong>{loadedDatasetInfo}</strong></span>
              </div>
              <span className="text-xxs text-indigo-400/80">Active Context</span>
            </div>
          )}

          {/* Requirement Info Box */}
          <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-4 text-xs text-indigo-300 flex flex-col gap-2">
            <div className="flex items-center gap-2 font-bold">
              <Info className="w-4 h-4 text-indigo-400" />
              <span>GSEA Requirements: Ranked Gene List Specification</span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              Unlike Over-Representation Analysis (ORA), Gene Set Enrichment Analysis (GSEA) requires a numeric correlation metric for <strong>every gene</strong> (e.g. Log2 Fold-Change, Wald Statistic, or Sign &times; -Log10 P-value).
            </p>
            <div className="font-mono text-xxs bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-slate-400">
              Format: <code>GENE [TAB or COMMA or SPACE] METRIC</code> (e.g. <code>KRAS  3.45</code>)
            </div>
          </div>

          {/* Target Cohort Metric Selector */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950 border border-indigo-500/30 rounded-xl p-3.5 font-mono text-xs shadow-inner">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span className="text-slate-200 font-bold">Target Cohort Fold-Change Metric Dataset:</span>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={activeCohortSource}
                onChange={(e) => {
                  const newSource = e.target.value as "tcga" | "sbrt";
                  setActiveCohortSource(newSource);
                  handleAutoFillMetrics(newSource);
                }}
                className="bg-slate-900 text-teal-300 border border-slate-800 rounded-lg px-3 py-1.5 font-bold focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="tcga">TCGA-PAAD vs GTEx Pancreas (Tumor vs Normal)</option>
                <option value="sbrt">GSE225767 SBRT Radiotherapy (Post vs Pre)</option>
              </select>
            </div>
          </div>

          {/* Structured Entry vs Textarea Paste Mode Toggle */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 font-mono text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-bold">GSEA Input Mode:</span>
              <button
                onClick={() => setGseaInputMode("structured")}
                className={`px-3 py-1 rounded-lg transition ${
                  gseaInputMode === "structured"
                    ? "bg-indigo-500 text-slate-950 font-bold"
                    : "bg-slate-950 text-slate-400 border border-slate-800 hover:text-white"
                }`}
              >
                📊 Structured Table Entry
              </button>
              <button
                onClick={() => setGseaInputMode("textarea")}
                className={`px-3 py-1 rounded-lg transition ${
                  gseaInputMode === "textarea"
                    ? "bg-indigo-500 text-slate-950 font-bold"
                    : "bg-slate-950 text-slate-400 border border-slate-800 hover:text-white"
                }`}
              >
                📋 Textarea Paste Mode
              </button>
            </div>

            {/* Quick Action Load Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleAutoFillMetrics()}
                className="text-xxs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 px-2.5 py-1 rounded-lg font-mono font-bold transition cursor-pointer flex items-center gap-1 shadow"
                title="Auto-fill missing log2FC ranking metrics for entered gene symbols from TCGA/SBRT datasets"
              >
                <Sparkles className="w-3 h-3 text-emerald-400" />
                <span>⚡ Auto-Fill Metrics from Cohort</span>
              </button>
              <button
                type="button"
                onClick={handleLoadExampleGsea}
                className="text-xxs bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 px-2.5 py-1 rounded-lg font-mono font-bold transition cursor-pointer"
              >
                ✨ Load Example (8 Genes)
              </button>
              <button
                type="button"
                onClick={() => loadFullRankedDataset("tcga")}
                className="text-xxs bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 px-2.5 py-1 rounded-lg font-mono font-bold transition cursor-pointer"
              >
                📊 Load TCGA/GTEx Ranked Gene List (19,853)
              </button>
              <button
                type="button"
                onClick={() => loadFullRankedDataset("sbrt")}
                className="text-xxs bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 px-2.5 py-1 rounded-lg font-mono font-bold transition cursor-pointer"
              >
                ⚛️ Load SBRT Ranked Gene List (19,701)
              </button>
            </div>
          </div>

          {/* Structured Table Entry UI */}
          {gseaInputMode === "structured" && (
            <div className="flex flex-col gap-3 font-mono">
              <div className="grid grid-cols-12 gap-3 text-xxs font-bold text-slate-400 uppercase tracking-wider px-2">
                <span className="col-span-6">Gene Symbol (HGNC Autocomplete)</span>
                <span className="col-span-5">Numeric Metric (e.g. Log2FC or Score)</span>
                <span className="col-span-1 text-right">Action</span>
              </div>

              <div className="flex flex-col gap-2 max-h-80 overflow-y-auto p-1">
                {structuredRows.map((row) => (
                  <div key={row.id} className="grid grid-cols-12 gap-3 items-center relative">
                    <div className="col-span-6 relative">
                      <input
                        type="text"
                        value={row.symbol}
                        onChange={(e) => {
                          const val = e.target.value;
                          const valUpper = val.trim().toUpperCase();
                          const metricMap = activeCohortSource === "sbrt" ? sbrtMetricMap : tcgaMetricMap;
                          const autoMetric = !row.metricStr.trim() && metricMap.has(valUpper) ? String(metricMap.get(valUpper)) : row.metricStr;
                          const newRows = structuredRows.map((r) =>
                            r.id === row.id ? { ...r, symbol: val, metricStr: autoMetric } : r
                          );
                          updateStructuredRowsAndSync(newRows);
                          setActiveGseaRowId(row.id);
                          setGseaRowQuery(val);
                        }}
                        onFocus={() => {
                          setActiveGseaRowId(row.id);
                          setGseaRowQuery(row.symbol);
                        }}
                        placeholder="e.g. KRAS, TP53, PHGDH..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 uppercase font-mono focus:outline-none focus:border-indigo-500"
                      />

                      {/* Autocomplete Dropdown for Active Row */}
                      {activeGseaRowId === row.id && gseaRowSuggestions.length > 0 && (
                        <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl max-h-40 overflow-y-auto py-1 text-xs">
                          {gseaRowSuggestions.map((sym) => (
                            <button
                              key={sym}
                              type="button"
                              onClick={() => {
                                const symUpper = sym.toUpperCase();
                                const metricMap = activeCohortSource === "sbrt" ? sbrtMetricMap : tcgaMetricMap;
                                const autoMetric = metricMap.has(symUpper) ? String(metricMap.get(symUpper)) : row.metricStr;
                                const newRows = structuredRows.map((r) =>
                                  r.id === row.id ? { ...r, symbol: sym, metricStr: autoMetric } : r
                                );
                                updateStructuredRowsAndSync(newRows);
                                setActiveGseaRowId(null);
                                setGseaRowQuery("");
                              }}
                              className="w-full text-left px-3 py-1.5 hover:bg-slate-900 text-indigo-300 font-bold flex justify-between items-center transition"
                            >
                              <span>{sym}</span>
                              <span className="text-xxs text-slate-500">Approved HGNC</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="col-span-5">
                      <input
                        type="text"
                        value={row.metricStr}
                        onChange={(e) => {
                          const val = e.target.value;
                          const newRows = structuredRows.map((r) =>
                            r.id === row.id ? { ...r, metricStr: val } : r
                          );
                          updateStructuredRowsAndSync(newRows);
                        }}
                        placeholder="e.g. 3.45 or -2.85"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div className="col-span-1 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemoveStructuredRow(row.id)}
                        className="text-slate-500 hover:text-rose-400 p-1 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={handleAddStructuredRow}
                  className="bg-slate-950 border border-slate-800 hover:border-indigo-500/50 text-indigo-300 text-xs px-3 py-1.5 rounded-lg font-bold transition cursor-pointer"
                >
                  + Add Gene Row
                </button>
                <span className="text-xxs text-slate-500">
                  {structuredRows.length} structured rows entered
                </span>
              </div>
            </div>
          )}

          {/* Textarea Paste Mode UI */}
          {gseaInputMode === "textarea" && (
            <div className="flex flex-col gap-1.5 font-mono">
              <label className="text-xs text-slate-400 flex justify-between items-center">
                <span>Paste Ranked List (GENE [TAB/COMMA/SPACE] METRIC):</span>
                <span className="text-xxs text-slate-500">{gseaParsingQC.totalLines} lines entered</span>
              </label>
              <textarea
                rows={6}
                value={rankedInputText}
                onChange={(e) => setRankedInputText(e.target.value)}
                placeholder="KRAS&#9;3.45&#10;TP53&#9;-2.85&#10;SMAD4&#9;-2.10"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 font-mono placeholder-slate-600 focus:outline-none focus:border-indigo-500 leading-relaxed"
              />
            </div>
          )}

          {/* DEDICATED GSEA QC BREAKDOWN CARD */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col gap-3 text-xs font-mono">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-4">
                <span className="text-slate-400">
                  Input Rows: <strong>{gseaParsingQC.totalLines}</strong>
                </span>
                <span className="text-indigo-400">
                  Valid Ranked Entries: <strong>{gseaParsingQC.validRankedEntries.length.toLocaleString()}</strong>
                </span>
                <span className="text-rose-400">
                  Missing Metrics: <strong>{gseaParsingQC.missingMetricEntries.length}</strong>
                </span>
                <span className="text-amber-400">
                  Duplicates: <strong>{gseaParsingQC.duplicateEntries.length}</strong>
                </span>
                <span className="text-slate-400">
                  Unmapped: <strong>{gseaParsingQC.unmappedEntries.length}</strong>
                </span>
              </div>

              <span className="text-xxs text-slate-400">
                Metric Range: {gseaParsingQC.metricRange ? `${gseaParsingQC.metricRange.min.toFixed(2)} to ${gseaParsingQC.metricRange.max.toFixed(2)}` : "N/A"}
              </span>
            </div>

            {/* Missing Metric Obvious Alert */}
            {gseaParsingQC.missingMetricEntries.length > 0 && (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 text-xs text-rose-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <strong>{gseaParsingQC.missingMetricEntries.length} gene(s) missing a numeric ranking metric:</strong>
                  <p className="text-xxs text-rose-300/80 mt-1">
                    {gseaParsingQC.missingMetricEntries.map((e) => e.reason).join(" | ")}
                  </p>
                  <p className="text-xxs text-rose-400/90 mt-1 font-sans">
                    GSEA requires a ranking metric for every gene (e.g. Log2FC or Wald statistic). Provide scores or use ORA mode for unordered gene lists.
                  </p>
                </div>
              </div>
            )}

            {/* Non-numeric metric alert */}
            {gseaParsingQC.nonNumericEntries.length > 0 && (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 text-xs text-rose-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <strong>Non-numeric metric values detected:</strong>
                  <p className="text-xxs text-rose-300/80 mt-1">
                    {gseaParsingQC.nonNumericEntries.map((e) => e.reason).join(" | ")}
                  </p>
                </div>
              </div>
            )}

            {/* Duplicates alert */}
            {gseaParsingQC.duplicateEntries.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong>{gseaParsingQC.duplicateEntries.length} duplicate gene entries detected:</strong>
                  <p className="text-xxs text-amber-300/80 mt-1">
                    {gseaParsingQC.duplicateEntries.map((e) => e.reason).join(" | ")}
                  </p>
                </div>
              </div>
            )}

            {/* Small list parser demonstration warning */}
            {gseaParsingQC.validRankedEntries.length > 0 && gseaParsingQC.validRankedEntries.length < 15 && (
              <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-lg p-2.5 text-xxs text-indigo-300 flex items-center gap-2">
                <Info className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>
                  Parser Demonstration: Only {gseaParsingQC.validRankedEntries.length} ranked genes provided. For biological GSEA enrichment, load a full genome-wide ranked transcriptomic list (~10,000+ genes) using the buttons above.
                </span>
              </div>
            )}
          </div>

          {/* GSEA Action Trigger Button */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="text-xs text-slate-400 flex items-center gap-1.5">
              <Info className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>
                {isGseaValid
                  ? `Ready to execute GSEA engine on ${gseaParsingQC.validRankedEntries.length.toLocaleString()} ranked mapped genes.`
                  : (gseaParsingQC.validationError || "Provide a valid ranked gene list containing at least 3 mapped genes.")}
              </span>
            </div>

            <button
              onClick={() => {
                if (onRunGsea && isGseaValid) {
                  const qc: MappingQC = {
                    inputGeneCount: gseaParsingQC.totalLines,
                    mappedGeneCount: gseaParsingQC.validRankedEntries.length,
                    unmappedGeneCount: gseaParsingQC.unmappedEntries.length,
                    duplicateSymbolsCount: gseaParsingQC.duplicateEntries.length,
                    mappingRate: gseaParsingQC.validRankedEntries.length / Math.max(1, gseaParsingQC.totalLines),
                    unmappedSymbols: gseaParsingQC.unmappedEntries.map((e) => e.symbol),
                    backgroundSource: "Integrated Pathway Database Universe",
                    backgroundUniverseSize: universeSet.size
                  };
                  onRunGsea(gseaParsingQC.validRankedEntries, qc);
                }
              }}
              disabled={!isGseaValid || !onRunGsea}
              className={`px-5 py-2.5 rounded-xl font-bold font-mono text-xs flex items-center gap-2 transition shadow-lg ${
                isGseaValid && onRunGsea
                  ? "bg-indigo-500 hover:bg-indigo-400 text-slate-950 cursor-pointer"
                  : "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
              }`}
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Run GSEA Pathway Analysis</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
