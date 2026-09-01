import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { Search, Layers, Info, Sliders, HelpCircle, User, Bot, ZoomIn, ZoomOut, RotateCcw, Maximize2, Download, Sparkles } from "lucide-react";
import ExportButton from "./ExportButton";
import { exportCanvasToPNG, exportCanvasToSVG, exportToCSV } from "@/utils/exportUtils";
import { useAIContext } from "@/components/ai/AIProvider";
import SpatialCrossPatientPlot, { PatientSpatialMetric } from "./SpatialCrossPatientPlot";


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
  const [patientGenesIndex, setPatientGenesIndex] = useState<{ [ensId: string]: { max: number; max_raw: number; c?: number; o?: number; l?: number } } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  
  // UI states
  const [viewMode, setViewMode] = useState<"he_only" | "he_spots" | "expression">("he_spots");
  const [spotOpacity, setSpotOpacity] = useState<number>(0.6);
  const [activeGene, setActiveGene] = useState<string | null>(null);
  const [selectedGeneInfo, setSelectedGeneInfo] = useState<MasterGene | null>(null);
  const [exprVec, setExprVec] = useState<Float32Array | null>(null);
  const [exprCap, setExprCap] = useState<number>(1);
  const [loadingGene, setLoadingGene] = useState<boolean>(false);
  const [cohortMetrics, setCohortMetrics] = useState<PatientSpatialMetric[]>([]);
  const [loadingCohort, setLoadingCohort] = useState<boolean>(false);

  // Zoom & Pan state
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Image preloading refs & state
  const lowresImgRef = useRef<HTMLImageElement | null>(null);
  const hiresImgRef = useRef<HTMLImageElement | null>(null);
  const [hiresLoaded, setHiresLoaded] = useState<boolean>(false);
  
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
  
  const { registerModuleContext } = useAIContext();

  // Sync state to PDACopilot
  useEffect(() => {
    registerModuleContext({
      module: "Spatial",
      gene: activeGene,
      dataset: "GSE274103: Patient Tumor Spatial Transcriptomics",
      currentFigure: "Spatial Spot Map",
      spatialStats: {
        sampleId: selectedPatient,
        currentViewMode: viewMode === "he_only" ? "H&E Stain" : viewMode === "he_spots" ? "H&E + Visium Spots" : "Expression Heatmap"
      }
    });
  }, [activeGene, selectedPatient, viewMode, registerModuleContext]);

  // Base Path for Static Files (Next.js config basePath)
  const basePath = "/PAAD-SBRT-GEx-Dashboard"; 
  const chunkCacheRef = React.useRef<Map<number, ArrayBuffer>>(new Map());
  
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

  // Load lowres and pre-load genuine native hires WebP image when patient changes
  useEffect(() => {
    if (!selectedPatient) return;
    setHiresLoaded(false);
    setZoom(1.0);
    setPan({ x: 0, y: 0 });

    const lowres = new Image();
    lowres.src = `${basePath}/images/gse274103/${selectedPatient}/tissue_lowres_image.png`;
    lowresImgRef.current = lowres;

    const hires = new Image();
    hires.src = `${basePath}/images/gse274103/${selectedPatient}/tissue_hires_image.webp`;
    hires.onload = () => {
      hiresImgRef.current = hires;
      setHiresLoaded(true);
    };
  }, [selectedPatient]);

  // Load metadata and patient index when selected patient changes
  useEffect(() => {
    async function loadPatientData() {
      try {
        setLoading(true);
        setMetadata(null);
        setHoveredSpot(null);
        
        chunkCacheRef.current.clear();
        
        const [metaRes, indexRes] = await Promise.all([
          fetch(`${basePath}/data/gse274103/${selectedPatient}/metadata.json`),
          fetch(`${basePath}/data/gse274103/${selectedPatient}/genes_index_chunked.json`)
        ]);
        
        if (!metaRes.ok || !indexRes.ok) {
          throw new Error(`Failed to load dataset files for ${selectedPatient}.`);
        }
        
        const meta = await metaRes.json();
        const index = await indexRes.json();
        
        setMetadata(meta);
        setPatientGenesIndex(index);
        
        // If an active gene was already chosen, automatically reload its spatial expression for the new patient
        if (selectedGeneInfo && index[selectedGeneInfo.e]) {
          const gInfo = index[selectedGeneInfo.e];
          if (gInfo.c !== undefined && gInfo.o !== undefined && gInfo.l !== undefined) {
            const chunkFilename = `chunk_${gInfo.c.toString().padStart(3, "0")}.bin`;
            const chunkRes = await fetch(`${basePath}/data/gse274103/${selectedPatient}/expression_chunks/${chunkFilename}`);
            if (chunkRes.ok) {
              const chunkBuf = await chunkRes.arrayBuffer();
              const slice = chunkBuf.slice(gInfo.o, gInfo.o + gInfo.l);
              const dv = new DataView(slice);
              const n_nz = dv.getUint32(0, true);
              const idxArr = new Uint16Array(slice, 4, n_nz);
              const valU16 = new Uint16Array(slice, 4 + n_nz * 2, n_nz);
              const totalSpots = meta.spots.length;
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

              const nonZeroVals = Array.from(parsedExpr).filter(v => v > 0).sort((a, b) => a - b);
              let cap = maxVal;
              if (nonZeroVals.length > 0) {
                const p99idx = Math.max(0, Math.ceil(nonZeroVals.length * 0.99) - 1);
                cap = nonZeroVals[p99idx];
              }
              if (cap <= 0) cap = 1.0;

              setExprVec(parsedExpr);
              setExprCap(cap);
              setViewMode("expression");
            }
          }
        } else if (!selectedGeneInfo) {
          setExprVec(null);
          setActiveGene(null);
          setViewMode("he_spots");
        }
      } catch (e: any) {
        console.error("Error loading patient data:", e);
      } finally {
        setLoading(false);
      }
    }
    
    loadPatientData();
  }, [selectedPatient]);

  // Wheel listener for smooth zoom towards mouse cursor
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !metadata) return;

    const imgW = metadata.image_size[0] || 578;
    const imgH = metadata.image_size[1] || 600;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseCanvasX = (e.clientX - rect.left) * (imgW / rect.width);
      const mouseCanvasY = (e.clientY - rect.top) * (imgH / rect.height);

      const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      setZoom(prevZoom => {
        const newZoom = Math.min(Math.max(prevZoom * zoomFactor, 1.0), 6.0);
        if (newZoom === 1.0) {
          setPan({ x: 0, y: 0 });
          return 1.0;
        }

        setPan(prevPan => {
          const worldX = (mouseCanvasX - prevPan.x) / prevZoom;
          const worldY = (mouseCanvasY - prevPan.y) / prevZoom;

          let newPanX = mouseCanvasX - worldX * newZoom;
          let newPanY = mouseCanvasY - worldY * newZoom;

          const minPanX = imgW * (1 - newZoom);
          const minPanY = imgH * (1 - newZoom);

          newPanX = Math.min(Math.max(newPanX, minPanX), 0);
          newPanY = Math.min(Math.max(newPanY, minPanY), 0);

          return { x: newPanX, y: newPanY };
        });

        return newZoom;
      });
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [metadata]);

  const handleResetView = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  };

  const handleZoomIn = () => {
    if (!metadata) return;
    const imgW = metadata.image_size[0] || 578;
    const imgH = metadata.image_size[1] || 600;
    setZoom(prev => {
      const next = Math.min(prev * 1.3, 6.0);
      const centerW = imgW / 2;
      const centerH = imgH / 2;
      let newPanX = centerW - centerW * next;
      let newPanY = centerH - centerH * next;
      const minPanX = imgW * (1 - next);
      const minPanY = imgH * (1 - next);
      newPanX = Math.min(Math.max(newPanX, minPanX), 0);
      newPanY = Math.min(Math.max(newPanY, minPanY), 0);
      setPan({ x: newPanX, y: newPanY });
      return next;
    });
  };

  const handleZoomOut = () => {
    if (!metadata) return;
    const imgW = metadata.image_size[0] || 578;
    const imgH = metadata.image_size[1] || 600;
    setZoom(prev => {
      const next = Math.max(prev / 1.3, 1.0);
      if (next === 1.0) {
        setPan({ x: 0, y: 0 });
        return 1.0;
      }
      const minPanX = imgW * (1 - next);
      const minPanY = imgH * (1 - next);
      const newPanX = Math.min(Math.max(pan.x, minPanX), 0);
      const newPanY = Math.min(Math.max(pan.y, minPanY), 0);
      setPan({ x: newPanX, y: newPanY });
      return next;
    });
  };

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
      const indexInfo = patientGenesIndex?.[gene.e];
      if (!indexInfo || indexInfo.c === undefined || indexInfo.o === undefined || indexInfo.l === undefined) {
        throw new Error("Gene location metadata missing in index.");
      }

      const chunkId = indexInfo.c;
      const offset = indexInfo.o;
      const length = indexInfo.l;

      let chunkBuf = chunkCacheRef.current.get(chunkId);
      if (!chunkBuf) {
        const chunkFilename = `chunk_${chunkId.toString().padStart(3, "0")}.bin`;
        const res = await fetch(`${basePath}/data/gse274103/${selectedPatient}/expression_chunks/${chunkFilename}`);
        if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
        chunkBuf = await res.arrayBuffer();
        chunkCacheRef.current.set(chunkId, chunkBuf);
      }

      const buffer = chunkBuf.slice(offset, offset + length);
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

      // Trigger asynchronous cohort cross-patient calculation
      loadCohortMetrics(gene);
    } catch (e: any) {
      console.error(e);
      setSearchError(`Failed to load expression data: ${e.message}`);
    } finally {
      setLoadingGene(false);
    }
  }, [metadata, selectedPatient, patientGenesIndex]);

  // Load Cross-Patient Quantitative Metrics across all 5 patients
  const loadCohortMetrics = useCallback(async (gene: MasterGene) => {
    if (!patientsList || patientsList.length === 0) return;
    try {
      setLoadingCohort(true);
      const results: PatientSpatialMetric[] = await Promise.all(
        patientsList.map(async (p) => {
          try {
            const [metaRes, indexRes] = await Promise.all([
              fetch(`${basePath}/data/gse274103/${p.id}/metadata.json`),
              fetch(`${basePath}/data/gse274103/${p.id}/genes_index_chunked.json`),
            ]);
            if (!metaRes.ok || !indexRes.ok) throw new Error("Fetch failed");
            const pMeta: Metadata = await metaRes.json();
            const pIndex = await indexRes.json();
            const gInfo = pIndex[gene.e];

            if (!gInfo || gInfo.c === undefined || gInfo.o === undefined || gInfo.l === undefined) {
              return {
                patientId: p.id,
                gsm: p.gsm,
                totalSpots: pMeta.spots?.length || p.spots_count,
                positiveSpots: 0,
                pctPositive: 0,
                meanPositiveExpr: 0,
                pseudobulkExpr: 0,
                maxExpr: 0,
              };
            }

            const chunkFilename = `chunk_${gInfo.c.toString().padStart(3, "0")}.bin`;
            const chunkRes = await fetch(`${basePath}/data/gse274103/${p.id}/expression_chunks/${chunkFilename}`);
            if (!chunkRes.ok) throw new Error("Chunk fetch failed");
            const chunkBuf = await chunkRes.arrayBuffer();
            const slice = chunkBuf.slice(gInfo.o, gInfo.o + gInfo.l);
            const dv = new DataView(slice);
            const n_nz = dv.getUint32(0, true);
            const valU16 = new Uint16Array(slice, 4 + n_nz * 2, n_nz);

            let posCount = 0;
            let sumExpr = 0;
            let maxExpr = 0;

            for (let i = 0; i < n_nz; i++) {
              const valF32 = f16ToF32(valU16[i]);
              if (valF32 > 0) {
                posCount++;
                sumExpr += valF32;
                if (valF32 > maxExpr) maxExpr = valF32;
              }
            }

            const totalSpots = pMeta.spots?.length || p.spots_count;
            return {
              patientId: p.id,
              gsm: p.gsm,
              totalSpots,
              positiveSpots: posCount,
              pctPositive: Number(((posCount / totalSpots) * 100).toFixed(1)),
              meanPositiveExpr: posCount > 0 ? Number((sumExpr / posCount).toFixed(3)) : 0,
              pseudobulkExpr: Number((sumExpr / totalSpots).toFixed(3)),
              maxExpr: Number(maxExpr.toFixed(3)),
            };
          } catch (err) {
            console.error(`Error loading metrics for ${p.id}:`, err);
            return {
              patientId: p.id,
              gsm: p.gsm,
              totalSpots: p.spots_count || 4500,
              positiveSpots: 0,
              pctPositive: 0,
              meanPositiveExpr: 0,
              pseudobulkExpr: 0,
              maxExpr: 0,
            };
          }
        })
      );
      setCohortMetrics(results);
    } catch (err) {
      console.error("Failed to load cohort metrics:", err);
    } finally {
      setLoadingCohort(false);
    }
  }, [patientsList]);

  // Render Canvas with H&E image and Spot Overlays (Unified World Coordinates + Zoom/Pan Transform)
  useEffect(() => {
    if (!metadata || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    const imgW = metadata.image_size[0] || 578;
    const imgH = metadata.image_size[1] || 600;

    if (canvas.width !== imgW) canvas.width = imgW;
    if (canvas.height !== imgH) canvas.height = imgH;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);
    
    // Choose high-res WebP image when zoomed > 1.25 for crisp histological resolution
    const activeImg = (hiresLoaded && hiresImgRef.current && zoom > 1.25)
      ? hiresImgRef.current
      : lowresImgRef.current;
    
    if (activeImg) {
      ctx.drawImage(activeImg, 0, 0, canvas.width, canvas.height);
    }
    
    if (viewMode !== "he_only") {
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
          ctx.lineWidth = 0.8 / Math.sqrt(zoom);
          ctx.stroke();
          ctx.fillStyle = `rgba(244, 63, 94, ${spotOpacity * 0.15})`;
          ctx.fill();
        }
      });
      
      if (hoveredSpot) {
        const match = metadata.spots.find(s => s.id === hoveredSpot.barcode);
        if (match) {
          ctx.beginPath();
          ctx.arc(match.x, match.y, spotRadius + (1.5 / zoom), 0, 2 * Math.PI);
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1.5 / Math.sqrt(zoom);
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  }, [metadata, viewMode, spotOpacity, exprVec, exprCap, hoveredSpot, selectedPatient, zoom, pan, hiresLoaded]);

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

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (zoom > 1.0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Handle Mouse Hover & Drag detection on Canvas (Screen -> World Transform)
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!metadata || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const imgW = metadata.image_size[0] || 578;
    const imgH = metadata.image_size[1] || 600;

    if (isDragging) {
      const dx = (e.clientX - dragStart.x) * (imgW / rect.width);
      const dy = (e.clientY - dragStart.y) * (imgH / rect.height);

      setPan(prevPan => {
        let newPanX = prevPan.x + dx;
        let newPanY = prevPan.y + dy;

        const minPanX = imgW * (1 - zoom);
        const minPanY = imgH * (1 - zoom);

        newPanX = Math.min(Math.max(newPanX, minPanX), 0);
        newPanY = Math.min(Math.max(newPanY, minPanY), 0);

        return { x: newPanX, y: newPanY };
      });

      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }
    
    const mouseCanvasX = (e.clientX - rect.left) * (imgW / rect.width);
    const mouseCanvasY = (e.clientY - rect.top) * (imgH / rect.height);
    
    // Transform screen click to world coordinates
    const worldX = (mouseCanvasX - pan.x) / zoom;
    const worldY = (mouseCanvasY - pan.y) / zoom;
    
    const spotRadius = metadata.spot_diameter_lowres / 2;
    const threshold = spotRadius + (1.5 / Math.sqrt(zoom));
    
    let closestSpot: Spot | null = null;
    let closestDist = Infinity;
    let closestIdx = -1;
    
    metadata.spots.forEach((spot, idx) => {
      const dist = Math.hypot(spot.x - worldX, spot.y - worldY);
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
      const rawCount = exprVal > 0 && spot.tc ? Math.round((Math.exp(exprVal) - 1.0) * spot.tc / 10000.0) : 0;
      
      const spotCanvasX = spot.x * zoom + pan.x;
      const spotCanvasY = spot.y * zoom + pan.y;

      setHoveredSpot({
        barcode: spot.id,
        r: spot.r,
        c: spot.c,
        expr: exprVal,
        raw: rawCount,
        canvasX: spotCanvasX,
        canvasY: spotCanvasY
      });
    } else {
      setHoveredSpot(null);
    }
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    setHoveredSpot(null);
  };

  const activePatientInfo = useMemo(() => {
    return patientsList.find(p => p.id === selectedPatient);
  }, [patientsList, selectedPatient]);

  const offset = getCanvasOffset();

  let aiCtx: any = null;
  try {
    aiCtx = useAIContext();
  } catch (e) {}

  const handleAskCopilotSpatial = () => {
    if (aiCtx) {
      const q = activeGene
        ? `Where is ${activeGene} expressed spatially in Visium section ${selectedPatient}?`
        : `What spatial gene expression patterns are observed in section ${selectedPatient}?`;
      aiCtx.sendMessage(q, "spatial_localization");
      aiCtx.setChatOpen(true);
    }
  };

  interface SpatialExportOptions {
    theme?: "light" | "dark";
    size?: number;
    layer?: "overlay" | "he_only" | "spots_only";
    viewScope?: "full" | "zoomed";
  }

  const generateHighResSpatialCanvas = ({
    theme = "light",
    size = 2400,
    layer = "overlay",
    viewScope = "full"
  }: SpatialExportOptions = {}): HTMLCanvasElement => {
    const offscreen = document.createElement("canvas");
    offscreen.width = size;
    offscreen.height = size;
    const ctx = offscreen.getContext("2d");
    if (!ctx || !metadata) return offscreen;

    const isLight = theme === "light";
    const isZoomed = viewScope === "zoomed" && zoom > 1.0;

    // 1. Background Fill
    ctx.fillStyle = isLight ? "#ffffff" : "#020617";
    ctx.fillRect(0, 0, size, size);

    const exprActualMax = exprVec ? Math.max(...Array.from(exprVec)) : 0;

    // 2. Title & Subtitle Header
    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 54px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "left";
    const layerTitle = layer === "he_only" 
      ? "H&E Tissue Histology Slide" 
      : layer === "spots_only" 
        ? "Spatial Gene Expression Spot Map" 
        : "Spatial Transcriptomics Atlas (10x Visium)";
    ctx.fillText(layerTitle, 80, 85);

    ctx.fillStyle = isLight ? "#334155" : "#94a3b8";
    ctx.font = "bold 30px monospace";
    const zoomText = isZoomed ? ` · Region of Interest (${Math.round(zoom * 100)}% Zoom ROI)` : " · Full Slide Overview (1x)";
    const sub = `Sample: ${selectedPatient} · ${metadata.spots.length.toLocaleString()} Spots · Gene: ${activeGene || "None"}${zoomText}`;
    ctx.fillText(sub, 80, 136);

    // 3. Layout Dimensions
    const padLeft = 90;
    const padTop = 180;
    const plotW = 1520;
    const plotH = 2140;

    const legendLeft = 1650;
    const legendTop = 180;
    const legendW = 670;
    const legendH = 2140;

    const imgW = metadata.image_size[0] || 578;
    const imgH = metadata.image_size[1] || 600;

    // Visible ROI coordinates in world space
    let minWorldX = 0;
    let minWorldY = 0;
    let roiW = imgW;
    let roiH = imgH;

    if (isZoomed) {
      minWorldX = Math.max(0, -pan.x / zoom);
      minWorldY = Math.max(0, -pan.y / zoom);
      roiW = Math.min(imgW - minWorldX, imgW / zoom);
      roiH = Math.min(imgH - minWorldY, imgH / zoom);
    }

    // Coordinate mapping into spatial box maintaining aspect ratio
    const scale = Math.min(plotW / roiW, plotH / roiH);
    const offsetX = padLeft + (plotW - roiW * scale) / 2;
    const offsetY = padTop + (plotH - roiH * scale) / 2;

    // 4. Draw H&E Tissue Background (if not spots_only)
    if (layer !== "spots_only") {
      const activeImg = hiresLoaded && hiresImgRef.current ? hiresImgRef.current : lowresImgRef.current;
      if (activeImg) {
        if (isZoomed) {
          const srcScaleX = activeImg.naturalWidth / imgW;
          const srcScaleY = activeImg.naturalHeight / imgH;
          ctx.drawImage(
            activeImg,
            minWorldX * srcScaleX,
            minWorldY * srcScaleY,
            roiW * srcScaleX,
            roiH * srcScaleY,
            offsetX,
            offsetY,
            roiW * scale,
            roiH * scale
          );
        } else {
          ctx.drawImage(activeImg, offsetX, offsetY, imgW * scale, imgH * scale);
        }
      } else {
        ctx.fillStyle = isLight ? "#f1f5f9" : "#0f172a";
        ctx.fillRect(offsetX, offsetY, roiW * scale, roiH * scale);
      }
    } else {
      ctx.fillStyle = isLight ? "#f8fafc" : "#020617";
      ctx.fillRect(offsetX, offsetY, roiW * scale, roiH * scale);
      ctx.strokeStyle = isLight ? "#e2e8f0" : "#1e293b";
      ctx.lineWidth = 2;
      ctx.strokeRect(offsetX, offsetY, roiW * scale, roiH * scale);
    }

    // 5. Draw Visium Spots (if not he_only)
    if (layer !== "he_only") {
      const spotRadius = (metadata.spot_diameter_lowres / 2) * scale;
      metadata.spots.forEach((spot, idx) => {
        if (isZoomed) {
          if (
            spot.x < minWorldX - metadata.spot_diameter_lowres ||
            spot.x > minWorldX + roiW + metadata.spot_diameter_lowres ||
            spot.y < minWorldY - metadata.spot_diameter_lowres ||
            spot.y > minWorldY + roiH + metadata.spot_diameter_lowres
          ) {
            return;
          }
        }

        const px = offsetX + (spot.x - minWorldX) * scale;
        const py = offsetY + (spot.y - minWorldY) * scale;

        ctx.beginPath();
        ctx.arc(px, py, spotRadius, 0, 2 * Math.PI);

        if (viewMode === "expression" && exprVec) {
          const val = exprVec[idx] || 0.0;
          ctx.fillStyle = getExpressionColor(val, exprCap, spotOpacity);
          ctx.fill();
          ctx.strokeStyle = isLight ? "rgba(15,23,42,0.2)" : "rgba(255,255,255,0.25)";
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          ctx.strokeStyle = `rgba(244, 63, 94, ${spotOpacity})`;
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.fillStyle = `rgba(244, 63, 94, ${spotOpacity * 0.25})`;
          ctx.fill();
        }
      });
    }

    // 6. Draw Dedicated Legend Panel on the Right
    ctx.fillStyle = isLight ? "#f8fafc" : "#0b1329";
    ctx.fillRect(legendLeft, legendTop, legendW, legendH);
    ctx.strokeStyle = isLight ? "#cbd5e1" : "#1e293b";
    ctx.lineWidth = 3;
    ctx.strokeRect(legendLeft, legendTop, legendW, legendH);

    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 42px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Spatial Expression Key", legendLeft + 36, legendTop + 65);

    if (viewMode === "expression" && activeGene && exprVec && layer !== "he_only") {
      // Color Bar (Large Plasma Gradient)
      const barX = legendLeft + 40;
      const barY = legendTop + 130;
      const barW = legendW - 80;
      const barH = 52;

      const grad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
      grad.addColorStop(0, "rgb(13, 8, 135)");     // Dark Blue (Min)
      grad.addColorStop(0.25, "rgb(76, 12, 50)");  // Purple
      grad.addColorStop(0.5, "rgb(182, 54, 121)"); // Magenta/Orange (Mid)
      grad.addColorStop(0.75, "rgb(241, 136, 18)");// Orange
      grad.addColorStop(1, "rgb(252, 253, 191)");  // Yellow (Max)

      ctx.fillStyle = grad;
      ctx.fillRect(barX, barY, barW, barH);
      ctx.strokeStyle = isLight ? "#0f172a" : "#64748b";
      ctx.lineWidth = 3;
      ctx.strokeRect(barX, barY, barW, barH);

      // Ticks & Labels
      ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
      ctx.font = "bold 32px monospace";
      ctx.textAlign = "center";

      ctx.fillText("0.00 (Min)", barX + 50, barY + barH + 42);
      ctx.fillText((exprCap / 2).toFixed(2), barX + barW / 2, barY + barH + 42);
      ctx.fillText(`${exprCap.toFixed(2)} (Max)`, barX + barW - 60, barY + barH + 42);

      ctx.fillStyle = isLight ? "#475569" : "#94a3b8";
      ctx.font = "bold 24px monospace";
      ctx.fillText("log1p(Normalized UMI / 10K)", barX + barW / 2, barY + barH + 82);

      // Positive Spot Metrics Box
      let positiveCount = 0;
      let sumPositive = 0;
      exprVec.forEach(val => {
        if (val > 0) {
          positiveCount++;
          sumPositive += val;
        }
      });
      const meanPos = positiveCount > 0 ? (sumPositive / positiveCount).toFixed(2) : "0.00";
      const pctPos = ((positiveCount / metadata.spots.length) * 100).toFixed(1);

      const statsY = barY + barH + 120;
      const statsH = 390;
      ctx.fillStyle = isLight ? "#f1f5f9" : "#020617";
      ctx.fillRect(barX, statsY, barW, statsH);
      ctx.strokeStyle = isLight ? "#cbd5e1" : "#1e293b";
      ctx.lineWidth = 2.5;
      ctx.strokeRect(barX, statsY, barW, statsH);

      ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
      ctx.font = "bold 34px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("Spot Expression Metrics", barX + 28, statsY + 52);

      ctx.font = "bold 26px sans-serif";
      ctx.fillStyle = isLight ? "#475569" : "#94a3b8";
      ctx.fillText("Positive Spots:", barX + 28, statsY + 108);
      ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
      ctx.font = "bold 28px monospace";
      ctx.fillText(`${positiveCount.toLocaleString()} / ${metadata.spots.length.toLocaleString()} (${pctPos}%)`, barX + 28, statsY + 146);

      ctx.font = "bold 26px sans-serif";
      ctx.fillStyle = isLight ? "#475569" : "#94a3b8";
      ctx.fillText("Mean Log-Expr (Pos):", barX + 28, statsY + 208);
      ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
      ctx.font = "bold 28px monospace";
      ctx.fillText(`${meanPos} log1p(Float16)`, barX + 28, statsY + 246);

      ctx.font = "bold 26px sans-serif";
      ctx.fillStyle = isLight ? "#475569" : "#94a3b8";
      ctx.fillText("Maximum Observed:", barX + 28, statsY + 308);
      ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
      ctx.font = "bold 28px monospace";
      ctx.fillText(`${exprActualMax.toFixed(2)} log1p(Float16)`, barX + 28, statsY + 346);
    }

    // Sample Metadata Info Card (Bottom of legend panel)
    const cardY = legendTop + (viewMode === "expression" && activeGene && layer !== "he_only" ? 690 : 130);
    const cardH = 420;
    const barX = legendLeft + 40;
    const barW = legendW - 80;

    ctx.fillStyle = isLight ? "#f1f5f9" : "#020617";
    ctx.fillRect(barX, cardY, barW, cardH);
    ctx.strokeStyle = isLight ? "#cbd5e1" : "#1e293b";
    ctx.lineWidth = 2.5;
    ctx.strokeRect(barX, cardY, barW, cardH);

    ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
    ctx.font = "bold 34px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Sample Metadata", barX + 28, cardY + 52);

    const metaRows = [
      ["Sample ID:", selectedPatient],
      ["Pathology:", "Pancreatic Ductal Adenocarcinoma"],
      ["Platform:", "10x Genomics Visium Spatial (FFPE)"],
      ["Layer Rendered:", layer === "he_only" ? "H&E Histology Only" : layer === "spots_only" ? "Spatial Spots Only" : "Full Histology + Spots Overlay"],
      ["View Scope:", isZoomed ? `Zoomed ROI (${Math.round(zoom * 100)}%)` : "Full Slide Overview (1x)"],
      ["Total Spots:", `${metadata.spots.length.toLocaleString()} in-tissue spots`]
    ];

    metaRows.forEach(([k, v], i) => {
      const rowY = cardY + 98 + i * 52;
      ctx.font = "bold 20px sans-serif";
      ctx.fillStyle = isLight ? "#475569" : "#94a3b8";
      ctx.fillText(k, barX + 28, rowY);

      ctx.font = "bold 20px monospace";
      ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
      ctx.fillText(v, barX + 28, rowY + 24);
    });

    return offscreen;
  };

  const canvasWidth = metadata?.image_size[0] || 578;
  const canvasHeight = metadata?.image_size[1] || 600;

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
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleAskCopilotSpatial}
            className="bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 px-3 py-1.5 rounded-lg border border-cyan-700/60 transition font-medium text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
            title="Ask PDACopilot about spatial localization"
          >
            <Bot className="w-3.5 h-3.5 text-cyan-400" />
            <span>Ask PDACopilot</span>
          </button>
          <div className="text-xxs text-slate-500 font-mono bg-slate-900 border border-slate-800 px-2 py-1 rounded">
            Resource version: 1.0
          </div>
        </div>
      </header>


      {/* Main Layout Grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 overflow-hidden">
        
        {/* Left Panel - H&E Canvas */}
        <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between items-center shadow-lg relative min-h-[500px]" ref={containerRef}>
          <div className="w-full flex items-center justify-between mb-3 text-xs text-slate-400 border-b border-slate-800/60 pb-2 font-mono">
            <span className="flex items-center gap-1.5"><Layers className="h-3.5 w-3.5 text-rose-500" /> Interactive Spatial View (10x Visium)</span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-500">Sample: <strong className="text-teal-400">{selectedPatient}</strong></span>
              
              {/* Quick Layer / ROI Export Dropdown */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 font-mono text-xxs">
                <button
                  type="button"
                  onClick={() => {
                    const canvas = generateHighResSpatialCanvas({ layer: "overlay", viewScope: "full", theme: "light" });
                    exportCanvasToPNG({ canvas, filename: `Spatial_${selectedPatient}_${activeGene || "spots"}_Overlay.png` });
                  }}
                  title="Download Full Slide with H&E and Spatial Spot Overlay"
                  className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-teal-300 rounded border border-slate-750 transition flex items-center gap-1 cursor-pointer"
                >
                  <Download className="w-3 h-3 text-teal-400" />
                  <span>Overlay</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const canvas = generateHighResSpatialCanvas({ layer: "he_only", viewScope: "full", theme: "light" });
                    exportCanvasToPNG({ canvas, filename: `Histology_${selectedPatient}_HnE_Only.png` });
                  }}
                  title="Download Clean High-Resolution H&E Tissue Histology (No Spots)"
                  className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded border border-slate-750 transition flex items-center gap-1 cursor-pointer"
                >
                  <Layers className="w-3 h-3 text-rose-400" />
                  <span>H&amp;E Only</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const canvas = generateHighResSpatialCanvas({ layer: "spots_only", viewScope: "full", theme: "light" });
                    exportCanvasToPNG({ canvas, filename: `SpatialSpots_${selectedPatient}_${activeGene || "grid"}_Only.png` });
                  }}
                  title="Download Pure Spatial Expression Spots (No H&E Background)"
                  className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded border border-slate-750 transition flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>Spots Only</span>
                </button>

                {zoom > 1.0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const canvas = generateHighResSpatialCanvas({ layer: "overlay", viewScope: "zoomed", theme: "light" });
                      exportCanvasToPNG({ canvas, filename: `SpatialROI_${selectedPatient}_${activeGene || "zoom"}_${Math.round(zoom * 100)}pct.png` });
                    }}
                    title="Download Cropped High-Resolution Zoomed Region of Interest (ROI)"
                    className="px-2 py-1 bg-rose-950/80 hover:bg-rose-900 text-rose-300 rounded border border-rose-700/60 transition flex items-center gap-1 cursor-pointer"
                  >
                    <ZoomIn className="w-3 h-3 text-rose-400" />
                    <span>Zoomed ROI ({Math.round(zoom * 100)}%)</span>
                  </button>
                )}
              </div>

              <ExportButton
                label="Full Export"
                disabled={!metadata}
                onExportCSV={() => {
                  if (!metadata) return;
                  exportToCSV({
                    filename: `GSE274103_${selectedPatient}_SpotMetadata_${activeGene || "All"}.csv`,
                    metadata: {
                      dataset: "GSE274103 Spatial Transcriptomics",
                      module: "Spatial Spot Explorer",
                      selectedGene: activeGene || "None",
                      filters: `Patient Sample: ${selectedPatient}, Total Spots: ${metadata.spots.length}`,
                    },
                    headers: ["Spot ID", "Patient ID", "Row", "Col", "Pixel X", "Pixel Y", activeGene ? `${activeGene} Expression (log1p Float16)` : "Gene Expression"],
                    rows: metadata.spots.map((spot, idx) => [
                      spot.id,
                      selectedPatient,
                      spot.r,
                      spot.c,
                      spot.x,
                      spot.y,
                      exprVec ? Number((exprVec[idx] || 0).toFixed(4)) : 0,
                    ]),
                  });
                }}
                onExportPNG={({ theme = "light" } = {}) => {
                  const exportCanvas = generateHighResSpatialCanvas({ theme, size: 2400, layer: "overlay", viewScope: zoom > 1.0 ? "zoomed" : "full" });
                  exportCanvasToPNG({
                    canvas: exportCanvas,
                    filename: `Spatial_${selectedPatient}_${activeGene || viewMode}.png`,
                    theme,
                  });
                }}
                onExportSVG={({ theme = "light" } = {}) => {
                  const exportCanvas = generateHighResSpatialCanvas({ theme, size: 1200, layer: "overlay", viewScope: zoom > 1.0 ? "zoomed" : "full" });
                  exportCanvasToSVG({
                    canvas: exportCanvas,
                    filename: `Spatial_${selectedPatient}_${activeGene || viewMode}.svg`,
                    theme,
                  });
                }}
              />
            </div>
          </div>

          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500"></div>
              <span className="text-sm text-slate-400 font-mono">Loading dataset matrices...</span>
            </div>
          ) : (
            <div className="relative w-full max-w-[500px] flex-1 flex items-center justify-center p-2">
              
              {/* Zoom & Pan Overlay Toolbar */}
              <div className="absolute top-4 right-4 flex items-center gap-1 bg-slate-950/90 border border-slate-800 rounded-lg p-1 shadow-xl z-30 font-mono text-xs">
                <button
                  type="button"
                  onClick={handleZoomIn}
                  title="Zoom In (+)"
                  className="p-1.5 hover:bg-slate-800 rounded text-slate-300 hover:text-white transition cursor-pointer"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleZoomOut}
                  title="Zoom Out (-)"
                  className="p-1.5 hover:bg-slate-800 rounded text-slate-300 hover:text-white transition cursor-pointer"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleResetView}
                  title="Reset View (100%)"
                  className="p-1.5 hover:bg-slate-800 rounded text-slate-300 hover:text-white transition flex items-center gap-1 text-xxs px-2 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3 text-rose-400" />
                  <span>Reset</span>
                </button>
                <span className="border-l border-slate-800 pl-2 pr-1.5 text-xxs text-teal-400 font-semibold">
                  {Math.round(zoom * 100)}%
                </span>
                <span className="text-xxs px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                  {zoom > 1.25 && hiresLoaded ? "H&E Hires Native (1926px)" : "H&E Overview"}
                </span>

                {zoom > 1.0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const canvas = generateHighResSpatialCanvas({ layer: "overlay", viewScope: "zoomed", theme: "light" });
                      exportCanvasToPNG({ canvas, filename: `SpatialROI_${selectedPatient}_${activeGene || "zoom"}_${Math.round(zoom * 100)}pct.png` });
                    }}
                    title="Quick Download Current Zoomed View"
                    className="ml-1 px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-xxs font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                    <span>Save ROI</span>
                  </button>
                )}
              </div>

              <canvas
                ref={canvasRef}
                width={canvasWidth}
                height={canvasHeight}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                className={`rounded border border-slate-700 bg-slate-950 shadow-inner w-full h-auto aspect-[${canvasWidth}/${canvasHeight}] max-h-[650px] ${zoom > 1.0 ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair"}`}
              />
              
              {/* Overlay Tooltip */}
              {hoveredSpot && (
                <div 
                  className="absolute pointer-events-none bg-slate-950/95 border border-slate-700 rounded-lg p-3 text-xs shadow-2xl text-slate-200 z-50 min-w-[210px] font-mono"
                  style={{
                    left: `${(hoveredSpot.canvasX / canvasWidth) * offset.width + 15}px`,
                    top: `${(hoveredSpot.canvasY / canvasHeight) * offset.height - 40}px`
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
              <p className="font-semibold">Interactive Zoom/Pan & High-Resolution H&E Tissue Viewer</p>
              <p className="mt-0.5 text-slate-400 leading-relaxed font-mono text-xxs">
                Scroll mouse wheel or use zoom controls to inspect native Space Ranger high-definition tissue morphology (1926x2000 px). Spot overlays remain 100% registered.
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

      {/* Quantitative Cross-Patient Spatial Comparison Section */}
      {activeGene && selectedGeneInfo && (
        <div className="px-6 pb-8">
          <SpatialCrossPatientPlot
            geneSymbol={activeGene}
            ensemblId={selectedGeneInfo.e}
            metrics={cohortMetrics}
            selectedPatient={selectedPatient}
            onSelectPatient={(pId) => setSelectedPatient(pId)}
            isLoading={loadingCohort}
          />
        </div>
      )}
    </div>
  );
}
