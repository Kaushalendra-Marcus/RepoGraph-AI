import * as vscode from "vscode";
import { PanelState } from "./PanelState";

export interface ExportGraphPayload {
  format: "png" | "svg";
  /** Data URL (data:image/png;base64,....) — present when format === "png" */
  dataUrl?: string;
  /** Raw SVG markup — present when format === "svg" */
  svgText?: string;
  /** Suggested filename without extension, e.g. repo name */
  suggestedName?: string;
}

export class ExportHandler {
  constructor(
    private state: PanelState,
    private post: (msg: object) => void
  ) {}

  /** Flow export: deterministic .mmd / .svg / .json (diffable architecture). */
  async exportFlow(payload: { format: "mmd" | "svg" | "json"; id?: string; svgText?: string }) {
    const map = this.state.currentFlowMap;
    const diagram = map?.subDiagrams.find((d) => d.id === payload.id)
      ?? map?.subDiagrams[0];
    if (!diagram) {
      this.post({ type: "exportError", payload: { message: "No flow diagram to export. Analyze first." } });
      return;
    }
    const base = (diagram.id || "flow").replace(/[^a-z0-9-_]+/gi, "-");
    let filename: string;
    let content: string;
    if (payload.format === "mmd") {
      filename = `${base}.mmd`;
      content = diagram.mermaidCode;
    } else if (payload.format === "json") {
      filename = `${base}.json`;
      content = JSON.stringify(diagram, null, 2);
    } else if (payload.format === "svg") {
      if (!payload.svgText) {
        this.post({ type: "exportError", payload: { message: "No rendered SVG to save yet. Open the diagram first." } });
        return;
      }
      filename = `${base}.svg`;
      content = payload.svgText;
    } else {
      this.post({ type: "exportError", payload: { message: `Unsupported flow format: ${payload.format}` } });
      return;
    }
    try {
      const folders = vscode.workspace.workspaceFolders;
      const uri = folders?.length
        ? vscode.Uri.joinPath(folders[0].uri, filename)
        : undefined;
      const target = uri ?? await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(filename),
        filters: payload.format === "json" ? { JSON: ["json"] } : payload.format === "svg" ? { SVG: ["svg"] } : { Mermaid: ["mmd"] },
        title: `Save flow as ${payload.format.toUpperCase()}`,
      });
      if (!target) return;
      await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(content));
      this.post({ type: "exportSaved", payload: { format: payload.format, path: target.fsPath } });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      this.post({ type: "exportError", payload: { message: `Flow export failed: ${message}` } });
    }
  }

  async exportGraph(payload: ExportGraphPayload) {
    const { format } = payload;

    if (format !== "png" && format !== "svg") {
      this.post({ type: "exportError", payload: { message: `Unsupported export format: ${format}` } });
      return;
    }
    if (format === "png" && !payload.dataUrl) {
      this.post({ type: "exportError", payload: { message: "No image data received for PNG export." } });
      return;
    }
    if (format === "svg" && !payload.svgText) {
      this.post({ type: "exportError", payload: { message: "No SVG markup received for SVG export." } });
      return;
    }

    const base =
      payload.suggestedName ||
      this.state.workspaceInfo?.name ||
      "repograph";
    const safeBase = base.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "repograph";
    const defaultFilename = `${safeBase}-dependency-graph.${format}`;

    try {
      const targetUri = await this.pickSaveLocation(defaultFilename, format);
      if (!targetUri) {
        // User cancelled the save dialog — not an error.
        return;
      }

      const bytes =
        format === "png"
          ? this.decodeDataUrl(payload.dataUrl!)
          : new TextEncoder().encode(payload.svgText!);

      await vscode.workspace.fs.writeFile(targetUri, bytes);

      this.post({
        type: "exportSaved",
        payload: { format, path: targetUri.fsPath },
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      this.post({ type: "exportError", payload: { message: `Export failed: ${message}` } });
    }
  }

  // ── One-click agent context (token saver) ───────────────────────────────
  // Builds a compact markdown snapshot agents can read instead of
  // re-scanning every file. One click: saves REPOGRAPH-CONTEXT.md to the
  // workspace root AND returns the text so the webview can copy it.

  async exportAgentContext(payload?: { save?: boolean }) {
    const shouldSave = payload?.save !== false;
    const s = this.state;

    if (!s.currentGraph || !s.workspaceInfo) {
      this.post({ type: "agentContextError", payload: { message: "Analyze the workspace first." } });
      return;
    }

    const markdown = this.buildAgentMarkdown();
    const approxTokens = Math.round(markdown.length / 4);
    // Rough saving: full source would be ~ sum of file sizes / 4
    const fullTokens = Math.round(
      (s.workspaceInfo.files.reduce((acc, f) => acc + f.content.length, 0) || markdown.length * 4) / 4
    );
    const savedPct = fullTokens > 0 ? Math.max(0, Math.round((1 - approxTokens / fullTokens) * 100)) : 0;

    let savedPath: string | undefined;
    if (shouldSave) {
      try {
        const folders = vscode.workspace.workspaceFolders;
        const root = folders?.[0]?.uri;
        const filename = "REPOGRAPH-CONTEXT.md";
        if (root) {
          const uri = vscode.Uri.joinPath(root, filename);
          await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(markdown));
          savedPath = uri.fsPath;
        } else {
          const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(filename),
            filters: { Markdown: ["md"] },
            title: "Save agent context",
          });
          if (uri) {
            await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(markdown));
            savedPath = uri.fsPath;
          }
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        this.post({ type: "agentContextError", payload: { message: `Save failed: ${message}` } });
        return;
      }
    }

    this.post({
      type: "agentContextReady",
      payload: {
        markdown,
        filename: "REPOGRAPH-CONTEXT.md",
        path: savedPath,
        approxTokens,
        savedPct,
      },
    });
  }

  private buildAgentMarkdown(): string {
    const s = this.state;
    const graph = s.currentGraph!;
    const summary = s.currentSummary;
    const fileSummaries = s.currentFileSummaries ?? [];
    const flowCtx = s.currentFlowContext;
    const flowMap = s.currentFlowMap;
    const repoName = s.workspaceInfo?.name ?? "project";
    const date = new Date().toISOString().slice(0, 10);

    const L: string[] = [];
    L.push(`# ${repoName}: RepoGraph Context`);
    L.push(`> Generated ${date} by RepoGraph AI. Paste this whole file to any coding agent (Copilot, Cursor, Claude) instead of letting it re-scan the repo.`);
    L.push(``);

    const summaryIsAI = (summary as unknown as Record<string, unknown> | undefined)?._ai !== false;
    if (summary) {
      // AI prose (overview, architecture, key modules) only ships with a key.
      // Static facts (stack, entry points) are always safe to include.
      if (summaryIsAI) {
        L.push(`## Overview`);
        L.push(summary.overview);
        if (summary.architecture) { L.push(``); L.push(`## Architecture`); L.push(summary.architecture); }
      }
      if (summary.techStack?.length) { L.push(``); L.push(`## Tech stack`); L.push(summary.techStack.map((t) => `- ${t}`).join("\n")); }
      if (summary.entryPoints?.length) { L.push(``); L.push(`## Entry points`); L.push(summary.entryPoints.map((e) => `- \`${e}\``).join("\n")); }
      if (summaryIsAI && summary.keyModules?.length) {
        L.push(``); L.push(`## Key modules`);
        for (const m of summary.keyModules.slice(0, 10)) L.push(`- **${m.name}**: ${m.description}`);
      }
    }

    if (fileSummaries.length) {
      L.push(``); L.push(`## Top files (purpose + exports)`);
      for (const f of fileSummaries.slice(0, 15)) {
        L.push(`- \`${f.path}\`: ${f.purpose}${f.exports ? ` (exports: ${f.exports})` : ""}`);
      }
    }

    if (graph.stats) {
      L.push(``); L.push(`## Provenance`);
      L.push(`EXTRACTED ${graph.stats.extracted} · INFERRED ${graph.stats.inferred} · AMBIGUOUS ${graph.stats.ambiguous}`);
      if (graph.health && !graph.health.ok) {
        L.push(`Health warnings: ${graph.health.warnings.join("; ")}`);
      }
    }
    if (graph.godNodes?.length) {
      L.push(``); L.push(`## God nodes (change risk)`);
      for (const g of graph.godNodes.slice(0, 10)) L.push(`- \`${g}\``);
    }
    if (graph.symbols?.length) {
      // Exported API + hub files first — scan order would surface tests/docs.
      const fileDegree = new Map(graph.nodes.map((n) => [n.path, n.inDegree + n.outDegree]));
      const ranked = [...graph.symbols].sort(
        (a, b) => (Number(b.exported) - Number(a.exported)) ||
          ((fileDegree.get(b.file) ?? 0) - (fileDegree.get(a.file) ?? 0))
      );
      const byFile = new Map<string, string[]>();
      for (const s of ranked.slice(0, 60)) {
        const arr = byFile.get(s.file) ?? [];
        arr.push(`${s.label}(${s.kind}:${s.line})`);
        byFile.set(s.file, arr);
      }
      L.push(``); L.push(`## Key symbols (file:line)`);
      for (const [file, syms] of [...byFile.entries()].slice(0, 15)) {
        L.push(`- \`${file}\`: ${syms.slice(0, 6).join(", ")}`);
      }
    }

    // Compact dependency edges — the token saver core (capped: an agent
    // needs the hub neighbourhood, not a 250-line dump). Sorted by endpoint
    // centrality so backend + frontend hubs both surface instead of whatever
    // the scanner happened to read first.
    const degree = new Map(graph.nodes.map((n) => [n.path, n.inDegree + n.outDegree]));
    const edges = [...graph.edges]
      .sort((a, b) => (degree.get(b.source)! + degree.get(b.target)!) - (degree.get(a.source)! + degree.get(a.target)!))
      .slice(0, 60);
    L.push(``); L.push(`## Dependencies (${edges.length} shown of ${graph.edges.length})`);
    L.push(`\`from -> to\` means "from imports to".`);
    for (const e of edges) {
      const lbl = (e as { label?: string }).label ? ` (${(e as { label?: string }).label})` : "";
      L.push(`- \`${e.source}\` -> \`${e.target}\`${lbl}`);
    }

    if (flowCtx) {
      const fc = flowCtx.summary;
      if (fc.routes.length) { L.push(``); L.push(`## Routes (${fc.routeCount})`); L.push(fc.routes.slice(0, 30).map((r) => `- ${r}`).join("\n")); }
      // Call chains duplicate the edge list above (different builder) — keep a
      // small sample for the method names only.
      if (fc.callChainLines.length) { L.push(``); L.push(`## Call chains (sample)`); L.push(fc.callChainLines.slice(0, 15).map((c) => `- ${c}`).join("\n")); }
      if (fc.dbLines.length) { L.push(``); L.push(`## Data access`); L.push(fc.dbLines.slice(0, 20).map((d) => `- ${d}`).join("\n")); }
      if (fc.eventLines.length) { L.push(``); L.push(`## Events`); L.push(fc.eventLines.slice(0, 15).map((e) => `- ${e}`).join("\n")); }
      if (fc.middlewareLines.length) { L.push(``); L.push(`## Middleware`); L.push(fc.middlewareLines.slice(0, 10).map((m) => `- ${m}`).join("\n")); }
    }

    if (flowMap?.subDiagrams.length) {
      L.push(``); L.push(`## Flows (mermaid)`);
      for (const d of flowMap.subDiagrams.slice(0, 6)) {
        L.push(``); L.push(`### ${d.title}`);
        L.push(d.description);
        L.push("```mermaid"); L.push(d.mermaidCode); L.push("```");
        if (d.relatedFiles?.length) L.push(`Related: ${d.relatedFiles.map((f) => `\`${f}\``).join(", ")}`);
      }
    }

    // File tree (compact, capped, noise-filtered)
    const tree = (s.workspaceInfo?.files ?? [])
      .map((f) => f.path)
      .filter((p) => !/(?:package-lock\.json|yarn\.lock|pnpm-lock|poetry\.lock|\.min\.(js|css)|\.map|\.pyc|e2e-results\.json|\.d\.ts)$/.test(p))
      .slice(0, 80);
    if (tree.length) {
      L.push(``); L.push(`## File tree (first ${tree.length})`);
      L.push("```"); L.push(tree.join("\n")); L.push("```");
    }

    L.push(``);
    L.push(`---`);
    L.push(`Note for agents: imports above are a static-analysis snapshot, not verified ground truth. Cross-check by reading source files before refactoring. Ask the user for a file path to read full source when needed.`);
    return L.join("\n");
  }

  private async pickSaveLocation(
    defaultFilename: string,
    format: "png" | "svg"
  ): Promise<vscode.Uri | undefined> {
    const folders = vscode.workspace.workspaceFolders;
    const defaultUri = folders?.length
      ? vscode.Uri.joinPath(folders[0].uri, defaultFilename)
      : vscode.Uri.file(defaultFilename);

    const filters: Record<string, string[]> =
      format === "png" ? { "PNG Image": ["png"] } : { "SVG Image": ["svg"] };

    return vscode.window.showSaveDialog({
      defaultUri,
      filters,
      title: `Export Graph as ${format.toUpperCase()}`,
    });
  }

  /** Converts a `data:image/png;base64,....` string into raw bytes. */
  private decodeDataUrl(dataUrl: string): Uint8Array {
    const match = /^data:[^;]+;base64,(.+)$/.exec(dataUrl);
    const base64 = match ? match[1] : dataUrl;
    return Buffer.from(base64, "base64");
  }
}
