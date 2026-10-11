import * as vscode from "vscode";
import { PanelState } from "./PanelState";
import { summarizeOneFile, buildHeuristicSummary } from "../../agents/FileSummaryAgent";

export class FileHandler {
  constructor(
    private state: PanelState,
    private post: (msg: object) => void
  ) {}

  // ── Open file in editor ─────────────────────────────────────────────────
  // Supports `path:line` jump targets from flow diagrams (click-to-line).

  async openFile(payload: { path: string; line?: number }) {
    let relPath = payload.path;
    let line = payload.line;
    // Accept "src/foo.ts:42" in a single string (flow chips send this shape).
    const m = /^(.*?):(\d+)$/.exec(relPath);
    if (m && !line) {
      relPath = m[1];
      line = parseInt(m[2], 10);
    }
    const node = this.state.currentGraph?.nodes.find((n) => n.path === relPath);

    let uri: vscode.Uri | undefined;

    if (node?.absPath) {
      uri = vscode.Uri.file(node.absPath);
    } else if (vscode.workspace.workspaceFolders?.length) {
      const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
      uri = vscode.Uri.file(`${root}/${relPath}`);
    }

    if (!uri) return;

    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc, { preview: false });
      if (line && line > 0) {
        const pos = new vscode.Position(Math.max(0, line - 1), 0);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      this.post({ type: "error", payload: { message: `Cannot open: ${message}` } });
    }
  }

  // ── On-demand single-file summary (Insights file lookup) ────────────────

  async summarizeFile(payload: { path: string }) {
    const query = payload.path?.trim();
    if (!query) {
      this.post({ type: "fileSummaryError", payload: { message: "Type a file path first." } });
      return;
    }
    if (!this.state.workspaceInfo || !this.state.currentGraph) {
      this.post({ type: "fileSummaryError", payload: { message: "Analyze the workspace first." } });
      return;
    }

    // Fuzzy match: exact, ends-with, or filename contains
    const files = this.state.workspaceInfo.files;
    const q = query.toLowerCase();
    const exact = files.find((f) => f.path.toLowerCase() === q);
    const endsWith = files.find((f) => f.path.toLowerCase().endsWith(q));
    const contains = files.find(
      (f) => f.path.toLowerCase().includes(q) || f.path.split("/").pop()?.toLowerCase().includes(q)
    );
    const match = exact ?? endsWith ?? contains;
    if (!match) {
      this.post({ type: "fileSummaryError", payload: { message: `No file matches "${query}". Try part of the filename.` } });
      return;
    }

    // Without AI key, return the fast heuristic summary
    if (!this.state.provider) {
      const node = this.state.currentGraph.nodes.find((n) => n.path === match.path);
      this.post({
        type: "fileSummaryReady",
        payload: { ...buildHeuristicSummary(match, node), _ai: false },
      });
      return;
    }

    this.post({ type: "fileSummaryBusy", payload: { busy: true, path: match.path } });
    try {
      const summary = await summarizeOneFile(
        this.state.provider,
        match.path,
        this.state.currentGraph.nodes,
        files
      );
      // Cache it so node-detail + top list stay consistent
      const existing = (this.state.currentFileSummaries ?? []).find((s) => s.path === summary.path);
      if (!existing) this.state.currentFileSummaries = [...(this.state.currentFileSummaries ?? []), summary];
      this.post({ type: "fileSummaryReady", payload: { ...summary, _ai: true } });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      this.post({ type: "fileSummaryError", payload: { message } });
    } finally {
      this.post({ type: "fileSummaryBusy", payload: { busy: false } });
    }
  }

  // ── Q&A ────────────────────────────────────────────────────────────────

  async askQuestion(payload: { question: string }) {
    if (!this.state.qaAgent) {
      this.post({
        type: "answer",
        payload: { answer: "Add an AI key in Settings, then analyze again to unlock Q&A." },
      });
      return;
    }

    try {
      const answer = await this.state.qaAgent.ask(payload.question);
      this.post({ type: "answer", payload: { answer } });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      this.post({ type: "answer", payload: { answer: `Error: ${message}` } });
    }
  }
}
