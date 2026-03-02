/**
 * Computes structural metrics for graph nodes.
 */
class MetricsEngine {
    /**
     * Compute all metrics for the entire graph.
     * @param {Object} graph - The code graph
     */
    computeMetrics(graph) {
        this.computeBetweennessCentrality(graph);

        // Compute local risk scores for all nodes (no AI needed)
        for (const node of Object.values(graph.nodes)) {
            node.localRisk = this.computeLocalRisk(node);
        }
    }

    /**
     * Compute betweenness centrality for all nodes.
     * Uses Brandes' algorithm for efficiency.
     * @param {Object} graph
     */
    computeBetweennessCentrality(graph) {
        const nodeIds = Object.keys(graph.nodes);
        const n = nodeIds.length;
        if (n === 0) return;

        // Build adjacency list
        const adj = {};
        const reverseAdj = {};
        for (const id of nodeIds) {
            adj[id] = [];
            reverseAdj[id] = [];
        }
        for (const edge of graph.edges) {
            if (adj[edge.source] && adj[edge.target]) {
                adj[edge.source].push(edge.target);
                reverseAdj[edge.target].push(edge.source);
            }
        }

        // Initialize centrality scores
        const centrality = {};
        for (const id of nodeIds) {
            centrality[id] = 0;
        }

        // Brandes' algorithm
        for (const source of nodeIds) {
            const stack = [];
            const predecessors = {};
            const sigma = {};
            const dist = {};
            const delta = {};

            for (const id of nodeIds) {
                predecessors[id] = [];
                sigma[id] = 0;
                dist[id] = -1;
                delta[id] = 0;
            }

            sigma[source] = 1;
            dist[source] = 0;
            const queue = [source];

            // BFS
            while (queue.length > 0) {
                const v = queue.shift();
                stack.push(v);

                for (const w of (adj[v] || [])) {
                    // First visit
                    if (dist[w] < 0) {
                        dist[w] = dist[v] + 1;
                        queue.push(w);
                    }
                    // Shortest path via v
                    if (dist[w] === dist[v] + 1) {
                        sigma[w] += sigma[v];
                        predecessors[w].push(v);
                    }
                }
            }

            // Accumulation
            while (stack.length > 0) {
                const w = stack.pop();
                for (const v of predecessors[w]) {
                    delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
                }
                if (w !== source) {
                    centrality[w] += delta[w];
                }
            }
        }

        // Normalize centrality scores to 0-1 range
        let maxCentrality = 0;
        for (const id of nodeIds) {
            maxCentrality = Math.max(maxCentrality, centrality[id]);
        }

        for (const id of nodeIds) {
            graph.nodes[id].metrics.centralityScore =
                maxCentrality > 0 ? parseFloat((centrality[id] / maxCentrality).toFixed(4)) : 0;
        }
    }

    /**
     * Compute a local risk estimate from structural metrics only (no AI).
     * @param {Object} node
     * @returns {{level: string, score: number, explanation: string, factors: string[]}}
     */
    computeLocalRisk(node) {
        const metrics = node.metrics;
        let score = 0;
        const factors = [];

        // High dependency count = higher risk
        if (metrics.dependencyCount > 15) {
            score += 25;
            factors.push('High number of dependencies');
        } else if (metrics.dependencyCount > 8) {
            score += 15;
            factors.push('Moderate number of dependencies');
        }

        // High dependent count = higher blast radius
        if (metrics.dependentCount > 10) {
            score += 30;
            factors.push('Many files depend on this (high blast radius)');
        } else if (metrics.dependentCount > 5) {
            score += 20;
            factors.push('Several files depend on this');
        }

        // High centrality = critical path
        if (metrics.centralityScore > 0.7) {
            score += 25;
            factors.push('Critical path in dependency graph');
        } else if (metrics.centralityScore > 0.4) {
            score += 15;
            factors.push('Important node in dependency graph');
        }

        // Large files = more complexity
        if (metrics.linesOfCode > 500) {
            score += 15;
            factors.push('Large file (high complexity)');
        } else if (metrics.linesOfCode > 200) {
            score += 8;
            factors.push('Medium-sized file');
        }

        // Cap at 100
        score = Math.min(score, 100);

        let level;
        if (score >= 60) level = 'high';
        else if (score >= 30) level = 'medium';
        else level = 'low';

        return {
            level,
            score,
            explanation: factors.length > 0
                ? `Risk assessment based on: ${factors.join(', ')}.`
                : 'Low structural risk.',
            factors,
        };
    }

    /**
     * Compute metrics for a single node.
     * @param {Object} node
     * @param {Object} graph
     * @returns {Object} Updated metrics
     */
    computeNodeMetrics(node, graph) {
        // Count dependencies and dependents
        node.metrics.dependencyCount = graph.edges.filter((e) => e.source === node.id).length;
        node.metrics.dependentCount = graph.edges.filter((e) => e.target === node.id).length;
        return node.metrics;
    }
}

module.exports = { MetricsEngine };
