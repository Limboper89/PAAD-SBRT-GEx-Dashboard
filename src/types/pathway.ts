// pathway.ts - Comprehensive TypeScript definitions for Pathway Explorer Module

export type PathwayDatabaseType = "Hallmark" | "Reactome" | "GO_BP" | "GO Biological Process" | "KEGG_External";

export interface DatabaseProvenance {
  database: string;
  version: string;
  species: string;
  identifier: string;
  retrievalDate: string;
  sourceUrl: string;
  license: string;
  redistributionStatus: "permitted" | "external_only" | "restricted";
}

export interface PathwayGeneSet {
  id: string;            // e.g. "HALLMARK_KRAS_SIGNALING_UP", "REACTOME_R-HSA-5663205"
  name: string;          // Human-readable title
  database: PathwayDatabaseType;
  category?: string;
  description?: string;
  externalUrl?: string;
  genes: string[];       // HGNC Gene symbols
}

export interface PathwayCollectionManifest {
  database: PathwayDatabaseType;
  provenance: DatabaseProvenance;
  pathwayCount: number;
  totalGenes: number;
  dataPath: string;
}

export interface PathwayDatabaseIndex {
  version: string;
  createdAt: string;
  collections: PathwayCollectionManifest[];
}

export interface PathwayGeneExpressionDetail {
  symbol: string;
  log2FC: number;
  pValue: number;
  adjPValue?: number;
  isSignificant: boolean;
  isLeadingEdge?: boolean;
}

export interface GSEACurvePoint {
  rankIndex: number;      // 0..N-1 position in ranked list
  runningES: number;      // Running ES score at this rank
  rankMetric: number;     // e.g. Log2FC or signed -log10(p)
  symbol?: string;        // Gene symbol if hit
  isHit?: boolean;        // True if gene is member of set
  isLeadingEdge?: boolean;// True if gene is in leading edge
}

export interface GSEACurveData {
  curvePoints: GSEACurvePoint[]; // Downsampled vector (e.g. 150-300 points for crisp SVG plot)
  geneHitsIndices: number[];     // Rank indices (0..N-1) of all pathway members
  leadingEdgeIndices: number[];  // Rank indices (0..N-1) of leading-edge genes
  peakIndex: number;             // Index where max/min ES peak occurs
  totalTranscriptomeSize: number;// Total N ranked genes
}

export interface PathwayEnrichmentResult {
  pathwayId: string;
  pathwayName: string;
  database: PathwayDatabaseType;
  databaseVersion: string;
  description?: string;
  externalUrl?: string;
  analysisMode: "ORA" | "GSEA";
  
  // ORA & GSEA P-value metrics
  pValue: number;
  adjPValue: number;      // Benjamini-Hochberg FDR
  
  // ORA Specific Metrics
  overlapCount?: number;
  geneSetSize?: number;
  overlapRatio?: number;   // overlapCount / geneSetSize
  foldEnrichment?: number; // (k / n) / (K / N)
  
  // GSEA Specific Metrics
  enrichmentScore?: number; // Raw ES
  nes?: number;             // Normalized Enrichment Score
  leadingEdgeCount?: number;
  
  direction: "Upregulated" | "Downregulated" | "Enriched";
  datasetId: string;
  datasetName: string;
  comparisonLabel: string;
  
  contributingGenes: string[];    // Mapped overlapping symbols
  leadingEdgeGenes?: string[];    // Symbols in GSEA core enrichment
  geneExpressionDetails?: PathwayGeneExpressionDetail[];
  gseaCurveData?: GSEACurveData;
}

export interface MappingQC {
  inputGeneCount: number;
  mappedGeneCount: number;
  unmappedGeneCount: number;
  mappingRate: number;            // mapped / input
  unmappedSymbols: string[];
  duplicateSymbolsCount: number;
  backgroundUniverseSize: number;
  backgroundSource: string;
}

export interface PathwayAnalysisSummary {
  analysisMode: "ORA" | "GSEA";
  datasetId: string;
  datasetName: string;
  comparisonLabel: string;
  databaseFilter: string;
  totalPathwaysTested: number;
  significantPathwaysCount: number;
  mappingQC: MappingQC;
  fdrThreshold: number;
  minOverlap: number;
  minGeneSetSize: number;
  maxGeneSetSize: number;
  results: PathwayEnrichmentResult[];
  provenanceList: DatabaseProvenance[];
}

// Interfaces for future extensions (Sample, Cell-type, Spatial Pathway Activity Scores)
export interface SamplePathwayScore {
  sampleId: string;
  sampleGroup: string;
  score: number; // e.g. ssGSEA / GSVA enrichment score
}

export interface CellTypePathwayScore {
  cellType: string;
  meanScore: number;
  percentPositive: number;
}

export interface SpatialSpotPathwayScore {
  spotId: string;
  x: number;
  y: number;
  score: number;
}

export interface FuturePathwayScoreExtension {
  method: "GSVA" | "ssGSEA" | "UCell";
  sampleScores?: SamplePathwayScore[];
  cellTypeScores?: CellTypePathwayScore[];
  spatialScores?: SpatialSpotPathwayScore[];
}
