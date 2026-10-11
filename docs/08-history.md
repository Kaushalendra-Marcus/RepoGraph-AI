# 08 — History Tab

## What it does
Automatically saves every completed analysis. Up to 20 records stored per workspace. Users can restore or delete records.

---

## HistoryHandler.ts

### `AnalysisRecord` shape
```typescript
interface AnalysisRecord {
  id: string;          // timestamp as string e.g. "1718000000000"
  label: string;       // "RepoName — 10 Jun, 02:00 PM"
  timestamp: number;   // Date.now() at save time
  repoName: string;    // workspace folder name
  graph: DependencyGraph;    // nodes + edges (edges sliced to 500)
  summary: RepoSummary;      // full AI summary
  fileSummaries: FileSummary[]; // per-file summaries
  flowMap?: FullFlowMap;     // flow diagrams (optional — older records may not have it)
}
```

### `RecordMeta` — what gets sent to webview
```typescript
type RecordMeta = Pick<AnalysisRecord, "id" | "label" | "timestamp" | "repoName">;
```
Full records are heavy (graph + summaries). Webview only gets metadata. Full record loaded on restore.

### Key methods

**`saveRecord(record)`**
- Prepends to existing records
- Trims to 20 records
- Saves to `workspaceState["repograph.history"]`

**`restore()`** — called on panel init
- Loads history, posts `historyLoaded` with metadata list
- Populates `state.currentGraph`, `state.currentSummary`, `state.currentFileSummaries`, `state.currentFlowMap` from latest record
- Creates QAAgent if provider is available

**`load(payload: { id })`** — called when user clicks Restore
- Finds record by id
- Populates full state from record
- Posts `analysisRestored` with full data + `hasQA` flag
- Posts `layoutLoaded` with saved graph positions (if any)

**`delete(payload: { id })`**
- Filters out the record
- Saves updated list
- Posts `historyLoaded` with updated metadata

**`listMeta()`**
- Returns array of RecordMeta from all stored records

**`getAll()`**
- Returns raw `AnalysisRecord[]` from workspaceState

---

## Webview — History tab

### HTML structure
```
#tab-history
  #history-empty    — shown if no records
  #history-ready    — shown if records exist
    [description text]
    #history-list   — .card rows
```

### `showHistory(records)`
Renders each record as a card row with:
- Label (repo name + date)
- Repo name
- Restore button → sends `{ type: 'loadAnalysis', payload: { id } }`
- Delete button (✕) → confirms, then sends `{ type: 'deleteAnalysis', payload: { id } }`

### Message handling
| Message | Action |
|---------|--------|
| `historyLoaded` | `showHistory(payload.records)` |

`historyLoaded` is sent in 4 situations:
1. Panel init (from `HistoryHandler.restore()`)
2. After analysis complete (from `AnalysisHandler`)
3. After `load()` — wait no, load posts `analysisRestored`, not `historyLoaded`
4. After `delete()`

---

## CSS classes
| Class | Usage |
|-------|-------|
| `.history-row` | flex row with meta + actions |
| `.history-meta` | flex:1, min-width:0 |
| `.history-actions` | restore + delete buttons |

---

## What to be careful about

- `flowMap` is optional in `AnalysisRecord` — always use `record.flowMap?` (optional chaining) when accessing it
- Records are workspace-scoped (`workspaceState`), not global — different workspace folders have different history
- The 500-edge graph slice happens in `AnalysisHandler` before saving — this cannot be changed without re-running analysis
- `restore()` runs at panel init — it only loads state into memory and sends webview messages if the webview is already mounted. If called before `resolveWebviewView`, the posts are silently dropped (VS Code queues or drops them). This is fine because `resolveWebviewView` calls `history.restore()` itself.
