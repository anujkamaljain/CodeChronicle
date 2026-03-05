import React, { useRef, useEffect } from 'react';
import useStore from '../store/useStore';

export default function GraphSearchBar({ cyRef }) {
    const inputRef = useRef(null);
    const { searchQuery, setSearchQuery, graph } = useStore();

    // Apply search filter to Cytoscape graph
    useEffect(() => {
        const cy = cyRef?.current;
        if (!cy) return;

        if (!searchQuery.trim()) {
            // Clear search — restore all nodes
            cy.nodes().removeClass('search-dim search-match');
            return;
        }

        const query = searchQuery.toLowerCase();
        let matchCount = 0;

        cy.nodes().forEach((node) => {
            const label = (node.data('label') || '').toLowerCase();
            const path = (node.data('path') || '').toLowerCase();
            if (label.includes(query) || path.includes(query)) {
                node.removeClass('search-dim').addClass('search-match');
                matchCount++;
            } else {
                node.removeClass('search-match').addClass('search-dim');
            }
        });

        // Dim edges connected to dimmed nodes
        cy.edges().forEach((edge) => {
            const src = edge.source();
            const tgt = edge.target();
            if (src.hasClass('search-dim') && tgt.hasClass('search-dim')) {
                edge.addClass('search-dim');
            } else {
                edge.removeClass('search-dim');
            }
        });

    }, [searchQuery, cyRef]);

    // Expose focus method via global keyboard shortcut
    useEffect(() => {
        const handler = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                inputRef.current?.focus();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    const matchCount = (() => {
        if (!searchQuery.trim() || !graph) return 0;
        const q = searchQuery.toLowerCase();
        return Object.values(graph.nodes).filter((n) =>
            n.label.toLowerCase().includes(q) || n.path.toLowerCase().includes(q)
        ).length;
    })();

    return (
        <div className="graph-search-bar">
            <span className="graph-search-icon">🔍</span>
            <input
                ref={inputRef}
                type="text"
                className="graph-search-input"
                placeholder="Search files... (Ctrl+F)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
                <>
                    <span className="graph-search-badge">
                        {matchCount} match{matchCount !== 1 ? 'es' : ''}
                    </span>
                    <button
                        className="graph-search-clear"
                        onClick={() => setSearchQuery('')}
                    >
                        ✕
                    </button>
                </>
            )}
        </div>
    );
}
