import { AIProvider, Message } from "../providers/types";
import { WorkspaceInfo } from "../analyzer/WorkspaceScanner";
import { DependencyGraph } from "../analyzer/GraphBuilder";
import { RepoSummary } from "./RepoSummaryAgent";

export class QAAgent {
  private history: Message[] = [];

  constructor(
    private provider: AIProvider,
    private info: WorkspaceInfo,
    private graph: DependencyGraph,
    private summary: RepoSummary
  ) {}

  async ask(question: string): Promise<string> {
    const context = this.buildContext(question);

    const provenance = this.graph.stats
      ? `Graph provenance: EXTRACTED ${this.graph.stats.extracted} · INFERRED ${this.graph.stats.inferred} · AMBIGUOUS ${this.graph.stats.ambiguous}.`
      : "";
    const health = this.graph.health && !this.graph.health.ok
      ? `Health: ${this.graph.health.warnings.join("; ")}`
      : "";

    const systemPrompt = `You are RepoGraph AI, an expert code analyst helping developers understand the workspace "${this.info.name}".

Repository Summary:
${this.summary.overview}

Architecture: ${this.summary.architecture}

Tech Stack: ${this.summary.techStack.join(", ")}

Key Modules:
${this.summary.keyModules.map((m) => `- ${m.name}: ${m.description}`).join("\n")}

${provenance}
${health}

${context}

Rules (graphify parity):
- Answer ONLY from the graph paths + snippets above. Do not invent edges or files.
- Every claim about code must cite a path like \`src/foo.ts\` and, when known, a line like \`src/foo.ts:42\`.
- Say whether each hop is EXTRACTED (parser-found), INFERRED (likely link), or AMBIGUOUS (uncertain).
- If the graph has no relevant vocabulary, say so plainly instead of guessing.`;

    this.history.push({ role: "user", content: question });
    const response = await this.provider.chat([...this.history], systemPrompt);
    this.history.push({ role: "assistant", content: response });

    // Keep history manageable — trim oldest pairs first
    if (this.history.length > 20) this.history = this.history.slice(-16);

    return response;
  }

  /** Vocab-constrained BFS traversal (graphify.com parity, no embeddings). */
  private buildContext(question: string): string {
    const vocab = this.buildVocab();
    const expanded = this.expandQuery(question, vocab);
    if (!expanded.length) {
      return `\nGraph traversal: no graph vocabulary matches this question, corpus has no relevant nodes. Do not guess.`;
    }
    const { nodes, edges } = this.traverse(expanded, 3, 2000);

    const nodeLines = nodes.slice(0, 20).map((n) => {
      const loc = n.line ? `:${n.line}` : (n.sourceLocation ? `:${n.sourceLocation}` : "");
      const conf = n.confidence ? ` [${n.confidence}]` : "";
      return `- ${n.label} (\`${n.id}${loc}\`)${conf}`;
    });

    const edgeLines = edges.slice(0, 30).map((e) =>
      `- \`${e.source}\` --${e.relation} [${e.confidence}]--> \`${e.target}\`${e.sourceLocation ? ` (${e.sourceFile}:${e.sourceLocation})` : ""}`
    );

    // Small grounded snippets from top traversal files (token saver)
    const files = [...new Set(nodes.map(n => n.file ?? n.id.split("::")[0]))]
      .filter(p => this.info.files.some(f => f.path === p))
      .slice(0, 3);
    const snippets = files.map((p) => {
      const f = this.info.files.find(x => x.path === p)!;
      return `--- ${p} ---\n${f.content.slice(0, 500)}`;
    }).join("\n\n");

    let out = `\nQuery expanded to (from graph vocab): [${expanded.join(", ")}]`;
    out += `\n\nTraversal nodes:\n${nodeLines.join("\n") || "(none)"}`;
    out += `\n\nTraversal edges:\n${edgeLines.join("\n") || "(none)"}`;
    if (snippets) out += `\n\nGrounded snippets:\n${snippets}`;
    // ~8000 char ≈ 2000 token budget
    return out.slice(0, 8000);
  }

  private buildVocab(): Set<string> {
    const v = new Set<string>();
    const add = (s: string) => {
      for (const tok of s.toLowerCase().split(/[^a-z0-9]+/)) {
        if (tok.length >= 3 && tok.length <= 30) v.add(tok);
      }
      // camelCase parts
      for (const part of s.split(/[^A-Za-z0-9]+/)) {
        for (const p of part.split(/(?=[A-Z])/)) {
          const t = p.toLowerCase();
          if (t.length >= 3 && t.length <= 30) v.add(t);
        }
      }
    };
    for (const n of this.graph.nodes) { add(n.path); add(n.label); }
    for (const s of this.graph.symbols ?? []) { add(s.label); add(s.file); }
    return v;
  }

  private expandQuery(question: string, vocab: Set<string>): string[] {
    const words = question.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3);
    const picked: string[] = [];
    for (const w of words) {
      if (vocab.has(w) && !picked.includes(w)) picked.push(w);
      // plural → singular fallback only if singular is in vocab (no invention)
      else if (w.endsWith("s") && vocab.has(w.slice(0, -1)) && !picked.includes(w.slice(0, -1))) {
        picked.push(w.slice(0, -1));
      }
      if (picked.length >= 12) break;
    }
    // substring fallback: question word contained in a vocab token (e.g. "auth" in "authentication")
    if (!picked.length) {
      for (const w of words) {
        for (const t of vocab) {
          if (t.includes(w) || w.includes(t)) {
            if (!picked.includes(t)) picked.push(t);
            if (picked.length >= 12) break;
          }
        }
        if (picked.length >= 12) break;
      }
    }
    return picked.slice(0, 12);
  }

  private traverse(terms: string[], depth = 3, budget = 2000): {
    nodes: Array<{ id: string; label: string; file?: string; line?: number; confidence?: string; sourceLocation?: number }>;
    edges: Array<{ source: string; target: string; relation: string; confidence: string; sourceFile?: string; sourceLocation?: number }>;
  } {
    // Score starts by term overlap
    const scored: Array<{ id: string; score: number }> = [];
    for (const n of this.graph.nodes) {
      const hay = `${n.path} ${n.label}`.toLowerCase();
      const s = terms.filter(t => hay.includes(t)).length;
      if (s) scored.push({ id: n.path, score: s });
    }
    for (const s of this.graph.symbols ?? []) {
      const hay = `${s.label} ${s.file}`.toLowerCase();
      const sc = terms.filter(t => hay.includes(t)).length;
      if (sc) scored.push({ id: s.id, score: sc });
    }
    scored.sort((a, b) => b.score - a.score);
    const starts = scored.slice(0, 3).map(x => x.id);
    if (!starts.length) return { nodes: [], edges: [] };

    const adj = new Map<string, Array<{ to: string; relation: string; confidence: string; sourceFile?: string; sourceLocation?: number }>>();
    const link = (a: string, b: string, rel: string, conf: string, sf?: string, sl?: number) => {
      if (!adj.has(a)) adj.set(a, []);
      adj.get(a)!.push({ to: b, relation: rel, confidence: conf, sourceFile: sf, sourceLocation: sl });
    };
    for (const e of this.graph.edges) {
      link(e.source, e.target, e.relation ?? 'imports', e.confidence ?? 'EXTRACTED', e.source, e.sourceLocation);
      link(e.target, e.source, e.relation ?? 'imports', e.confidence ?? 'EXTRACTED', e.source, e.sourceLocation);
    }
    for (const t of this.graph.typedEdges ?? []) {
      if (t.relation === 'defines') {
        link(t.source, t.target, t.relation, t.confidence, t.sourceFile, t.sourceLocation);
        link(t.target, t.source, t.relation, t.confidence, t.sourceFile, t.sourceLocation);
      }
    }

    const seen = new Set(starts);
    const outEdges: Array<{ source: string; target: string; relation: string; confidence: string; sourceFile?: string; sourceLocation?: number }> = [];
    let frontier = new Set(starts);
    for (let d = 0; d < depth; d++) {
      const next = new Set<string>();
      for (const cur of frontier) {
        for (const e of adj.get(cur) ?? []) {
          outEdges.push({ source: cur, target: e.to, relation: e.relation, confidence: e.confidence, sourceFile: e.sourceFile, sourceLocation: e.sourceLocation });
          if (!seen.has(e.to)) { seen.add(e.to); next.add(e.to); }
        }
      }
      frontier = next;
      if (!frontier.size) break;
    }

    const symById = new Map((this.graph.symbols ?? []).map(s => [s.id, s]));
    const nodeByPath = new Map(this.graph.nodes.map(n => [n.path, n]));
    const relevance = (id: string): number => {
      const s = symById.get(id);
      const hay = (s ? `${s.label} ${s.file}` : (nodeByPath.get(id)?.path ?? id)).toLowerCase();
      return terms.filter(t => hay.includes(t)).length;
    };
    const ranked = [...seen].sort((a, b) => relevance(b) - relevance(a));

    const nodes = ranked.map(id => {
      const s = symById.get(id);
      if (s) return { id: s.id, label: s.label, file: s.file, line: s.line, confidence: 'EXTRACTED' as const };
      const n = nodeByPath.get(id);
      const edgeConf = this.graph.edges.find(e => e.source === id || e.target === id)?.confidence;
      return { id, label: n?.label ?? id, file: n?.path, confidence: edgeConf, sourceLocation: undefined };
    });

    // Budget: ~4 chars/token
    const charBudget = budget * 4;
    let chars = 0;
    const keptEdges: typeof outEdges = [];
    for (const e of outEdges) {
      chars += e.source.length + e.target.length + 20;
      if (chars > charBudget) break;
      keptEdges.push(e);
    }
    return { nodes, edges: keptEdges };
  }

  clearHistory() {
    this.history = [];
  }
}
