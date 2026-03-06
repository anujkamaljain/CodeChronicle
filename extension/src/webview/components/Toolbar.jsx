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
        <div className="flex items-center justify-between px-2 sm:px-4 py-2 border-b gap-2"
            style={{ borderColor: 'var(--border-glass)', background: 'rgba(5, 10, 20, 0.8)' }}>
            {/* Logo */}
            <div className="flex items-center gap-3 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                    {iconUri ? (
                        <img src={iconUri} alt="CodeChronicle" className="h-6 rounded-lg" style={{ width: '40px', border: '1px solid rgba(0, 240, 255, 0.25)' }} />
                    ) : (
                        <div className="w-6 h-6 rounded-lg flex items-center justify-center"
                            style={{
                                background: 'linear-gradient(135deg, rgba(0, 240, 255, 0.15), rgba(168, 85, 247, 0.15))',
                                border: '1px solid rgba(0, 240, 255, 0.2)',
                            }}>
                            <span className="text-xs font-bold text-gradient">CC</span>
                        </div>
                    )}
                    <span className="text-sm font-bold text-gradient truncate">CodeChronicle</span>
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
            <div className="flex items-center gap-2 flex-shrink-0">
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
