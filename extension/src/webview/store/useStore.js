import { create } from 'zustand';

const useStore = create((set, get) => ({
    // Graph data
    graph: null,
    selectedNode: null,
    highlightedNodes: [],

    // UI state
    activeTab: 'graph', // 'graph' | 'blast' | 'query' | 'risk'
    isLoading: false,
    loadingMessage: '',

    // Blast radius state
    blastRadiusMode: false,
    blastRadiusData: null,

    // Query state
    queryHistory: [],
    currentQuery: '',
    queryResult: null,

    // Cloud status
    cloudStatus: 'disconnected', // 'connected' | 'disconnected' | 'rate-limited'

    // Sidebar state
    sidebarOpen: true,
    nodeDetails: null,
    nodeSummary: null,
    nodeLocalRisk: null,
    nodeAiRisk: null,

    // Error state
    error: null,

    // Actions
    setGraph: (graph) => set({ graph }),

    setSelectedNode: (nodeId) => {
        const graph = get().graph;
        if (!graph || !nodeId) {
            set({ selectedNode: null, nodeDetails: null, nodeSummary: null, nodeLocalRisk: null, nodeAiRisk: null });
            return;
        }
        const node = graph.nodes[nodeId];
        set({
            selectedNode: nodeId,
            nodeDetails: node || null,
            nodeSummary: node?.summary || null,
            nodeLocalRisk: node?.localRisk || null,
            nodeAiRisk: node?.riskFactor || null,
            sidebarOpen: true,
        });
    },

    setHighlightedNodes: (nodes) => set({ highlightedNodes: nodes }),
    setActiveTab: (tab) => set({ activeTab: tab }),
    setLoading: (loading, message) => set({ isLoading: loading, loadingMessage: message || '' }),

    setBlastRadiusMode: (enabled, data) =>
        set({ blastRadiusMode: enabled, blastRadiusData: data || null }),

    addQueryToHistory: (query, result) =>
        set((s) => ({
            queryHistory: [{ query, result, timestamp: Date.now() }, ...s.queryHistory].slice(0, 50),
        })),

    setQueryResult: (result) => set({ queryResult: result }),
    setCurrentQuery: (query) => set({ currentQuery: query }),
    setCloudStatus: (status) => set({ cloudStatus: status }),
    setSidebarOpen: (open) => set({ sidebarOpen: open }),
    setNodeSummary: (summary) => set({ nodeSummary: summary }),
    setNodeLocalRisk: (risk) => set({ nodeLocalRisk: risk }),
    setNodeAiRisk: (risk) => set({ nodeAiRisk: risk }),
    setError: (error) => set({ error }),
    clearError: () => set({ error: null }),
}));

export default useStore;
