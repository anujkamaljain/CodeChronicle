import React, { useEffect } from 'react';
import useStore from '../store/useStore';

export default function StatusBar({ onViewCredits, onBuyCredits }) {
    const { graph, isLoading, loadingMessage, cloudStatus, walletCredits, error, clearError } = useStore();

    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => clearError(), 6000);
            return () => clearTimeout(timer);
        }
    }, [error, clearError]);
    const nodeCount = graph ? Object.keys(graph.nodes).length : 0;
    const edgeCount = graph ? graph.edges.length : 0;
    const lastUpdated = graph?.metadata?.lastUpdated
        ? new Date(graph.metadata.lastUpdated).toLocaleTimeString()
        : null;

    return (
        <div className="border-t" style={{ borderColor: 'var(--border-glass)', background: 'rgba(5, 10, 20, 0.9)' }}>
            {/* Main status row */}
            <div className="flex items-center justify-between px-2 sm:px-4 py-1.5 text-xs gap-2 flex-wrap"
                style={{ color: 'var(--text-muted)' }}>

                {/* Left: Status */}
                <div className="flex items-center gap-3 min-w-0">
                    {isLoading ? (
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--risk-medium)' }} />
                            <span>{loadingMessage || 'Loading...'}</span>
                        </div>
                    ) : error ? (
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full" style={{ background: 'var(--risk-high)' }} />
                            <span style={{ color: 'var(--risk-high)' }}>{error}</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full" style={{ background: 'var(--neon-green)' }} />
                            <span>Ready</span>
                        </div>
                    )}
                </div>

                {/* Center: Graph stats */}
                <div className="hidden sm:flex items-center gap-3">
                    {graph && (
                        <>
                            <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>
                                {nodeCount} files
                            </span>
                            <span>•</span>
                            <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>
                                {edgeCount} deps
                            </span>
                            {lastUpdated && (
                                <>
                                    <span>•</span>
                                    <span>Updated {lastUpdated}</span>
                                </>
                            )}
                        </>
                    )}
                </div>

                {/* Right: Cloud status */}
                <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                        type="button"
                        onClick={onViewCredits}
                        className="status-pill px-2 py-0.5 border text-[11px] font-mono"
                        style={{
                            borderColor: 'rgba(0, 240, 255, 0.35)',
                            color: 'var(--neon-cyan)',
                            background: 'rgba(0, 240, 255, 0.06)',
                        }}
                        title="View wallet credits and recent credit activity"
                    >
                        Credits: {Number.isFinite(walletCredits) ? walletCredits : '...'}
                    </button>
                    <button
                        type="button"
                        onClick={onBuyCredits}
                        className="status-pill px-2 py-0.5 border text-[11px] font-mono"
                        style={{
                            borderColor: 'rgba(16, 185, 129, 0.35)',
                            color: 'var(--neon-green)',
                            background: 'rgba(16, 185, 129, 0.07)',
                        }}
                        title="Buy credits on CodeChronicle website"
                    >
                        Buy Credits
                    </button>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full"
                            style={{
                                background: cloudStatus === 'connected' ? 'var(--neon-green)'
                                    : cloudStatus === 'rate-limited' ? 'var(--risk-medium)'
                                        : 'var(--text-muted)',
                            }} />
                        <span>
                            Cloud: {cloudStatus === 'connected' ? 'Connected'
                                : cloudStatus === 'rate-limited' ? 'Rate Limited'
                                    : 'Offline'}
                        </span>
                    </div>
                </div>
            </div>

        </div>
    );
}
