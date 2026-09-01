import os
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Rectangle, Circle, FancyArrowPatch

# ============================================================
# PDAC-BioPortal — Publication-quality system architecture
# Vector-first figure: export PDF/SVG for publication/poster
# ============================================================

# ---------- Figure Dimensions ----------
FIG_W = 16.8
FIG_H = 10.6

fig = plt.figure(figsize=(FIG_W, FIG_H), dpi=300)
ax = fig.add_axes([0, 0, 1, 1])
ax.set_xlim(0, FIG_W)
ax.set_ylim(0, FIG_H)
ax.axis("off")

# ---------- Colors (Publication-grade Palette) ----------
NAVY = "#123B6D"
BLUE = "#2E6FAD"
BLUE_LIGHT = "#F0F5FA"

GREEN = "#1E703E"
GREEN_LIGHT = "#F0F8F2"

ORANGE = "#C8680E"
ORANGE_LIGHT = "#FEF7EE"

RED = "#B82E2E"
RED_LIGHT = "#FDF2F2"

DARK = "#1E293B"
GRAY = "#475569"
LIGHT_GRAY = "#F8FAFC"
WHITE = "#FFFFFF"

# ---------- Typography (Large, Clear, Legible) ----------
TITLE_SIZE = 22
SECTION_SIZE = 12.0
HEADER_SIZE = 11.0
BODY_SIZE = 9.5
SMALL_SIZE = 8.5
TINY_SIZE = 7.5

FONT = "DejaVu Sans"

# ============================================================
# Helper functions
# ============================================================

def box(x, y, w, h, edge, face=WHITE,
        radius=0.10, lw=1.3, alpha=1.0, zorder=1):
    p = FancyBboxPatch(
        (x, y), w, h,
        boxstyle=f"round,pad=0.015,rounding_size={radius}",
        linewidth=lw,
        edgecolor=edge,
        facecolor=face,
        alpha=alpha,
        zorder=zorder
    )
    ax.add_patch(p)
    return p


def text(x, y, s, size=BODY_SIZE, color=DARK,
         weight="normal", ha="left", va="center",
         linespacing=1.18, zorder=5):
    return ax.text(
        x, y, s,
        fontsize=size,
        color=color,
        fontfamily=FONT,
        fontweight=weight,
        ha=ha,
        va=va,
        linespacing=linespacing,
        zorder=zorder
    )


def arrow(x1, y1, x2, y2, color=NAVY,
          lw=1.5, style="-|>", mutation=11,
          linestyle="-", zorder=4):
    a = FancyArrowPatch(
        (x1, y1), (x2, y2),
        arrowstyle=style,
        mutation_scale=mutation,
        linewidth=lw,
        linestyle=linestyle,
        color=color,
        shrinkA=2,
        shrinkB=2,
        zorder=zorder
    )
    ax.add_patch(a)
    return a


def bullet_list(x, y, items, spacing=0.22,
                size=SMALL_SIZE, color=DARK):
    for i, item in enumerate(items):
        text(x, y - i * spacing, "• " + item,
             size=size, color=color, va="center")


def section_label(x, y, number, title, subtitle=None, color=NAVY):
    text(x, y, f"{number}. {title}",
         size=SECTION_SIZE,
         color=color,
         weight="bold")
    if subtitle:
        text(x, y - 0.25, subtitle,
             size=SMALL_SIZE,
             color=GRAY,
             weight="bold")


# ============================================================
# TITLE
# ============================================================

text(
    FIG_W / 2.0, 10.22,
    "PDAC-BioPortal: System Architecture",
    size=TITLE_SIZE,
    color="#0F172A",
    weight="bold",
    ha="center"
)

# ============================================================
# LEFT SECTION LABELS
# ============================================================

section_label(
    0.35, 9.20,
    "1", "PUBLIC\nTRANSCRIPTOMIC\nDATASETS",
    color=NAVY
)

section_label(
    0.35, 7.38,
    "2", "DATA PROCESSING\n& STORAGE",
    color=NAVY
)

section_label(
    0.35, 5.05,
    "3", "PDAC-BioPortal",
    "(Next.js Web Interface)",
    color=GREEN
)

text(
    0.35, 4.30,
    "Core Analytical\nPlatform",
    size=SECTION_SIZE,
    color=GREEN,
    weight="bold"
)

section_label(
    0.35, 1.95,
    "5", "USER VERIFICATION",
    "(Human-in-the-Loop)",
    color=RED
)

# ============================================================
# 1. PUBLIC DATASETS
# ============================================================

x0 = 2.35
y0 = 8.40
W = 10.45
H = 1.55

box(x0, y0, W, H, NAVY, BLUE_LIGHT, radius=0.10, lw=1.4)

datasets = [
    (
        "TCGA-PAAD vs GTEx",
        [
            "Bulk RNA-seq",
            "Tumor vs normal",
            "comparison",
            "Wilcoxon concordance"
        ]
    ),
    (
        "GSE225767 (SBRT)",
        [
            "Bulk RNA-seq",
            "Paired pre/post SBRT",
            "Differential expression",
            "of response"
        ]
    ),
    (
        "GSE202051",
        [
            "Single-nucleus RNA-seq",
            "43 specimens",
            "Cell type atlas &",
            "annotation"
        ]
    ),
    (
        "GSE274103",
        [
            "Spatial transcriptomics",
            "(Visium)",
            "5 patients",
            "Tissue-level spatial",
            "coordinates"
        ]
    )
]

col_w = W / 4

for i, (title_, items) in enumerate(datasets):
    cx = x0 + i * col_w

    if i > 0:
        ax.plot(
            [cx, cx],
            [y0 + 0.12, y0 + H - 0.12],
            color=BLUE,
            linewidth=0.9,
            alpha=0.45,
            zorder=2
        )

    text(
        cx + col_w / 2,
        y0 + H - 0.25,
        title_,
        size=HEADER_SIZE,
        color=NAVY,
        weight="bold",
        ha="center"
    )

    bullet_list(
        cx + 0.18,
        y0 + H - 0.54,
        items,
        spacing=0.22,
        size=SMALL_SIZE,
        color=DARK
    )

# ============================================================
# DATA TYPES LEGEND
# ============================================================

x_dt = 13.10
box(
    x_dt, 8.35, 3.30, 1.60,
    BLUE,
    WHITE,
    lw=1.2,
    radius=0.10
)

text(
    x_dt + 1.65, 9.68,
    "DATA TYPES",
    size=HEADER_SIZE,
    color=NAVY,
    weight="bold",
    ha="center"
)

# Bulk icon
ax.plot([x_dt + 0.35, x_dt + 0.65], [9.28, 9.28],
        color=NAVY, lw=2.0, zorder=3)
text(x_dt + 0.85, 9.28, "Bulk RNA-seq", size=SMALL_SIZE, color=DARK)

# snRNA icon
for yy in [8.95, 8.75, 8.55]:
    ax.add_patch(
        Circle((x_dt + 0.50, yy), 0.042,
               facecolor=BLUE_LIGHT,
               edgecolor=NAVY,
               linewidth=1.0,
               zorder=3)
    )

text(x_dt + 0.85, 8.85,
     "Single-nucleus RNA-seq",
     size=SMALL_SIZE, color=DARK)

# Spatial icon
ax.add_patch(
    Rectangle((x_dt + 0.42, 8.44), 0.16, 0.16,
              facecolor=BLUE_LIGHT, edgecolor=NAVY, lw=1.0, zorder=3)
)
text(x_dt + 0.85, 8.52,
     "Spatial transcriptomics",
     size=SMALL_SIZE, color=DARK)

# ============================================================
# DATA FLOW TO PROCESSING
# ============================================================

arrow(
    x0 + W / 2, 8.40,
    x0 + W / 2, 7.85,
    color=NAVY, lw=1.8, mutation=12
)

# ============================================================
# 2. DATA PROCESSING & STORAGE
# ============================================================

x2 = 2.35
y2 = 6.90
W2 = 10.45
H2 = 0.95

box(x2, y2, W2, H2, NAVY, BLUE_LIGHT, radius=0.10, lw=1.4)

processes = [
    "Quality control\n& filtering",
    "Normalization &\nbatch correction",
    "Gene annotation\n(Ensembl)",
    "Binary conversion\n& compression",
    "Web-optimized\nbinary datasets",
    "Rapid access & low\nmemory footprint"
]

px = np.linspace(x2 + 0.80, x2 + W2 - 0.80, len(processes))

for i, (xx, label) in enumerate(zip(px, processes)):
    # Circle marker
    ax.add_patch(
        Circle(
            (xx, y2 + 0.58),
            0.15,
            facecolor=WHITE,
            edgecolor=NAVY,
            linewidth=1.2,
            zorder=3
        )
    )

    text(
        xx,
        y2 + 0.58,
        str(i + 1),
        size=8.5,
        color=NAVY,
        weight="bold",
        ha="center"
    )

    text(
        xx,
        y2 + 0.22,
        label,
        size=SMALL_SIZE,
        color=DARK,
        ha="center"
    )

    if i < len(processes) - 1:
        arrow(
            xx + 0.20,
            y2 + 0.58,
            px[i + 1] - 0.20,
            y2 + 0.58,
            color=BLUE,
            lw=1.2,
            mutation=9
        )

# ============================================================
# FLOW TO PORTAL
# ============================================================

arrow(
    x0 + W / 2, 6.90,
    x0 + W / 2, 6.35,
    color=NAVY, lw=1.8, mutation=12
)

# ============================================================
# 3. PDAC-BioPortal CORE
# ============================================================

x3 = 2.35
y3 = 3.00
W3 = 10.45
H3 = 3.35

box(x3, y3, W3, H3, GREEN, GREEN_LIGHT, radius=0.10, lw=1.5)

text(
    x3 + W3 / 2,
    y3 + H3 - 0.25,
    "Integrated Exploration Across Five Analytical Modules",
    size=SECTION_SIZE + 0.5,
    color=GREEN,
    weight="bold",
    ha="center"
)

modules = [
    (
        "TCGA/GTEx\nExplorer",
        [
            "DEGs & volcano plots",
            "Heatmaps & boxplots",
            "Correlation analysis",
            "Tumor vs normal",
            "comparison"
        ]
    ),
    (
        "SBRT\nExplorer",
        [
            "Paired pre/post DEGs",
            "Response analysis",
            "Heatmaps &",
            "correlation",
            "Resistance profile"
        ]
    ),
    (
        "Single-nucleus\nAtlas",
        [
            "UMAP visualization",
            "Cell type clustering",
            "Annotation & marker",
            "genes",
            "Cell lineage search"
        ]
    ),
    (
        "Spatial\nExplorer",
        [
            "Spot-level expression",
            "H&E image overlay",
            "Spatial patterns &",
            "neighborhoods",
            "Spatial statistics"
        ]
    ),
    (
        "Functional /\nPathway Analysis",
        [
            "ORA (Enrichment)",
            "GSEA analysis",
            "Pathway libraries",
            "Pathway-level",
            "interpretation"
        ]
    )
]

mx = x3 + 0.16
my = y3 + 0.78
mh = 2.18
mw = (W3 - 0.48) / 5

for i, (title_, items) in enumerate(modules):
    xx = mx + i * mw

    box(
        xx,
        my,
        mw - 0.08,
        mh,
        GREEN,
        WHITE,
        radius=0.08,
        lw=1.1
    )

    text(
        xx + (mw - 0.08) / 2,
        my + mh - 0.32,
        title_,
        size=HEADER_SIZE,
        color=GREEN,
        weight="bold",
        ha="center"
    )

    bullet_list(
        xx + 0.12,
        my + mh - 0.72,
        items,
        spacing=0.25,
        size=SMALL_SIZE,
        color=DARK
    )

# Unified data access bar
box(
    x3 + 0.16,
    y3 + 0.12,
    W3 - 0.32,
    0.54,
    GREEN,
    WHITE,
    radius=0.07,
    lw=1.1
)

text(
    x3 + 0.40,
    y3 + 0.40,
    "Unified Data Access & Cross-dataset Integration",
    size=HEADER_SIZE,
    color=GREEN,
    weight="bold"
)

text(
    x3 + 0.40,
    y3 + 0.19,
    "Consistent gene annotation  •  Harmonized metadata  •  Synchronized visualization & querying",
    size=SMALL_SIZE + 0.2,
    color=DARK
)

# ============================================================
# 4. PDACopilot — RIGHT SIDE (Clean, unhighlighted, standard Gemini Flash)
# ============================================================

x4 = 13.10
y4 = 3.00
W4 = 3.30
H4 = 5.25

box(x4, y4, W4, H4, ORANGE, ORANGE_LIGHT, radius=0.10, lw=1.5)

text(
    x4 + W4 / 2,
    y4 + H4 - 0.24,
    "PDACopilot AI Assistant",
    size=SECTION_SIZE + 0.5,
    color=ORANGE,
    weight="bold",
    ha="center"
)

text(
    x4 + W4 / 2,
    y4 + H4 - 0.46,
    "(Decoupled Layer)",
    size=SMALL_SIZE + 0.5,
    color=GRAY,
    weight="bold",
    ha="center"
)

ai_steps = [
    (
        "User Query & Active Context",
        "Query with current portal state\n(dataset, filters, selections)"
    ),
    (
        "Structured Context Retrieval",
        "Deterministic retrieval of relevant tables,\nresults, metadata, and visualizations"
    ),
    (
        "PDACopilot Reasoning Engine",
        "Google Gemini Flash\nReasoning over retrieved context only"
    ),
    (
        "Evidence-Tagged Response",
        "Answer with evidence tags and\nconfidence indicators"
    ),
    (
        "Reproducible Summary Export",
        "Export answers and evidence for\ntransparency and reproducibility"
    )
]

ai_y = y4 + H4 - 1.25

for i, (head, desc) in enumerate(ai_steps):
    bh = 0.64

    box(
        x4 + 0.15,
        ai_y,
        W4 - 0.30,
        bh,
        ORANGE,
        WHITE,
        radius=0.08,
        lw=1.1
    )

    text(
        x4 + W4 / 2,
        ai_y + 0.44,
        head,
        size=8.8,
        color="#0F172A",
        weight="bold",
        ha="center"
    )

    text(
        x4 + W4 / 2,
        ai_y + 0.18,
        desc,
        size=7.5,
        color=GRAY,
        ha="center"
    )

    if i < len(ai_steps) - 1:
        arrow(
            x4 + W4 / 2,
            ai_y - 0.02,
            x4 + W4 / 2,
            ai_y - 0.16,
            color=ORANGE,
            lw=1.1,
            mutation=8
        )

    ai_y -= 0.82

# ============================================================
# CONTEXT FLOW FROM PORTAL TO AI
# ============================================================

arrow(
    x3 + W3,
    y3 + H3 - 0.95,
    x4,
    y4 + H4 - 1.25,
    color=ORANGE,
    lw=1.5,
    linestyle="--",
    mutation=10
)

# ============================================================
# 5. USER VERIFICATION
# ============================================================

x5 = 2.35
y5 = 1.45
W5 = 10.45
H5 = 0.95

box(
    x5,
    y5,
    W5,
    H5,
    RED,
    RED_LIGHT,
    radius=0.10,
    lw=1.4
)

text(
    x5 + 0.35,
    y5 + 0.68,
    "Cross-checking & Verification",
    size=SECTION_SIZE,
    color=RED,
    weight="bold"
)

text(
    x5 + 0.35,
    y5 + 0.40,
    "Users validate AI responses by cross-checking across interactive portal visualizations and underlying data.",
    size=BODY_SIZE,
    color=DARK
)

text(
    x5 + 0.35,
    y5 + 0.17,
    "Ensures scientific transparency, mathematical accuracy, and human-in-the-loop trust.",
    size=SMALL_SIZE,
    color=GRAY,
    weight="bold"
)

# ============================================================
# HUMAN FEEDBACK LOOP
# ============================================================

# Arrow from AI to Verification
arrow(
    x4 + 0.10,
    y4 + 0.60,
    x5 + W5,
    y5 + 0.55,
    color=RED,
    lw=1.4,
    linestyle="--",
    mutation=10
)

# Bi-directional flow between Verification and Portal
arrow(
    x5 + W5 * 0.48,
    y5 + H5,
    x5 + W5 * 0.48,
    y3,
    color=GREEN,
    lw=1.4,
    mutation=10
)

arrow(
    x5 + W5 * 0.52,
    y3,
    x5 + W5 * 0.52,
    y5 + H5,
    color=RED,
    lw=1.4,
    linestyle="--",
    mutation=10
)

# ============================================================
# DESIGN PRINCIPLES
# ============================================================

box(
    13.10,
    1.45,
    3.30,
    1.25,
    BLUE,
    WHITE,
    lw=1.2,
    radius=0.10
)

text(
    13.10 + 1.65,
    2.48,
    "DESIGN PRINCIPLES",
    size=HEADER_SIZE,
    color=NAVY,
    weight="bold",
    ha="center"
)

principles = [
    "Modular & scalable",
    "Data integrity & reproducibility",
    "Transparent & evidence-driven",
    "Decoupled AI for reliability"
]

for i, p in enumerate(principles):
    text(
        13.35,
        2.18 - i * 0.22,
        "✓ " + p,
        size=SMALL_SIZE + 0.2,
        color=DARK,
        weight="bold"
    )

# ============================================================
# LEGEND
# ============================================================

legend_y = 0.65

# Data
ax.add_patch(Rectangle(
    (2.35, legend_y), 0.20, 0.20,
    facecolor=BLUE_LIGHT, edgecolor=BLUE, lw=1.1
))
text(2.65, legend_y + 0.10,
     "Core Data / Processing",
     size=SMALL_SIZE, color=DARK)

# Portal
ax.add_patch(Rectangle(
    (5.00, legend_y), 0.20, 0.20,
    facecolor=GREEN_LIGHT, edgecolor=GREEN, lw=1.1
))
text(5.30, legend_y + 0.10,
     "Core Portal",
     size=SMALL_SIZE, color=DARK)

# AI
ax.add_patch(Rectangle(
    (6.95, legend_y), 0.20, 0.20,
    facecolor=ORANGE_LIGHT, edgecolor=ORANGE, lw=1.1
))
text(7.25, legend_y + 0.10,
     "AI Assistant",
     size=SMALL_SIZE, color=DARK)

# User
ax.add_patch(Rectangle(
    (8.75, legend_y), 0.20, 0.20,
    facecolor=RED_LIGHT, edgecolor=RED, lw=1.1
))
text(9.05, legend_y + 0.10,
     "User Verification",
     size=SMALL_SIZE, color=DARK)

# Data flow
arrow(
    10.90, legend_y + 0.10,
    11.45, legend_y + 0.10,
    color=NAVY,
    lw=1.5,
    mutation=9
)
text(
    11.55, legend_y + 0.10,
    "Data Flow",
    size=SMALL_SIZE, color=DARK
)

# Context
arrow(
    12.75, legend_y + 0.10,
    13.30, legend_y + 0.10,
    color=ORANGE,
    lw=1.5,
    linestyle="--",
    mutation=9
)
text(
    13.40, legend_y + 0.10,
    "Context Flow",
    size=SMALL_SIZE, color=DARK
)

# Feedback
arrow(
    14.70, legend_y + 0.10,
    15.25, legend_y + 0.10,
    color=RED,
    lw=1.5,
    linestyle="--",
    mutation=9
)
text(
    15.35, legend_y + 0.10,
    "Feedback Loop",
    size=SMALL_SIZE, color=DARK
)

# ============================================================
# EXPORT
# ============================================================

output_dir = "d:/DATA/PDAC_BioPortal/Figures"
os.makedirs(output_dir, exist_ok=True)

pdf_path = os.path.join(output_dir, "PDAC_BioPortal_System_Architecture.pdf")
svg_path = os.path.join(output_dir, "PDAC_BioPortal_System_Architecture.svg")
png_300_path = os.path.join(output_dir, "PDAC_BioPortal_System_Architecture_300dpi.png")
png_600_path = os.path.join(output_dir, "PDAC_BioPortal_System_Architecture_600dpi.png")
fig1_path = os.path.join(output_dir, "Fig1.png")

plt.savefig(pdf_path, bbox_inches="tight", facecolor="white")
plt.savefig(svg_path, bbox_inches="tight", facecolor="white")
plt.savefig(png_300_path, dpi=300, bbox_inches="tight", facecolor="white")
plt.savefig(png_600_path, dpi=600, bbox_inches="tight", facecolor="white")
plt.savefig(fig1_path, dpi=300, bbox_inches="tight", facecolor="white")

print("All figures re-exported with perfect margins!")
