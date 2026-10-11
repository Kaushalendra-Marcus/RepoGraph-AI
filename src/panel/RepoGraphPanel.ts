import * as vscode from "vscode";
import { getWebviewContent } from "./webview/index";
import { PanelState } from "./handlers/PanelState";
import { SettingsHandler } from "./handlers/SettingsHandler";
import { AnalysisHandler } from "./handlers/AnalysisHandler";
import { HistoryHandler } from "./handlers/HistoryHandler";
import { FileHandler } from "./handlers/FileHandler";
import { FlowHandler } from "./handlers/FlowHandler";
import { ExportHandler } from "./handlers/ExportHandler";
import { scanWorkspace } from "../analyzer/WorkspaceScanner";
import {
  buildDependencyGraph,
  buildLayerGroups,
  buildGraphReport,
} from "../analyzer/GraphBuilder";
import {
  resolveCacheDir,
  loadGraphCache,
  saveGraphCache,
  buildManifest,
  diffManifest,
} from "../analyzer/GraphCache";
import { buildHeuristicRepoSummary } from "../agents/RepoSummaryAgent";
import { buildHeuristicSummaries } from "../agents/FileSummaryAgent";
import { analyzeFlows } from "../analyzer/FlowAnalyzer";
import { buildStaticFlowMap, annotateWithHealth, buildGuidedTour } from "../agents/FlowDiagramAgent";

export class RepoGraphPanel implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private readonly state = new PanelState();
  private readonly output: vscode.OutputChannel;

  // Handlers
  private settings!: SettingsHandler;
  private analysis!: AnalysisHandler;
  private history!: HistoryHandler;
  private files!: FileHandler;
  private flow!: FlowHandler;
  private exporter!: ExportHandler;

  // One-click auto-index state (graphify `--update`, but automatic)
  private indexing = false;
  private watchTimer?: NodeJS.Timeout;
  private lastIndexAt = 0;
  onIndexStatus?: (msg: string) => void;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.output = vscode.window.createOutputChannel("RepoGraph AI");
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _ctx: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };

    // Build icon URI map for the webview
    const iconNames = [
      "local-workspace.svg", "analyze-workspace.svg", "graph-empty.svg",
      "summary-empty.svg", "qa-empty.svg", "open-file.svg",
      "imports.svg", "used-by.svg", "language.svg", "user.svg", "ai.svg",
    ];
    const iconUris: Record<string, string> = {};
    for (const name of iconNames) {
      iconUris[name] = webviewView.webview
        .asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "public", name))
        .toString();
    }

    webviewView.webview.html = getWebviewContent({
      cspSource: webviewView.webview.cspSource,
      iconUris,
    });

    // Init all handlers
    const post = this.post.bind(this);
    this.history  = new HistoryHandler(this.context, this.state, post);
    this.settings = new SettingsHandler(this.context, this.state, post);
    this.analysis = new AnalysisHandler(this.context, this.state, this.history, post);
    this.files    = new FileHandler(this.state, post);
    this.flow     = new FlowHandler(this.state, post);
    this.exporter = new ExportHandler(this.state, post);

    // Boot sequence
    void this.settings.loadSavedSettings();
    void this.history.restore().then(() => {
      // If background auto-index already finished before the view opened,
      // push the graph immediately so there's no dead panel / no re-click.
      if (this.state.currentGraph) this.pushGraph("restored");
    });

    // Message router
    webviewView.webview.onDidReceiveMessage(async (msg) => {
      this.log(`← ${msg?.type}`);
      try {
        switch (msg.type) {
          // Settings
          case "getSettings":     await this.settings.loadSavedSettings(); break;
          case "saveProvider":    await this.settings.saveProvider(msg.payload); break;
          // Analysis
          case "analyzeLocal":    await this.analysis.analyzeLocal(); break;
          case "saveLayout":      await this.analysis.saveLayout(msg.payload); break;
          // History
          case "loadAnalysis":    await this.history.load(msg.payload); break;
          case "deleteAnalysis":  await this.history.delete(msg.payload); break;
          // Q&A (now inside Insights tab)
          case "askQuestion":     await this.handleQuestion(msg.payload); break;
          case "clearChat":       this.state.qaAgent?.clearHistory(); break;
          // On-demand file summary (Insights file lookup)
          case "summarizeFile":   await this.files.summarizeFile(msg.payload); break;
          // AI Tools
          // File
          case "openFile":        await this.files.openFile(msg.payload); break;
          // Flow
          case "generateCustomFlow": await this.flow.handleGenerateCustomFlow(msg.payload); break;
          case "getFunctionFlow":   await this.flow.handleGetFunctionFlow(msg.payload); break;
          // Export
          case "exportGraph":      await this.exporter.exportGraph(msg.payload); break;
          case "exportFlow":       await this.exporter.exportFlow(msg.payload); break;
          case "exportAgentContext": await this.exporter.exportAgentContext(msg.payload); break;
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        this.log(`ERROR in ${msg?.type}: ${message}`);
        this.post({ type: "error", payload: { message } });
      }
    });
  }

  private async handleQuestion(payload: { question: string }) {
    if (!this.state.qaAgent) {
      this.post({ type: "answer", payload: { answer: "Please analyze the workspace first." } });
      return;
    }
    const answer = await this.state.qaAgent.ask(payload.question);
    this.post({ type: "answer", payload: { answer } });
  }

  // ── One-click auto-index ──────────────────────────────────────────────
  // Open folder → graph ready. No CLI, no `/graphify .`, no `--update` by hand.
  // Graph + heuristic summary + static flows are free (no key). AI upgrade
  // still happens via Analyze or when repograph.autoAI is on + provider set.

  getState(): PanelState {
    return this.state;
  }

  /** Called by the file watcher — debounced so save-storms index once. */
  queueFileEvent() {
    if (this.watchTimer) clearTimeout(this.watchTimer);
    this.watchTimer = setTimeout(() => {
      void this.ensureGraphIndexed("watch").catch((e) =>
        this.log(`auto-index (watch) failed: ${e instanceof Error ? e.message : String(e)}`)
      );
    }, 1500);
  }

  async ensureGraphIndexed(reason: "startup" | "watch" | "manual" = "manual"): Promise<boolean> {
    if (this.indexing) return false;
    const cfg = vscode.workspace.getConfiguration("repograph");
    if (reason !== "manual" && cfg.get<boolean>("autoIndex") === false) return false;
    if (!vscode.workspace.workspaceFolders?.length) return false;

    this.indexing = true;
    this.setStatus(reason === "watch" ? "$(sync~spin) RepoGraph: updating…" : "$(graph) RepoGraph: indexing…");
    try {
      const wsInfo = await scanWorkspace();
      if (!wsInfo) return false;

      const cacheDir = await resolveCacheDir(this.context);
      const cached = cacheDir ? await loadGraphCache(cacheDir) : null;
      // Root changed → stale cache is worse than no cache.
      const sameRoot = !cached || cached.manifest.rootPath === wsInfo.rootPath;
      const diff = diffManifest(sameRoot ? cached?.manifest ?? null : null, wsInfo.files);

      if (diff.isHit && cached && this.state.currentGraph) {
        // Already in memory and nothing changed — nothing to do.
        this.lastIndexAt = Date.now();
        this.setStatus(`$(check) RepoGraph: ready (${cached.graph.nodes.length} files)`);
        return true;
      }

      if (diff.isHit && cached) {
        this.applyIndexedState(wsInfo.name, wsInfo.rootPath, wsInfo.files as never[], cached.graph);
        this.pushGraph("cache-hit");
        this.lastIndexAt = Date.now();
        this.setStatus(`$(check) RepoGraph: ready (${cached.graph.nodes.length} files)`);
        this.log(`auto-index (${reason}): cache hit, ${wsInfo.files.length} files, no rebuild`);
        return true;
      }

      const graph = buildDependencyGraph(wsInfo.files);
      this.applyIndexedState(wsInfo.name, wsInfo.rootPath, wsInfo.files as never[], graph);
      this.pushGraph(reason === "watch" ? "watch" : "fresh");

      if (cacheDir) {
        await saveGraphCache(cacheDir, graph, buildManifest(wsInfo.name, wsInfo.rootPath, wsInfo.files));
      }
      const changedN = diff.added.length + diff.changed.length + diff.deleted.length;
      this.lastIndexAt = Date.now();
      this.setStatus(`$(check) RepoGraph: ready (${graph.nodes.length} files)`);
      this.log(
        `auto-index (${reason}): rebuilt — ${graph.nodes.length} files, ${graph.edges.length} edges, ` +
          `${changedN} changed, ${graph.symbols?.length ?? 0} symbols`
      );
      return true;
    } catch (e: unknown) {
      this.setStatus("$(warning) RepoGraph: index failed");
      throw e;
    } finally {
      this.indexing = false;
    }
  }

  private applyIndexedState(
    repoName: string,
    rootPath: string,
    files: { path: string; content: string; size: number; language: string; absPath?: string }[],
    graph: import("../analyzer/GraphBuilder").DependencyGraph
  ) {
    // Keep full file contents in memory for Q&A/snippets (scan already read them).
    this.state.workspaceInfo = { name: repoName, rootPath, files: files as never[], isLocal: true as const };
    this.state.currentGraph = graph;
    // Free, instant overviews so Summary/Flow tabs are useful before any AI key.
    try {
      const summary = buildHeuristicRepoSummary(this.state.workspaceInfo, graph);
      (summary as unknown as Record<string, unknown>)._ai = false;
      this.state.currentSummary = summary;
      const fileSummaries = buildHeuristicSummaries(graph.nodes, this.state.workspaceInfo.files, 5);
      this.state.currentFileSummaries = fileSummaries;
      const flowCtx = analyzeFlows(this.state.workspaceInfo.files);
      this.state.currentFlowContext = flowCtx;
      const raw = buildStaticFlowMap(repoName, summary, fileSummaries, flowCtx, graph.symbols ?? []);
      const withHealth = annotateWithHealth(raw, graph);
      withHealth.tour = buildGuidedTour(withHealth);
      this.state.currentFlowMap = withHealth;
      // No summaryReady post without a key: summary is AI-only.
      this.post({ type: "fileSummariesReady", payload: fileSummaries });
      this.post({ type: "flowMapReady", payload: this.state.currentFlowMap });
      this.post({ type: "analysisComplete", payload: { repoName, hasAI: false, auto: true } });
    } catch (e: unknown) {
      this.log(`heuristic overviews failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private pushGraph(_why: string) {
    const graph = this.state.currentGraph;
    if (!graph || !this.view) return;
    let layerGroups: unknown = undefined;
    try {
      layerGroups = buildLayerGroups(graph);
    } catch { /* best-effort */ }
    this.post({
      type: "graphReady",
      payload: {
        nodes: graph.nodes,
        edges: graph.edges,
        layerGroups,
        symbols: graph.symbols?.slice(0, 400),
        communities: graph.communities,
        godNodes: graph.godNodes,
        health: graph.health,
        stats: graph.stats,
        report: graph.nodes.length ? buildGraphReport(graph, this.state.workspaceInfo?.name ?? "project") : "",
      },
    });
  }

  private setStatus(msg: string) {
    this.onIndexStatus?.(msg);
  }

  private post(message: object) {
    this.view?.webview.postMessage(message);
  }

  private log(msg: string) {
    this.output.appendLine(`[${new Date().toISOString()}] ${msg}`);
  }
}
