const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { WorkspaceScanner } = require('./analyzer/scanner');
const { DependencyParser } = require('./analyzer/dependencyParser');
const { GraphBuilder } = require('./graph/graphBuilder');
const { MetricsEngine } = require('./graph/metricsEngine');
const { BlastRadiusEngine } = require('./graph/blastRadius');
const { CacheManager } = require('./utils/cacheManager');
const { FileWatcher } = require('./utils/fileWatcher');
const { GraphWebviewProvider } = require('./webview/WebviewProvider');
const { APIClient } = require('./ai/apiClient');

/** @type {vscode.StatusBarItem} */
let statusBarItem;
/** @type {GraphWebviewProvider} */
let webviewProvider;
/** @type {FileWatcher} */
let fileWatcher;

// Shared state
const state = {
    graph: null,
    scanner: null,
    parser: null,
    graphBuilder: null,
    metricsEngine: null,
    blastRadiusEngine: null,
    cacheManager: null,
    apiClient: null,
    isScanning: false,
};

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('CodeChronicle is activating...');

    // Initialize core components
    const config = vscode.workspace.getConfiguration('codechronicle');
    state.scanner = new WorkspaceScanner(config);
    state.parser = new DependencyParser();
    state.graphBuilder = new GraphBuilder();
    state.metricsEngine = new MetricsEngine();
    state.blastRadiusEngine = new BlastRadiusEngine();
    state.cacheManager = new CacheManager(context.globalStorageUri);
    state.apiClient = new APIClient(config);

    // Status bar
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'codechronicle.showGraph';
    updateStatusBar('ready');
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Webview provider
    webviewProvider = new GraphWebviewProvider(context.extensionUri, state);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'codechronicle.graphView',
            webviewProvider,
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('codechronicle.scanWorkspace', () => scanWorkspace()),
        vscode.commands.registerCommand('codechronicle.showGraph', () => showGraph(context)),
        vscode.commands.registerCommand('codechronicle.askAI', () => askAI()),
        vscode.commands.registerCommand('codechronicle.predictBlastRadius', () => predictBlastRadius()),
        vscode.commands.registerCommand('codechronicle.refreshAnalysis', () => refreshAnalysis()),
    );

    // File watcher for incremental updates
    fileWatcher = new FileWatcher(state, (updatedGraph) => {
        state.graph = updatedGraph;
        if (webviewProvider) {
            webviewProvider.updateGraph(updatedGraph);
        }
        updateStatusBar('ready');
    });
    fileWatcher.start();
    context.subscriptions.push({ dispose: () => fileWatcher.stop() });

    // Try loading cached graph
    loadCachedGraph();

    // Check cloud AI connectivity in the background
    checkCloudStatus();

    console.log('CodeChronicle activated successfully!');
}

async function loadCachedGraph() {
    try {
        const cached = await state.cacheManager.loadGraph();
        if (cached) {
            state.graph = cached;
            updateStatusBar('ready');
            console.log(`Loaded cached graph with ${Object.keys(cached.nodes).length} nodes.`);
        }
    } catch (err) {
        console.error('Failed to load cached graph:', err);
    }
}

async function scanWorkspace() {
    if (state.isScanning) {
        vscode.window.showInformationMessage('CodeChronicle: Scan already in progress...');
        return;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('CodeChronicle: No workspace folder open.');
        return;
    }

    state.isScanning = true;
    updateStatusBar('scanning');

    try {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'CodeChronicle',
                cancellable: true,
            },
            async (progress, token) => {
                const workspacePath = workspaceFolders[0].uri.fsPath;

                // Step 1: Scan files
                progress.report({ message: 'Scanning workspace files...', increment: 0 });
                const files = await state.scanner.scan(workspacePath);

                if (token.isCancellationRequested) return;

                progress.report({
                    message: `Found ${files.length} files. Parsing dependencies...`,
                    increment: 30,
                });

                // Step 2: Parse dependencies
                const dependencies = new Map();
                let parsed = 0;
                for (const file of files) {
                    if (token.isCancellationRequested) return;
                    try {
                        const deps = await state.parser.parse(file, workspacePath);
                        dependencies.set(file, deps);
                    } catch (err) {
                        console.warn(`Failed to parse ${file}:`, err.message);
                    }
                    parsed++;
                    if (parsed % 50 === 0) {
                        progress.report({
                            message: `Parsed ${parsed}/${files.length} files...`,
                            increment: (30 * 50) / files.length,
                        });
                    }
                }

                progress.report({ message: 'Building dependency graph...', increment: 20 });

                // Step 3: Build graph
                const graph = state.graphBuilder.buildGraph(files, dependencies, workspacePath);

                // Step 4: Compute metrics
                progress.report({ message: 'Computing metrics...', increment: 10 });
                state.metricsEngine.computeMetrics(graph);

                // Step 5: Cache
                progress.report({ message: 'Caching results...', increment: 5 });
                await state.cacheManager.saveGraph(graph);

                state.graph = graph;

                progress.report({ message: 'Done!', increment: 5 });

                vscode.window.showInformationMessage(
                    `CodeChronicle: Scanned ${files.length} files, found ${graph.edges.length} dependencies.`
                );

                // Update webview if open
                if (webviewProvider) {
                    webviewProvider.updateGraph(graph);
                }
            }
        );
    } catch (err) {
        vscode.window.showErrorMessage(`CodeChronicle: Scan failed - ${err.message}`);
        console.error('Scan error:', err);
    } finally {
        state.isScanning = false;
        updateStatusBar('ready');
    }
}

async function showGraph(context) {
    try {
        if (!state.graph) {
            const choice = await vscode.window.showInformationMessage(
                'CodeChronicle: No analysis data. Scan workspace first?',
                'Scan Now',
                'Cancel'
            );
            if (choice === 'Scan Now') {
                await scanWorkspace();
            }
            if (!state.graph) return;
        }

        // Validate built webview assets exist. If not, the panel opens blank.
        const webviewDistFsPath = path.join(context.extensionPath, 'dist', 'webview');
        const jsPath = path.join(webviewDistFsPath, 'webview.js');
        const cssPath = path.join(webviewDistFsPath, 'webview.css');
        if (!fs.existsSync(jsPath) || !fs.existsSync(cssPath)) {
            const missing = [
                !fs.existsSync(jsPath) ? 'dist/webview/webview.js' : null,
                !fs.existsSync(cssPath) ? 'dist/webview/webview.css' : null,
            ].filter(Boolean);
            throw new Error(
                `Missing built webview assets: ${missing.join(', ')}. Run "npm run build" in the extension folder.`
            );
        }

        console.log('CodeChronicle: Opening graph webview...');

        // Create webview panel
        const panel = vscode.window.createWebviewPanel(
            'codechronicle.graph',
            'CodeChronicle Graph',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview'),
                ],
            }
        );

        const webviewUri = panel.webview.asWebviewUri(
            vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview')
        );

        panel.webview.html = getWebviewContent(panel.webview, webviewUri);

        // Send graph data once webview is ready
        panel.webview.onDidReceiveMessage(async (message) => {
            try {
                switch (message.type) {
                    case 'ready':
                        panel.webview.postMessage({
                            type: 'init',
                            graph: state.graph,
                        });
                        break;

                    case 'nodeClick':
                        handleNodeClick(panel, message.nodeId);
                        break;

                    case 'blastRadius':
                        handleBlastRadius(panel, message.nodeId);
                        break;

                    case 'query':
                        handleQuery(panel, message.query);
                        break;

                    case 'openFile':
                        openFileInEditor(message.path);
                        break;

                    case 'refresh':
                        await scanWorkspace();
                        if (state.graph) {
                            panel.webview.postMessage({ type: 'init', graph: state.graph });
                        }
                        break;

                    case 'requestRisk':
                        handleRiskRequest(panel, message.nodeId);
                        break;
                }
            } catch (err) {
                console.error('CodeChronicle: Webview message handling failed:', err);
                vscode.window.showErrorMessage(`CodeChronicle: Webview error - ${err.message}`);
            }
        });
    } catch (err) {
        console.error('CodeChronicle: Failed to open graph view:', err);
        vscode.window.showErrorMessage(`CodeChronicle: Failed to open graph view - ${err.message}`);
    }
}

async function handleNodeClick(panel, nodeId) {
    const node = state.graph?.nodes[nodeId];
    if (!node) return;

    // Send structural data immediately
    panel.webview.postMessage({
        type: 'summary',
        nodeId,
        summary: node.summary || null,
        cached: !!node.summary,
        metrics: node.metrics,
    });

    // If cloud AI is available, fetch AI summary
    if (state.apiClient.isAvailable() && !node.summary) {
        try {
            const result = await state.apiClient.requestSummary({
                filePath: node.path,
                fileHash: node.contentHash,
                metrics: node.metrics,
                dependencies: getNodeDependencies(nodeId),
                dependents: getNodeDependents(nodeId),
            });
            node.summary = result.summary;
            panel.webview.postMessage({
                type: 'summary',
                nodeId,
                summary: result.summary,
                cached: result.cached,
            });
            // Mark cloud as connected on success
            panel.webview.postMessage({ type: 'cloudStatus', status: 'connected' });
        } catch (err) {
            console.warn('AI summary unavailable:', err.message);
            // Update cloud status but don't show persistent error
            panel.webview.postMessage({ type: 'cloudStatus', status: 'disconnected' });
        }
    }
}

async function handleBlastRadius(panel, nodeId) {
    if (!state.graph) return;
    const result = state.blastRadiusEngine.compute(state.graph, nodeId);
    panel.webview.postMessage({
        type: 'highlight',
        nodeIds: result.affectedNodes,
        blastRadius: result,
    });
}

async function handleQuery(panel, query) {
    if (!state.apiClient.isAvailable()) {
        panel.webview.postMessage({
            type: 'queryResult',
            result: {
                answer: 'Cloud AI is not available. Deploy the backend and enable Cloud AI in settings to use the query feature.',
                references: [],
                confidence: 0,
            },
        });
        return;
    }

    try {
        const result = await state.apiClient.processQuery({
            query,
            graphContext: {
                totalFiles: Object.keys(state.graph.nodes).length,
                relevantFiles: Object.values(state.graph.nodes)
                    .slice(0, 20)
                    .map((n) => ({
                        path: n.path,
                        summary: n.summary,
                        metrics: n.metrics,
                    })),
            },
            maxResults: 10,
        });
        panel.webview.postMessage({ type: 'queryResult', result });
    } catch (err) {
        console.warn('Query failed:', err.message);
        panel.webview.postMessage({
            type: 'queryResult',
            result: {
                answer: `Query failed: ${err.message}. The AI backend may be unavailable.`,
                references: [],
                confidence: 0,
            },
        });
        panel.webview.postMessage({ type: 'cloudStatus', status: 'disconnected' });
    }
}

async function handleRiskRequest(panel, nodeId) {
    const node = state.graph?.nodes[nodeId];
    if (!node) return;

    if (!state.apiClient.isAvailable()) {
        // Compute local risk based on metrics
        const localRisk = state.metricsEngine.computeLocalRisk(node);
        panel.webview.postMessage({
            type: 'risk',
            nodeId,
            risk: localRisk,
            cached: false,
        });
        return;
    }

    try {
        const result = await state.apiClient.requestRiskAssessment({
            filePath: node.path,
            fileHash: node.contentHash,
            metrics: node.metrics,
            dependencies: getNodeDependencies(nodeId),
            dependents: getNodeDependents(nodeId),
        });
        node.riskFactor = result.riskFactor;
        panel.webview.postMessage({
            type: 'risk',
            nodeId,
            risk: result.riskFactor,
            cached: result.cached,
        });
        panel.webview.postMessage({ type: 'cloudStatus', status: 'connected' });
    } catch (err) {
        console.warn('Risk assessment unavailable:', err.message);
        const localRisk = state.metricsEngine.computeLocalRisk(node);
        panel.webview.postMessage({
            type: 'risk',
            nodeId,
            risk: localRisk,
            cached: false,
        });
        panel.webview.postMessage({ type: 'cloudStatus', status: 'disconnected' });
    }
}

function getNodeDependencies(nodeId) {
    if (!state.graph) return [];
    return state.graph.edges
        .filter((e) => e.source === nodeId)
        .map((e) => e.target);
}

function getNodeDependents(nodeId) {
    if (!state.graph) return [];
    return state.graph.edges
        .filter((e) => e.target === nodeId)
        .map((e) => e.source);
}

function openFileInEditor(relativePath) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;
    const fullPath = vscode.Uri.joinPath(workspaceFolders[0].uri, relativePath);
    vscode.window.showTextDocument(fullPath);
}

async function askAI() {
    const query = await vscode.window.showInputBox({
        prompt: 'Ask CodeChronicle about your codebase',
        placeHolder: 'e.g., "Which files handle authentication?"',
    });
    if (!query) return;

    if (!state.graph) {
        vscode.window.showWarningMessage('CodeChronicle: Please scan the workspace first.');
        return;
    }

    // If graph panel is open, forward to it
    // Otherwise show inline
    vscode.window.showInformationMessage(`CodeChronicle: Processing query "${query}"...`);
}

async function predictBlastRadius() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('CodeChronicle: Open a file to predict its blast radius.');
        return;
    }

    if (!state.graph) {
        vscode.window.showWarningMessage('CodeChronicle: Please scan the workspace first.');
        return;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;

    const relativePath = vscode.workspace.asRelativePath(editor.document.uri);
    const result = state.blastRadiusEngine.compute(state.graph, relativePath);

    if (result.affectedNodes.length === 0) {
        vscode.window.showInformationMessage(
            `CodeChronicle: ${relativePath} has no dependents. Safe to modify!`
        );
    } else {
        vscode.window.showWarningMessage(
            `CodeChronicle: Modifying ${relativePath} affects ${result.affectedNodes.length} files (${result.directDependents.length} direct, ${result.indirectDependents.length} indirect).`
        );
    }
}

async function refreshAnalysis() {
    await scanWorkspace();
}

async function checkCloudStatus() {
    try {
        const status = await state.apiClient.healthCheck();
        console.log(`Cloud AI status: ${status}`);
        // Post status to any open webview panels — they'll pick it up on next render
        if (webviewProvider && webviewProvider._view) {
            webviewProvider._view.webview.postMessage({ type: 'cloudStatus', status });
        }
    } catch (err) {
        console.warn('Cloud health check failed:', err.message);
    }
}

function updateStatusBar(status) {
    switch (status) {
        case 'scanning':
            statusBarItem.text = '$(sync~spin) CodeChronicle: Scanning...';
            statusBarItem.tooltip = 'Scanning workspace files';
            statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            break;
        case 'ready':
            const nodeCount = state.graph ? Object.keys(state.graph.nodes).length : 0;
            statusBarItem.text = `$(type-hierarchy) CodeChronicle${nodeCount > 0 ? `: ${nodeCount} files` : ''}`;
            statusBarItem.tooltip = 'Click to open CodeChronicle graph';
            statusBarItem.backgroundColor = undefined;
            break;
        case 'error':
            statusBarItem.text = '$(error) CodeChronicle: Error';
            statusBarItem.tooltip = 'Analysis failed - click to retry';
            statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            break;
    }
}

function getWebviewContent(webview, webviewUri) {
    const scriptUri = `${webviewUri}/webview.js`;
    const styleUri = `${webviewUri}/webview.css`;
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource} https://fonts.gstatic.com; connect-src https://fonts.googleapis.com https://fonts.gstatic.com;">
  <link rel="stylesheet" href="${styleUri}">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <title>CodeChronicle</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function getNonce() {
    let text = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
}

function deactivate() {
    if (fileWatcher) fileWatcher.stop();
}

module.exports = { activate, deactivate };
