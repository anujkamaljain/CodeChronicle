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

        // Build a normalized lookup: normalized path -> original file key
        // This handles Windows vs Unix path separators, leading ./, etc.
        const normalizedLookup = new Map();
        // Also build a basename index for fuzzy fallback matching
        const basenameIndex = new Map();

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

            // Normalize the node key itself to forward slashes
            const normalizedFile = file.replace(/\\/g, '/');

            nodes[normalizedFile] = {
                id: normalizedFile,
                path: normalizedFile,
                label: path.basename(normalizedFile),
                directory: path.dirname(normalizedFile).replace(/\\/g, '/'),
                extension: path.extname(normalizedFile),
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

            // Populate lookup maps with various normalized forms
            const nf = normalizedFile.toLowerCase();
            normalizedLookup.set(nf, normalizedFile);
            // Also store without leading src/ or app/ prefix variants
            if (nf.startsWith('./')) {
                normalizedLookup.set(nf.substring(2), normalizedFile);
            }

            // Basename index for fuzzy matching
            const bn = path.basename(normalizedFile);
            if (!basenameIndex.has(bn)) {
                basenameIndex.set(bn, []);
            }
            basenameIndex.get(bn).push(normalizedFile);
        }

        // Helper to find a node key for a given target path
        const findNodeKey = (targetPath) => {
            // Normalize to forward slashes and strip leading ./
            let target = targetPath.replace(/\\/g, '/');
            if (target.startsWith('./')) {
                target = target.substring(2);
            }

            // 1. Direct exact match
            if (nodes[target]) return target;

            // 2. Case-insensitive match (Windows file system is case-insensitive)
            const lowerTarget = target.toLowerCase();
            const found = normalizedLookup.get(lowerTarget);
            if (found) return found;

            // 3. Try with common extension variants
            const extVariants = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
            const targetWithoutExt = target.replace(/\.[^/.]+$/, '');
            for (const ext of extVariants) {
                const candidate = targetWithoutExt + ext;
                if (nodes[candidate]) return candidate;
                const foundLower = normalizedLookup.get(candidate.toLowerCase());
                if (foundLower) return foundLower;
            }

            // 4. Try index file resolution (import './dir' -> './dir/index.ts')
            const indexVariants = ['/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
            for (const idx of indexVariants) {
                const candidate = target + idx;
                if (nodes[candidate]) return candidate;
                const candidateNoExt = targetWithoutExt + idx;
                if (nodes[candidateNoExt]) return candidateNoExt;
            }

            // 5. Fuzzy match by basename + directory similarity
            const bn = path.basename(target);
            const candidates = basenameIndex.get(bn);
            if (candidates && candidates.length === 1) {
                // Unique basename match - highly likely the same file
                return candidates[0];
            }
            if (candidates && candidates.length > 1) {
                // Multiple matches: pick the one with the best directory match
                const targetDir = path.dirname(target).replace(/\\/g, '/');
                const best = candidates.find(c => {
                    const cDir = path.dirname(c).replace(/\\/g, '/');
                    return cDir === targetDir || cDir.endsWith(targetDir) || targetDir.endsWith(cDir);
                });
                if (best) return best;
            }

            return null; // No match found
        };

        // Create edges from dependencies
        let totalLocalDeps = 0;
        let matchedEdges = 0;
        let unmatchedPaths = [];

        for (const [sourceFile, deps] of dependencies.entries()) {
            if (!deps) continue;

            // Normalize source file key to forward slashes
            const normalizedSource = sourceFile.replace(/\\/g, '/');

            for (const dep of deps) {
                if (dep.isExternal || !dep.resolvedPath) continue;
                totalLocalDeps++;

                // Find the matching node key
                const targetKey = findNodeKey(dep.resolvedPath);

                if (targetKey) {
                    const edgeKey = `${normalizedSource}->${targetKey}`;
                    if (!edgeSet.has(edgeKey)) {
                        edgeSet.add(edgeKey);
                        matchedEdges++;
                        edges.push({
                            source: normalizedSource,
                            target: targetKey,
                            type: 'import',
                            lineNumber: dep.lineNumber,
                        });
                    }
                } else {
                    // Track unmatched for debugging (limit to first 20)
                    if (unmatchedPaths.length < 20) {
                        unmatchedPaths.push({
                            source: normalizedSource,
                            resolvedPath: dep.resolvedPath,
                            importPath: dep.importPath,
                        });
                    }
                }
            }
        }

        // Log edge matching results
        console.log(`Graph edges: ${matchedEdges} matched out of ${totalLocalDeps} local dependencies`);
        if (unmatchedPaths.length > 0) {
            console.log(`Unmatched dependencies (first ${unmatchedPaths.length}):`);
            for (const um of unmatchedPaths) {
                console.log(`  ${um.source} -> "${um.importPath}" (resolved: "${um.resolvedPath}")`);
            }
            console.log(`Known node keys sample: ${Object.keys(nodes).slice(0, 10).join(', ')}`);
        }

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
                totalFiles: Object.keys(nodes).length,
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
