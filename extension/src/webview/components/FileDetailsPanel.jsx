import React from 'react';
import { motion } from 'framer-motion';
import useStore from '../store/useStore';

export default function FileDetailsPanel({ onOpenFile, onBlastRadius, onRequestRisk }) {
    const { selectedNode, nodeDetails, nodeSummary, nodeRisk, setSidebarOpen } = useStore();

    if (!nodeDetails) return null;

    const { metrics, path, label, extension, directory } = nodeDetails;
    const risk = nodeRisk || nodeDetails.riskFactor || nodeDetails.localRisk;

    const riskBadgeClass = risk
        ? `risk-badge risk-badge-${risk.level}`
        : 'risk-badge risk-badge-low';

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="w-[340px] h-full overflow-y-auto p-4"
            style={{ background: 'var(--bg-secondary)' }}
        >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold truncate" style={{ color: 'var(--neon-cyan)' }}>
                        {label}
                    </h3>
                    <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                        {directory}
                    </p>
                </div>
                <button
                    onClick={() => setSidebarOpen(false)}
                    className="ml-2 w-6 h-6 flex items-center justify-center rounded text-xs"
                    style={{ color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)' }}
                >
                    ✕
                </button>
            </div>

            {/* Extension badge */}
            <div className="flex items-center gap-2 mb-4">
                <span className="text-xs px-2 py-0.5 rounded-full font-mono"
                    style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.25)' }}>
                    {extension}
                </span>
                <span className={riskBadgeClass}>
                    {risk ? `${risk.level} risk` : 'analyzing...'}
                </span>
            </div>

            <div className="separator" />

            {/* Metrics grid */}
            <div className="mb-4">
                <h4 className="text-xs font-semibold mb-3 uppercase tracking-widest"
                    style={{ color: 'var(--text-muted)' }}>
                    Metrics
                </h4>
                <div className="grid grid-cols-2 gap-2">
                    <MetricCard value={metrics.linesOfCode} label="Lines of Code" color="var(--neon-cyan)" />
                    <MetricCard value={metrics.dependencyCount} label="Dependencies" color="var(--neon-blue)" />
                    <MetricCard value={metrics.dependentCount} label="Dependents" color="var(--neon-purple)" />
                    <MetricCard value={(metrics.centralityScore * 100).toFixed(0) + '%'} label="Centrality" color="var(--neon-green)" />
                </div>
            </div>

            {/* Risk Score */}
            {risk && (
                <>
                    <div className="separator" />
                    <div className="mb-4">
                        <h4 className="text-xs font-semibold mb-3 uppercase tracking-widest"
                            style={{ color: 'var(--text-muted)' }}>
                            Risk Assessment
                        </h4>
                        {/* Score bar */}
                        <div className="mb-3">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Risk Score</span>
                                <span className="text-sm font-bold font-mono"
                                    style={{ color: risk.level === 'high' ? 'var(--risk-high)' : risk.level === 'medium' ? 'var(--risk-medium)' : 'var(--risk-low)' }}>
                                    {risk.score}/100
                                </span>
                            </div>
                            <div className="w-full h-2 rounded-full overflow-hidden"
                                style={{ background: 'rgba(255,255,255,0.05)' }}>
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${risk.score}%` }}
                                    transition={{ duration: 0.8, ease: 'easeOut' }}
                                    className="h-full rounded-full"
                                    style={{
                                        background: risk.level === 'high'
                                            ? 'linear-gradient(90deg, #f59e0b, #ef4444)'
                                            : risk.level === 'medium'
                                                ? 'linear-gradient(90deg, #10b981, #f59e0b)'
                                                : 'linear-gradient(90deg, #3b82f6, #10b981)',
                                        boxShadow: `0 0 12px ${risk.level === 'high' ? '#ef4444' : risk.level === 'medium' ? '#f59e0b' : '#10b981'}40`,
                                    }}
                                />
                            </div>
                        </div>

                        {/* Risk factors */}
                        {risk.factors && risk.factors.length > 0 && (
                            <div className="space-y-1.5">
                                {risk.factors.map((factor, i) => (
                                    <div key={i} className="flex items-start gap-2">
                                        <span className="text-xs mt-0.5" style={{ color: 'var(--risk-medium)' }}>▸</span>
                                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{factor}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* AI Summary */}
            <div className="separator" />
            <div className="mb-4">
                <h4 className="text-xs font-semibold mb-3 uppercase tracking-widest flex items-center gap-2"
                    style={{ color: 'var(--text-muted)' }}>
                    AI Summary
                    {nodeSummary && (
                        <span className="text-xs px-1.5 py-0.5 rounded"
                            style={{ background: 'rgba(16, 185, 129, 0.12)', color: 'var(--neon-green)', fontSize: '0.6rem' }}>
                            CACHED
                        </span>
                    )}
                </h4>
                {nodeSummary ? (
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                        {nodeSummary}
                    </p>
                ) : (
                    <div className="glass-card-sm p-3">
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            Enable Cloud AI in settings to get AI-powered file summaries.
                        </p>
                    </div>
                )}
            </div>

            <div className="separator" />

            {/* Action buttons */}
            <div className="space-y-2 mt-4">
                <button
                    onClick={() => onOpenFile(path)}
                    className="btn-neon w-full text-center"
                >
                    Open in Editor
                </button>
                <button
                    onClick={() => onBlastRadius(selectedNode)}
                    className="btn-neon-purple w-full text-center"
                >
                    Show Blast Radius
                </button>
                <button
                    onClick={() => onRequestRisk(selectedNode)}
                    className="btn-neon-green w-full text-center"
                >
                    Analyze Risk
                </button>
            </div>
        </motion.div>
    );
}

function MetricCard({ value, label, color }) {
    return (
        <div className="metric-pill">
            <span className="metric-value" style={{ color }}>{value}</span>
            <span className="metric-label">{label}</span>
        </div>
    );
}
