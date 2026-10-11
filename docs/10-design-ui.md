# 10 — Design & UI System

## Design tokens (CSS variables from VS Code)

All colors reference VS Code theme variables — the UI automatically adapts to dark/light/high-contrast themes.

| Variable | Used for |
|----------|---------|
| `--vscode-editor-background` | Main background, code blocks |
| `--vscode-editor-foreground` | Primary text |
| `--vscode-sideBar-background` | Cards, toolbar backgrounds |
| `--vscode-panel-border` | All borders, separators |
| `--vscode-button-background` | Primary buttons, active indicators, progress bar |
| `--vscode-button-foreground` | Primary button text |
| `--vscode-input-background` | Inputs, selects, textareas |
| `--vscode-input-border` | Input borders |
| `--vscode-input-foreground` | Input text |
| `--vscode-descriptionForeground` | Secondary text, labels, empty states |
| `--vscode-list-hoverBackground` | Hover states on interactive items |
| `--vscode-list-activeSelectionBackground` | Active selection |

---

## Hardcoded accent colors

Used for graph nodes, flow diagram categories, badges — these do NOT change with theme:

| Color | Hex | Used for |
|-------|-----|---------|
| Blue | `#569cd6` | Graph (TypeScript), flow API category, primary accent |
| Teal | `#4ec9b0` | Graph (utils), flow data category, success badges |
| Purple | `#c586c0` | Graph (components), flow component category |
| Yellow | `#dcdcaa` | Graph (config), flow service category |
| Gold | `#d7ba7d` | Graph (styles), flow custom category |
| Orange | `#ce9178` | Graph (tests) |
| Light blue | `#9cdcfe` | Graph (types), flow background category |
| Cyan | `#4fc1ff` | Graph (pages) |
| Red-orange | `#f48771` | Graph (errors), flow auth category |
| Green | `#b5cea8` | Graph (Python) |

---

## Layout system

### Top level
```
body (display:flex, flex-direction:column, height:100vh, overflow:hidden)
  .tabs                  — flex-shrink:0, 1 row of tab buttons
  .screen.active         — display:flex, flex:1, flex-direction:column, min-height:0
```

### Screen types

**Scrollable tabs** (Analyze, Summary, AI Tools, History, Settings):
```
.screen
  .scroll    — overflow-y:auto, flex:1, padding:10px
    [content]
```

**Canvas tab** (Graph):
```
.screen
  #graph-empty   — OR
  #graph-wrap    — display:flex, flex:1, flex-direction:column, min-height:0
    .graph-toolbar
    #filter-panel
    #graph-canvas-wrap   — flex:1, overflow:hidden
      canvas
      #node-detail       — absolute right panel
```

**Chat tab** (Q&A):
```
.screen
  #qa-empty   — OR
  #qa-ready   — display:flex, flex-direction:column, height:100%, flex:1
    #chat-history   — flex:1, overflow-y:auto
    .chat-footer    — flex-shrink:0
```

**Flow tab**:
```
.screen
  #flow-empty   — OR
  #flow-ready   — display:flex, flex-direction:column, height:100%, flex:1
    #flow-overview   — OR
    #flow-detail
```

---

## Component patterns

### Cards
```css
.card {
  background: var(--vscode-sideBar-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 5px;
  padding: 9px 11px;
  margin-bottom: 8px;
}
.card-title { font-size: 11.5px; font-weight: 600; margin-bottom: 4px; }
.card-body  { font-size: 11px; color: var(--vscode-descriptionForeground); line-height: 1.65; }
```

### Buttons
```css
.btn          — primary (blue background)
.btn-secondary — outlined (sidebar background + border)
.btn-sm       — padding: 3px 8px, font-size: 11px
.btn-block    — width: 100%, justify-content: center
```

### Alerts
```css
.alert-error   — red left border
.alert-success — teal left border
.alert-info    — blue left border
```

### Section headers
```css
.section-hdr {
  font-size: 9.5px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 700;
  color: var(--vscode-descriptionForeground);
  margin: 12px 0 6px;
}
```

### Badges
```css
.badge-free — teal background (rgba 12% opacity)
.badge-paid — yellow background (rgba 12% opacity)
```

---

## Tab system

### Tab buttons
8 tabs in this order: `analyze`, `graph`, `summary`, `flow`, `qa`, `aitools`, `history`, `settings`

```javascript
const TAB_NAMES = ['analyze','graph','summary','flow','qa','aitools','history','settings'];
```

`showTab(name)` — syncs button active class + shows correct `.screen` div.

### Screen IDs
`#tab-{name}` for each tab. `showTab()` removes `.active` from all screens, adds to `#tab-{name}`.

### Graph tab special handling
When switching to Graph tab (`name === 'graph' && graphBuilt`):
- Waits 60ms then calls `resizeCanvas()` + `fitView()` + `render()`
- This handles the case where canvas was measured while hidden (0 size)

---

## SVG icons
All icons live in `public/*.svg`. They are served as webview URIs via `ICON_URIS` object injected into the HTML.

`hydrateIcons()` — called on load and after any dynamic HTML insertion — finds all `[data-icon]` elements and injects `<img class="icon-img">` with the URI.

Icon filter by theme:
```css
body.vscode-dark .icon-img { filter: invert(1) brightness(2) saturate(0) contrast(1.1); }
body.vscode-light .icon-img { filter: invert(0) brightness(0.32) saturate(0); }
```

Icons currently used: `local-workspace.svg`, `analyze-workspace.svg`, `graph-empty.svg`, `summary-empty.svg`, `qa-empty.svg`, `open-file.svg`, `imports.svg`, `used-by.svg`, `language.svg`, `user.svg`, `ai.svg`

---

## Content Security Policy

```
default-src 'none';
img-src {cspSource} https: data:;
style-src {cspSource} 'unsafe-inline';
script-src {cspSource} 'unsafe-inline';
font-src {cspSource} data:;
```

`{cspSource}` = `webviewView.webview.cspSource` (VS Code nonce). This means:
- No external scripts (no CDN Mermaid.js possible without relaxing CSP)
- No external fetch calls from webview
- Inline styles and scripts allowed via `'unsafe-inline'`
- This is why the SVG renderer is pure JS — no CDN allowed

---

## Scrollbar styling
```css
.scroll::-webkit-scrollbar { width: 4px; }
.scroll::-webkit-scrollbar-thumb { background: var(--vscode-panel-border); border-radius: 2px; }
```

---

## Keyboard shortcuts (registered in INIT)
| Key | Action |
|-----|--------|
| `Escape` | Close node detail panel OR clear graph search |
| `Ctrl/Cmd + F` | Switch to Graph tab and focus search input |
