# 04 — Summary Tab

## What it shows
- AI-generated repo overview, architecture description, tech stack, key modules, entry points
- Per-file AI summaries with purpose and exports — clickable to open file

---

## Backend — RepoSummaryAgent.ts

**Entry:** `summarizeRepo(provider, wsInfo, graph): Promise<RepoSummary>`

**Prompt strategy:** Sends top 30 files by inDegree + all entry points + full file tree to AI. Asks for structured JSON.

**Output shape:**
```typescript
interface RepoSummary {
  overview: string;       // 2-3 sentence project description
  architecture: string;   // How the code is organized
  purpose: string;        // Single line
  techStack: string[];    // ["TypeScript", "Express", "Prisma", ...]
  keyModules: { name: string; description: string }[];
  entryPoints: string[];  // File paths
}
```

---

## Backend — FileSummaryAgent.ts

**Entry:** `summarizeFiles(provider, nodes, files, onProgress): Promise<FileSummary[]>`

**Which files get summarized:**
- Top 20 nodes by `(inDegree + outDegree)` — the most connected files
- Entry points
- Total capped at ~25 files to manage token usage

**Output shape:**
```typescript
interface FileSummary {
  path: string;
  purpose: string;       // What this file does
  exports: string;       // Main exports as a short string
  keyFunctions?: string[]; // Top function/class names
}
```

**Used by:**
- Summary tab (`showFileSummaries()`)
- Node detail panel in Graph tab (`fileSummaryMap[node.path]`)
- FlowDiagramAgent (to identify relevant files for flow questions)
- AIToolsHandler (for doc generation context)

---

## Webview — Summary tab

### HTML structure
```
#tab-summary
  #summary-empty    — shown before analysis
  #summary-ready    — scrollable content
    .section-hdr "Overview"
    #s-name / #s-overview
    .section-hdr "Architecture"
    #s-arch
    .section-hdr "Tech Stack"
    #s-tech          — .chip spans
    .section-hdr "Key Modules"
    #s-modules       — .card per module
    .section-hdr "Entry Points"
    #s-entries       — clickable file paths
    .section-hdr "File Summaries (N)"
    #s-files         — .file-card per file
```

### Key functions
```javascript
showSummary(s, name)      // Called on summaryReady + analysisRestored
showFileSummaries(files)  // Called on fileSummariesReady + analysisRestored
```

`showFileSummaries()` also populates `fileSummaryMap` — a global that the graph's node detail panel reads from.

### File card behavior
Each `.file-card` has `data-fpath` attribute. Click → `openFileHandler(path)` → extension opens the file.

### Entry points
Each entry point path is rendered as a clickable div. Click → `openFileHandler(path)`.

---

## Message flow
| Message | Function called |
|---------|----------------|
| `summaryReady` | `_summary = payload` — stored but NOT rendered yet (waits for `analysisComplete`) |
| `fileSummariesReady` | `showFileSummaries(payload)` — immediately renders file cards |
| `analysisComplete` | `showSummary(_summary, _repoName)` — renders the summary section |
| `analysisRestored` | `_summary = payload.summary; showSummary(...); showFileSummaries(...)` |

> **Why `summaryReady` doesn't immediately render:** The summary section shows `repoName` in the header, and `_repoName` isn't set until `analysisComplete`. So summary display is deferred.

---

## CSS classes
| Class | Usage |
|-------|-------|
| `.section-hdr` | uppercase section labels |
| `.chip` | inline pill for tech stack items |
| `.file-card` | clickable file summary card |
| `.file-card-path` | monospace blue file path |
| `.file-card-desc` | description text |
