# PDAC BioPortal & PDACopilot 🧬🤖
### Interactive Transcriptomic Analytics & AI Research Copilot for Pancreatic Ductal Adenocarcinoma

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.22149338.svg)](https://doi.org/10.5281/zenodo.22149338)
[![Live Portal](https://img.shields.io/badge/Live%20Portal-GitHub%20Pages-blue.svg)](https://limboper89.github.io/PAAD-SBRT-GEx-Dashboard/)
[![Release](https://img.shields.io/badge/Release-v1.2.0-green.svg)](https://github.com/Limboper89/PAAD-SBRT-GEx-Dashboard/releases/tag/v1.2.0)

PDAC BioPortal is an interactive multi-modal transcriptomics analytics platform built with **Next.js 16**, **React 19**, **TypeScript**, and **Tailwind CSS**. It includes **PDACopilot**, a context-aware scientific AI assistant designed for pancreatic cancer research.

---

## 🌟 Key Features & Datasets

1. **Bulk RNA-seq Radiotherapy Atlas (GSE225767)**:
   - Differential expression analysis (Volcano plots, Heatmaps, Boxplots) for paired SBRT Pre vs Post treatment response.
2. **TCGA-PAAD vs GTEx Pancreas Normal Reference**:
   - 349-sample tumor vs normal reference dataset using high-performance Float32 binary matrix memory indexing.
3. **PDAC Single-Nucleus Reference Atlas (GSE202051)**:
   - Interactive UMAP embeddings and cell-lineage expression for 224,988 single nuclei across 43 patient samples.
4. **Patient Tumor Spatial Transcriptomics (GSE274103)**:
   - Spot-level expression mapping, Visium tissue coordinates, and H&E histology overlays.
5. **PDACopilot (Context-Aware AI Assistant)**:
   - **Live Context Inspector**: Automatically tracks active module, dataset, gene, figure, heatmap panel, and filter cutoffs.
   - **Evidence Checklist Tags**: Categorizes output into `[Portal Observation]`, `[Published Biological Knowledge]`, and `[Hypothesis]` with explicit data evidence tags (`✓ TCGA`, `✓ SBRT`, `✓ Single Nucleus`, `✗ Spatial`).
   - **Conservative Cross-Module Reasoning**: Aggregates multi-dataset insights with statistical caution disclaimers.
   - **Reproducible Summary Export**: Downloads `.md` summaries complete with portal version, dataset build numbers, timestamp, and active filter parameters.
   - **100% Decoupled**: All plots, exports, heatmaps, and spatial viewers operate 100% offline independently of the AI layer.

---

## 🚀 Quickstart Guide for Local Testing

Follow these steps to set up and run the application locally on any lab machine.

### 1. Prerequisites
Ensure the following software is installed on your machine:
- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **npm**: v9.0.0 or higher

Check your installed versions by running:
```bash
node -v
npm -v
```

---

### 2. Installation

1. Copy or clone the project directory to your desired location:
   ```bash
   cd /path/to/PAAD-SBRT-GEx-Dashboardolder
   ```

2. Install all node dependencies:
   ```bash
   npm install
   ```

---

### 3. Running the Local Development Server

Start the Next.js development server:
```bash
npm run dev
```

Once started, open your web browser and navigate to:
👉 **[http://localhost:3000](http://localhost:3000)**

*(If running on a remote lab workstation over SSH, access `http://<IP_ADDRESS>:3000`)*.

---

## 🧪 Testing Guide for Lab Testers

### Testing Module Analytics & Visualizations
1. **Study & Dataset Selection**: Use the header dropdown to switch between *GSE225767 Bulk*, *TCGA-PAAD vs GTEx*, *GSE202051 Single Nucleus*, and *GSE274103 Spatial*.
2. **Gene Selection & Search**: Type any gene symbol (e.g., `NFE2L2`, `PHGDH`, `S100P`, `PRSS1`) in the top search bar or click points directly on the Volcano Plot.
3. **Interactive Visualizations**:
   - **Volcano Plot**: Click any DEG dot to isolate boxplots and sync across all tabs.
   - **Heatmap**: Hover over matrix cells for exact expression values; export canvas as PNG or SVG.
   - **Correlation Scatter Plot**: Select two genes to inspect Spearman/Pearson correlation.
   - **Single-Nucleus Atlas**: Filter by broad cell lineage (Epithelial, Fibroblast, Immune, Endothelial) on the UMAP canvas.
   - **Spatial Transcriptomics**: Toggle Visium spot overlays on H&E histological images.

### Testing PDACopilot (AI Assistant)
1. **Opening PDACopilot**: Click the floating glowing button at the bottom-right of the viewport.
2. **Live Context Inspector**: Expand the inspector at the top of the chat drawer to confirm it displays your active gene, module, dataset, figure, and filter cutoffs in real time.
3. **Scientific Quick Actions**: Click buttons like:
   - `Explain NFE2L2`
   - `Summarize module`
   - `Known pathways`
   - `Cross-module summary`
   - `Generate manuscript text`
4. **Evidence Tags & Confidence**: Confirm responses display the **Evidence Used** checklist (`✓ TCGA-GTEx`, `✓ SBRT`, `✓ Single Nucleus`, `Confidence: High`).
5. **Downloading AI Summaries**: Click the download icon in the drawer header to save a reproducible `.md` summary report with full metadata.

---

## 📂 Project Structure

```
├── public/
│   └── data/                 # Static datasets (CSV, JSON, Float32 binary matrix buffers)
├── src/
│   ├── app/
│   │   ├── layout.tsx        # Global layout wrapping AIProvider and AI UI components
│   │   ├── page.tsx          # Main dashboard container & state synchronization
│   │   └── globals.css       # Tailwind CSS & glassmorphism styles
│   └── components/
│       ├── ai/               # PDACopilot AI Assistant Suite
│       │   ├── AIProvider.tsx         # Global React context provider
│       │   ├── AIChatPanel.tsx        # Resizable floating drawer UI
│       │   ├── AIButton.tsx           # Fixed bottom-right trigger FAB
│       │   ├── CurrentContextPanel.tsx# Live context inspector
│       │   ├── ChatMessage.tsx        # Custom markdown & evidence tag renderer
│       │   ├── QuickActions.tsx       # Scientific action triggers grid
│       │   ├── PromptBuilder.ts       # Structured prompt generator & metadata exporter
│       │   ├── AIClient.ts            # Network client for API proxy
│       │   ├── aiConfig.ts            # AI provider configuration interface
│       │   └── TypingIndicator.tsx    # Animated loader
│       ├── VolcanoPlot.tsx   # Interactive volcano plot
│       ├── Heatmap.tsx       # Matrix heatmap renderer
│       ├── CorrelationPlot.tsx# Gene correlation scatter plot
│       ├── SingleNucleusExplorer.tsx # UMAP canvas & single-cell inspector
│       ├── SpatialPrototypeView.tsx  # Visium spatial viewer
│       └── ExportButton.tsx  # PNG, SVG, and CSV export utilities
├── package.json
├── next.config.ts
└── tsconfig.json
```

---

## 🛠️ Verification & Build Commands

- **Type-checking**:
  ```bash
  npx tsc --noEmit
  ```
- **Production Build (Verification)**:
  ```bash
  npm run build
  ```
- **Production Local Server**:
  ```bash
  npm run start
  ```

---

## 📄 Target Publication Reference
This platform accompanies manuscript submission for:
**Nature Communications**

*PDAC BioPortal v1.2.0 — Context-Aware Transcriptomic Analytics & PDACopilot AI Assistant.*
- **Permanent Archive / DOI**: [10.5281/zenodo.22149338](https://doi.org/10.5281/zenodo.22149338)
- **Live Deployment**: [https://limboper89.github.io/PAAD-SBRT-GEx-Dashboard/](https://limboper89.github.io/PAAD-SBRT-GEx-Dashboard/)
