# 02 — Dependency Graph

## What it does
Renders an interactive force-directed node graph of file-level import relationships using an HTML5 `<canvas>`. No external library — pure canvas rendering with a custom force simulation.

---

## Backend — GraphBuilder.ts

**Entry:** `buildDependencyGraph(files: WorkspaceFile[]): DependencyGraph`

**Output shape:**
```typescript
interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
interface GraphNode {
  id: string;      // Unique — usually the file path
  path: string;    // Relative path from workspace root
  absPath?: string;// Absolute path (used for openFile)
  label: string;   // Filename without extension
  group: string;   // Folder name — used for color grouping
  language: string;// "TypeScript" | "JavaScript" | "Python" | etc.
  inDegree: number;// How many files import this one
  outDegree: number;// How many files this one imports
  exports?: string[];// Named exports (if detected)
}
interface GraphEdge {
  source: string;  // node id
  target: string;  // node id
  label?: string;  // import name (optional)
}
```

**How it works:**
- Scans import/require statements in each file
- Maps relative paths to resolved file paths
- Calculates in/out degree for each node
- Returns ALL nodes and edges — the webview trims to 120 nodes for display

---

## Webview — graph engine in webviewContent.ts

### Display limit
The webview takes top 120 nodes by `(inDegree + outDegree)` ranking, then expands to include connected nodes. This is NOT trimmed server-side — the full graph is sent and trimmed in JS.

### Force simulation
Custom implementation (no d3). Lives in `tickForce()`.
- **Repulsion:** every pair of nodes repels with k=1800
- **Attraction:** connected nodes attract toward idealLen=120
- **Center gravity:** k=0.003 toward origin
- **Damping:** velocity *= 0.72 each tick
- Runs 200 ticks before first render (no animation during layout)

### Render loop
`render()` — called on every mouse event, zoom, or resize. Does NOT use `requestAnimationFrame` loop — it's event-driven for performance.

**Render order:**
1. Clear canvas
2. Draw edges (arrows + labels at zoom > 0.9)
3. Draw nodes (circles, glow on selected, dimming of unrelated)
4. Draw labels (shown at scale > 0.45 or for selected/connected nodes)

### Selection model
- Click on node → `selectNode(node)` → opens `#node-detail` panel on right side
- Click on empty → deselects, closes detail panel
- Double-click on node → sends `openFile` message to extension
- Drag node → moves it, saves layout after 800ms debounce
- Drag canvas → pans view

### Node detail panel (`#node-detail`)
Shows for selected node:
- Filename + full path
- import count / used-by count / language
- Purpose + exports (from `fileSummaryMap` populated by `fileSummariesReady` message)
- Chips for "Imports" and "Used By" — clickable to navigate to that node
- "Open File" button → sends `openFile` message

### Graph search
`graphSearch(val)` sets `searchTerm`. Non-matching nodes rendered at 15% opacity.

### Filter panel
- Extension filter (by file extension): checkboxes — NOT yet wired to actual filtering (CSS only)
- Depth filter: range input — calls `applyFilters()` — `_activeDepth` variable set but not yet used in render
- Clear button: resets all filters

> **Known gap:** The depth filter and extension filter update `_activeDepth` but the `render()` function does not yet apply them. This is a future enhancement.

### Layout persistence
- Node positions saved to `workspaceState` as `repograph.graphLayout`
- Saved after 800ms debounce on any node drag
- Restored on `layoutLoaded` message via `applyLayout()`
- Key: `repograph.graphLayout` → `{ id, x, y }[]`

### Color scheme
```javascript
const GROUP_COLORS = [
  '#569cd6','#4ec9b0','#c586c0','#dcdcaa',
  '#d7ba7d','#ce9178','#9cdcfe','#4fc1ff',
  '#f48771','#b5cea8','#646695'
];
```
Colors assigned to groups (folder names) in order of first appearance.

### Legend
Shows up to 6 groups with their color dot. Built in `initGraph()` from unique groups.

### Stats bar
Shows `"N files · M imports"` from `topNodes.length` and `edges.length`.

---

## CSS classes
| Class | Purpose |
|-------|---------|
| `#graph-wrap` | flex column container, full height |
| `.graph-toolbar` | search + zoom buttons + legend row |
| `#graph-canvas-wrap` | overflow hidden, position relative |
| `#graph-canvas` | absolute positioned, cursor: grab |
| `#node-detail` | absolute right panel, 200px wide |
| `#node-detail.open` | display: flex (visible) |
| `.detail-chip` | clickable node name pills |
| `#filter-panel` | collapsible filter row |

---

## State variables in webview
```javascript
let canvas, ctx, canvasWrap;
let nodes = [], edges = [];       // Current display nodes/edges (max 120)
let cam = { x, y, scale };       // Camera transform
let dragging, dragNode, lastMouse;
let selectedNode;
let graphBuilt;                   // true after initGraph() called
let searchTerm;
const fileSummaryMap = {};        // path → FileSummary (populated from fileSummariesReady)
let pointerState;                 // { down, moved, startX, startY, node }
const groupColorMap = {};         // group name → hex color
```

---

## What to be careful about when modifying

- `initGraph()` is called both on `graphReady` AND `analysisRestored` — make sure any graph init logic runs in both paths
- `resizeCanvas()` returns false if the canvas has no layout yet — always check return value before fitView
- Node `id` and `path` may differ — `id` is what edges use as source/target, `path` is what openFile uses
- The webview `fileSummaryMap` is populated from `fileSummariesReady` message — if the message doesn't fire, detail panel shows no purpose/exports
