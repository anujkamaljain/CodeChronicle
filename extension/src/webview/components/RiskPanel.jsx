import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

export default function RiskPanel({ graph, onNodeClick, onRequestRisk, onOpenFile }) {
    const riskData = useMemo(() => {
        if (!graph) return null;

        const nodes = Object.values(graph.nodes);
        const low = [];
        const medium = [];
        const high = [];

        for (const node of nodes) {
            const risk = node.riskFactor || node.localRisk;
            if (!risk) { low.push(node); continue; }
            switch (risk.level) {
                case 'high': high.push(node); break;
                case 'medium': medium.push(node); break;
                default: low.push(node); break;
            }
        }

        // Sort each by risk score descending
        const sortByScore = (a, b) => {
            const sa = (a.riskFactor || a.localRisk)?.score || 0;
            const sb = (b.riskFactor || b.localRisk)?.score || 0;
            return sb - sa;
        };

        high.sort(sortByScore);
        medium.sort(sortByScore);
        low.sort(sortByScore);

        const total = nodes.length;
        return {
            low, medium, high, total,
            lowPct: total ? ((low.length / total) * 100).toFixed(0) : 0,
            mediumPct: total ? ((medium.length / total) * 100).toFixed(0) : 0,
            highPct: total ? ((high.length / total) * 100).toFixed(0) : 0,
        };
    }, [graph]);

    if (!graph || !riskData) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center">
                    <div className="text-5xl mb-4 opacity-30">△</div>
                    <h3 className="text-lg font-semibold mb-2 text-gradient">Risk Overview</h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        Scan workspace first to view risk analysis.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-4">
            {/* Header */}
            <div className="text-center">
                <h2 className="text-lg font-bold text-gradient mb-1">Risk Map</h2>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {riskData.total} files analyzed • Structural risk assessment
                </p>
            </div>

            {/* Risk distribution bar */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card p-4"
            >
                <h4 className="text-xs font-semibold mb-3 uppercase tracking-widest"
                    style={{ color: 'var(--text-muted)' }}>
                    Risk Distribution
                </h4>
                <div className="flex rounded-lg overflow-hidden h-6 mb-3"
                    style={{ background: 'rgba(255,255,255,0.03)' }}>
                    {riskData.high.length > 0 && (
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${riskData.highPct}%` }}
                            transition={{ duration: 0.6, ease: 'easeOut' }}
                            className="h-full flex items-center justify-center text-xs font-mono font-bold"
                            style={{ background: 'rgba(239, 68, 68, 0.6)', color: '#fca5a5', minWidth: riskData.high.length > 0 ? '30px' : 0 }}
                        >
                            {riskData.highPct}%
                        </motion.div>
                    )}
                    {riskData.medium.length > 0 && (
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${riskData.mediumPct}%` }}
                            transition={{ duration: 0.6, delay: 0.1, ease: 'easeOut' }}
                            className="h-full flex items-center justify-center text-xs font-mono font-bold"
                            style={{ background: 'rgba(245, 158, 11, 0.5)', color: '#fde68a', minWidth: riskData.medium.length > 0 ? '30px' : 0 }}
                        >
                            {riskData.mediumPct}%
                        </motion.div>
                    )}
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${riskData.lowPct}%` }}
                        transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
                        className="h-full flex items-center justify-center text-xs font-mono font-bold"
                        style={{ background: 'rgba(16, 185, 129, 0.4)', color: '#6ee7b7', minWidth: riskData.low.length > 0 ? '30px' : 0 }}
                    >
                        {riskData.lowPct}%
                    </motion.div>
                </div>

                {/* Legend stats */}
                <div className="grid grid-cols-3 gap-3">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ background: 'var(--risk-high)', boxShadow: '0 0 8px rgba(239, 68, 68, 0.4)' }} />
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            High: <span className="font-mono font-bold" style={{ color: 'var(--risk-high)' }}>{riskData.high.length}</span>
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ background: 'var(--risk-medium)', boxShadow: '0 0 8px rgba(245, 158, 11, 0.4)' }} />
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            Medium: <span className="font-mono font-bold" style={{ color: 'var(--risk-medium)' }}>{riskData.medium.length}</span>
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ background: 'var(--risk-low)', boxShadow: '0 0 8px rgba(16, 185, 129, 0.4)' }} />
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            Low: <span className="font-mono font-bold" style={{ color: 'var(--risk-low)' }}>{riskData.low.length}</span>
                        </span>
                    </div>
                </div>
            </motion.div>

            {/* High risk files */}
            {riskData.high.length > 0 && (
                <RiskSection
                    title="High Risk Files"
                    files={riskData.high}
                    color="var(--risk-high)"
                    borderColor="rgba(239, 68, 68, 0.2)"
                    onNodeClick={onNodeClick}
                    onOpenFile={onOpenFile}
                />
            )}

            {/* Medium risk files */}
            {riskData.medium.length > 0 && (
                <RiskSection
                    title="Medium Risk Files"
                    files={riskData.medium}
                    color="var(--risk-medium)"
                    borderColor="rgba(245, 158, 11, 0.2)"
                    onNodeClick={onNodeClick}
                    onOpenFile={onOpenFile}
                />
            )}

            {/* Low risk files (collapsed by default) */}
            {riskData.low.length > 0 && (
                <RiskSection
                    title="Low Risk Files"
                    files={riskData.low.slice(0, 20)}
                    color="var(--risk-low)"
                    borderColor="rgba(16, 185, 129, 0.2)"
                    onNodeClick={onNodeClick}
                    onOpenFile={onOpenFile}
                    collapsed
                    totalCount={riskData.low.length}
                />
            )}
        </div>
    );
}

function RiskSection({ title, files, color, borderColor, onNodeClick, onOpenFile, collapsed, totalCount }) {
    const [expanded, setExpanded] = React.useState(!collapsed);

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card overflow-hidden"
            style={{ borderColor }}
        >
            <div
                className="p-3 flex items-center justify-between cursor-pointer"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                    <h4 className="text-xs font-semibold uppercase tracking-widest" style={{ color }}>
                        {title}
                    </h4>
                    <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                        ({totalCount || files.length})
                    </span>
                </div>
                <span className="text-xs" style={{ color: 'var(--text-muted)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                    ▾
                </span>
            </div>

            {expanded && (
                <div className="px-3 pb-3 space-y-1">
                    {files.map((node, i) => {
                        const risk = node.riskFactor || node.localRisk;
                        return (
                            <motion.div
                                key={node.id}
                                initial={{ opacity: 0, x: -5 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.02 }}
                                className="flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all hover:bg-white hover:bg-opacity-5"
                                onClick={() => onNodeClick(node.id)}
                            >
                                <span className="text-xs font-mono font-bold w-8 text-right" style={{ color }}>
                                    {risk?.score || 0}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                                        {node.label}
                                    </div>
                                    <div className="text-xs truncate" style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>
                                        {node.directory}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                                        {node.metrics.linesOfCode} LOC
                                    </span>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onOpenFile(node.path); }}
                                        className="text-xs px-1.5 py-0.5 rounded"
                                        style={{ color: 'var(--neon-cyan)', background: 'rgba(0, 240, 255, 0.08)' }}
                                    >
                                        →
                                    </button>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            )}
        </motion.div>
    );
}
