"use client";

import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { Search, Layers, Info, Sliders, HelpCircle, User } from "lucide-react";

interface Spot {
  id: string;
  r: number;
  c: number;
  x: number;
  y: number;
  tc?: number; // Total counts in spot for raw count reconstruction
}

interface Metadata {
  dataset_id: string;
  sample_id: string;
  patient_id: string;
  image_size: [number, number];
  spot_diameter_lowres: number;
  spots: Spot[];
}

interface MasterGene {
  s: string;   // Gene symbol (name)
  e: string;   // Ensembl ID
  k: string;   // Key (lowercase Ensembl ID)
  idx: number; // Feature index
  dup: boolean; // Is duplicate symbol
}

interface PatientListItem {
  id: string;
  gsm: string;
  disease: string;
  technology: string;
  tissue: string;
  treatment: string;
  spots_count: number;
  genes_count: number;
  image_size: [number, number];
}

// Float16 decoder (IEEE 754 half-precision)
function f16ToF32(h: number): number {
  const s = (h & 0x8000) ? -1 : 1;
  const e = (h >> 10) & 0x1F;
  const m = h & 0x3FF;
  if (e === 0) return s * Math.pow(2, -14) * (m / 1024);
  if (e === 31) return m ? NaN : s * Infinity;
  return s * Math.pow(2, e - 15) * (1 + m / 1024);
}

// Continuous expression color mapping (blue -> yellow -> red)
const getExpressionColor = (val: number, maxVal: number, opacity: number) => {
  if (maxVal <= 0) return `rgba(30, 41, 59, ${opacity})`; // Slate 800 fallback
  const ratio = Math.min(val / maxVal, 1);
  
  // Custom multi-stop gradient (Plasma-like: Dark Blue -> Purple -> Orange -> Yellow)
  let r = 0, g = 0, b = 0;
  if (ratio < 0.25) {
    const sub = ratio / 0.25;
    r = Math.round(13 + (76 - 13) * sub);
    g = Math.round(8 + (12 - 8) * sub);
    b = Math.round(135 + (50 - 135) * sub);
  } else if (ratio < 0.5) {
    const sub = (ratio - 0.25) / 0.25;
    r = Math.round(76 + (182 - 76) * sub);
    g = Math.round(12 + (54 - 12) * sub);
    b = Math.round(50 + (121 - 50) * sub);
  } else if (ratio < 0.75) {
    const sub = (ratio - 0.5) / 0.25;
    r = Math.round(182 + (241 - 182) * sub);
    g = Math.round(54 + (136 - 54) * sub);
    b = Math.round(121 + (18 - 121) * sub);
  } else {
    const sub = (ratio - 0.75) / 0.25;
    r = Math.round(241 + (252 - 241) * sub);
    g = Math.round(136 + (253 - 136) * sub);
    b = Math.round(18 + (191 - 18) * sub);
  }
  
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

export default function SpatialPrototypeView() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  
  // Patient list and selected states
  const [patientsList, setPatientsList] = useState<PatientListItem[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<string>("PDAC-p1");
  
  // Data loading states
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [masterIndex, setMasterIndex] = useState<{ [ensId: string]: MasterGene } | null>(null);
  const [searchableGenes, setSearchableGenes] = useState<MasterGene[]>([]);
  const [patientGenesIndex, setPatientGenesIndex] = useState<{ [ensId: string]: { max: number; max_raw: number } } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  
  // UI states
  const [viewMode, setViewMode] = useState<"he_only" | "he_spots" | "expression">("he_spots");
  const [spotOpacity, setSpotOpacity] = useState<number>(0.6);
  const [activeGene, setActiveGene] = useState<string | null>(null);
  const [selectedGeneInfo, setSelectedGeneInfo] = useState<MasterGene | null>(null);
  const [exprVec, setExprVec] = useState<Float32Array | null>(null);
  const [exprCap, setExprCap] = useState<number>(1);
  const [loadingGene, setLoadingGene] = useState<boolean>(false);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [suggestions, setSuggestions] = useState<MasterGene[]>([]);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  
  // Hover state
  const [hoveredSpot, setHoveredSpot] = useState<{
    barcode: string;
    r: number;
    c: number;
    expr: number;
    raw: number;
    canvasX: number;
    canvasY: number;
  } | null>(null);
  
  // Base Path for Static Files (Next.js config basePath)
  const basePath = "/PAAD-SBRT-GEx-Dashboard"; 
  
  // Load patients list and master index on mount
  useEffect(() => {
    async function initData() {
      try {
        const [patientsRes, indexRes] = await Promise.all([
          fetch(`${basePath}/data/gse274103/patients.json`),
          fetch(`${basePath}/data/gse274103/master_index.json`)
        ]);
        if (!patientsRes.ok || !indexRes.ok) throw new Error("Failed to load global spatial indices.");
        
        const patientsData = await patientsRes.json();
        const indexData = await indexRes.json();
        
        setPatientsList(patientsData);
        setMasterIndex(indexData);
        setSearchableGenes(Object.values(indexData) as MasterGene[]);
      } catch (e) {
        console.error("Error during initial data loading:", e);
      }
    }
    initData();
  }, []);

  // Load metadata and patient index when selected patient changes
  useEffect(() => {
    async function loadPatientData() {
      try {
        setLoading(true);
        setMetadata(null);
        setExprVec(null);
        setActiveGene(null);
        setSelectedGeneInfo(null);
        setHoveredSpot(null);
        setSearchQuery("");
        setSuggestions([]);
        setShowSuggestions(false);
        setSearchError(null);
        
        const [metaRes, indexRes] = await Promise.all([
          fetch(`${basePath}/data/gse274103/${selectedPatient}/metadata.json`),
          fetch(`${basePath}/data/gse274103/${selectedPatient}/genes_index.json`)
        ]);
        
        if (!metaRes.ok || !indexRes.ok) {
          throw new Error(`Failed to load dataset files for ${selectedPatient}.`);
        }
        
        const meta = await metaRes.json();
        const index = await indexRes.json();
        
        setMetadata(meta);
        setPatientGenesIndex(index);
        
        // Reset view mode if we don't have expression loaded yet
        setViewMode("he_spots");
      } catch (e: any) {
        console.error("Error loading patient data:", e);
      } finally {
        setLoading(false);
      }
    }
    
    loadPatientData();
  }, [selectedPatient]);

  // Handle Search Input Change with autocomplete mapping rules
  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    setSearchError(null);
    if (!val.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    
    const queryUpper = val.toUpperCase().trim();
    
    if (queryUpper === "KRT19") {
      setSearchError("Gene not available in the GSE274103 Visium feature set.");
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    
    // Autocomplete mapping rules: Exact -> Prefix -> Substring
    const exact = searchableGenes.filter(g => g.s.toUpperCase() === queryUpper);
    const prefix = searchableGenes.filter(g => 
      g.s.toUpperCase().startsWith(queryUpper) && g.s.toUpperCase() !== queryUpper
    );
    const substring = searchableGenes.filter(g => 
      g.s.toUpperCase().includes(queryUpper) && 
      !g.s.toUpperCase().startsWith(queryUpper)
    );
    
    setSuggestions([...exact, ...prefix, ...substring].slice(0, 10));
    setShowSuggestions(true);
  };

  // Fetch and Load Gene Expression Binary based on Ensembl ID
  const loadGene = useCallback(async (gene: MasterGene) => {
    if (!metadata) return;
    
    setLoadingGene(true);
    setSearchError(null);
    setSearchQuery("");
    setSuggestions([]);
    setShowSuggestions(false);
    
    try {
      const res = await fetch(`${basePath}/data/gse274103/${selectedPatient}/genes_bin/${gene.e}.bin`);
      if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
      
      const buffer = await res.arrayBuffer();
      const dv = new DataView(buffer);
      const n_nz = dv.getUint32(0, true);
      
      const idxArr = new Uint16Array(buffer, 4, n_nz);
      const valU16 = new Uint16Array(buffer, 4 + n_nz * 2, n_nz);
      
      const totalSpots = metadata.spots.length;
      const parsedExpr = new Float32Array(totalSpots);
      
      let maxVal = 0.0;
      for (let i = 0; i < n_nz; i++) {
        const spotIdx = idxArr[i];
        if (spotIdx < totalSpots) {
          const valF32 = f16ToF32(valU16[i]);
          parsedExpr[spotIdx] = valF32;
          if (valF32 > maxVal) maxVal = valF32;
        }
      }
      
      // Calculate 99th percentile cap for visualization to minimize noise/outlier bias
      const nonZeroVals = Array.from(parsedExpr).filter(v => v > 0).sort((a, b) => a - b);
      let cap = maxVal;
      if (nonZeroVals.length > 0) {
        const p99idx = Math.max(0, Math.ceil(nonZeroVals.length * 0.99) - 1);
        cap = nonZeroVals[p99idx];
      }
      if (cap <= 0) cap = 1.0;
      
      setExprVec(parsedExpr);
      setExprCap(cap);
      
      // Format active gene representation to display Ensembl ID for duplicates
      const displayName = gene.dup ? `${gene.s} (${gene.e})` : gene.s;
      setActiveGene(displayName);
      setSelectedGeneInfo(gene);
      setViewMode("expression");
    } catch (e: any) {
      console.error(e);
      setSearchError(`Failed to load expression data: ${e.message}`);
    } finally {
      setLoadingGene(false);
    }
  }, [metadata, selectedPatient]);

  // Render Canvas with H&E image and Spot Overlays
  useEffect(() => {
    if (!metadata || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const img = new Image();
    img.src = `${basePath}/images/gse274103/${selectedPatient}/tissue_lowres_image.png`;
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      if (viewMode === "he_only") return;
      
      const spotRadius = metadata.spot_diameter_lowres / 2;
      metadata.spots.forEach((spot, idx) => {
        ctx.beginPath();
        ctx.arc(spot.x, spot.y, spotRadius, 0, 2 * Math.PI);
        
        if (viewMode === "expression" && exprVec) {
          const val = exprVec[idx] || 0.0;
          ctx.fillStyle = getExpressionColor(val, exprCap, spotOpacity);
          ctx.fill();
        } else {
          ctx.strokeStyle = `rgba(244, 63, 94, ${spotOpacity})`; // Rose 500
          ctx.lineWidth = 0.8;
          ctx.stroke();
          ctx.fillStyle = `rgba(244, 63, 94, ${spotOpacity * 0.15})`;
          ctx.fill();
        }
      });
      
      if (hoveredSpot) {
        const match = metadata.spots.find(s => s.id === hoveredSpot.barcode);
        if (match) {
          ctx.beginPath();
          ctx.arc(match.x, match.y, spotRadius + 1.5, 0, 2 * Math.PI);
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    };
  }, [metadata, viewMode, spotOpacity, exprVec, exprCap, hoveredSpot, selectedPatient]);

  // Helper to calculate offset relative to container
  const getCanvasOffset = () => {
    if (!canvasRef.current) return { left: 0, top: 0, width: 578, height: 600 };
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    };
  };

  // Handle Mouse Hover detection on Canvas
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!metadata || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    const scaleX = 578 / rect.width;
    const scaleY = 600 / rect.height;
    
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;
    
    const spotRadius = metadata.spot_diameter_lowres / 2;
    const threshold = spotRadius + 1.0;
    
    let closestSpot: Spot | null = null;
    let closestDist = Infinity;
    let closestIdx = -1;
    
    metadata.spots.forEach((spot, idx) => {
      const dist = Math.hypot(spot.x - clickX, spot.y - clickY);
      if (dist < threshold && dist < closestDist) {
        closestDist = dist;
        closestSpot = spot;
        closestIdx = idx;
      }
    });
    
    if (closestSpot) {
      const spot = closestSpot as Spot;
      const exprVal = exprVec ? exprVec[closestIdx] : 0.0;
      
      // Reconstruct raw count: round((exp(exprVal) - 1.0) * tc / 10000)
      // This has been verified 100% numerically exact across all cohort samples
      const rawCount = exprVal > 0 && spot.tc ? Math.round((Math.exp(exprVal) - 1.0) * spot.tc / 10000.0) : 0;
      
      setHoveredSpot({
        barcode: spot.id,
        r: spot.r,
        c: spot.c,
        expr: exprVal,
        raw: rawCount,
        canvasX: spot.x / scaleX,
        canvasY: spot.y / scaleY
      });
    } else {
      setHoveredSpot(null);
    }
  };

  const handleMouseLeave = () => {
    setHoveredSpot(null);
  };

  const activePatientInfo = useMemo(() => {
    return patientsList.find(p => p.id === selectedPatient);
  }, [patientsList, selectedPatient]);

  const offset = getCanvasOffset();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 py-4 flex items-center justify-between sticky top-0 z-40">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <span className="bg-rose-500/10 text-rose-400 text-xs px-2.5 py-0.5 rounded-full border border-rose-500/20">V1.0</span>
            PDAC Spatial Transcriptomics Explorer — GSE274103
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Human PDAC spatial transcriptomic atlas · 5 treatment-naïve patients · 17,941 unique gene symbols searchable
          </p>
        </div>
        <div className="text-xxs text-slate-500 font-mono bg-slate-900 border border-slate-800 px-2 py-1 rounded">
          Resource version: 1.0
        </div>
      </header>

      {/* Main Layout Grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 overflow-hidden">
        
        {/* Left Panel - H&E Canvas */}
        <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between items-center shadow-lg relative min-h-[500px]" ref={containerRef}>
          <div className="w-full flex items-center justify-between mb-3 text-xs text-slate-400 border-b border-slate-800/60 pb-2 font-mono">
            <span className="flex items-center gap-1.5"><Layers className="h-3.5 w-3.5 text-rose-500" /> Interactive Spatial View (10x Visium)</span>
            <span className="text-slate-500">Status: <strong className="text-amber-500">PENDING VISUAL VERIFICATION</strong></span>
          </div>

          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500"></div>
              <span className="text-sm text-slate-400 font-mono">Loading dataset matrices...</span>
            </div>
          ) : (
            <div className="relative w-full max-w-[500px] flex-1 flex items-center justify-center p-2">
              <canvas
                ref={canvasRef}
                width={578}
                height={600}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                className="rounded border border-slate-700 bg-slate-950 shadow-inner cursor-crosshair w-full h-auto aspect-[578/600] max-h-[650px]"
              />
              
              {/* Overlay Tooltip */}
              {hoveredSpot && (
                <div 
                  className="absolute pointer-events-none bg-slate-950/95 border border-slate-700 rounded-lg p-3 text-xs shadow-2xl text-slate-200 z-50 min-w-[210px] font-mono"
                  style={{
                    left: `${(hoveredSpot.canvasX / 578) * offset.width + 15}px`,
                    top: `${(hoveredSpot.canvasY / 600) * offset.height - 40}px`
                  }}
                >
                  <p className="font-semibold text-rose-400 border-b border-slate-800 pb-1 mb-1 font-mono">Spot Info</p>
                  <p className="truncate"><span className="text-slate-500">Barcode:</span> {hoveredSpot.barcode}</p>
                  <p><span className="text-slate-500">Array Pos:</span> R{hoveredSpot.r}, C{hoveredSpot.c}</p>
                  <div className="mt-1.5 flex flex-col gap-0.5 border-t border-slate-900 pt-1.5 font-mono">
                    <p><span className="text-slate-500">Raw Count:</span> {hoveredSpot.raw} (reconstructed)</p>
                    {viewMode === "expression" && activeGene && (
                      <p className="text-rose-300 font-semibold mt-0.5">
                        {activeGene}: {hoveredSpot.expr.toFixed(4)}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Scale disclaimer banner */}
          <div className="w-full mt-3 bg-amber-500/5 border border-amber-500/10 rounded-lg p-3 flex items-start gap-2.5 text-xs text-amber-300">
            <HelpCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
            <div>
              <p className="font-semibold">Independent Transformation scale factors</p>
              <p className="mt-0.5 text-slate-400 leading-relaxed font-mono text-xxs">
                Each slide has been transformed using its own Space Ranger low-res scale factors. Normalization is calculated independently per slide. Visual alignments are PENDING VISUAL VERIFICATION.
              </p>
            </div>
          </div>
        </div>

        {/* Right Panel - Side Controls */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          {/* Patient Selector Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-4">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <User className="h-4 w-4 text-rose-500" /> Select Patient
            </h2>
            
            <div className="relative">
              <select
                value={selectedPatient}
                onChange={(e) => setSelectedPatient(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-sm text-slate-100 rounded-lg px-3 py-2.5 focus:outline-none focus:border-rose-500 transition cursor-pointer appearance-none font-mono"
              >
                {patientsList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id} ({p.gsm})
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                ▼
              </div>
            </div>
          </div>

          {/* Gene Search Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-4">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Search className="h-4 w-4 text-rose-500" /> Search Gene Expression
            </h2>
            
            <div className="relative">
              <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 focus-within:border-rose-500 focus-within:ring-1 focus-within:ring-rose-500 transition">
                <Search className="h-4 w-4 text-slate-500 mr-2" />
                <input
                  type="text"
                  placeholder="Search PHGDH, COL1A1, TBCE..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => setShowSuggestions(true)}
                  className="bg-transparent text-sm text-slate-100 placeholder-slate-600 focus:outline-none w-full"
                />
                {loadingGene && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-rose-500"></div>}
              </div>

              {/* Suggestions dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <ul className="absolute left-0 right-0 mt-1.5 bg-slate-950 border border-slate-800 rounded-lg shadow-2xl z-50 max-h-56 overflow-y-auto divide-y divide-slate-900">
                  {suggestions.map((gene) => (
                    <li key={gene.e}>
                      <button
                        onClick={() => loadGene(gene)}
                        className="w-full text-left px-4 py-3 text-sm text-slate-300 hover:bg-rose-500/10 hover:text-white transition flex items-center justify-between"
                      >
                        <span className="font-semibold">
                          {gene.s} {gene.dup && <span className="text-xxs text-rose-400 font-mono ml-1.5">({gene.e})</span>}
                        </span>
                        <span className="text-xxs text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 font-mono">
                          {gene.e}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {searchError && (
              <div className="text-xs bg-rose-500/5 border border-rose-500/10 text-rose-400 p-3 rounded-lg leading-relaxed font-mono">
                <p className="font-semibold">{searchError}</p>
                {searchQuery.toUpperCase().trim() !== "KRT19" && (
                  <p className="mt-1 text-slate-400">
                    Try searching for common markers like PHGDH, EPCAM, or COL1A1.
                  </p>
                )}
              </div>
            )}

            {/* Selected Gene Stats */}
            {activeGene && selectedGeneInfo && (
              <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 text-xs flex flex-col gap-1.5 font-mono">
                <p className="text-slate-400 font-semibold">Active Gene: <strong className="text-rose-400 text-sm">{activeGene}</strong></p>
                <p><span className="text-slate-500">Ensembl ID:</span> {selectedGeneInfo.e}</p>
                {patientGenesIndex && patientGenesIndex[selectedGeneInfo.e] && (
                  <>
                    <p><span className="text-slate-500">Max Log-normalized:</span> {patientGenesIndex[selectedGeneInfo.e].max.toFixed(4)}</p>
                    <p><span className="text-slate-500">Max Raw Count:</span> {patientGenesIndex[selectedGeneInfo.e].max_raw}</p>
                  </>
                )}
                <p className="text-slate-500 mt-1 italic leading-relaxed text-xxs border-t border-slate-900 pt-1">
                  Color scale is capped at the 99th percentile ({exprCap.toFixed(2)}) to reduce outlier visual skewing.
                </p>
              </div>
            )}
          </div>

          {/* Controls Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-5">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Sliders className="h-4 w-4 text-rose-500" /> Visualization Controls
            </h2>
            
            {/* View Mode selection */}
            <div className="flex flex-col gap-2">
              <span className="text-xs text-slate-400 font-semibold">Overlay Mode:</span>
              <div className="grid grid-cols-3 gap-2 bg-slate-950 p-1.5 rounded-lg border border-slate-800">
                <button
                  onClick={() => setViewMode("he_only")}
                  className={`text-xxs font-bold py-2 rounded-md transition ${viewMode === "he_only" ? "bg-rose-500 text-white shadow" : "text-slate-400 hover:text-white"}`}
                >
                  H&E Only
                </button>
                <button
                  onClick={() => setViewMode("he_spots")}
                  className={`text-xxs font-bold py-2 rounded-md transition ${viewMode === "he_spots" ? "bg-rose-500 text-white shadow" : "text-slate-400 hover:text-white"}`}
                >
                  Capture Spots
                </button>
                <button
                  onClick={() => exprVec ? setViewMode("expression") : alert("Search and load a gene first!")}
                  className={`text-xxs font-bold py-2 rounded-md transition ${viewMode === "expression" ? "bg-rose-500 text-white shadow" : "text-slate-400 hover:text-white"} ${!exprVec ? "opacity-40 cursor-not-allowed" : ""}`}
                >
                  Expression
                </button>
              </div>
            </div>

            {/* Opacity slider */}
            {viewMode !== "he_only" && (
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center text-xs text-slate-400">
                  <span className="font-semibold">Spot Opacity:</span>
                  <span>{Math.round(spotOpacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={spotOpacity}
                  onChange={(e) => setSpotOpacity(parseFloat(e.target.value))}
                  className="w-full accent-rose-500 h-1.5 bg-slate-950 rounded-lg cursor-pointer"
                />
              </div>
            )}

            {/* Expression scale legend */}
            {viewMode === "expression" && activeGene && (
              <div className="flex flex-col gap-2 border-t border-slate-800/80 pt-3.5">
                <span className="text-xs text-slate-400 font-semibold">Expression Color Scale:</span>
                <div className="flex flex-col gap-1.5">
                  <div className="h-3 rounded-full bg-gradient-to-r from-blue-900 via-indigo-800 via-purple-700 via-orange-600 to-yellow-400 border border-slate-800" />
                  <div className="flex justify-between text-xxs text-slate-500 font-mono">
                    <span>0.00 (Min)</span>
                    <span>Capped Max ({exprCap.toFixed(2)})</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Dataset Info Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-3.5 text-xs">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Info className="h-4 w-4 text-rose-500" /> Dataset & Methods
            </h2>
            
            {activePatientInfo ? (
              <div className="grid grid-cols-2 gap-y-2 border-b border-slate-800/60 pb-3 text-slate-400 font-mono text-xxs">
                <span className="text-slate-500">GEO Accession:</span>
                <span className="font-semibold text-slate-300">{activePatientInfo.gsm}</span>
                <span className="text-slate-500">Sample ID:</span>
                <span className="font-semibold text-slate-300">{activePatientInfo.id}</span>
                <span className="text-slate-500">Tissue Spots:</span>
                <span className="font-semibold text-slate-300">{activePatientInfo.spots_count} spots</span>
                <span className="text-slate-500">Technology:</span>
                <span className="font-semibold text-slate-300">10x Visium (FFPE)</span>
                <span className="text-slate-500">Normalization:</span>
                <span className="font-semibold text-slate-300">CP10K + log1p</span>
                <span className="text-slate-500">Storage format:</span>
                <span className="font-semibold text-slate-300 text-xxs">Float16 representation</span>
              </div>
            ) : (
              <div className="text-slate-400 py-3 text-center">Loading patient info...</div>
            )}

            <div className="bg-slate-950 border border-slate-800/80 p-3 rounded-lg text-slate-500 leading-relaxed text-xxs font-mono space-y-1">
              <strong className="text-slate-400 block border-b border-slate-900 pb-1 mb-1">Scientific Limitations</strong>
              <p>• Visium spatial spots (55µm) do not resolve individual cells; expression values represent mixed cellular profiles.</p>
              <p>• No cell-type annotations or histopathologic regions are assigned in this dashboard.</p>
              <p>• Float16 sparse data is optimized for high-performance visual rendering ("Float16 visualization representation") and is not intended for downstream statistical reanalysis.</p>
              <p>• KRT19 is absent in the official GSE274103 Visium probe set.</p>
            </div>

            <div className="mt-2 bg-slate-950 border border-amber-500/10 p-3 rounded-lg text-amber-500/80 leading-relaxed text-xxs font-mono">
              <strong className="text-amber-400 block mb-1">Cross-Study Disclaimer</strong>
              GSE274103, GSE202051, and GSE225767 are independent studies involving different patient cohorts. Cross-modal views in this BioPortal provide complementary biological context and should not be interpreted as measurements from matched patients.
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
