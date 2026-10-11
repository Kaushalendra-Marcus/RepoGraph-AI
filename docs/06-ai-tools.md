# 06 — AI Tools Tab

## What it does
Three AI-powered tools that generate or analyze content based on the current analysis:
1. **Doc generation** — README, ARCHITECTURE, ONBOARDING markdown files
2. **Refactor analysis** — coupling, god files, architectural issues
3. **PR review** — structured code review from a git diff

---

## Backend — DocGenerator.ts

All methods return `{ content: string; tokensUsed: number }`.

### `generateReadme(summary, fileSummaries, repoName)`
Generates a README.md with: project description, features, tech stack, installation, usage, file structure.

### `generateArchitecture(summary, graph, fileSummaries, repoName)`
Generates ARCHITECTURE.md with: system overview, component map, data flow, key design decisions.

### `generateOnboarding(summary, fileSummaries, repoName)`
Generates ONBOARDING.md with: what the project does, how to run it, key files to know, common tasks.

### `analyzeRefactor(summary, graph, fileSummaries)`
Analyzes coupling, suggests splits, identifies god files, notes missing abstractions.

### `reviewPR(diff, summary, repoName)`
Reviews a git diff in context of the codebase. Returns structured review: summary, issues, suggestions.

### `DocGenerator.saveToWorkspace(filename, content)` — static method
Saves generated content to the workspace root folder. Creates the file if it doesn't exist.

---

## Backend — AIToolsHandler.ts

### `generateDoc(payload: { docType })`
- docType: `"readme"` | `"architecture"` | `"onboarding"`
- Posts `aiToolBusy` → calls DocGenerator → saves file → posts `docSaved` + token count
- Handles unknown docType with thrown error

### `analyzeRefactor()`
- Posts `aiToolBusy` → calls `gen.analyzeRefactor()` → posts `refactorResult` + token count

### `reviewPR(payload: { diff })`
- Validates diff not empty → posts `aiToolBusy` → calls `gen.reviewPR()` → posts `prReviewResult` + token count

### `saveDoc(payload: { filename, content })`
- Calls `DocGenerator.saveToWorkspace(filename, content)` → posts `docSaved`

### `generateCustomFlow(payload: { question })`
- Delegates to `FlowDiagramAgent.generateCustomFlow()` with full state context
- Posts `customFlowBusy` true/false + `customFlowReady` with diagram
- Result goes to Flow tab, not AI Tools tab

### Guard — `requiresAnalysis(featureName)`
Returns false (with error message) if:
- `state.provider` is undefined
- `state.currentSummary` or `state.currentGraph` is undefined

### Token tracking — `addTokens(n)`
Increments `state.totalTokensUsed` and posts `tokenUsage` message.

---

## Webview — AI Tools tab

### HTML structure
```
#tab-aitools
  #aitools-alert        — error/success alert area
  .section-hdr "Generate Documentation"
  .card
    #gen-readme-btn     — triggers generateDoc('readme')
    #gen-arch-btn       — triggers generateDoc('architecture')
    #gen-onboarding-btn — triggers generateDoc('onboarding')
  .section-hdr "Refactor Analysis"
  .card
    #refactor-btn       — triggers analyzeRefactor()
    #refactor-result    — result box (hidden until result arrives)
      #refactor-content
      #save-refactor-btn
  .section-hdr "PR / Diff Review"
  .card
    #pr-diff-input      — textarea for git diff
    #review-pr-btn
    #clear-pr-btn
    #pr-result          — result box (hidden until result arrives)
      #pr-content
      #save-pr-btn
```

### State variables
```javascript
let _refactorContent = '';  // Stored to enable save button
let _prContent = '';        // Stored to enable save button
```

### Message handling
| Message | Action |
|---------|--------|
| `aiToolBusy` | `setAIToolBusy(docType, busy)` disables/enables relevant button |
| `aiToolError` | `showAlert('aitools', message, 'error')` |
| `docSaved` | `showAlert('aitools', '✓ Saved: filename', 'success')` |
| `refactorResult` | Stores in `_refactorContent`, shows `#refactor-result` box |
| `prReviewResult` | Stores in `_prContent`, shows `#pr-result` box |
| `tokenUsage` | `updateTokenDisplay(total)` in Settings tab |

### Button → docType mapping
```javascript
const ids = {
  readme: 'gen-readme-btn',
  architecture: 'gen-arch-btn',
  onboarding: 'gen-onboarding-btn',
  refactor: 'refactor-btn',
  pr: 'review-pr-btn'
};
```

### Save buttons
- "Save as REFACTOR-REPOGRAPH.md" → `saveAIDoc('REFACTOR-REPOGRAPH.md', _refactorContent)`
- "Save as PR-REVIEW-REPOGRAPH.md" → `saveAIDoc('PR-REVIEW-REPOGRAPH.md', _prContent)`
- Both send `{ type: 'saveDoc', payload: { filename, content } }` to extension

---

## CSS classes
| Class | Usage |
|-------|-------|
| `.ai-result-box` | scrollable result content area, max-height 360px |
| `.ai-tool-result-hdr` | flex row with label + save button |
| `.ai-tool-result-label` | uppercase section label |
