const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Builds and maintains a directed dependency graph.
 */
class GraphBuilder {
    /**
     * Build a complete code graph from scanned files and parsed dependencies.
     * @param {string[]} files - Workspace-relative file paths
     * @param {Map<string, Array<{importPath: string, resolvedPath: string|null, lineNumber: number, isExternal: boolean}>>} dependencies
     * @param {string} workspacePath - Absolute workspace root path
     * @returns {{nodes: Object, edges: Array, metadata: Object}}
     */
    buildGraph(files, dependencies, workspacePath) {
        const nodes = {};
        const edges = [];
        const edgeSet = new Set();

        // Create nodes for all files
        for (const file of files) {
            const absolutePath = path.join(workspacePath, file);
            let linesOfCode = 0;
            let contentHash = '';

            try {
                const content = fs.readFileSync(absolutePath, 'utf-8');
                linesOfCode = content.split('\n').length;
                contentHash = crypto.createHash('md5').update(content).digest('hex');
            } catch (err) {
                console.warn(`Cannot read ${file} for hashing: ${err.message}`);
                contentHash = crypto.createHash('md5').update(file + Date.now()).digest('hex');
            }

            nodes[file] = {
                id: file,
                path: file,
                label: path.basename(file),
                directory: path.dirname(file),
                extension: path.extname(file),
                contentHash,
                metrics: {
                    linesOfCode,
                    dependencyCount: 0,
                    dependentCount: 0,
                    centralityScore: 0,
                },
                riskFactor: null,
                summary: null,
            };
        }

        // Create edges from dependencies
        let totalLocalDeps = 0;
        let matchedEdges = 0;

        for (const [sourceFile, deps] of dependencies.entries()) {
            if (!deps) continue;

            // Normalize source file key to forward slashes
            const normalizedSource = sourceFile.replace(/\\/g, '/');

            for (const dep of deps) {
                if (dep.isExternal || !dep.resolvedPath) continue;
                totalLocalDeps++;

                // Normalize the resolved path to forward slashes
                let targetFile = dep.resolvedPath.replace(/\\/g, '/');

                // Remove leading ./ if present
                if (targetFile.startsWith('./')) {
                    targetFile = targetFile.substring(2);
                }

                // Only create edge if target exists in our file set
                if (nodes[targetFile]) {
                    const edgeKey = `${normalizedSource}->${targetFile}`;
                    if (!edgeSet.has(edgeKey)) {
                        edgeSet.add(edgeKey);
                        matchedEdges++;
                        edges.push({
                            source: normalizedSource,
                            target: targetFile,
                            type: 'import',
                            lineNumber: dep.lineNumber,
                        });
                    }
                }
            }
        }

        console.log(`Graph edges: ${matchedEdges} matched out of ${totalLocalDeps} local dependencies`);

        // Compute dependency/dependent counts
        for (const edge of edges) {
            if (nodes[edge.source]) {
                nodes[edge.source].metrics.dependencyCount++;
            }
            if (nodes[edge.target]) {
                nodes[edge.target].metrics.dependentCount++;
            }
        }

        const graph = {
            nodes,
            edges,
            metadata: {
                workspacePath,
                totalFiles: files.length,
                totalEdges: edges.length,
                lastUpdated: new Date().toISOString(),
                version: '1.0.0',
            },
        };

        return graph;
    }

    /**
     * Update a single node in the graph (for incremental updates).
     * @param {Object} graph - The current graph
     * @param {string} nodeId - File path (node ID)
     * @param {string} workspacePath - Workspace root
     * @param {Array} newDeps - Updated dependencies
     */
    updateNode(graph, nodeId, workspacePath, newDeps) {
        const absolutePath = path.join(workspacePath, nodeId);

        if (!fs.existsSync(absolutePath)) {
            this.removeNode(graph, nodeId);
            return;
        }

        // Update content hash and LOC
        try {
            const content = fs.readFileSync(absolutePath, 'utf-8');
            graph.nodes[nodeId].contentHash = crypto.createHash('md5').update(content).digest('hex');
            graph.nodes[nodeId].metrics.linesOfCode = content.split('\n').length;
        } catch (err) {
            console.warn(`Cannot update node ${nodeId}: ${err.message}`);
        }

        // Remove old edges from this node
        graph.edges = graph.edges.filter((e) => e.source !== nodeId);

        // Add new edges
        if (newDeps) {
            for (const dep of newDeps) {
                if (dep.isExternal || !dep.resolvedPath) continue;
                const targetFile = dep.resolvedPath.replace(/\\/g, '/');
                if (graph.nodes[targetFile]) {
                    graph.edges.push({
                        source: nodeId,
                        target: targetFile,
                        type: 'import',
                        lineNumber: dep.lineNumber,
                    });
                }
            }
        }

        // Recalculate counts
        this.recalculateCounts(graph);

        // Invalidate AI cache
        graph.nodes[nodeId].summary = null;
        graph.nodes[nodeId].riskFactor = null;

        graph.metadata.lastUpdated = new Date().toISOString();
    }

    /**
     * Remove a node and all its edges from the graph.
     * @param {Object} graph
     * @param {string} nodeId
     */
    removeNode(graph, nodeId) {
        delete graph.nodes[nodeId];
        graph.edges = graph.edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
        this.recalculateCounts(graph);
        graph.metadata.totalFiles = Object.keys(graph.nodes).length;
        graph.metadata.totalEdges = graph.edges.length;
        graph.metadata.lastUpdated = new Date().toISOString();
    }

    /**
     * Add a new node to the graph.
     * @param {Object} graph
     * @param {string} filePath
     * @param {string} workspacePath
     * @param {Array} deps
     */
    addNode(graph, filePath, workspacePath, deps) {
        const absolutePath = path.join(workspacePath, filePath);
        let linesOfCode = 0;
        let contentHash = '';

        try {
            const content = fs.readFileSync(absolutePath, 'utf-8');
            linesOfCode = content.split('\n').length;
            contentHash = crypto.createHash('md5').update(content).digest('hex');
        } catch (err) {
            contentHash = crypto.createHash('md5').update(filePath + Date.now()).digest('hex');
        }

        graph.nodes[filePath] = {
            id: filePath,
            path: filePath,
            label: path.basename(filePath),
            directory: path.dirname(filePath),
            extension: path.extname(filePath),
            contentHash,
            metrics: {
                linesOfCode,
                dependencyCount: 0,
                dependentCount: 0,
                centralityScore: 0,
            },
            riskFactor: null,
            summary: null,
        };

        // Add dependency edges
        if (deps) {
            for (const dep of deps) {
                if (dep.isExternal || !dep.resolvedPath) continue;
                const targetFile = dep.resolvedPath.replace(/\\/g, '/');
                if (graph.nodes[targetFile]) {
                    graph.edges.push({
                        source: filePath,
                        target: targetFile,
                        type: 'import',
                        lineNumber: dep.lineNumber,
                    });
                }
            }
        }

        this.recalculateCounts(graph);
        graph.metadata.totalFiles = Object.keys(graph.nodes).length;
        graph.metadata.totalEdges = graph.edges.length;
        graph.metadata.lastUpdated = new Date().toISOString();
    }

    /**
     * Recalculate dependency/dependent counts for all nodes.
     */
    recalculateCounts(graph) {
        // Reset counts
        for (const node of Object.values(graph.nodes)) {
            node.metrics.dependencyCount = 0;
            node.metrics.dependentCount = 0;
        }

        // Recount from edges
        for (const edge of graph.edges) {
            if (graph.nodes[edge.source]) {
                graph.nodes[edge.source].metrics.dependencyCount++;
            }
            if (graph.nodes[edge.target]) {
                graph.nodes[edge.target].metrics.dependentCount++;
            }
        }
    }
}

module.exports = { GraphBuilder };
