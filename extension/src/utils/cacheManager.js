const fs = require('fs');
const path = require('path');

/**
 * Manages local JSON-based caching of graph data.
 */
class CacheManager {
    /**
     * @param {import('vscode').Uri} storageUri - Extension global storage URI
     */
    constructor(storageUri) {
        this.storagePath = storageUri ? storageUri.fsPath : null;
        this.graphCachePath = this.storagePath
            ? path.join(this.storagePath, 'graph-cache.json')
            : null;
    }

    /**
     * Ensure the storage directory exists.
     */
    ensureStorageDir() {
        if (this.storagePath && !fs.existsSync(this.storagePath)) {
            fs.mkdirSync(this.storagePath, { recursive: true });
        }
    }

    /**
     * Save graph data to local cache.
     * @param {Object} graph
     */
    async saveGraph(graph) {
        if (!this.graphCachePath) return;

        try {
            this.ensureStorageDir();
            const serialized = JSON.stringify(graph, null, 0); // Compact for speed
            fs.writeFileSync(this.graphCachePath, serialized, 'utf-8');
            console.log(`Graph cached: ${Object.keys(graph.nodes).length} nodes`);
        } catch (err) {
            console.error('Failed to cache graph:', err.message);
        }
    }

    /**
     * Load graph data from local cache.
     * @returns {Promise<Object|null>}
     */
    async loadGraph() {
        if (!this.graphCachePath || !fs.existsSync(this.graphCachePath)) {
            return null;
        }

        try {
            const data = fs.readFileSync(this.graphCachePath, 'utf-8');
            const graph = JSON.parse(data);
            console.log(`Loaded cached graph: ${Object.keys(graph.nodes).length} nodes`);
            return graph;
        } catch (err) {
            console.error('Failed to load cached graph:', err.message);
            return null;
        }
    }

    /**
     * Clear all cached data.
     */
    async clearCache() {
        if (this.graphCachePath && fs.existsSync(this.graphCachePath)) {
            try {
                fs.unlinkSync(this.graphCachePath);
                console.log('Graph cache cleared.');
            } catch (err) {
                console.error('Failed to clear cache:', err.message);
            }
        }
    }

    /**
     * Check if a node's content has changed.
     * @param {Object} graph
     * @param {string} nodeId
     * @param {string} currentHash
     * @returns {boolean}
     */
    hasNodeChanged(graph, nodeId, currentHash) {
        const node = graph?.nodes?.[nodeId];
        if (!node) return true;
        return node.contentHash !== currentHash;
    }
}

module.exports = { CacheManager };
