"use client";

import React, { useState, useRef, useEffect } from "react";
import { Download, FileText, Image, Code, Table, Database, ChevronDown } from "lucide-react";

export interface ExportButtonProps {
  label?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  disabledTooltip?: string;
  onExportCSV?: () => void;
  onExportPNG?: () => void;
  onExportSVG?: () => void;
  onExportCellMetadata?: () => void;
  onExportExpressionMatrix?: () => void;
}

export default function ExportButton({
  label = "Export",
  size = "sm",
  disabled = false,
  disabledTooltip,
  onExportCSV,
  onExportPNG,
  onExportSVG,
  onExportCellMetadata,
  onExportExpressionMatrix,
}: ExportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const hasMultipleOptions =
    [
      onExportCSV,
      onExportPNG,
      onExportSVG,
      onExportCellMetadata,
      onExportExpressionMatrix,
    ].filter(Boolean).length > 1;

  // Single action shortcut if only 1 callback supplied
  const handleSingleClick = () => {
    if (disabled) return;
    if (onExportCSV) onExportCSV();
    else if (onExportPNG) onExportPNG();
    else if (onExportSVG) onExportSVG();
    else if (onExportCellMetadata) onExportCellMetadata();
    else if (onExportExpressionMatrix) onExportExpressionMatrix();
  };

  const py = size === "sm" ? "py-1" : "py-1.5";
  const px = size === "sm" ? "px-2.5" : "px-3";
  const textSize = size === "sm" ? "text-[10px]" : "text-xs";

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        type="button"
        disabled={disabled}
        title={disabled && disabledTooltip ? disabledTooltip : label}
        onClick={() => {
          if (disabled) return;
          if (hasMultipleOptions) {
            setIsOpen(!isOpen);
          } else {
            handleSingleClick();
          }
        }}
        className={`flex items-center gap-1.5 ${px} ${py} ${textSize} font-mono font-semibold rounded-lg border transition-all shadow-sm ${
          disabled
            ? "bg-slate-950/50 border-slate-900 text-slate-600 opacity-50 cursor-not-allowed"
            : "bg-slate-950 border-slate-800 text-teal-400 hover:bg-slate-800 hover:text-teal-300 hover:border-slate-700 cursor-pointer"
        }`}
      >
        <Download className="w-3.5 h-3.5 text-teal-400" />
        <span>{label}</span>
        {hasMultipleOptions && <ChevronDown className="w-3 h-3 text-slate-400 ml-0.5" />}
      </button>

      {/* Dropdown Menu */}
      {isOpen && !disabled && (
        <div className="origin-top-right absolute right-0 mt-1.5 w-56 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl z-50 py-1.5 divide-y divide-slate-800/80 font-mono text-xs">
          
          {/* Table / Data Section */}
          {(onExportCSV || onExportCellMetadata || onExportExpressionMatrix) && (
            <div className="py-1">
              <div className="px-3 py-1 text-[9px] text-slate-500 uppercase tracking-wider font-bold">
                Tabular Data & Metadata
              </div>
              {onExportCSV && (
                <button
                  onClick={() => {
                    setIsOpen(false);
                    onExportCSV();
                  }}
                  className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-slate-200 hover:bg-slate-800 hover:text-teal-400 transition"
                >
                  <Table className="w-3.5 h-3.5 text-teal-400" />
                  <span>Download Table (CSV)</span>
                </button>
              )}
              {onExportCellMetadata && (
                <button
                  onClick={() => {
                    setIsOpen(false);
                    onExportCellMetadata();
                  }}
                  className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-slate-200 hover:bg-slate-800 hover:text-amber-400 transition"
                >
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                  <span>Download Filtered Cell Metadata</span>
                </button>
              )}
              {onExportExpressionMatrix && (
                <button
                  onClick={() => {
                    setIsOpen(false);
                    onExportExpressionMatrix();
                  }}
                  className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-slate-200 hover:bg-slate-800 hover:text-indigo-400 transition"
                >
                  <Database className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Download Expression Matrix</span>
                </button>
              )}
            </div>
          )}

          {/* Graphics Section */}
          {(onExportPNG || onExportSVG) && (
            <div className="py-1">
              <div className="px-3 py-1 text-[9px] text-slate-500 uppercase tracking-wider font-bold">
                Publication Figure (300 DPI)
              </div>
              {onExportPNG && (
                <button
                  onClick={() => {
                    setIsOpen(false);
                    onExportPNG();
                  }}
                  className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-slate-200 hover:bg-slate-800 hover:text-teal-400 transition"
                >
                  <Image className="w-3.5 h-3.5 text-teal-400" />
                  <span>Download Figure (PNG)</span>
                </button>
              )}
              {onExportSVG && (
                <button
                  onClick={() => {
                    setIsOpen(false);
                    onExportSVG();
                  }}
                  className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-slate-200 hover:bg-slate-800 hover:text-indigo-400 transition"
                >
                  <Code className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Download Vector Figure (SVG)</span>
                </button>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
}
