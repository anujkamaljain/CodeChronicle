const path = require('path');
const fs = require('fs');

/**
 * Regex-based dependency parser supporting multiple languages.
 * Uses pattern matching to extract import/include/require statements.
 */
class DependencyParser {
    constructor() {
        // Language-specific import patterns
        this.languagePatterns = {
            // JavaScript / TypeScript / JSX / TSX
            javascript: {
                extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte'],
                patterns: [
                    // ES6: import ... from '...'
                    /import\s+(?:[\w{}\s*,]+\s+from\s+)?['"]([^'"]+)['"]/g,
                    // CommonJS: require('...')
                    /(?:const|let|var)\s+[\w{}\s,]*\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
                    // require('...')  standalone
                    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
                    // Dynamic import: import('...')
                    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
                    // export ... from '...'
                    /export\s+(?:[\w{}\s*,]+\s+from\s+)?['"]([^'"]+)['"]/g,
                ],
            },

            // Python
            python: {
                extensions: ['.py', '.pyw'],
                patterns: [
                    // import module | import module.submodule
                    /^import\s+([\w.]+)/gm,
                    // from module import ...
                    /^from\s+([\w.]+)\s+import/gm,
                ],
            },

            // Java
            java: {
                extensions: ['.java'],
                patterns: [
                    // import com.example.Class;
                    /^import\s+(?:static\s+)?([\w.]+)\s*;/gm,
                ],
            },

            // C / C++
            cpp: {
                extensions: ['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx'],
                patterns: [
                    // #include "file.h"
                    /#include\s*"([^"]+)"/g,
                    // #include <file.h>  (standard library, kept for graph completeness)
                    /#include\s*<([^>]+)>/g,
                ],
            },

            // C#
            csharp: {
                extensions: ['.cs'],
                patterns: [
                    // using System.IO;
                    /^using\s+([\w.]+)\s*;/gm,
                ],
            },

            // Go
            go: {
                extensions: ['.go'],
                patterns: [
                    // import "package"
                    /import\s+"([^"]+)"/g,
                    // import ( "package" )
                    /import\s+\(\s*(?:[^)]*?"([^"]+)"[^)]*?)+\s*\)/gs,
                    // Individual lines in import block
                    /^\s*"([^"]+)"\s*$/gm,
                ],
            },

            // Ruby
            ruby: {
                extensions: ['.rb'],
                patterns: [
                    // require 'file'
                    /require\s+['"]([^'"]+)['"]/g,
                    // require_relative 'file'
                    /require_relative\s+['"]([^'"]+)['"]/g,
                    // load 'file'
                    /load\s+['"]([^'"]+)['"]/g,
                ],
            },

            // PHP
            php: {
                extensions: ['.php'],
                patterns: [
                    // use Namespace\Class;
                    /^use\s+([\w\\]+)\s*;/gm,
                    // require 'file.php'
                    /(?:require|include)(?:_once)?\s*(?:\(\s*)?['"]([^'"]+)['"](?:\s*\))?/g,
                ],
            },

            // Rust
            rust: {
                extensions: ['.rs'],
                patterns: [
                    // use crate::module;
                    /^use\s+([\w:]+)/gm,
                    // mod module;
                    /^mod\s+(\w+)\s*;/gm,
                    // extern crate name;
                    /^extern\s+crate\s+(\w+)\s*;/gm,
                ],
            },

            // Swift
            swift: {
                extensions: ['.swift'],
                patterns: [
                    // import Module
                    /^import\s+(\w+)/gm,
                ],
            },

            // Kotlin
            kotlin: {
                extensions: ['.kt', '.kts'],
                patterns: [
                    // import com.example.Class
                    /^import\s+([\w.]+)/gm,
                ],
            },

            // Scala
            scala: {
                extensions: ['.scala'],
                patterns: [
                    // import com.example.Class
                    /^import\s+([\w.{}_ ,]+)/gm,
                ],
            },

            // R
            r: {
                extensions: ['.r', '.R'],
                patterns: [
                    // library(package)
                    /library\s*\(\s*['"]?(\w+)['"]?\s*\)/g,
                    // require(package)
                    /require\s*\(\s*['"]?(\w+)['"]?\s*\)/g,
                    // source("file.R")
                    /source\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
                ],
            },

            // Lua
            lua: {
                extensions: ['.lua'],
                patterns: [
                    // require("module")
                    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
                    // dofile("file.lua")
                    /dofile\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
                ],
            },

            // Dart
            dart: {
                extensions: ['.dart'],
                patterns: [
                    // import 'package:...';
                    /import\s+['"]([^'"]+)['"]\s*;/g,
                    // export 'file.dart';
                    /export\s+['"]([^'"]+)['"]\s*;/g,
                    // part 'file.dart';
                    /part\s+['"]([^'"]+)['"]\s*;/g,
                ],
            },

            // CSS / SCSS / SASS / LESS
            css: {
                extensions: ['.css', '.scss', '.sass', '.less'],
                patterns: [
                    // @import 'file';
                    /@import\s+['"]([^'"]+)['"]/g,
                    // @import url('file');
                    /@import\s+url\s*\(\s*['"]?([^'")]+)['"]?\s*\)/g,
                    // @use 'file';
                    /@use\s+['"]([^'"]+)['"]/g,
                    // @forward 'file';
                    /@forward\s+['"]([^'"]+)['"]/g,
                ],
            },

            // HTML
            html: {
                extensions: ['.html', '.htm'],
                patterns: [
                    // <script src="file.js">
                    /<script\s+[^>]*src\s*=\s*['"]([^'"]+)['"]/g,
                    // <link href="file.css">
                    /<link\s+[^>]*href\s*=\s*['"]([^'"]+)['"]/g,
                    // <img src="file.png">
                    /<img\s+[^>]*src\s*=\s*['"]([^'"]+)['"]/g,
                ],
            },
        };

        // Known external package prefixes/patterns per language
        this.externalPatterns = {
            javascript: [
                /^[^./]/, // Doesn't start with . or /
            ],
            python: [
                /^(?:os|sys|re|json|math|datetime|collections|functools|itertools|pathlib|typing|abc|io|unittest|logging|argparse|subprocess|threading|multiprocessing|socket|http|urllib|email|html|xml|csv|sqlite3|hashlib|hmac|secrets|base64|struct|pickle|shelve|copy|pprint|enum|dataclasses|contextlib|concurrent|asyncio|queue)\b/,
            ],
            java: [
                /^java\./,
                /^javax\./,
                /^android\./,
            ],
            cpp: [
                /^(?:iostream|string|vector|map|set|algorithm|cstdio|cstdlib|cstring|cmath|fstream|sstream|iomanip|memory|functional|utility|numeric|limits|cassert|cstddef|ctime|cctype|clocale|cerrno|cfloat|climits|csignal|csetjmp|cstdarg|stdexcept|typeinfo|bitset|complex|deque|list|queue|stack|array|tuple|regex|thread|mutex|chrono|random|ratio|atomic|condition_variable|future|initializer_list|type_traits|exception)\b/,
            ],
            csharp: [
                /^System\./,
                /^Microsoft\./,
            ],
            go: [
                /^(?:fmt|os|io|net|log|time|sync|sort|math|strings|strconv|bytes|errors|context|encoding|path|regexp|runtime|reflect|testing|flag|bufio|crypto|database|compress|archive|debug|embed|hash|html|image|index|mime|plugin|text|unicode|unsafe)\b/,
            ],
            ruby: [
                /^(?:json|yaml|csv|net|uri|fileutils|pathname|optparse|logger|open-uri|socket|digest|base64|tempfile|stringio|benchmark|pp|set|ostruct|delegate|singleton|observer|forwardable|erb|cgi|webrick|minitest|test-unit|rake|bundler|rubygems)\b/,
            ],
            php: [
                /^(?:Illuminate|Symfony|Laravel|Doctrine|PHPUnit|Carbon|GuzzleHttp|Monolog|Psr)\\/,
            ],
            rust: [
                /^std::/,
                /^core::/,
                /^alloc::/,
            ],
            swift: [
                /^(?:Foundation|UIKit|SwiftUI|Combine|CoreData|MapKit|AVFoundation|CoreGraphics|Metal|SpriteKit|SceneKit|GameplayKit|ARKit|RealityKit|WebKit|SafariServices|StoreKit|CloudKit|CoreML|Vision|NaturalLanguage|CreateML|AuthenticationServices|CryptoKit|os|Darwin)\b/,
            ],
            kotlin: [
                /^kotlin\./,
                /^java\./,
                /^javax\./,
                /^android\./,
                /^kotlinx\./,
            ],
            scala: [
                /^scala\./,
                /^java\./,
            ],
            css: [],
            html: [
                /^https?:\/\//,
                /^\/\//,
            ],
            r: [],
            lua: [],
            dart: [
                /^dart:/,
                /^package:/,
            ],
        };
    }

    /**
     * Detect language from file extension.
     * @param {string} filePath
     * @returns {string|null} Language key
     */
    detectLanguage(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        for (const [lang, config] of Object.entries(this.languagePatterns)) {
            if (config.extensions.includes(ext)) {
                return lang;
            }
        }
        return null;
    }

    /**
     * Parse a file for dependencies using regex patterns.
     * @param {string} relativePath - Workspace-relative file path
     * @param {string} workspacePath - Absolute workspace root
     * @returns {Promise<Array<{importPath: string, resolvedPath: string|null, lineNumber: number, isExternal: boolean}>>}
     */
    async parse(relativePath, workspacePath) {
        const language = this.detectLanguage(relativePath);
        if (!language) return [];

        const absolutePath = path.join(workspacePath, relativePath);

        let content;
        try {
            content = fs.readFileSync(absolutePath, 'utf-8');
        } catch (err) {
            console.warn(`Cannot read file ${relativePath}: ${err.message}`);
            return [];
        }

        const langConfig = this.languagePatterns[language];
        const dependencies = [];
        const seen = new Set();

        for (const pattern of langConfig.patterns) {
            // Reset regex lastIndex for each file
            const regex = new RegExp(pattern.source, pattern.flags);
            let match;

            while ((match = regex.exec(content)) !== null) {
                const importPath = match[1];
                if (!importPath || seen.has(importPath)) continue;
                seen.add(importPath);

                const lineNumber = content.substring(0, match.index).split('\n').length;
                const isExternal = this.isExternalImport(importPath, language);
                const resolvedPath = isExternal
                    ? null
                    : this.resolveImportPath(importPath, relativePath, workspacePath, language);

                dependencies.push({
                    importPath,
                    resolvedPath,
                    lineNumber,
                    isExternal,
                });
            }
        }

        return dependencies;
    }

    /**
     * Check if an import references an external package.
     * @param {string} importPath
     * @param {string} language
     * @returns {boolean}
     */
    isExternalImport(importPath, language) {
        const patterns = this.externalPatterns[language] || [];
        return patterns.some((pattern) => pattern.test(importPath));
    }

    /**
     * Resolve a relative import path to workspace-relative path.
     * @param {string} importPath
     * @param {string} currentFile
     * @param {string} workspacePath
     * @param {string} language
     * @returns {string|null}
     */
    resolveImportPath(importPath, currentFile, workspacePath, language) {
        const currentDir = path.dirname(currentFile);

        // Handle language-specific resolution
        switch (language) {
            case 'javascript': {
                if (!importPath.startsWith('.') && !importPath.startsWith('/')) return null;

                let resolved = path.join(currentDir, importPath);
                resolved = path.normalize(resolved).replace(/\\/g, '/');

                // Try exact match
                const possibleExtensions = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.json', '/index.js', '/index.jsx', '/index.ts', '/index.tsx'];
                const absoluteResolved = path.join(workspacePath, resolved);

                if (fs.existsSync(absoluteResolved) && fs.statSync(absoluteResolved).isFile()) {
                    return resolved;
                }

                for (const ext of possibleExtensions) {
                    const candidate = absoluteResolved + ext;
                    if (fs.existsSync(candidate)) {
                        return resolved + ext;
                    }
                }

                return resolved;
            }

            case 'python': {
                // Convert dot notation to path
                let resolved = importPath.replace(/\./g, '/');
                // Try as file
                const pyFile = path.join(workspacePath, resolved + '.py');
                if (fs.existsSync(pyFile)) return resolved + '.py';
                // Try as package
                const pyInit = path.join(workspacePath, resolved, '__init__.py');
                if (fs.existsSync(pyInit)) return path.join(resolved, '__init__.py').replace(/\\/g, '/');
                return resolved + '.py';
            }

            case 'cpp': {
                // #include "relative/path.h" - resolve relative to current file
                let resolved = path.join(currentDir, importPath);
                resolved = path.normalize(resolved).replace(/\\/g, '/');
                const absoluteResolved = path.join(workspacePath, resolved);
                if (fs.existsSync(absoluteResolved)) return resolved;
                // Try from workspace root
                const fromRoot = path.normalize(importPath).replace(/\\/g, '/');
                if (fs.existsSync(path.join(workspacePath, fromRoot))) return fromRoot;
                return resolved;
            }

            case 'ruby': {
                const resolved = path.join(currentDir, importPath);
                const normalized = path.normalize(resolved).replace(/\\/g, '/');
                const possibleExts = ['.rb', ''];
                for (const ext of possibleExts) {
                    const candidate = path.join(workspacePath, normalized + ext);
                    if (fs.existsSync(candidate)) return normalized + ext;
                }
                return normalized + '.rb';
            }

            case 'php': {
                if (importPath.includes('\\')) {
                    // Namespace - convert to path
                    return importPath.replace(/\\\\/g, '/').replace(/^\//, '') + '.php';
                }
                const resolved = path.join(currentDir, importPath);
                return path.normalize(resolved).replace(/\\/g, '/');
            }

            case 'go': {
                // Go imports are usually module-based, not file-based
                return importPath;
            }

            case 'rust': {
                // Convert :: notation to path
                let resolved = importPath.replace(/::/g, '/');
                if (resolved.startsWith('crate/')) {
                    resolved = 'src/' + resolved.substring(6);
                }
                return resolved + '.rs';
            }

            case 'css': {
                let resolved = path.join(currentDir, importPath);
                resolved = path.normalize(resolved).replace(/\\/g, '/');
                return resolved;
            }

            case 'html': {
                if (importPath.startsWith('http') || importPath.startsWith('//')) return null;
                let resolved = path.join(currentDir, importPath);
                resolved = path.normalize(resolved).replace(/\\/g, '/');
                return resolved;
            }

            default: {
                // Generic: try relative resolution
                let resolved = path.join(currentDir, importPath);
                return path.normalize(resolved).replace(/\\/g, '/');
            }
        }
    }

    /**
     * Get list of supported file extensions.
     * @returns {string[]}
     */
    getSupportedExtensions() {
        const exts = [];
        for (const config of Object.values(this.languagePatterns)) {
            exts.push(...config.extensions);
        }
        return [...new Set(exts)];
    }
}

module.exports = { DependencyParser };
