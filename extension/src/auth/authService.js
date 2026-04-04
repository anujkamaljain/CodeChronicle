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
        try {
            const storedToken = await this._secrets.get(AuthService.TOKEN_KEY);
            const storedUser = this._context.globalState.get(AuthService.USER_KEY);

            if (!storedToken) {
                this._setUnauthenticated();
                return false;
            }

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
            // If network is down but we have a stored token, allow offline mode
            const storedToken = await this._secrets.get(AuthService.TOKEN_KEY);
            const storedUser = this._context.globalState.get(AuthService.USER_KEY);
            if (storedToken && storedUser) {
                this._token = storedToken;
                this._user = storedUser;
                this._isAuthenticated = true;
                this._onAuthStateChanged.fire({ authenticated: true, user: this._user, offline: true });
                return true;
            }
            this._setUnauthenticated();
            return false;
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
        const timeout = setTimeout(() => controller.abort(), 15000);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            clearTimeout(timeout);

            const data = await response.json();

            if (!response.ok) {
                const err = new Error(data.error || `Request failed (${response.status})`);
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
}

module.exports = { AuthService };
