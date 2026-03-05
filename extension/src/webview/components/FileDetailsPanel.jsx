import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import useStore from '../store/useStore';

export default function FileDetailsPanel({ onOpenFile, onBlastRadius, onRequestRisk, onRequestDetailedSummary }) {
    const {
        selectedNode, nodeDetails, nodeSummary, nodeLocalRisk, nodeAiRisk,
        setSidebarOpen, setSelectedNode, setHighlightedNodes, setBlastRadiusMode,
        highlightedNodes, loadingRisk, loadingBlast, setLoadingRisk, setLoadingBlast,
        loadingSummary, summaryCached, loadingDetailedSummary,
    } = useStore();

    // Auto-clear loading states when data arrives
    useEffect(() => {
        if (nodeAiRisk && loadingRisk) setLoadingRisk(false);
    }, [nodeAiRisk]);

    useEffect(() => {
        if (loadingBlast) {
            // Blast radius resolves quickly (local compute), short delay for UX feel
            const timer = setTimeout(() => setLoadingBlast(false), 600);
            return () => clearTimeout(timer);
        }
    }, [loadingBlast]);

    const scrollRef = useRef(null);
    const [showScrollArrow, setShowScrollArrow] = useState(false);

    const checkScrollable = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        const hasMore = el.scrollHeight - el.scrollTop - el.clientHeight > 20;
        setShowScrollArrow(hasMore);
    }, []);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        checkScrollable();
        el.addEventListener('scroll', checkScrollable, { passive: true });
        const obs = new ResizeObserver(checkScrollable);
        obs.observe(el);
        return () => {
            el.removeEventListener('scroll', checkScrollable);
            obs.disconnect();
        };
    }, [checkScrollable, selectedNode]);

    if (!nodeDetails) return null;

    const { metrics, path, label, extension, directory } = nodeDetails;
    const localRisk = nodeLocalRisk || nodeDetails.localRisk;
    const aiRisk = nodeAiRisk || nodeDetails.riskFactor;
    const displayRisk = aiRisk || localRisk;

    const riskBadgeClass = displayRisk
        ? `risk-badge risk-badge-${displayRisk.level}`
        : 'risk-badge risk-badge-low';

    const handleAnalyzeRisk = () => {
        setLoadingRisk(true);
        onRequestRisk(selectedNode);
    };

    const handleBlastRadius = () => {
        setLoadingBlast(true);
        onBlastRadius(selectedNode);
    };

    const handleScrollDown = () => {
        const el = scrollRef.current;
        if (el) el.scrollBy({ top: 150, behavior: 'smooth' });
    };

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="w-[340px] h-full relative"
            style={{ background: 'var(--bg-secondary)' }}
        >
            <div ref={scrollRef} className="h-full overflow-y-auto p-4">
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
                    onClick={() => {
                        if (highlightedNodes.length > 0) {
                            setHighlightedNodes([]);
                            setBlastRadiusMode(false, null);
                        }
                        setSelectedNode(null);
                    }}
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
                    {displayRisk ? `${displayRisk.level} risk` : 'analyzing...'}
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

            {/* Risk Scores — Structural + AI */}
            <div className="separator" />
            <div className="mb-4">
                <h4 className="text-xs font-semibold mb-3 uppercase tracking-widest"
                    style={{ color: 'var(--text-muted)' }}>
                    Risk Assessment
                </h4>

                {/* Structural Risk — always available */}
                {localRisk && (
                    <RiskScoreBar
                        label="Structural Risk Score"
                        sublabel="Scored on: Lines of Code, Dependency Count, Dependent Count, and Centrality Score"
                        risk={localRisk}
                        accentColor="var(--neon-cyan)"
                    />
                )}

                {/* AI Risk — only after clicking Analyze Risk */}
                {aiRisk ? (
                    <RiskScoreBar
                        label="AI Risk Score"
                        sublabel="Scored on: Business logic, Side effects (DB/API/IO), Security ops, Hidden coupling, and Control flow complexity"
                        risk={aiRisk}
                        accentColor="var(--neon-purple)"
                    />
                ) : (
                    <div className="glass-card-sm p-2.5 mt-2">
                        <div className="flex items-center gap-2">
                            <span className="text-xs" style={{ color: 'var(--neon-purple)', opacity: 0.6 }}>⬡</span>
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                Click <strong style={{ color: 'var(--neon-green)' }}>Analyze Risk</strong> for AI assessment
                            </span>
                        </div>
                    </div>
                )}

                {/* Risk factors from the best available source */}
                {displayRisk?.factors && displayRisk.factors.length > 0 && (
                    <div className="space-y-1.5 mt-3">
                        <div className="text-xs font-semibold uppercase tracking-widest mb-1.5"
                            style={{ color: 'var(--text-muted)', fontSize: '0.5625rem' }}>
                            {aiRisk ? 'AI Factors' : 'Structural Factors'}
                        </div>
                        {displayRisk.factors.map((factor, i) => (
                            <div key={i} className="flex items-start gap-2">
                                <span className="text-xs mt-0.5" style={{ color: 'var(--risk-medium)' }}>▸</span>
                                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{factor}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* AI Summary */}
            <div className="separator" />
            <div className="mb-4">
                <h4 className="text-xs font-semibold mb-3 uppercase tracking-widest flex items-center gap-2"
                    style={{ color: 'var(--text-muted)' }}>
                    AI Summary
                    {summaryCached && nodeSummary && (
                        <span className="text-xs px-1.5 py-0.5 rounded"
                            style={{ background: 'rgba(16, 185, 129, 0.12)', color: 'var(--neon-green)', fontSize: '0.6rem' }}>
                            CACHED
                        </span>
                    )}
                    {nodeSummary && (
                        <button
                            onClick={() => onRequestDetailedSummary && onRequestDetailedSummary(selectedNode)}
                            disabled={loadingDetailedSummary}
                            className="ml-auto text-xs px-2 py-0.5 rounded transition-all"
                            style={{
                                background: loadingDetailedSummary ? 'rgba(0, 240, 255, 0.05)' : 'rgba(0, 240, 255, 0.08)',
                                color: 'var(--neon-cyan)',
                                border: '1px solid rgba(0, 240, 255, 0.25)',
                                fontSize: '0.6rem',
                                cursor: loadingDetailedSummary ? 'not-allowed' : 'pointer',
                                opacity: loadingDetailedSummary ? 0.6 : 1,
                            }}
                        >
                            {loadingDetailedSummary ? 'Loading...' : 'View in detail'}
                        </button>
                    )}
                </h4>
                {nodeSummary ? (
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                        {nodeSummary}
                    </p>
                ) : loadingSummary ? (
                    <div className="glass-card-sm p-3 flex items-center gap-3">
                        <span className="btn-spinner" style={{ color: 'var(--neon-cyan)' }} />
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            Generating AI summary...
                        </p>
                    </div>
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
                    onClick={handleBlastRadius}
                    disabled={loadingBlast}
                    className={`btn-neon btn-neon-purple w-full text-center flex items-center justify-center gap-2 ${loadingBlast ? 'btn-loading' : ''}`}
                >
                    {loadingBlast && <span className="btn-spinner" />}
                    {loadingBlast ? 'Computing...' : 'Show Blast Radius'}
                </button>
                <button
                    onClick={handleAnalyzeRisk}
                    disabled={loadingRisk}
                    className={`btn-neon btn-neon-green w-full text-center flex items-center justify-center gap-2 ${loadingRisk ? 'btn-loading' : ''}`}
                >
                    {loadingRisk && <span className="btn-spinner" />}
                    {loadingRisk ? 'Analyzing...' : 'Analyze Risk'}
                </button>
            </div>
            </div>

            {/* Scroll-down arrow */}
            {showScrollArrow && (
                <div className="sidebar-scroll-arrow" onClick={handleScrollDown}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                </div>
            )}
        </motion.div>
    );
}

function RiskScoreBar({ label, sublabel, risk, accentColor }) {
    const [showTip, setShowTip] = React.useState(false);
    const levelColor = risk.level === 'high' ? 'var(--risk-high)' : risk.level === 'medium' ? 'var(--risk-medium)' : 'var(--risk-low)';
    const gradient = risk.level === 'high'
        ? 'linear-gradient(90deg, #f59e0b, #ef4444)'
        : risk.level === 'medium'
            ? 'linear-gradient(90deg, #10b981, #f59e0b)'
            : 'linear-gradient(90deg, #3b82f6, #10b981)';

    return (
        <div className="mb-2.5">
            <div className="flex justify-between items-center mb-1">
                <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: accentColor }} />
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                    {/* Hover tooltip for score basis */}
                    <span
                        className="relative cursor-help"
                        onMouseEnter={() => setShowTip(true)}
                        onMouseLeave={() => setShowTip(false)}
                    >
                        <span
                            className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-xs"
                            style={{
                                fontSize: '0.5rem',
                                fontWeight: 700,
                                background: 'rgba(148, 163, 184, 0.12)',
                                color: 'var(--text-muted)',
                                border: '1px solid rgba(148, 163, 184, 0.2)',
                            }}
                        >
                            ?
                        </span>
                        {showTip && (
                            <span
                                className="absolute left-1/2 bottom-full mb-1.5 px-2.5 py-1.5 rounded-lg text-xs z-50"
                                style={{
                                    transform: 'translateX(-50%)',
                                    width: '220px',
                                    background: 'rgba(10, 17, 34, 0.95)',
                                    border: '1px solid rgba(0, 240, 255, 0.25)',
                                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5), 0 0 10px rgba(0, 240, 255, 0.08)',
                                    color: 'var(--text-secondary)',
                                    fontSize: '0.6875rem',
                                    lineHeight: '1.4',
                                }}
                            >
                                {sublabel}
                            </span>
                        )}
                    </span>
                </div>
                <span className="text-sm font-bold font-mono" style={{ color: levelColor }}>
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
                        background: gradient,
                        boxShadow: `0 0 12px ${risk.level === 'high' ? '#ef4444' : risk.level === 'medium' ? '#f59e0b' : '#10b981'}40`,
                    }}
                />
            </div>
        </div>
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
