'use strict';

const vscode = require('vscode');

/**
 * AuthWebviewProvider renders the authentication UI (login / register / verify-email)
 * inside a VS Code webview panel. It uses the same dark glassmorphism + neon design
 * language as the main CodeChronicle UI.
 *
 * Communication is done via postMessage between the webview and the extension host.
 */
class AuthWebviewProvider {
    /**
     * @param {vscode.ExtensionContext} context
     * @param {import('./authService').AuthService} authService
     */
    constructor(context, authService) {
        this._context = context;
        this._authService = authService;
        this._panel = null;
    }

    /**
     * Show the auth webview panel (or reveal it if already open).
     */
    show() {
        if (this._panel) {
            this._panel.reveal(vscode.ViewColumn.One);
            return;
        }

        this._panel = vscode.window.createWebviewPanel(
            'codechronicle.auth',
            'CodeChronicle — Sign In',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this._context.extensionUri, 'assets'),
                ],
            }
        );

        const iconUri = this._panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this._context.extensionUri, 'assets', 'icon.png')
        );

        this._panel.webview.html = this._getHtml(this._panel.webview, iconUri);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            (message) => this._handleMessage(message),
            undefined,
            this._context.subscriptions
        );

        this._panel.onDidDispose(() => {
            this._panel = null;
        });
    }

    /**
     * Dispose the panel if open.
     */
    dispose() {
        if (this._panel) {
            this._panel.dispose();
            this._panel = null;
        }
    }

    /**
     * Handle messages from the webview.
     * @param {Object} message
     */
    async _handleMessage(message) {
        switch (message.type) {
            case 'register': {
                this._postMessage({ type: 'loading', loading: true });
                const result = await this._authService.register(message.data);
                this._postMessage({ type: 'loading', loading: false });
                if (result.success) {
                    this._postMessage({
                        type: 'registerSuccess',
                        message: result.message,
                        email: message.data.email,
                    });
                } else {
                    this._postMessage({ type: 'error', message: result.error });
                }
                break;
            }

            case 'login': {
                this._postMessage({ type: 'loading', loading: true });
                const result = await this._authService.login(message.data);
                this._postMessage({ type: 'loading', loading: false });
                if (result.success) {
                    this._postMessage({ type: 'loginSuccess' });
                    // Small delay so the user sees the success animation
                    setTimeout(() => this.dispose(), 1200);
                } else if (result.needsVerification) {
                    this._postMessage({
                        type: 'needsVerification',
                        message: result.error,
                        email: message.data.email,
                    });
                } else {
                    this._postMessage({ type: 'error', message: result.error });
                }
                break;
            }

            case 'verifyEmail': {
                this._postMessage({ type: 'loading', loading: true });
                const result = await this._authService.verifyEmail(message.data);
                this._postMessage({ type: 'loading', loading: false });
                if (result.success) {
                    this._postMessage({ type: 'verifySuccess', message: result.message });
                    setTimeout(() => this.dispose(), 1500);
                } else {
                    this._postMessage({ type: 'error', message: result.error });
                }
                break;
            }

            case 'resendCode': {
                this._postMessage({ type: 'loading', loading: true });
                const result = await this._authService.resendCode(message.data.email);
                this._postMessage({ type: 'loading', loading: false });
                this._postMessage({
                    type: 'info',
                    message: result.success
                        ? 'A new verification code has been sent to your email.'
                        : result.error || 'Failed to resend code.',
                });
                break;
            }
        }
    }

    /**
     * Post a message to the webview.
     */
    _postMessage(message) {
        if (this._panel) {
            this._panel.webview.postMessage(message);
        }
    }

    /**
     * Generate the full HTML for the auth webview.
     */
    _getHtml(webview, iconUri) {
        const nonce = getNonce();
        const cspSource = webview.cspSource;

        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}';
             img-src ${cspSource};
             font-src ${cspSource} https://fonts.gstatic.com;
             connect-src https://fonts.googleapis.com https://fonts.gstatic.com;">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <title>CodeChronicle — Authentication</title>
  <style>
    /* ═══════════════════════════════════════════════════════
       CodeChronicle Auth — Dark Glassmorphism Theme
       ═══════════════════════════════════════════════════════ */
    :root {
      --bg-primary: #050a14;
      --bg-secondary: #0a1122;
      --bg-surface: #0f172a;
      --bg-elevated: #1e293b;
      --bg-glass: rgba(15, 23, 42, 0.75);
      --border-glass: rgba(148, 163, 184, 0.12);
      --text-primary: #f1f5f9;
      --text-secondary: #94a3b8;
      --text-muted: #64748b;
      --neon-cyan: #00f0ff;
      --neon-purple: #a855f7;
      --neon-pink: #ec4899;
      --neon-green: #10b981;
      --risk-high: #ef4444;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      background: var(--bg-primary);
      color: var(--text-primary);
      font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      position: relative;
    }

    /* ── Background Effects ─────────────────────────────── */
    .bg-grid {
      position: fixed;
      inset: 0;
      background-image:
        linear-gradient(rgba(148, 163, 184, 0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(148, 163, 184, 0.03) 1px, transparent 1px);
      background-size: 24px 24px;
      pointer-events: none;
      z-index: 0;
    }

    .bg-gradient {
      position: fixed;
      inset: 0;
      background:
        radial-gradient(ellipse 600px 400px at 30% 20%, rgba(0, 240, 255, 0.06), transparent),
        radial-gradient(ellipse 500px 350px at 70% 80%, rgba(168, 85, 247, 0.05), transparent),
        linear-gradient(180deg, #050a14 0%, #0a1122 50%, #050a14 100%);
      pointer-events: none;
      z-index: 0;
    }

    /* ── Floating Orbs ──────────────────────────────────── */
    .orb {
      position: fixed;
      border-radius: 50%;
      filter: blur(80px);
      opacity: 0.3;
      pointer-events: none;
      z-index: 0;
      animation: orb-float 20s ease-in-out infinite;
    }
    .orb-1 { width: 300px; height: 300px; background: rgba(0,240,255,0.15); top: -50px; left: -50px; animation-delay: 0s; }
    .orb-2 { width: 250px; height: 250px; background: rgba(168,85,247,0.12); bottom: -30px; right: -30px; animation-delay: -7s; }
    .orb-3 { width: 200px; height: 200px; background: rgba(236,72,153,0.08); top: 40%; right: 10%; animation-delay: -14s; }

    @keyframes orb-float {
      0%, 100% { transform: translate(0, 0) scale(1); }
      33% { transform: translate(30px, -20px) scale(1.05); }
      66% { transform: translate(-20px, 15px) scale(0.95); }
    }

    /* ── Auth Container ─────────────────────────────────── */
    .auth-container {
      position: relative;
      z-index: 1;
      width: 100%;
      max-width: 440px;
      padding: 20px;
    }

    .auth-card {
      background: var(--bg-glass);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid var(--border-glass);
      border-radius: 20px;
      padding: 40px 36px;
      box-shadow:
        0 25px 60px rgba(0, 0, 0, 0.5),
        0 0 40px rgba(0, 240, 255, 0.03),
        inset 0 1px 0 rgba(255, 255, 255, 0.04);
      animation: card-appear 0.6s ease-out;
    }

    @keyframes card-appear {
      from { opacity: 0; transform: translateY(20px) scale(0.97); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    /* ── Logo / Header ──────────────────────────────────── */
    .auth-header {
      text-align: center;
      margin-bottom: 32px;
    }

    .auth-logo {
      width: 56px;
      height: 56px;
      border-radius: 14px;
      margin-bottom: 12px;
      box-shadow: 0 0 30px rgba(0, 240, 255, 0.15);
    }

    .auth-title {
      font-size: 1.5rem;
      font-weight: 700;
      background: linear-gradient(135deg, var(--neon-cyan), var(--neon-purple));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-bottom: 4px;
    }

    .auth-subtitle {
      font-size: 0.8125rem;
      color: var(--text-secondary);
      letter-spacing: 0.02em;
    }

    /* ── Tab Switcher ───────────────────────────────────── */
    .auth-tabs {
      display: flex;
      margin-bottom: 28px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(148, 163, 184, 0.08);
      overflow: hidden;
    }

    .auth-tab {
      flex: 1;
      padding: 10px;
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--text-muted);
      background: none;
      border: none;
      cursor: pointer;
      transition: all 0.25s ease;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      position: relative;
    }

    .auth-tab:hover { color: var(--text-secondary); }

    .auth-tab.active {
      color: var(--neon-cyan);
      background: rgba(0, 240, 255, 0.06);
    }

    .auth-tab.active::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 20%;
      width: 60%;
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--neon-cyan), transparent);
      box-shadow: 0 0 8px var(--neon-cyan);
    }

    /* ── Form Fields ────────────────────────────────────── */
    .form-group {
      margin-bottom: 18px;
    }

    .form-label {
      display: block;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-secondary);
      margin-bottom: 6px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .form-input {
      width: 100%;
      padding: 12px 14px;
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid var(--border-glass);
      border-radius: 10px;
      color: var(--text-primary);
      font-size: 0.875rem;
      font-family: inherit;
      outline: none;
      transition: all 0.25s ease;
    }

    .form-input:focus {
      border-color: rgba(0, 240, 255, 0.4);
      box-shadow: 0 0 0 3px rgba(0, 240, 255, 0.08), 0 0 15px rgba(0, 240, 255, 0.05);
    }

    .form-input::placeholder {
      color: var(--text-muted);
    }

    .form-input.error {
      border-color: rgba(239, 68, 68, 0.5);
      box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.08);
    }

    /* ── Password Field ─────────────────────────────────── */
    .password-wrapper {
      position: relative;
    }

    .password-toggle {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 0.8rem;
      padding: 4px;
      transition: color 0.2s;
    }

    .password-toggle:hover { color: var(--neon-cyan); }

    /* ── Password Strength ──────────────────────────────── */
    .pwd-strength {
      display: flex;
      gap: 4px;
      margin-top: 8px;
    }

    .pwd-bar {
      flex: 1;
      height: 3px;
      border-radius: 2px;
      background: rgba(148, 163, 184, 0.12);
      transition: background 0.3s ease;
    }

    .pwd-bar.filled-1 { background: var(--risk-high); }
    .pwd-bar.filled-2 { background: #f59e0b; }
    .pwd-bar.filled-3 { background: #eab308; }
    .pwd-bar.filled-4 { background: var(--neon-green); }

    .pwd-strength-label {
      font-size: 0.6875rem;
      color: var(--text-muted);
      margin-top: 4px;
      text-align: right;
    }

    /* ── OTP Input ──────────────────────────────────────── */
    .otp-container {
      display: flex;
      gap: 8px;
      justify-content: center;
      margin: 24px 0;
    }

    .otp-input {
      width: 48px;
      height: 56px;
      text-align: center;
      font-size: 1.5rem;
      font-weight: 700;
      font-family: 'JetBrains Mono', monospace;
      color: var(--neon-cyan);
      background: rgba(15, 23, 42, 0.8);
      border: 2px solid var(--border-glass);
      border-radius: 12px;
      outline: none;
      transition: all 0.25s ease;
      caret-color: var(--neon-cyan);
    }

    .otp-input:focus {
      border-color: rgba(0, 240, 255, 0.5);
      box-shadow: 0 0 0 3px rgba(0, 240, 255, 0.1), 0 0 20px rgba(0, 240, 255, 0.08);
      background: rgba(0, 240, 255, 0.03);
    }

    .otp-input.filled {
      border-color: rgba(0, 240, 255, 0.3);
      background: rgba(0, 240, 255, 0.04);
    }

    /* ── Submit Button ──────────────────────────────────── */
    .auth-btn {
      width: 100%;
      padding: 13px;
      border: 1px solid var(--neon-cyan);
      background: rgba(0, 240, 255, 0.08);
      color: var(--neon-cyan);
      font-size: 0.875rem;
      font-weight: 600;
      font-family: inherit;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.3s ease;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-top: 8px;
    }

    .auth-btn:hover:not(:disabled) {
      background: rgba(0, 240, 255, 0.15);
      box-shadow: 0 0 25px rgba(0, 240, 255, 0.2), inset 0 0 25px rgba(0, 240, 255, 0.04);
      transform: translateY(-1px);
    }

    .auth-btn:active:not(:disabled) { transform: translateY(0); }

    .auth-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
      transform: none;
    }

    .auth-btn-spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid currentColor;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    /* ── Link Button ────────────────────────────────────── */
    .auth-link {
      background: none;
      border: none;
      color: var(--neon-cyan);
      font-size: 0.8125rem;
      font-family: inherit;
      cursor: pointer;
      text-decoration: none;
      transition: opacity 0.2s;
      padding: 0;
    }

    .auth-link:hover { opacity: 0.8; text-decoration: underline; }

    /* ── Alert Messages ─────────────────────────────────── */
    .auth-alert {
      padding: 10px 14px;
      border-radius: 10px;
      font-size: 0.8125rem;
      line-height: 1.5;
      margin-bottom: 16px;
      display: flex;
      align-items: flex-start;
      gap: 10px;
      animation: alert-in 0.3s ease-out;
    }

    @keyframes alert-in {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .auth-alert-error {
      background: rgba(239, 68, 68, 0.08);
      border: 1px solid rgba(239, 68, 68, 0.2);
      color: #fca5a5;
    }

    .auth-alert-success {
      background: rgba(16, 185, 129, 0.08);
      border: 1px solid rgba(16, 185, 129, 0.2);
      color: #6ee7b7;
    }

    .auth-alert-info {
      background: rgba(0, 240, 255, 0.06);
      border: 1px solid rgba(0, 240, 255, 0.15);
      color: #7dd3fc;
    }

    .auth-alert-icon {
      flex-shrink: 0;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.65rem;
      font-weight: 700;
      margin-top: 1px;
    }

    .auth-alert-error .auth-alert-icon {
      background: rgba(239, 68, 68, 0.2);
      color: #ef4444;
    }

    .auth-alert-success .auth-alert-icon {
      background: rgba(16, 185, 129, 0.2);
      color: #10b981;
    }

    .auth-alert-info .auth-alert-icon {
      background: rgba(0, 240, 255, 0.15);
      color: #00f0ff;
    }

    /* ── Success Animation ──────────────────────────────── */
    .success-checkmark {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 16px;
      padding: 32px 0;
      animation: success-appear 0.5s ease-out;
    }

    @keyframes success-appear {
      from { opacity: 0; transform: scale(0.8); }
      to { opacity: 1; transform: scale(1); }
    }

    .success-circle {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: rgba(16, 185, 129, 0.1);
      border: 2px solid var(--neon-green);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2rem;
      color: var(--neon-green);
      box-shadow: 0 0 30px rgba(16, 185, 129, 0.2);
      animation: checkmark-pulse 1s ease-in-out infinite;
    }

    @keyframes checkmark-pulse {
      0%, 100% { box-shadow: 0 0 20px rgba(16, 185, 129, 0.15); }
      50% { box-shadow: 0 0 40px rgba(16, 185, 129, 0.3); }
    }

    .success-text {
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--neon-green);
    }

    .success-sub {
      font-size: 0.8125rem;
      color: var(--text-secondary);
      text-align: center;
    }

    /* ── Verification View ──────────────────────────────── */
    .verify-header {
      text-align: center;
      margin-bottom: 8px;
    }

    .verify-email-display {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8125rem;
      color: var(--neon-cyan);
      background: rgba(0, 240, 255, 0.06);
      padding: 6px 14px;
      border-radius: 8px;
      display: inline-block;
      margin: 8px 0 4px;
      border: 1px solid rgba(0, 240, 255, 0.15);
    }

    .verify-instructions {
      font-size: 0.8125rem;
      color: var(--text-secondary);
      text-align: center;
      margin-bottom: 4px;
      line-height: 1.5;
    }

    .resend-row {
      text-align: center;
      margin-top: 16px;
      font-size: 0.8125rem;
      color: var(--text-muted);
    }

    /* ── Footer ─────────────────────────────────────────── */
    .auth-footer {
      text-align: center;
      margin-top: 20px;
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    /* ── Page Transitions ───────────────────────────────── */
    .page { display: none; }
    .page.active { display: block; animation: page-in 0.35s ease-out; }

    @keyframes page-in {
      from { opacity: 0; transform: translateX(12px); }
      to { opacity: 1; transform: translateX(0); }
    }

    /* ── Responsive ─────────────────────────────────────── */
    @media (max-width: 480px) {
      .auth-card { padding: 28px 20px; }
      .otp-input { width: 42px; height: 50px; font-size: 1.25rem; }
    }
  </style>
</head>
<body>
  <div class="bg-gradient"></div>
  <div class="bg-grid"></div>
  <div class="orb orb-1"></div>
  <div class="orb orb-2"></div>
  <div class="orb orb-3"></div>

  <div class="auth-container">
    <div class="auth-card">
      <!-- ─── Header ───────────────────────────── -->
      <div class="auth-header">
        <img src="${iconUri}" alt="CodeChronicle" class="auth-logo">
        <div class="auth-title">CodeChronicle</div>
        <div class="auth-subtitle" id="auth-subtitle">Sign in to continue</div>
      </div>

      <!-- Alert slot -->
      <div id="alert-container"></div>

      <!-- ═══════════════════════════════════════ -->
      <!--  LOGIN / REGISTER PAGE                 -->
      <!-- ═══════════════════════════════════════ -->
      <div id="page-auth" class="page active">
        <div class="auth-tabs">
          <button class="auth-tab active" id="tab-login" onclick="switchTab('login')">Sign In</button>
          <button class="auth-tab" id="tab-register" onclick="switchTab('register')">Create Account</button>
        </div>

        <form id="auth-form" onsubmit="handleAuthSubmit(event)">
          <!-- Name (register only) -->
          <div class="form-group" id="field-name" style="display:none">
            <label class="form-label" for="input-name">Full Name</label>
            <input class="form-input" id="input-name" type="text" placeholder="John Doe" autocomplete="name" maxlength="100">
          </div>

          <!-- Email -->
          <div class="form-group">
            <label class="form-label" for="input-email">Email Address</label>
            <input class="form-input" id="input-email" type="email" placeholder="you@example.com" autocomplete="email" required>
          </div>

          <!-- Password -->
          <div class="form-group">
            <label class="form-label" for="input-password">Password</label>
            <div class="password-wrapper">
              <input class="form-input" id="input-password" type="password" placeholder="••••••••" autocomplete="current-password" required minlength="8">
              <button type="button" class="password-toggle" onclick="togglePassword()" id="pwd-toggle" aria-label="Toggle password visibility">👁</button>
            </div>
            <div id="pwd-strength-container" style="display:none">
              <div class="pwd-strength">
                <div class="pwd-bar" id="pwd-bar-1"></div>
                <div class="pwd-bar" id="pwd-bar-2"></div>
                <div class="pwd-bar" id="pwd-bar-3"></div>
                <div class="pwd-bar" id="pwd-bar-4"></div>
              </div>
              <div class="pwd-strength-label" id="pwd-strength-label"></div>
            </div>
          </div>

          <button type="submit" class="auth-btn" id="auth-submit-btn">
            <span id="auth-btn-text">Sign In</span>
          </button>
        </form>
      </div>

      <!-- ═══════════════════════════════════════ -->
      <!--  EMAIL VERIFICATION PAGE               -->
      <!-- ═══════════════════════════════════════ -->
      <div id="page-verify" class="page">
        <div class="verify-header">
          <div style="font-size:2.5rem;margin-bottom:8px;">✉️</div>
          <p class="verify-instructions">We've sent a 6-digit code to</p>
          <div class="verify-email-display" id="verify-email-display"></div>
          <p class="verify-instructions" style="margin-top:8px;">Enter the code below to verify your account.</p>
        </div>

        <div class="otp-container" id="otp-container">
          <input class="otp-input" type="text" maxlength="1" inputmode="numeric" pattern="[0-9]" data-idx="0" autocomplete="one-time-code">
          <input class="otp-input" type="text" maxlength="1" inputmode="numeric" pattern="[0-9]" data-idx="1">
          <input class="otp-input" type="text" maxlength="1" inputmode="numeric" pattern="[0-9]" data-idx="2">
          <input class="otp-input" type="text" maxlength="1" inputmode="numeric" pattern="[0-9]" data-idx="3">
          <input class="otp-input" type="text" maxlength="1" inputmode="numeric" pattern="[0-9]" data-idx="4">
          <input class="otp-input" type="text" maxlength="1" inputmode="numeric" pattern="[0-9]" data-idx="5">
        </div>

        <button class="auth-btn" id="verify-btn" onclick="handleVerifySubmit()" disabled>
          <span id="verify-btn-text">Verify Email</span>
        </button>

        <div class="resend-row">
          Didn't receive the code?
          <button class="auth-link" onclick="handleResendCode()">Resend</button>
        </div>

        <div style="text-align:center;margin-top:12px;">
          <button class="auth-link" onclick="goBackToAuth()">← Back to Sign In</button>
        </div>
      </div>

      <!-- ═══════════════════════════════════════ -->
      <!--  SUCCESS PAGE                          -->
      <!-- ═══════════════════════════════════════ -->
      <div id="page-success" class="page">
        <div class="success-checkmark">
          <div class="success-circle">✓</div>
          <div class="success-text" id="success-text">Welcome to CodeChronicle!</div>
          <div class="success-sub">Redirecting to your dashboard...</div>
        </div>
      </div>

      <div class="auth-footer">
        Secured with end-to-end encryption • CodeChronicle
      </div>
    </div>
  </div>

  <script nonce="${nonce}">
    // ═══════════════════════════════════════════════════════
    //  Auth Webview Controller
    // ═══════════════════════════════════════════════════════
    const vscode = acquireVsCodeApi();

    let currentMode = 'login'; // 'login' | 'register'
    let verifyEmail = '';
    let isLoading = false;

    // ── Tab switching ────────────────────────────────────
    function switchTab(mode) {
      currentMode = mode;
      clearAlert();

      document.getElementById('tab-login').classList.toggle('active', mode === 'login');
      document.getElementById('tab-register').classList.toggle('active', mode === 'register');
      document.getElementById('field-name').style.display = mode === 'register' ? 'block' : 'none';
      document.getElementById('pwd-strength-container').style.display = mode === 'register' ? 'block' : 'none';
      document.getElementById('auth-btn-text').textContent = mode === 'login' ? 'Sign In' : 'Create Account';
      document.getElementById('auth-subtitle').textContent = mode === 'login' ? 'Sign in to continue' : 'Create your account';
      document.getElementById('input-password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';

      // Reset form
      document.getElementById('auth-form').reset();
      resetPasswordStrength();
    }

    // ── Page navigation ──────────────────────────────────
    function showPage(pageId) {
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById(pageId).classList.add('active');
    }

    function goBackToAuth() {
      clearAlert();
      showPage('page-auth');
    }

    // ── Form submit ──────────────────────────────────────
    function handleAuthSubmit(e) {
      e.preventDefault();
      if (isLoading) return;

      const email = document.getElementById('input-email').value.trim();
      const password = document.getElementById('input-password').value;
      const name = document.getElementById('input-name').value.trim();

      if (!email || !password) {
        showAlert('error', 'Please fill in all required fields.');
        return;
      }

      clearAlert();

      if (currentMode === 'register') {
        vscode.postMessage({
          type: 'register',
          data: { email, password, name: name || undefined },
        });
      } else {
        vscode.postMessage({
          type: 'login',
          data: { email, password },
        });
      }
    }

    // ── OTP Input Logic ──────────────────────────────────
    function setupOtpInputs() {
      const inputs = document.querySelectorAll('.otp-input');
      inputs.forEach((input, idx) => {
        input.addEventListener('input', (e) => {
          const val = e.target.value.replace(/[^0-9]/g, '');
          e.target.value = val;
          e.target.classList.toggle('filled', val.length > 0);

          if (val && idx < inputs.length - 1) {
            inputs[idx + 1].focus();
          }
          updateVerifyButton();
        });

        input.addEventListener('keydown', (e) => {
          if (e.key === 'Backspace' && !input.value && idx > 0) {
            inputs[idx - 1].focus();
            inputs[idx - 1].value = '';
            inputs[idx - 1].classList.remove('filled');
            updateVerifyButton();
          }
          if (e.key === 'Enter') {
            handleVerifySubmit();
          }
        });

        // Handle paste
        input.addEventListener('paste', (e) => {
          e.preventDefault();
          const pasted = (e.clipboardData.getData('text') || '').replace(/[^0-9]/g, '').slice(0, 6);
          for (let i = 0; i < pasted.length && i + idx < inputs.length; i++) {
            inputs[i + idx].value = pasted[i];
            inputs[i + idx].classList.add('filled');
          }
          const nextIdx = Math.min(idx + pasted.length, inputs.length - 1);
          inputs[nextIdx].focus();
          updateVerifyButton();
        });
      });
    }

    function getOtpCode() {
      const inputs = document.querySelectorAll('.otp-input');
      return Array.from(inputs).map(i => i.value).join('');
    }

    function updateVerifyButton() {
      const code = getOtpCode();
      document.getElementById('verify-btn').disabled = code.length !== 6 || isLoading;
    }

    function clearOtpInputs() {
      document.querySelectorAll('.otp-input').forEach(i => {
        i.value = '';
        i.classList.remove('filled');
      });
      updateVerifyButton();
    }

    // ── Verify submit ────────────────────────────────────
    function handleVerifySubmit() {
      if (isLoading) return;
      const code = getOtpCode();
      if (code.length !== 6) return;

      vscode.postMessage({
        type: 'verifyEmail',
        data: { email: verifyEmail, code },
      });
    }

    function handleResendCode() {
      if (isLoading) return;
      vscode.postMessage({
        type: 'resendCode',
        data: { email: verifyEmail },
      });
    }

    // ── Password visibility toggle ───────────────────────
    function togglePassword() {
      const input = document.getElementById('input-password');
      const btn = document.getElementById('pwd-toggle');
      if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '🙈';
      } else {
        input.type = 'password';
        btn.textContent = '👁';
      }
    }

    // ── Password strength meter ──────────────────────────
    function computePasswordStrength(pwd) {
      let score = 0;
      if (pwd.length >= 8) score++;
      if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
      if (/[0-9]/.test(pwd)) score++;
      if (/[^A-Za-z0-9]/.test(pwd)) score++;
      return score;
    }

    function updatePasswordStrength() {
      if (currentMode !== 'register') return;
      const pwd = document.getElementById('input-password').value;
      const strength = computePasswordStrength(pwd);
      const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
      const colors = ['', 'filled-1', 'filled-2', 'filled-3', 'filled-4'];

      for (let i = 1; i <= 4; i++) {
        const bar = document.getElementById('pwd-bar-' + i);
        bar.className = 'pwd-bar';
        if (i <= strength) bar.classList.add(colors[strength]);
      }
      document.getElementById('pwd-strength-label').textContent = pwd ? labels[strength] : '';
    }

    function resetPasswordStrength() {
      for (let i = 1; i <= 4; i++) {
        document.getElementById('pwd-bar-' + i).className = 'pwd-bar';
      }
      document.getElementById('pwd-strength-label').textContent = '';
    }

    document.getElementById('input-password').addEventListener('input', updatePasswordStrength);

    // ── Alert display ────────────────────────────────────
    function showAlert(type, message) {
      const icons = { error: '✕', success: '✓', info: 'ℹ' };
      document.getElementById('alert-container').innerHTML =
        '<div class="auth-alert auth-alert-' + type + '">' +
          '<div class="auth-alert-icon">' + (icons[type] || 'ℹ') + '</div>' +
          '<div>' + escapeHtml(message) + '</div>' +
        '</div>';
    }

    function clearAlert() {
      document.getElementById('alert-container').innerHTML = '';
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // ── Loading state ────────────────────────────────────
    function setLoading(loading) {
      isLoading = loading;
      const authBtn = document.getElementById('auth-submit-btn');
      const verifyBtn = document.getElementById('verify-btn');
      const authText = document.getElementById('auth-btn-text');
      const verifyText = document.getElementById('verify-btn-text');

      if (loading) {
        authBtn.disabled = true;
        verifyBtn.disabled = true;
        authText.innerHTML = '<span class="auth-btn-spinner"></span> Please wait...';
        verifyText.innerHTML = '<span class="auth-btn-spinner"></span> Verifying...';
      } else {
        authBtn.disabled = false;
        authText.textContent = currentMode === 'login' ? 'Sign In' : 'Create Account';
        verifyText.textContent = 'Verify Email';
        updateVerifyButton();
      }
    }

    // ── Message handler ──────────────────────────────────
    window.addEventListener('message', (event) => {
      const msg = event.data;
      switch (msg.type) {
        case 'loading':
          setLoading(msg.loading);
          break;

        case 'error':
          showAlert('error', msg.message);
          break;

        case 'info':
          showAlert('info', msg.message);
          break;

        case 'registerSuccess':
          showAlert('success', msg.message);
          verifyEmail = msg.email;
          document.getElementById('verify-email-display').textContent = msg.email;
          clearOtpInputs();
          showPage('page-verify');
          // Focus first OTP input after animation
          setTimeout(() => document.querySelector('.otp-input')?.focus(), 400);
          break;

        case 'needsVerification':
          showAlert('info', msg.message);
          verifyEmail = msg.email;
          document.getElementById('verify-email-display').textContent = msg.email;
          clearOtpInputs();
          showPage('page-verify');
          setTimeout(() => document.querySelector('.otp-input')?.focus(), 400);
          break;

        case 'loginSuccess':
          clearAlert();
          document.getElementById('success-text').textContent = 'Welcome back!';
          showPage('page-success');
          break;

        case 'verifySuccess':
          clearAlert();
          document.getElementById('success-text').textContent = 'Email Verified!';
          showPage('page-success');
          break;
      }
    });

    // ── Init ─────────────────────────────────────────────
    setupOtpInputs();
    document.getElementById('input-email').focus();
  </script>
</body>
</html>`;
    }
}

function getNonce() {
    let text = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
}

module.exports = { AuthWebviewProvider };
