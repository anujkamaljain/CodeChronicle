const vscode = require('vscode');
const path = require('path');

/**
 * Watches for file changes and triggers incremental graph updates.
 */
class FileWatcher {
    /**
     * @param {Object} state - Shared extension state
     * @param {Function} onGraphUpdated - Callback when graph is updated
     */
    constructor(state, onGraphUpdated) {
        this.state = state;
        this.onGraphUpdated = onGraphUpdated;
        this.watcher = null;
        this.debounceTimer = null;
        this.pendingChanges = new Map();
    }

    /**
     * Start watching for file changes.
     */
    start() {
        const config = vscode.workspace.getConfiguration('codechronicle');
        const supportedExtensions = config.get('supportedExtensions') || [];

        // Build glob pattern for supported files
        const extGlob = supportedExtensions.map((e) => e.replace('.', '')).join(',');
        const pattern = `**/*.{${extGlob}}`;

        this.watcher = vscode.workspace.createFileSystemWatcher(pattern);

        this.watcher.onDidCreate((uri) => this.handleChange('create', uri));
        this.watcher.onDidChange((uri) => this.handleChange('modify', uri));
        this.watcher.onDidDelete((uri) => this.handleChange('delete', uri));
    }

    /**
     * Handle a file change event with debouncing.
     * @param {string} type - 'create' | 'modify' | 'delete'
     * @param {import('vscode').Uri} uri
     */
    handleChange(type, uri) {
        if (!this.state.graph) return;

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;

        const workspacePath = workspaceFolders[0].uri.fsPath;
        const relativePath = path.relative(workspacePath, uri.fsPath).replace(/\\/g, '/');

        // Skip excluded paths
        const excludePatterns = ['node_modules', 'dist', '.git', 'vendor', '__pycache__', 'build', 'target', '.next', 'coverage'];
        if (excludePatterns.some((p) => relativePath.includes(p))) return;

        this.pendingChanges.set(relativePath, type);

        // Debounce: process all changes after 500ms of inactivity
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this.processChanges(workspacePath), 500);
    }

    /**
     * Process all pending file changes.
     * @param {string} workspacePath
     */
    async processChanges(workspacePath) {
        const changes = new Map(this.pendingChanges);
        this.pendingChanges.clear();

        if (!this.state.graph || changes.size === 0) return;

        console.log(`CodeChronicle: Processing ${changes.size} file change(s)...`);

        for (const [filePath, changeType] of changes.entries()) {
            try {
                switch (changeType) {
                    case 'create': {
                        const deps = await this.state.parser.parse(filePath, workspacePath);
                        this.state.graphBuilder.addNode(this.state.graph, filePath, workspacePath, deps);
                        break;
                    }

                    case 'modify': {
                        const deps = await this.state.parser.parse(filePath, workspacePath);
                        this.state.graphBuilder.updateNode(this.state.graph, filePath, workspacePath, deps);
                        break;
                    }

                    case 'delete': {
                        this.state.graphBuilder.removeNode(this.state.graph, filePath);
                        break;
                    }
                }
            } catch (err) {
                console.warn(`Failed to process ${changeType} for ${filePath}:`, err.message);
            }
        }

        // Recompute metrics after batch update
        this.state.metricsEngine.computeMetrics(this.state.graph);

        // Save updated graph
        await this.state.cacheManager.saveGraph(this.state.graph);

        // Notify callback
        if (this.onGraphUpdated) {
            this.onGraphUpdated(this.state.graph);
        }
    }

    /**
     * Stop watching.
     */
    stop() {
        if (this.watcher) {
            this.watcher.dispose();
            this.watcher = null;
        }
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
    }
}

module.exports = { FileWatcher };
