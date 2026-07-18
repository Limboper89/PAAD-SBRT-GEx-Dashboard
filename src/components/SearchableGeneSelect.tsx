"use client";

import React, { useState, useRef, useEffect } from "react";
import { Search, ChevronDown } from "lucide-react";

interface SearchableGeneSelectProps {
  options: string[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export default function SearchableGeneSelect({
  options,
  value,
  onChange,
  placeholder = "Select gene...",
  className = "",
}: SearchableGeneSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter options based on search
  const filteredOptions = React.useMemo(() => {
    if (!search.trim()) return options.slice(0, 50); // Show top 50 by default to keep rendering fast
    const query = search.toUpperCase().trim();
    return options.filter((opt) => opt.toUpperCase().includes(query)).slice(0, 50);
  }, [options, search]);

  const handleSelect = (val: string) => {
    onChange(val);
    setSearch("");
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-teal-500 transition-colors text-left"
      >
        <span className="truncate">{value || placeholder}</span>
        <ChevronDown className="w-3.5 h-3.5 ml-1 text-slate-500 flex-shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 mt-1.5 bg-slate-950 border border-slate-800 rounded-lg shadow-2xl z-50 overflow-hidden">
          <div className="p-2 border-b border-slate-900 flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-xs text-slate-200 placeholder-slate-600 focus:outline-none"
              autoFocus
            />
          </div>
          <ul className="max-h-48 overflow-y-auto text-xs py-1">
            {filteredOptions.length === 0 ? (
              <li className="px-3 py-2 text-slate-600 text-center">No genes found</li>
            ) : (
              filteredOptions.map((opt) => (
                <li key={opt}>
                  <button
                    type="button"
                    onClick={() => handleSelect(opt)}
                    className={`w-full text-left px-3 py-1.5 hover:bg-slate-850 transition-colors ${
                      opt === value ? "text-teal-400 font-bold bg-slate-900" : "text-slate-300"
                    }`}
                  >
                    {opt}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
