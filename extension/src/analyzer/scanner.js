const path = require('path');
const fs = require('fs');
const { glob } = require('glob');
const ignore = require('ignore');

class WorkspaceScanner {
    /**
     * @param {import('vscode').WorkspaceConfiguration} config
     */
    constructor(config) {
        this.config = config;
    }

    /**
     * Scan workspace for all supported source files.
     * @param {string} workspacePath - Absolute path to workspace root
     * @returns {Promise<string[]>} List of relative file paths
     */
    async scan(workspacePath) {
        const excludePatterns = this.config.get('excludePatterns') || [
            '**/node_modules/**',
            '**/dist/**',
            '**/.git/**',
            '**/vendor/**',
            '**/__pycache__/**',
            '**/build/**',
            '**/target/**',
            '**/.next/**',
            '**/coverage/**',
        ];

        const supportedExtensions = this.config.get('supportedExtensions') || [
            '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
            '.py', '.pyw',
            '.java',
            '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx',
            '.cs',
            '.go',
            '.rb',
            '.php',
            '.rs',
            '.swift',
            '.kt', '.kts',
            '.scala',
            '.r', '.R',
            '.lua',
            '.dart',
            '.vue', '.svelte',
            '.css', '.scss', '.sass', '.less',
            '.html', '.htm',
        ];

        const maxFiles = this.config.get('maxFiles') || 10000;

        // Load .gitignore if it exists
        const ig = ignore();
        const gitignorePath = path.join(workspacePath, '.gitignore');
        if (fs.existsSync(gitignorePath)) {
            const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
            ig.add(gitignoreContent);
        }

        // Build extension glob pattern
        const extGlob = supportedExtensions.map((e) => e.replace('.', '')).join(',');
        const pattern = `**/*.{${extGlob}}`;

        try {
            const files = await glob(pattern, {
                cwd: workspacePath,
                ignore: excludePatterns,
                nodir: true,
                dot: false,
                absolute: false,
            });

            // Apply .gitignore filtering
            const filtered = files.filter((f) => !ig.ignores(f));

            // Enforce max file limit
            if (filtered.length > maxFiles) {
                console.warn(`CodeChronicle: Found ${filtered.length} files, limiting to ${maxFiles}.`);
                return filtered.slice(0, maxFiles);
            }

            return filtered;
        } catch (err) {
            console.error('Scanner error:', err);
            throw new Error(`Failed to scan workspace: ${err.message}`);
        }
    }
}

module.exports = { WorkspaceScanner };
