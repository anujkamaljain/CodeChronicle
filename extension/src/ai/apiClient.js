// ============================================================
// IMPORTANT: Replace this URL after running `npx serverless deploy`
// in the backend/ folder. The deploy output will give you the URL.
// ============================================================
const DEFAULT_API_ENDPOINT = 'https://bcwwweix5i.execute-api.us-east-1.amazonaws.com';
// 'https://bcwwweix5i.execute-api.us-east-1.amazonaws.com';
// 'https://usl085fgve.execute-api.us-east-1.amazonaws.com';

/** How long to keep the circuit open after a backend failure (5 min) */
const CIRCUIT_RESET_MS = 5 * 60 * 1000;

/**
 * API Client for communicating with the CodeChronicle AWS backend.
 * Handles requests to API Gateway, retry logic, circuit-breaker, and graceful fallback.
 */
class APIClient {
    /**
     * @param {import('vscode').WorkspaceConfiguration} config
     */
    constructor(config) {
        this.config = config;
        const userEndpoint = config.get('awsApiEndpoint');
        this.endpoint = userEndpoint || DEFAULT_API_ENDPOINT;
        this.region = config.get('awsRegion') || 'us-east-1';
        this.enabled = config.get('enableCloudAI') !== false && !!this.endpoint;
        this.maxRetries = 2;
        this.baseDelay = 1000;

        // Circuit-breaker state
        this._circuitOpen = false;
        this._circuitOpenedAt = 0;
        this._consecutiveFailures = 0;
    }

    /**
     * Check if cloud AI is enabled, configured, and circuit is closed.
     * @returns {boolean}
     */
    isAvailable() {
        if (!this.enabled || !this.endpoint) return false;

        // Auto-reset circuit after CIRCUIT_RESET_MS
        if (this._circuitOpen && (Date.now() - this._circuitOpenedAt) > CIRCUIT_RESET_MS) {
            console.log('APIClient: circuit-breaker reset — will retry backend.');
            this._circuitOpen = false;
            this._consecutiveFailures = 0;
        }

        return !this._circuitOpen;
    }

    /**
     * Lightweight health check — validates the endpoint is reachable.
     * @returns {Promise<'connected'|'disconnected'>}
     */
    async healthCheck() {
        if (!this.enabled || !this.endpoint) return 'disconnected';

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);

            const res = await fetch(`${this.endpoint}/cache/healthcheck`, {
                method: 'GET',
                signal: controller.signal,
            });
            clearTimeout(timeout);

            // Any response (even 400/404) means the endpoint is reachable
            if (res.status < 500) {
                this._circuitOpen = false;
                this._consecutiveFailures = 0;
                return 'connected';
            }
            this._openCircuit();
            return 'disconnected';
        } catch {
            this._openCircuit();
            return 'disconnected';
        }
    }

    /**
     * Request an AI-generated file summary.
     * @param {Object} request
     * @returns {Promise<{summary: string, cached: boolean, timestamp: string}>}
     */
    async requestSummary(request) {
        if (!this.isAvailable()) {
            throw new Error('Cloud AI is currently unavailable.');
        }

        return this.makeRequest('/ai/explain', {
            method: 'POST',
            body: {
                filePath: request.filePath,
                fileHash: request.fileHash,
                metrics: request.metrics,
                dependencies: request.dependencies,
                dependents: request.dependents,
                fileContent: request.fileContent || null,
            },
        });
    }

    /**
     * Request a detailed (7-section) AI summary.
     * Uses a prefixed cache key to avoid collisions with concise summaries.
     * @param {Object} request
     * @returns {Promise<{summary: string, cached: boolean, timestamp: string}>}
     */
    async requestDetailedSummary(request) {
        if (!this.isAvailable()) {
            throw new Error('Cloud AI is currently unavailable.');
        }

        return this.makeRequest('/ai/explain', {
            method: 'POST',
            body: {
                filePath: request.filePath,
                fileHash: `detailed:${request.fileHash}`,
                metrics: request.metrics,
                dependencies: request.dependencies,
                dependents: request.dependents,
                fileContent: request.fileContent || null,
                detailed: true,
            },
        });
    }

    /**
     * Request AI analysis of the relationship between two connected files.
     * @param {Object} request
     * @returns {Promise<{summary: string, cached: boolean, timestamp: string}>}
     */
    async requestRelationshipAnalysis(request) {
        if (!this.isAvailable()) {
            throw new Error('Cloud AI is currently unavailable.');
        }

        return this.makeRequest('/ai/explain', {
            method: 'POST',
            body: {
                relationship: {
                    sourceFile: request.sourceFile,
                    targetFile: request.targetFile,
                    direction: request.direction,
                    cacheKey: request.cacheKey,
                },
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
            throw new Error('Cloud AI is currently unavailable.');
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
            throw new Error('Cloud AI is currently unavailable.');
        }

        return this.makeRequest('/ai/query', {
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
     * Opens the circuit-breaker on repeated server errors.
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
                    // Read error body for debugging
                    let errorDetail = '';
                    try {
                        const errorBody = await response.json();
                        errorDetail = errorBody.details || errorBody.error || '';
                        console.error(`API ${response.status} response:`, JSON.stringify(errorBody));
                    } catch { /* ignore parse errors */ }

                    const errorMsg = errorDetail
                        ? `API error: ${response.status} — ${errorDetail}`
                        : `API error: ${response.status} ${response.statusText}`;

                    if (response.status >= 500) {
                        this._consecutiveFailures++;
                        if (this._consecutiveFailures >= 2) {
                            this._openCircuit();
                        }
                    }
                    if (response.status >= 400 && response.status < 500) {
                        // Client error — no retry
                        throw new Error(errorMsg);
                    }
                    // Server error — will retry
                    throw new Error(errorMsg);
                }

                // Success — reset failure counter
                this._consecutiveFailures = 0;
                return await response.json();
            } catch (err) {
                lastError = err;

                // Don't retry on client errors (4xx)
                const isClientError = err.message && err.message.includes('API error: 4');
                if (isClientError || attempt >= this.maxRetries) {
                    break;
                }

                const delay = this.baseDelay * Math.pow(2, attempt);
                console.warn(`Request failed (attempt ${attempt + 1}/${this.maxRetries + 1}). Retrying in ${delay}ms...`);
                await this.sleep(delay);
            }
        }

        throw lastError || new Error('Request failed after maximum retries');
    }

    /** Open the circuit-breaker to stop further requests. */
    _openCircuit() {
        if (!this._circuitOpen) {
            console.warn('APIClient: circuit-breaker OPEN — backend appears unavailable. Will retry in 5 minutes.');
        }
        this._circuitOpen = true;
        this._circuitOpenedAt = Date.now();
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
