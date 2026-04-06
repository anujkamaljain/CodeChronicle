'use strict';

const vscode = require('vscode');

/**
 * AuthService manages authentication state for the CodeChronicle extension.
 * Persists JWT tokens in VS Code's SecretStorage for secure local storage.
 * Gates all extension features behind verified authentication.
 */
class AuthService {
    /** @type {string} */
    static TOKEN_KEY = 'codechronicle.authToken';
    /** @type {string} */
    static USER_KEY = 'codechronicle.authUser';

    /**
     * @param {vscode.ExtensionContext} context
     * @param {string} apiEndpoint
     */
    constructor(context, apiEndpoint) {
        this._context = context;
        this._secrets = context.secrets;
        this._apiEndpoint = apiEndpoint;
        this._token = null;
        this._user = null;
        this._isAuthenticated = false;
        this._onAuthStateChanged = new vscode.EventEmitter();
        this.onAuthStateChanged = this._onAuthStateChanged.event;
    }

    /** @returns {boolean} */
    get isAuthenticated() {
        return this._isAuthenticated;
    }

    /** @returns {{ email: string, name: string | null } | null} */
    get user() {
        return this._user;
    }

    /** @returns {string | null} */
    get token() {
        return this._token;
    }

    /**
     * Initialise auth state by loading persisted token and validating it
     * against the backend.
     * @returns {Promise<boolean>} true if user is authenticated
     */
    async initialise() {
        const storedToken = await this._secrets.get(AuthService.TOKEN_KEY);
        const storedUser = this._context.globalState.get(AuthService.USER_KEY);

        if (!storedToken) {
            this._setUnauthenticated();
            return false;
        }

        try {
            // Validate the token against the backend
            const result = await this._apiRequest('/auth/verify-token', { token: storedToken });

            if (result.valid) {
                this._token = storedToken;
                this._user = result.user || storedUser;
                this._isAuthenticated = true;
                // Persist user info (non-sensitive)
                await this._context.globalState.update(AuthService.USER_KEY, this._user);
                this._onAuthStateChanged.fire({ authenticated: true, user: this._user });
                return true;
            }

            // Token expired or invalid — clear
            await this.logout();
            return false;
        } catch (err) {
            console.warn('AuthService: initialise failed:', err.message);

            // Only force logout when backend explicitly says token is invalid/expired.
            // For transient backend/network errors, restore local session to avoid
            // blocking the user with a login prompt on every IDE restart.
            if (err.statusCode === 400 || err.statusCode === 401) {
                await this.logout();
                return false;
            }

            return this._restoreLocalSession(storedToken, storedUser);
        }
    }

    /**
     * Register a new account.
     * @param {{ email: string, password: string, name?: string }} credentials
     * @returns {Promise<{ success: boolean, message: string, error?: string }>}
     */
    async register(credentials) {
        try {
            const result = await this._apiRequest('/auth/register', credentials);
            return { success: true, message: result.message };
        } catch (err) {
            // Registration can succeed server-side but first response may fail
            // due to cold starts/network jitter. Retry once for robustness.
            if (this._isTransientError(err)) {
                try {
                    await this._sleep(900);
                    const retry = await this._apiRequest('/auth/register', credentials);
                    return { success: true, message: retry.message };
                } catch (retryErr) {
                    return { success: false, error: retryErr.message };
                }
            }
            return { success: false, error: err.message };
        }
    }

    /**
     * Verify email with 6-digit code.
     * @param {{ email: string, code: string }} data
     * @returns {Promise<{ success: boolean, message?: string, error?: string }>}
     */
    async verifyEmail(data) {
        try {
            const result = await this._apiRequest('/auth/verify-email', data);

            if (result.token) {
                await this._persistAuth(result.token, result.user);
            }

            return { success: true, message: result.message };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * Login with email and password.
     * @param {{ email: string, password: string }} credentials
     * @returns {Promise<{ success: boolean, message?: string, error?: string, needsVerification?: boolean }>}
     */
    async login(credentials) {
        try {
            const result = await this._apiRequest('/auth/login', credentials);

            if (result.token) {
                await this._persistAuth(result.token, result.user);
            }

            return { success: true, message: result.message };
        } catch (err) {
            // Check for specific error codes
            if (err.needsVerification) {
                return { success: false, error: err.message, needsVerification: true };
            }
            return { success: false, error: err.message };
        }
    }

    /**
     * Resend verification code.
     * @param {string} email
     * @returns {Promise<{ success: boolean, message?: string, error?: string }>}
     */
    async resendCode(email) {
        try {
            const result = await this._apiRequest('/auth/resend-code', { email });
            return { success: true, message: result.message };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * Log the user out — clear tokens and state.
     */
    async logout() {
        await this._secrets.delete(AuthService.TOKEN_KEY);
        await this._context.globalState.update(AuthService.USER_KEY, undefined);
        this._setUnauthenticated();
    }

    // ─── Internal ────────────────────────────────────────────────

    /**
     * @param {string} token
     * @param {{ email: string, name: string | null }} user
     */
    async _persistAuth(token, user) {
        this._token = token;
        this._user = user;
        this._isAuthenticated = true;
        await this._secrets.store(AuthService.TOKEN_KEY, token);
        await this._context.globalState.update(AuthService.USER_KEY, user);
        this._onAuthStateChanged.fire({ authenticated: true, user });
    }

    /**
     * Restore a local session when backend verification is unavailable.
     * @param {string} token
     * @param {{ email?: string, name?: string | null } | null | undefined} storedUser
     * @returns {boolean}
     */
    _restoreLocalSession(token, storedUser) {
        const tokenUser = this._decodeTokenPayload(token);
        const user = storedUser || tokenUser || null;

        if (!user || !user.email) {
            this._setUnauthenticated();
            return false;
        }

        this._token = token;
        this._user = { email: user.email, name: user.name || null };
        this._isAuthenticated = true;
        this._onAuthStateChanged.fire({ authenticated: true, user: this._user, offline: true });
        return true;
    }

    /**
     * Decode JWT payload without signature verification (local fallback only).
     * @param {string} token
     * @returns {{ email?: string, name?: string | null } | null}
     */
    _decodeTokenPayload(token) {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) return null;
            const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const json = Buffer.from(payload, 'base64').toString('utf8');
            return JSON.parse(json);
        } catch {
            return null;
        }
    }

    _setUnauthenticated() {
        this._token = null;
        this._user = null;
        this._isAuthenticated = false;
        this._onAuthStateChanged.fire({ authenticated: false, user: null });
    }

    /**
     * Make a POST request to the backend auth API.
     * @param {string} path
     * @param {Object} body
     * @returns {Promise<Object>}
     */
    async _apiRequest(path, body) {
        const url = `${this._apiEndpoint}${path}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            clearTimeout(timeout);

            let data;
            try {
                data = await response.json();
            } catch {
                data = {};
            }

            if (!response.ok) {
                const err = new Error(data.error || data.message || `Request failed (${response.status})`);
                err.statusCode = response.status;
                if (data.needsVerification) err.needsVerification = true;
                throw err;
            }

            return data;
        } catch (err) {
            clearTimeout(timeout);
            if (err.name === 'AbortError') {
                throw new Error('Request timed out. Please check your network connection.');
            }
            throw err;
        }
    }

    _isTransientError(err) {
        if (!err) return false;
        if (err.name === 'AbortError') return true;
        if (typeof err.statusCode === 'number' && err.statusCode >= 500) return true;
        const msg = String(err.message || '').toLowerCase();
        return msg.includes('timed out') || msg.includes('network') || msg.includes('fetch');
    }

    _sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

module.exports = { AuthService };
