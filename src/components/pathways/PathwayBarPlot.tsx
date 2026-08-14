"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts";
import { PathwayEnrichmentResult } from "@/types/pathway";

interface PathwayBarPlotProps {
  results: PathwayEnrichmentResult[];
  onSelectPathway: (pathway: PathwayEnrichmentResult) => void;
  analysisMode: "ORA" | "GSEA";
}

function CustomBarTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { rawResult: PathwayEnrichmentResult } }> }) {
  if (active && payload && payload.length && payload[0].payload) {
    const r: PathwayEnrichmentResult = payload[0].payload.rawResult;
    const isGsea = r.analysisMode === "GSEA";
    return (
      <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl shadow-2xl text-xs font-mono max-w-xs space-y-1">
        <p className="font-bold text-slate-100">{r.pathwayName}</p>
        <div className="text-xxs text-slate-400 space-y-0.5">
          <div>Database: <span className="text-teal-400 font-bold">{r.database}</span></div>
          <div>
            {isGsea ? "NES:" : "Fold Enrichment:"}{" "}
            <span className="text-amber-400 font-bold">
              {isGsea ? r.nes?.toFixed(3) : (r.foldEnrichment ? r.foldEnrichment.toFixed(2) + "x" : "N/A")}
            </span>
          </div>
          <div>BH FDR: <span className="text-teal-400 font-bold">{r.adjPValue.toExponential(2)}</span></div>
        </div>
      </div>
    );
  }
  return null;
}

export default function PathwayBarPlot({
  results,
  onSelectPathway,
  analysisMode
}: PathwayBarPlotProps) {
  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[350px] bg-slate-900/40 border border-slate-800 rounded-2xl p-6 text-center text-slate-500 font-mono text-xs">
        <p>No enriched pathways available for bar plot display.</p>
      </div>
    );
  }

  const isGsea = analysisMode === "GSEA";

  const displayResults = [...results]
    .sort((a, b) => {
      const valA = isGsea ? Math.abs(a.nes || 0) : (a.foldEnrichment || 0);
      const valB = isGsea ? Math.abs(b.nes || 0) : (b.foldEnrichment || 0);
      return valB - valA;
    })
    .slice(0, 15);

  const chartData = displayResults.map((r, idx) => {
    const rawMetric = isGsea ? (r.nes ?? 0) : (r.foldEnrichment ?? 1.0);
    const metric = Number.isFinite(rawMetric) ? rawMetric : 1.0;

    return {
      id: r.pathwayId || `bar-${idx}`,
      name: r.pathwayName.length > 34 ? r.pathwayName.slice(0, 32) + "..." : r.pathwayName,
      fullName: r.pathwayName,
      metric,
      fdr: Number.isFinite(r.adjPValue) ? r.adjPValue : 1.0,
      direction: r.direction,
      rawResult: r
    };
  });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col h-full min-h-[500px] shadow-xl">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-100">Enrichment Bar Plot</h3>
          <p className="text-xxs text-slate-400 font-mono mt-0.5">
            Ranked by {isGsea ? "Normalized Enrichment Score (NES)" : "Fold Enrichment"} &bull; Top {displayResults.length} Pathways
          </p>
        </div>
      </div>

      <div className="w-full h-[440px] min-h-[440px] relative">
        <ResponsiveContainer width="100%" height={440}>
          <BarChart
            layout="vertical"
            data={chartData}
            margin={{ top: 15, right: 35, bottom: 45, left: 190 }}
          >
            <XAxis
              type="number"
              stroke="#64748b"
              tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "monospace" }}
              label={{
                value: isGsea ? "Normalized Enrichment Score (NES)" : "Fold Enrichment",
                position: "insideBottom",
                offset: -14,
                fill: "#94a3b8",
                fontSize: 11,
                fontWeight: "bold",
                fontFamily: "monospace"
              }}
            />
            <YAxis
              type="category"
              dataKey="name"
              stroke="#64748b"
              tick={{ fill: "#cbd5e1", fontSize: 11 }}
              interval={0}
              width={180}
              label={{
                value: "Enriched Pathways",
                angle: -90,
                position: "insideLeft",
                offset: 5,
                fill: "#94a3b8",
                fontSize: 11,
                fontWeight: "bold",
                fontFamily: "monospace"
              }}
            />
            <Tooltip content={<CustomBarTooltip />} />
            <Bar
              dataKey="metric"
              radius={[0, 4, 4, 0]}
              onClick={(entry) => {
                const item = entry as { rawResult?: PathwayEnrichmentResult };
                if (item && item.rawResult) {
                  onSelectPathway(item.rawResult);
                }
              }}
              className="cursor-pointer"
            >
              {chartData.map((entry) => {
                let color = "#14b8a6";
                if (entry.direction === "Upregulated") color = "#ef4444";
                else if (entry.direction === "Downregulated") color = "#3b82f6";
                return <Cell key={`bar-${entry.id}`} fill={color} fillOpacity={0.8} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
