<div align="center">

<img src="./public/repograph-ai.png" alt="RepoGraph AI" width="100" height="100">

# RepoGraph AI

**Understand any codebase in minutes, not days.**

A VS Code extension that scans your workspace, maps every file relationship, and gives you AI-powered summaries and a live Q&A — all running on your own API key.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.85.0-blue)](https://marketplace.visualstudio.com/items?itemName=repograph.repograph-ai)
[![Open Source](https://img.shields.io/badge/Open%20Source-yes-brightgreen)](https://github.com/your-username/repograph-ai)

[Install from Marketplace](#installation) · [Report a Bug](https://github.com/your-username/repograph-ai/issues) · [Request a Feature](https://github.com/your-username/repograph-ai/issues)

</div>

---

## What it does

When you join a new project or explore open source code, the hardest part is not reading individual files — it is understanding how everything connects. RepoGraph AI solves that.

It scans your open workspace, extracts every import relationship across all files, builds a visual dependency graph, generates plain-English summaries for each file, and gives you an AI assistant that already knows the entire codebase. You can ask it anything.

---

## Features

**Visual Dependency Graph**
An interactive force-directed graph showing every file and how it connects to others through imports. Click any node to see what it imports and what imports it. Double-click to open the file directly in the editor. Drag, zoom, and search — the graph is fully interactive.

**AI File Summaries**
Every key file gets a one or two sentence explanation of what it does, what it exports, and what it depends on. No more opening random files trying to figure out where things live.

**Codebase Q&A**
Ask questions in plain English. "Where is authentication handled?", "Which files talk to the database?", "How does the routing work?" The AI already has full context of your project and answers with specific file references.

**Multi-provider, Bring Your Own Key**
No subscription. No data sent to any server except the AI provider you choose. Your API key lives in VS Code's encrypted SecretStorage and never touches our servers — because we don't have any.

**Analysis History**
Every analysis is saved locally. You can switch between past analyses, compare how the codebase looked before and after a refactor, and delete old records when you no longer need them.

**Smart File Filtering**
Automatically skips `node_modules`, `dist`, `build`, `.git`, `__pycache__`, lockfiles, minified files, and any other generated output. Only your actual source code gets analyzed.

---

## Supported AI Providers

| Provider | Cost | Best for |
|---|---|---|
| **Groq** | Free tier | Best starting point. Fast, generous free limits. |
| **Ollama** | Completely free | Privacy-first. Runs 100% on your machine, no internet needed. |
| **Google Gemini** | Free tier available | gemini-1.5-flash has a good free quota. |
| **Anthropic Claude** | Paid | Highest quality answers and summaries. |
| **OpenAI** | Paid | gpt-4o-mini is cheap and reliable. |

You can also type any custom model name manually for any provider.

---

## Supported Languages

TypeScript · JavaScript · Python · Go · Rust · Java · Kotlin · C · C++ · C# · Ruby · PHP · Swift · Vue · Svelte · Astro · GraphQL · Prisma · SQL · Shell

---

## Installation

**From the VS Code Marketplace:**

Search `RepoGraph AI` in the Extensions panel (`Ctrl+Shift+X`) and click Install.

**From a .vsix file:**

```bash
code --install-extension repograph-ai-1.0.0.vsix
```

---

## Quick Start

**Step 1 — Open a project**

Open any folder in VS Code. RepoGraph AI works with your current workspace.

**Step 2 — Configure your AI provider**

Click the RepoGraph icon in the activity bar on the left. Go to the **Settings** tab, pick a provider, and paste your API key. Your key is saved encrypted and never leaves your machine.

Get a free Groq key: https://console.groq.com/keys

**Step 3 — Analyze**

Go to the **Analyze** tab and click **Analyze Workspace**. The extension will scan your files, build the graph, and generate summaries. For a medium-sized project this takes one to two minutes.

**Step 4 — Explore**

- **Graph tab** — see the dependency map, click nodes for details
- **Summary tab** — read the AI overview and per-file explanations
- **Q&A tab** — ask anything about the codebase

---

## Screenshots

> Coming soon — replace with actual screenshots before publishing.

| Dependency Graph | File Summary | Q&A |
|---|---|---|
| ![Graph](assets/screenshot-graph.png) | ![Summary](assets/screenshot-summary.png) | ![QA](assets/screenshot-qa.png) |

---

## Project Structure

```
repograph-ai/
├── src/
│   ├── extension.ts              # Extension entry point
│   ├── providers/
│   │   └── index.ts              # Groq, Ollama, Gemini, Anthropic, OpenAI
│   ├── analyzer/
│   │   ├── WorkspaceScanner.ts   # File discovery and content reading
│   │   └── GraphBuilder.ts       # Dependency graph construction
│   ├── agents/
│   │   └── index.ts              # Repo summary and Q&A agents
│   └── panel/
│       ├── RepoGraphPanel.ts     # VS Code WebviewViewProvider
│       └── webviewContent.ts     # Full sidebar UI
├── assets/                       # Icons and screenshots
├── package.json                  # Extension manifest
└── tsconfig.json
```

---

## Development

**Prerequisites:** Node.js 18+, VS Code 1.85+

```bash
git clone https://github.com/your-username/repograph-ai
cd repograph-ai
npm install
npm run compile
```

Press `F5` in VS Code to open the Extension Development Host with the extension loaded.

**Watch mode** (recompiles on save):

```bash
npm run watch
```

**Package for distribution:**

```bash
npm install -g @vscode/vsce
npm run compile
vsce package
```

This produces a `.vsix` file you can share or install locally.

---

## How it works

```
Open Workspace
      |
WorkspaceScanner
  - Reads all source files
  - Skips generated/build outputs
  - Respects file size limits
      |
GraphBuilder
  - Extracts imports per language
  - Resolves relative and alias paths
  - Builds nodes + edges
      |
AI Agents (your API key)
  - RepoSummaryAgent  →  overview, architecture, tech stack
  - FileSummaryAgent  →  per-file purpose and exports (batched)
  - QAAgent           →  question answering with full repo context
      |
Webview Panel
  - Graph tab    →  interactive canvas-based dependency graph
  - Summary tab  →  AI-generated overview and file cards
  - Q&A tab      →  chat interface with history
```

The extension never sends your source code to any third-party server other than the AI provider you explicitly configure. It has no backend, no telemetry, and no analytics.

---

## Privacy

Your code stays yours.

- API keys are stored in VS Code's `SecretStorage` (OS-level encryption)
- Source code is only sent to the AI provider you choose, for analysis only
- No telemetry, no usage tracking, no external servers
- Everything except the AI call runs entirely on your machine

---

## Contributing

Contributions are welcome. This project is MIT licensed and open to everyone.

Read [CONTRIBUTING.md](CONTRIBUTING.md) to get started. For significant changes, please open an issue first to discuss what you'd like to change.

**Good first issues:**
- Adding support for a new programming language in `GraphBuilder.ts`
- Improving import resolution accuracy
- Adding new suggested questions in the Q&A tab

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full history.

---

## License

MIT — free to use, modify, and distribute. See [LICENSE](LICENSE) for details.

---

<div align="center">

Built for developers who have too many tabs open and not enough time.

</div>