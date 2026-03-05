import React, { useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useStore from '../store/useStore';

const SECTION_META = {
    'Purpose & Overview': { icon: '◉', color: '#06b6d4' },
    'Key Components': { icon: '⬡', color: '#3b82f6' },
    'Architecture Role': { icon: '△', color: '#a855f7' },
    'Dependency Analysis': { icon: '◎', color: '#ec4899' },
    'Data Flow & State Management': { icon: '⇄', color: '#10b981' },
    'Risk & Complexity': { icon: '!', color: '#f59e0b' },
    'Improvement Suggestions': { icon: '✦', color: '#22d3ee' },
};

function parseSections(text) {
    if (!text) return [];
    const sectionKeys = Object.keys(SECTION_META);
    const sections = [];
    const regex = new RegExp(`(${sectionKeys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*:`, 'g');

    let match;
    const positions = [];
    while ((match = regex.exec(text)) !== null) {
        positions.push({ title: match[1], start: match.index, headerEnd: match.index + match[0].length });
    }

    for (let i = 0; i < positions.length; i++) {
        const contentStart = positions[i].headerEnd;
        const contentEnd = i + 1 < positions.length ? positions[i + 1].start : text.length;
        const body = text.substring(contentStart, contentEnd).trim();
        if (body) {
            sections.push({ title: positions[i].title, body });
        }
    }

    if (sections.length === 0 && text.trim()) {
        sections.push({ title: 'Analysis', body: text.trim() });
    }

    return sections;
}

export default function DetailedSummaryModal() {
    const {
        showDetailedModal, setShowDetailedModal,
        nodeDetailedSummary, loadingDetailedSummary, detailedSummaryCached,
        nodeDetails, selectedNode,
    } = useStore();

    useEffect(() => {
        const handler = (e) => {
            if (e.key === 'Escape' && showDetailedModal) {
                setShowDetailedModal(false);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [showDetailedModal, setShowDetailedModal]);

    const sections = useMemo(() => parseSections(nodeDetailedSummary), [nodeDetailedSummary]);
    const metrics = nodeDetails?.metrics;

    return (
        <AnimatePresence>
            {showDetailedModal && (
                <motion.div
                    className="detailed-modal-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    onClick={() => setShowDetailedModal(false)}
                >
                    <motion.div
                        className="detailed-modal"
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="detailed-modal-header">
                            <div className="detailed-modal-file-info">
                                <h2 className="detailed-modal-filename">
                                    {nodeDetails?.label || 'File Analysis'}
                                </h2>
                                <div className="detailed-modal-meta">
                                    {nodeDetails?.extension && (
                                        <span className="detailed-modal-ext">{nodeDetails.extension}</span>
                                    )}
                                    {nodeDetails?.directory && (
                                        <span className="detailed-modal-dir">{nodeDetails.directory}</span>
                                    )}
                                </div>
                            </div>
                            <button
                                className="detailed-modal-close"
                                onClick={() => setShowDetailedModal(false)}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Metrics row */}
                        {metrics && (
                            <div className="detailed-modal-metrics">
                                <MetricChip label="LOC" value={metrics.linesOfCode} color="#06b6d4" />
                                <MetricChip label="Dependencies" value={metrics.dependencyCount} color="#3b82f6" />
                                <MetricChip label="Dependents" value={metrics.dependentCount} color="#a855f7" />
                                <MetricChip label="Centrality" value={`${((metrics.centralityScore || 0) * 100).toFixed(0)}%`} color="#10b981" />
                                {nodeDetails?.localRisk && (
                                    <MetricChip
                                        label="Risk"
                                        value={`${nodeDetails.localRisk.level?.toUpperCase()} (${nodeDetails.localRisk.score})`}
                                        color={nodeDetails.localRisk.level === 'high' ? '#ef4444' : nodeDetails.localRisk.level === 'medium' ? '#f59e0b' : '#10b981'}
                                    />
                                )}
                            </div>
                        )}

                        {detailedSummaryCached && nodeDetailedSummary && (
                            <div className="detailed-modal-cached-badge">CACHED</div>
                        )}

                        {/* Body */}
                        <div className="detailed-modal-body">
                            {loadingDetailedSummary && !nodeDetailedSummary ? (
                                <div className="detailed-modal-loading">
                                    <span className="btn-spinner" style={{ width: 20, height: 20, borderWidth: 2.5, color: 'var(--neon-cyan)' }} />
                                    <p>Generating detailed analysis...</p>
                                    <p className="detailed-modal-loading-sub">This may take a moment for thorough results</p>
                                </div>
                            ) : sections.length > 0 ? (
                                sections.map((section, i) => {
                                    const meta = SECTION_META[section.title] || { icon: '●', color: '#8b5cf6' };
                                    return (
                                        <motion.div
                                            key={section.title}
                                            className="detailed-modal-section"
                                            initial={{ opacity: 0, y: 12 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: i * 0.06, duration: 0.25 }}
                                        >
                                            <div className="detailed-modal-section-header" style={{ '--section-color': meta.color }}>
                                                <span className="detailed-modal-section-icon" style={{ color: meta.color }}>
                                                    {meta.icon}
                                                </span>
                                                <h3 className="detailed-modal-section-title">{section.title}</h3>
                                            </div>
                                            <p className="detailed-modal-section-body">{section.body}</p>
                                        </motion.div>
                                    );
                                })
                            ) : (
                                <div className="detailed-modal-loading">
                                    <p style={{ color: 'var(--text-muted)' }}>No detailed summary available yet.</p>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

function MetricChip({ label, value, color }) {
    return (
        <div className="detailed-modal-metric-chip">
            <span className="detailed-modal-metric-value" style={{ color }}>{value}</span>
            <span className="detailed-modal-metric-label">{label}</span>
        </div>
    );
}
