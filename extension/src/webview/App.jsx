import React, { useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useStore from './store/useStore';
import GraphDashboard from './components/GraphDashboard';
import FileDetailsPanel from './components/FileDetailsPanel';
import BlastRadiusView from './components/BlastRadiusView';
import QueryPanel from './components/QueryPanel';
import RiskPanel from './components/RiskPanel';
import Toolbar from './components/Toolbar';
import StatusBar from './components/StatusBar';
import ToastContainer from './components/ToastContainer';

const TABS = [
    { id: 'graph', label: 'Graph', icon: '◉' },
    { id: 'blast', label: 'Blast Radius', icon: '◎' },
    { id: 'query', label: 'AI Query', icon: '⬡' },
    { id: 'risk', label: 'Risk Map', icon: '△' },
];

const AI_STAGES = [
    { key: 'reading', label: 'Reading' },
    { key: 'sending', label: 'Sending' },
    { key: 'processing', label: 'Processing' },
    { key: 'done', label: 'Done' },
];

// Skeleton loading component
function SkeletonGraph() {
    const nodes = [
        { x: 60, y: 40, r: 20 },
        { x: 180, y: 30, r: 14 },
        { x: 120, y: 110, r: 24 },
        { x: 220, y: 100, r: 16 },
        { x: 50, y: 160, r: 12 },
        { x: 160, y: 170, r: 18 },
    ];
    return (
        <div className="skeleton-container">
            <div className="skeleton-graph">
                {nodes.map((n, i) => (
                    <div
                        key={i}
                        className="skeleton-node"
                        style={{
                            left: n.x, top: n.y,
                            width: n.r * 2, height: n.r * 2,
                            animationDelay: `${i * 0.2}s`,
                        }}
                    />
                ))}
                {/* Edges between nodes */}
                {[[0, 2], [1, 3], [2, 5], [4, 2], [3, 5]].map(([a, b], i) => {
                    const dx = nodes[b].x - nodes[a].x;
                    const dy = nodes[b].y - nodes[a].y;
                    const len = Math.sqrt(dx * dx + dy * dy);
                    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                    return (
                        <div
                            key={`e${i}`}
                            className="skeleton-edge"
                            style={{
                                left: nodes[a].x + nodes[a].r,
                                top: nodes[a].y + nodes[a].r,
                                width: len,
                                transform: `rotate(${angle}deg)`,
                                animationDelay: `${i * 0.15 + 0.3}s`,
                            }}
                        />
                    );
                })}
            </div>
            <div className="skeleton-title" />
            <div className="skeleton-bar" style={{ width: 220, animationDelay: '0.4s' }} />
            <div className="skeleton-bar" style={{ width: 160, animationDelay: '0.6s' }} />
        </div>
    );
}

export default function App({ vscode }) {
    const {
        graph, activeTab, setActiveTab, setGraph, setSelectedNode,
        setBlastRadiusMode, setQueryResult, setNodeSummary, setNodeLocalRisk, setNodeAiRisk,
        setCloudStatus, setError, addQueryToHistory, selectedNode,
        sidebarOpen, blastRadiusMode, setHighlightedNodes, setLoading,
        setLoadingRisk, setLoadingBlast, isLoading, setLoadingSummary,
        addToast, prevTabIndex, setAiProgress,
    } = useStore();

    // Listen for messages from the extension host
    useEffect(() => {
        const handleMessage = (event) => {
            const message = event.data;
            switch (message.type) {
                case 'init':
                case 'update':
                    setGraph(message.graph);
                    if (useStore.getState().isLoading) {
                        addToast(
                            `Scan complete — ${Object.keys(message.graph.nodes).length} files, ${message.graph.edges.length} deps`,
                            'success'
                        );
                    }
                    setLoading(false);
                    break;

                case 'summary':
                    setNodeSummary(message.summary);
                    setLoadingSummary(!!message.loading);
                    if (message.summary) {
                        useStore.getState().setSummaryCached(!!message.cached);
                        setAiProgress(null);
                    }
                    if (message.loading) {
                        setAiProgress({ stage: 'sending', label: 'Generating summary...' });
                    }
                    break;

                case 'risk':
                    if (message.isAiRisk) {
                        setNodeAiRisk(message.risk);
                        setLoadingRisk(false);
                        setAiProgress(null);
                        addToast(`Risk analyzed: ${message.risk.level.toUpperCase()} (${message.risk.score}/100)`, 'success');
                    } else {
                        setNodeLocalRisk(message.risk);
                    }
                    break;

                case 'highlight':
                    setHighlightedNodes(message.nodeIds || []);
                    setLoadingBlast(false);
                    if (message.blastRadius) {
                        setBlastRadiusMode(true, message.blastRadius);
                        addToast(`Blast radius: ${message.nodeIds?.length || 0} affected files`, 'info');
                    }
                    break;

                case 'queryResult':
                    setQueryResult(message.result);
                    setLoading(false);
                    addToast('AI query complete', 'success');
                    break;

                case 'cloudStatus':
                    setCloudStatus(message.status);
                    break;

                case 'error':
                    setError(message.message);
                    setLoading(false);
                    setAiProgress(null);
                    addToast(message.message, 'error');
                    break;
            }
        };

        window.addEventListener('message', handleMessage);
        // Tell extension we're ready
        vscode.postMessage({ type: 'ready' });

        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const handleNodeClick = useCallback((nodeId) => {
        setSelectedNode(nodeId);
        vscode.postMessage({ type: 'nodeClick', nodeId });
    }, [vscode]);

    const handleBlastRadius = useCallback((nodeId) => {
        vscode.postMessage({ type: 'blastRadius', nodeId });
        setActiveTab('blast');
    }, [vscode]);

    const handleQuery = useCallback((query) => {
        setLoading(true, 'Querying AI...');
        vscode.postMessage({ type: 'query', query });
    }, [vscode]);

    const handleOpenFile = useCallback((filePath) => {
        vscode.postMessage({ type: 'openFile', path: filePath });
    }, [vscode]);

    const handleRefresh = useCallback(() => {
        setLoading(true, 'Rescanning workspace...');
        vscode.postMessage({ type: 'refresh' });
    }, [vscode]);

    const handleRequestRisk = useCallback((nodeId) => {
        setAiProgress({ stage: 'reading', label: 'Reading file...' });
        setTimeout(() => setAiProgress({ stage: 'sending', label: 'Sending to AI...' }), 400);
        setTimeout(() => setAiProgress({ stage: 'processing', label: 'Analyzing risk...' }), 1200);
        vscode.postMessage({ type: 'requestRisk', nodeId });
    }, [vscode]);

    // Compute tab slide direction
    const currentTabIndex = TABS.findIndex((t) => t.id === activeTab);
    const slideDirection = currentTabIndex > prevTabIndex ? 1 : -1;

    // AI progress indicator
    const aiProgress = useStore((s) => s.aiProgress);

    return (
        <div className="h-screen w-screen flex flex-col bg-grid overflow-hidden"
            style={{ background: 'linear-gradient(180deg, #050a14 0%, #0a1122 50%, #050a14 100%)' }}>

            {/* Top toolbar */}
            <Toolbar onRefresh={handleRefresh} />

            {/* Tab bar */}
            <div className="flex items-center border-b"
                style={{ borderColor: 'var(--border-glass)' }}>
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`tab-button flex items-center gap-2 ${activeTab === tab.id ? 'active' : ''}`}
                    >
                        <span className="text-xs opacity-70">{tab.icon}</span>
                        {tab.label}
                    </button>
                ))}

                {/* Node count badge */}
                {graph && (
                    <div className="ml-auto mr-4 flex items-center gap-2">
                        <span className="text-xs-mono" style={{ color: 'var(--neon-cyan)' }}>
                            {Object.keys(graph.nodes).length}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>nodes</span>
                        <span className="mx-1" style={{ color: 'var(--text-muted)' }}>•</span>
                        <span className="text-xs-mono" style={{ color: 'var(--neon-purple)' }}>
                            {graph.edges.length}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>edges</span>
                    </div>
                )}
            </div>

            {/* Main content area */}
            <div className="flex-1 flex overflow-hidden">
                {/* Main panel */}
                <div className="flex-1 relative overflow-hidden">
                    <AnimatePresence mode="wait">
                        {activeTab === 'graph' && (
                            <motion.div
                                key="graph"
                                initial={{ opacity: 0, x: slideDirection * 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -slideDirection * 20 }}
                                transition={{ duration: 0.2, ease: 'easeInOut' }}
                                className="absolute inset-0"
                            >
                                <GraphDashboard
                                    graph={graph}
                                    onNodeClick={handleNodeClick}
                                    onBlastRadius={handleBlastRadius}
                                    selectedNode={selectedNode}
                                />
                            </motion.div>
                        )}

                        {activeTab === 'blast' && (
                            <motion.div
                                key="blast"
                                initial={{ opacity: 0, x: slideDirection * 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -slideDirection * 20 }}
                                transition={{ duration: 0.2, ease: 'easeInOut' }}
                                className="absolute inset-0"
                            >
                                <BlastRadiusView
                                    graph={graph}
                                    onNodeClick={handleNodeClick}
                                    onOpenFile={handleOpenFile}
                                    selectedNode={selectedNode}
                                />
                            </motion.div>
                        )}

                        {activeTab === 'query' && (
                            <motion.div
                                key="query"
                                initial={{ opacity: 0, x: slideDirection * 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -slideDirection * 20 }}
                                transition={{ duration: 0.2, ease: 'easeInOut' }}
                                className="absolute inset-0 overflow-auto p-4"
                            >
                                <QueryPanel
                                    onQuery={handleQuery}
                                    onOpenFile={handleOpenFile}
                                />
                            </motion.div>
                        )}

                        {activeTab === 'risk' && (
                            <motion.div
                                key="risk"
                                initial={{ opacity: 0, x: slideDirection * 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -slideDirection * 20 }}
                                transition={{ duration: 0.2, ease: 'easeInOut' }}
                                className="absolute inset-0 overflow-auto p-4"
                            >
                                <RiskPanel
                                    graph={graph}
                                    onNodeClick={handleNodeClick}
                                    onRequestRisk={handleRequestRisk}
                                    onOpenFile={handleOpenFile}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Empty state — skeleton loader */}
                    {!graph && !isLoading && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="text-center">
                                <div className="text-6xl mb-6 opacity-30">◉</div>
                                <h2 className="text-xl font-semibold mb-2 text-gradient">
                                    No Analysis Data
                                </h2>
                                <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
                                    Run &quot;CodeChronicle: Scan Workspace&quot; from the Command Palette
                                </p>
                                <button className={`btn-neon flex items-center justify-center gap-2 ${isLoading ? 'btn-loading' : ''}`} onClick={handleRefresh} disabled={isLoading}>
                                    {isLoading && <span className="btn-spinner" />}
                                    {isLoading ? 'Scanning...' : 'Scan Workspace'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Skeleton during loading */}
                    {!graph && isLoading && (
                        <div className="absolute inset-0">
                            <SkeletonGraph />
                        </div>
                    )}
                </div>

                {/* Right sidebar - File details */}
                <AnimatePresence>
                    {sidebarOpen && selectedNode && activeTab === 'graph' && (
                        <motion.div
                            initial={{ width: 0, opacity: 0 }}
                            animate={{ width: 340, opacity: 1 }}
                            exit={{ width: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: 'easeInOut' }}
                            className="border-l overflow-hidden"
                            style={{ borderColor: 'var(--border-glass)' }}
                        >
                            <FileDetailsPanel
                                onOpenFile={handleOpenFile}
                                onBlastRadius={handleBlastRadius}
                                onRequestRisk={handleRequestRisk}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* AI Progress Indicator */}
            <AnimatePresence>
                {aiProgress && aiProgress.stage !== 'done' && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        transition={{ duration: 0.2 }}
                        className="ai-progress"
                    >
                        <div className="ai-progress-steps">
                            {AI_STAGES.slice(0, 3).map((stage, i) => {
                                const stageOrder = AI_STAGES.findIndex((s) => s.key === aiProgress.stage);
                                const thisOrder = i;
                                const cls = thisOrder < stageOrder ? 'done' : thisOrder === stageOrder ? 'active' : '';
                                return (
                                    <React.Fragment key={stage.key}>
                                        {i > 0 && <div className="ai-progress-connector" />}
                                        <div className={`ai-progress-step ${cls}`}>
                                            <div className="ai-progress-dot" />
                                            <span>{stage.label}</span>
                                        </div>
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Bottom status bar */}
            <StatusBar />

            {/* Toast notifications */}
            <ToastContainer />
        </div>
    );
}

