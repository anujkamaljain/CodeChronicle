/**
 * API Client for communicating with the CodeChronicle AWS backend.
 * Handles requests to API Gateway, retry logic, and graceful fallback.
 */
class APIClient {
    /**
     * @param {import('vscode').WorkspaceConfiguration} config
     */
    constructor(config) {
        this.config = config;
        this.endpoint = config.get('awsApiEndpoint') || '';
        this.region = config.get('awsRegion') || 'us-east-1';
        this.enabled = config.get('enableCloudAI') || false;
        this.maxRetries = 3;
        this.baseDelay = 1000;
    }

    /**
     * Check if cloud AI is enabled and configured.
     * @returns {boolean}
     */
    isAvailable() {
        return this.enabled && !!this.endpoint;
    }

    /**
     * Request an AI-generated file summary.
     * @param {Object} request
     * @returns {Promise<{summary: string, cached: boolean, timestamp: string}>}
     */
    async requestSummary(request) {
        if (!this.isAvailable()) {
            throw new Error('Cloud AI not configured. Enable it in settings.');
        }

        return this.makeRequest('/ai/explain', {
            method: 'POST',
            body: {
                filePath: request.filePath,
                fileHash: request.fileHash,
                metrics: request.metrics,
                dependencies: request.dependencies,
                dependents: request.dependents,
            },
        });
    }

    /**
     * Request AI-powered risk assessment.
     * @param {Object} request
     * @returns {Promise<{riskFactor: Object, cached: boolean, timestamp: string}>}
     */
    async requestRiskAssessment(request) {
        if (!this.isAvailable()) {
            throw new Error('Cloud AI not configured. Enable it in settings.');
        }

        return this.makeRequest('/ai/risk-score', {
            method: 'POST',
            body: {
                filePath: request.filePath,
                fileHash: request.fileHash,
                metrics: request.metrics,
                dependencies: request.dependencies,
                dependents: request.dependents,
            },
        });
    }

    /**
     * Process a natural language query about the codebase.
     * @param {Object} request
     * @returns {Promise<{answer: string, references: Array, suggestedQuestions: string[], confidence: number}>}
     */
    async processQuery(request) {
        if (!this.isAvailable()) {
            throw new Error('Cloud AI not configured. Enable it in settings.');
        }

        return this.makeRequest('/ai/blast-radius', {
            method: 'POST',
            body: {
                query: request.query,
                graphContext: request.graphContext,
                maxResults: request.maxResults,
            },
        });
    }

    /**
     * Check cache for existing analysis.
     * @param {string} hash
     * @returns {Promise<Object|null>}
     */
    async checkCache(hash) {
        if (!this.isAvailable()) return null;

        try {
            return await this.makeRequest(`/cache/${hash}`, { method: 'GET' });
        } catch {
            return null;
        }
    }

    /**
     * Make an HTTP request with retry logic and exponential backoff.
     * @param {string} path
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async makeRequest(urlPath, options) {
        const url = `${this.endpoint}${urlPath}`;
        let lastError;

        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                const fetchOptions = {
                    method: options.method || 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                };

                if (options.body) {
                    fetchOptions.body = JSON.stringify(options.body);
                }

                const response = await fetch(url, fetchOptions);

                if (response.status === 429) {
                    // Rate limited - wait and retry
                    const delay = this.baseDelay * Math.pow(2, attempt);
                    console.warn(`Rate limited. Retrying in ${delay}ms...`);
                    await this.sleep(delay);
                    continue;
                }

                if (!response.ok) {
                    throw new Error(`API error: ${response.status} ${response.statusText}`);
                }

                return await response.json();
            } catch (err) {
                lastError = err;

                if (attempt < this.maxRetries) {
                    const delay = this.baseDelay * Math.pow(2, attempt);
                    console.warn(`Request failed (attempt ${attempt + 1}/${this.maxRetries + 1}). Retrying in ${delay}ms...`);
                    await this.sleep(delay);
                }
            }
        }

        throw lastError || new Error('Request failed after maximum retries');
    }

    /**
     * @param {number} ms
     * @returns {Promise<void>}
     */
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

module.exports = { APIClient };
