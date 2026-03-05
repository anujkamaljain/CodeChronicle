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
                        // Check cloud AI status on startup
                        state.apiClient.healthCheck().then((status) => {
                            panel.webview.postMessage({ type: 'cloudStatus', status });
                        }).catch(() => {
                            panel.webview.postMessage({ type: 'cloudStatus', status: 'disconnected' });
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
    const willFetchSummary = state.apiClient.isAvailable() && !node.summary;
    panel.webview.postMessage({
        type: 'summary',
        nodeId,
        summary: node.summary || null,
        cached: !!node.summary,
        loading: willFetchSummary,
        metrics: node.metrics,
    });

    // If cloud AI is available, fetch AI summary
    if (state.apiClient.isAvailable() && !node.summary) {
        try {
            // Read actual file content for richer AI analysis
            let fileContent = null;
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders) {
                try {
                    const absPath = path.join(workspaceFolders[0].uri.fsPath, node.path);
                    const raw = fs.readFileSync(absPath, 'utf-8');
                    fileContent = cleanCodeContent(raw).substring(0, 80000); // ~20K tokens
                } catch {
                    // File not readable — proceed without content
                }
            }

            const result = await state.apiClient.requestSummary({
                filePath: node.path,
                fileHash: node.contentHash,
                metrics: node.metrics,
                dependencies: getNodeDependencies(nodeId),
                dependents: getNodeDependents(nodeId),
                fileContent,
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

    // #26 Offline AI Fallback — if no summary at all, generate local heuristic
    if (!node.summary) {
        const m = node.metrics;
        const deps = getNodeDependencies(nodeId);
        const depnts = getNodeDependents(nodeId);
        const risk = node.localRisk;
        const parts = [];
        parts.push(`This file has ${m.linesOfCode} lines of code.`);
        if (deps.length > 0) parts.push(`It imports ${deps.length} module${deps.length !== 1 ? 's' : ''}.`);
        if (depnts.length > 0) parts.push(`${depnts.length} file${depnts.length !== 1 ? 's' : ''} depend on it.`);
        if (risk) {
            parts.push(`Structural risk: ${risk.level.toUpperCase()} (${risk.score}/100).`);
            if (risk.factors && risk.factors.length > 0) {
                parts.push(`Factors: ${risk.factors.join('; ')}.`);
            }
        }
        const ext = node.label.split('.').pop() || '';
        if (['jsx', 'tsx'].includes(ext)) parts.push('This is a React component file.');
        else if (['css', 'scss', 'sass', 'less'].includes(ext)) parts.push('This is a stylesheet.');
        else if (ext === 'json') parts.push('This is a configuration/data file.');

        const localSummary = `[Local Analysis] ${parts.join(' ')}`;
        panel.webview.postMessage({
            type: 'summary',
            nodeId,
            summary: localSummary,
            cached: false,
            localFallback: true,
        });
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
        // Rank files by relevance to the query instead of taking arbitrary first N
        const rankedFiles = rankFilesByRelevance(query, state.graph);
        const topFiles = rankedFiles.slice(0, 10);

        // Read actual file content for the top 7 most relevant files (up from 5)
        const workspacePath = state.graph.metadata?.workspacePath || '';
        const filesWithContent = topFiles.map((f, i) => {
            const entry = {
                path: f.path,
                summary: f.summary,
                metrics: {
                    ...f.metrics,
                    dependencyCount: getNodeDependencies(f.id)?.length || 0,
                    dependentCount: getNodeDependents(f.id)?.length || 0,
                },
            };
            // Read content for top 7 files (balanced: more files, slightly less content each)
            if (i < 7 && workspacePath) {
                try {
                    const absPath = path.join(workspacePath, f.path);
                    const raw = fs.readFileSync(absPath, 'utf-8');
                    entry.content = cleanCodeContent(raw).substring(0, 50000); // ~12.5K tokens per file
                } catch {
                    // File not readable — skip content
                }
            }
            return entry;
        });

        const result = await state.apiClient.processQuery({
            query,
            graphContext: {
                totalFiles: Object.keys(state.graph.nodes).length,
                relevantFiles: filesWithContent,
            },
            maxResults: 10,
        });

        // Resolve AI-generated reference paths against actual graph nodes
        if (result.references && result.references.length > 0) {
            result.references = resolveQueryReferences(result.references, state.graph);
        }

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

/**
 * Clean and normalize source code before sending to the LLM.
 * Removes noise that wastes tokens while keeping all meaningful code intact.
 */
function cleanCodeContent(raw) {
    let lines = raw.split('\n');

    // 1. Strip leading license / copyright block comments (top of file)
    if (lines.length > 0) {
        let i = 0;
        // Skip leading blank lines
        while (i < lines.length && lines[i].trim() === '') i++;
        // Check for block comment at top
        if (i < lines.length && /^\s*\/\*/.test(lines[i])) {
            const startIdx = i;
            while (i < lines.length && !/\*\//.test(lines[i])) i++;
            i++; // skip the closing */
            const blockLen = i - startIdx;
            // Only strip if it looks like a license header (> 3 lines)
            if (blockLen > 3) {
                lines.splice(startIdx, blockLen);
            }
        }
    }

    // 2. Trim trailing whitespace from each line
    lines = lines.map(line => line.trimEnd());

    // 3. Collapse multiple consecutive blank lines into a single blank line
    const collapsed = [];
    let prevBlank = false;
    for (const line of lines) {
        const isBlank = line.trim() === '';
        if (isBlank && prevBlank) continue;
        collapsed.push(line);
        prevBlank = isBlank;
    }

    // 4. Remove large block comments (> 5 lines) in the body — typically JSDoc boilerplate
    const result = [];
    let idx = 0;
    while (idx < collapsed.length) {
        if (/^\s*\/\*/.test(collapsed[idx]) && !/\*\//.test(collapsed[idx])) {
            const blockStart = idx;
            while (idx < collapsed.length && !/\*\//.test(collapsed[idx])) idx++;
            idx++; // skip closing */
            const blockLen = idx - blockStart;
            if (blockLen > 5) {
                // Skip this large comment block
                continue;
            } else {
                // Keep small comments
                for (let j = blockStart; j < idx; j++) result.push(collapsed[j]);
            }
        } else {
            result.push(collapsed[idx]);
            idx++;
        }
    }

    return result.join('\n');
}

/**
 * Rank graph nodes by keyword relevance to the user's query.
 * Returns nodes sorted by descending relevance score.
 */
function rankFilesByRelevance(query, graph) {
    // Extract keywords: lowercase, remove short/common words
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'in', 'of', 'to', 'and', 'or', 'for', 'how', 'what', 'where', 'which', 'this', 'that', 'does', 'do', 'can', 'me', 'my', 'it', 'its', 'be', 'being']);
    const keywords = query
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 1 && !stopWords.has(w));

    if (keywords.length === 0) {
        // No meaningful keywords — fall back to high-centrality files
        return Object.values(graph.nodes)
            .sort((a, b) => (b.metrics?.centralityScore || 0) - (a.metrics?.centralityScore || 0))
            .slice(0, 10);
    }

    const scored = Object.values(graph.nodes).map(node => {
        let score = 0;
        const pathLower = (node.path || '').toLowerCase();
        const labelLower = (node.label || '').toLowerCase();
        const summaryLower = (node.summary || '').toLowerCase();
        const dirLower = (node.directory || '').toLowerCase();

        for (const kw of keywords) {
            // Path match (strong signal)
            if (pathLower.includes(kw)) score += 3;
            // Label/filename match (strong signal)
            if (labelLower.includes(kw)) score += 4;
            // Directory match
            if (dirLower.includes(kw)) score += 2;
            // Summary match (if available, strong signal)
            if (summaryLower.includes(kw)) score += 5;
        }

        // Bonus for high-centrality files (likely important)
        score += (node.metrics?.centralityScore || 0) * 0.5;
        // Small bonus for files with summaries (more context available)
        if (node.summary) score += 1;

        return { ...node, _relevanceScore: score };
    });

    return scored
        .sort((a, b) => b._relevanceScore - a._relevanceScore);
}

async function handleRiskRequest(panel, nodeId) {
    const node = state.graph?.nodes[nodeId];
    if (!node) return;

    // Always send structural risk first
    const localRisk = state.metricsEngine.computeLocalRisk(node);
    panel.webview.postMessage({
        type: 'risk',
        nodeId,
        risk: localRisk,
        isAiRisk: false,
        cached: false,
    });

    // If cloud AI is available, also fetch AI risk assessment
    if (state.apiClient.isAvailable()) {
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
                isAiRisk: true,
                cached: result.cached,
            });
            panel.webview.postMessage({ type: 'cloudStatus', status: 'connected' });
        } catch (err) {
            console.warn('AI risk assessment unavailable:', err.message);
            panel.webview.postMessage({ type: 'cloudStatus', status: 'disconnected' });
        }
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

    // Try the path as-is first
    const fullPath = path.join(workspaceFolders[0].uri.fsPath, relativePath);
    if (fs.existsSync(fullPath)) {
        vscode.window.showTextDocument(vscode.Uri.file(fullPath));
        return;
    }

    // Try resolving against current graph nodes if direct path failed
    if (state.graph) {
        const resolved = resolveFilePath(relativePath, state.graph);
        if (resolved) {
            const resolvedFull = path.join(workspaceFolders[0].uri.fsPath, resolved);
            if (fs.existsSync(resolvedFull)) {
                vscode.window.showTextDocument(vscode.Uri.file(resolvedFull));
                return;
            }
        }
    }

    // Nothing worked — show a helpful message
    console.warn(`CodeChronicle: Could not resolve file path: ${relativePath}`);
    vscode.window.showWarningMessage(`CodeChronicle: Could not find file "${relativePath}" in the workspace.`);
}

/**
 * Resolve a single file path against graph node keys.
 * Uses multi-strategy matching: exact → case-insensitive → suffix → basename.
 * @param {string} targetPath
 * @param {Object} graph
 * @returns {string|null} Matched graph node path or null
 */
function resolveFilePath(targetPath, graph) {
    if (!graph || !graph.nodes) return null;

    // Normalize to forward slashes and strip leading ./
    let target = targetPath.replace(/\\/g, '/');
    if (target.startsWith('./')) target = target.substring(2);

    const nodeKeys = Object.keys(graph.nodes);

    // 1. Exact match
    if (graph.nodes[target]) return target;

    // 2. Case-insensitive match
    const lowerTarget = target.toLowerCase();
    const ciMatch = nodeKeys.find(k => k.toLowerCase() === lowerTarget);
    if (ciMatch) return ciMatch;

    // 3. Suffix match — the AI might return "components/Foo.jsx"
    //    but the real key is "src/webview/components/Foo.jsx"
    const suffixMatch = nodeKeys.find(k => {
        const kLower = k.toLowerCase();
        return kLower.endsWith('/' + lowerTarget) || kLower.endsWith('\\' + lowerTarget);
    });
    if (suffixMatch) return suffixMatch;

    // 4. Basename match — last resort, only use if unique
    const targetBasename = path.basename(target).toLowerCase();
    const basenameMatches = nodeKeys.filter(k =>
        path.basename(k).toLowerCase() === targetBasename
    );
    if (basenameMatches.length === 1) return basenameMatches[0];

    // 5. If multiple basename matches, pick the one with the best directory overlap
    if (basenameMatches.length > 1) {
        const targetDir = path.dirname(target).replace(/\\/g, '/').toLowerCase();
        const best = basenameMatches.find(k => {
            const kDir = path.dirname(k).replace(/\\/g, '/').toLowerCase();
            return kDir.endsWith(targetDir) || targetDir.endsWith(kDir);
        });
        if (best) return best;
    }

    return null;
}

/**
 * Resolve AI-generated reference paths against actual graph node keys.
 * Replaces ref.path with the correct node path if a match is found,
 * otherwise marks the reference as unresolved.
 * @param {Array} references
 * @param {Object} graph
 * @returns {Array} references with resolved paths
 */
function resolveQueryReferences(references, graph) {
    if (!graph || !graph.nodes) return references;

    return references.map(ref => {
        if (!ref.path) return { ...ref, unresolved: true };

        const resolved = resolveFilePath(ref.path, graph);
        if (resolved) {
            return { ...ref, path: resolved };
        } else {
            console.warn(`CodeChronicle: Could not resolve AI reference path: ${ref.path}`);
            return { ...ref, unresolved: true };
        }
    });
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
