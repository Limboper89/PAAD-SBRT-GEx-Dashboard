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

export type ExportTheme = "light" | "dark";

/**
 * Export HTML Canvas element to High-Res 300 DPI PNG without banner clutter.
 * Clean, full-canvas publication figure on pure white (Light) or dark (Dark) background.
 */
export function exportCanvasToPNG({
  canvas,
  filename,
  title,
  subtitle,
  theme = "light",
  bgColor,
}: {
  canvas: HTMLCanvasElement;
  filename: string;
  title?: string;
  subtitle?: string;
  theme?: ExportTheme;
  bgColor?: string;
}) {
  // High-res publication scale (2400px minimum target width)
  const targetWidth = Math.max(2400, canvas.width * 2);
  const scale = targetWidth / canvas.width;
  const targetHeight = Math.round(canvas.height * scale);

  const isLight = theme === "light";
  const finalBgColor = bgColor || (isLight ? "#ffffff" : "#020617");

  const offscreen = document.createElement("canvas");
  offscreen.width = targetWidth;
  offscreen.height = targetHeight;
  const ctx = offscreen.getContext("2d");
  if (!ctx) return;

  // Background
  ctx.fillStyle = finalBgColor;
  ctx.fillRect(0, 0, targetWidth, targetHeight);

  // Draw plot canvas directly occupying the full image
  ctx.drawImage(canvas, 0, 0, targetWidth, targetHeight);

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
 * Export Canvas visualization to clean standalone SVG format without header banner.
 */
export function exportCanvasToSVG({
  canvas,
  filename,
  title,
  subtitle,
  theme = "light",
}: {
  canvas: HTMLCanvasElement;
  filename: string;
  title?: string;
  subtitle?: string;
  theme?: ExportTheme;
}) {
  const isLight = theme === "light";
  const dataUrl = canvas.toDataURL("image/png");
  const width = canvas.width;
  const height = canvas.height;
  const bgColor = isLight ? "#ffffff" : "#020617";

  const svgContent = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${bgColor}" />
  <image x="0" y="0" width="${width}" height="${height}" href="${dataUrl}" />
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
 * Export any React / HTML / Recharts container element to clean high-res publication PNG (2400px min width)
 * without header banners.
 */
export async function exportComponentToPNG({
  element,
  filename,
  title = "PDAC BioPortal Figure",
  subtitle,
  theme = "light",
}: {
  element: HTMLElement;
  filename: string;
  title?: string;
  subtitle?: string;
  theme?: ExportTheme;
}) {
  if (!element) return;

  const isLight = theme === "light";
  const finalBgColor = isLight ? "#ffffff" : "#020617";

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

  // Enforce 2400px minimum publication target width
  const targetWidth = Math.max(2400, origWidth * 3);
  const scale = targetWidth / origWidth;

  // Render DOM element directly to PNG data URL at high pixel ratio
  const chartDataUrl = await toPng(element, {
    quality: 0.98,
    pixelRatio: scale,
    backgroundColor: finalBgColor,
    filter: filter as any,
  });

  const link = document.createElement("a");
  link.href = chartDataUrl;
  link.download = filename.endsWith(".png") ? filename : `${filename}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
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
  theme = "light",
}: {
  element: HTMLElement;
  filename: string;
  title?: string;
  subtitle?: string;
  theme?: ExportTheme;
}) {
  if (!element) return;

  const isLight = theme === "light";
  const finalBgColor = isLight ? "#ffffff" : "#020617";

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
    backgroundColor: finalBgColor,
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
