# RepoGraph AI — Documentation Index

> **Claude: Read this file first before making ANY change to the codebase.**
> Then read the specific section doc for the area you are working on.

---

## What this folder is

This folder documents every working section of RepoGraph AI.
Each file covers one area of the app. Before touching code, read the relevant doc.
After making changes, update the relevant doc to reflect the new state.

---

## Docs map

| File | Covers |
|------|--------|
| [01-architecture.md](./01-architecture.md) | Overall architecture, file tree, data flow, message protocol |
| [02-graph.md](./02-graph.md) | Dependency graph — canvas engine, force layout, node detail |
| [03-flow-diagrams.md](./03-flow-diagrams.md) | Flow tab — FlowAnalyzer, FlowDiagramAgent, SVG renderer, webview |
| [04-summary.md](./04-summary.md) | Summary tab — RepoSummaryAgent, FileSummaryAgent, webview render |
| [05-qa.md](./05-qa.md) | Q&A tab — QAAgent, chat UI, context window strategy |
| [06-ai-tools.md](./06-ai-tools.md) | AI Tools tab — DocGenerator, refactor, PR review |
| [07-settings-providers.md](./07-settings-providers.md) | Settings tab, all 5 providers, secret storage |
| [08-history.md](./08-history.md) | History tab — AnalysisRecord shape, save/restore/delete |
| [09-analysis-pipeline.md](./09-analysis-pipeline.md) | Full 5-step analysis pipeline, progress flow, WorkspaceScanner |
| [10-design-ui.md](./10-design-ui.md) | CSS design system, theming, component patterns, tab structure |

---

## Quick orientation

### Entry points
- Extension activates in `src/extension.ts`
- Panel registered as `repograph.mainView` WebviewViewProvider
- All logic lives in `src/panel/RepoGraphPanel.ts` (thin router) + `src/panel/handlers/`

### Key invariants — never break these
1. `webviewContent.ts` is the single source of truth for all HTML/CSS/JS. Do not split it out further — VS Code requires one HTML string.
2. The `PanelState` object is the shared state bag between all handlers. Never duplicate state elsewhere.
3. Message types between webview and extension must always be listed in both `RepoGraphPanel.ts` (switch) and the webview `window.addEventListener('message', ...)` switch.
4. `FlowDiagramAgent.normalizeMermaid()` must be called on every Mermaid string before storing or sending to webview — it strips init directives and fixes AI mistakes.
5. All analysis records stored in workspaceState must include `flowMap?: FullFlowMap` for restore to work correctly.

---

## Current working status (as of last update)

| Feature | Status |
|---------|--------|
| Local workspace scan | ✅ Working |
| Dependency graph (canvas) | ✅ Working |
| Force-directed layout | ✅ Working |
| Node click → detail panel | ✅ Working |
| Node double-click → open file | ✅ Working |
| Persistent graph layout | ✅ Working |
| Graph search + filter | ✅ Working |
| AI repo summary | ✅ Working |
| File summaries | ✅ Working |
| Q&A chat | ✅ Working |
| History save/restore/delete | ✅ Working |
| Settings + all 5 providers | ✅ Working |
| Doc generation (3 types) | ✅ Working |
| Refactor analysis | ✅ Working |
| PR review | ✅ Working |
| Flow tab — 5-step analysis | ✅ Working |
| Flow tab — auto-detect diagrams | ✅ Working |
| Flow tab — preset buttons | ✅ Working |
| Flow tab — custom flow input | ✅ Working |
| Flow tab — SVG renderer | ✅ Working |
| Flow tab — copy Mermaid source | ✅ Working |
| Flow restore from history | ✅ Working |
| Progress bar (5 steps) | ✅ Working |
| Layer View (Layers toggle in Graph tab) | ✅ Working |
| Token usage display | ✅ Working |
