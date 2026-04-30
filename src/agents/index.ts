import { AIProvider, Message } from "../providers";
import { WorkspaceInfo } from "../analyzer/WorkspaceScanner";
import { DependencyGraph, GraphNode } from "../analyzer/GraphBuilder";

export interface RepoSummary {
  overview: string;
  purpose: string;
  architecture: string;
  techStack: string[];
  entryPoints: string[];
  keyModules: { name: string; description: string }[];
}

export interface FileSummary {
  path: string;
  purpose: string;
  exports: string;
  dependencies: string;
}

// ── Repo summary ───────────────────────────────────────────────────────────

export async function summarizeRepo(
  provider: AIProvider,
  info: WorkspaceInfo,
  graph: DependencyGraph
): Promise<RepoSummary> {
  // Pick the most connected files for context
  const topNodes = [...graph.nodes]
    .sort((a, b) => b.inDegree + b.outDegree - (a.inDegree + a.outDegree))
    .slice(0, 20);

  const fileList = topNodes
    .map((n) => `- ${n.path} (${n.language}, in:${n.inDegree} out:${n.outDegree})`)
    .join("\n");

  // Sample content from the most important files
  const sampleContent = topNodes
    .slice(0, 5)
    .map((n) => {
      const file = info.files.find((f) => f.path === n.path);
      if (!file) return "";
      return `--- ${n.path} ---\n${file.content.slice(0, 600)}`;
    })
    .filter(Boolean)
    .join("\n\n");

  // Also include config files for tech stack detection
  const configFiles = info.files
    .filter((f) =>
      [
        "package.json", "pyproject.toml", "go.mod", "Cargo.toml",
        "requirements.txt", "pom.xml", "build.gradle", "Gemfile",
        "composer.json", ".env.example", "docker-compose.yml",
      ].some((name) => f.path.endsWith(name))
    )
    .slice(0, 3)
    .map((f) => `--- ${f.path} ---\n${f.content.slice(0, 400)}`)
    .join("\n\n");

  const prompt = `You are analyzing a software project called "${info.name}".

Top files by connectivity:
${fileList}

Config files:
${configFiles}

Key file contents:
${sampleContent}

Respond ONLY with valid JSON matching this exact schema (no markdown, no extra text):
{
  "overview": "2-3 sentence description of what this project does",
  "purpose": "What problem does this solve and who uses it?",
  "architecture": "How is the codebase organized? Describe patterns, layers, folder structure.",
  "techStack": ["list", "of", "technologies", "frameworks", "libraries"],
  "entryPoints": ["relative/path/to/main/entry"],
  "keyModules": [
    { "name": "module or folder name", "description": "what it does" }
  ]
}`;

  const response = await provider.chat([{ role: "user", content: prompt }]);

  try {
    const clean = response.replace(/```json|```/g, "").trim();
    return JSON.parse(clean) as RepoSummary;
  } catch {
    return {
      overview: response.slice(0, 300),
      purpose: "",
      architecture: "",
      techStack: [],
      entryPoints: [],
      keyModules: [],
    };
  }
}

// ── File summaries ─────────────────────────────────────────────────────────

export async function summarizeFiles(
  provider: AIProvider,
  nodes: GraphNode[],
  info: WorkspaceInfo,
  onProgress?: (done: number, total: number) => void
): Promise<FileSummary[]> {
  const summaries: FileSummary[] = [];
  // Summarize top files by connectivity — skip config/markdown-only files
  const toSummarize = nodes
    .filter((n) => !["JSON", "Markdown", "YAML", "TOML"].includes(n.language))
    .slice(0, 30);

  // Batch: 5 files per AI call to save tokens and time
  const BATCH = 5;

  for (let i = 0; i < toSummarize.length; i += BATCH) {
    const batch = toSummarize.slice(i, i + BATCH);

    const batchText = batch
      .map((node) => {
        const file = info.files.find((f) => f.path === node.path);
        const content = file ? file.content.slice(0, 800) : "(content not available)";
        return `FILE: ${node.path}\nLANG: ${node.language}\nIMPORTS: ${node.imports.slice(0, 6).join(", ")}\n\n${content}`;
      })
      .join("\n\n---\n\n");

    const prompt = `Analyze these source files and return a JSON array. One object per file.

${batchText}

Return ONLY a valid JSON array (no markdown) with this schema per item:
[{
  "path": "exact file path as given",
  "purpose": "1-2 sentences: what this file does and why it exists",
  "exports": "what functions/classes/values it exports (comma separated, or empty string)",
  "dependencies": "key external packages or internal modules it uses"
}]`;

    try {
      const res = await provider.chat([{ role: "user", content: prompt }]);
      const clean = res.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean) as FileSummary[];
      summaries.push(...parsed);
    } catch {
      // On parse failure, add minimal entries so we never return empty
      for (const node of batch) {
        summaries.push({
          path: node.path,
          purpose: `${node.language} file`,
          exports: node.exports.join(", "),
          dependencies: node.imports.slice(0, 4).join(", "),
        });
      }
    }

    onProgress?.(Math.min(i + BATCH, toSummarize.length), toSummarize.length);
  }

  return summaries;
}

// ── QA Agent ───────────────────────────────────────────────────────────────

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

    const systemPrompt = `You are RepoGraph AI, an expert code analyst for the project "${this.info.name}".

Project overview: ${this.summary.overview}
Architecture: ${this.summary.architecture}
Tech stack: ${this.summary.techStack.join(", ")}
Entry points: ${this.summary.entryPoints.join(", ")}

Key modules:
${this.summary.keyModules.map((m) => `- ${m.name}: ${m.description}`).join("\n")}

File dependency connections (file -> files it imports):
${this.graph.edges
  .slice(0, 60)
  .map((e) => `${e.source} -> ${e.target}`)
  .join("\n")}

${context}

Rules:
- Reference specific file paths when relevant
- Be concise and direct
- If you don't know, say so clearly
- Use plain text, no markdown headers`;

    this.history.push({ role: "user", content: question });

    const response = await this.provider.chat([...this.history], systemPrompt);
    this.history.push({ role: "assistant", content: response });

    // Keep last 16 messages to avoid token overflow
    if (this.history.length > 16) {
      this.history = this.history.slice(-16);
    }

    return response;
  }

  private buildContext(question: string): string {
    const q = question.toLowerCase();
    const words = q.split(/\s+/).filter((w) => w.length > 3);

    // Find files whose path or content contains question keywords
    const relevant = this.info.files.filter((f) => {
      const pathMatch = words.some((w) => f.path.toLowerCase().includes(w));
      const contentMatch = words.some((w) =>
        f.content.slice(0, 2000).toLowerCase().includes(w)
      );
      return pathMatch || contentMatch;
    });

    if (relevant.length === 0) return "";

    const snippets = relevant
      .slice(0, 4)
      .map((f) => `--- ${f.path} ---\n${f.content.slice(0, 600)}`)
      .join("\n\n");

    return `\nRelevant file snippets:\n${snippets}`;
  }

  clearHistory() {
    this.history = [];
  }
}