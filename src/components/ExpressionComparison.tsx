"use client";

import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import SearchableGeneSelect from "./SearchableGeneSelect";
import { X, Info } from "lucide-react";

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
}

export default function ExpressionComparison({
  selectedGenes,
  onAddGene,
  onRemoveGene,
  allGenes,
  expressionData,
  degData,
}: ExpressionComparisonProps) {
  const comparisonData = useMemo(() => {
    if (!expressionData || selectedGenes.length === 0) return [];

    const { conditions, expressions } = expressionData;

    return selectedGenes
      .map((geneName) => {
        const exprVals = expressions[geneName];
        if (!exprVals || exprVals.length === 0) return null;

        // Group expression values by condition
        const preVals = exprVals.filter((_, idx) => conditions[idx] === "Pre");
        const postVals = exprVals.filter((_, idx) => conditions[idx] === "Post");

        // Calculate means
        const meanPre = preVals.length > 0 ? preVals.reduce((a, b) => a + b, 0) / preVals.length : 0;
        const meanPost = postVals.length > 0 ? postVals.reduce((a, b) => a + b, 0) / postVals.length : 0;

        // Find log2FC from degData
        const degGene = degData.find((d) => d.gene_name === geneName);
        const log2FC = degGene ? degGene.log2FC : meanPost - meanPre;

        return {
          gene_name: geneName,
          "Pre-SBRT": Number(meanPre.toFixed(3)),
          "Post-SBRT": Number(meanPost.toFixed(3)),
          log2FC,
        };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);
  }, [selectedGenes, expressionData, degData]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const preVal = payload[0].value;
      const postVal = payload[1].value;
      const log2FCVal = payload[0].payload.log2FC;

      return (
        <div className="bg-slate-950 border border-slate-700 p-2.5 rounded-lg text-xs shadow-xl">
          <div className="font-bold text-teal-400 text-sm mb-1">{label}</div>
          <div className="flex justify-between gap-6 mb-1">
            <span className="text-slate-400">Pre-SBRT (Mean):</span>
            <span className="font-mono font-semibold text-slate-200">{preVal.toFixed(3)}</span>
          </div>
          <div className="flex justify-between gap-6 mb-1.5">
            <span className="text-slate-400">Post-SBRT (Mean):</span>
            <span className="font-mono font-semibold text-slate-200">{postVal.toFixed(3)}</span>
          </div>
          <div className="border-t border-slate-800 pt-1 flex justify-between gap-6">
            <span className="text-slate-400">log2 Fold Change:</span>
            <span className={`font-mono font-bold ${log2FCVal > 0 ? "text-red-400" : "text-blue-400"}`}>
              {log2FCVal > 0 ? "+" : ""}{log2FCVal.toFixed(3)}
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col h-full w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <div>
          <h3 className="text-slate-200 font-semibold text-lg">Pre-SBRT vs. Post-SBRT Comparison</h3>
          <p className="text-xs text-slate-400">
            Actual mean expression levels (log2-normalized counts) before and after SBRT
          </p>
        </div>

        {/* Dynamic Search Box to Add Genes */}
        <div className="w-full sm:w-48">
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
      </div>

      {selectedGenes.length === 0 || !expressionData ? (
        <div className="flex-1 border border-dashed border-slate-800 rounded-lg flex items-center justify-center h-48 text-slate-500 text-xs">
          Select or add genes in the control above to compare Pre vs Post treatment response.
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-4">
          <div className="flex-1 w-full h-[250px] min-h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparisonData} margin={{ top: 10, right: 10, bottom: 10, left: -10 }}>
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
                <Tooltip content={<CustomTooltip />} />
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
