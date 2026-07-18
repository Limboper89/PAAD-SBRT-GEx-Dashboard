"use client";

import React, { useRef, useEffect, useState, useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Cell } from "recharts";
import SearchableGeneSelect from "./SearchableGeneSelect";
import { Layers, Info } from "lucide-react";

interface ExpressionMap {
  [gene: string]: number;
}

interface SpatialSpot {
  id: string;
  x: number;
  y: number;
  cell_type: string;
  expressions: ExpressionMap;
}

interface SnCell {
  id: string;
  umap1: number;
  umap2: number;
  cell_type: string;
  expressions: ExpressionMap;
}

interface TmeViewProps {
  activeDataset: "PDAC_Spatial" | "PDAC_snRNAseq";
  spatialData: { spots: SpatialSpot[] } | null;
  snData: { cells: SnCell[] } | null;
  selectedGene: string | null;
  allGenes: string[];
}

const CELL_TYPE_COLORS: { [key: string]: string } = {
  "Malignant Ductal": "#f43f5e", // Rose 500
  "CAFs": "#3b82f6", // Blue 500
  "T-cells": "#10b981", // Emerald 500
  "Macrophages": "#eab308", // Yellow 500
  "Normal Ductal": "#94a3b8", // Slate 400
};

// Shorten cell type helper to prevent label cropping in small viewports
const shortenCellType = (type: string): string => {
  if (type.includes("Malignant") || type.includes("Ductal Ductal")) {
    return "Malignant Ductal";
  }
  if (type.includes("Fibroblasts") || type.includes("CAF")) {
    return "CAFs";
  }
  if (type.includes("Normal Ductal")) {
    return "Normal Ductal";
  }
  if (type.includes("T-cells")) {
    return "T-cells";
  }
  if (type.includes("Macrophages")) {
    return "Macrophages";
  }
  return type;
};

export default function TmeView({
  activeDataset,
  spatialData,
  snData,
  selectedGene,
  allGenes,
}: TmeViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 500, height: 400 });
  const [colorMode, setColorMode] = useState<"cluster" | "expression">("cluster");
  const [activeVisualizationGene, setActiveVisualizationGene] = useState<string>("NFE2L2");
  const [hoveredCell, setHoveredCell] = useState<{
    id: string;
    type: string;
    val?: number;
    cx: number;
    cy: number;
  } | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Sync visualization gene with active selected gene from Volcano plot
  useEffect(() => {
    if (selectedGene && allGenes.includes(selectedGene)) {
      setActiveVisualizationGene(selectedGene);
      setColorMode("expression"); // Auto switch to expression view when gene is clicked
    }
  }, [selectedGene, allGenes]);

  // Handle Resize
  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({
          width: Math.max(width - 24, 250), // Responsive padding
          height: Math.max(height - 80, 250),
        });
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Compute points list based on active dataset
  const points = useMemo(() => {
    if (activeDataset === "PDAC_Spatial") {
      if (!spatialData) return [];
      return spatialData.spots.map((spot) => ({
        id: spot.id,
        x: spot.x,
        y: spot.y,
        cell_type: shortenCellType(spot.cell_type),
        expression: spot.expressions[activeVisualizationGene] || 0.0,
      }));
    } else {
      if (!snData) return [];
      return snData.cells.map((cell) => ({
        id: cell.id,
        x: cell.umap1,
        y: cell.umap2,
        cell_type: shortenCellType(cell.cell_type),
        expression: cell.expressions[activeVisualizationGene] || 0.0,
      }));
    }
  }, [activeDataset, spatialData, snData, activeVisualizationGene]);

  // Compute dataset bounds
  const bounds = useMemo(() => {
    if (points.length === 0) return { minX: 0, maxX: 10, minY: 0, maxY: 10, maxExpr: 10 };
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let maxExpr = -Infinity;

    points.forEach((p) => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
      if (p.expression > maxExpr) maxExpr = p.expression;
    });

    return {
      minX: minX - 10,
      maxX: maxX + 10,
      minY: minY - 10,
      maxY: maxY + 10,
      maxExpr: maxExpr > 0 ? maxExpr : 10,
    };
  }, [points]);

  // Translate coordinates to canvas pixel space
  const getPixelCoords = (x: number, y: number) => {
    const pad = 25;
    const scaleX = (dimensions.width - pad * 2) / (bounds.maxX - bounds.minX);
    const scaleY = (dimensions.height - pad * 2) / (bounds.maxY - bounds.minY);

    const px = pad + (x - bounds.minX) * scaleX;
    // Canvas y coordinate starts from top left, invert it
    const py = dimensions.height - pad - (y - bounds.minY) * scaleY;

    return { x: px, y: py };
  };

  // Compute cell type proportions in the TME
  const proportionsData = useMemo(() => {
    if (points.length === 0) return [];
    const counts: { [key: string]: number } = {};
    points.forEach((p) => {
      counts[p.cell_type] = (counts[p.cell_type] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([name, count]) => ({
        name,
        count,
        percentage: Number(((count / points.length) * 100).toFixed(1)),
        color: CELL_TYPE_COLORS[name] || "#ffffff",
      }))
      .sort((a, b) => b.count - a.count);
  }, [points]);

  // Color generator for continuous gene expression values (blue -> teal -> orange -> red)
  const getExpressionColor = (val: number, maxVal: number) => {
    const ratio = Math.min(val / maxVal, 1);
    if (ratio < 0.25) {
      const r = Math.round(30 + (20 - 30) * (ratio / 0.25));
      const g = Math.round(41 + (184 - 41) * (ratio / 0.25));
      const b = Math.round(59 + (166 - 59) * (ratio / 0.25));
      return `rgb(${r}, ${g}, ${b})`;
    } else if (ratio < 0.6) {
      const subRatio = (ratio - 0.25) / 0.35;
      const r = Math.round(20 + (245 - 20) * subRatio);
      const g = Math.round(184 + (158 - 184) * subRatio);
      const b = Math.round(166 + (11 - 166) * subRatio);
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      const subRatio = (ratio - 0.6) / 0.4;
      const r = Math.round(245 + (239 - 245) * subRatio);
      const g = Math.round(158 + (68 - 158) * subRatio);
      const b = Math.round(11 + (68 - 11) * subRatio);
      return `rgb(${r}, ${g}, ${b})`;
    }
  };

  // Draw plot onto Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    // Draw grid background
    ctx.strokeStyle = "rgba(148,163,184,0.02)";
    ctx.lineWidth = 1;
    for (let i = 0; i < dimensions.width; i += 30) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, dimensions.height);
      ctx.stroke();
    }
    for (let j = 0; j < dimensions.height; j += 30) {
      ctx.beginPath();
      ctx.moveTo(0, j);
      ctx.lineTo(dimensions.width, j);
      ctx.stroke();
    }

    // Draw bounds border
    ctx.strokeStyle = "rgba(148, 163, 184, 0.12)";
    ctx.lineWidth = 1;
    ctx.strokeRect(5, 5, dimensions.width - 10, dimensions.height - 10);

    // Draw cells
    points.forEach((p) => {
      const { x: px, y: py } = getPixelCoords(p.x, p.y);
      let color = CELL_TYPE_COLORS[p.cell_type] || "#ffffff";
      let radius = activeDataset === "PDAC_Spatial" ? 7.0 : 4.5;

      if (colorMode === "expression") {
        color = getExpressionColor(p.expression, bounds.maxExpr);
      }

      ctx.beginPath();
      ctx.arc(px, py, radius, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      ctx.strokeStyle = colorMode === "expression" ? "rgba(255,255,255,0.04)" : "rgba(0, 0, 0, 0.3)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
    });

    // Draw hovered cell highlight
    if (hoveredCell) {
      const p = points.find((pt) => pt.id === hoveredCell.id);
      if (p) {
        const { x: px, y: py } = getPixelCoords(p.x, p.y);
        ctx.beginPath();
        ctx.arc(px, py, activeDataset === "PDAC_Spatial" ? 11 : 8, 0, 2 * Math.PI);
        ctx.strokeStyle = "#14b8a6";
        ctx.lineWidth = 2.0;
        ctx.stroke();
      }
    }
  }, [dimensions, bounds, points, colorMode, hoveredCell, activeDataset]);

  // Hover detection
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let closest: typeof points[0] | null = null;
    let minDist = Infinity;
    const threshold = activeDataset === "PDAC_Spatial" ? 10 : 8;

    points.forEach((p) => {
      const scr = getPixelCoords(p.x, p.y);
      const dx = scr.x - x;
      const dy = scr.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < threshold) {
        if (dist < minDist) {
          minDist = dist;
          closest = p;
        }
      }
    });

    if (closest) {
      const cell: typeof points[0] = closest;
      setHoveredCell({
        id: cell.id,
        type: cell.cell_type,
        val: cell.expression,
        cx: cell.x,
        cy: cell.y,
      });
      setTooltipPos({ x, y });
    } else {
      setHoveredCell(null);
    }
  };

  const handleMouseLeave = () => {
    setHoveredCell(null);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col h-full w-full">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-4">
        <div>
          <h3 className="text-slate-200 font-semibold text-base flex items-center gap-2">
            <Layers className="w-4 h-4 text-teal-400" />
            {activeDataset === "PDAC_Spatial"
              ? "Spatial Transcriptomics Tumor Microenvironment"
              : "Single-Nucleus RNA-seq UMAP Embedding"}
          </h3>
          <p className="text-[11px] text-slate-400">
            {activeDataset === "PDAC_Spatial"
              ? "Spatial mapping of tissue morphology and cellular niches (10x Visium)"
              : "Dimensionally reduced clustering of single-cell expression states"}
          </p>
        </div>

        {/* View Toggle Controller */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 self-start md:self-auto">
          <button
            onClick={() => setColorMode("cluster")}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
              colorMode === "cluster" ? "bg-teal-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Cell Type
          </button>
          <button
            onClick={() => setColorMode("expression")}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
              colorMode === "expression" ? "bg-teal-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Gene Expression
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 items-stretch">
        {/* Controls and Stats Panel */}
        <div className="flex flex-col gap-4 bg-slate-950/40 p-4 border border-slate-800/80 rounded-xl">
          {/* Gene Select Dropdown (Visible only in expression mode) */}
          {colorMode === "expression" && (
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Visualization Target Gene
              </label>
              <SearchableGeneSelect
                options={allGenes}
                value={activeVisualizationGene}
                onChange={(val) => {
                  if (val) setActiveVisualizationGene(val);
                }}
                placeholder="Select marker..."
              />
            </div>
          )}

          {/* Color Mode Info / Legend */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
              {colorMode === "cluster" ? "Cell Type Legend" : "Expression Scale"}
            </label>
            {colorMode === "cluster" ? (
              <div className="flex flex-col gap-1.5 max-h-[140px] overflow-y-auto pr-1">
                {Object.entries(CELL_TYPE_COLORS).map(([name, color]) => (
                  <div key={name} className="flex items-center gap-2.5 text-xs text-slate-300">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }}></span>
                    <span className="truncate">{name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <div className="h-2.5 w-full rounded-md bg-gradient-to-r from-slate-800 via-teal-500 to-red-500 border border-slate-700/60"></div>
                <div className="flex justify-between text-[9px] text-slate-400 font-mono">
                  <span>Low (0.0)</span>
                  <span>Mid</span>
                  <span>High ({bounds.maxExpr.toFixed(1)})</span>
                </div>
              </div>
            )}
          </div>

          {/* Proportions Chart with shortened labels */}
          <div className="flex-1 flex flex-col justify-end mt-2 border-t border-slate-800/60 pt-3">
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
              TME Cell Composition (%)
            </label>
            <div className="w-full h-[120px] pr-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={proportionsData}
                  margin={{ top: 0, right: 0, bottom: 5, left: -25 }}
                >
                  <XAxis type="number" stroke="#64748b" tickLine={false} axisLine={false} tick={{ fontSize: 9 }} />
                  <YAxis type="category" dataKey="name" stroke="#64748b" tickLine={false} axisLine={false} tick={{ fontSize: 9 }} width={80} />
                  <RechartsTooltip
                    cursor={{ fill: "rgba(255,255,255,0.02)" }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-slate-950 border border-slate-700 p-2 rounded text-[10px] shadow-xl">
                            <span className="font-bold text-slate-200">{data.name}:</span> {data.percentage}%
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="percentage" radius={[0, 2, 2, 0]}>
                    {proportionsData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Canvas Embedding Column */}
        <div ref={containerRef} className="lg:col-span-2 relative border border-slate-800/80 bg-slate-950/60 rounded-xl overflow-hidden min-h-[300px]">
          <canvas
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className="w-full h-full cursor-crosshair"
            style={{ width: "100%", height: "100%" }}
          />

          {/* Interactive Cell Hover Tooltip */}
          {hoveredCell && (
            <div
              className="absolute bg-slate-950 border border-slate-700 text-slate-100 rounded-lg p-2.5 shadow-2xl text-[10px] z-50 pointer-events-none"
              style={{
                left: `${tooltipPos.x + 15}px`,
                top: `${tooltipPos.y + 15}px`,
                transform: "translate(0, -50%)",
              }}
            >
              <div className="font-bold text-teal-400 text-[11px] mb-1">
                {activeDataset === "PDAC_Spatial" ? `Spot ID: ${hoveredCell.id}` : `Cell ID: ${hoveredCell.id}`}
              </div>
              <div className="mb-0.5">
                <span className="text-slate-400">Cell Type:</span> {hoveredCell.type}
              </div>
              {colorMode === "expression" && (
                <div className="mb-0.5">
                  <span className="text-slate-400">{activeVisualizationGene} expression:</span>{" "}
                  <span className="font-bold text-amber-400">{hoveredCell.val?.toFixed(2)}</span>
                </div>
              )}
              <div className="text-[9px] text-slate-500 font-mono">
                Coordinates: ({hoveredCell.cx.toFixed(1)}, {hoveredCell.cy.toFixed(1)})
              </div>
            </div>
          )}

          {/* Scaffold / Mock Data Notice Indicator */}
          <div className="absolute bottom-3 right-3 flex items-center gap-1 text-[9px] text-slate-400 bg-slate-950/90 border border-slate-800 rounded px-2 py-1 backdrop-blur-sm shadow-md">
            <Info className="w-3 h-3 text-teal-400" />
            <span>Scaffolded Multi-Study Model</span>
          </div>
        </div>
      </div>
    </div>
  );
}
