<p align="center">
  <img src="extension/assets/icon.png" alt="CodeChronicle Logo" width="120" />
  <h1 align="center">CodeChronicle ⚡</h1>
  <p align="center"><strong>AI-Powered VS Code Extension for Codebase Understanding, Interactive Dependency Graphs, Blast Radius Prediction, and Natural Language Exploration</strong></p>
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=AnujKamalJain.codechronicle"><img src="https://img.shields.io/badge/VS%20Code-Marketplace-blue?logo=visual-studio-code&style=for-the-badge" alt="VS Code Marketplace" /></a>
  <img src="https://img.shields.io/badge/version-0.1.6-blue?style=for-the-badge" alt="Version" />
  <img src="https://img.shields.io/badge/JavaScript-ES2023-F7DF1E?logo=javascript&style=for-the-badge" alt="JavaScript" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&style=for-the-badge" alt="React" />
  <img src="https://img.shields.io/badge/AWS-Bedrock%20|%20Lambda%20|%20DynamoDB-FF9900?logo=amazon-aws&style=for-the-badge" alt="AWS" />
  <img src="https://img.shields.io/badge/Serverless-Framework%20v3-FD5750?logo=serverless&style=for-the-badge" alt="Serverless" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License" />
</p>

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [AWS Services Used](#aws-services-used)
- [Feature Deep Dive](#feature-deep-dive)
  - [1. Workspace Scanning and File Discovery](#1-workspace-scanning-and-file-discovery)
  - [2. Multi-Language Dependency Parsing](#2-multi-language-dependency-parsing)
  - [3. Graph Construction and Metrics Engine](#3-graph-construction-and-metrics-engine)
  - [4. Interactive Graph Visualization](#4-interactive-graph-visualization)
  - [5. Graph Search and Filtering](#5-graph-search-and-filtering)
  - [6. AI-Powered File Summaries](#6-ai-powered-file-summaries)
  - [7. AI-Driven Risk Assessment](#7-ai-driven-risk-assessment)
  - [8. Blast Radius Prediction](#8-blast-radius-prediction)
  - [9. Natural Language Query Interface](#9-natural-language-query-interface)
  - [10. Risk Dashboard and Health Overview](#10-risk-dashboard-and-health-overview)
  - [11. Caching System (Local + Cloud)](#11-caching-system-local--cloud)
  - [12. Incremental File Watching](#12-incremental-file-watching)
  - [13. Toast Notification System](#13-toast-notification-system)
  - [14. Status Bar Integration](#14-status-bar-integration)
- [Data Flow](#data-flow)
- [API Endpoints](#api-endpoints)
- [Database Schema](#database-schema)
- [AI Prompts and Models](#ai-prompts-and-models)
- [Extension ↔ Webview Message Protocol](#extension--webview-message-protocol)
- [VS Code Commands](#vs-code-commands)
- [Extension Configuration](#extension-configuration)
- [Supported Languages](#supported-languages)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [AWS Backend Deployment](#aws-backend-deployment)
- [Development](#development)
- [Packaging and Distribution](#packaging-and-distribution)
- [Security](#security)
- [Error Handling and Resilience](#error-handling-and-resilience)
- [Design System and UI](#design-system-and-ui)
- [License](#license)

---

## Overview

CodeChronicle is a VS Code extension designed to help developers understand and safely modify large, complex codebases. It combines **deterministic local static analysis** with **cloud-powered AI reasoning** (Amazon Bedrock) to provide deep codebase insights without leaving your editor.

The core philosophy is **local-first**: all structural analysis (scanning, parsing, graph building, metrics, blast radius) runs entirely on your machine. Cloud AI features (file summaries, semantic risk scoring, natural language Q&A) are optional and powered by AWS services when enabled.

---

## Key Features

| Feature | Description | Requires Cloud |
|---------|-------------|:--------------:|
| **Multi-Language Dependency Graph** | Interactive Cytoscape.js graph supporting 15+ languages | No |
| **Blast Radius Prediction** | BFS-based transitive impact analysis before you change a line | No |
| **AI File Summaries** | 2-3 sentence explanations of what each file does and why | Yes |
| **Semantic Risk Scoring** | AI-assessed risk based on side effects, security, coupling | Yes |
| **Structural Risk Scoring** | Deterministic risk from dependency count, centrality, LOC | No |
| **Natural Language Q&A** | Ask questions about your codebase in plain English | Yes |
| **Risk Health Dashboard** | Codebase-wide risk distribution, health score, export reports | No |
| **Graph Search & Filter** | Real-time node search by name and path with highlighting | No |
| **Incremental Updates** | File watcher auto-updates the graph on file changes | No |
| **Smart Caching** | DynamoDB cloud cache (7-day TTL) + local JSON cache | Hybrid |
| **Premium Dark UI** | Glassmorphism design with neon accents and smooth animations | No |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                    VS Code Extension (Local)                         │
│                                                                      │
│  ┌─────────────┐   ┌──────────────┐   ┌─────────────┐              │
│  │  Workspace   │──▶│  Dependency   │──▶│   Graph     │              │
│  │  Scanner     │   │  Parser      │   │   Builder   │              │
│  └─────────────┘   └──────────────┘   └──────┬──────┘              │
│                                               │                      │
│  ┌─────────────┐   ┌──────────────┐   ┌──────▼──────┐              │
│  │   File       │   │    Cache     │   │   Metrics   │              │
│  │   Watcher    │   │   Manager    │   │   Engine    │              │
│  └─────────────┘   └──────────────┘   └──────┬──────┘              │
│                                               │                      │
│  ┌────────────────────────────────────────────▼──────────────────┐  │
│  │           React Webview (Cytoscape.js + Tailwind CSS)         │  │
│  │                                                                │  │
│  │  ┌────────────┐ ┌──────────────┐ ┌────────────┐ ┌──────────┐ │  │
│  │  │   Graph    │ │    Blast     │ │   Query    │ │   Risk   │ │  │
│  │  │ Dashboard  │ │   Radius     │ │   Panel    │ │  Panel   │ │  │
│  │  └────────────┘ └──────────────┘ └────────────┘ └──────────┘ │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                          │                                           │
│                   API Client (HTTPS)                                 │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
               ┌───────────▼────────────┐
               │   AWS Cloud Backend    │
               │                        │
               │  ┌──────────────────┐  │
               │  │   API Gateway    │  │
               │  │   (HTTP API)     │  │
               │  └────────┬─────────┘  │
               │           │            │
               │  ┌────────▼─────────┐  │
               │  │  AWS Lambda      │  │
               │  │  ┌─────────────┐ │  │
               │  │  │ AI Handler  │ │  │
               │  │  │ Risk Engine │ │  │
               │  │  │ Cache Svc   │ │  │
               │  │  └─────────────┘ │  │
               │  └──┬──────────┬────┘  │
               │     │          │       │
               │  ┌──▼───┐  ┌──▼────┐  │
               │  │Bedrock│  │Dynamo │  │
               │  │(Nova) │  │  DB   │  │
               │  └───────┘  └───────┘  │
               │                        │
               │  CloudWatch (Logging)  │
               └────────────────────────┘
```

### Four-Layer Design

| Layer | Location | Responsibility |
|-------|----------|----------------|
| **Analysis Layer** | Local | File scanning, dependency parsing, graph construction, metrics computation |
| **Visualization Layer** | Local | React.js webview with Cytoscape.js graph rendering, Tailwind CSS styling |
| **Cloud Backend Layer** | AWS | Lambda functions behind API Gateway for AI orchestration |
| **AI Layer** | AWS Bedrock | Foundation model inference for summaries, risk analysis, and Q&A |

---

## AWS Services Used

### Amazon Bedrock (AI/ML)

Amazon Bedrock provides the foundation model inference that powers all AI features. CodeChronicle uses the **Amazon Nova** family of models via the Bedrock **Converse API**.

| Model | Usage |
|-------|-------|
| `us.amazon.nova-premier-v1:0` | Primary model for file summaries, risk scoring, and Q&A |
| `us.amazon.nova-lite-v1:0` | Fallback model when Premier is unavailable |

**How it works:**
- Lambda functions construct structured prompts with file content, metrics, and dependency context
- Prompts are sent to Bedrock via `@aws-sdk/client-bedrock-runtime` using the `ConverseCommand`
- Responses are parsed (summaries as plain text, risk scores and queries as JSON)
- Results are cached in DynamoDB to minimize redundant model invocations

### AWS Lambda (Serverless Compute)

Five Lambda functions handle all backend logic, deployed via the Serverless Framework:

| Function | Handler | Timeout | Purpose |
|----------|---------|---------|---------|
| `aiExplain` | `lambda/aiHandler.explain` | 60s | Generates AI file summaries |
| `aiRiskScore` | `lambda/riskEngine.assessRisk` | 60s | Produces semantic risk assessments |
| `aiQuery` | `lambda/aiHandler.query` | 60s | Answers natural language codebase questions |
| `cacheGet` | `lambda/cacheService.get` | 30s | Reads cached summaries and risk scores |
| `cachePut` | `lambda/cacheService.put` | 30s | Writes cache entries |

**Runtime:** Node.js 20.x | **Memory:** 512 MB | **Region:** Configurable (default `us-east-1`)

### Amazon API Gateway (HTTP API)

API Gateway provides the HTTPS entry point for all extension-to-cloud communication:

- **Type:** HTTP API (lightweight, low-latency)
- **CORS:** Enabled for cross-origin webview requests
- **Endpoints:** 5 routes (see [API Endpoints](#api-endpoints))
- **Health Check:** `GET /cache/healthcheck` returns `{ cached: false }` as a lightweight connectivity test

### Amazon DynamoDB (NoSQL Database)

Two DynamoDB tables provide serverless caching with automatic expiration:

| Table | Purpose | Key Schema | TTL |
|-------|---------|------------|-----|
| `codechronicle-backend-summaries-{stage}` | Cached AI file summaries | `fileHash` (HASH) + `filePath` (RANGE) | 7 days |
| `codechronicle-backend-risks-{stage}` | Cached AI risk assessments | `fileHash` (HASH) + `filePath` (RANGE) | 7 days |

**Billing:** PAY_PER_REQUEST (on-demand) — you only pay for what you use.

When a file's content hash changes, the old cache entry naturally becomes unreachable (new hash = new key), and TTL handles cleanup of stale entries.

### Amazon CloudWatch (Monitoring & Logging)

- **Lambda Logs:** Automatic logging of all function invocations, errors, and durations
- **IAM:** Lambda execution role includes `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents`
- **Metrics:** Standard Lambda metrics (invocation count, duration, errors, throttles)

### AWS IAM (Identity & Access Management)

The Lambda execution role is configured with least-privilege permissions:

| Permission | Resources | Purpose |
|------------|-----------|---------|
| `bedrock:InvokeModel`, `bedrock:InvokeModelWithResponseStream` | `*` | Call Bedrock foundation models |
| `dynamodb:GetItem`, `PutItem`, `UpdateItem`, `DeleteItem`, `Query`, `Scan` | Summaries + Risks tables | Read/write cache |
| `logs:CreateLogGroup`, `CreateLogStream`, `PutLogEvents` | `*` | CloudWatch logging |
| `aws-marketplace:ViewSubscriptions`, `Subscribe` | `*` | Bedrock model marketplace access |

---

## Feature Deep Dive

### 1. Workspace Scanning and File Discovery

The **WorkspaceScanner** is the first step in the analysis pipeline. It discovers all source code files in the currently open VS Code workspace.

**How it works:**
1. Recursively traverses the workspace directory tree
2. Filters files by the configured `supportedExtensions` list (37 extensions by default)
3. Excludes directories matching `excludePatterns` (e.g., `node_modules`, `dist`, `.git`, `vendor`, `__pycache__`, `build`, `target`, `.next`, `coverage`)
4. Respects `.gitignore` patterns using the `ignore` npm package
5. Records workspace-relative paths for each discovered file
6. Enforces the `maxFiles` limit (default: 10,000) to prevent performance issues
7. Reports the total file count to the user upon completion

**Configurable via:** `codechronicle.excludePatterns`, `codechronicle.supportedExtensions`, `codechronicle.maxFiles`

---

### 2. Multi-Language Dependency Parsing

The **DependencyParser** extracts import/require/include statements from source files using language-specific regex patterns. It supports **15+ programming languages and stylesheet formats**.

**Supported languages and their import patterns:**

| Language | Detected Patterns |
|----------|-------------------|
| **JavaScript / TypeScript** | `import ... from '...'`, `require('...')`, dynamic `import('...')`, side-effect `import '...'`, `export ... from '...'` |
| **Python** | `import module`, `from module import ...` |
| **Java** | `import package.Class;` |
| **C / C++** | `#include "header.h"`, `#include <system>` |
| **C#** | `using Namespace;` |
| **Go** | `import "package"`, `import (...)` |
| **Ruby** | `require 'file'`, `require_relative 'file'`, `load 'file'` |
| **PHP** | `use Namespace`, `require 'file'`, `include 'file'` |
| **Rust** | `use crate::module`, `mod module`, `extern crate` |
| **Swift** | `import Module` |
| **Kotlin / Scala** | `import package.Class` |
| **Dart** | `import 'package:...'`, `export '...'`, `part '...'` |
| **CSS / SCSS / LESS** | `@import '...'`, `@use '...'`, `@forward '...'` |
| **HTML** | `<script src="...">`, `<link href="...">`, `<img src="...">` |

**Resolution rules:**
- Relative imports (e.g., `./utils`, `../models/user`) are resolved to absolute workspace paths
- External/third-party packages (e.g., `react`, `express`, `numpy`) are excluded from the graph
- Index file resolution (e.g., `./components` → `./components/index.js`)
- Extension inference (e.g., `./utils` → `./utils.js` or `./utils.ts`)

---

### 3. Graph Construction and Metrics Engine

#### Graph Builder

The **GraphBuilder** constructs a directed graph where:
- **Nodes** = source code files
- **Edges** = dependency relationships (file A imports file B → edge from A to B)

It normalizes all paths, deduplicates edges, and counts dependencies/dependents per node.

#### Metrics Engine

The **MetricsEngine** computes deterministic structural metrics for every node:

| Metric | Description | Calculation |
|--------|-------------|-------------|
| **Lines of Code (LOC)** | Total line count of the file | Direct file read |
| **Dependency Count** | Number of files this file imports (outgoing edges) | Graph out-degree |
| **Dependent Count** | Number of files that import this file (incoming edges) | Graph in-degree |
| **Centrality Score** | Betweenness centrality — how critical this file is as a connector | Graph algorithm (0.0–1.0) |
| **Structural Risk Score** | Composite risk from dependency count, dependents, centrality, LOC | Weighted formula (0–100) |
| **Structural Risk Level** | Categorized risk | `low` (0–29), `medium` (30–59), `high` (60–100) |

---

### 4. Interactive Graph Visualization

The **GraphDashboard** renders the dependency graph using **Cytoscape.js** with the **cose-bilkent** force-directed layout algorithm.

**Visual encodings:**

| Visual Property | Maps To |
|----------------|---------|
| **Node size** (24–70px) | Centrality score + dependent count |
| **Node color** | File extension (JSX/TSX=cyan, JS=blue, TS=indigo, Python=green, CSS=pink, etc.) |
| **Border ring color** | Risk level: green (low), yellow (medium), red (high) |
| **Border animation** | High-risk nodes have a pulsing border effect |
| **Edge color (on select)** | Blue = dependency (outgoing), Purple = dependent (incoming) |

**Interactions:**
- **Click a node**: Select it, highlight its neighbors, dim everything else
- **Hover a node**: Tooltip showing LOC, dependencies, dependents, centrality, risk level
- **Click empty space**: Deselect and reset the view
- **Pan / Zoom**: Mouse drag and scroll wheel
- **Double-click**: Fit the graph to the viewport

**Layout intelligence:** The layout algorithm adapts its parameters based on graph size:
- Small graphs (< 50 nodes): compact spacing
- Medium graphs (50–200 nodes): balanced spacing
- Large graphs (200+ nodes): expanded spacing with longer ideal edge lengths

**Animated particle background:** A subtle canvas animation renders ~30 floating particles behind the graph for a premium visual effect.

**Keyboard shortcuts:**
| Shortcut | Action |
|----------|--------|
| `Esc` | Deselect node / clear search |
| `F` | Fit graph to viewport |
| `Ctrl+F` | Focus the search bar |

**Controls overlay:**
- Zoom In / Zoom Out buttons
- Fit View button
- Current zoom level label
- Expandable legend showing file type colors and edge arrow meanings

---

### 5. Graph Search and Filtering

The **GraphSearchBar** provides real-time search across graph nodes.

**How it works:**
1. User types in the search input (or presses `Ctrl+F` to focus)
2. Nodes are matched against both their **label** (filename) and **path** (full relative path), case-insensitive
3. Matching nodes get the `search-match` CSS class (full opacity, highlighted border)
4. Non-matching nodes get the `search-dim` class (reduced opacity)
5. Edges connected to non-matching nodes are also dimmed
6. A match count badge shows how many nodes match (e.g., "3 found")
7. Clear button (`×`) resets the search and restores all nodes
8. Pressing `Esc` also clears the search

---

### 6. AI-Powered File Summaries

When a user clicks a node in the graph, the extension requests an AI-generated summary of that file.

**Flow:**
1. User clicks a node → extension receives `nodeClick` message
2. Extension sends structural data immediately, then calls `POST /ai/explain` with file content, hash, metrics, and dependency context
3. Lambda checks DynamoDB cache using the file hash + path as the key
4. **Cache hit**: Returns cached summary immediately (shown with a "Cached" badge in the UI)
5. **Cache miss**: Lambda constructs a Bedrock prompt asking for a 2-3 sentence summary covering:
   - What the file does
   - Why it exists in the codebase
   - Its role in the overall architecture
6. Bedrock response is cached in DynamoDB (7-day TTL)
7. Summary is displayed in the **FileDetailsPanel** sidebar

**Local fallback:** When Cloud AI is disabled or unavailable, the extension generates a heuristic summary based on the file's structural metrics (e.g., "This file has 5 dependencies and 12 dependents with high centrality, suggesting it's a core module").

**AI progress indicator:** The UI shows a three-step progress animation:
1. "Reading file content..." 
2. "Sending to AI..."
3. "Processing response..."

---

### 7. AI-Driven Risk Assessment

Risk assessment combines **structural (local)** and **semantic (AI)** analysis.

#### Structural Risk (Always Available)

Computed locally by the MetricsEngine using a weighted formula based on:
- Dependency count (how many files it imports)
- Dependent count (how many files depend on it)
- Centrality score (how critical it is as a connector)
- Lines of code (larger files = more risk surface)

Produces a score from 0–100 and a level: `low`, `medium`, or `high`.

#### Semantic AI Risk (Cloud Feature)

When the user clicks "Analyze Risk" in the FileDetailsPanel:

1. Extension sends file content, metrics, and dependency context to `POST /ai/risk-score`
2. Lambda checks DynamoDB cache first
3. On cache miss, constructs a Bedrock prompt asking the model to assess:
   - **Business-critical logic** (payment processing, auth, data mutations)
   - **Side effects** (database writes, API calls, file I/O)
   - **Security-sensitive operations** (authentication, authorization, encryption)
   - **Hidden coupling** (global state, singletons, event emitters, shared mutable state)
4. Model returns a JSON response:
   ```json
   {
     "level": "high",
     "score": 78,
     "explanation": "This file handles authentication tokens and directly writes to the session store",
     "factors": ["authentication logic", "session management", "database writes"]
   }
   ```
5. Score is clamped to 0–100, level is normalized to `low`/`medium`/`high`
6. Result is cached in DynamoDB for 7 days

**UI display:** The FileDetailsPanel shows both structural and AI risk as separate gauges, with the AI risk factors listed as badges.

---

### 8. Blast Radius Prediction

Blast radius answers the question: *"If I change this file, what else could break?"*

**Algorithm:** Breadth-First Search (BFS) traversal of the dependency graph, following **incoming edges** (files that depend on the selected file).

**How it works:**
1. User selects a node and clicks "Show Blast Radius" (or runs `CodeChronicle: Predict Blast Radius`)
2. The **BlastRadiusEngine** performs BFS from the selected node
3. Dependents are classified as:
   - **Direct dependents**: Files that directly import the selected file (1 hop)
   - **Indirect dependents**: Files that transitively depend on it (2+ hops)
4. The graph highlights affected nodes and dims everything else
5. An **Impact Score** is computed based on the number and importance of affected files

**Blast Radius View (dedicated tab):**
- Source file header
- Four stat cards: Direct Dependents, Indirect Dependents, Total Impact, Impact Score
- Scrollable lists of direct and indirect dependents
- Each dependent has "Open in Editor" and "Select in Graph" actions
- "Safe to Modify" message when a file has zero dependents

---

### 9. Natural Language Query Interface

The **QueryPanel** lets developers ask questions about their codebase in plain English.

**Example queries (built-in suggestions):**
- "Which files handle authentication?"
- "What are the most critical files in this codebase?"
- "Show me files with database connections"
- "Which files have the most dependencies?"
- "What does the main entry point do?"
- "Find files related to API endpoints"

**How it works:**
1. User types a question and submits
2. Extension runs `rankFilesByRelevance` — scores files by keyword overlap between the query and file paths, labels, directory names, and existing summaries
3. Top 10 most relevant files are sent as context (with file content included for the top 7)
4. `POST /ai/query` sends the query + graph context to Lambda
5. Lambda constructs a Bedrock prompt with the codebase context
6. Model returns a structured JSON response:
   ```json
   {
     "answer": "Authentication is handled in src/auth/middleware.js which...",
     "references": [
       { "path": "src/auth/middleware.js", "snippet": "..." }
     ],
     "suggestedQuestions": [
       "How are JWT tokens validated?",
       "Where is the login endpoint defined?"
     ],
     "confidence": 0.87
   }
   ```

**UI features:**
- Markdown rendering of answers (headings, lists, code blocks, bold, inline code)
- Confidence badge (color-coded: green when > 70%, yellow otherwise)
- Response time display
- Copy answer to clipboard
- Clickable file references that open files in the editor
- Suggested follow-up questions (clickable)
- Recent query history (up to 50 queries)
- Example queries for quick start

---

### 10. Risk Dashboard and Health Overview

The **RiskPanel** provides a codebase-wide overview of risk distribution and health.

**Dashboard components:**

| Component | Description |
|-----------|-------------|
| **Health Score** | Overall codebase health (0–100) displayed as a radial gauge |
| **Total Files** | Count of analyzed files |
| **Average Risk** | Mean structural risk score across all files |
| **Risk Distribution Bar** | Horizontal bar showing percentage of high/medium/low risk files |
| **Most Risky Files** | Top files ranked by structural risk score |
| **Most Connected Files** | Top files ranked by total connections (dependencies + dependents) |
| **Collapsible Risk Sections** | High / Medium / Low risk file lists with expand/collapse |
| **Export Risk Report** | Generates a downloadable Markdown report of all risk data |

**Interactions:**
- Click a file → selects it in the graph and opens the FileDetailsPanel
- Arrow button (→) → opens the file directly in the VS Code editor

---

### 11. Caching System (Local + Cloud)

CodeChronicle uses a two-tier caching strategy:

#### Local Cache (CacheManager)

- **Location:** In-memory during the extension session, persisted as JSON in the VS Code global storage
- **Contents:** Complete graph structure (nodes, edges, metrics)
- **Invalidation:** File content hash changes trigger re-parsing; manual refresh clears all
- **Purpose:** Fast startup without re-scanning, offline operation

#### Cloud Cache (DynamoDB)

- **Tables:** Summaries table + Risks table
- **Keys:** `fileHash` (partition) + `filePath` (sort) — content-addressable
- **TTL:** 7 days (automatic expiration via DynamoDB TTL)
- **Purpose:** Avoid redundant Bedrock API calls for unchanged files

**Cache lookup flow:**
1. Extension computes a content MD5 hash of the file
2. Sends the hash + file data to `POST /ai/explain` or `POST /ai/risk-score`
3. Lambda handler checks DynamoDB for a matching `fileHash + filePath` key
4. **Cache hit**: Returns cached result immediately (response includes `cached: true`)
5. **Cache miss**: Calls Bedrock, then stores the result in DynamoDB with a 7-day TTL
6. Standalone `GET /cache/{hash}` and `POST /cache` endpoints also exist for direct cache access

---

### 12. Incremental File Watching

The **FileWatcher** monitors the workspace for file system changes and incrementally updates the graph without requiring a full rescan.

| Event | Action |
|-------|--------|
| **File created** | Adds a new node, parses dependencies, creates edges, recomputes metrics |
| **File deleted** | Removes the node and all connected edges (incoming + outgoing), recomputes metrics |
| **File modified** | Re-parses dependencies, updates edges, invalidates cached AI data, recomputes metrics |

After any change, the updated graph is sent to the webview for re-rendering.

---

### 13. Toast Notification System

The **ToastContainer** provides non-intrusive, auto-dismissing notifications.

| Type | Icon Color | Use Cases |
|------|------------|-----------|
| `success` | Green | Scan complete, cache hit, export saved |
| `error` | Red | API failure, parse error, network timeout |
| `info` | Blue | Cloud status change, feature hints |

**Behavior:**
- Appears at the bottom-right of the webview
- Auto-dismisses after 4 seconds (configurable, or 0 for persistent)
- Manual dismiss via close button
- Animated progress bar showing remaining time
- Stacks multiple toasts vertically

---

### 14. Status Bar Integration

The extension adds a **status bar item** to the VS Code bottom bar.

**States:**
| Status | Icon | Meaning |
|--------|------|---------|
| Loading | Spinning | Workspace scan or AI request in progress |
| Ready | Check | Graph is built and ready |
| Error | Warning | Something went wrong (auto-clears after 6 seconds) |

**Additional info displayed in the webview status bar:**
- Node and edge counts (e.g., "142 nodes · 387 edges")
- Last updated timestamp
- Cloud status: Connected / Disconnected (UI also supports Rate Limited display)

---

## Data Flow

### Local Analysis Pipeline

```
Workspace Files
      │
      ▼
┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────────┐
│  Workspace   │───▶│  Dependency   │───▶│   Graph     │───▶│   Metrics    │
│  Scanner     │    │  Parser      │    │   Builder   │    │   Engine     │
└─────────────┘    └──────────────┘    └─────────────┘    └──────┬───────┘
                                                                  │
                                                                  ▼
                                                          ┌──────────────┐
                                                          │ Local Cache  │
                                                          │ (JSON)       │
                                                          └──────────────┘
```

### Cloud AI Pipeline

```
User Action (click node / ask question / analyze risk)
      │
      ▼
┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────────┐
│  Extension   │───▶│ API Gateway  │───▶│   Lambda    │───▶│   Bedrock    │
│  API Client  │    │ (HTTPS)      │    │  Function   │    │  (Nova AI)   │
└─────────────┘    └──────────────┘    └──────┬──────┘    └──────────────┘
                                              │
                                              ▼
                                       ┌──────────────┐
                                       │  DynamoDB    │
                                       │  (Cache)     │
                                       └──────────────┘
```

---

## API Endpoints

| Method | Path | Handler | Request Body | Response |
|--------|------|---------|--------------|----------|
| `POST` | `/ai/explain` | `aiHandler.explain` | `{ filePath, fileHash, metrics?, dependencies?, dependents?, fileContent? }` | `{ summary, cached, timestamp }` |
| `POST` | `/ai/risk-score` | `riskEngine.assessRisk` | `{ filePath, fileHash, metrics?, dependencies?, dependents?, fileContent? }` | `{ riskFactor: { level, score, explanation, factors }, cached }` |
| `POST` | `/ai/query` | `aiHandler.query` | `{ query, graphContext?, maxResults? }` | `{ answer, references, suggestedQuestions, confidence }` |
| `GET` | `/cache/{hash}` | `cacheService.get` | Query param: `filePath` | `{ summary?, risk?, cached: true }` or `{ cached: false }` |
| `POST` | `/cache` | `cacheService.put` | `{ fileHash, filePath, type, data }` | `{ success: true }` |

---

## Database Schema

### Summaries Table (`codechronicle-backend-summaries-{stage}`)

| Attribute | Type | Key | Description |
|-----------|------|-----|-------------|
| `fileHash` | String | Partition Key | MD5 hash of file content |
| `filePath` | String | Sort Key | Workspace-relative file path |
| `summary` | String | — | AI-generated file summary |
| `timestamp` | String | — | ISO 8601 timestamp of generation |
| `ttl` | Number | TTL | Unix epoch expiration (7 days from creation) |

### Risks Table (`codechronicle-backend-risks-{stage}`)

| Attribute | Type | Key | Description |
|-----------|------|-----|-------------|
| `fileHash` | String | Partition Key | MD5 hash of file content |
| `filePath` | String | Sort Key | Workspace-relative file path |
| `riskFactor` | Map | — | `{ level, score, explanation, factors }` |
| `timestamp` | String | — | ISO 8601 timestamp of generation |
| `ttl` | Number | TTL | Unix epoch expiration (7 days from creation) |

---

## AI Prompts and Models

### File Summary Prompt

Sent to Bedrock when a user clicks a node:

```
You are analyzing a source code file in a large codebase.

File: {filePath}
Lines of Code: {linesOfCode}
Dependencies: {dependencyCount}
Dependents: {dependentCount}
Centrality Score: {centralityScore}

File Content:
{fileContent (up to ~80k characters)}

This file imports: {dependencies}
This file is imported by: {dependents}

Generate a concise summary (2-3 sentences) explaining:
1. What this file does
2. Why it exists in the codebase
3. Its role in the overall architecture

Return only the summary text, no additional formatting.
```

### Risk Assessment Prompt

Sent to Bedrock when a user clicks "Analyze Risk":

```
You are assessing the risk of modifying a source code file.

File: {filePath}
Structural Metrics:
- Lines of Code: {linesOfCode}
- Number of Dependencies: {dependencyCount}
- Number of Dependents: {dependentCount}
- Centrality Score: {centralityScore}

File Content:
{fileContent (up to ~4k characters)}

Analyze this file for semantic risk factors including:
- Business-critical logic
- Side effects (database writes, API calls, file I/O)
- Security-sensitive operations (authentication, authorization, encryption)
- Hidden coupling (global state, singletons, event emitters)
- Complex control flow or error handling

Return a JSON object with:
{ "level": "low|medium|high", "score": 0-100, "explanation": "...", "factors": [...] }
```

### Query Prompt

Sent to Bedrock for natural language questions:

```
You are a precise code analysis assistant. Answer questions about a codebase
using ONLY the source code and metadata provided below.

User Query: {query}
Total Files in Codebase: {totalFiles}
Files Provided Below: {count} (ranked by relevance)

Relevant Files:
{For each file: path, summary, metrics, and source code content}

RULES:
1. Base your answer STRICTLY on the code and metadata provided.
2. Reference specific file paths, function/class/variable names, and logic you can see.
3. If the provided files don't contain enough information, explicitly state what's missing.
4. Do NOT invent line numbers. Reference by function/class name instead.

Return JSON:
{ "answer": "...", "references": [...], "suggestedQuestions": [...], "confidence": 0.0-1.0 }
```

**Model:** The model is configured via the `BEDROCK_MODEL_ID` environment variable in `serverless.yml`. Default is Amazon Nova Premier (`us.amazon.nova-premier-v1:0`). The Lambda handler code falls back to Nova Lite (`us.amazon.nova-lite-v1:0`) if the environment variable is not set.

---

## Extension ↔ Webview Message Protocol

### Webview → Extension Messages

| Message Type | Payload | Triggers |
|-------------|---------|----------|
| `ready` | — | Webview loaded; extension sends `init` + `cloudStatus` |
| `nodeClick` | `{ nodeId }` | Fetches AI summary (or local fallback); sends `summary` back |
| `blastRadius` | `{ nodeId }` | Runs BFS blast radius; sends `highlight` back |
| `query` | `{ query }` | Runs AI query; sends `queryResult` back |
| `openFile` | `{ path }` | Opens the file in the VS Code editor |
| `refresh` | — | Rescans workspace; sends updated `init` |
| `requestRisk` | `{ nodeId }` | Computes structural + AI risk; sends `risk` back |

### Extension → Webview Messages

| Message Type | Payload | Purpose |
|-------------|---------|---------|
| `init` / `update` | `{ graph }` | Full graph data (nodes, edges, metrics) |
| `summary` | `{ nodeId, summary, cached, loading, localFallback }` | File summary result |
| `risk` | `{ nodeId, risk, isAiRisk, cached }` | Risk assessment result |
| `highlight` | `{ nodeIds, blastRadius }` | Blast radius highlight set |
| `queryResult` | `{ result }` | AI query response |
| `cloudStatus` | `{ status }` | Cloud connectivity state: `connected` or `disconnected` (UI also supports `rate-limited` display) |
| `error` | `{ message }` | Error notification |

---

## VS Code Commands

| Command | ID | Description |
|---------|----|-------------|
| **Scan Workspace** | `codechronicle.scanWorkspace` | Scans all workspace files, parses dependencies, builds the graph, and computes metrics |
| **Open Graph View** | `codechronicle.showGraph` | Opens the main interactive dependency graph in a webview panel |
| **Ask AI About Codebase** | `codechronicle.askAI` | Opens an input box for natural language questions (routes through graph panel if open) |
| **Predict Blast Radius** | `codechronicle.predictBlastRadius` | Computes and visualizes the blast radius for the currently active editor file |
| **Refresh Analysis** | `codechronicle.refreshAnalysis` | Triggers a full workspace rescan and graph rebuild |

**Context menu:** Right-click any file or folder in the Explorer → "CodeChronicle: Open Graph View"

---

## Extension Configuration

All settings are under the `codechronicle` namespace in VS Code settings.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `codechronicle.excludePatterns` | `string[]` | `["**/node_modules/**", "**/dist/**", "**/.git/**", "**/vendor/**", "**/__pycache__/**", "**/build/**", "**/target/**", "**/.next/**", "**/coverage/**"]` | Glob patterns for files/directories to exclude from analysis |
| `codechronicle.awsApiEndpoint` | `string` | `""` | AWS API Gateway endpoint URL for cloud AI features |
| `codechronicle.awsRegion` | `string` | `"us-east-1"` | AWS region for cloud services |
| `codechronicle.enableCloudAI` | `boolean` | `true` | Enable cloud AI features (summaries, risk, Q&A). Set to `false` for fully offline local-only mode |
| `codechronicle.maxFiles` | `number` | `10000` | Maximum number of files to analyze |
| `codechronicle.supportedExtensions` | `string[]` | 37 extensions (see below) | File extensions to include in the analysis |

<details>
<summary><strong>Default Supported Extensions (37)</strong></summary>

`.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs`, `.py`, `.pyw`, `.java`, `.c`, `.cpp`, `.cc`, `.cxx`, `.h`, `.hpp`, `.hxx`, `.cs`, `.go`, `.rb`, `.php`, `.rs`, `.swift`, `.kt`, `.kts`, `.scala`, `.r`, `.R`, `.lua`, `.dart`, `.vue`, `.svelte`, `.css`, `.scss`, `.sass`, `.less`, `.html`, `.htm`

</details>

---

## Supported Languages

| Language | Extensions | Import Detection Patterns |
|----------|-----------|--------------------------|
| **JavaScript** | `.js`, `.jsx`, `.mjs`, `.cjs` | `import ... from '...'`, `require('...')`, dynamic `import('...')`, `export ... from '...'` |
| **TypeScript** | `.ts`, `.tsx` | Same as JavaScript |
| **Python** | `.py`, `.pyw` | `import module`, `from module import ...` |
| **Java** | `.java` | `import package.Class;` |
| **C / C++** | `.c`, `.cpp`, `.cc`, `.cxx`, `.h`, `.hpp`, `.hxx` | `#include "..."`, `#include <...>` |
| **C#** | `.cs` | `using Namespace;` |
| **Go** | `.go` | `import "package"`, `import (...)` |
| **Ruby** | `.rb` | `require '...'`, `require_relative '...'`, `load '...'` |
| **PHP** | `.php` | `use Namespace`, `require`, `include` |
| **Rust** | `.rs` | `use crate::...`, `mod ...`, `extern crate` |
| **Swift** | `.swift` | `import Module` |
| **Kotlin** | `.kt`, `.kts` | `import package.Class` |
| **Scala** | `.scala` | `import package.Class` |
| **R** | `.r`, `.R` | `library()`, `require()`, `source()` |
| **Lua** | `.lua` | `require('...')`, `dofile('...')` |
| **Dart** | `.dart` | `import '...'`, `export '...'`, `part '...'` |
| **Vue** | `.vue` | `import` statements in `<script>` |
| **Svelte** | `.svelte` | `import` statements in `<script>` |
| **CSS / SCSS / SASS / LESS** | `.css`, `.scss`, `.sass`, `.less` | `@import`, `@use`, `@forward` |
| **HTML** | `.html`, `.htm` | `<script src="...">`, `<link href="...">`, `<img src="...">` |

---

## Tech Stack

### Extension (Local)

| Technology | Purpose |
|-----------|---------|
| **VS Code Extension API** | Extension host, commands, file system access, webview panels |
| **React 18** | Webview UI component framework |
| **Cytoscape.js** + **cose-bilkent** | Interactive graph visualization with force-directed layout |
| **Zustand** | Lightweight state management for the webview |
| **Framer Motion** | Tab transitions and UI animations |
| **Tailwind CSS 3** | Utility-first CSS framework for the glassmorphism design system |
| **Webpack 5** | Bundling for both extension (Node.js) and webview (browser) |
| **Babel** | JSX/ES2023 transpilation |
| **glob** | File pattern matching for workspace scanning |
| **ignore** | .gitignore pattern parsing |

### Backend (AWS)

| Technology | Purpose |
|-----------|---------|
| **Serverless Framework v3** | Infrastructure-as-code deployment |
| **Node.js 20.x** | Lambda runtime |
| **@aws-sdk/client-bedrock-runtime** | Bedrock AI model invocation |
| **@aws-sdk/client-dynamodb** | DynamoDB low-level operations |
| **@aws-sdk/lib-dynamodb** | DynamoDB document client (high-level) |

---

## Project Structure

```
CodeChronicle/
│
├── README.md                          # This file
├── design.md                          # Architecture and data model design document
├── requirements.md                    # Requirements and acceptance criteria
│
├── .vscode/
│   ├── launch.json                    # F5 extension debugging config
│   ├── tasks.json                     # Build tasks (dev watch + production)
│   └── settings.json                  # Editor settings
│
├── wireframes/
│   ├── README.md                      # Wireframe guide and design tokens
│   ├── 01-main-graph-view.html        # Graph view wireframe
│   ├── 02-blast-radius-mode.html      # Blast radius wireframe
│   └── 03-query-interface.html        # Query interface wireframe
│
├── extension/                         # VS Code Extension
│   ├── package.json                   # Extension manifest, commands, configuration
│   ├── README.md                      # Marketplace extension page
│   ├── CHANGELOG.md                   # Version history and release notes
│   ├── LICENSE                        # MIT License
│   ├── .vscodeignore                  # Files excluded from VSIX package
│   ├── webpack.config.js              # Dual-target webpack (extension + webview)
│   ├── tailwind.config.js             # Tailwind CSS configuration
│   ├── postcss.config.js              # PostCSS pipeline
│   │
│   ├── assets/
│   │   └── icon.png                   # Extension icon (marketplace + toolbar)
│   │
│   └── src/
│       ├── extension.js               # Main entry: activation, commands, lifecycle
│       │
│       ├── analyzer/
│       │   ├── scanner.js             # Workspace file discovery
│       │   └── dependencyParser.js    # Multi-language regex import parser
│       │
│       ├── graph/
│       │   ├── graphBuilder.js        # Directed graph construction
│       │   ├── metricsEngine.js       # Centrality, risk, LOC computation
│       │   └── blastRadius.js         # BFS-based impact analysis
│       │
│       ├── ai/
│       │   └── apiClient.js           # AWS API Gateway HTTP client
│       │
│       ├── utils/
│       │   ├── cacheManager.js        # Local JSON cache persistence
│       │   └── fileWatcher.js         # Incremental file system monitoring
│       │
│       └── webview/
│           ├── index.jsx              # Webview entry point (acquireVsCodeApi)
│           ├── App.jsx                # Root component: tabs, layout, message handling
│           ├── index.css              # Design system: glassmorphism, neon, Tailwind
│           ├── WebviewProvider.js      # VS Code WebviewViewProvider
│           │
│           ├── store/
│           │   └── useStore.js        # Zustand store: graph, UI, query, toast state
│           │
│           └── components/
│               ├── GraphDashboard.jsx  # Cytoscape.js graph + controls + legend
│               ├── GraphSearchBar.jsx  # Real-time node search with highlighting
│               ├── FileDetailsPanel.jsx # Selected file: metrics, summary, risk
│               ├── BlastRadiusView.jsx # Impact analysis visualization
│               ├── QueryPanel.jsx     # Natural language Q&A interface
│               ├── RiskPanel.jsx      # Codebase health dashboard
│               ├── Toolbar.jsx        # Top bar: logo, status badge, refresh
│               ├── StatusBar.jsx      # Bottom bar: status, stats, cloud indicator
│               └── ToastContainer.jsx # Notification toast stack
│
└── backend/                           # AWS Cloud Backend
    ├── package.json                   # Backend dependencies
    ├── serverless.yml                 # Serverless Framework IaC
    │
    └── lambda/
        ├── aiHandler.js               # /ai/explain + /ai/query Lambda handlers
        ├── riskEngine.js              # /ai/risk-score Lambda handler
        └── cacheService.js            # /cache GET + POST Lambda handlers
```

---

## Quick Start

### Install from VS Code Marketplace

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for **"CodeChronicle"**
4. Click **Install**
5. Open the Command Palette (`Ctrl+Shift+P`) and run **CodeChronicle: Show Graph**
6. Click **Scan Workspace** to analyze your project

Cloud AI features (summaries, risk scoring, natural language Q&A) work out of the box — no configuration needed.

### Build from Source

#### Prerequisites

- **Node.js** 20+ and npm
- **VS Code** 1.85+

#### Steps

```bash
cd extension
npm install
npm run build
```

Press **F5** in VS Code to launch the Extension Development Host with the extension loaded.

```bash
# Development mode with hot-reload watching
npm run dev
```

---

## AWS Backend Deployment

The extension works fully offline with local structural analysis. To enable cloud AI features:

### Prerequisites

1. **AWS Account** with Amazon Bedrock access enabled in your region
2. **Amazon Nova model access** — Request access to `Amazon Nova Premier` and `Amazon Nova Lite` in the Bedrock console
3. **AWS CLI** configured with credentials (`aws configure`)
4. **Node.js 20+**
5. **Serverless Framework** v3 (`npm install -g serverless`)

### Deploy

```bash
cd backend
npm install
npx serverless deploy --stage dev --region us-east-1
```

After deployment, the CLI outputs the API Gateway endpoint URL. Copy it.

### Configure the Extension (Self-Hosted Backend Only)

If you deploy your own backend, update VS Code Settings (`Ctrl+,`) and search for "CodeChronicle":

| Setting | Value |
|---------|-------|
| `codechronicle.awsApiEndpoint` | Your API Gateway URL (e.g., `https://abc123.execute-api.us-east-1.amazonaws.com`) |
| `codechronicle.enableCloudAI` | `true` |
| `codechronicle.awsRegion` | Your deployment region (e.g., `us-east-1`) |

> **Note:** The default installation connects to the hosted backend automatically. You only need to configure these settings if you deploy your own backend.

### Deployed Resources

| Resource | Name | Cost Model |
|----------|------|------------|
| API Gateway (HTTP API) | Auto-generated | Pay per request |
| Lambda × 5 | `aiExplain`, `aiRiskScore`, `aiQuery`, `cacheGet`, `cachePut` | Pay per invocation |
| DynamoDB × 2 | `codechronicle-backend-summaries-dev`, `codechronicle-backend-risks-dev` | Pay per request (on-demand) |
| CloudWatch Logs | Auto-generated | Pay per GB ingested |
| Bedrock | Nova Premier / Nova Lite | Pay per input/output token |

### Tear Down

```bash
cd backend
npx serverless remove --stage dev --region us-east-1
```

---

## Development

### Extension Development

```bash
cd extension

# Install dependencies
npm install

# Start development build with file watching
npm run dev
```

Press **F5** in VS Code to launch the Extension Development Host with the extension loaded.

### Backend Development

```bash
cd backend

# Install dependencies
npm install

# Deploy to dev stage
npx serverless deploy --stage dev --region us-east-1

# Deploy to staging
npm run deploy:stage

# View logs for a specific function
npx serverless logs -f aiExplain --stage dev

# Invoke a function locally (requires Docker for SAM-like local invoke)
npx serverless invoke local -f cacheGet --data '{"pathParameters":{"hash":"test"}}'
```

### Webpack Configuration

The extension uses a dual-target Webpack configuration:

| Target | Entry | Output | Environment |
|--------|-------|--------|-------------|
| Extension | `src/extension.js` | `dist/extension.js` | Node.js (CommonJS) |
| Webview | `src/webview/index.jsx` | `dist/webview/webview.js` + `webview.css` | Browser |

---

## Packaging and Distribution

### Build a VSIX Package

```bash
cd extension

# Install the VS Code Extension CLI
npm install -g @vscode/vsce

# Build and package
npm run build
vsce package
```

This produces a `.vsix` file that can be:
- Installed manually via `Extensions: Install from VSIX...` in VS Code
- Published to the VS Code Marketplace via `vsce publish`

---

## Security

| Aspect | Implementation |
|--------|----------------|
| **No secrets in extension** | API keys and credentials are never stored in the extension bundle |
| **HTTPS only** | All cloud communication goes through API Gateway HTTPS endpoints |
| **Lambda proxy** | The extension never calls Bedrock directly; Lambda acts as a secure proxy |
| **IAM least privilege** | Lambda execution role has only the minimum required permissions |
| **No authentication on API** | The HTTP API is currently public (suitable for personal/dev use) |
| **Content-addressable cache** | DynamoDB keys are content hashes, preventing stale data serving |
| **TTL expiration** | Cached data automatically expires after 7 days |
| **CORS enabled** | API Gateway has CORS configured for webview access |
| **Production minification** | Webpack production build minifies extension and webview code |

---

## Error Handling and Resilience

CodeChronicle is designed to degrade gracefully when cloud services are unavailable:

| Scenario | Behavior |
|----------|----------|
| **Cloud AI disabled** | All local features work normally (graph, metrics, blast radius, structural risk). AI summaries fall back to heuristic descriptions |
| **API Gateway unreachable** | Extension detects and shows "Offline" cloud status. Local features remain available |
| **Bedrock rate limited** | Extension API client retries with exponential backoff (up to 2 retries). Shows cached results if available, or falls back to structural data |
| **Lambda timeout** | 60-second timeout for AI functions. Extension shows error toast and falls back to structural data |
| **DynamoDB throttled** | On-demand billing minimizes this. Lambda uses try/catch and continues without caching |
| **File parse error** | Logs the error, skips the file, continues processing all remaining files |
| **Invalid AI response** | Lambda validates and normalizes responses (clamps scores, sets default levels). Falls back to structural metrics |
| **Network loss** | Extension continues with deterministic features. Circuit-breaker opens after 2 consecutive failures and auto-resets after 5 minutes |

---

## Design System and UI

CodeChronicle uses a **dark glassmorphism design system** with neon accents, built on Tailwind CSS.

### Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| `--neon-cyan` | `#22d3ee` | Primary accent, graph highlights |
| `--neon-purple` | `#a78bfa` | Secondary accent, dependent edges |
| `--neon-pink` | `#f472b6` | Tertiary accent, CSS file nodes |
| `--neon-green` | `#4ade80` | Success states, low risk |
| `--neon-blue` | `#60a5fa` | Info states, JS file nodes |
| `--risk-low` | Green | Low risk badge/border |
| `--risk-medium` | Yellow/Amber | Medium risk badge/border |
| `--risk-high` | Red | High risk badge/border |
| `--bg-glass` | Semi-transparent dark | Glass card backgrounds |
| `--border-glass` | Semi-transparent white | Glass card borders |

### Component Classes

| Class | Description |
|-------|-------------|
| `.glass-card` | Large glassmorphism container with backdrop blur |
| `.glass-card-sm` | Compact glass card variant |
| `.btn-neon` | Cyan neon-glow button |
| `.btn-neon-purple` | Purple neon-glow button |
| `.btn-neon-green` | Green neon-glow button |
| `.tab-button` | Tab navigation button with active state |
| `.risk-badge` | Colored badge for risk levels |
| `.metric-pill` | Small metric display chip |
| `.input-glass` | Glass-styled text input |
| `.skeleton` | Loading skeleton animation |

### Typography

| Font | Usage |
|------|-------|
| **Inter** | UI text, labels, descriptions |
| **JetBrains Mono** | Code snippets, file paths, metrics |

### Responsive Layout

The UI adapts to viewport sizes from 13" laptops to large monitors. Sidebars, modals, grids, and controls scale via CSS media queries and flexible layouts so content stays readable without horizontal overflow.

---

## License

MIT

---

<p align="center">
  Built with deterministic analysis and AI reasoning.<br/>
  <strong>CodeChronicle</strong> — Understand your code before you change it.<br/><br/>
  <a href="https://marketplace.visualstudio.com/items?itemName=AnujKamalJain.codechronicle">Install from VS Code Marketplace</a>
</p>
