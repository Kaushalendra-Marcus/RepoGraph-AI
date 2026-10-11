# 03 — Flow Diagrams

## Overview
The Flow tab shows AI-generated Mermaid flow diagrams of how data moves through the codebase. It has two layers:
1. **Static analysis** (`FlowAnalyzer.ts`) — extracts routes, call chains, DB access, events from file content using regex
2. **AI generation** (`FlowDiagramAgent.ts`) — uses the extracted facts to generate accurate Mermaid diagrams

---

## Backend — FlowAnalyzer.ts

**Entry:** `analyzeFlows(files: WorkspaceFile[]): FlowContext`

### What it extracts per file:

| Extractor | What it finds | Patterns |
|-----------|--------------|---------|
| `extractRoutes` | HTTP routes (Express, NestJS decorators, Next.js API routes) | `router.get('/path', ...)`, `@Get('/path')`, `export function GET(` |
| `extractDbAccess` | ORM calls | Prisma, Mongoose, TypeORM, Sequelize, Knex, raw SQL |
| `extractFunctions` | Exported functions & classes | `export function`, `export const fn =`, `export class` |
| `extractMiddleware` | app.use() + NestJS guards/pipes | `app.use(mw)`, `@UseGuards(...)` |
| `extractEventEmits` | Event emissions | `.emit('name')`, `.publish('name')` |
| `extractEventListeners` | Event listeners | `.on('name')`, `@OnEvent('name')` |

### Call chain builder
`buildCallChains()` cross-references import statements with export declarations:
- Builds `exportIndex: Map<name → file>` from all `export class/function/const` across the codebase
- Then for each file, matches named imports `import { Foo } from './bar'` against the index
- Produces `CallChain[]` with `{ from, to, method, kind }`

### FlowContext shape
```typescript
interface FlowContext {
  callChains: CallChain[];       // Max 120, sliced
  routes: RouteDefinition[];
  eventFlows: EventFlow[];
  dbAccess: DbAccessPattern[];
  functions: FunctionSignature[];
  middlewareStack: { file, names[] }[];
  summary: FlowContextSummary;   // Serializable text lines for AI prompt
}
```

### FlowContextSummary — what goes to the AI
The `.summary` field contains pre-formatted text lines (not raw objects) to keep AI prompt compact:
- `routes[]` — `"GET /api/users → UserController.getAll (src/...)"`
- `callChainLines[]` — `"auth.service.ts → user.service.ts via UserService"`
- `eventLines[]` — `"order.service.ts emits 'order.created' → [email.service.ts]"`
- `dbLines[]` — `"user.service.ts: prisma → findMany, create [User]"`
- `middlewareLines[]` — `"app.ts: cors, helmet, authGuard"`
- `exportedFunctions[]` — `"auth.service.ts: validateUser, signToken, refreshToken"`

---

## Backend — FlowDiagramAgent.ts

### `autoDetectFlows()` — called in AnalysisHandler step 5

1. Calls `inferArchitectureProfile()` to determine if repo is frontend/backend/event-driven/etc.
2. Sends AI prompt with ALL extracted static analysis data (routes, chains, db, events)
3. AI returns JSON with `{ subDiagrams[], overviewMermaid }`
4. Each `mermaidCode` passes through `normalizeMermaid()`
5. If AI response is invalid OR doesn't match architecture profile → falls back to `buildAdaptiveFlowMap()`

### Architecture profile detection
`inferArchitectureProfile()` reads the full corpus (summary + file summaries + flow context) and sets boolean flags:
- `hasRoutes`, `hasDb`, `hasEvents`, `hasMiddleware`, `hasComponents`, `hasJobs`, `hasCli`
- Determines `kind`: `"frontend" | "backend" | "event-driven" | "data-heavy" | "cli" | "library" | "mixed"`

### Adaptive fallback — `buildAdaptiveFlowMap()`
Used when AI fails. Picks diagram builders based on architecture profile:

| Profile | Diagrams built |
|---------|---------------|
| frontend | ComponentFlow, DependencyFlow, DataFlow (if hasDb), EventFlow (if hasEvents), ModuleFlow |
| backend | RequestFlow, MiddlewareFlow (if hasMiddleware), DependencyFlow, DataFlow, EventFlow, ModuleFlow |
| event-driven | EventFlow, DependencyFlow, DataFlow, RequestFlow, ModuleFlow |
| data-heavy | DataFlow, DependencyFlow, EventFlow, ModuleFlow |
| cli | ModuleFlow, DependencyFlow, DataFlow |
| mixed | ModuleFlow + any combination |

### Individual diagram builders
Each builder uses REAL extracted data:
- `buildRequestFlowDiagram` — uses `flowCtx.routes[]` + `dbAccess` to show route→handler→db path
- `buildDependencyFlowDiagram` — uses `callChains[]` to show file-to-file with method labels
- `buildDataFlowDiagram` — uses `dbAccess[]` to show file→ORM→operations
- `buildEventFlowDiagram` — uses `eventFlows[]` to show emit→event→listeners
- `buildMiddlewareFlowDiagram` — uses `middlewareStack[]`
- `buildComponentFlowDiagram` — uses component-like files + their call chains
- `buildBackgroundFlowDiagram` — uses job/worker files + their event connections
- `buildModuleFlowDiagram` — uses `summary.keyModules[]` as a linear flow

### `generateCustomFlow()` — triggered by user question or preset button
1. Keyword-matches `question` against file summaries to find relevant files
2. Filters routes, chains, DB access relevant to those files
3. Sends focused prompt to AI
4. Falls back to `buildCustomFallback()` if AI fails

### `normalizeMermaid()` — MUST be called on all Mermaid strings
Fixes common AI output issues:
- Unescapes `\n` → real newlines
- Strips `%%{init...}%%` directives (we apply dark theme in SVG renderer instead)
- Ensures `flowchart TD` header
- Fixes node IDs with dots/slashes → underscores
- Wraps labels containing special chars in quotes
- Removes duplicate blank lines

### FlowSubDiagram shape
```typescript
interface FlowSubDiagram {
  id: string;           // snake_case, unique
  title: string;        // Short display title
  description: string;  // One sentence
  mermaidCode: string;  // Normalized Mermaid flowchart TD code
  category: FlowCategory; // "auth"|"api"|"data"|"component"|"service"|"background"|"custom"
  relatedFiles: string[]; // Actual file paths
}
```

### FullFlowMap shape
```typescript
interface FullFlowMap {
  subDiagrams: FlowSubDiagram[];
  overviewMermaid: string; // Mermaid showing all sub-diagrams as nodes
}
```

---

## Webview — Flow tab

### HTML structure
```
#tab-flow
  #flow-empty          — shown before analysis
  #flow-ready
    #flow-overview     — tile grid view
      [preset buttons] — 4 preset flow buttons
      #flow-question   — custom flow text input
      #flow-tiles      — scrollable tile list
    #flow-detail       — drill-down view (hidden by default)
      [← Back button]
      #flow-detail-title
      #flow-detail-desc
      #flow-svg-container   — rendered SVG goes here
      <details>             — collapsible Mermaid source
        #flow-mermaid-src
      #flow-related-files
```

### State variables
```javascript
let _currentFlowMap = null;   // FullFlowMap stored in memory
let _selectedDiagram = null;  // Currently open FlowSubDiagram
```

### Category color map
```javascript
const CAT_COLORS = {
  auth: '#f48771',       // red-orange
  api: '#569cd6',        // blue
  data: '#4ec9b0',       // teal
  component: '#c586c0',  // purple
  service: '#dcdcaa',    // yellow
  background: '#9cdcfe', // light blue
  custom: '#d7ba7d'      // gold
};
```

### SVG renderer — `renderMermaidToSvg(code)`
Pure JS Mermaid parser and SVG builder. No external library.

**Parse step:**
1. Strips `%%{init}%%`, `flowchart TD`, `graph TD` header lines
2. For each remaining line:
   - Edge detection: `A --> B` or `A --| label |--> B` → pushes to `edges[]`
   - Node definition: `A["label"]`, `A{"label"}`, `A("label")` → pushes to `nodeMap{}`
   - Diamond detection: `{...}` syntax → prefixes label with `◆ ` for rendering

**Layout step — `computeLayers()`:**
- Kahn's topological sort algorithm
- Produces layers array where each layer contains nodes with no remaining in-edges
- Cycle fallback: if no zero-in-degree nodes found, dumps remaining as one layer

**SVG build step:**
- `svgW` = `max(260, maxPerRow * (nodeW+hGap) + hGap)`
- `svgH` = `layers.length * (nodeH+vGap) + vGap`
- Draws edges first (behind nodes): curved bezier paths + animated dashed overlay
- Draws nodes: `<rect>` for normal, `<polygon>` for diamond
- `@keyframes flowDash` animates the dashed overlay (stroke-dasharray: 6 4)
- Returns null if parse fails → webview shows fallback message with mermaid.live link

### Preset flow buttons
4 buttons wired in `wireFlowPresets()` (called from INIT):
- 🌐 API Request → question: `"API request lifecycle flow"`
- 🔒 Auth Flow → question: `"Authentication and authorization flow"`
- ⚙ Component Data → question: `"Component data flow and state management"`
- 🗃 DB Query Path → question: `"Database query and data access path"`

All 4 send `{ type: 'generateCustomFlow', payload: { question } }` to extension.

### Flow tile interaction
- Click tile → `openFlowDetail(diagram)`: hides `#flow-overview`, shows `#flow-detail`, renders SVG
- Back button → `closeFlowDetail()`: shows `#flow-overview`, hides `#flow-detail`, clears SVG container
- Copy button → copies `diagram.mermaidCode` to clipboard, shows "Copied!" for 1.5s
- Hover → background: `var(--vscode-list-hoverBackground)`

### Message handling
| Message | Action |
|---------|--------|
| `flowMapReady` | `showFlowMap(payload)` → renders all tiles |
| `customFlowReady` | `addCustomFlowTile(payload.diagram)` → prepends tile + auto-opens detail |
| `customFlowBusy` | disables/enables `#flow-ask-btn` |
| `analysisRestored` | `if(payload.flowMap) showFlowMap(payload.flowMap)` |

---

## What to be careful about when modifying

1. **`normalizeMermaid()` must always be called** before storing any Mermaid string — in FlowDiagramAgent AND in buildCustomFallback
2. **The SVG renderer skips `%%` lines** — if you add new Mermaid directives, make sure the renderer's filter line includes them
3. **`addCustomFlowTile()` auto-opens the detail panel** — this is intentional so users see the result immediately
4. **`_currentFlowMap` is session-only** — it's not stored in extension state, only restored via `analysisRestored` flowMap payload
5. **`flow-overview` and `flow-detail` are siblings** — they toggle visibility, not parent/child. Do not change this structure
6. **The fallback `buildAdaptiveFlowMap()` produces diagrams without AI** — it uses real extracted data, not generic templates
