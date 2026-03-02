# CodeChronicle ⚡

> **AI-Powered VS Code Extension** for codebase understanding, interactive dependency graphs, blast radius prediction, and natural language exploration.

![VS Code](https://img.shields.io/badge/VS%20Code-Extension-blue?logo=visual-studio-code)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2023-yellow?logo=javascript)
![AWS](https://img.shields.io/badge/AWS-Bedrock%20%7C%20Lambda%20%7C%20DynamoDB-orange?logo=amazon-aws)

---

## ✨ Features

- **🔍 Multi-Language Dependency Graph** – Supports 15+ languages (JS, TS, Python, Java, C/C++, Go, Rust, Ruby, PHP, Swift, Kotlin, and more)
- **🎯 Blast Radius Prediction** – See exactly which files are affected before you change a single line
- **🤖 AI-Powered Insights** – File explanations, risk analysis, and natural language Q&A via Amazon Bedrock
- **📊 Risk Scoring** – Structural + semantic risk assessment with color-coded visualization
- **⚡ Local-First Architecture** – Deterministic static analysis runs locally, AI reasoning in the cloud
- **🎨 Premium Dark UI** – Glassmorphism design with neon accents, Cytoscape.js interactive graphs

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│          VS Code Extension (Local)              │
│                                                 │
│  Scanner → Parser → Graph Builder → Metrics     │
│                    ↓                            │
│  React Webview (Cytoscape.js + Tailwind CSS)    │
│                    ↓                            │
│         API Client (when cloud enabled)         │
└───────────────────┬─────────────────────────────┘
                    │ HTTPS
┌───────────────────▼─────────────────────────────┐
│           AWS Cloud Backend                     │
│                                                 │
│  API Gateway → Lambda → Amazon Bedrock          │
│                    ↓                            │
│  DynamoDB (Cache) + CloudWatch (Monitoring)     │
└─────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd extension
npm install
```

### 2. Build the Extension

```bash
# Development (with watch)
npm run dev

# Production
npm run build
```

### 3. Run in VS Code

- Press **F5** in VS Code to launch the Extension Development Host
- Run `CodeChronicle: Scan Workspace` from the Command Palette (`Ctrl+Shift+P`)
- Run `CodeChronicle: Open Graph View` to see the dependency graph

## 📋 Commands

| Command | Description |
|---------|-------------|
| `CodeChronicle: Scan Workspace` | Scan and analyze workspace files |
| `CodeChronicle: Open Graph View` | Open the interactive dependency graph |
| `CodeChronicle: Ask AI About Codebase` | Natural language Q&A |
| `CodeChronicle: Predict Blast Radius` | Show impact of modifying the current file |
| `CodeChronicle: Refresh Analysis` | Rescan and rebuild the graph |

## ⚙️ Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `codechronicle.excludePatterns` | `["**/node_modules/**", ...]` | Glob patterns to exclude |
| `codechronicle.enableCloudAI` | `false` | Enable AWS Bedrock AI features |
| `codechronicle.awsApiEndpoint` | `""` | API Gateway endpoint URL |
| `codechronicle.awsRegion` | `us-east-1` | AWS region |
| `codechronicle.maxFiles` | `10000` | Maximum files to analyze |
| `codechronicle.supportedExtensions` | `[".js", ".py", ...]` | File extensions to include |

## ☁️ AWS Backend Setup (Optional)

The extension works fully offline with local structural analysis. To enable AI features:

### Prerequisites
1. AWS Account with Bedrock access enabled
2. AWS CLI configured (`aws configure`)
3. Node.js 20+

### Deploy Backend

```bash
cd backend
npm install
npx serverless deploy --stage dev --region us-east-1
```

After deployment, copy the API Gateway endpoint and configure in VS Code:
- Settings → CodeChronicle → AWS API Endpoint

### Required AWS Services
- **Amazon Bedrock** – Claude 3 Haiku for AI reasoning
- **AWS Lambda** – Serverless compute
- **Amazon DynamoDB** – AI response caching
- **API Gateway** – HTTPS endpoints
- **CloudWatch** – Monitoring & logging

## 🎨 Supported Languages

| Language | Import Detection |
|----------|-----------------|
| JavaScript/TypeScript | `import`, `require`, dynamic `import()` |
| Python | `import`, `from...import` |
| Java | `import` statements |
| C/C++ | `#include` directives |
| C# | `using` statements |
| Go | `import` statements |
| Ruby | `require`, `require_relative` |
| PHP | `use`, `require`, `include` |
| Rust | `use`, `mod`, `extern crate` |
| Swift | `import` |
| Kotlin | `import` |
| Scala | `import` |
| Dart | `import`, `export`, `part` |
| CSS/SCSS/LESS | `@import`, `@use`, `@forward` |
| HTML | `<script src>`, `<link href>` |

## 🛡️ Security

- No API keys stored in the extension
- All cloud calls routed through secure Lambda proxy
- IAM roles with least privilege
- HTTPS only (API Gateway)
- Extension bundle obfuscated in production

## 📦 Packaging

```bash
cd extension
npm install -g @vscode/vsce
vsce package
```

## 📁 Project Structure

```
CodeChronicle/
├── extension/
│   ├── src/
│   │   ├── extension.js          # Main entry point
│   │   ├── analyzer/
│   │   │   ├── scanner.js        # Workspace file scanner
│   │   │   └── dependencyParser.js  # Multi-language regex parser
│   │   ├── graph/
│   │   │   ├── graphBuilder.js   # Directed graph construction
│   │   │   ├── metricsEngine.js  # Centrality & risk metrics
│   │   │   └── blastRadius.js    # Impact analysis (BFS)
│   │   ├── ai/
│   │   │   └── apiClient.js      # AWS API Gateway client
│   │   ├── utils/
│   │   │   ├── cacheManager.js   # Local JSON cache
│   │   │   └── fileWatcher.js    # Incremental updates
│   │   └── webview/
│   │       ├── App.jsx           # Root React component
│   │       ├── index.jsx         # Webview entry
│   │       ├── index.css         # Tailwind design system
│   │       ├── WebviewProvider.js
│   │       ├── store/useStore.js # Zustand state
│   │       └── components/
│   │           ├── GraphDashboard.jsx
│   │           ├── FileDetailsPanel.jsx
│   │           ├── BlastRadiusView.jsx
│   │           ├── QueryPanel.jsx
│   │           ├── RiskPanel.jsx
│   │           ├── Toolbar.jsx
│   │           └── StatusBar.jsx
│   ├── package.json
│   ├── webpack.config.js
│   └── tailwind.config.js
├── backend/
│   ├── lambda/
│   │   ├── aiHandler.js          # Bedrock AI reasoning
│   │   ├── riskEngine.js         # Risk scoring
│   │   └── cacheService.js       # DynamoDB cache
│   ├── serverless.yml
│   └── package.json
└── docs/
```

## License

MIT
