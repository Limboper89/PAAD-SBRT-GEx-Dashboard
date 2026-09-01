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
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import SearchableGeneSelect from "./SearchableGeneSelect";
import { X, Info, AlertTriangle, HelpCircle } from "lucide-react";
import ExportButton from "./ExportButton";
import { exportToCSV, exportCanvasToPNG, exportCanvasToSVG } from "@/utils/exportUtils";

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
  const [showMean, setShowMean] = useState<boolean>(false);
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

  // 2. TCGA-GTEx Mode Data Processing (Strip-Jitter plot & Boxplot representation)
  const tcgaGtexScatterData = useMemo(() => {
    if (!isTcgaGtex || !tcgaGtexExpressionForSelectedGene) {
      return {
        points: [],
        meanPoints: [],
        boxStats: [],
        stats: { gtexMean: 0, tumorMean: 0, solidMean: 0 },
      };
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
            x: 2 + (Math.random() - 0.5) * 0.1,
            y: Number(expr[i].toFixed(4)),
            cohortId: "solid_normal",
            sample: `TCGA Solid Normal #${i - 344}`,
          });
        }
      }
    }

    const calcBox = (vals: number[], xIdx: number, cohortName: string, color: string) => {
      if (vals.length === 0) return null;
      const sorted = [...vals].sort((a, b) => a - b);
      const n = sorted.length;
      const mean = vals.reduce((a, b) => a + b, 0) / n;

      const getQuantile = (q: number) => {
        const pos = (n - 1) * q;
        const base = Math.floor(pos);
        const rest = pos - base;
        if (sorted[base + 1] !== undefined) {
          return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
        }
        return sorted[base];
      };

      const q1 = getQuantile(0.25);
      const median = getQuantile(0.50);
      const q3 = getQuantile(0.75);
      const iqr = q3 - q1;
      const validLower = sorted.filter((v) => v >= q1 - 1.5 * iqr);
      const validUpper = sorted.filter((v) => v <= q3 + 1.5 * iqr);
      const minW = validLower.length ? Math.min(...validLower) : q1;
      const maxW = validUpper.length ? Math.max(...validUpper) : q3;

      return {
        x: xIdx,
        cohortName,
        color,
        n,
        mean: Number(mean.toFixed(4)),
        median: Number(median.toFixed(4)),
        q1: Number(q1.toFixed(4)),
        q3: Number(q3.toFixed(4)),
        minW: Number(minW.toFixed(4)),
        maxW: Number(maxW.toFixed(4)),
      };
    };

    const gtexBox = calcBox(gtexVals, 0, "GTEx Normal", "#4575b4");
    const tumorBox = calcBox(tumorVals, 1, "TCGA Tumor", "#d73027");
    const solidBox = showSolidNormal ? calcBox(solidVals, 2, "TCGA Solid Normal", "#fee090") : null;

    const boxStats = [gtexBox, tumorBox, solidBox].filter(Boolean) as any[];

    const meanPoints = boxStats.map((b: any) => ({
      x: b.x,
      y: b.mean,
      cohortName: b.cohortName,
      n: b.n,
      isMeanMarker: true,
    }));

    const stats = {
      gtexMean: gtexBox ? gtexBox.mean : 0,
      tumorMean: tumorBox ? tumorBox.mean : 0,
      solidMean: solidBox ? solidBox.mean : 0,
    };

    return { points, meanPoints, boxStats, stats };
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

  // TCGA-GTEx Jitter Scatter & Mean Diamond Tooltip
  const TcgaGtexTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;

      if (data.isMeanMarker) {
        return (
          <div className="bg-slate-950 border border-amber-500/50 p-2.5 rounded-lg text-xs shadow-xl font-mono">
            <div className="font-bold text-amber-400 mb-1">Mean Expression</div>
            <div className="text-slate-200 mb-0.5">
              Value: <span className="font-bold">{data.y.toFixed(3)}</span> log2(TPM + 0.001)
            </div>
            <div className="text-slate-400">n = {data.n}</div>
          </div>
        );
      }

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

  // Custom Diamond Shape component for Arithmetic Mean
  const MeanDiamondShape = (props: any) => {
    const { cx, cy } = props;
    if (cx === undefined || cy === undefined || isNaN(cx) || isNaN(cy)) return null;
    const r = 4.5; // 9px diameter
    const pointsStr = `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;

    return (
      <polygon
        points={pointsStr}
        fill="#fbbf24"
        stroke="#0f172a"
        strokeWidth={1.5}
        className="cursor-pointer transition-transform hover:scale-125"
      />
    );
  };

  const generateHighResSbrtCanvas = (theme: "light" | "dark" = "light", size: number = 2400): HTMLCanvasElement => {
    const offscreen = document.createElement("canvas");
    offscreen.width = size;
    offscreen.height = size;
    const ctx = offscreen.getContext("2d");
    if (!ctx || SbrtData.length === 0) return offscreen;

    const isLight = theme === "light";

    // 1. Background
    ctx.fillStyle = isLight ? "#ffffff" : "#020617";
    ctx.fillRect(0, 0, size, size);

    // 2. Header
    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 54px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Pre-SBRT vs. Post-SBRT Expression Response (GSE225767)", 100, 85);

    ctx.fillStyle = isLight ? "#334155" : "#94a3b8";
    ctx.font = "bold 30px monospace";
    ctx.fillText(`Target Genes (${SbrtData.length}): ${selectedGenes.join(", ")} · Paired Cohort (N = 55)`, 100, 136);

    // 3. Layout Dimensions
    const padLeft = 240;
    const padRight = 100;
    const padTop = 260;
    const padBottom = 260;
    const plotW = size - padLeft - padRight;
    const plotH = size - padTop - padBottom;

    // Max expression value with 20% headroom
    let rawMax = 0;
    SbrtData.forEach((d: any) => {
      if (d["Pre-SBRT"] > rawMax) rawMax = d["Pre-SBRT"];
      if (d["Post-SBRT"] > rawMax) rawMax = d["Post-SBRT"];
    });
    const maxVal = Math.ceil(rawMax * 1.25) || 10;

    const mapY = (y: number) => padTop + plotH - (y / maxVal) * plotH;

    // 4. Grid Lines & Ticks
    ctx.strokeStyle = isLight ? "rgba(226, 232, 240, 0.9)" : "rgba(30, 41, 59, 0.6)";
    ctx.lineWidth = 1.5;

    const numTicks = 5;
    for (let i = 0; i <= numTicks; i++) {
      const yVal = (i / numTicks) * maxVal;
      const py = mapY(yVal);

      ctx.beginPath();
      ctx.moveTo(padLeft, py);
      ctx.lineTo(padLeft + plotW, py);
      ctx.stroke();

      ctx.fillStyle = isLight ? "#475569" : "#94a3b8";
      ctx.font = "bold 36px monospace";
      ctx.textAlign = "right";
      ctx.fillText(yVal.toFixed(1), padLeft - 24, py + 12);
    }

    // 5. Axes Box
    ctx.strokeStyle = isLight ? "#0f172a" : "#64748b";
    ctx.lineWidth = 4;
    ctx.strokeRect(padLeft, padTop, plotW, plotH);

    ctx.save();
    ctx.translate(padLeft - 120, padTop + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 44px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Normalized log2-Expression", 0, 0);
    ctx.restore();

    // 6. Draw Grouped Bars
    const groupW = plotW / SbrtData.length;
    const barW = Math.min(groupW * 0.36, 140);

    SbrtData.forEach((d: any, idx: number) => {
      const groupCenter = padLeft + idx * groupW + groupW / 2;

      // Pre-SBRT Bar (Teal #14b8a6)
      const preX = groupCenter - barW - 8;
      const preH = (d["Pre-SBRT"] / maxVal) * plotH;
      const preY = padTop + plotH - preH;

      ctx.fillStyle = "#14b8a6";
      ctx.fillRect(preX, preY, barW, preH);
      ctx.strokeStyle = isLight ? "rgba(15,23,42,0.3)" : "rgba(255,255,255,0.3)";
      ctx.lineWidth = 2.5;
      ctx.strokeRect(preX, preY, barW, preH);

      // Pre Value above bar
      ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
      ctx.font = "bold 28px monospace";
      ctx.textAlign = "center";
      ctx.fillText(d["Pre-SBRT"].toFixed(2), preX + barW / 2, preY - 14);

      // Post-SBRT Bar (Orange #f97316)
      const postX = groupCenter + 8;
      const postH = (d["Post-SBRT"] / maxVal) * plotH;
      const postY = padTop + plotH - postH;

      ctx.fillStyle = "#f97316";
      ctx.fillRect(postX, postY, barW, postH);
      ctx.strokeRect(postX, postY, barW, postH);

      // Post Value above bar
      ctx.fillText(d["Post-SBRT"].toFixed(2), postX + barW / 2, postY - 14);

      // Gene Symbol Label on X-Axis
      ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
      ctx.font = "bold 44px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(d.gene_name, groupCenter, padTop + plotH + 54);

      // Delta / log2FC annotation
      const fcColor = d.log2FC >= 0 ? (isLight ? "#15803d" : "#4ade80") : (isLight ? "#b91c1c" : "#f87171");
      ctx.fillStyle = fcColor;
      ctx.font = "bold 32px monospace";
      ctx.fillText(`Δ: ${d.log2FC >= 0 ? "+" : ""}${d.log2FC.toFixed(2)}`, groupCenter, padTop + plotH + 100);
    });

    // 7. Dedicated Legend Card (Top-Right)
    const legendCardX = padLeft + plotW - 540;
    const legendCardY = padTop + 25;
    const legendCardW = 520;
    const legendCardH = 160;

    ctx.fillStyle = isLight ? "rgba(248, 250, 252, 0.98)" : "rgba(11, 19, 41, 0.98)";
    ctx.fillRect(legendCardX, legendCardY, legendCardW, legendCardH);
    ctx.strokeStyle = isLight ? "#cbd5e1" : "#1e293b";
    ctx.lineWidth = 2.5;
    ctx.strokeRect(legendCardX, legendCardY, legendCardW, legendCardH);

    // Pre-SBRT Swatch
    ctx.fillStyle = "#14b8a6";
    ctx.fillRect(legendCardX + 28, legendCardY + 30, 36, 36);
    ctx.strokeStyle = isLight ? "#0f172a" : "#ffffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(legendCardX + 28, legendCardY + 30, 36, 36);

    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 32px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Pre-SBRT Baseline", legendCardX + 80, legendCardY + 58);

    // Post-SBRT Swatch
    ctx.fillStyle = "#f97316";
    ctx.fillRect(legendCardX + 28, legendCardY + 95, 36, 36);
    ctx.strokeRect(legendCardX + 28, legendCardY + 95, 36, 36);

    ctx.fillText("Post-SBRT Treated", legendCardX + 80, legendCardY + 123);

    return offscreen;
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
              onExportPNG={({ theme = "light" } = {}) => {
                const exportCanvas = generateHighResSbrtCanvas(theme, 2400);
                exportCanvasToPNG({
                  canvas: exportCanvas,
                  filename: `ExpressionComparison_SBRT.png`,
                  theme,
                });
              }}
              onExportSVG={({ theme = "light" } = {}) => {
                const exportCanvas = generateHighResSbrtCanvas(theme, 1200);
                exportCanvasToSVG({
                  canvas: exportCanvas,
                  filename: `ExpressionComparison_SBRT.svg`,
                  theme,
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
                <BarChart data={SbrtData} margin={{ top: 10, right: 15, bottom: 15, left: 15 }}>
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
                      value: "Mean Expression level log₂(DESeq2 normalized counts)",
                      angle: -90,
                      position: "insideLeft",
                      offset: 12,
                      fill: "#94a3b8",
                      fontSize: 10,
                      fontWeight: "bold",
                      style: { textAnchor: "middle" }
                    }}
                  />
                  <Tooltip content={<SbrtTooltip />} cursor={{ fill: "rgba(255, 255, 255, 0.04)" }} />
                  <Legend
                    verticalAlign="top"
                    height={30}
                    iconType="rect"
                    iconSize={10}
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

  // 3. Render TCGA-GTEx Mode Comparison (Tumor vs Normal Boxplot / Strip Plot)
  const { points, meanPoints, boxStats, stats } = tcgaGtexScatterData;
  const generateHighResTcgaCanvas = (theme: "light" | "dark" = "light", size: number = 2400): HTMLCanvasElement => {
    const offscreen = document.createElement("canvas");
    offscreen.width = size;
    offscreen.height = size;
    const ctx = offscreen.getContext("2d");
    if (!ctx || !points || points.length === 0) return offscreen;

    const isLight = theme === "light";

    // 1. Background
    ctx.fillStyle = isLight ? "#ffffff" : "#020617";
    ctx.fillRect(0, 0, size, size);

    // 2. Header
    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 56px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Tumor vs. Normal Expression: ${selectedGeneSymbol || "Target Gene"}`, 100, 85);

    ctx.fillStyle = isLight ? "#334155" : "#94a3b8";
    ctx.font = "bold 30px monospace";
    ctx.fillText(`TCGA-PAAD Tumors (n=178) vs GTEx Normal Pancreas (n=167) · Reference Atlas (N = 349)`, 100, 136);

    // 3. Layout Dimensions (Clean Top Headroom)
    const padLeft = 240;
    const padRight = 100;
    const padTop = 300; // Gives 300px headroom so boxplot never touches top border
    const padBottom = 240;
    const plotW = size - padLeft - padRight;
    const plotH = size - padTop - padBottom;

    // Y Axis Range with 22% Top Breathing Room
    const yVals = points.map((p: any) => p.y);
    const rawMinY = Math.min(...yVals);
    const rawMaxY = Math.max(...yVals);
    const ySpan = Math.max(rawMaxY - rawMinY, 2.0);
    const minY = Math.max(0, Math.floor(rawMinY - ySpan * 0.06));
    const maxY = Math.ceil(rawMaxY + ySpan * 0.22); // Generous headroom

    const mapY = (y: number) => padTop + plotH - ((y - minY) / (maxY - minY)) * plotH;

    // 4. Grid Lines & Ticks
    ctx.strokeStyle = isLight ? "rgba(226, 232, 240, 0.9)" : "rgba(30, 41, 59, 0.6)";
    ctx.lineWidth = 1.5;

    const numTicks = 6;
    const tickStep = (maxY - minY) / numTicks;
    for (let i = 0; i <= numTicks; i++) {
      const yVal = minY + i * tickStep;
      const py = mapY(yVal);

      ctx.beginPath();
      ctx.moveTo(padLeft, py);
      ctx.lineTo(padLeft + plotW, py);
      ctx.stroke();

      ctx.fillStyle = isLight ? "#475569" : "#94a3b8";
      ctx.font = "bold 38px monospace";
      ctx.textAlign = "right";
      ctx.fillText(yVal.toFixed(1), padLeft - 26, py + 12);
    }

    // 5. Axes Box
    ctx.strokeStyle = isLight ? "#0f172a" : "#64748b";
    ctx.lineWidth = 4;
    ctx.strokeRect(padLeft, padTop, plotW, plotH);

    ctx.save();
    ctx.translate(padLeft - 120, padTop + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 44px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Expression log2(TPM + 0.001)", 0, 0);
    ctx.restore();

    // 6. Cohort Columns
    const showSolid = showSolidNormal;
    const col1X = showSolid ? padLeft + plotW * 0.22 : padLeft + plotW * 0.28;
    const col2X = showSolid ? padLeft + plotW * 0.55 : padLeft + plotW * 0.72;
    const col3X = padLeft + plotW * 0.85;

    // Draw Jitter Points (Crisp, High Contrast)
    points.forEach((p: any, pIdx: number) => {
      const isTumor = p.cohortName.includes("Tumor");
      const isGtex = p.cohortName.includes("GTEx");
      const isSolid = p.cohortName.includes("Solid");
      if (isSolid && !showSolid) return;

      const baseX = isGtex ? col1X : (isTumor ? col2X : col3X);
      const pseudoRand = (((pIdx * 9301 + 49297) % 233280) / 233280) - 0.5;
      const jitter = pseudoRand * (isSolid ? 70 : 160);
      const px = baseX + jitter;
      const py = mapY(p.y);

      ctx.beginPath();
      ctx.arc(px, py, 12, 0, Math.PI * 2);
      ctx.fillStyle = isGtex ? "#3b82f6" : (isTumor ? "#f43f5e" : "#fbbf24");
      ctx.globalAlpha = 0.65;
      ctx.fill();
      ctx.globalAlpha = 1.0;
      ctx.strokeStyle = isLight ? "rgba(15,23,42,0.3)" : "rgba(255,255,255,0.4)";
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // Draw Boxplot Whiskers & Median Bars
    boxStats.forEach((b: any) => {
      const isTumor = b.cohortName?.includes("Tumor");
      const isGtex = b.cohortName?.includes("GTEx");
      const isSolid = b.cohortName?.includes("Solid");
      if (isSolid && !showSolid) return;

      const cx = isGtex ? col1X : (isTumor ? col2X : col3X);
      const boxW = isSolid ? 130 : 220;

      const q1Y = mapY(b.q1);
      const q3Y = mapY(b.q3);
      const medY = mapY(b.median);
      const minYpos = mapY(b.minW);
      const maxYpos = mapY(b.maxW);

      // Whisker vertical line
      ctx.strokeStyle = isLight ? "#0f172a" : "#f8fafc";
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(cx, minYpos);
      ctx.lineTo(cx, q1Y);
      ctx.moveTo(cx, q3Y);
      ctx.lineTo(cx, maxYpos);
      ctx.stroke();

      // Whisker caps
      ctx.beginPath();
      ctx.moveTo(cx - 40, minYpos);
      ctx.lineTo(cx + 40, minYpos);
      ctx.moveTo(cx - 40, maxYpos);
      ctx.lineTo(cx + 40, maxYpos);
      ctx.stroke();

      // Box Rect
      ctx.fillStyle = isLight ? "rgba(255, 255, 255, 0.92)" : "rgba(15, 23, 42, 0.92)";
      ctx.fillRect(cx - boxW / 2, q3Y, boxW, q1Y - q3Y);
      ctx.strokeStyle = isLight ? "#0f172a" : "#f8fafc";
      ctx.lineWidth = 4.5;
      ctx.strokeRect(cx - boxW / 2, q3Y, boxW, q1Y - q3Y);

      // Median Line (Bold Contrast)
      ctx.strokeStyle = isGtex ? "#1d4ed8" : (isTumor ? "#be123c" : "#b45309");
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(cx - boxW / 2, medY);
      ctx.lineTo(cx + boxW / 2, medY);
      ctx.stroke();

      // Median label badge
      const medText = `Med: ${b.median.toFixed(2)}`;
      ctx.font = "bold 30px monospace";
      const textW = ctx.measureText(medText).width;
      ctx.fillStyle = isLight ? "rgba(248, 250, 252, 0.94)" : "rgba(2, 6, 23, 0.94)";
      ctx.fillRect(cx + boxW / 2 + 12, medY - 22, textW + 18, 42);
      ctx.strokeStyle = isLight ? "#94a3b8" : "#475569";
      ctx.lineWidth = 2;
      ctx.strokeRect(cx + boxW / 2 + 12, medY - 22, textW + 18, 42);

      ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
      ctx.textAlign = "left";
      ctx.fillText(medText, cx + boxW / 2 + 20, medY + 8);

      // Diamond Mean Marker (if showMean is active)
      if (showMean && b.mean !== undefined) {
        const meanY = mapY(b.mean);
        const dR = 16;
        ctx.beginPath();
        ctx.moveTo(cx, meanY - dR);
        ctx.lineTo(cx + dR, meanY);
        ctx.lineTo(cx, meanY + dR);
        ctx.lineTo(cx - dR, meanY);
        ctx.closePath();
        ctx.fillStyle = "#fbbf24";
        ctx.fill();
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    });

    // Column X-Axis Labels (Bold Large)
    ctx.fillStyle = "#2563eb";
    ctx.font = "bold 44px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("GTEx Normal Pancreas", col1X, padTop + plotH + 60);
    ctx.fillStyle = isLight ? "#475569" : "#94a3b8";
    ctx.font = "bold 34px monospace";
    ctx.fillText("n = 167 samples", col1X, padTop + plotH + 106);

    ctx.fillStyle = "#dc2626";
    ctx.font = "bold 44px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText("TCGA Primary Tumors", col2X, padTop + plotH + 60);
    ctx.fillStyle = isLight ? "#475569" : "#94a3b8";
    ctx.font = "bold 34px monospace";
    ctx.fillText("n = 178 samples", col2X, padTop + plotH + 106);

    if (showSolid) {
      ctx.fillStyle = "#d97706";
      ctx.font = "bold 38px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillText("Solid Normal", col3X, padTop + plotH + 60);
      ctx.fillStyle = isLight ? "#475569" : "#94a3b8";
      ctx.font = "bold 30px monospace";
      ctx.fillText("n = 4 samples", col3X, padTop + plotH + 106);
    }

    // Top Summary Statistics Card (Placed Outside Plot Area at Header)
    const cardX = padLeft + plotW - 740;
    const cardY = 25;
    const cardW = 740;
    const cardH = 150;

    ctx.fillStyle = isLight ? "rgba(248, 250, 252, 0.98)" : "rgba(11, 19, 41, 0.98)";
    ctx.fillRect(cardX, cardY, cardW, cardH);
    ctx.strokeStyle = isLight ? "#cbd5e1" : "#1e293b";
    ctx.lineWidth = 2.5;
    ctx.strokeRect(cardX, cardY, cardW, cardH);

    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 30px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Differential Expression Summary", cardX + cardW / 2, cardY + 44);

    ctx.font = "bold 26px monospace";
    const delta = (stats.tumorMean - stats.gtexMean).toFixed(2);
    ctx.fillStyle = Number(delta) >= 0 ? (isLight ? "#be123c" : "#f43f5e") : "#2563eb";
    ctx.fillText(`Tumor: ${stats.tumorMean.toFixed(2)} | Normal: ${stats.gtexMean.toFixed(2)}`, cardX + cardW / 2, cardY + 88);
    ctx.fillText(`Difference (log2FC): ${Number(delta) >= 0 ? "+" : ""}${delta}`, cardX + cardW / 2, cardY + 126);

    return offscreen;
  };

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

        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Optional Show Mean Toggle */}
          <label className="flex items-center gap-1 text-[10px] font-mono text-slate-300 bg-slate-950 px-2 py-1 rounded border border-slate-800 cursor-pointer group relative">
            <input
              type="checkbox"
              checked={showMean}
              onChange={(e) => setShowMean(e.target.checked)}
              className="rounded accent-amber-500 bg-slate-900 border-slate-800 cursor-pointer"
            />
            <span>Show Mean</span>
            <HelpCircle className="w-2.5 h-2.5 text-slate-500 hover:text-slate-300 ml-0.5 cursor-help shrink-0" />
            <span className="pointer-events-none absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 bg-slate-950 border border-slate-800 text-slate-300 text-[9px] p-2 rounded shadow-2xl w-56 font-normal leading-normal opacity-0 group-hover:opacity-100 transition-opacity z-50">
              Displays the arithmetic mean as a diamond marker. The boxplot continues to represent the median and interquartile range.
            </span>
          </label>

          {/* Diagnostic Checkbox option for Solid Normal */}
          <label className="flex items-center gap-1 text-[10px] font-mono text-slate-300 bg-slate-950 px-2 py-1 rounded border border-slate-800 cursor-pointer">
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
            onExportPNG={({ theme = "light" } = {}) => {
              const exportCanvas = generateHighResTcgaCanvas(theme, 2400);
              exportCanvasToPNG({
                canvas: exportCanvas,
                filename: `Tumor_vs_Normal_${selectedGeneSymbol || "Target"}.png`,
                theme,
              });
            }}
            onExportSVG={({ theme = "light" } = {}) => {
              const exportCanvas = generateHighResTcgaCanvas(theme, 1200);
              exportCanvasToSVG({
                canvas: exportCanvas,
                filename: `Tumor_vs_Normal_${selectedGeneSymbol || "Target"}.svg`,
                theme,
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
          {/* Main Boxplot / Scatter Plot */}
          <div ref={tcgaChartRef} className="flex-1 w-full h-[260px] min-h-[260px]">
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

                {/* Boxplot Representation (IQR Boxes, Median Lines, Whiskers) */}
                {boxStats.map((b: any) => (
                  <React.Fragment key={`box-${b.cohortName}`}>
                    {/* Whiskers */}
                    <ReferenceLine segment={[{ x: b.x, y: b.minW }, { x: b.x, y: b.q1 }]} stroke={b.color} strokeWidth={1} strokeDasharray="2 2" />
                    <ReferenceLine segment={[{ x: b.x, y: b.q3 }, { x: b.x, y: b.maxW }]} stroke={b.color} strokeWidth={1} strokeDasharray="2 2" />
                    {/* Whisker Caps */}
                    <ReferenceLine segment={[{ x: b.x - 0.1, y: b.minW }, { x: b.x + 0.1, y: b.minW }]} stroke={b.color} strokeWidth={1.5} />
                    <ReferenceLine segment={[{ x: b.x - 0.1, y: b.maxW }, { x: b.x + 0.1, y: b.maxW }]} stroke={b.color} strokeWidth={1.5} />
                    {/* IQR Box */}
                    <ReferenceArea x1={b.x - 0.22} x2={b.x + 0.22} y1={b.q1} y2={b.q3} fill="rgba(255,255,255,0.04)" stroke={b.color} strokeWidth={1.2} />
                    {/* Median Line */}
                    <ReferenceLine segment={[{ x: b.x - 0.22, y: b.median }, { x: b.x + 0.22, y: b.median }]} stroke={b.color} strokeWidth={2.5} />
                  </React.Fragment>
                ))}

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

                {/* Optional Arithmetic Mean Diamond Markers (When Show Mean is ON) */}
                {showMean && (
                  <Scatter
                    name="Mean Expression"
                    data={meanPoints}
                    shape={<MeanDiamondShape />}
                    z={100}
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
