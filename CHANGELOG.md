# Changelog

All notable changes to RepoGraph AI are documented here.

## 1.0.2 — Polish release

### Branding & docs
- New README with real captures: 3D dependency sphere, 2D community clusters, a complete data-flow diagram, and the provider settings panel.
- Refreshed logo / extension icon; demo links to the live walkthrough instead of bundling a video.

### Packaging
- Extension icon is now a single high-res PNG; package slimmed via `.vscodeignore` (no sources, docs, or node_modules inside).
- Repository links corrected; `CHANGELOG.md` shipped for marketplace release notes.

## 1.0.0 — Initial release

### Core
- **One-click auto-indexing** — the dependency graph builds itself when a folder opens; a file watcher keeps it live (~1.5 s debounce) and a content-hashed disk cache makes reopening instant.
- **Provenance dependency graph** — every edge labeled `EXTRACTED` (1.0), `INFERRED` (0.85) or `AMBIGUOUS` (0.3), plus god nodes, 2-hop blast radius, community detection and a health report.
- **2D / 3D views** — the same graph projected onto a 3D sphere with perspective depth.
- **Smart file filtering** — skips `node_modules`, `dist`, lockfiles, minified and generated code.

### Flow diagrams
- Four dialects: system **flowcharts**, **sequence** diagrams (client → handler → middleware → service → DB), **class** diagrams, and single-**function control flow** with `file:line` nodes.
- Deterministic diagrams work with no API key; AI-generated extra diagrams pass a **grounding validator** (invented labels dropped, weak diagrams replaced by the static fallback) and a Mermaid **cycle fixer**.
- **Guided tour** ordering, health badges on tiles, click-to-line chips, and exports: `.mmd`, `.svg`, `.json`.

### Agent support
- **`REPOGRAPH-CONTEXT.md` export** — one-click, compact context file for coding agents (Copilot, Cursor, Claude Code, Codex, OpenCode, Windsurf, Cline) with an explicit verify-before-refactoring note, approximate token count and savings.

### AI (optional)
- Repo summaries, file summaries, and graph-traversal Q&A with citations and honest abstains.
- Providers: **Groq** (free tier), **Ollama** (100% local), **Google Gemini**, **Anthropic Claude**, **OpenAI** — custom model names supported; switching providers never forces a re-analysis.
- Everything runs locally except the optional AI call: no backend, no telemetry, no account.

### History
- Every analysis is a local snapshot; reload, compare across refactors, delete.
