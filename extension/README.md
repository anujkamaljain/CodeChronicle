# CodeChronicle

**AI-Powered Codebase Analysis for VS Code**

Visualize your codebase as an interactive dependency graph, predict blast radius of changes, and explore your code with natural language queries — all powered by AWS Bedrock AI.

## Features

### Interactive Dependency Graph
- Visualize file dependencies as a dynamic, force-directed graph
- Color-coded nodes by file type (JS, TS, Python, Java, CSS, HTML, and more)
- Search and filter files instantly
- Click any node to see detailed file information
- Smooth zoom controls with fit-to-view

### Blast Radius Analysis
- Select any file and instantly see what would be affected if it changes
- Understand direct and transitive dependencies at a glance
- Prioritize code reviews and testing based on impact

### AI-Powered Summaries
- Get plain-English explanations of what any file does
- Detailed 7-section deep-dive analysis for any file
- Dependency relationship analysis between connected files
- Local offline fallback when cloud AI is unavailable
- Powered by Amazon Bedrock (Nova models)

### Natural Language Queries
- Ask questions about your codebase in plain English
- "Which files would break if I change utils.js?"
- "What does the authentication module do?"
- "Show me the most critical files in this project"

### Risk Map
- Visual heatmap of risk across your entire codebase
- Structural and AI-estimated risk assessment per file
- Identifies high-risk files based on dependency count, centrality, and complexity
- Helps you focus testing and review efforts where they matter most

## Getting Started

1. Install the extension from the VS Code Marketplace
2. Open any project in VS Code
3. Click the **CodeChronicle** icon in the Activity Bar (left sidebar)
4. Click **Scan Workspace** to analyze your project
5. Once the scan completes, click **Open Graph View** to explore the interactive dependency graph
6. Use the tabs at the top to switch between **Graph**, **Blast Radius**, **AI Query**, and **Risk Map**

> **Tip:** You can also use the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run **CodeChronicle: Scan Workspace** followed by **CodeChronicle: Open Graph View**.

## Supported Languages

CodeChronicle analyzes dependencies across **15+ languages**:

JavaScript, TypeScript, Python, Java, C/C++, C#, Go, Ruby, PHP, Rust, Swift, Kotlin, Scala, R, Lua, Dart, Vue, Svelte, CSS/SCSS/SASS/LESS, HTML, and more.

## Requirements

- VS Code 1.85.0 or higher
- Internet connection for AI features (graph, blast radius, and risk map work offline)
- Responsive UI: Works on 13" laptops through large monitors (Antigravity, Kiro, VS Code, Cursor)

## Responsive Design

CodeChronicle adapts to all screen sizes — from 13" MacBooks to large desktop monitors. The UI uses flexible layouts, responsive grids, and viewport-aware sizing so nothing gets cut off on smaller displays.

## Extension Settings

| Setting | Description | Default |
|---|---|---|
| `codechronicle.enableCloudAI` | Enable AI-powered summaries and queries | `true` |
| `codechronicle.awsRegion` | AWS region for the backend | `us-east-1` |
| `codechronicle.awsApiEndpoint` | AWS API Gateway endpoint URL for cloud AI | `""` |
| `codechronicle.maxFiles` | Maximum files to scan | `10000` |
| `codechronicle.excludePatterns` | Glob patterns to exclude from scanning | `node_modules, .git, dist, build, ...` |
| `codechronicle.supportedExtensions` | File extensions to include in analysis | `.js, .ts, .py, .java, ...` |

## Commands

| Command | Description |
|---|---|
| `CodeChronicle: Scan Workspace` | Scan and analyze the current workspace |
| `CodeChronicle: Open Graph View` | Open the interactive dependency graph |
| `CodeChronicle: Ask AI About Codebase` | Ask a natural language question about your code |
| `CodeChronicle: Predict Blast Radius` | Predict the impact of changing the currently open file |
| `CodeChronicle: Refresh Analysis` | Rescan the workspace and update the graph |

## Privacy

- Code analysis (graph, metrics, blast radius) runs **entirely locally**
- AI features send file content and metadata to the secure AWS backend
- No code is stored permanently — AI cache entries expire automatically

## License

MIT
