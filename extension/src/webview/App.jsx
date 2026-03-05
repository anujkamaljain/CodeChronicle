import React, { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useStore from './store/useStore';
import GraphDashboard from './components/GraphDashboard';
import FileDetailsPanel from './components/FileDetailsPanel';
import BlastRadiusView from './components/BlastRadiusView';
import QueryPanel from './components/QueryPanel';
import RiskPanel from './components/RiskPanel';
import Toolbar from './components/Toolbar';
import StatusBar from './components/StatusBar';

const TABS = [
    { id: 'graph', label: 'Graph', icon: '◉' },
    { id: 'blast', label: 'Blast Radius', icon: '◎' },
    { id: 'query', label: 'AI Query', icon: '⬡' },
    { id: 'risk', label: 'Risk Map', icon: '△' },
];

export default function App({ vscode }) {
    const {
        graph, activeTab, setActiveTab, setGraph, setSelectedNode,
        setBlastRadiusMode, setQueryResult, setNodeSummary, setNodeLocalRisk, setNodeAiRisk,
        setCloudStatus, setError, addQueryToHistory, selectedNode,
        sidebarOpen, blastRadiusMode, setHighlightedNodes, setLoading,
        setLoadingRisk, setLoadingBlast, isLoading, setLoadingSummary,
    } = useStore();

    // Listen for messages from the extension host
    useEffect(() => {
        const handleMessage = (event) => {
            const message = event.data;
            switch (message.type) {
                case 'init':
                case 'update':
                    setGraph(message.graph);
                    setLoading(false);
                    break;

                case 'summary':
                    setNodeSummary(message.summary);
                    setLoadingSummary(!!message.loading);
                    if (message.summary) {
                        useStore.getState().setSummaryCached(!!message.cached);
                    }
                    break;

                case 'risk':
                    if (message.isAiRisk) {
                        setNodeAiRisk(message.risk);
                        setLoadingRisk(false);
                    } else {
                        setNodeLocalRisk(message.risk);
                    }
                    break;

                case 'highlight':
                    setHighlightedNodes(message.nodeIds || []);
                    setLoadingBlast(false);
                    if (message.blastRadius) {
                        setBlastRadiusMode(true, message.blastRadius);
                    }
                    break;

                case 'queryResult':
                    setQueryResult(message.result);
                    setLoading(false);
                    break;

                case 'cloudStatus':
                    setCloudStatus(message.status);
                    break;

                case 'error':
                    setError(message.message);
                    setLoading(false);
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
        vscode.postMessage({ type: 'requestRisk', nodeId });
    }, [vscode]);

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
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.15 }}
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
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
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
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
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
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
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

                    {/* Empty state */}
                    {!graph && (
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

            {/* Bottom status bar */}
            <StatusBar />
        </div>
    );
}
