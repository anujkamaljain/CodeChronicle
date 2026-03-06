import React, { useEffect } from 'react';
import useStore from '../store/useStore';

export default function StatusBar() {
    const { graph, isLoading, loadingMessage, cloudStatus, error, clearError } = useStore();

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

            {/* Attribution badges row */}
            <div className="flex items-center justify-center gap-3 px-2 sm:px-4 py-1.5 flex-wrap"
                style={{ borderTop: '1px solid rgba(148, 163, 184, 0.06)' }}>
                {/* Made with Kiro badge */}
                <div className="attribution-badge" style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '3px 10px',
                    borderRadius: '20px',
                    background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.08), rgba(236, 72, 153, 0.08))',
                    border: '1px solid rgba(168, 85, 247, 0.18)',
                    transition: 'all 0.3s ease',
                    cursor: 'default',
                }}>
                    <span style={{
                        fontSize: '10px',
                        fontWeight: 500,
                        letterSpacing: '0.3px',
                        background: 'linear-gradient(135deg, #c084fc, #f472b6)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                    }}>
                        Made with Kiro
                    </span>
                </div>

                <span style={{ color: 'rgba(148, 163, 184, 0.15)', fontSize: '8px' }}>✦</span>

                {/* Powered by AWS badge */}
                <div className="attribution-badge" style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '3px 10px',
                    borderRadius: '20px',
                    background: 'linear-gradient(135deg, rgba(251, 146, 60, 0.08), rgba(245, 158, 11, 0.08))',
                    border: '1px solid rgba(251, 146, 60, 0.18)',
                    transition: 'all 0.3s ease',
                    cursor: 'default',
                }}>
                    <span style={{
                        fontSize: '10px',
                        fontWeight: 500,
                        letterSpacing: '0.3px',
                        background: 'linear-gradient(135deg, #fb923c, #fbbf24)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                    }}>
                        Powered by AWS
                    </span>
                </div>
            </div>
        </div>
    );
}
