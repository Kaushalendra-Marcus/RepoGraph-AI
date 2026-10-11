# 01 — Overall Architecture

## File tree (src/)

```
src/
├── extension.ts                        # Activation, registers RepoGraphPanel as WebviewViewProvider
├── panel/
│   ├── RepoGraphPanel.ts               # Thin message router — 100 lines, no business logic
│   ├── webviewContent.ts               # Single-file HTML/CSS/JS (~1600 lines) — the entire UI
│   ├── handlers/
│   │   ├── PanelState.ts               # Shared mutable state bag passed to all handlers
│   │   ├── SettingsHandler.ts          # saveProvider(), loadSavedSettings()
│   │   ├── HistoryHandler.ts           # saveRecord(), load(), delete(), restore()
│   │   ├── AnalysisHandler.ts          # analyzeLocal() — orchestrates 5-step pipeline
│   │   ├── AIToolsHandler.ts           # generateDoc(), analyzeRefactor(), reviewPR(), saveDoc(), generateCustomFlow()
│   │   ├── FileHandler.ts              # openFile(), askQuestion() → delegates to QAAgent
│   │   └── FlowHandler.ts              # (reserved — currently unused, generateCustomFlow lives in AIToolsHandler)
│   └── webview/                        # (build artifacts — not used at runtime, webviewContent.ts is the source)
│       ├── styles.css
│       ├── scripts/
│       │   ├── graph.js
│       │   ├── flow.js
│       │   ├── messaging.js
│       │   └── ui.js
│       └── tabs/
│           └── *.html
├── agents/
│   ├── index.ts                        # Re-exports for backward compat (summarizeRepo, summarizeFiles, QAAgent)
│   ├── RepoSummaryAgent.ts             # summarizeRepo() → RepoSummary
│   ├── FileSummaryAgent.ts             # summarizeFiles() → FileSummary[]
│   ├── QAAgent.ts                      # class QAAgent — stateful multi-turn chat
│   └── FlowDiagramAgent.ts             # autoDetectFlows(), generateCustomFlow(), normalizeMermaid()
├── analyzer/
│   ├── WorkspaceScanner.ts             # scanWorkspace() → WorkspaceInfo
│   ├── GraphBuilder.ts                 # buildDependencyGraph() → DependencyGraph
│   └── FlowAnalyzer.ts                 # analyzeFlows() → FlowContext (static analysis)
├── generators/
│   └── DocGenerator.ts                 # generateReadme(), generateArchitecture(), generateOnboarding(), analyzeRefactor(), reviewPR()
└── providers/
    ├── types.ts                        # AIProvider interface
    ├── index.ts                        # createProvider() factory
    ├── GroqProvider.ts
    ├── GeminiProvider.ts
    ├── AnthropicProvider.ts
    ├── OpenAIProvider.ts
    └── OllamaProvider.ts
```

---

## Data flow — one full analysis

```
User clicks "Analyze"
  → webview posts { type: 'analyzeLocal' }
  → RepoGraphPanel.resolveWebviewView → msg switch → analysis.analyzeLocal()
  → AnalysisHandler.analyzeLocal()
      Step 1: scanWorkspace()            → wsInfo            → post progress(1)
      Step 2: buildDependencyGraph()     → graph             → post graphReady
      Step 3: summarizeRepo()            → summary           → post summaryReady
      Step 4: summarizeFiles()           → fileSummaries     → post fileSummariesReady
      Step 5: analyzeFlows()             → flowCtx
              autoDetectFlows()          → flowMap           → post flowMapReady
      post analysisComplete
      history.saveRecord(record)
      post historyLoaded
```

---

## Message protocol (webview ↔ extension)

### Extension → Webview (post to webview)

| type | payload | When |
|------|---------|------|
| `workspaceStatus` | `{ hasWorkspace, name }` | On settings load |
| `settingsLoaded` | `{ providerName, model, baseUrl, hasKey }` | On settings load |
| `providerSaved` | `{ name, success }` | After saveProvider |
| `progress` | `{ step: 1-5, message }` | During analysis |
| `graphReady` | `{ nodes, edges }` | Step 2 done |
| `summaryReady` | `RepoSummary` | Step 3 done |
| `fileSummariesReady` | `FileSummary[]` | Step 4 done |
| `flowMapReady` | `FullFlowMap` | Step 5 done |
| `analysisComplete` | `{ repoName }` | All steps done |
| `analysisRestored` | `{ repoName, graph, summary, fileSummaries, flowMap, hasQA }` | History load |
| `historyLoaded` | `{ records: RecordMeta[] }` | After save/delete/restore |
| `layoutLoaded` | `{ positions: [{id,x,y}] }` | Graph positions restored |
| `answer` | `{ answer: string }` | QA response |
| `customFlowReady` | `{ diagram: FlowSubDiagram }` | Custom flow done |
| `customFlowBusy` | `{ busy: boolean }` | Flow generation in progress |
| `aiToolBusy` | `{ docType, busy }` | Doc generation in progress |
| `aiToolError` | `{ message }` | Any AI tool error |
| `docSaved` | `{ docType?, filename }` | Doc saved to workspace |
| `refactorResult` | `{ content }` | Refactor analysis done |
| `prReviewResult` | `{ content }` | PR review done |
| `tokenUsage` | `{ total }` | After any token usage |
| `error` | `{ message }` | Any fatal error |

### Webview → Extension (vscode.postMessage)

| type | payload | Handler |
|------|---------|---------|
| `getSettings` | — | SettingsHandler.loadSavedSettings |
| `saveProvider` | `ProviderSettings` | SettingsHandler.saveProvider |
| `analyzeLocal` | — | AnalysisHandler.analyzeLocal |
| `saveLayout` | `{ positions }` | AnalysisHandler.saveLayout |
| `loadAnalysis` | `{ id }` | HistoryHandler.load |
| `deleteAnalysis` | `{ id }` | HistoryHandler.delete |
| `generateDoc` | `{ docType }` | AIToolsHandler.generateDoc |
| `analyzeRefactor` | — | AIToolsHandler.analyzeRefactor |
| `reviewPR` | `{ diff }` | AIToolsHandler.reviewPR |
| `saveDoc` | `{ filename, content }` | AIToolsHandler.saveDoc |
| `generateCustomFlow` | `{ question }` | AIToolsHandler.generateCustomFlow |
| `openFile` | `{ path }` | FileHandler.openFile |
| `askQuestion` | `{ question }` | FileHandler.askQuestion |
| `clearChat` | — | state.qaAgent.clearHistory() |
| `debug` | any | Logged to output channel |

---

## PanelState fields

```typescript
class PanelState {
  provider?: AIProvider;              // Current AI provider instance
  qaAgent?: QAAgent;                  // Stateful Q&A agent (reset on new analysis)
  workspaceInfo?: WorkspaceInfo;      // Scanned files, root path, repo name
  currentGraph?: DependencyGraph;     // { nodes, edges }
  currentSummary?: RepoSummary;       // AI-generated repo summary
  currentFileSummaries?: FileSummary[];// Per-file AI summaries
  currentFlowMap?: FullFlowMap;       // { subDiagrams, overviewMermaid }
  currentFlowContext?: FlowContext;   // Static analysis result (routes, chains, db, events)
  totalTokensUsed = 0;               // Running total (estimated)
}
```

---

## Key invariants

1. **`webviewContent.ts` is the single source of truth.** The `webview/` subdirectory has separate files but they are NOT wired at runtime — VS Code requires a single HTML string. Do not try to import from `webview/scripts/` at runtime.
2. **`RepoGraphPanel.ts` contains zero business logic.** It only routes messages to handlers.
3. **Every Mermaid string MUST pass through `normalizeMermaid()` before storage or sending.** This fixes AI output issues.
4. **`PanelState` is the only place state lives.** Never cache data inside handlers.
5. **`HistoryHandler.saveRecord()` truncates to 20 records.** Graph edges are sliced to 500 for storage.
