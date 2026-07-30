"use client";

import React from "react";

export interface SummaryCardProps {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  valueColorClass?: string;
  iconClass?: string;
}

export default function SummaryCard({
  title,
  value,
  icon: Icon,
  valueColorClass = "text-slate-200",
  iconClass = "text-indigo-500/50",
}: SummaryCardProps) {
  return (
    <div className="bg-slate-900 border border-slate-800/80 p-4 rounded-xl shadow-xl flex items-center justify-between transition-all duration-200 hover:border-slate-700/80">
      <div>
        <span className="text-xs text-slate-400 uppercase font-semibold font-mono tracking-wider">
          {title}
        </span>
        <div className={`text-2xl font-bold font-mono mt-1 ${valueColorClass}`}>
          {value}
        </div>
      </div>
      <Icon className={`w-8 h-8 ${iconClass}`} />
    </div>
  );
}
