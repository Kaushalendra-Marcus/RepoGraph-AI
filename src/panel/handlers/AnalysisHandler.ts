import * as vscode from "vscode";
import { scanWorkspace } from "../../analyzer/WorkspaceScanner";
import { buildDependencyGraph, buildLayerGroups, buildGraphReport } from "../../analyzer/GraphBuilder";
import { analyzeFlows } from "../../analyzer/FlowAnalyzer";
import { summarizeRepo, buildHeuristicRepoSummary } from "../../agents/RepoSummaryAgent";
import { summarizeFiles, buildHeuristicSummaries } from "../../agents/FileSummaryAgent";
import { autoDetectFlows, buildStaticFlowMap, annotateWithHealth, buildGuidedTour } from "../../agents/FlowDiagramAgent";
import { QAAgent } from "../../agents/QAAgent";
import { PanelState } from "./PanelState";
import { HistoryHandler, AnalysisRecord } from "./HistoryHandler";

export class AnalysisHandler {
  constructor(
    private context: vscode.ExtensionContext,
    private state: PanelState,
    private history: HistoryHandler,
    private post: (msg: object) => void
  ) {}

  async analyzeLocal() {
    // NOTE: no provider required. Graph + static flows always run.
    // AI steps (repo summary, file summaries, AI flows) run only if provider exists.
    const hasAI = !!this.state.provider;

    // ── Step 1: Scan ──────────────────────────────────────────────────────
    this.post({ type: "progress", payload: { step: 1, message: "Scanning workspace files..." } });
    const wsInfo = await scanWorkspace((msg) =>
      this.post({ type: "progress", payload: { step: 1, message: msg } })
    );
    if (!wsInfo) throw new Error("No workspace folder found.");
    this.state.workspaceInfo = wsInfo;

    // ── Step 2: Dependency graph (always, no AI) ──────────────────────────
    this.post({ type: "progress", payload: { step: 2, message: "Building dependency graph..." } });
    const graph = buildDependencyGraph(wsInfo.files);
    this.state.currentGraph = graph;
    const layerGroups = buildLayerGroups(graph);
    const report = buildGraphReport(graph, wsInfo.name);
    this.post({
      type: "graphReady",
      payload: {
        nodes: graph.nodes, edges: graph.edges, layerGroups,
        // Knowledge-graph extensions (old webviews ignore unknown fields)
        symbols: graph.symbols?.slice(0, 400),
        communities: graph.communities,
        godNodes: graph.godNodes,
        health: graph.health,
        stats: graph.stats,
        report,
      },
    });
    await this.sendSavedLayout();

    // ── Step 3: Repo summary (AI or heuristic) ────────────────────────────
    if (hasAI) {
      this.post({ type: "progress", payload: { step: 3, message: "Generating AI summary..." } });
      try {
        const summary = await summarizeRepo(this.state.provider!, wsInfo, graph);
        (summary as unknown as Record<string, unknown>)._ai = true;
        this.state.currentSummary = summary;
        this.post({ type: "summaryReady", payload: { ...summary, _ai: true } });
      } catch (e: unknown) {
        // AI failed (bad key, quota): summary stays an AI-only part, so
        // compute internals only and surface the error instead of fake prose.
        const summary = buildHeuristicRepoSummary(wsInfo, graph);
        (summary as unknown as Record<string, unknown>)._ai = false;
        this.state.currentSummary = summary;
        this.post({
          type: "aiUpgrade",
          payload: { reason: e instanceof Error ? e.message : String(e) },
        });
      }
    } else {
      // No AI key: summary is an AI-only part, so compute it for internal
      // use (flows, context export) but never display it as a summary.
      const summary = buildHeuristicRepoSummary(wsInfo, graph);
      (summary as unknown as Record<string, unknown>)._ai = false;
      this.state.currentSummary = summary;
      this.post({ type: "progress", payload: { step: 3, message: "Skipping AI summary (no key)..." } });
    }

    // ── Step 4: File summaries (top 10 AI, or top 5 static) ───────────────
    if (hasAI) {
      this.post({ type: "progress", payload: { step: 4, message: "Summarizing key files..." } });
      try {
        const fileSummaries = await summarizeFiles(
          this.state.provider!,
          graph.nodes,
          wsInfo.files,
          (done, total) =>
            this.post({ type: "progress", payload: { step: 4, message: `Summarizing files ${done}/${total}...` } })
        );
        this.state.currentFileSummaries = fileSummaries;
        this.post({ type: "fileSummariesReady", payload: fileSummaries });
      } catch {
        const fileSummaries = buildHeuristicSummaries(graph.nodes, wsInfo.files, 5);
        this.state.currentFileSummaries = fileSummaries;
        this.post({ type: "fileSummariesReady", payload: fileSummaries });
      }
    } else {
      // No key: file facts stay structural (graph detail + context export),
      // the AI prose summary is never posted.
      const fileSummaries = buildHeuristicSummaries(graph.nodes, wsInfo.files, 5);
      this.state.currentFileSummaries = fileSummaries;
      this.post({ type: "fileSummariesReady", payload: fileSummaries });
    }

    // ── Step 5: Static flow analysis (always) + AI diagrams (if key) ──────
    this.post({ type: "progress", payload: { step: 5, message: "Analyzing code flows..." } });
    const flowCtx = analyzeFlows(wsInfo.files);
    this.state.currentFlowContext = flowCtx;
    this.post({
      type: "progress",
      payload: {
        step: 5,
        message: `Detected ${flowCtx.routes.length} routes, ${flowCtx.callChains.length} call chains...`,
      },
    });

    if (hasAI) {
      try {
        const raw = await autoDetectFlows(
          this.state.provider!,
          wsInfo,
          this.state.currentSummary!,
          this.state.currentFileSummaries ?? [],
          flowCtx,
          graph.symbols ?? []
        );
        const withHealth = annotateWithHealth(raw, graph);
        withHealth.tour = buildGuidedTour(withHealth);
        this.state.currentFlowMap = withHealth;
        this.post({ type: "flowMapReady", payload: withHealth });
      } catch {
        const raw = buildStaticFlowMap(wsInfo.name, this.state.currentSummary!, this.state.currentFileSummaries ?? [], flowCtx, graph.symbols ?? []);
        const withHealth = annotateWithHealth(raw, graph);
        withHealth.tour = buildGuidedTour(withHealth);
        this.state.currentFlowMap = withHealth;
        this.post({ type: "flowMapReady", payload: withHealth });
      }
    } else {
      const raw = buildStaticFlowMap(wsInfo.name, this.state.currentSummary!, this.state.currentFileSummaries ?? [], flowCtx, graph.symbols ?? []);
      const withHealth = annotateWithHealth(raw, graph);
      withHealth.tour = buildGuidedTour(withHealth);
      this.state.currentFlowMap = withHealth;
      this.post({ type: "flowMapReady", payload: withHealth });
    }

    // ── Q&A agent (only with AI) ──────────────────────────────────────────
    if (hasAI) {
      this.state.qaAgent = new QAAgent(this.state.provider!, wsInfo, graph, this.state.currentSummary!);
    } else {
      this.state.qaAgent = undefined;
      this.post({
        type: "aiUpgrade",
        payload: {
          reason: "Graph + flows ready without AI. Add a free Groq key in Settings to unlock AI summaries, file explanations, Q&A and custom flows.",
        },
      });
    }

    // ── Persist ───────────────────────────────────────────────────────────
    const now   = Date.now();
    const label = `${wsInfo.name}: ${new Date(now).toLocaleString("en-IN", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    })}`;

    const record: AnalysisRecord = {
      id: `${now}`,
      label,
      timestamp: now,
      repoName: wsInfo.name,
      // Slim the graph for storage — keep first 500 edges, cap symbols/typedEdges
      graph: {
        nodes: graph.nodes,
        edges: graph.edges.slice(0, 500),
        symbols: graph.symbols?.slice(0, 400),
        typedEdges: graph.typedEdges?.slice(0, 800),
        communities: graph.communities,
        godNodes: graph.godNodes,
        health: graph.health,
        stats: graph.stats,
      },
      summary: this.state.currentSummary!,
      fileSummaries: this.state.currentFileSummaries ?? [],
      flowMap: this.state.currentFlowMap,
    };

    await this.history.saveRecord(record);
    this.post({ type: "historyLoaded", payload: { records: this.history.listMeta() } });
    this.post({ type: "analysisComplete", payload: { repoName: wsInfo.name, hasAI } });
  }

  async sendSavedLayout() {
    const positions = this.context.workspaceState.get<{ id: string; x: number; y: number }[]>(
      "repograph.graphLayout"
    );
    if (positions?.length) {
      this.post({ type: "layoutLoaded", payload: { positions } });
    }
  }

  async saveLayout(payload: { positions: { id: string; x: number; y: number; z?: number }[] }) {
    await this.context.workspaceState.update("repograph.graphLayout", payload.positions);
  }
}
