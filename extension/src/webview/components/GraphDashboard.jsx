import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import cytoscape from 'cytoscape';
import coseBilkent from 'cytoscape-cose-bilkent';
import useStore from '../store/useStore';
import GraphSearchBar from './GraphSearchBar';

// Register layout
cytoscape.use(coseBilkent);

// ── File-type color palette ──────────────────────────────────────────
const EXT_COLORS = {
    '.jsx': { fill: '#06b6d4', glow: 'rgba(6,182,212,0.45)' },
    '.tsx': { fill: '#06b6d4', glow: 'rgba(6,182,212,0.45)' },
    '.js': { fill: '#3b82f6', glow: 'rgba(59,130,246,0.40)' },
    '.mjs': { fill: '#3b82f6', glow: 'rgba(59,130,246,0.40)' },
    '.cjs': { fill: '#3b82f6', glow: 'rgba(59,130,246,0.40)' },
    '.ts': { fill: '#6366f1', glow: 'rgba(99,102,241,0.40)' },
    '.css': { fill: '#ec4899', glow: 'rgba(236,72,153,0.40)' },
    '.scss': { fill: '#ec4899', glow: 'rgba(236,72,153,0.40)' },
    '.sass': { fill: '#ec4899', glow: 'rgba(236,72,153,0.40)' },
    '.less': { fill: '#ec4899', glow: 'rgba(236,72,153,0.40)' },
    '.html': { fill: '#f97316', glow: 'rgba(249,115,22,0.40)' },
    '.htm': { fill: '#f97316', glow: 'rgba(249,115,22,0.40)' },
    '.vue': { fill: '#10b981', glow: 'rgba(16,185,129,0.40)' },
    '.svelte': { fill: '#ef4444', glow: 'rgba(239,68,68,0.40)' },
    '.py': { fill: '#10b981', glow: 'rgba(16,185,129,0.40)' },
    '.pyw': { fill: '#10b981', glow: 'rgba(16,185,129,0.40)' },
    '.java': { fill: '#f59e0b', glow: 'rgba(245,158,11,0.40)' },
    '.json': { fill: '#f59e0b', glow: 'rgba(245,158,11,0.40)' },
    '.go': { fill: '#06b6d4', glow: 'rgba(6,182,212,0.40)' },
    '.rs': { fill: '#f97316', glow: 'rgba(249,115,22,0.40)' },
    '.rb': { fill: '#ef4444', glow: 'rgba(239,68,68,0.40)' },
    '.php': { fill: '#a855f7', glow: 'rgba(168,85,247,0.40)' },
    '.c': { fill: '#64748b', glow: 'rgba(100,116,139,0.40)' },
    '.cpp': { fill: '#64748b', glow: 'rgba(100,116,139,0.40)' },
    '.h': { fill: '#64748b', glow: 'rgba(100,116,139,0.40)' },
    '.cs': { fill: '#a855f7', glow: 'rgba(168,85,247,0.40)' },
};

const DEFAULT_EXT_COLOR = { fill: '#8b5cf6', glow: 'rgba(139,92,246,0.35)' };

// Risk overlays — used for border ring
const RISK_RING = {
    low: 'rgba(16,185,129,0.5)',
    medium: 'rgba(245,158,11,0.7)',
    high: 'rgba(239,68,68,0.8)',
};

const SELECTED_COLOR = '#00f0ff';
const EDGE_BASE = 'rgba(148, 163, 184, 0.12)';
const EDGE_HIGHLIGHT = 'rgba(0, 240, 255, 0.6)';
const EDGE_DEPENDENCY = 'rgba(59, 130, 246, 0.85)';  // Blue — outgoing (this file imports)
const EDGE_DEPENDENT = 'rgba(168, 85, 247, 0.85)';   // Purple — incoming (imports this file)

// Helper: lighten a hex colour for gradient centre
function lighten(hex, amt = 60) {
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    r = Math.min(255, r + amt);
    g = Math.min(255, g + amt);
    b = Math.min(255, b + amt);
    return `rgb(${r},${g},${b})`;
}

function getExtColor(ext) {
    return EXT_COLORS[ext] || DEFAULT_EXT_COLOR;
}

// ── Particle Background (lightweight – 30 particles, static render) ──
function ParticleCanvas() {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let animId;
        let w, h;

        const particles = [];
        const COUNT = 30; // reduced from 60 for performance

        function resize() {
            w = canvas.width = canvas.parentElement.clientWidth;
            h = canvas.height = canvas.parentElement.clientHeight;
        }

        function init() {
            resize();
            particles.length = 0;
            for (let i = 0; i < COUNT; i++) {
                particles.push({
                    x: Math.random() * w,
                    y: Math.random() * h,
                    r: Math.random() * 1.5 + 0.5,
                    dx: (Math.random() - 0.5) * 0.15,
                    dy: (Math.random() - 0.5) * 0.15,
                    alpha: Math.random() * 0.3 + 0.08,
                });
            }
        }

        let lastTime = 0;
        const FPS_INTERVAL = 1000 / 24; // cap at 24fps — enough for slow drift

        function draw(timestamp) {
            animId = requestAnimationFrame(draw);
            const elapsed = timestamp - lastTime;
            if (elapsed < FPS_INTERVAL) return;
            lastTime = timestamp - (elapsed % FPS_INTERVAL);

            ctx.clearRect(0, 0, w, h);

            // Subtle radial spotlight
            const grd = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.6);
            grd.addColorStop(0, 'rgba(6,182,212,0.03)');
            grd.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grd;
            ctx.fillRect(0, 0, w, h);

            for (const p of particles) {
                p.x += p.dx;
                p.y += p.dy;
                if (p.x < 0) p.x = w;
                if (p.x > w) p.x = 0;
                if (p.y < 0) p.y = h;
                if (p.y > h) p.y = 0;

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(148,163,184,${p.alpha})`;
                ctx.fill();
            }
        }

        init();
        animId = requestAnimationFrame(draw);

        const obs = new ResizeObserver(resize);
        obs.observe(canvas.parentElement);

        return () => {
            cancelAnimationFrame(animId);
            obs.disconnect();
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="particle-canvas"
        />
    );
}

// ── Tooltip Component ────────────────────────────────────────────────
function GraphTooltip({ data, position }) {
    if (!data) return null;
    const riskColors = { low: '#10b981', medium: '#f59e0b', high: '#ef4444' };
    const riskGradients = {
        low: 'linear-gradient(90deg, #3b82f6, #10b981)',
        medium: 'linear-gradient(90deg, #10b981, #f59e0b)',
        high: 'linear-gradient(90deg, #f59e0b, #ef4444)',
    };
    return (
        <div
            className="graph-tooltip"
            style={{
                left: Math.min(position.x + 14, (typeof window !== 'undefined' ? window.innerWidth : 900) - 280),
                top: Math.max(position.y - 10, 10),
            }}
        >
            <div className="graph-tooltip-header">
                <span
                    className="graph-tooltip-dot"
                    style={{ background: data.color }}
                />
                <span className="graph-tooltip-name">{data.label}</span>
            </div>
            <div className="graph-tooltip-path">{data.path}</div>
            <div className="graph-tooltip-divider" />
            <div className="graph-tooltip-metrics">
                <div className="graph-tooltip-metric">
                    <span className="graph-tooltip-metric-val">{data.linesOfCode ?? '–'}</span>
                    <span className="graph-tooltip-metric-lbl">LOC</span>
                </div>
                <div className="graph-tooltip-metric">
                    <span className="graph-tooltip-metric-val">{data.dependencyCount ?? 0}</span>
                    <span className="graph-tooltip-metric-lbl">Deps</span>
                </div>
                <div className="graph-tooltip-metric">
                    <span className="graph-tooltip-metric-val">{data.dependentCount ?? 0}</span>
                    <span className="graph-tooltip-metric-lbl">Used by</span>
                </div>
                <div className="graph-tooltip-metric">
                    <span className="graph-tooltip-metric-val">{((data.centralityScore || 0) * 100).toFixed(0)}%</span>
                    <span className="graph-tooltip-metric-lbl">Centrality</span>
                </div>
            </div>
            {data.riskLevel && (
                <>
                    <div className="graph-tooltip-risk" style={{ color: riskColors[data.riskLevel] || '#94a3b8' }}>
                        ● {data.riskLevel.toUpperCase()} RISK — {data.riskScore}/100
                    </div>
                    <div className="graph-tooltip-risk-bar">
                        <div
                            className="graph-tooltip-risk-fill"
                            style={{
                                width: `${data.riskScore || 0}%`,
                                background: riskGradients[data.riskLevel] || riskGradients.low,
                            }}
                        />
                    </div>
                </>
            )}
        </div>
    );
}

// ── Legend (file-type colors) ─────────────────────────────────────
const LEGEND_ITEMS = [
    { label: 'JSX / TSX', color: '#06b6d4' },
    { label: 'JS / MJS', color: '#3b82f6' },
    { label: 'TS', color: '#6366f1' },
    { label: 'CSS/SCSS', color: '#ec4899' },
    { label: 'HTML', color: '#f97316' },
    { label: 'Python', color: '#10b981' },
    { label: 'JSON/Java', color: '#f59e0b' },
    { label: 'Other', color: '#8b5cf6' },
];

const RISK_LEGEND = [
    { label: 'Low Risk', color: 'rgba(16,185,129,0.7)' },
    { label: 'Medium Risk', color: 'rgba(245,158,11,0.7)' },
    { label: 'High Risk', color: 'rgba(239,68,68,0.8)' },
];

function Legend() {
    const [expanded, setExpanded] = useState(true);
    return (
        <div className="graph-legend">
            <button className="graph-legend-toggle" onClick={() => setExpanded(!expanded)}>
                <span className="graph-legend-title">LEGEND</span>
                <span className="graph-legend-chevron">{expanded ? '▾' : '▸'}</span>
            </button>
            {expanded && (
                <div className="graph-legend-body">
                    <div className="graph-legend-section">
                        <div className="graph-legend-section-title">File Types</div>
                        {LEGEND_ITEMS.map((item) => (
                            <div key={item.label} className="graph-legend-item">
                                <span className="graph-legend-orb" style={{ background: item.color, boxShadow: `0 0 6px ${item.color}60` }} />
                                <span className="graph-legend-label">{item.label}</span>
                            </div>
                        ))}
                    </div>
                    <div className="graph-legend-divider" />
                    <div className="graph-legend-section">
                        <div className="graph-legend-section-title">Arrows (on click)</div>
                        <div className="graph-legend-item">
                            <span className="graph-legend-arrow" style={{ background: 'rgba(59,130,246,0.85)' }} />
                            <span className="graph-legend-label">Dependency (imports)</span>
                        </div>
                        <div className="graph-legend-item">
                            <span className="graph-legend-arrow" style={{ background: 'rgba(168,85,247,0.85)' }} />
                            <span className="graph-legend-label">Dependent (imported by)</span>
                        </div>
                    </div>
                    <div className="graph-legend-divider" />
                    <div className="graph-legend-section">
                        <div className="graph-legend-section-title">Risk (border ring)</div>
                        {RISK_LEGEND.map((item) => (
                            <div key={item.label} className="graph-legend-item">
                                <span className="graph-legend-ring" style={{ borderColor: item.color }} />
                                <span className="graph-legend-label">{item.label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Main Component ───────────────────────────────────────────────────
export default function GraphDashboard({ graph, onNodeClick, onBlastRadius, onEdgeClick, selectedNode }) {
    const cyRef = useRef(null);
    const containerRef = useRef(null);
    const { highlightedNodes, blastRadiusMode, sidebarOpen } = useStore();
    const [tooltip, setTooltip] = useState(null);
    const zoomLabelRef = useRef(null);
    const zoomTargetRef = useRef(null);
    const zoomFrameRef = useRef(null);
    const zoomMouseRef = useRef({ x: 0, y: 0 });

    // Resize Cytoscape canvas when sidebar opens/closes
    useEffect(() => {
        const cy = cyRef.current;
        if (!cy) return;
        // Wait for the sidebar animation to finish (200ms), then resize
        const timer = setTimeout(() => {
            cy.resize();
            cy.invalidateSize();
        }, 250);
        return () => clearTimeout(timer);
    }, [sidebarOpen]);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

    // Convert graph data to Cytoscape elements
    const elements = useMemo(() => {
        if (!graph) return [];

        const nodes = Object.values(graph.nodes).map((node) => {
            const risk = node.riskFactor || node.localRisk;
            const riskLevel = risk?.level || 'low';
            const extColor = getExtColor(node.extension);
            const size = Math.max(24, Math.min(70, 22 + (node.metrics.centralityScore || 0) * 50 + (node.metrics.dependentCount || 0) * 2.5));

            return {
                data: {
                    id: node.id,
                    label: node.label,
                    path: node.path,
                    directory: node.directory,
                    extension: node.extension,
                    riskLevel,
                    riskScore: risk?.score || 0,
                    linesOfCode: node.metrics.linesOfCode,
                    dependencyCount: node.metrics.dependencyCount,
                    dependentCount: node.metrics.dependentCount,
                    centralityScore: node.metrics.centralityScore,
                    size,
                    color: extColor.fill,
                    colorLight: lighten(extColor.fill, 80),
                    glowColor: extColor.glow,
                    riskRing: RISK_RING[riskLevel] || 'rgba(100,116,139,0.3)',
                },
            };
        });

        const edges = graph.edges.map((edge, i) => ({
            data: {
                id: `edge-${i}`,
                source: edge.source,
                target: edge.target,
            },
        }));

        return [...nodes, ...edges];
    }, [graph]);

    // Initialize Cytoscape
    useEffect(() => {
        if (!containerRef.current || elements.length === 0) return;

        // ── Dynamic layout params based on graph size ─────────────
        const nodeCount = elements.filter((el) => !el.data.source).length;
        let idealEdgeLength, nodeRepulsion, gravity, numIter, tilingPadding;

        if (nodeCount > 80) {
            // Large graph — maximum spacing
            idealEdgeLength = 280;
            nodeRepulsion = 35000;
            gravity = 0.15;
            numIter = 5000;
            tilingPadding = 50;
        } else if (nodeCount > 30) {
            // Medium graph — moderate spacing
            idealEdgeLength = 200;
            nodeRepulsion = 20000;
            gravity = 0.18;
            numIter = 3500;
            tilingPadding = 40;
        } else {
            // Small graph — compact and tight
            idealEdgeLength = 150;
            nodeRepulsion = 12000;
            gravity = 0.2;
            numIter = 2500;
            tilingPadding = 30;
        }

        const cy = cytoscape({
            container: containerRef.current,
            elements,
            textureOnViewport: false,
            hideLabelsOnViewport: false,
            style: [
                // ── Nodes ──────────────────────────────
                {
                    selector: 'node',
                    style: {
                        'width': 'data(size)',
                        'height': 'data(size)',
                        'background-color': 'data(color)',
                        'background-opacity': 0.92,
                        // Gradient fill for orb effect
                        'background-fill': 'radial-gradient',
                        'background-gradient-stop-colors': function (ele) {
                            return `${ele.data('colorLight')} ${ele.data('color')} ${ele.data('color')}`;
                        },
                        'background-gradient-stop-positions': '0% 55% 100%',

                        // Border ring (risk-based)
                        // Slightly thicker to make risk colour more readable
                        'border-width': 5.5,
                        'border-color': 'data(riskRing)',
                        'border-opacity': 0.7,

                        // Labels — always white on dark bg for readability
                        'label': 'data(label)',
                        'color': '#f1f5f9',
                        'font-size': '10px',
                        'font-family': 'Inter, sans-serif',
                        'font-weight': '500',
                        'text-valign': 'bottom',
                        'text-halign': 'center',
                        'text-margin-y': 8,
                        'text-max-width': '90px',
                        'text-wrap': 'ellipsis',
                        'text-background-color': '#0a0f1e',
                        'text-background-opacity': 0.85,
                        'text-background-padding': '3px',
                        'text-background-shape': 'roundrectangle',

                        // Glow
                        'shadow-blur': 12,
                        'shadow-color': 'data(glowColor)',
                        'shadow-opacity': 0.3,
                        'shadow-offset-x': 0,
                        'shadow-offset-y': 0,
                        'overlay-opacity': 0,

                        // Minimal transitions for performance
                        'transition-property': 'opacity, border-width, border-color',
                        'transition-duration': '0.15s',
                    },
                },
                // Selected node — keep text white and readable
                {
                    selector: 'node:selected',
                    style: {
                        // Keep risk ring color; just make it a bit bolder and glow
                        'border-width': 3.5,
                        'shadow-blur': 25,
                        'shadow-color': 'rgba(0,240,255,0.5)',
                        'shadow-opacity': 0.6,
                        'color': '#ffffff',
                        'font-weight': '700',
                        'text-background-color': 'rgba(0,50,60,0.9)',
                        'text-background-opacity': 1,
                    },
                },
                // Click-toggled: connected neighbor nodes
                {
                    selector: 'node.click-neighbor',
                    style: {
                        // Keep risk ring color; only increase glow slightly
                        'border-width': 3,
                        'shadow-blur': 20,
                        'shadow-opacity': 0.5,
                    },
                },
                // Click-toggled: dimmed non-connected nodes
                {
                    selector: 'node.click-dim',
                    style: {
                        'opacity': 0.12,
                    },
                },
                {
                    selector: 'node.highlighted',
                    style: {
                        // Keep the original risk ring (red / yellow / green)
                        // and only boost the glow so highlighted nodes stand out
                        'shadow-color': 'rgba(168,85,247,0.75)',
                        'shadow-opacity': 0.9,
                        'shadow-blur': 26,
                        'opacity': 1,
                    },
                },
                {
                    selector: 'node.dimmed',
                    style: {
                        'opacity': 0.12,
                    },
                },
                {
                    selector: 'node.high-risk-pulse',
                    style: {
                        'border-width': 3.5,
                        'border-color': '#ef4444',
                        'border-opacity': 1,
                    },
                },
                // ── Edges ──────────────────────────────
                {
                    selector: 'edge',
                    style: {
                        'width': 1.4,
                        'line-color': EDGE_BASE,
                        'target-arrow-color': EDGE_BASE,
                        'target-arrow-shape': 'triangle',
                        'arrow-scale': 0.6,
                        'curve-style': 'bezier',
                        'opacity': 0.5,
                        'line-cap': 'round',
                        'transition-property': 'opacity, line-color, width',
                        'transition-duration': '0.15s',
                    },
                },
                // Click-toggled: dependency edges (outgoing — blue)
                {
                    selector: 'edge.click-dependency',
                    style: {
                        'line-color': EDGE_DEPENDENCY,
                        'target-arrow-color': EDGE_DEPENDENCY,
                        'width': 2.2,
                        'opacity': 1,
                        'line-style': 'dashed',
                        'line-dash-pattern': [8, 4],
                    },
                },
                // Click-toggled: dependent edges (incoming — purple)
                {
                    selector: 'edge.click-dependent',
                    style: {
                        'line-color': EDGE_DEPENDENT,
                        'target-arrow-color': EDGE_DEPENDENT,
                        'width': 2.2,
                        'opacity': 1,
                        'line-style': 'dashed',
                        'line-dash-pattern': [8, 4],
                    },
                },
                // Click-toggled: dimmed edges
                {
                    selector: 'edge.click-dim',
                    style: {
                        'opacity': 0.04,
                    },
                },
                {
                    selector: 'edge.highlighted',
                    style: {
                        'line-color': EDGE_HIGHLIGHT,
                        'target-arrow-color': EDGE_HIGHLIGHT,
                        'width': 2.2,
                        'opacity': 1,
                        'line-style': 'dashed',
                        'line-dash-pattern': [8, 4],
                    },
                },
                {
                    selector: 'edge.dimmed',
                    style: {
                        'opacity': 0.04,
                    },
                },
                // Search filter styles
                {
                    selector: 'node.search-dim',
                    style: {
                        'opacity': 0.1,
                    },
                },
                {
                    selector: 'node.search-match',
                    style: {
                        'border-width': 3,
                        'border-color': '#00f0ff',
                        'border-opacity': 0.9,
                    },
                },
                {
                    selector: 'edge.search-dim',
                    style: {
                        'opacity': 0.03,
                    },
                },
            ],
            layout: {
                name: 'cose-bilkent',
                animate: 'end',
                animationDuration: 800,
                animationEasing: 'ease-out',
                quality: 'default',
                nodeDimensionsIncludeLabels: true,
                idealEdgeLength,
                nodeRepulsion,
                edgeElasticity: 0.45,
                nestingFactor: 0.1,
                gravity,
                numIter,
                tile: true,
                tilingPaddingVertical: tilingPadding,
                tilingPaddingHorizontal: tilingPadding,
            },
            minZoom: 0.08,
            maxZoom: 5,
            userZoomingEnabled: false,
            pixelRatio: 'auto',
        });

        // ── Click on node: toggle highlight of connected nodes ─────
        cy.on('tap', 'node', (evt) => {
            const nodeId = evt.target.id();
            onNodeClick(nodeId);
        });

        // ── Click on glowing edge: analyze relationship ─────
        cy.on('tap', 'edge', (evt) => {
            const edge = evt.target;
            const isGlowing = edge.hasClass('click-dependency') || edge.hasClass('click-dependent') || edge.hasClass('highlighted');
            if (!isGlowing || !onEdgeClick) return;

            const sourceId = edge.source().id();
            const targetId = edge.target().id();
            const direction = edge.hasClass('click-dependency') ? 'dependency' : 'dependent';
            onEdgeClick(sourceId, targetId, direction);
        });

        // Click on background: deselect and clear blast radius
        cy.on('tap', (evt) => {
            if (evt.target === cy) {
                cy.elements().removeClass('highlighted dimmed click-neighbor click-dim click-dependency click-dependent');
                const store = useStore.getState();
                if (store.highlightedNodes.length > 0) {
                    store.setHighlightedNodes([]);
                    store.setBlastRadiusMode(false, null);
                }
                onNodeClick(null);
            }
        });

        // Double-click on background: fit to view
        cy.on('dbltap', (evt) => {
            if (evt.target === cy) {
                cy.animate({ fit: { padding: 50 }, duration: 400, easing: 'ease-out-cubic' });
            }
        });

        // ── Smooth wheel zoom ─────────────────────────────────────
        const LERP = 0.2;
        const container = containerRef.current;

        const updateZoomLabel = () => {
            if (zoomLabelRef.current) {
                zoomLabelRef.current.textContent = `${Math.round(cy.zoom() * 100)}%`;
            }
        };

        const zoomLoop = () => {
            if (zoomTargetRef.current === null) {
                zoomFrameRef.current = null;
                return;
            }

            const current = cy.zoom();
            const target = zoomTargetRef.current;
            const diff = target - current;

            if (Math.abs(diff) < 0.0005) {
                cy.zoom({ level: target, renderedPosition: zoomMouseRef.current });
                zoomTargetRef.current = null;
                zoomFrameRef.current = null;
            } else {
                cy.zoom({ level: current + diff * LERP, renderedPosition: zoomMouseRef.current });
                zoomFrameRef.current = requestAnimationFrame(zoomLoop);
            }
            updateZoomLabel();
        };

        const wheelHandler = (e) => {
            e.preventDefault();
            if (!container) return;

            cy.stop();

            const rect = container.getBoundingClientRect();
            zoomMouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };

            let delta = -e.deltaY;
            if (e.deltaMode === 1) delta *= 30;
            if (e.deltaMode === 2) delta *= 300;

            const factor = Math.exp(delta * 0.001);
            const base = zoomTargetRef.current ?? cy.zoom();
            zoomTargetRef.current = Math.max(cy.minZoom(), Math.min(cy.maxZoom(), base * factor));

            if (!zoomFrameRef.current) {
                zoomFrameRef.current = requestAnimationFrame(zoomLoop);
            }
        };

        container.addEventListener('wheel', wheelHandler, { passive: false });
        cy.on('zoom', updateZoomLabel);

        // Drag-to-Pan cursor (#20)
        containerRef.current.style.cursor = 'grab';
        cy.on('mousedown', (evt) => {
            if (evt.target === cy) {
                containerRef.current.style.cursor = 'grabbing';
            }
        });
        cy.on('mouseup', (evt) => {
            if (evt.target === cy) {
                containerRef.current.style.cursor = 'grab';
            }
        });

        // Hover: show tooltip only
        cy.on('mouseover', 'node', (evt) => {
            const node = evt.target;
            containerRef.current.style.cursor = 'pointer';
            setTooltip(node.data());
            const renderedPos = node.renderedPosition();
            setTooltipPos({ x: renderedPos.x, y: renderedPos.y });
        });

        cy.on('mouseout', 'node', () => {
            containerRef.current.style.cursor = 'grab';
            setTooltip(null);
        });

        cy.on('mouseover', 'edge', (evt) => {
            const edge = evt.target;
            if (edge.hasClass('click-dependency') || edge.hasClass('click-dependent') || edge.hasClass('highlighted')) {
                containerRef.current.style.cursor = 'pointer';
            }
        });

        cy.on('mouseout', 'edge', () => {
            if (!containerRef.current) return;
            containerRef.current.style.cursor = 'grab';
        });

        // Pulse high-risk nodes
        const highRisk = cy.nodes().filter((n) => n.data('riskLevel') === 'high');
        if (highRisk.length) {
            let on = false;
            const pulseInterval = setInterval(() => {
                on = !on;
                if (on) highRisk.addClass('high-risk-pulse');
                else highRisk.removeClass('high-risk-pulse');
            }, 1200);
            cy.one('destroy', () => clearInterval(pulseInterval));
        }

        // Smooth fit after layout
        cy.one('layoutstop', () => {
            cy.animate({ fit: { padding: 50 }, duration: 400, easing: 'ease-out-cubic' });
        });

        cyRef.current = cy;

        return () => {
            container.removeEventListener('wheel', wheelHandler);
            if (zoomFrameRef.current) cancelAnimationFrame(zoomFrameRef.current);
            zoomTargetRef.current = null;
            cy.destroy();
            cyRef.current = null;
        };
    }, [elements]);

    // ── Handle selection + click-highlight toggle ─────────────────
    useEffect(() => {
        if (!cyRef.current) return;
        const cy = cyRef.current;

        // Clear previous click-highlight state
        cy.elements().removeClass('click-neighbor click-dim click-dependency click-dependent');
        cy.nodes().unselect();
        cy.edges().removeClass('highlighted');

        if (selectedNode) {
            const node = cy.getElementById(selectedNode);
            if (node.length) {
                node.select();

                // Highlight connected nodes, dim the rest
                const neighborhood = node.closedNeighborhood();
                neighborhood.nodes().not(node).addClass('click-neighbor');

                // Color edges by direction:
                // Dependencies (outgoing) = blue, Dependents (incoming) = purple
                neighborhood.edges().forEach((edge) => {
                    if (edge.source().id() === selectedNode) {
                        edge.addClass('click-dependency');   // this file imports → blue
                    } else {
                        edge.addClass('click-dependent');    // imports this file → purple
                    }
                });

                cy.elements().not(neighborhood).addClass('click-dim');
            }
        }
    }, [selectedNode]);

    // Handle blast radius highlighting (overrides click-highlight)
    useEffect(() => {
        if (!cyRef.current) return;
        const cy = cyRef.current;

        cy.nodes().removeClass('highlighted dimmed');
        cy.edges().removeClass('highlighted dimmed');

        if (highlightedNodes.length > 0) {
            // Also clear click states during blast radius
            cy.elements().removeClass('click-neighbor click-dim click-highlight');

            const highlightSet = new Set(highlightedNodes);

            cy.nodes().forEach((node) => {
                if (highlightSet.has(node.id()) || node.id() === selectedNode) {
                    node.addClass('highlighted');
                } else {
                    node.addClass('dimmed');
                }
            });

            cy.edges().forEach((edge) => {
                const src = edge.source().id();
                const tgt = edge.target().id();
                if (highlightSet.has(src) || highlightSet.has(tgt) || src === selectedNode || tgt === selectedNode) {
                    edge.addClass('highlighted');
                } else {
                    edge.addClass('dimmed');
                }
            });
        }
    }, [highlightedNodes, selectedNode]);

    const handleFitView = useCallback(() => {
        if (cyRef.current) {
            cyRef.current.animate({ fit: { padding: 50 }, duration: 400, easing: 'ease-out-cubic' });
        }
    }, []);

    const handleZoomIn = useCallback(() => {
        if (cyRef.current) {
            const cy = cyRef.current;
            const center = { x: cy.width() / 2, y: cy.height() / 2 };
            cy.animate({ zoom: { level: cy.zoom() * 1.3, renderedPosition: center }, duration: 300, easing: 'ease-out-cubic' });
        }
    }, []);

    const handleZoomOut = useCallback(() => {
        if (cyRef.current) {
            const cy = cyRef.current;
            const center = { x: cy.width() / 2, y: cy.height() / 2 };
            cy.animate({ zoom: { level: cy.zoom() / 1.3, renderedPosition: center }, duration: 300, easing: 'ease-out-cubic' });
        }
    }, []);

    // Keyboard shortcuts
    useEffect(() => {
        const handler = (e) => {
            if (e.key === 'Escape') {
                if (cyRef.current) {
                    cyRef.current.elements().removeClass('highlighted dimmed click-neighbor click-dim click-dependency click-dependent');
                }
                const store = useStore.getState();
                if (store.highlightedNodes.length > 0) {
                    store.setHighlightedNodes([]);
                    store.setBlastRadiusMode(false, null);
                }
                onNodeClick(null);
                store.setSearchQuery('');
            }
            // F: fit view (when not typing)
            if (e.key === 'f' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'INPUT') {
                handleFitView();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onNodeClick, handleFitView]);

    return (
        <div className="relative w-full h-full">
            {/* Particle background */}
            <ParticleCanvas />

            {/* Search bar */}
            <GraphSearchBar cyRef={cyRef} />

            {/* Graph container */}
            <div ref={containerRef} className="w-full h-full" style={{ position: 'relative', zIndex: 1 }} />

            {/* Tooltip */}
            <GraphTooltip data={tooltip} position={tooltipPos} />

            {/* Graph controls */}
            <div className="graph-controls">
                <button onClick={handleZoomIn} className="graph-control-btn" title="Zoom in">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        <line x1="11" y1="8" x2="11" y2="14" />
                        <line x1="8" y1="11" x2="14" y2="11" />
                    </svg>
                </button>
                <span ref={zoomLabelRef} style={{
                    fontSize: '0.6rem',
                    fontFamily: "'JetBrains Mono', monospace",
                    color: 'var(--text-muted)',
                    textAlign: 'center',
                    minWidth: 36,
                    display: 'block',
                }}>100%</span>
                <button onClick={handleZoomOut} className="graph-control-btn" title="Zoom out">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        <line x1="8" y1="11" x2="14" y2="11" />
                    </svg>
                </button>
                <button onClick={handleFitView} className="graph-control-btn" title="Fit to view (F)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                        <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
                        <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                        <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
                    </svg>
                </button>
            </div>

            {/* Legend */}
            <Legend />
        </div>
    );
}
