# RepoGraph AI 🔗

> Instantly understand any GitHub codebase with AI-powered dependency graphs, file summaries & interactive Q&A.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Extension-blue)](https://marketplace.visualstudio.com)

---

## Features

- 🗺️ **Visual Dependency Graph** — See how files connect in an interactive force-directed graph
- 📄 **AI File Summaries** — Understand what each file does in plain English
- 💬 **Context-aware Q&A** — Ask questions about the codebase in natural language
- 🔌 **Multi-provider AI** — Groq (free), Ollama (local), Gemini, Claude, OpenAI
- 🔒 **Privacy First** — API keys stored in VS Code's encrypted SecretStorage

## Supported AI Providers

| Provider | Cost | Notes |
|---|---|---|
| **Groq** | Free tier | Fastest, recommended for beginners |
| **Ollama** | 100% Free | Runs locally, no internet needed |
| **Google Gemini** | Free tier | gemini-1.5-flash |
| **Anthropic Claude** | Paid | Best quality |
| **OpenAI** | Paid | gpt-4o-mini / gpt-4o |

## Setup

### 1. Install Extension
Search `RepoGraph AI` in VS Code Extensions panel and click Install.

### 2. Configure AI Provider
Click the RepoGraph icon in the activity bar → **Settings** tab → Choose provider and enter API key.

**Get a free Groq API key:** https://console.groq.com/keys

### 3. Analyze a Repository
Go to **Analyze** tab → Paste a GitHub URL → Click **Analyze Repository**.

## Development Setup

```bash
git clone https://github.com/your-username/repograph-ai
cd repograph-ai
npm install
npm run compile
```

Press `F5` in VS Code to launch the extension in a new Extension Development Host window.

### Build & Package

```bash
npm install -g @vscode/vsce
npm run compile
vsce package
# Generates repograph-ai-0.1.0.vsix
```

### Install local .vsix
```bash
code --install-extension repograph-ai-0.1.0.vsix
```

## Project Structure

```
repograph-ai/
├── src/
│   ├── extension.ts              # Extension entry point
│   ├── providers/
│   │   └── index.ts              # Groq, Ollama, Gemini, Anthropic, OpenAI
│   ├── analyzer/
│   │   ├── RepoFetcher.ts        # GitHub API integration
│   │   └── GraphBuilder.ts       # Dependency graph construction
│   ├── agents/
│   │   └── index.ts              # Summary & Q&A agents
│   └── panel/
│       ├── RepoGraphPanel.ts     # VS Code WebviewViewProvider
│       └── webviewContent.ts     # Full UI HTML
├── package.json                  # Extension manifest
└── tsconfig.json
```

## Architecture

```
User Input (GitHub URL)
        ↓
   RepoFetcher          ← GitHub REST API
        ↓
   GraphBuilder         ← Parses imports per language
        ↓
   SummaryAgent         ← AI provider (Groq / Ollama / etc.)
        ↓
   QAAgent              ← Context-aware Q&A with history
        ↓
   WebviewPanel         ← VS Code sidebar UI
```

## Supported Languages

TypeScript · JavaScript · Python · Go · Rust · Java · C# · C++ · Ruby · PHP · Vue · Svelte

## Contributing

PRs welcome! This is open source (MIT). See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — free to use, modify and distribute.
