# Contributing to RepoGraph AI

Thank you for taking the time to contribute. This document explains how to get set up, what the code structure looks like, and what good contributions look like.

---

## Getting started

**Fork and clone:**

```bash
git clone https://github.com/your-username/repograph-ai
cd repograph-ai
npm install
npm run compile
```

Press `F5` in VS Code to launch the Extension Development Host. Any changes you make require running `npm run compile` again, or use `npm run watch` to recompile automatically on save.

---

## Code structure

```
src/
├── extension.ts              # Registers the webview provider and commands
├── providers/index.ts        # AI provider classes (Groq, Ollama, Gemini, etc.)
├── analyzer/
│   ├── WorkspaceScanner.ts   # Scans the workspace, filters files, reads content
│   └── GraphBuilder.ts       # Extracts imports and builds the dependency graph
├── agents/index.ts           # summarizeRepo, summarizeFiles, QAAgent
└── panel/
    ├── RepoGraphPanel.ts     # VS Code WebviewViewProvider, message handling
    └── webviewContent.ts     # Entire sidebar UI as an HTML string
```

**Data flow:**

`WorkspaceScanner` reads files → `GraphBuilder` extracts imports and builds nodes/edges → `agents/index.ts` calls the AI provider to generate summaries → `RepoGraphPanel` sends results to the webview → `webviewContent.ts` renders everything.

---

## Types of contributions

**Bug fixes** — Any fix with a clear before/after is welcome. Open a PR with a description of what was wrong and how you fixed it.

**New language support** — Add import extraction logic to `GraphBuilder.ts` in the `extractImports` function. Each language has its own regex block. Follow the existing pattern.

**New AI providers** — Add a new class to `providers/index.ts` implementing the `AIProvider` interface, then register it in the `createProvider` factory at the bottom of the file. Add the provider card to the Settings tab in `webviewContent.ts`.

**UI improvements** — The entire UI lives in `webviewContent.ts` as an HTML string with inline CSS and JavaScript. It runs inside a VS Code webview. Use VS Code CSS variables (`--vscode-editor-background`, etc.) for theming so the UI adapts to the user's theme.

**Performance improvements** — The graph can get slow with large repos. The force simulation in `webviewContent.ts` (the `tickForce` function) and the node cap logic are good places to start.

---

## What to avoid

- Do not add external npm dependencies to the extension runtime. VS Code extensions have strict packaging constraints and dependencies add significant size. Use the VS Code API and Node.js built-ins.
- Do not add telemetry, analytics, or any code that phones home.
- Do not store API keys anywhere except VS Code's `SecretStorage`. Never log them.
- Do not use `console.log` in production paths. Use it only during development and remove before submitting a PR.

---

## Pull request guidelines

- Keep PRs focused. One fix or feature per PR.
- Include a clear description of what changed and why.
- If you are adding a new feature, update `README.md` to document it.
- If you are fixing a bug, describe how to reproduce the original issue.
- Make sure `npm run compile` passes with no TypeScript errors before submitting.

---

## Reporting bugs

Open an issue with:

- VS Code version
- Extension version
- Which AI provider you are using
- A description of what you expected and what actually happened
- Any error messages from the VS Code Developer Tools console (`Help > Toggle Developer Tools`)

---

## Questions

Open a GitHub Discussion if you have a question about the code or want to discuss a feature before building it.