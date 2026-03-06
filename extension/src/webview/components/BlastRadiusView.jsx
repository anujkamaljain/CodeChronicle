import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import useStore from '../store/useStore';

export default function BlastRadiusView({ graph, onNodeClick, onOpenFile, selectedNode }) {
    const { blastRadiusData } = useStore();

    // If we have graph and a selected node, compute blast radius locally
    const blastData = useMemo(() => {
        if (blastRadiusData) return blastRadiusData;
        if (!graph || !selectedNode) return null;

        // Compute locally using reverse adjacency
        const reverseAdj = {};
        for (const id of Object.keys(graph.nodes)) reverseAdj[id] = [];
        for (const edge of graph.edges) {
            if (reverseAdj[edge.target]) reverseAdj[edge.target].push(edge.source);
        }

        const visited = new Set([selectedNode]);
        const queue = [{ id: selectedNode, depth: 0 }];
        const direct = [];
        const indirect = [];

        while (queue.length > 0) {
            const { id, depth } = queue.shift();
            for (const depId of (reverseAdj[id] || [])) {
                if (!visited.has(depId)) {
                    visited.add(depId);
                    if (depth === 0) direct.push(depId);
                    else indirect.push(depId);
                    queue.push({ id: depId, depth: depth + 1 });
                }
            }
        }

        return {
            sourceNode: selectedNode,
            directDependents: direct,
            indirectDependents: indirect,
            affectedNodes: [...direct, ...indirect],
            impactScore: graph ? ((direct.length + indirect.length) / Math.max(Object.keys(graph.nodes).length - 1, 1) * 100).toFixed(1) : 0,
        };
    }, [graph, selectedNode, blastRadiusData]);

    if (!graph) {
        return (
            <div className="flex items-center justify-center h-full">
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Scan workspace first to view blast radius.
                </p>
            </div>
        );
    }

    if (!selectedNode) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center">
                    <div className="text-5xl mb-4 opacity-30">◎</div>
                    <h3 className="text-lg font-semibold mb-2 text-gradient">Blast Radius Analysis</h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        Select a file from the Graph tab to analyze its blast radius.
                    </p>
                </div>
            </div>
        );
    }

    const sourceNode = graph.nodes[selectedNode];
    const totalAffected = blastData ? blastData.affectedNodes.length : 0;

    return (
        <div className="h-full overflow-auto p-4">
            {/* Header banner */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card p-4 mb-4"
                style={{ borderColor: 'rgba(168, 85, 247, 0.3)', border: '1px solid rgba(168, 85, 247, 0.3)' }}
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center pulse-ring flex-shrink-0"
                        style={{ background: 'rgba(168, 85, 247, 0.15)', border: '1px solid rgba(168, 85, 247, 0.4)' }}>
                        <span className="text-lg" style={{ color: 'var(--neon-purple)' }}>◎</span>
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-sm font-bold truncate" style={{ color: 'var(--neon-purple)' }}>
                            Blast Radius: {sourceNode?.label}
                        </h3>
                        <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                            {sourceNode?.path}
                        </p>
                    </div>
                </div>
            </motion.div>

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <StatCard value={blastData?.directDependents?.length || 0} label="Direct" color="var(--neon-purple)" delay={0} />
                <StatCard value={blastData?.indirectDependents?.length || 0} label="Indirect" color="var(--neon-orange, #f97316)" delay={0.05} />
                <StatCard value={totalAffected} label="Total Impact" color="var(--risk-high)" delay={0.1} />
                <StatCard value={`${blastData?.impactScore || 0}%`} label="Impact Score" color="var(--neon-cyan)" delay={0.15} />
            </div>

            {/* Direct dependents */}
            {blastData?.directDependents?.length > 0 && (
                <div className="mb-4">
                    <h4 className="text-xs font-semibold mb-2 uppercase tracking-widest"
                        style={{ color: 'var(--text-muted)' }}>
                        Direct Dependents ({blastData.directDependents.length})
                    </h4>
                    <div className="space-y-1.5">
                        {blastData.directDependents.map((dep, i) => (
                            <DependentItem
                                key={dep}
                                node={graph.nodes[dep]}
                                index={i}
                                onOpenFile={onOpenFile}
                                onNodeClick={onNodeClick}
                                isDirect
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Indirect dependents */}
            {blastData?.indirectDependents?.length > 0 && (
                <div className="mb-4">
                    <h4 className="text-xs font-semibold mb-2 uppercase tracking-widest"
                        style={{ color: 'var(--text-muted)' }}>
                        Indirect Dependents ({blastData.indirectDependents.length})
                    </h4>
                    <div className="space-y-1.5">
                        {blastData.indirectDependents.map((dep, i) => (
                            <DependentItem
                                key={dep}
                                node={graph.nodes[dep]}
                                index={i}
                                onOpenFile={onOpenFile}
                                onNodeClick={onNodeClick}
                                isDirect={false}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* No dependents */}
            {totalAffected === 0 && (
                <div className="glass-card p-6 text-center">
                    <div className="text-3xl mb-3" style={{ color: 'var(--neon-green)' }}>✓</div>
                    <h4 className="text-sm font-semibold mb-1" style={{ color: 'var(--neon-green)' }}>Safe to Modify</h4>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        No other files depend on this file. Changes are isolated.
                    </p>
                </div>
            )}
        </div>
    );
}

function StatCard({ value, label, color, delay }) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay, duration: 0.2 }}
            className="glass-card-sm p-3 text-center"
        >
            <div className="text-xl font-bold font-mono" style={{ color }}>{value}</div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{label}</div>
        </motion.div>
    );
}

function DependentItem({ node, index, onOpenFile, onNodeClick, isDirect }) {
    if (!node) return null;

    const risk = node.riskFactor || node.localRisk;
    const borderColor = isDirect ? 'rgba(168, 85, 247, 0.2)' : 'rgba(249, 115, 22, 0.2)';

    return (
        <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.03 }}
            className="glass-card-sm p-3 flex items-center gap-3 cursor-pointer hover:border-opacity-50 transition-all"
            style={{ borderColor }}
            onClick={() => onNodeClick(node.id)}
        >
            <div className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: isDirect ? 'var(--neon-purple)' : '#f97316' }} />
            <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {node.label}
                </div>
                <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                    {node.directory}
                </div>
            </div>
            {risk && (
                <span className={`risk-badge risk-badge-${risk.level}`} style={{ fontSize: '0.6rem' }}>
                    {risk.level}
                </span>
            )}
            <button
                onClick={(e) => { e.stopPropagation(); onOpenFile(node.path); }}
                className="text-xs px-2 py-1 rounded"
                style={{ color: 'var(--neon-cyan)', background: 'rgba(0, 240, 255, 0.08)' }}
            >
                Open
            </button>
        </motion.div>
    );
}
