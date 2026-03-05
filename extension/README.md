# CodeChronicle

**AI-Powered Codebase Analysis for VS Code**

Visualize your codebase as an interactive dependency graph, predict blast radius of changes, and explore your code with natural language queries — all powered by AWS Bedrock AI.

## Features

### Interactive Dependency Graph
- Visualize file dependencies as a dynamic, force-directed graph
- Color-coded nodes by file type (JS, TS, Python, Java, CSS, HTML, and more)
- Search and filter files instantly
- Click any node to see detailed file information

### Blast Radius Analysis
- Select any file and instantly see what would be affected if it changes
- Understand direct and transitive dependencies at a glance
- Prioritize code reviews and testing based on impact

### AI-Powered Summaries
- Get plain-English explanations of what any file does
- Automatic risk assessment for every file in your project
- Powered by Amazon Bedrock (Nova models)

### Natural Language Queries
- Ask questions about your codebase in plain English
- "Which files would break if I change utils.js?"
- "What does the authentication module do?"
- "Show me the most critical files in this project"

### Risk Map
- Visual heatmap of risk across your entire codebase
- Identifies high-risk files based on dependency count, centrality, and complexity
- Helps you focus testing and review efforts where they matter most

## Getting Started

1. Install the extension from the VS Code Marketplace
2. Open any project in VS Code
3. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
4. Run **CodeChronicle: Show Graph**
5. Click **Scan Workspace** to analyze your project

## Supported Languages

CodeChronicle analyzes dependencies across **15+ languages**:

JavaScript, TypeScript, Python, Java, C/C++, Go, Ruby, PHP, Rust, Swift, Kotlin, Scala, Dart, CSS/SCSS, HTML, and more.

## Requirements

- VS Code 1.85.0 or higher
- Internet connection for AI features (graph and blast radius work offline)

## Extension Settings

| Setting | Description | Default |
|---|---|---|
| `codechronicle.enableCloudAI` | Enable AI-powered summaries and queries | `true` |
| `codechronicle.awsRegion` | AWS region for the backend | `us-east-1` |
| `codechronicle.maxFiles` | Maximum files to scan | `1000` |
| `codechronicle.excludePatterns` | Glob patterns to exclude from scanning | `node_modules, .git, dist, ...` |

## Privacy

- Code analysis (graph, metrics, blast radius) runs **entirely locally**
- AI features send only file content and metadata to the secure AWS backend
- No code is stored permanently — AI cache entries expire automatically

## License

MIT
