import React from 'react';
import useStore from '../store/useStore';

function getIconUri() {
    const root = document.getElementById('root');
    return root?.getAttribute('data-icon-uri') || '';
}

export default function Toolbar({ onRefresh }) {
    const { isLoading, graph } = useStore();
    const iconUri = getIconUri();

    return (
        <div className="flex items-center justify-between px-4 py-2 border-b"
            style={{ borderColor: 'var(--border-glass)', background: 'var(--bg-secondary)' }}>
            {/* Logo */}
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                    {iconUri ? (
                        <img src={iconUri} alt="CodeChronicle" className="h-6 rounded-lg" style={{ width: '40px', border: '1px solid rgba(148, 163, 184, 0.15)' }} />
                    ) : (
                        <div className="w-6 h-6 rounded-lg flex items-center justify-center"
                            style={{
                                background: 'rgba(94, 234, 212, 0.1)',
                                border: '1px solid rgba(94, 234, 212, 0.2)',
                            }}>
                            <span className="text-xs font-bold" style={{ color: 'var(--neon-cyan)' }}>CC</span>
                        </div>
                    )}
                    <span className="text-sm font-bold" style={{ color: 'var(--neon-cyan)' }}>CodeChronicle</span>
                </div>

                {graph && (
                    <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{
                            background: 'rgba(16, 185, 129, 0.1)',
                            color: 'var(--neon-green)',
                            border: '1px solid rgba(16, 185, 129, 0.2)',
                        }}>
                        Active
                    </span>
                )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
                <button
                    onClick={onRefresh}
                    disabled={isLoading}
                    className={`btn-neon text-xs py-1.5 px-3 flex items-center justify-center gap-1.5 ${isLoading ? 'btn-loading' : ''}`}
                    title="Rescan workspace"
                >
                    {isLoading ? <span className="btn-spinner" /> : '⟳'}
                    {isLoading ? 'Scanning...' : 'Refresh'}
                </button>
            </div>
        </div>
    );
}
