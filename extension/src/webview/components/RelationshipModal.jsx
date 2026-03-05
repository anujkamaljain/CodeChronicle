import React, { useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useStore from '../store/useStore';

const SECTION_META = {
    'Connection Type': { icon: '⬡', color: '#3b82f6' },
    'What Gets Exchanged': { icon: '⇄', color: '#06b6d4' },
    "Why They're Connected": { icon: '◉', color: '#a855f7' },
    'Coupling Assessment': { icon: '!', color: '#f59e0b' },
    'Potential Improvements': { icon: '✦', color: '#10b981' },
};

function parseSections(text) {
    if (!text) return [];
    const sectionKeys = Object.keys(SECTION_META);
    const regex = new RegExp(`(${sectionKeys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*:`, 'g');

    let match;
    const positions = [];
    while ((match = regex.exec(text)) !== null) {
        positions.push({ title: match[1], start: match.index, headerEnd: match.index + match[0].length });
    }

    const sections = [];
    for (let i = 0; i < positions.length; i++) {
        const contentStart = positions[i].headerEnd;
        const contentEnd = i + 1 < positions.length ? positions[i + 1].start : text.length;
        const body = text.substring(contentStart, contentEnd).trim();
        if (body) sections.push({ title: positions[i].title, body });
    }

    if (sections.length === 0 && text.trim()) {
        sections.push({ title: 'Analysis', body: text.trim() });
    }
    return sections;
}

function FileChip({ node, color }) {
    if (!node) return null;
    return (
        <div className="rel-modal-file-chip">
            <span className="rel-modal-file-dot" style={{ background: color }} />
            <div className="rel-modal-file-chip-info">
                <span className="rel-modal-file-chip-name">{node.label}</span>
                <span className="rel-modal-file-chip-path">{node.directory}</span>
            </div>
            {node.metrics && (
                <span className="rel-modal-file-chip-loc">{node.metrics.linesOfCode} LOC</span>
            )}
        </div>
    );
}

export default function RelationshipModal() {
    const {
        showRelationshipModal, setShowRelationshipModal,
        relationshipData, relationshipSummary, loadingRelationship, relationshipCached,
    } = useStore();

    useEffect(() => {
        const handler = (e) => {
            if (e.key === 'Escape' && showRelationshipModal) {
                setShowRelationshipModal(false);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [showRelationshipModal, setShowRelationshipModal]);

    const sections = useMemo(() => parseSections(relationshipSummary), [relationshipSummary]);

    const source = relationshipData?.sourceNode;
    const target = relationshipData?.targetNode;
    const direction = relationshipData?.direction;

    const dirLabel = direction === 'dependency' ? 'imports' : 'is imported by';
    const dirColor = direction === 'dependency' ? '#3b82f6' : '#a855f7';

    return (
        <AnimatePresence>
            {showRelationshipModal && (
                <motion.div
                    className="rel-modal-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    onClick={() => setShowRelationshipModal(false)}
                >
                    <motion.div
                        className="rel-modal"
                        initial={{ opacity: 0, scale: 0.95, y: 24 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 24 }}
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="rel-modal-header">
                            <div className="rel-modal-title-row">
                                <span className="rel-modal-icon">⬡</span>
                                <h2 className="rel-modal-title">Dependency Analysis</h2>
                            </div>
                            <button
                                className="rel-modal-close"
                                onClick={() => setShowRelationshipModal(false)}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Connection diagram */}
                        <div className="rel-modal-connection">
                            <FileChip node={source} color={dirColor} />
                            <div className="rel-modal-arrow-container">
                                <div className="rel-modal-arrow-line" style={{ background: dirColor }} />
                                <span className="rel-modal-arrow-label" style={{ color: dirColor }}>{dirLabel}</span>
                                <svg className="rel-modal-arrow-head" width="12" height="10" viewBox="0 0 12 10" style={{ color: dirColor }}>
                                    <path d="M0 0 L12 5 L0 10 Z" fill="currentColor" />
                                </svg>
                            </div>
                            <FileChip node={target} color={dirColor} />
                        </div>

                        {relationshipCached && relationshipSummary && (
                            <div className="rel-modal-cached">CACHED</div>
                        )}

                        {/* Body */}
                        <div className="rel-modal-body">
                            {loadingRelationship && !relationshipSummary ? (
                                <div className="rel-modal-loading">
                                    <span className="btn-spinner" style={{ width: 20, height: 20, borderWidth: 2.5, color: dirColor }} />
                                    <p>Analyzing dependency relationship...</p>
                                    <p className="rel-modal-loading-sub">Reading both files and sending to AI</p>
                                </div>
                            ) : sections.length > 0 ? (
                                sections.map((section, i) => {
                                    const meta = SECTION_META[section.title] || { icon: '●', color: '#8b5cf6' };
                                    return (
                                        <motion.div
                                            key={section.title}
                                            className="rel-modal-section"
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: i * 0.06, duration: 0.25 }}
                                        >
                                            <div className="rel-modal-section-header">
                                                <span className="rel-modal-section-icon" style={{ color: meta.color }}>
                                                    {meta.icon}
                                                </span>
                                                <h3 className="rel-modal-section-title">{section.title}</h3>
                                            </div>
                                            <p className="rel-modal-section-body">{section.body}</p>
                                        </motion.div>
                                    );
                                })
                            ) : !loadingRelationship ? (
                                <div className="rel-modal-loading">
                                    <p style={{ color: 'var(--text-muted)' }}>No analysis available.</p>
                                </div>
                            ) : null}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
