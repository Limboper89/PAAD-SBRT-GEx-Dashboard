/**
 * Export Utilities for PDAC BioPortal Publication Export Suite
 */

export interface ExportMetadata {
  dataset?: string;
  module?: string;
  selectedGene?: string | null;
  filters?: string;
  portalVersion?: string;
  [key: string]: string | number | undefined | null;
}

/**
 * Export tabular data to CSV with standardized BioPortal metadata header.
 */
export function exportToCSV({
  filename,
  metadata = {},
  headers,
  rows,
}: {
  filename: string;
  metadata?: ExportMetadata;
  headers: string[];
  rows: (string | number | boolean | null | undefined)[][];
}) {
  const now = new Date();
  const dateStr = now.toLocaleString();

  const metaLines = [
    `# PDAC BioPortal -- Publication Data Export`,
    `# Portal Version: ${metadata.portalVersion || "1.0"}`,
    `# Export Date: ${dateStr}`,
    metadata.dataset ? `# Dataset: ${metadata.dataset}` : null,
    metadata.module ? `# Module: ${metadata.module}` : null,
    metadata.selectedGene ? `# Selected Gene: ${metadata.selectedGene}` : null,
    metadata.filters ? `# Filters: ${metadata.filters}` : null,
    ...Object.entries(metadata)
      .filter(([k]) => !["dataset", "module", "selectedGene", "filters", "portalVersion"].includes(k))
      .map(([k, v]) => `# ${k}: ${v ?? "N/A"}`),
    ``, // empty line separator
  ].filter(Boolean) as string[];

  const formatCell = (val: string | number | boolean | null | undefined): string => {
    if (val === null || val === undefined) return '""';
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerRow = headers.map(formatCell).join(",");
  const dataRows = rows.map((r) => r.map(formatCell).join(","));

  const csvContent = [...metaLines, headerRow, ...dataRows].join("\n");
  const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename.endsWith(".csv") ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export HTML Canvas element to High-Res 300 DPI PNG with metadata header banner.
 */
export function exportCanvasToPNG({
  canvas,
  filename,
  title,
  subtitle,
  bgColor = "#020617", // Slate 950
}: {
  canvas: HTMLCanvasElement;
  filename: string;
  title: string;
  subtitle?: string;
  bgColor?: string;
}) {
  // High-res publication scale (3000px minimum target width)
  const targetWidth = Math.max(3000, canvas.width * 2);
  const scale = targetWidth / canvas.width;
  
  // Font sizes scaled proportionally
  const fontBrandSize = Math.round(14 * scale);
  const fontTitleSize = Math.round(22 * scale);
  const fontSubtitleSize = Math.round(13 * scale);
  
  const padLeft = Math.round(30 * scale);
  const padTop = Math.round(25 * scale);
  
  const line1Y = padTop + fontBrandSize;
  const line2Y = line1Y + Math.round(10 * scale) + fontTitleSize;
  const line3Y = subtitle ? line2Y + Math.round(10 * scale) + fontSubtitleSize : line2Y;
  
  const headerHeight = Math.round(line3Y + Math.round(25 * scale));
  const targetHeight = Math.round(canvas.height * scale + headerHeight);

  const offscreen = document.createElement("canvas");
  offscreen.width = targetWidth;
  offscreen.height = targetHeight;
  const ctx = offscreen.getContext("2d");
  if (!ctx) return;

  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, targetWidth, targetHeight);

  // Header Banner Background
  ctx.fillStyle = "#0f172a"; // Slate 900
  ctx.fillRect(0, 0, targetWidth, headerHeight);
  
  // Header Border Line
  ctx.strokeStyle = "#1e293b"; // Slate 800
  ctx.lineWidth = Math.max(2, Math.round(2 * scale));
  ctx.beginPath();
  ctx.moveTo(0, headerHeight);
  ctx.lineTo(targetWidth, headerHeight);
  ctx.stroke();

  // 1. Brand Tag
  ctx.fillStyle = "#38bdf8"; // Sky 400
  ctx.font = `bold ${fontBrandSize}px sans-serif`;
  ctx.fillText("PDAC BIOPORTAL — PUBLICATION FIGURE", padLeft, line1Y);

  // 2. Figure Title
  ctx.fillStyle = "#f8fafc"; // Slate 50
  ctx.font = `bold ${fontTitleSize}px sans-serif`;
  ctx.fillText(title, padLeft, line2Y);

  // 3. Figure Subtitle
  if (subtitle) {
    ctx.fillStyle = "#94a3b8"; // Slate 400
    ctx.font = `${fontSubtitleSize}px monospace`;
    ctx.fillText(subtitle, padLeft, line3Y);
  }

  // Draw main plot canvas content strictly BELOW headerHeight
  ctx.drawImage(canvas, 0, headerHeight, canvas.width * scale, canvas.height * scale);

  // Trigger PNG download
  offscreen.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename.endsWith(".png") ? filename : `${filename}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, "image/png");
}

/**
 * Export Canvas visualization to SVG vector wrapper format.
 */
export function exportCanvasToSVG({
  canvas,
  filename,
  title,
  subtitle,
}: {
  canvas: HTMLCanvasElement;
  filename: string;
  title: string;
  subtitle?: string;
}) {
  const dataUrl = canvas.toDataURL("image/png");
  const width = canvas.width;
  const headerHeight = subtitle ? 115 : 90;
  const height = canvas.height + headerHeight;

  const svgContent = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>
    .bg { fill: #020617; }
    .header-bg { fill: #0f172a; stroke: #1e293b; stroke-width: 1.5; }
    .brand { font-family: system-ui, sans-serif; font-weight: bold; font-size: 11px; fill: #38bdf8; letter-spacing: 0.5px; }
    .title { font-family: system-ui, sans-serif; font-weight: bold; font-size: 16px; fill: #f8fafc; }
    .subtitle { font-family: monospace; font-size: 11px; fill: #94a3b8; }
  </style>
  <rect class="bg" width="100%" height="100%" />
  <rect class="header-bg" width="100%" height="${headerHeight}" />
  <text x="20" y="24" class="brand">PDAC BIOPORTAL — PUBLICATION FIGURE</text>
  <text x="20" y="50" class="title">${escapeXml(title)}</text>
  ${subtitle ? `<text x="20" y="76" class="subtitle">${escapeXml(subtitle)}</text>` : ""}
  <image x="0" y="${headerHeight}" width="${canvas.width}" height="${canvas.height}" href="${dataUrl}" />
</svg>`;

  const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".svg") ? filename : `${filename}.svg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export SVG DOM element to high-res PNG or standalone SVG file.
 */
import { toPng, toSvg } from "html-to-image";

/**
 * Export any React / HTML / Recharts container element to high-res publication PNG (3000px min width)
 * with publication header banner using html-to-image.
 */
export async function exportComponentToPNG({
  element,
  filename,
  title = "PDAC BioPortal Figure",
  subtitle,
}: {
  element: HTMLElement;
  filename: string;
  title?: string;
  subtitle?: string;
}) {
  if (!element) return;

  // 1. Wait for any pending frames/renders to finish
  await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 100)));

  // Filter out tooltip popups from export capture
  const filter = (node: HTMLElement) => {
    if (!node.classList) return true;
    if (
      node.classList.contains("recharts-tooltip-wrapper") ||
      node.classList.contains("recharts-default-tooltip") ||
      node.classList.contains("recharts-tooltip-cursor")
    ) {
      return false;
    }
    return true;
  };

  const origWidth = element.clientWidth || element.getBoundingClientRect().width || 1000;
  const origHeight = element.clientHeight || element.getBoundingClientRect().height || 500;

  // Enforce 3000px minimum publication target width
  const targetWidth = Math.max(3000, origWidth * 3);
  const scale = targetWidth / origWidth;

  // Render DOM element directly to PNG data URL at high pixel ratio
  const chartDataUrl = await toPng(element, {
    quality: 0.98,
    pixelRatio: scale,
    backgroundColor: "#020617", // Slate 950
    filter: filter as any,
  });

  // Calculate publication header dimensions
  const fontBrandSize = Math.round(13 * scale);
  const fontTitleSize = Math.round(20 * scale);
  const fontSubtitleSize = Math.round(12 * scale);

  const padLeft = Math.round(24 * scale);
  const padTop = Math.round(20 * scale);

  const line1Y = padTop + fontBrandSize;
  const line2Y = line1Y + Math.round(10 * scale) + fontTitleSize;
  const line3Y = subtitle ? line2Y + Math.round(8 * scale) + fontSubtitleSize : line2Y;

  const headerHeight = Math.round(line3Y + Math.round(20 * scale));
  const targetPlotHeight = Math.round(origHeight * scale);
  const targetHeight = targetPlotHeight + headerHeight;

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Backgrounds
  ctx.fillStyle = "#020617";
  ctx.fillRect(0, 0, targetWidth, targetHeight);

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, targetWidth, headerHeight);

  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = Math.max(2, Math.round(1.5 * scale));
  ctx.beginPath();
  ctx.moveTo(0, headerHeight);
  ctx.lineTo(targetWidth, headerHeight);
  ctx.stroke();

  // Banner text
  ctx.fillStyle = "#38bdf8";
  ctx.font = `bold ${fontBrandSize}px sans-serif`;
  ctx.fillText("PDAC BIOPORTAL — PUBLICATION FIGURE", padLeft, line1Y);

  ctx.fillStyle = "#f8fafc";
  ctx.font = `bold ${fontTitleSize}px sans-serif`;
  ctx.fillText(title, padLeft, line2Y);

  if (subtitle) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = `${fontSubtitleSize}px monospace`;
    ctx.fillText(subtitle, padLeft, line3Y);
  }

  // Draw chart PNG below header banner
  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, 0, headerHeight, targetWidth, targetPlotHeight);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const pngUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = pngUrl;
      link.download = filename.endsWith(".png") ? filename : `${filename}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(pngUrl);
    }, "image/png");
  };
  img.src = chartDataUrl;
}

/**
 * Export any React / HTML / Recharts container element to standalone vector SVG file
 * using html-to-image toSvg.
 */
export async function exportComponentToSVG({
  element,
  filename,
  title = "PDAC BioPortal Figure",
  subtitle,
}: {
  element: HTMLElement;
  filename: string;
  title?: string;
  subtitle?: string;
}) {
  if (!element) return;

  // 1. Wait for render frames to settle
  await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 100)));

  // Filter out tooltip popups from SVG capture
  const filter = (node: HTMLElement) => {
    if (!node.classList) return true;
    if (
      node.classList.contains("recharts-tooltip-wrapper") ||
      node.classList.contains("recharts-default-tooltip") ||
      node.classList.contains("recharts-tooltip-cursor")
    ) {
      return false;
    }
    return true;
  };

  // Capture element to SVG Data URI
  const svgDataUrl = await toSvg(element, {
    backgroundColor: "#020617", // Slate 950
    filter: filter as any,
  });

  const link = document.createElement("a");
  link.href = svgDataUrl;
  link.download = filename.endsWith(".svg") ? filename : `${filename}.svg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * SVG exporter wrapper
 */
export function exportSvgElement({
  svgElement,
  filename,
  format = "svg",
  title = "PDAC BioPortal Figure",
  subtitle,
}: {
  svgElement: SVGSVGElement;
  filename: string;
  format: "svg" | "png";
  title?: string;
  subtitle?: string;
}) {
  const parent = svgElement.parentElement;
  if (parent) {
    if (format === "png") {
      exportComponentToPNG({
        element: parent,
        filename,
        title,
        subtitle,
      });
    } else {
      exportComponentToSVG({
        element: parent,
        filename,
        title,
        subtitle,
      });
    }
    return;
  }

  const serializer = new XMLSerializer();
  let svgString = serializer.serializeToString(svgElement);

  if (!svgString.includes('xmlns="http://www.w3.org/2000/svg"')) {
    svgString = svgString.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  const blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + svgString], {
    type: "image/svg+xml;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".svg") ? filename : `${filename}.svg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Recursively inline computed CSS presentation styles onto SVG element attributes.
 * ONLY applies to leaf SVG shape nodes (rect, path, circle, text, line) and PRESERVES existing attributes.
 */
function inlineComputedStyles(sourceEl: Element, targetEl: Element) {
  const sourceNodes = [sourceEl, ...Array.from(sourceEl.querySelectorAll("*"))];
  const targetNodes = [targetEl, ...Array.from(targetEl.querySelectorAll("*"))];

  const presentationProps = [
    "stroke-width",
    "stroke-dasharray",
    "stroke-linecap",
    "stroke-linejoin",
    "opacity",
    "fill-opacity",
    "stroke-opacity",
    "font-family",
    "font-size",
    "font-weight",
    "text-anchor",
    "dominant-baseline",
  ];

  const len = Math.min(sourceNodes.length, targetNodes.length);
  for (let i = 0; i < len; i++) {
    const sNode = sourceNodes[i];
    const tNode = targetNodes[i];
    if (!sNode || !tNode) continue;

    try {
      // Skip root SVG node to prevent polluting root attributes
      if (i === 0) continue;

      const tagName = sNode.tagName.toLowerCase();
      const computed = window.getComputedStyle(sNode);

      // ONLY apply styles to SVG shape and text elements, NEVER on container <g> nodes
      if (["rect", "path", "circle", "ellipse", "polygon", "text", "line"].includes(tagName)) {
        // 1. Preserve existing SVG fill attribute if already explicitly defined (e.g. fill="#14b8a6" or fill="#64748b")
        const existingFill = sNode.getAttribute("fill");
        if (!existingFill || existingFill === "none") {
          const fillVal = computed ? computed.getPropertyValue("fill") : "";
          if (fillVal && fillVal !== "none" && fillVal !== "rgb(0, 0, 0)" && fillVal !== "#000000") {
            tNode.setAttribute("fill", fillVal);
          }
        }

        // 2. Preserve existing SVG stroke attribute
        const existingStroke = sNode.getAttribute("stroke");
        if (!existingStroke || existingStroke === "none") {
          const strokeVal = computed ? computed.getPropertyValue("stroke") : "";
          if (strokeVal && strokeVal !== "none") {
            tNode.setAttribute("stroke", strokeVal);
          }
        }

        // 3. Apply other presentation properties if computed
        if (computed) {
          for (const prop of presentationProps) {
            const val = computed.getPropertyValue(prop);
            if (val && val !== "none" && val !== "normal" && val !== "auto" && !tNode.hasAttribute(prop)) {
              tNode.setAttribute(prop, val);
            }
          }
        }
      }
    } catch (e) {
      // Ignore non-computable nodes
    }
  }
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
