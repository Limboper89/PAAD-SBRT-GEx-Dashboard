"use client";

import React, { useRef, useEffect, useState, useMemo } from "react";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

interface GeneData {
  gene_name: string;
  gene_index?: number;
  log2FC: number;
  p_value: number;
  adj_p_value?: number;
  // TCGA-GTEx optional properties
  id?: string;
  symbol?: string;
  biotype?: string;
  pval?: number;
  qval?: number;
  voom_log2FC?: number;
  voom_qval?: number;
  robust_deg?: boolean;
}

interface VolcanoPlotProps {
  data: GeneData[];
  selectedGene: string | null;
  onSelectGene: (geneName: string) => void;
  isTcgaGtex?: boolean;
}

export default function VolcanoPlot({
  data,
  selectedGene,
  onSelectGene,
  isTcgaGtex = false,
}: VolcanoPlotProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const plotWrapperRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 450 });
  const [hoveredGene, setHoveredGene] = useState<GeneData | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // UI Control states
  const [highlightRobust, setHighlightRobust] = useState<boolean>(true);
  const [fcThreshold, setFcThreshold] = useState<number>(1.0);

  // Zoom & Pan States
  const [zoom, setZoom] = useState<number>(1.0);
  const [offsetX, setOffsetX] = useState<number>(0);
  const [offsetY, setOffsetY] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStart = useRef({ x: 0, y: 0 });

  // Handle Resize
  useEffect(() => {
    if (!plotWrapperRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({
          width: Math.max(width, 300),
          height: Math.max(height, 200),
        });
      }
    });
    resizeObserver.observe(plotWrapperRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Compute plot statistics & coordinates based on study type
  const points = useMemo(() => {
    return data.map((d) => {
      // In TCGA-GTEx, X is Wilcoxon log2FC, Y is -log10(Wilcoxon FDR/q-value)
      const xVal = d.log2FC;
      const yVal = isTcgaGtex
        ? -Math.log10(d.qval || 1)
        : -Math.log10(d.p_value || 1e-10);

      return {
        gene: d,
        x: xVal,
        y: yVal,
      };
    });
  }, [data, isTcgaGtex]);

  const bounds = useMemo(() => {
    if (points.length === 0) return { minX: -5, maxX: 5, minY: 0, maxY: 10 };
    let minX = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    points.forEach((p) => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    });

    const absMaxX = Math.max(Math.abs(minX), Math.abs(maxX), 1);
    return {
      minX: -absMaxX - 0.5,
      maxX: absMaxX + 0.5,
      minY: 0,
      maxY: Math.max(maxY + 0.5, 3),
    };
  }, [points]);

  const padding = { top: 30, right: 30, bottom: 55, left: 55 };

  // Helper to translate data coordinates to screen pixels (including zoom & pan)
  const getScreenCoords = (x: number, y: number) => {
    const scaleX = (dimensions.width - padding.left - padding.right) / (bounds.maxX - bounds.minX);
    const scaleY = (dimensions.height - padding.top - padding.bottom) / (bounds.maxY - bounds.minY);

    const screenX = padding.left + (x - bounds.minX) * scaleX;
    const screenY = dimensions.height - padding.bottom - (y - bounds.minY) * scaleY;

    // Apply zoom and offset around the plot area center
    const centerX = padding.left + (dimensions.width - padding.left - padding.right) / 2;
    const centerY = padding.top + (dimensions.height - padding.top - padding.bottom) / 2;

    const zoomedX = (screenX - centerX) * zoom + centerX + offsetX;
    const zoomedY = (screenY - centerY) * zoom + centerY + offsetY;

    return { x: zoomedX, y: zoomedY };
  };

  // Reset Zoom & Pan
  const handleResetZoom = () => {
    setZoom(1.0);
    setOffsetX(0);
    setOffsetY(0);
  };

  const handleZoomIn = () => {
    setZoom((z) => Math.min(z * 1.3, 20));
  };

  const handleZoomOut = () => {
    setZoom((z) => Math.max(z / 1.3, 0.5));
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

    // 1. Draw Fixed Axes Ticks & Labels
    const xStep = Math.ceil((bounds.maxX - bounds.minX) / 10);
    const startX = Math.floor(bounds.minX);

    // Render X-axis tick labels
    for (let x = startX; x <= bounds.maxX; x += xStep) {
      const screenPt = getScreenCoords(x, 0);
      if (screenPt.x >= padding.left && screenPt.x <= dimensions.width - padding.right) {
        ctx.fillStyle = "#94a3b8"; // Slate 400
        ctx.font = "10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(x.toString(), screenPt.x, dimensions.height - padding.bottom + 18);

        // Tick mark
        ctx.strokeStyle = "#475569";
        ctx.beginPath();
        ctx.moveTo(screenPt.x, dimensions.height - padding.bottom);
        ctx.lineTo(screenPt.x, dimensions.height - padding.bottom + 4);
        ctx.stroke();
      }
    }

    // Render Y-axis tick labels
    const yStep = Math.ceil((bounds.maxY - bounds.minY) / 10) || 1;
    for (let y = 0; y <= bounds.maxY; y += yStep) {
      const screenPt = getScreenCoords(0, y);
      if (screenPt.y >= padding.top && screenPt.y <= dimensions.height - padding.bottom) {
        ctx.fillStyle = "#94a3b8";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(y.toString(), padding.left - 8, screenPt.y + 3);

        // Tick mark
        ctx.strokeStyle = "#475569";
        ctx.beginPath();
        ctx.moveTo(padding.left - 4, screenPt.y);
        ctx.lineTo(padding.left, screenPt.y);
        ctx.stroke();
      }
    }

    // 2. Draw Clipped Content (Points, Grid lines, threshold lines)
    ctx.save();
    ctx.beginPath();
    ctx.rect(
      padding.left,
      padding.top,
      dimensions.width - padding.left - padding.right,
      dimensions.height - padding.top - padding.bottom
    );
    ctx.clip();

    // Draw Grid lines
    ctx.strokeStyle = "rgba(148, 163, 184, 0.03)";
    ctx.lineWidth = 1;

    for (let x = startX; x <= bounds.maxX; x += xStep) {
      const screenPt = getScreenCoords(x, 0);
      ctx.beginPath();
      ctx.moveTo(screenPt.x, padding.top);
      ctx.lineTo(screenPt.x, dimensions.height - padding.bottom);
      ctx.stroke();
    }

    for (let y = 0; y <= bounds.maxY; y += yStep) {
      const screenPt = getScreenCoords(0, y);
      ctx.beginPath();
      ctx.moveTo(padding.left, screenPt.y);
      ctx.lineTo(dimensions.width - padding.right, screenPt.y);
      ctx.stroke();
    }

    // Zero fold change line
    const zeroPt = getScreenCoords(0, 0);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.2)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(zeroPt.x, padding.top);
    ctx.lineTo(zeroPt.x, dimensions.height - padding.bottom);
    ctx.stroke();

    // Significance threshold horizontal line (FDR or P-val < 0.05)
    const thresholdY = -Math.log10(0.05);
    const threshPt = getScreenCoords(0, thresholdY);
    ctx.strokeStyle = "rgba(239, 68, 68, 0.35)"; // Red dashed
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, threshPt.y);
    ctx.lineTo(dimensions.width - padding.right, threshPt.y);
    ctx.stroke();
    ctx.setLineDash([]); // Reset dashed

    ctx.fillStyle = "rgba(239, 68, 68, 0.7)";
    ctx.font = "9px sans-serif";
    ctx.fillText(isTcgaGtex ? "FDR = 0.05" : "p = 0.05", padding.left + 5, threshPt.y - 4);

    // Fold change vertical threshold lines
    if (fcThreshold > 0) {
      const fcRightPt = getScreenCoords(fcThreshold, 0);
      const fcLeftPt = getScreenCoords(-fcThreshold, 0);
      ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      
      ctx.beginPath();
      ctx.moveTo(fcRightPt.x, padding.top);
      ctx.lineTo(fcRightPt.x, dimensions.height - padding.bottom);
      ctx.moveTo(fcLeftPt.x, padding.top);
      ctx.lineTo(fcLeftPt.x, dimensions.height - padding.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Sort points so selected/hovered/highlighted are drawn last (on top)
    const sortedPoints = [...points].sort((a, b) => {
      const aSel = a.gene.gene_name === selectedGene ? 1 : 0;
      const bSel = b.gene.gene_name === selectedGene ? 1 : 0;
      if (aSel !== bSel) return aSel - bSel;

      const aRob = a.gene.robust_deg ? 1 : 0;
      const bRob = b.gene.robust_deg ? 1 : 0;
      return aRob - bRob;
    });

    // Draw all points
    sortedPoints.forEach((p) => {
      const scr = getScreenCoords(p.x, p.y);
      let color = "rgba(148, 163, 184, 0.15)"; // Soft gray default for non-DEGs
      let size = 2.5;

      const isSig = isTcgaGtex 
        ? (p.gene.qval !== undefined && p.gene.qval < 0.05)
        : p.gene.p_value < 0.05;

      const passesFC = Math.abs(p.x) >= fcThreshold;

      if (isSig && passesFC) {
        if (isTcgaGtex) {
          if (highlightRobust && p.gene.robust_deg) {
            color = p.x > 0 ? "rgba(239, 68, 68, 0.8)" : "rgba(59, 130, 246, 0.8)"; // Bright red/blue for robust
            size = 4.0;
          } else {
            color = p.x > 0 ? "rgba(248, 113, 113, 0.35)" : "rgba(96, 165, 250, 0.35)"; // Softer red/blue for Wilcoxon-only or non-robust
            size = 3.2;
          }
        } else {
          color = p.x > 0 ? "rgba(239, 68, 68, 0.65)" : "rgba(59, 130, 246, 0.65)";
          size = 4.0;
        }
      } else if (isSig) {
        // Significant but doesn't pass fold change
        color = "rgba(148, 163, 184, 0.3)";
        size = 2.8;
      }

      ctx.beginPath();
      ctx.arc(scr.x, scr.y, size, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
    });

    // Draw hovered point highlight
    if (hoveredGene) {
      const p = points.find((pt) => pt.gene.gene_name === hoveredGene.gene_name);
      if (p) {
        const scr = getScreenCoords(p.x, p.y);
        ctx.beginPath();
        ctx.arc(scr.x, scr.y, 7, 0, 2 * Math.PI);
        ctx.strokeStyle = "#14b8a6"; // Teal highlight ring
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(scr.x, scr.y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = "#14b8a6";
        ctx.fill();
      }
    }

    // Draw active selected gene highlight & Label
    if (selectedGene) {
      const p = points.find((pt) => pt.gene.gene_name === selectedGene);
      if (p) {
        const scr = getScreenCoords(p.x, p.y);
        ctx.beginPath();
        ctx.arc(scr.x, scr.y, 8, 0, 2 * Math.PI);
        ctx.strokeStyle = "#f59e0b"; // Amber highlight ring
        ctx.lineWidth = 2.0;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(scr.x, scr.y, 5, 0, 2 * Math.PI);
        ctx.fillStyle = "#f59e0b";
        ctx.fill();

        ctx.fillStyle = "#f59e0b";
        ctx.font = "bold 11px sans-serif";
        ctx.fillText(p.gene.gene_name, scr.x + 10, scr.y + 4);
      }
    }

    ctx.restore(); // Restore clipping region

    // 3. Draw Axis Lines
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padding.left, dimensions.height - padding.bottom);
    ctx.lineTo(dimensions.width - padding.right, dimensions.height - padding.bottom);
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, dimensions.height - padding.bottom);
    ctx.stroke();

    // Axis titles
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      isTcgaGtex ? "Wilcoxon log2 Fold Change (Effect Size)" : "log2 Fold Change",
      padding.left + (dimensions.width - padding.left - padding.right) / 2,
      dimensions.height - 12
    );

    ctx.save();
    ctx.translate(15, padding.top + (dimensions.height - padding.top - padding.bottom) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(isTcgaGtex ? "-log10(FDR / q-value)" : "-log10(p-value)", 0, 0);
    ctx.restore();

  }, [dimensions, bounds, points, selectedGene, hoveredGene, zoom, offsetX, offsetY, isTcgaGtex, highlightRobust, fcThreshold]);

  // Handle Dragging / Pan
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (isDragging) {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setOffsetX((prev) => prev + dx);
      setOffsetY((prev) => prev + dy);
      dragStart.current = { x: e.clientX, y: e.clientY };
      setHoveredGene(null);
    } else {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      let closestPt: { gene: GeneData; dist: number } | null = null;
      const threshold = 10;

      points.forEach((p) => {
        const scr = getScreenCoords(p.x, p.y);
        const dx = scr.x - x;
        const dy = scr.y - y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < threshold) {
          if (!closestPt || dist < closestPt.dist) {
            closestPt = { gene: p.gene, dist };
          }
        }
      });

      if (closestPt) {
        const closest: { gene: GeneData } = closestPt;
        setHoveredGene(closest.gene);
        setTooltipPos({ x, y });
      } else {
        setHoveredGene(null);
      }
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.max(0.5, Math.min(z * factor, 20)));
  };

  const handleMouseClick = () => {
    if (hoveredGene && !isDragging) {
      onSelectGene(hoveredGene.gene_name);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl select-none flex flex-col"
    >
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2 mb-2">
        <div>
          <h3 className="text-slate-200 font-semibold text-lg">DEG Volcano Plot</h3>
          <p className="text-[10px] text-slate-400">Scroll to zoom • Drag to pan • Click dot to select</p>
        </div>

        {/* Configurations Toolbar */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-950 p-1.5 rounded-lg border border-slate-800 text-xxs font-mono">
          {isTcgaGtex && (
            <label className="flex items-center gap-1.5 text-slate-300 mr-2 cursor-pointer border-r border-slate-800 pr-2">
              <input
                type="checkbox"
                checked={highlightRobust}
                onChange={(e) => setHighlightRobust(e.target.checked)}
                className="rounded accent-teal-500 bg-slate-900 border-slate-800 cursor-pointer"
              />
              <span>Highlight Robust DEGs</span>
            </label>
          )}

          {/* Configurable effect-size threshold */}
          <div className="flex items-center gap-1 text-slate-300 mr-2 border-r border-slate-800 pr-2">
            <span>|log2FC| &ge;</span>
            <select
              value={fcThreshold}
              onChange={(e) => setFcThreshold(Number(e.target.value))}
              className="bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-xxs focus:outline-none focus:border-teal-500 text-teal-400"
            >
              <option value={0}>0.0 (All)</option>
              <option value={0.5}>0.5</option>
              <option value={1.0}>1.0</option>
              <option value={1.5}>1.5</option>
              <option value={2.0}>2.0</option>
              <option value={3.0}>3.0</option>
            </select>
          </div>

          {/* Zoom Buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleZoomIn}
              className="p-1 text-slate-400 hover:text-teal-400 hover:bg-slate-900 rounded transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleZoomOut}
              className="p-1 text-slate-400 hover:text-teal-400 hover:bg-slate-900 rounded transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleResetZoom}
              className="p-1 text-slate-400 hover:text-teal-400 hover:bg-slate-900 rounded transition-colors"
              title="Reset Zoom"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div ref={plotWrapperRef} className="flex-1 w-full relative min-h-[220px]">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          onClick={handleMouseClick}
          className={`w-full h-full rounded-lg bg-slate-950/20 absolute left-0 top-0 ${
            isDragging ? "cursor-grabbing" : "cursor-grab"
          }`}
          style={{ width: "100%", height: "100%" }}
        />
      </div>

      {isTcgaGtex && (
        <div className="mt-2 bg-slate-950/70 border border-slate-800 rounded px-2.5 py-1 text-[9px] text-slate-400 leading-relaxed font-mono flex-shrink-0">
          * Wilcoxon log2FC was calculated as the difference of cohort means: {"\\(\\text{mean}(\\text{log}_2(\\text{TPM}+0.001)_{\\text{tumor}}) - \\text{mean}(\\text{log}_2(\\text{TPM}+0.001)_{\\text{normal}})\\)"}.
        </div>
      )}

      {hoveredGene && (
        <div
          className="absolute bg-slate-950 border border-slate-700 text-slate-100 rounded-lg p-2.5 shadow-2xl text-xs z-50 pointer-events-none"
          style={{
            left: `${tooltipPos.x + 15}px`,
            top: `${tooltipPos.y + 15}px`,
            transform: "translate(0, -50%)",
          }}
        >
          <div className="font-bold text-teal-400 text-sm mb-1">{hoveredGene.gene_name}</div>
          <div>
            <span className="text-slate-400">Wilcoxon log2FC:</span> {hoveredGene.log2FC.toFixed(4)}
          </div>
          {isTcgaGtex ? (
            <>
              <div>
                <span className="text-slate-400">Wilcoxon p-val:</span> {hoveredGene.pval?.toExponential(4)}
              </div>
              <div>
                <span className="text-slate-400">Wilcoxon FDR:</span> {hoveredGene.qval?.toExponential(4)}
              </div>
              {hoveredGene.voom_log2FC !== undefined && (
                <div className="border-t border-slate-850 pt-1 mt-1 text-[11px]">
                  <span className="text-slate-400">limma-voom log2FC:</span> {hoveredGene.voom_log2FC.toFixed(4)}
                </div>
              )}
              {hoveredGene.voom_qval !== undefined && (
                <div>
                  <span className="text-slate-400">limma-voom FDR:</span> {hoveredGene.voom_qval.toExponential(4)}
                </div>
              )}
              {hoveredGene.robust_deg !== undefined && (
                <div className={`mt-1 font-semibold text-[10px] ${hoveredGene.robust_deg ? "text-amber-400" : "text-slate-500"}`}>
                  Cross-method robust: {hoveredGene.robust_deg ? "Yes" : "No"}
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <span className="text-slate-400">p-value:</span> {hoveredGene.p_value.toExponential(4)}
              </div>
              {hoveredGene.adj_p_value !== undefined && (
                <div>
                  <span className="text-slate-400">Adj. p-val:</span> {hoveredGene.adj_p_value.toExponential(4)}
                </div>
              )}
            </>
          )}
          <div className="text-[10px] text-teal-500 font-semibold mt-1">Click to select</div>
        </div>
      )}
    </div>
  );
}
