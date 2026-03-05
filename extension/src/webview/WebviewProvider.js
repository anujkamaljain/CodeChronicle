const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

class GraphWebviewProvider {
    /**
     * @param {vscode.Uri} extensionUri
     * @param {Object} state - Shared extension state
     */
    constructor(extensionUri, state) {
        this.extensionUri = extensionUri;
        this.state = state;
        this._view = null;
    }

    /**
     * Called when a webview view is resolved.
     * @param {vscode.WebviewView} webviewView
     */
    resolveWebviewView(webviewView) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview'),
                vscode.Uri.joinPath(this.extensionUri, 'assets'),
            ],
        };

        const webviewUri = webviewView.webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')
        );
        const iconUri = webviewView.webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'assets', 'icon.png')
        );

        webviewView.webview.html = this._getHtml(webviewView.webview, webviewUri, iconUri);

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage((message) => {
            switch (message.type) {
                case 'ready':
                    if (this.state.graph) {
                        webviewView.webview.postMessage({
                            type: 'init',
                            graph: this.state.graph,
                        });
                    }
                    break;

                case 'openFile':
                    this._openFile(message.path);
                    break;
            }
        });
    }

    /**
     * Send updated graph to the webview.
     * @param {Object} graph
     */
    updateGraph(graph) {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'update',
                graph,
            });
        }
    }

    /**
     * Open a file in the editor.
     * @param {string} relativePath
     */
    _openFile(relativePath) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;
        const fullPath = path.join(workspaceFolders[0].uri.fsPath, relativePath);
        if (fs.existsSync(fullPath)) {
            vscode.window.showTextDocument(vscode.Uri.file(fullPath));
        } else {
            vscode.window.showWarningMessage(`CodeChronicle: Could not find file "${relativePath}" in the workspace.`);
        }
    }

    /**
     * Generate webview HTML.
     */
    _getHtml(webview, webviewUri, iconUri) {
        const scriptUri = `${webviewUri}/webview.js`;
        const styleUri = `${webviewUri}/webview.css`;
        const nonce = getNonce();

        return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource}; font-src ${webview.cspSource} https://fonts.gstatic.com; connect-src https://fonts.googleapis.com https://fonts.gstatic.com;">
  <link rel="stylesheet" href="${styleUri}">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <title>CodeChronicle</title>
</head>
<body>
  <div id="root" data-icon-uri="${iconUri}"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
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

module.exports = { GraphWebviewProvider };
