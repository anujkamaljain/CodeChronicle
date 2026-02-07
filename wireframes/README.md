# CodeChronicle Wireframes & Mockups

This directory contains interactive HTML wireframes/mockups for the CodeChronicle VS Code extension.

## Overview

CodeChronicle is a VS Code extension that combines deterministic static analysis with AWS cloud-powered AI reasoning to help developers understand and safely modify legacy codebases.

## Wireframe Files

### 1. Main Graph View (`01-main-graph-view.html`)
**Primary interface showing the code dependency graph**

Features:
- Interactive graph visualization with nodes (files) and edges (dependencies)
- Visual encoding: node size = complexity, node color = risk level
- Left sidebar: VS Code file explorer
- Right sidebar: Detailed file information panel
- Top toolbar: Refresh, save, settings controls
- Graph controls: Zoom, fit view, blast radius mode
- Legend showing risk levels (low/medium/high)
- Real-time cloud connection status
- File metrics: LOC, dependencies, dependents, centrality score
- AI-generated summary with cache indicator
- Risk factors breakdown
- Action buttons: Open file, show blast radius, refresh analysis

### 2. Blast Radius Mode (`02-blast-radius-mode.html`)
**Specialized view for impact analysis**

Features:
- Purple banner indicating active blast radius mode
- Selected file highlighted in purple with pulsing animation
- Affected files shown in orange
- Unaffected files dimmed for focus
- Blast radius statistics panel:
  - Direct dependents count
  - Indirect dependents count
  - Total impact calculation
- Right sidebar with two sections:
  - Direct dependents list (files that import the selected file)
  - Indirect dependents list (files affected through the chain)
- Each dependent shows its path and risk level
- Export impact report functionality
- Easy exit from blast radius mode

### 3. Query Interface (`03-query-interface.html`)
**Natural language Q&A about the codebase**

Features:
- Large query input textarea for natural language questions
- Example queries for quick start
- AI-powered answers with confidence scores
- Structured response format:
  - Clear textual answer
  - Referenced files with line numbers
  - Code snippets where applicable
  - Suggested follow-up questions
- Right sidebar: Query history
- File reference cards showing:
  - File path and risk level
  - Brief description
  - Specific line numbers
  - Quick open button
- AWS Bedrock branding
- Cache indicators for performance

## Design System

### Color Palette
- **Background**: Gray-900 (#111827)
- **Surface**: Gray-800 (#1f2937)
- **Border**: Gray-700 (#374151)
- **Text Primary**: White (#ffffff)
- **Text Secondary**: Gray-400 (#9ca3af)
- **Low Risk**: Green-500 (#10b981)
- **Medium Risk**: Orange-500 (#f59e0b)
- **High Risk**: Red-500 (#ef4444)
- **Primary Action**: Blue-600 (#2563eb)
- **Secondary Action**: Purple-600 (#9333ea)

### Typography
- **Font Family**: Segoe UI, Tahoma, Geneva, Verdana, sans-serif
- **Headings**: Bold, 1.25rem - 2rem
- **Body**: Regular, 0.875rem - 1rem
- **Labels**: 0.75rem, uppercase, gray-400

### Components
- **Buttons**: Rounded corners, hover states, semantic colors
- **Cards**: Gray-800 background, rounded-lg, padding
- **Inputs**: Gray-900 background, border-gray-700, focus:border-blue-500
- **Toggles**: Custom switch design with peer states
- **Badges**: Small, rounded, semantic colors

## Technology Stack

### Frontend
- **Framework**: React.js (for component-based UI)
- **Styling**: TailwindCSS (utility-first CSS)
- **Graph Library**: Cytoscape.js or vis.js (for graph rendering)
- **Icons**: Unicode emoji (for simplicity in mockups)

### Backend
- **Platform**: AWS Cloud
- **API**: API Gateway + Lambda
- **AI**: AWS Bedrock (Foundation Models)
- **Storage**: DynamoDB, S3, Neptune
- **Monitoring**: CloudWatch

## Key User Flows

### 1. Initial Setup
1. Install extension from our website
2. SignIn or SignUp
3. Set analysis preferences

### 2. Analyzing a Codebase
1. Open workspace in VS Code
2. Extension auto-scans files
3. Graph builds incrementally
4. AI analysis runs in background
5. Results cached in DynamoDB

### 3. Understanding a File
1. Click node in graph
2. View file details in sidebar
3. Read AI summary
4. Check risk factors
5. Review metrics
6. Open file in editor

### 4. Impact Analysis
1. Select file in graph
2. Click "Blast Radius" button
3. View affected files
4. Analyze direct/indirect dependents
5. Export report if needed
6. Exit blast radius mode

### 5. Querying the Codebase
1. Switch to Query tab
2. Type natural language question
3. Submit query to AWS Bedrock
4. Review answer and references
5. Click file references to open
6. Ask follow-up questions

## Responsive Breakpoints

- **Desktop**: > 1024px (full layout with sidebars)
- **Tablet**: 768px - 1024px (collapsible sidebars)
- **Mobile**: < 768px (stacked layout, bottom nav)

## Accessibility Features

- Semantic HTML structure
- ARIA labels for interactive elements
- Keyboard navigation support
- High contrast color scheme
- Focus indicators
- Screen reader friendly

## Performance Considerations

- Lazy loading for large graphs
- Virtual scrolling for file lists
- Debounced search inputs
- Cached AI responses
- Progressive graph rendering
- Optimized SVG rendering

## Future Enhancements

1. **Dark/Light Theme Toggle**
2. **Custom Color Schemes**
3. **Graph Export (PNG, SVG, JSON)**
4. **Collaborative Features**
5. **Historical Analysis**
6. **Integration with Git**
7. **Custom Metrics**
8. **Plugin System**

## How to View

Open any HTML file in a modern web browser:
```bash
# Example
open 01-main-graph-view.html
```

Or use a local server:
```bash
# Python
python -m http.server 8000

# Node.js
npx http-server
```

Then navigate to `http://localhost:8000/wireframes/`

## Notes

- These are static mockups using TailwindCSS CDN
- Actual implementation will use React components
- Graph visualizations are simplified SVG representations
- Real implementation will use Cytoscape.js or vis.js
- Interactive features are visual only (no JavaScript logic)
- AWS integration details are placeholder values
