"use client";

import React, { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";
import SearchableGeneSelect from "./SearchableGeneSelect";
import { X, Info, AlertTriangle } from "lucide-react";
import ExportButton from "./ExportButton";
import { exportToCSV, exportSvgElement } from "@/utils/exportUtils";

interface DegGene {
  gene_name: string;
  log2FC: number;
}

interface ExpressionData {
  samples: string[];
  conditions: string[];
  expressions: { [gene: string]: number[] };
}

interface ExpressionComparisonProps {
  selectedGenes: string[];
  onAddGene: (geneName: string) => void;
  onRemoveGene: (geneName: string) => void;
  allGenes: string[];
  expressionData: ExpressionData | null;
  degData: DegGene[];
  isTcgaGtex?: boolean;
  tcgaGtexExpressionForSelectedGene?: number[] | null; // 349 values if available
  selectedGeneSymbol?: string | null;
}

export default function ExpressionComparison({
  selectedGenes,
  onAddGene,
  onRemoveGene,
  allGenes,
  expressionData,
  degData,
  isTcgaGtex = false,
  tcgaGtexExpressionForSelectedGene = null,
  selectedGeneSymbol = null,
}: ExpressionComparisonProps) {
  const [showSolidNormal, setShowSolidNormal] = useState<boolean>(true);
  const sbrtChartRef = React.useRef<HTMLDivElement>(null);
  const tcgaChartRef = React.useRef<HTMLDivElement>(null);

  // 1. SBRT Mode Data Processing
  const SbrtData = useMemo(() => {
    if (isTcgaGtex || !expressionData || selectedGenes.length === 0) return [];

    const { conditions, expressions } = expressionData;

    return selectedGenes
      .map((geneName) => {
        const exprVals = expressions[geneName];
        if (!exprVals || exprVals.length === 0) return null;

        const preVals = exprVals.filter((_, idx) => conditions[idx] === "Pre");
        const postVals = exprVals.filter((_, idx) => conditions[idx] === "Post");

        const meanPre = preVals.length > 0 ? preVals.reduce((a, b) => a + b, 0) / preVals.length : 0;
        const meanPost = postVals.length > 0 ? postVals.reduce((a, b) => a + b, 0) / postVals.length : 0;

        const log2FC = meanPost - meanPre;

        return {
          gene_name: geneName,
          "Pre-SBRT": Number(meanPre.toFixed(3)),
          "Post-SBRT": Number(meanPost.toFixed(3)),
          log2FC,
        };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);
  }, [selectedGenes, expressionData, degData, isTcgaGtex]);

  // 2. TCGA-GTEx Mode Data Processing (Strip-Jitter plot)
  const tcgaGtexScatterData = useMemo(() => {
    if (!isTcgaGtex || !tcgaGtexExpressionForSelectedGene) {
      return { points: [], stats: { gtexMean: 0, tumorMean: 0, solidMean: 0 } };
    }

    const expr = tcgaGtexExpressionForSelectedGene;
    const points: any[] = [];
    
    // Cohort partitions:
    // 0 to 177: TCGA Tumor (n=178)
    // 178 to 344: GTEx Normal (n=167)
    // 345 to 348: TCGA Solid Normal (n=4)
    
    const tumorVals: number[] = [];
    const gtexVals: number[] = [];
    const solidVals: number[] = [];

    // GTEx Normal (X category 0)
    for (let i = 178; i < 345; i++) {
      if (expr[i] !== undefined) {
        gtexVals.push(expr[i]);
        points.push({
          cohortIdx: 0,
          cohortName: "GTEx Normal\n(n=167)",
          // Add random jitter to x coordinate within [ -0.15, +0.15 ]
          x: 0 + (Math.random() - 0.5) * 0.3,
          y: Number(expr[i].toFixed(4)),
          cohortId: "gtex",
          sample: `GTEx Pancreas #${i - 177}`,
        });
      }
    }

    // TCGA Primary Tumor (X category 1)
    for (let i = 0; i < 178; i++) {
      if (expr[i] !== undefined) {
        tumorVals.push(expr[i]);
        points.push({
          cohortIdx: 1,
          cohortName: "TCGA Tumor\n(n=178)",
          x: 1 + (Math.random() - 0.5) * 0.3,
          y: Number(expr[i].toFixed(4)),
          cohortId: "tumor",
          sample: `TCGA PAAD #${i + 1}`,
        });
      }
    }

    // TCGA Solid Normal Adjacent (X category 2, optional diagnostic check)
    if (showSolidNormal) {
      for (let i = 345; i < 349; i++) {
        if (expr[i] !== undefined) {
          solidVals.push(expr[i]);
          points.push({
            cohortIdx: 2,
            cohortName: "TCGA Solid Normal\n(n=4)",
            x: 2 + (Math.random() - 0.5) * 0.1, // less jitter since there are only 4
            y: Number(expr[i].toFixed(4)),
            cohortId: "solid_normal",
            sample: `TCGA Solid Normal #${i - 344}`,
          });
        }
      }
    }

    // Compute cohort summary stats (means)
    const stats = {
      gtexMean: gtexVals.length ? gtexVals.reduce((a, b) => a + b, 0) / gtexVals.length : 0,
      tumorMean: tumorVals.length ? tumorVals.reduce((a, b) => a + b, 0) / tumorVals.length : 0,
      solidMean: solidVals.length ? solidVals.reduce((a, b) => a + b, 0) / solidVals.length : 0,
    };

    return { points, stats };
  }, [isTcgaGtex, tcgaGtexExpressionForSelectedGene, showSolidNormal]);

  // SBRT Custom Tooltip
  const SbrtTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const preVal = payload[0].value;
      const postVal = payload[1].value;
      const log2FCVal = payload[0].payload.log2FC;

      return (
        <div className="bg-slate-950 border border-slate-700 p-2.5 rounded-lg text-xs shadow-xl font-mono">
          <div className="font-bold text-teal-400 text-sm mb-1">{label}</div>
          <div className="flex justify-between gap-6 mb-1">
            <span className="text-slate-400">Pre-SBRT (Mean):</span>
            <span className="font-semibold text-slate-200">{preVal.toFixed(3)}</span>
          </div>
          <div className="flex justify-between gap-6 mb-1.5">
            <span className="text-slate-400">Post-SBRT (Mean):</span>
            <span className="font-semibold text-slate-200">{postVal.toFixed(3)}</span>
          </div>
          <div className="border-t border-slate-800 pt-1 flex justify-between gap-6">
            <span>log2 Fold Change:</span>
            <span className={`font-bold ${log2FCVal > 0 ? "text-red-400" : "text-blue-400"}`}>
              {log2FCVal > 0 ? "+" : ""}{log2FCVal.toFixed(3)}
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  // TCGA-GTEx Jitter Scatter Tooltip
  const TcgaGtexTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-950 border border-slate-700 p-2.5 rounded-lg text-xs shadow-xl font-mono">
          <div className="font-bold text-teal-400 mb-1">{data.sample}</div>
          <div className="flex justify-between gap-4 mb-1">
            <span className="text-slate-400">Cohort:</span>
            <span className="text-slate-200 text-right">{data.cohortName.replace("\n", " ")}</span>
          </div>
          <div className="flex justify-between gap-4 border-t border-slate-850 pt-1 mt-1 font-semibold">
            <span>Expression log₂(TPM + 0.001):</span>
            <span className="text-amber-400">{data.y.toFixed(3)}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  // Render SBRT Mode Comparison
  if (!isTcgaGtex) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col h-full w-full">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
          <div>
            <h3 className="text-slate-200 font-semibold text-lg">Pre-SBRT vs. Post-SBRT Comparison</h3>
            <p className="text-xs text-slate-400">
              Actual mean expression levels (log2-normalized counts) before and after SBRT
            </p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="w-full sm:w-44">
              <SearchableGeneSelect
                options={allGenes}
                value={null}
                onChange={(val) => {
                  if (val && !selectedGenes.includes(val)) {
                    onAddGene(val);
                  }
                }}
                placeholder="Add gene..."
              />
            </div>
            <ExportButton
              disabled={SbrtData.length === 0}
              onExportCSV={() => {
                if (SbrtData.length === 0) return;
                exportToCSV({
                  filename: `ExpressionComparison_SBRT.csv`,
                  metadata: {
                    dataset: "GSE225767 Bulk RNA-seq",
                    module: "Pre-SBRT vs Post-SBRT Expression Comparison",
                    selectedGene: selectedGenes.join(", "),
                    filters: `Total Genes Compared: ${SbrtData.length}`,
                  },
                  headers: ["Gene Symbol", "Pre-SBRT Mean", "Post-SBRT Mean", "log2FC"],
                  rows: SbrtData.map((d: any) => [d.gene_name, d["Pre-SBRT"], d["Post-SBRT"], d.log2FC]),
                });
              }}
              onExportPNG={() => {
                const svgEl = sbrtChartRef.current?.querySelector("svg");
                if (!svgEl) return;
                exportSvgElement({
                  svgElement: svgEl as SVGSVGElement,
                  filename: `ExpressionComparison_SBRT.png`,
                  format: "png",
                  title: "Pre-SBRT vs Post-SBRT Expression Comparison",
                });
              }}
              onExportSVG={() => {
                const svgEl = sbrtChartRef.current?.querySelector("svg");
                if (!svgEl) return;
                exportSvgElement({
                  svgElement: svgEl as SVGSVGElement,
                  filename: `ExpressionComparison_SBRT.svg`,
                  format: "svg",
                  title: "Pre-SBRT vs Post-SBRT Expression Comparison",
                });
              }}
            />
          </div>
        </div>

        {selectedGenes.length === 0 || !expressionData ? (
          <div className="flex-1 border border-dashed border-slate-800 rounded-lg flex items-center justify-center h-48 text-slate-500 text-xs font-mono">
            Select or add genes in the control above to compare Pre vs Post treatment response.
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-4">
            <div ref={sbrtChartRef} className="flex-1 w-full h-[250px] min-h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={SbrtData} margin={{ top: 10, right: 10, bottom: 10, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.05)" />
                  <XAxis
                    dataKey="gene_name"
                    stroke="#64748b"
                    tickLine={false}
                    axisLine={{ stroke: "#475569" }}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    stroke="#64748b"
                    tickLine={false}
                    axisLine={{ stroke: "#475569" }}
                    tick={{ fontSize: 10 }}
                    label={{
                      value: "Log2 Expression Level",
                      angle: -90,
                      position: "insideLeft",
                      offset: 5,
                      fill: "#94a3b8",
                      fontSize: 11,
                      fontWeight: "bold",
                    }}
                  />
                  <Tooltip content={<SbrtTooltip />} />
                  <Legend
                    verticalAlign="top"
                    height={30}
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 11, color: "#94a3b8" }}
                  />
                  <Bar dataKey="Pre-SBRT" fill="#64748b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Post-SBRT" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Selected Genes Chip List with Removal */}
            <div className="flex flex-wrap gap-1.5 max-h-[85px] overflow-y-auto pr-1">
              {selectedGenes.map((gene) => (
                <span
                  key={gene}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border bg-slate-950 border-slate-800 text-slate-300 transition-colors"
                >
                  <span>{gene}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveGene(gene)}
                    className="hover:bg-slate-800 rounded p-0.5 transition-colors text-slate-500 hover:text-red-400"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // 3. Render TCGA-GTEx Mode Comparison (Tumor vs Normal Strip Plot)
  const { points, stats } = tcgaGtexScatterData;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col h-full w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
        <div>
          <h3 className="text-slate-200 font-semibold text-lg flex items-center gap-2">
            Tumor vs. Normal Expression
            {selectedGeneSymbol && (
              <span className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded font-mono font-bold">
                {selectedGeneSymbol}
              </span>
            )}
          </h3>
          <p className="text-xs text-slate-400">
            Actual sample-level log₂(TPM + 0.001) expression values from Toil
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Diagnostic Checkbox option for Solid Normal */}
          <label className="flex items-center gap-2 text-xxs font-mono text-slate-300 bg-slate-950 p-1.5 rounded border border-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={showSolidNormal}
              onChange={(e) => setShowSolidNormal(e.target.checked)}
              className="rounded accent-teal-500 bg-slate-900 border-slate-800 cursor-pointer"
            />
            <span>Show TCGA Solid Normal (n=4)</span>
          </label>

          <ExportButton
            disabled={!points || points.length === 0}
            onExportCSV={() => {
              if (!points || points.length === 0) return;
              exportToCSV({
                filename: `Tumor_vs_Normal_${selectedGeneSymbol || "Target"}.csv`,
                metadata: {
                  dataset: "TCGA-PAAD vs GTEx Pancreas",
                  module: "Tumor vs Normal Expression Boxplot / Strip Plot",
                  selectedGene: selectedGeneSymbol || "N/A",
                  filters: `Total Samples: ${points.length}`,
                },
                headers: ["Sample ID", "Cohort", "Expression log2(TPM+0.001)"],
                rows: points.map((p) => [p.sample, p.cohortName, p.y]),
              });
            }}
            onExportPNG={() => {
              const svgEl = tcgaChartRef.current?.querySelector("svg");
              if (!svgEl) return;
              exportSvgElement({
                svgElement: svgEl as SVGSVGElement,
                filename: `Tumor_vs_Normal_${selectedGeneSymbol || "Target"}.png`,
                format: "png",
                title: `TCGA vs GTEx: ${selectedGeneSymbol || "Target"}`,
              });
            }}
            onExportSVG={() => {
              const svgEl = tcgaChartRef.current?.querySelector("svg");
              if (!svgEl) return;
              exportSvgElement({
                svgElement: svgEl as SVGSVGElement,
                filename: `Tumor_vs_Normal_${selectedGeneSymbol || "Target"}.svg`,
                format: "svg",
                title: `TCGA vs GTEx: ${selectedGeneSymbol || "Target"}`,
              });
            }}
          />
        </div>
      </div>

      {!tcgaGtexExpressionForSelectedGene || !selectedGeneSymbol ? (
        <div className="flex-1 border border-dashed border-slate-800 rounded-lg flex items-center justify-center h-48 text-slate-500 text-xs font-mono">
          Select a gene in the sidebar/table to visualize actual sample-level expression levels.
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-3">
          {/* Main Scatter Plot */}
          <div ref={tcgaChartRef} className="flex-1 w-full h-[230px] min-h-[230px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 15, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.03)" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="Cohort"
                  domain={showSolidNormal ? [-0.4, 2.4] : [-0.4, 1.4]}
                  ticks={showSolidNormal ? [0, 1, 2] : [0, 1]}
                  tickFormatter={(val) => {
                    if (val === 0) return "GTEx Normal";
                    if (val === 1) return "TCGA Tumor";
                    return "TCGA Solid Normal";
                  }}
                  stroke="#64748b"
                  tickLine={false}
                  axisLine={{ stroke: "#475569" }}
                  tick={{ fontSize: 10 }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Expression"
                  stroke="#64748b"
                  tickLine={false}
                  axisLine={{ stroke: "#475569" }}
                  tick={{ fontSize: 10 }}
                  label={{
                    value: "Expression level log₂(TPM + 0.001)",
                    angle: -90,
                    position: "insideLeft",
                    offset: 12,
                    fill: "#94a3b8",
                    fontSize: 10,
                    fontWeight: "bold",
                    style: { textAnchor: "middle" }
                  }}
                />
                <ZAxis type="number" range={[45, 45]} />
                <Tooltip content={<TcgaGtexTooltip />} />

                {/* GTEx normal samples */}
                <Scatter
                  name="GTEx Normal"
                  data={points.filter((p) => p.cohortId === "gtex")}
                  fill="#4575b4" // Softer blue
                  shape="circle"
                  opacity={0.65}
                />

                {/* TCGA Tumor samples */}
                <Scatter
                  name="TCGA Tumor"
                  data={points.filter((p) => p.cohortId === "tumor")}
                  fill="#d73027" // Softer red
                  shape="circle"
                  opacity={0.65}
                />

                {/* TCGA solid normal adjacent (visually distinguished) */}
                {showSolidNormal && (
                  <Scatter
                    name="TCGA Solid Normal"
                    data={points.filter((p) => p.cohortId === "solid_normal")}
                    fill="#fee090" // Yellow
                    stroke="#e6b800"
                    strokeWidth={1.5}
                    shape="square" // distinguished shape
                    z={90} // make them slightly larger for visibility
                  />
                )}
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          {/* Descriptive Statistics Card */}
          <div className="grid grid-cols-3 gap-3 text-xxs font-mono bg-slate-950 p-2.5 rounded-lg border border-slate-850">
            <div className="flex flex-col gap-0.5">
              <span className="text-slate-500">GTEx Normal (n=167)</span>
              <span className="text-slate-300 font-semibold text-xs">{stats.gtexMean.toFixed(4)} log2</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-slate-500">TCGA Tumor (n=178)</span>
              <span className="text-slate-300 font-semibold text-xs">{stats.tumorMean.toFixed(4)} log2</span>
            </div>
            {showSolidNormal && (
              <div className="flex flex-col gap-0.5">
                <span className="text-slate-500">Adjacent Normal (n=4)</span>
                <span className="text-slate-300 font-semibold text-xs">{stats.solidMean.toFixed(4)} log2</span>
              </div>
            )}
          </div>

          {/* Solid Normal Adjacent Caution Banner */}
          {showSolidNormal && (
            <div className="bg-amber-500/5 border border-amber-500/15 p-2 rounded flex gap-2 text-[10px] font-mono text-amber-300/80 leading-normal">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
              <p>
                <strong>Diagnostic Reference Notice:</strong> TCGA tumor-adjacent solid-normal tissues (n=4) showed transcriptional profiles distinct from healthy GTEx pancreas and closer to TCGA-PAAD tumors; given the small sample size and potential tissue-composition/field effects, these samples were used only as a secondary diagnostic reference.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
