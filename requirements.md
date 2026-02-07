# Requirements Document: CodeChronicle

## Introduction

CodeChronicle is an AI-powered VS Code extension designed to help developers understand and safely modify large legacy codebases. The extension scans the local workspace, constructs a deterministic dependency graph, and layers AWS AI-driven reasoning on top to explain file responsibilities, assess risk, and predict the impact of changes before they are made. The core principle is that static analysis provides reliable structure while AI provides semantic understanding.

## Glossary

- **Extension**: The CodeChronicle VS Code extension
- **Workspace**: The currently open VS Code workspace containing source code files
- **Code_Graph**: A directed graph representation where nodes are files and edges are dependencies
- **Node**: A file in the workspace represented as a graph vertex
- **Edge**: A dependency relationship between files (imports, requires, includes)
- **Structural_Metric**: A deterministically computed metric such as dependency count, centrality, or lines of code
- **Risk_Factor**: An AI-assigned semantic risk score based on business logic, side effects, security sensitivity, and hidden coupling
- **Blast_Radius**: The set of all files that transitively depend on a given file
- **Webview**: A VS Code webview panel that renders the interactive graph visualization using React.js and TailwindCSS
- **User**: A developer using the CodeChronicle extension
- **AI_Service**: AWS Bedrock Foundation Models used for semantic analysis and natural language processing
- **Cloud_Backend**: AWS Lambda functions orchestrated via API Gateway for AI processing
- **Graph_Store**: Amazon DynamoDB for AI summaries, risk scores, and file hashes; Amazon Neptune for large-scale graph storage
- **Artifact_Store**: Amazon S3 for storing graph snapshots and analysis artifacts

## Requirements

### Requirement 1: Workspace Scanning and File Discovery

**User Story:** As a developer, I want the extension to automatically scan my workspace, so that I can analyze the codebase structure without manual configuration.

#### Acceptance Criteria

1. WHEN the Extension is activated, THE Extension SHALL scan the Workspace for all source code files
2. WHEN scanning the Workspace, THE Extension SHALL exclude files matching patterns in .gitignore
3. WHEN scanning the Workspace, THE Extension SHALL exclude common dependency directories (node_modules, vendor, .git)
4. WHEN a file is discovered, THE Extension SHALL record its path relative to the Workspace root
5. WHEN scanning completes, THE Extension SHALL notify the User of the total number of files discovered

### Requirement 2: Dependency Detection and Graph Construction

**User Story:** As a developer, I want the extension to detect file dependencies deterministically, so that I can trust the accuracy of the dependency graph.

#### Acceptance Criteria

1. WHEN parsing a source file, THE Extension SHALL extract import statements using language-specific regex patterns
2. WHEN an import statement references a local file, THE Extension SHALL create an Edge from the importing file to the imported file
3. WHEN an import statement references an external package, THE Extension SHALL exclude it from the Code_Graph
4. WHEN all files are parsed, THE Extension SHALL construct a Code_Graph with files as Nodes and dependencies as Edges
5. WHEN a file cannot be parsed, THE Extension SHALL log the error and continue processing remaining files

### Requirement 3: Structural Metrics Computation

**User Story:** As a developer, I want the extension to compute structural metrics deterministically, so that I have objective measures of code complexity.

#### Acceptance Criteria

1. WHEN a Node is created, THE Extension SHALL compute the number of incoming edges (dependents)
2. WHEN a Node is created, THE Extension SHALL compute the number of outgoing edges (dependencies)
3. WHEN a Node is created, THE Extension SHALL compute the lines of code in the file
4. WHEN the Code_Graph is complete, THE Extension SHALL compute centrality scores for all Nodes
5. WHEN Structural_Metrics are computed, THE Extension SHALL store them as Node metadata

### Requirement 4: AI-Driven Risk Assessment

**User Story:** As a developer, I want AI to assess the semantic risk of modifying files, so that I can understand hidden coupling and business-critical logic.

#### Acceptance Criteria

1. WHEN a User requests risk analysis for a Node, THE Extension SHALL send the file contents to Cloud_Backend via API Gateway
2. WHEN sending to Cloud_Backend, THE Extension SHALL include file contents, Structural_Metrics, and dependency context
3. WHEN Cloud_Backend invokes AWS Bedrock and returns analysis, THE Extension SHALL extract a Risk_Factor score (low, medium, high)
4. WHEN Cloud_Backend returns analysis, THE Extension SHALL store the risk assessment in DynamoDB with the file hash
5. WHEN Cloud_Backend fails, THE Extension SHALL fall back to Structural_Metrics only and notify the User

### Requirement 5: Interactive Graph Visualization

**User Story:** As a developer, I want to see an interactive visual representation of the codebase inside VS Code, so that I can explore dependencies intuitively.

#### Acceptance Criteria

1. WHEN a User activates the graph view, THE Extension SHALL open a Webview panel built with React.js and TailwindCSS
2. WHEN the Webview renders, THE Extension SHALL display the Code_Graph with Nodes and Edges using a JavaScript graph visualization library
3. WHEN rendering Nodes, THE Extension SHALL scale node size based on Structural_Metrics
4. WHEN rendering Nodes, THE Extension SHALL color nodes based on Risk_Factor retrieved from DynamoDB (green for low, yellow for medium, red for high)
5. WHEN a User clicks on a Node, THE Extension SHALL display file details in a side panel

### Requirement 6: AI-Powered File Summaries

**User Story:** As a developer, I want to see AI-generated explanations of what each file does, so that I can quickly understand unfamiliar code.

#### Acceptance Criteria

1. WHEN a User clicks on a Node, THE Extension SHALL request a summary from Cloud_Backend via API Gateway
2. WHEN requesting a summary, THE Extension SHALL provide file contents and Code_Graph context to Cloud_Backend
3. WHEN Cloud_Backend invokes AWS Bedrock and returns a summary, THE Extension SHALL display it in the Webview side panel
4. WHEN a summary is generated, THE Extension SHALL store it in DynamoDB with the file hash to avoid redundant API calls
5. WHEN Cloud_Backend fails, THE Extension SHALL display Structural_Metrics and raw file metadata instead

### Requirement 7: Blast Radius Visualization

**User Story:** As a developer, I want to see which files depend on a selected file, so that I can assess the impact of potential changes.

#### Acceptance Criteria

1. WHEN a User selects a Node and activates Blast_Radius mode, THE Extension SHALL compute all transitive dependents using local graph or query Amazon Neptune for large-scale graphs
2. WHEN Blast_Radius is computed, THE Extension SHALL highlight all dependent Nodes in the Webview
3. WHEN Blast_Radius is displayed, THE Extension SHALL request an impact analysis from Cloud_Backend
4. WHEN Cloud_Backend invokes AWS Bedrock and returns impact analysis, THE Extension SHALL display potential breaking changes in the side panel
5. WHEN Blast_Radius mode is deactivated, THE Extension SHALL restore the original visualization state

### Requirement 8: Natural Language Query Interface

**User Story:** As a developer, I want to ask questions about the codebase in natural language, so that I can find information without manual searching.

#### Acceptance Criteria

1. WHEN a User submits a natural language query, THE Extension SHALL send the query and Code_Graph context to Cloud_Backend via API Gateway
2. WHEN Cloud_Backend invokes AWS Bedrock and processes the query, THE Extension SHALL return file-level answers with explanations
3. WHEN answers reference specific files, THE Extension SHALL highlight those Nodes in the Webview
4. WHEN answers reference specific files, THE Extension SHALL provide clickable links to open the file in the editor
5. WHEN Cloud_Backend cannot answer the query, THE Extension SHALL suggest alternative questions or clarifications

### Requirement 9: Graph Persistence and Caching

**User Story:** As a developer, I want the extension to cache analysis results, so that I don't wait for re-analysis on every activation.

#### Acceptance Criteria

1. WHEN the Code_Graph is constructed, THE Extension SHALL upload graph snapshots to Amazon S3 for persistence
2. WHEN AI summaries are generated, THE Extension SHALL store them in DynamoDB with file content hashes as keys
3. WHEN the Extension is reactivated, THE Extension SHALL load the cached Code_Graph from S3 if available
4. WHEN a cached file's content hash changes, THE Extension SHALL invalidate cached AI analysis in DynamoDB for that file
5. WHEN the User requests a full refresh, THE Extension SHALL clear all caches in S3 and DynamoDB and rebuild the Code_Graph

### Requirement 10: Incremental Updates

**User Story:** As a developer, I want the extension to update the graph when files change, so that the visualization stays current without full rescans.

#### Acceptance Criteria

1. WHEN a file is created in the Workspace, THE Extension SHALL add a new Node to the Code_Graph
2. WHEN a file is deleted from the Workspace, THE Extension SHALL remove the corresponding Node and all connected Edges
3. WHEN a file is modified, THE Extension SHALL re-parse dependencies and update Edges
4. WHEN a file is modified, THE Extension SHALL invalidate cached AI analysis for that file
5. WHEN the Code_Graph is updated, THE Extension SHALL refresh the Webview visualization

### Requirement 11: Error Handling and Resilience

**User Story:** As a developer, I want the extension to handle errors gracefully, so that partial failures don't prevent me from using available features.

#### Acceptance Criteria

1. WHEN Cloud_Backend rate limits are exceeded, THE Extension SHALL queue requests and retry with exponential backoff
2. WHEN Cloud_Backend calls fail, THE Extension SHALL return cached results from DynamoDB if available or display a user-friendly error message
3. WHEN file parsing fails for specific files, THE Extension SHALL log the error to CloudWatch and continue processing remaining files
4. WHEN the Workspace contains more than 10,000 files, THE Extension SHALL warn the User and offer to use Amazon Neptune for large-scale graph storage
5. WHEN network connectivity is lost, THE Extension SHALL continue providing deterministic features (local graph, metrics) without cloud AI

### Requirement 12: VS Code Integration

**User Story:** As a developer, I want the extension to integrate seamlessly with VS Code, so that I can use it alongside my existing workflow.

#### Acceptance Criteria

1. THE Extension SHALL register a command "CodeChronicle: Open Graph View" in the VS Code command palette
2. WHEN a User clicks on a Node in the Webview, THE Extension SHALL provide an option to open the file in the editor
3. WHEN a User right-clicks a file in the VS Code explorer, THE Extension SHALL provide a context menu option "Show in CodeChronicle"
4. THE Extension SHALL display a status bar item showing the current analysis state (scanning, ready, error) with CloudWatch metrics integration
5. THE Extension SHALL render the Webview using React.js and TailwindCSS, respecting VS Code theme settings

### Requirement 13: Configuration and Customization

**User Story:** As a developer, I want to configure the extension's behavior, so that I can adapt it to my project's needs.

#### Acceptance Criteria

1. THE Extension SHALL provide a configuration option to specify file patterns to exclude from analysis
2. THE Extension SHALL provide a configuration option to specify AWS IAM credentials and API Gateway endpoint for Cloud_Backend
3. THE Extension SHALL provide a configuration option to enable or disable cloud AI features (local-only mode)
4. THE Extension SHALL provide a configuration option to set the maximum number of files before switching to Amazon Neptune
5. WHEN configuration changes, THE Extension SHALL prompt the User to refresh the analysis