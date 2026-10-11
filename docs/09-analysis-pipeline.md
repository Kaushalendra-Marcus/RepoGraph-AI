# 09 — Analysis Pipeline

## Overview
Five sequential steps. Each step posts a progress message to the webview. The webview updates the progress bar and step indicators.

---

## Step 1 — Scan workspace

**Code:** `WorkspaceScanner.scanWorkspace(onProgress)`

**What it does:**
- Finds all code files in the workspace, skipping `node_modules`, `.git`, `dist`, `out`, `build`, `.next`, `coverage`, `vendor`
- Reads file content
- Detects language from extension
- Returns `WorkspaceInfo`

**WorkspaceInfo shape:**
```typescript
interface WorkspaceInfo {
  name: string;        // workspace folder name
  rootPath: string;    // absolute path to workspace root
  files: WorkspaceFile[];
  isLocal: true;
}
interface WorkspaceFile {
  path: string;        // relative path from root
  absPath?: string;    // absolute path
  content: string;     // full file content
  language: string;
  size: number;
}
```

**Progress message:** step 1, fired multiple times as scanning progresses

---

## Step 2 — Build dependency graph

**Code:** `GraphBuilder.buildDependencyGraph(files)`

**What it does:**
- Parses import/require statements from each file
- Resolves relative paths to actual file paths
- Counts inDegree + outDegree for each node
- Detects exports per file

**Post:** `graphReady` with full `{ nodes, edges }` — also calls `sendSavedLayout()` immediately after

---

## Step 3 — AI repo summary

**Code:** `RepoSummaryAgent.summarizeRepo(provider, wsInfo, graph)`

**What it sends to AI:**
- File tree (all paths)
- Top 30 most-connected files with their content snippets
- Entry points detected from graph
- Graph statistics (node count, edge count)

**Post:** `summaryReady` with `RepoSummary`

---

## Step 4 — File summaries

**Code:** `FileSummaryAgent.summarizeFiles(provider, nodes, files, onProgress)`

**Selection strategy:**
- Top 20 nodes by `inDegree + outDegree`
- Plus entry points from the graph
- Deduped and capped at ~25 files

**Batching:** Files are summarized in parallel batches. `onProgress(done, total)` fires after each batch.

**Post:** `fileSummariesReady` with `FileSummary[]`

---

## Step 5 — Flow analysis

**Two sub-steps:**

### 5a — Static analysis
`FlowAnalyzer.analyzeFlows(wsInfo.files)` — runs in-process, no AI, very fast

Posts progress: `"Detected N routes, M call chains — generating diagrams..."`

### 5b — AI flow generation
`FlowDiagramAgent.autoDetectFlows(provider, wsInfo, summary, fileSummaries, flowCtx)`

Uses static analysis output to generate Mermaid diagrams.

**Post:** `flowMapReady` with `FullFlowMap`

---

## After step 5

1. QAAgent created with full context
2. `AnalysisRecord` built (graph sliced to 500 edges)
3. `history.saveRecord(record)`
4. Post `historyLoaded`
5. Post `analysisComplete`

---

## Progress bar mapping

| Step | % | Label |
|------|---|-------|
| 1 | 12 | Scanning workspace files... |
| 2 | 35 | Building dependency graph... |
| 3 | 60 | Generating AI summary... |
| 4 | 82 | Summarizing key files N/M... |
| 5 | 95 | Analyzing code flows... |
| Complete | 100 | Analysis complete! |

Step indicators in webview: `ps1` `ps2` `ps3` `ps4` `ps5`
- Previous steps: class `done` (teal)
- Current step: class `active` (blue)
- Future steps: no class (dimmed)

---

## Error handling

`AnalysisHandler.analyzeLocal()` is called inside a try-catch in `RepoGraphPanel`. Any thrown error results in:
```javascript
post({ type: 'error', payload: { message } })
```
Which shows an alert in both the Analyze tab and Settings tab, and calls `setAnalyzing(false)`.

---

## Re-running analysis

Clicking "Analyze" again while provider is configured:
- Resets all state (graph, summary, etc.)
- Previous analysis is NOT cleared from history — new record is prepended
- Graph canvas resets and re-initializes with new data
- Flow tab resets to new diagrams
- Q&A agent is replaced with new instance

---

## WorkspaceScanner — file limits

Default limits (to prevent scanning huge repos):
- Max files: configurable, typically ~500
- Skipped extensions: `.png`, `.jpg`, `.gif`, `.ico`, `.svg`, `.lock`, `.map`, binary files
- Skipped folders: `node_modules`, `.git`, `dist`, `out`, `build`, `.next`, `coverage`, `vendor`, `__pycache__`, `.venv`

If workspace has no folder open, `scanWorkspace()` returns `null` → `AnalysisHandler` throws "No workspace folder found."
