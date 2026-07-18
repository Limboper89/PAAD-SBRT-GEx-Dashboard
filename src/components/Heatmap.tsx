"use client";

import React, { useRef, useEffect, useState, useMemo } from "react";
import { Search, Plus, X, Info } from "lucide-react";
import SearchableGeneSelect from "./SearchableGeneSelect";

interface ExpressionData {
  samples: string[];
  conditions: string[];
  expressions: { [gene: string]: number[] };
}

interface HeatmapProps {
  expressionData: ExpressionData | null;
  selectedGenes: string[];
  activeGene: string | null;
  onSelectGene: (geneName: string) => void;
  onAddGene: (geneName: string) => void;
  onRemoveGene: (geneName: string) => void;
  allGenes: string[];
}

export default function Heatmap({
  expressionData,
  selectedGenes,
  activeGene,
  onSelectGene,
  onAddGene,
  onRemoveGene,
  allGenes,
}: HeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 250 });
  const [hoveredCell, setHoveredCell] = useState<{
    gene: string;
    sample: string;
    condition: string;
    value: number;
    zScore: number;
    x: number;
    y: number;
  } | null>(null);

  // Auto-resize canvas
  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width } = entry.contentRect;
        setDimensions({
          width: Math.max(width - 32, 300),
          height: selectedGenes.length * 24 + 60, // 24px per row + 60px header/footer padding
        });
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [selectedGenes]);

  // Compute Z-Scores and sort columns (Pre first, then Post)
  const heatmapData = useMemo(() => {
    if (!expressionData || selectedGenes.length === 0) return null;

    const { samples, conditions, expressions } = expressionData;
    const numSamples = samples.length;

    // Create indices sorted by condition: Pre first, then Post
    const sampleIndices = Array.from({ length: numSamples }, (_, i) => i).sort(
      (a, b) => conditions[a].localeCompare(conditions[b]) // Pre comes before Post alphabetically
    );

    const sortedSamples = sampleIndices.map((i) => samples[i]);
    const sortedConditions = sampleIndices.map((i) => conditions[i]);
    const preCount = sortedConditions.filter((c) => c === "Pre").length;

    // Process each gene: calculate mean, sd, and z-scores
    const geneRows = selectedGenes
      .map((gene) => {
        const vals = expressions[gene];
        if (!vals || vals.length === 0) return null;

        const mean = vals.reduce((a, b) => a + b, 0) / numSamples;
        const variance = vals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / numSamples;
        const sd = Math.sqrt(variance) || 1e-5;

        const zScores = vals.map((v) => (v - mean) / sd);

        // Sort values & zScores to match Pre-SBRT vs Post-SBRT columns
        const sortedVals = sampleIndices.map((i) => vals[i]);
        const sortedZ = sampleIndices.map((i) => zScores[i]);

        return {
          gene,
          values: sortedVals,
          zScores: sortedZ,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    return {
      samples: sortedSamples,
      conditions: sortedConditions,
      preCount,
      rows: geneRows,
    };
  }, [expressionData, selectedGenes]);

  const rowHeight = 24;
  const labelWidth = 90;
  const headerHeight = 35;

  // Draw Heatmap Matrix on Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !heatmapData) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    const matrixWidth = dimensions.width - labelWidth - 20; // 20px padding right
    const cellWidth = matrixWidth / heatmapData.samples.length;

    // 1. Draw Columns Banners (Pre vs Post)
    const dividerX = labelWidth + heatmapData.preCount * cellWidth;

    // Pre-SBRT Header
    ctx.fillStyle = "rgba(100, 116, 139, 0.15)";
    ctx.fillRect(labelWidth, 5, heatmapData.preCount * cellWidth - 2, 20);
    ctx.fillStyle = "#94a3b8"; // Slate-400
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      `Pre-SBRT (N=${heatmapData.preCount})`,
      labelWidth + (heatmapData.preCount * cellWidth) / 2,
      18
    );

    // Post-SBRT Header
    ctx.fillStyle = "rgba(20, 184, 166, 0.1)";
    ctx.fillRect(dividerX + 1, 5, matrixWidth - heatmapData.preCount * cellWidth - 2, 20);
    ctx.fillStyle = "#14b8a6"; // Teal-500
    ctx.fillText(
      `Post-SBRT (N=${heatmapData.samples.length - heatmapData.preCount})`,
      dividerX + (matrixWidth - heatmapData.preCount * cellWidth) / 2,
      18
    );

    // 2. Draw Rows & Cells
    heatmapData.rows.forEach((row, rIdx) => {
      const y = headerHeight + rIdx * rowHeight;

      // Draw Row Label (Gene Symbol)
      const isActive = row.gene === activeGene;
      ctx.fillStyle = isActive ? "#f59e0b" : "#cbd5e1"; // Amber if active, slate-300 otherwise
      ctx.font = isActive ? "bold 11px sans-serif" : "11px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(row.gene, 10, y + 15);

      // Draw horizontal hover/selection row background
      if (isActive) {
        ctx.strokeStyle = "rgba(245, 158, 11, 0.35)";
        ctx.lineWidth = 1;
        ctx.strokeRect(2, y, dimensions.width - 4, rowHeight);
      }

      // Draw Heatmap Cells
      row.zScores.forEach((z, cIdx) => {
        const x = labelWidth + cIdx * cellWidth;

        // Color mapper: Z-score from blue (-2.0) to white (0.0) to red (+2.0)
        let color = "";
        const maxZ = 2.0;
        const normalized = Math.min(Math.max(z / maxZ, -1), 1); // Clamp to [-1, 1]

        if (normalized > 0) {
          // White to Red
          const r = 255;
          const g = Math.round(255 - normalized * 187); // 255 -> 68 (Tailwind red-500)
          const b = Math.round(255 - normalized * 187); // 255 -> 68
          color = `rgb(${r}, ${g}, ${b})`;
        } else {
          // White to Blue
          const abs = Math.abs(normalized);
          const r = Math.round(255 - abs * 196); // 255 -> 59 (Tailwind blue-500)
          const g = Math.round(255 - abs * 125); // 255 -> 130
          const b = 255;
          color = `rgb(${r}, ${g}, ${b})`;
        }

        ctx.fillStyle = color;
        // Keep a tiny gap between cells
        ctx.fillRect(x, y + 2, cellWidth - 0.5, rowHeight - 2);
      });
    });

    // 3. Vertical Divider Line
    ctx.strokeStyle = "#0f172a"; // Slate-950 background color
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(dividerX, headerHeight);
    ctx.lineTo(dividerX, headerHeight + heatmapData.rows.length * rowHeight);
    ctx.stroke();

  }, [dimensions, heatmapData, activeGene]);

  // Handle Cell Hover Detection
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !heatmapData) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (x < labelWidth || y < headerHeight) {
      setHoveredCell(null);
      return;
    }

    const matrixWidth = dimensions.width - labelWidth - 20;
    const cellWidth = matrixWidth / heatmapData.samples.length;

    const cIdx = Math.floor((x - labelWidth) / cellWidth);
    const rIdx = Math.floor((y - headerHeight) / rowHeight);

    if (
      cIdx >= 0 &&
      cIdx < heatmapData.samples.length &&
      rIdx >= 0 &&
      rIdx < heatmapData.rows.length
    ) {
      const row = heatmapData.rows[rIdx];
      const sample = heatmapData.samples[cIdx];
      const condition = heatmapData.conditions[cIdx];
      const value = row.values[cIdx];
      const zScore = row.zScores[cIdx];

      setHoveredCell({
        gene: row.gene,
        sample,
        condition,
        value,
        zScore,
        x,
        y,
      });
    } else {
      setHoveredCell(null);
    }
  };

  // Click on a row selects the gene
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !heatmapData) return;

    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;

    const rIdx = Math.floor((y - headerHeight) / rowHeight);
    if (rIdx >= 0 && rIdx < heatmapData.rows.length) {
      onSelectGene(heatmapData.rows[rIdx].gene);
    }
  };

  const handleMouseLeave = () => {
    setHoveredCell(null);
  };

  return (
    <div ref={containerRef} className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col h-full w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <div>
          <h3 className="text-slate-200 font-semibold text-lg flex items-center gap-2">
            Gene Expression Heatmap
            <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded font-mono font-normal">
              Z-score matrix
            </span>
          </h3>
          <p className="text-xs text-slate-400">
            Row-normalized expressions across Pre vs. Post treatment samples
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

      {/* Main Heatmap Area */}
      {selectedGenes.length === 0 ? (
        <div className="flex-1 border border-dashed border-slate-800 rounded-lg flex items-center justify-center h-48 text-slate-500 text-xs">
          Select or add genes to display them in the Z-score heatmap matrix.
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-4">
          <div className="relative border border-slate-950 bg-slate-950/40 rounded-lg overflow-x-hidden p-2">
            <canvas
              ref={canvasRef}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              onClick={handleCanvasClick}
              className="w-full cursor-pointer"
              style={{ width: "100%", height: `${dimensions.height}px` }}
            />

            {/* Heatmap Cell Tooltip */}
            {hoveredCell && (
              <div
                className="absolute bg-slate-950 border border-slate-700 text-slate-100 rounded-lg p-2.5 shadow-2xl text-[11px] z-50 pointer-events-none"
                style={{
                  left: `${hoveredCell.x + 10}px`,
                  top: `${hoveredCell.y + 10}px`,
                  transform: "translate(0, -50%)",
                }}
              >
                <div className="font-bold text-amber-500 text-xs mb-1">{hoveredCell.gene}</div>
                <div>
                  <span className="text-slate-400">Sample:</span> {hoveredCell.sample} ({hoveredCell.condition})
                </div>
                <div>
                  <span className="text-slate-400">log2 expression:</span> {hoveredCell.value.toFixed(3)}
                </div>
                <div className="border-t border-slate-800 pt-1 mt-1 font-semibold text-teal-400">
                  <span className="text-slate-400">Z-score:</span> {hoveredCell.zScore > 0 ? "+" : ""}
                  {hoveredCell.zScore.toFixed(3)}
                </div>
              </div>
            )}
          </div>

          {/* Selected Genes Chip List with Removal */}
          <div className="flex flex-wrap gap-1.5 max-h-[85px] overflow-y-auto pr-1">
            {selectedGenes.map((gene) => (
              <span
                key={gene}
                className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border transition-colors ${
                  gene === activeGene
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                    : "bg-slate-950 border-slate-800 text-slate-300"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectGene(gene)}
                  className="hover:underline text-left truncate max-w-[80px]"
                >
                  {gene}
                </button>
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

      {/* Heatmap Legend */}
      <div className="border-t border-slate-800/80 pt-3 mt-3 flex justify-between items-center text-[10px] text-slate-400">
        <div className="flex items-center gap-1">
          <Info className="w-3.5 h-3.5 text-slate-500" />
          <span>Click row to select active gene.</span>
        </div>
        <div className="flex items-center gap-2">
          <span>Down</span>
          <div className="h-2 w-20 rounded-sm bg-gradient-to-r from-blue-500 via-white to-red-500 border border-slate-700/60"></div>
          <span>Up</span>
        </div>
      </div>
    </div>
  );
}
