/**
 * Computes blast radius (impact analysis) for a given node.
 * Uses BFS to find all transitive dependents.
 */
class BlastRadiusEngine {
    /**
     * Compute the blast radius for a given node.
     * @param {Object} graph - The code graph
     * @param {string} nodeId - The file to analyze
     * @returns {{
     *   sourceNode: string,
     *   affectedNodes: string[],
     *   directDependents: string[],
     *   indirectDependents: string[],
     *   impactScore: number,
     *   levels: Object[]
     * }}
     */
    compute(graph, nodeId) {
        if (!graph || !graph.nodes[nodeId]) {
            return {
                sourceNode: nodeId,
                affectedNodes: [],
                directDependents: [],
                indirectDependents: [],
                impactScore: 0,
                levels: [],
            };
        }

        // Build reverse adjacency list (dependent -> dependencies)
        const reverseAdj = {};
        for (const id of Object.keys(graph.nodes)) {
            reverseAdj[id] = [];
        }
        for (const edge of graph.edges) {
            if (reverseAdj[edge.target]) {
                reverseAdj[edge.target].push(edge.source);
            }
        }

        // BFS from the source node to find all transitive dependents
        const visited = new Set();
        const levels = []; // Track depth levels
        const queue = [{ id: nodeId, depth: 0 }];
        visited.add(nodeId);

        const directDependents = [];
        const indirectDependents = [];

        while (queue.length > 0) {
            const { id, depth } = queue.shift();

            // Get all files that depend on this file (reverse edges)
            const dependents = reverseAdj[id] || [];

            for (const depId of dependents) {
                if (!visited.has(depId)) {
                    visited.add(depId);

                    if (depth === 0) {
                        directDependents.push(depId);
                    } else {
                        indirectDependents.push(depId);
                    }

                    // Track level
                    if (!levels[depth + 1]) {
                        levels[depth + 1] = [];
                    }
                    levels[depth + 1].push(depId);

                    queue.push({ id: depId, depth: depth + 1 });
                }
            }
        }

        const affectedNodes = [...directDependents, ...indirectDependents];

        // Compute impact score based on affected nodes
        const totalNodes = Object.keys(graph.nodes).length;
        const impactScore = totalNodes > 1
            ? parseFloat(((affectedNodes.length / (totalNodes - 1)) * 100).toFixed(2))
            : 0;

        // Enhance with risk-weighted impact
        const weightedImpact = this.computeWeightedImpact(graph, affectedNodes);

        return {
            sourceNode: nodeId,
            affectedNodes,
            directDependents,
            indirectDependents,
            impactScore,
            weightedImpact,
            levels: levels.filter(Boolean),
            totalFiles: totalNodes,
        };
    }

    /**
     * Compute risk-weighted impact score.
     * @param {Object} graph
     * @param {string[]} affectedNodes
     * @returns {number} Weighted impact 0-100
     */
    computeWeightedImpact(graph, affectedNodes) {
        if (affectedNodes.length === 0) return 0;

        let totalWeight = 0;
        for (const nodeId of affectedNodes) {
            const node = graph.nodes[nodeId];
            if (!node) continue;

            let weight = 1;
            // Weight by centrality
            weight += node.metrics.centralityScore * 2;
            // Weight by dependent count (more dependents = more critical)
            weight += Math.min(node.metrics.dependentCount / 10, 1);
            // Weight by LOC (larger files = more risk)
            weight += Math.min(node.metrics.linesOfCode / 500, 1);

            totalWeight += weight;
        }

        const maxPossibleWeight = affectedNodes.length * 5; // Max weight per node = 5
        return parseFloat(((totalWeight / maxPossibleWeight) * 100).toFixed(2));
    }
}

module.exports = { BlastRadiusEngine };
