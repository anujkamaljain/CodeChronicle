import { create } from 'zustand';

let toastId = 0;

const useStore = create((set, get) => ({
    // Graph data
    graph: null,
    selectedNode: null,
    highlightedNodes: [],

    // UI state
    activeTab: 'graph', // 'graph' | 'blast' | 'query' | 'risk'
    prevTabIndex: 0,
    isLoading: false,
    loadingMessage: '',

    // Per-button loading states
    loadingRisk: false,
    loadingBlast: false,
    loadingSummary: false,

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
    summaryCached: false,
    nodeLocalRisk: null,
    nodeAiRisk: null,

    // Toast notifications
    toasts: [],

    // Graph search & filter
    searchQuery: '',
    searchFilter: { extensions: [], riskLevels: [] },

    // AI progress indicator
    aiProgress: null, // { stage: 'reading' | 'sending' | 'processing' | 'done', label: string }

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
    setActiveTab: (tab) => {
        const tabs = ['graph', 'blast', 'query', 'risk'];
        const prevIdx = tabs.indexOf(get().activeTab);
        set({ activeTab: tab, prevTabIndex: prevIdx });
    },
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
    setSummaryCached: (cached) => set({ summaryCached: cached }),
    setNodeLocalRisk: (risk) => set({ nodeLocalRisk: risk }),
    setNodeAiRisk: (risk) => set({ nodeAiRisk: risk }),
    setLoadingRisk: (loading) => set({ loadingRisk: loading }),
    setLoadingBlast: (loading) => set({ loadingBlast: loading }),
    setLoadingSummary: (loading) => set({ loadingSummary: loading }),
    setError: (error) => set({ error }),
    clearError: () => set({ error: null }),

    // Toast actions
    addToast: (message, type = 'info', duration = 4000) => {
        const id = ++toastId;
        set((s) => ({ toasts: [...s.toasts, { id, message, type, duration }] }));
        if (duration > 0) {
            setTimeout(() => get().removeToast(id), duration);
        }
        return id;
    },
    removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

    // Search actions
    setSearchQuery: (query) => set({ searchQuery: query }),
    setSearchFilter: (filter) => set((s) => ({ searchFilter: { ...s.searchFilter, ...filter } })),

    // AI progress actions
    setAiProgress: (progress) => set({ aiProgress: progress }),
}));

export default useStore;

