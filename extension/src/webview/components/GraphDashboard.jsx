import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import cytoscape from 'cytoscape';
import coseBilkent from 'cytoscape-cose-bilkent';
import useStore from '../store/useStore';

// Register layout
cytoscape.use(coseBilkent);

// Risk color mapping
const RISK_COLORS = {
    low: '#10b981',
    medium: '#f59e0b',
    high: '#ef4444',
};

const DEFAULT_COLOR = '#3b82f6';
const SELECTED_COLOR = '#00f0ff';
const EDGE_COLOR = 'rgba(148, 163, 184, 0.15)';
const EDGE_HIGHLIGHT = 'rgba(0, 240, 255, 0.5)';

export default function GraphDashboard({ graph, onNodeClick, onBlastRadius, selectedNode }) {
    const cyRef = useRef(null);
    const containerRef = useRef(null);
    const { highlightedNodes, blastRadiusMode } = useStore();

    // Convert graph data to Cytoscape elements
    const elements = useMemo(() => {
        if (!graph) return [];

        const nodes = Object.values(graph.nodes).map((node) => {
            const risk = node.riskFactor || node.localRisk;
            const riskLevel = risk?.level || 'low';
            const size = Math.max(20, Math.min(60, 20 + (node.metrics.centralityScore || 0) * 40 + (node.metrics.dependentCount || 0) * 2));

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
                    color: RISK_COLORS[riskLevel] || DEFAULT_COLOR,
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

        const cy = cytoscape({
            container: containerRef.current,
            elements,
            style: [
                {
                    selector: 'node',
                    style: {
                        'background-color': 'data(color)',
                        'width': 'data(size)',
                        'height': 'data(size)',
                        'label': 'data(label)',
                        'color': '#e2e8f0',
                        'font-size': '9px',
                        'font-family': 'Inter, sans-serif',
                        'font-weight': '500',
                        'text-valign': 'bottom',
                        'text-halign': 'center',
                        'text-margin-y': 6,
                        'text-max-width': '80px',
                        'text-wrap': 'ellipsis',
                        'border-width': 2,
                        'border-color': 'data(color)',
                        'border-opacity': 0.4,
                        'background-opacity': 0.85,
                        'overlay-opacity': 0,
                        'shadow-blur': 15,
                        'shadow-color': 'data(color)',
                        'shadow-opacity': 0.25,
                        'shadow-offset-x': 0,
                        'shadow-offset-y': 0,
                        'transition-property': 'background-color, border-color, width, height, shadow-blur, shadow-opacity, opacity',
                        'transition-duration': '0.2s',
                        'transition-timing-function': 'ease-in-out-sine',
                    },
                },
                {
                    selector: 'node:selected',
                    style: {
                        'background-color': SELECTED_COLOR,
                        'border-color': SELECTED_COLOR,
                        'border-width': 3,
                        'shadow-blur': 30,
                        'shadow-color': SELECTED_COLOR,
                        'shadow-opacity': 0.6,
                        'font-weight': '700',
                        'color': SELECTED_COLOR,
                    },
                },
                {
                    selector: 'node.highlighted',
                    style: {
                        'border-color': '#a855f7',
                        'border-width': 3,
                        'shadow-color': '#a855f7',
                        'shadow-opacity': 0.5,
                        'shadow-blur': 20,
                    },
                },
                {
                    selector: 'node.dimmed',
                    style: {
                        'opacity': 0.15,
                    },
                },
                {
                    selector: 'edge',
                    style: {
                        'width': 1,
                        'line-color': EDGE_COLOR,
                        'target-arrow-color': EDGE_COLOR,
                        'target-arrow-shape': 'triangle',
                        'arrow-scale': 0.7,
                        'curve-style': 'bezier',
                        'opacity': 0.6,
                        'transition-property': 'line-color, target-arrow-color, opacity, width',
                        'transition-duration': '0.2s',
                    },
                },
                {
                    selector: 'edge.highlighted',
                    style: {
                        'line-color': EDGE_HIGHLIGHT,
                        'target-arrow-color': EDGE_HIGHLIGHT,
                        'width': 2,
                        'opacity': 1,
                    },
                },
                {
                    selector: 'edge.dimmed',
                    style: {
                        'opacity': 0.05,
                    },
                },
            ],
            layout: {
                name: 'cose-bilkent',
                animate: false,
                quality: 'default',
                nodeDimensionsIncludeLabels: true,
                idealEdgeLength: 100,
                nodeRepulsion: 8000,
                edgeElasticity: 0.45,
                nestingFactor: 0.1,
                gravity: 0.25,
                numIter: 2500,
                tile: true,
                tilingPaddingVertical: 20,
                tilingPaddingHorizontal: 20,
            },
            minZoom: 0.1,
            maxZoom: 5,
            wheelSensitivity: 0.3,
        });

        // Event handlers
        cy.on('tap', 'node', (evt) => {
            const nodeId = evt.target.id();
            onNodeClick(nodeId);
        });

        cy.on('tap', (evt) => {
            if (evt.target === cy) {
                onNodeClick(null);
            }
        });

        // Hover effects
        cy.on('mouseover', 'node', (evt) => {
            const node = evt.target;
            node.style('shadow-blur', 25);
            node.style('shadow-opacity', 0.5);
            containerRef.current.style.cursor = 'pointer';
        });

        cy.on('mouseout', 'node', (evt) => {
            const node = evt.target;
            if (!node.selected()) {
                node.style('shadow-blur', 15);
                node.style('shadow-opacity', 0.25);
            }
            containerRef.current.style.cursor = 'default';
        });

        cyRef.current = cy;

        return () => {
            cy.destroy();
            cyRef.current = null;
        };
    }, [elements]);

    // Handle selection changes
    useEffect(() => {
        if (!cyRef.current) return;
        const cy = cyRef.current;

        cy.nodes().unselect();
        if (selectedNode) {
            const node = cy.getElementById(selectedNode);
            if (node.length) {
                node.select();

                // Highlight connected edges
                cy.edges().removeClass('highlighted');
                node.connectedEdges().addClass('highlighted');
            }
        } else {
            cy.edges().removeClass('highlighted');
        }
    }, [selectedNode]);

    // Handle blast radius highlighting
    useEffect(() => {
        if (!cyRef.current) return;
        const cy = cyRef.current;

        cy.nodes().removeClass('highlighted dimmed');
        cy.edges().removeClass('highlighted dimmed');

        if (highlightedNodes.length > 0) {
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
            cyRef.current.fit(undefined, 50);
            cyRef.current.animate({ zoom: cyRef.current.zoom() * 0.9, duration: 300 });
        }
    }, []);

    const handleZoomIn = useCallback(() => {
        if (cyRef.current) {
            cyRef.current.animate({ zoom: cyRef.current.zoom() * 1.3, duration: 200 });
        }
    }, []);

    const handleZoomOut = useCallback(() => {
        if (cyRef.current) {
            cyRef.current.animate({ zoom: cyRef.current.zoom() * 0.7, duration: 200 });
        }
    }, []);

    return (
        <div className="relative w-full h-full">
            {/* Graph container */}
            <div ref={containerRef} className="w-full h-full" />

            {/* Graph controls */}
            <div className="absolute bottom-4 left-4 flex flex-col gap-2">
                <button onClick={handleZoomIn} className="glass-card-sm w-9 h-9 flex items-center justify-center text-sm hover:border-neon-cyan transition-all" style={{ color: 'var(--text-secondary)' }}>
                    +
                </button>
                <button onClick={handleZoomOut} className="glass-card-sm w-9 h-9 flex items-center justify-center text-sm hover:border-neon-cyan transition-all" style={{ color: 'var(--text-secondary)' }}>
                    −
                </button>
                <button onClick={handleFitView} className="glass-card-sm w-9 h-9 flex items-center justify-center text-xs hover:border-neon-cyan transition-all" style={{ color: 'var(--text-secondary)' }} title="Fit to view">
                    ⊞
                </button>
            </div>

            {/* Legend */}
            <div className="absolute bottom-4 right-4 glass-card-sm p-3">
                <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>RISK LEVELS</div>
                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ background: RISK_COLORS.low, boxShadow: `0 0 8px ${RISK_COLORS.low}50` }} />
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Low Risk</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ background: RISK_COLORS.medium, boxShadow: `0 0 8px ${RISK_COLORS.medium}50` }} />
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Medium Risk</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ background: RISK_COLORS.high, boxShadow: `0 0 8px ${RISK_COLORS.high}50` }} />
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>High Risk</span>
                    </div>
                </div>
            </div>

            {/* Node tooltip on hover - rendered via Cytoscape's built-in */}
        </div>
    );
}
