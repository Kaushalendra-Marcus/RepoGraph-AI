import * as vscode from "vscode";
import { createProvider, AIProvider } from "../providers";
import { fetchRepo, RepoInfo } from "../analyzer/RepoFetcher";
import { scanWorkspace, WorkspaceInfo } from "../analyzer/WorkspaceScanner";
import { buildDependencyGraph, DependencyGraph, getTopFiles, GraphNode } from "../analyzer/GraphBuilder";
import { summarizeRepo, summarizeFiles, QAAgent, RepoSummary, FileSummary } from "../agents";
import { getWebviewContent } from "./webviewContent";

interface ProviderSettings {
  name: string; apiKey?: string; model?: string; baseUrl?: string;
}

interface AnalysisState {
  repoName: string;
  sourceInfo: SourceInfo;
  repoInfo: RepoInfo;
  graph: DependencyGraph;
  summary: RepoSummary;
  fileSummaries: FileSummary[];
}

type SourceInfo = (RepoInfo | WorkspaceInfo) & { files: Array<{ path: string; content: string; size: number; language: string; absPath?: string }> };

export class RepoGraphPanel implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private provider?: AIProvider;
  private qaAgent?: QAAgent;
  private sourceInfo?: SourceInfo;
  private repoInfo?: RepoInfo;
  private graph?: DependencyGraph;
  private summary?: RepoSummary;
  private cachedAnalysis?: AnalysisState;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView, _ctx: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "public")],
    };
    const iconFiles: Record<string, string> = {
      "local-workspace.svg": "local-workspace.svg.svg",
      "github-url.svg": "github-url.svg.svg",
      "analyze-workspace.svg": "analyze-workspace.svg.svg",
      "analyze-github.svg": "analyze-github.svg.svg",
      "graph-empty.svg": "graph-empty.svg.svg",
      "summary-empty.svg": "summary-empty.svg.svg",
      "qa-empty.svg": "qa-empty.svg.svg",
      "imports.svg": "imports.svg.svg",
      "used-by.svg": "used-by.svg.svg",
      "language.svg": "language.svg.svg",
      "open-file.svg": "open-file.svg.svg",
    };
    const iconUris = Object.fromEntries(
      Object.entries(iconFiles).map(([name, file]) => [
        name,
        webviewView.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "public", file)).toString(),
      ])
    );
    webviewView.webview.html = getWebviewContent({
      cspSource: webviewView.webview.cspSource,
      iconUris,
    });
    void (async () => {
      await this.loadSavedSettings();
      await this.restoreCachedAnalysis();
    })();

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      try {
        switch (msg.type) {
          case "saveProvider":    await this.handleSaveProvider(msg.payload); break;
          case "analyzeGithub":  await this.handleAnalyzeGithub(msg.payload); break;
          case "analyzeLocal":   await this.handleAnalyzeLocal(); break;
          case "askQuestion":    await this.handleQuestion(msg.payload); break;
          case "openFile":       await this.handleOpenFile(msg.payload); break;
          case "clearChat":      this.qaAgent?.clearHistory(); break;
          case "getSettings":    this.loadSavedSettings(); break;
          default:               break;
        }
      } catch (e: any) {
        this.post({ type: "error", payload: { message: `Error: ${e.message}` } });
      }
    });
  }

  // ── SETTINGS ─────────────────────────────────────────────────────────────
  private async handleSaveProvider(payload: ProviderSettings) {
    const { name, apiKey, model, baseUrl } = payload;
    if (apiKey) await this.context.secrets.store(`repograph.${name}.apiKey`, apiKey);
    await this.context.globalState.update("repograph.activeProvider", name);
    await this.context.globalState.update(`repograph.${name}.model`, model);
    if (baseUrl) await this.context.globalState.update(`repograph.${name}.baseUrl`, baseUrl);
    try {
      const key = apiKey || await this.context.secrets.get(`repograph.${name}.apiKey`);
      this.provider = createProvider(name, { name, apiKey: key, model, baseUrl });
      if (this.repoInfo && this.graph && this.summary) {
        this.qaAgent = new QAAgent(this.provider, this.repoInfo, this.graph, this.summary);
      }
      this.post({ type: "providerSaved", payload: { name, success: true } });
    } catch (e: any) {
      this.post({ type: "error", payload: { message: e.message } });
    }
  }

  private async loadSavedSettings() {
    const name = this.context.globalState.get<string>("repograph.activeProvider");
    if (!name) { return; }
    const apiKey = await this.context.secrets.get(`repograph.${name}.apiKey`);
    const model = this.context.globalState.get<string>(`repograph.${name}.model`);
    const baseUrl = this.context.globalState.get<string>(`repograph.${name}.baseUrl`);
    try { this.provider = createProvider(name, { name, apiKey, model, baseUrl }); } catch {}
    this.post({ type: "settingsLoaded", payload: { providerName: name, model, baseUrl, hasKey: !!apiKey } });

    // Tell UI if workspace is available
    const hasWorkspace = !!(vscode.workspace.workspaceFolders?.length);
    this.post({ type: "workspaceStatus", payload: { hasWorkspace, name: vscode.workspace.workspaceFolders?.[0]?.name } });
  }

  private async restoreCachedAnalysis() {
    const cached = this.context.workspaceState.get<AnalysisState>("repograph.lastAnalysis");
    if (!cached) {
      return;
    }

    this.cachedAnalysis = cached;
    this.sourceInfo = cached.sourceInfo;
    this.repoInfo = cached.repoInfo;
    this.graph = cached.graph;
    this.summary = cached.summary;

    if (this.provider) {
      this.qaAgent = new QAAgent(this.provider, cached.repoInfo, cached.graph, cached.summary);
    }

    this.post({
      type: "restoreAnalysis",
      payload: {
        repoName: cached.repoName,
        graph: cached.graph,
        summary: cached.summary,
        fileSummaries: cached.fileSummaries,
        hasQA: !!this.qaAgent,
      },
    });
  }

  // ── LOCAL WORKSPACE ───────────────────────────────────────────────────────
  private async handleAnalyzeLocal() {
    if (!this.provider) {
      this.post({ type: "error", payload: { message: "Please configure an AI provider first (Settings tab)" } });
      return;
    }
    try {
      this.post({ type: "progress", payload: { step: 1, message: "Scanning workspace files..." } });
      const wsInfo = await scanWorkspace((msg) => {
        this.post({ type: "progress", payload: { step: 1, message: msg } });
      });
      if (!wsInfo) throw new Error("No workspace found");
      await this.runAnalysis(wsInfo, wsInfo.name);
    } catch (e: any) {
      this.post({ type: "error", payload: { message: e.message } });
    }
  }

  // ── GITHUB ────────────────────────────────────────────────────────────────
  private async handleAnalyzeGithub(payload: { url: string; githubToken?: string }) {
    if (!this.provider) {
      this.post({ type: "error", payload: { message: "Please configure an AI provider first (Settings tab)" } });
      return;
    }
    try {
      this.post({ type: "progress", payload: { step: 1, message: "Fetching repository..." } });
      const repoInfo = await fetchRepo(payload.url, payload.githubToken, (msg) => {
        this.post({ type: "progress", payload: { step: 1, message: msg } });
      });
      await this.runAnalysis(repoInfo, `${repoInfo.owner}/${repoInfo.repo}`);
    } catch (e: any) {
      this.post({ type: "error", payload: { message: e.message } });
    }
  }

  // ── CORE ANALYSIS PIPELINE ────────────────────────────────────────────────
  private async runAnalysis(info: SourceInfo, repoName: string) {
    if (!this.provider) {
      this.post({ type: "error", payload: { message: "AI provider not configured. Please configure a provider in Settings first." } });
      return;
    }
    this.sourceInfo = info;

    // Step 2: Build graph
    this.post({ type: "progress", payload: { step: 2, message: "Building dependency graph..." } });
    this.graph = buildDependencyGraph(info.files);
    this.post({ type: "graphReady", payload: { nodes: this.graph.nodes, edges: this.graph.edges } });

    // Step 3: AI Summary
    this.post({ type: "progress", payload: { step: 3, message: "Generating AI summary..." } });
    const fakeRepoInfo = {
      owner: repoName.split("/")[0] || repoName,
      repo: repoName.split("/")[1] || repoName,
      description: "",
      stars: 0,
      language: info.files[0]?.language || "",
      files: info.files as any,
      tree: [],
    };
    const repoInfo = fakeRepoInfo as RepoInfo;
    this.repoInfo = repoInfo;
    this.summary = await summarizeRepo(this.provider, fakeRepoInfo, this.graph);
    this.post({ type: "summaryReady", payload: this.summary });

    // Step 4: File summaries
    this.post({ type: "progress", payload: { step: 4, message: "Summarizing key files..." } });
    const topNodes = getTopFiles(this.graph, 15);
    const fileSummaries = await summarizeFiles(this.provider, topNodes, fakeRepoInfo, (done, total) => {
      this.post({ type: "progress", payload: { step: 4, message: `Summarizing files... ${done}/${total}` } });
    });
    this.post({ type: "fileSummariesReady", payload: fileSummaries });

    this.cachedAnalysis = {
      repoName,
      sourceInfo: info,
      repoInfo,
      graph: this.graph,
      summary: this.summary,
      fileSummaries,
    };
    await this.context.workspaceState.update("repograph.lastAnalysis", this.cachedAnalysis);

    // Step 5: Q&A ready
    this.qaAgent = new QAAgent(this.provider, repoInfo, this.graph, this.summary);
    this.post({ type: "analysisComplete", payload: { repoName } });
  }

  // ── OPEN FILE ─────────────────────────────────────────────────────────────
  private async handleOpenFile(payload: { path: string }) {
    if (!this.graph) {
      this.post({ type: "error", payload: { message: "Please analyze a repository first" } });
      return;
    }
    // Try absolute path first (local), then search workspace
    try {
      const node = this.graph.nodes.find((n) => n.path === payload.path);
      let uri: vscode.Uri | undefined;

      if (node?.absPath) {
        uri = vscode.Uri.file(node.absPath);
      } else if (vscode.workspace.workspaceFolders?.length) {
        const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const normalizedPath = payload.path.split("/").filter(Boolean);
        uri = vscode.Uri.joinPath(vscode.Uri.file(root), ...normalizedPath);
      }

      if (uri) {
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, { preview: false });
      }
    } catch (e: any) {
      this.post({ type: "error", payload: { message: `Cannot open file: ${e.message}` } });
    }
  }

  // ── Q&A ──────────────────────────────────────────────────────────────────
  private async handleQuestion(payload: { question: string }) {
    if (!this.qaAgent) {
      this.post({ type: "error", payload: { message: "Please analyze a repository first" } });
      return;
    }
    try {
      this.post({ type: "thinking", payload: {} });
      const answer = await this.qaAgent.ask(payload.question);
      this.post({ type: "answer", payload: { question: payload.question, answer } });
    } catch (e: any) {
      this.post({ type: "error", payload: { message: e.message } });
    }
  }

  private post(message: object) { this.view?.webview.postMessage(message); }
}
