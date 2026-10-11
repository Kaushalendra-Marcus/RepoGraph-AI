import * as vscode from "vscode";
import { generateCustomFlow, buildFunctionFlow } from "../../agents/FlowDiagramAgent";
import { PanelState } from "./PanelState";

export class FlowHandler {
  constructor(
    private state: PanelState,
    private post: (msg: object) => void
  ) {}

  async handleGenerateCustomFlow(payload: { question: string }) {
    const provider = this.state.provider ?? (await tryLMProvider());
    if (!provider) {
      this.post({ type: "error", payload: { message: "Configure an AI provider in Settings first (or use a Copilot model if available)." } });
      return;
    }
    if (!this.state.currentSummary || !this.state.currentFlowContext) {
      this.post({ type: "error", payload: { message: "Analyze a workspace first before generating flow diagrams." } });
      return;
    }
    if (!payload.question?.trim()) {
      this.post({ type: "error", payload: { message: "Please enter a question about the codebase flow." } });
      return;
    }

    try {
      const diagram = await generateCustomFlow(
        provider,
        payload.question,
        this.state.workspaceInfo!,
        this.state.currentSummary,
        this.state.currentFileSummaries ?? [],
        this.state.currentFlowContext,
        this.state.currentGraph
          ? { nodes: this.state.currentGraph.nodes, symbols: this.state.currentGraph.symbols }
          : undefined
      );
      this.post({ type: "customFlowReady", payload: { diagram } });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      this.post({ type: "error", payload: { message: `Flow generation failed: ${message}` } });
    }
  }

  // L5 lite: function control-flow on demand (no AI, regex CFG with file:line).
  async handleGetFunctionFlow(payload: { file: string; function: string }) {
    const file = payload.file?.trim();
    const fn = payload.function?.trim();
    if (!file || !fn) {
      this.post({ type: "error", payload: { message: "Enter file + function first." } });
      return;
    }
    const wsFile = this.state.workspaceInfo?.files.find(
      (f) => f.path === file || f.path.endsWith("/" + file)
    );
    const content = wsFile?.content;
    // Fall back to reading from disk when workspaceInfo was restored without contents.
    let src = content;
    if (!src && vscode.workspace.workspaceFolders?.length) {
      try {
        const uri = vscode.Uri.file(`${vscode.workspace.workspaceFolders[0].uri.fsPath}/${file}`);
        const bytes = await vscode.workspace.fs.readFile(uri);
        src = new TextDecoder().decode(bytes);
      } catch { /* fall through to error */ }
    }
    if (!src) {
      this.post({ type: "error", payload: { message: `File not found in workspace: ${file}` } });
      return;
    }
    const result = buildFunctionFlow(file, fn, src);
    if (!result) {
      this.post({ type: "error", payload: { message: `Function "${fn}" not found in ${file}.` } });
      return;
    }
    this.post({ type: "customFlowReady", payload: { diagram: result.diagram } });
  }
}

// ── VS Code Language Model fallback (Swark trick: Copilot free tier, no key) ──
// Returns an AIProvider backed by vscode.lm when available, else null.

async function tryLMProvider(): Promise<import("../../providers/types").AIProvider | null> {
  try {
    const lm = (vscode as unknown as { lm?: {
      selectChatModels: (opts?: { vendor?: string; family?: string }) => Promise<Array<{
        sendRequest: (msgs: Array<{ role: number; text: string }>, opts?: unknown, tok?: unknown) => Promise<unknown>;
      }>>;
    } }).lm;
    if (!lm?.selectChatModels) return null;
    const models = await lm.selectChatModels({ vendor: "copilot" });
    const model = models[0] ?? (await lm.selectChatModels())[0];
    if (!model) return null;
    return {
      async chat(messages, systemPrompt) {
        const { LanguageModelChatMessage } = vscode as unknown as {
          LanguageModelChatMessage: {
            User: (t: string) => { role: number; text: string };
            Assistant: (t: string) => { role: number; text: string };
          };
        };
        const req: Array<{ role: number; text: string }> = [];
        // vscode.lm has no system role in older APIs — fold it into first user turn.
        const sys = systemPrompt ? `${systemPrompt}\n\n` : "";
        messages.forEach((m, i) => {
          const text = i === 0 ? sys + m.content : m.content;
          req.push(m.role === "assistant"
            ? LanguageModelChatMessage.Assistant(text)
            : LanguageModelChatMessage.User(text));
        });
        const resp = (await (model as unknown as {
          sendRequest: (msgs: unknown[]) => Promise<AsyncIterable<{ text: string }>>;
        }).sendRequest(req as unknown[])) as AsyncIterable<{ text: string }>;
        let out = "";
        for await (const part of resp) out += part.text ?? "";
        if (!out) throw new Error("Empty response from language model.");
        return out;
      },
    };
  } catch {
    return null;
  }
}
