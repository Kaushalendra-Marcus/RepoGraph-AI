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

// ─── REPO SUMMARY AGENT ───────────────────────────────────────────────────────
export async function summarizeRepo(
  provider: AIProvider,
  info: WorkspaceInfo,
  graph: DependencyGraph
): Promise<RepoSummary> {
  const topFiles = graph.nodes
    .slice(0, 15)
    .map((n) => `- ${n.path} (${n.language}, imports: ${n.imports.slice(0, 5).join(", ")})`)
    .join("\n");

  const fileTree = info.files
    .slice(0, 30)
    .map((f) => f.path)
    .join("\n");

  const sampleContent = info.files
    .slice(0, 3)
    .map((f) => `--- ${f.path} ---\n${f.content.slice(0, 400)}`)
    .join("\n\n");

  const prompt = `You are analyzing a workspace/codebase. Based on the structure and code below, provide a comprehensive JSON summary.

Workspace: ${info.name}
Root: ${info.rootPath}
Primary Language: ${info.files[0]?.language || 'Mixed'}

File Tree (sample):
${fileTree}

Key Files with imports:
${topFiles}

Sample File Content:
${sampleContent}

Respond ONLY with valid JSON (no markdown) matching this exact schema:
{
  "overview": "2-3 sentence overview of what this repo does",
  "purpose": "What problem does this solve?",
  "architecture": "How is the codebase organized? (patterns, layers, structure)",
  "techStack": ["tech1", "tech2", ...],
  "entryPoints": ["path/to/entry1", ...],
  "keyModules": [
    { "name": "module name", "description": "what it does" }
  ]
}`;

  const response = await provider.chat([{ role: "user", content: prompt }]);

  try {
    const clean = response.replace(/```json|```/g, "").trim();
    return JSON.parse(clean) as RepoSummary;
  } catch {
    const langs = [...new Set(info.files.map(f => f.language))].slice(0, 5);
    return {
      overview: response.slice(0, 200),
      purpose: "Could not parse full summary",
      architecture: "",
      techStack: langs.length > 0 ? langs : ['Mixed'],
      entryPoints: [],
      keyModules: [],
    };
  }
}

// ─── FILE SUMMARY AGENT ───────────────────────────────────────────────────────
export async function summarizeFiles(
  provider: AIProvider,
  nodes: GraphNode[],
  info: WorkspaceInfo,
  onProgress?: (done: number, total: number) => void
): Promise<FileSummary[]> {
  const summaries: FileSummary[] = [];
  const nodeByPath = new Map(nodes.map((n) => [n.path, n]));
  const files = info.files.filter((f) => f.content.trim().length > 0);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const node = nodeByPath.get(file.path);
    const imports = node?.imports ?? inferImports(file.content);

    // Keep non-source and very large files deterministic for reliability.
    const shouldUseHeuristic =
      ["JSON", "YAML", "TOML", "Markdown"].includes(file.language) || file.content.length > 12000;

    if (shouldUseHeuristic) {
      summaries.push(buildHeuristicSummary(file.path, file.content, imports));
      onProgress?.(i + 1, files.length);
      continue;
    }

    try {
      const summary = await summarizeFile(provider, file.path, file.content, imports);
      summaries.push(mergeWithFallback(summary, file.path, file.content, imports));
    } catch {
      summaries.push(buildHeuristicSummary(file.path, file.content, imports));
    }
    onProgress?.(i + 1, files.length);
  }

  return summaries;
}

async function summarizeFile(
  provider: AIProvider,
  path: string,
  content: string,
  imports: string[]
): Promise<FileSummary> {
  const prompt = `Analyze this source file and respond ONLY with valid JSON (no markdown).

File: ${path}
Imports: ${imports.slice(0, 8).join(", ")}

Content (first 1600 chars):
${content.slice(0, 1600)}

JSON schema:
{
  "path": "${path}",
  "purpose": "What does this file do? (1-2 sentences)",
  "exports": "What does it export or expose?",
  "dependencies": "Key dependencies or modules it uses"
}`;

  const res = await provider.chat([{ role: "user", content: prompt }]);
  const clean = res.replace(/```json|```/g, "").trim();
  const jsonText = extractFirstJsonObject(clean) || clean;
  try {
    return JSON.parse(jsonText) as FileSummary;
  } catch {
    return buildHeuristicSummary(path, content, imports);
  }
}

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

function inferImports(content: string): string[] {
  const out = new Set<string>();
  const patterns = [
    /import\s+[^"']*?from\s+["']([^"']+)["']/g,
    /import\s+["']([^"']+)["']/g,
    /require\(\s*["']([^"']+)["']\s*\)/g,
  ];

  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      if (m[1]) out.add(m[1]);
    }
  }

  return [...out].slice(0, 10);
}

function detectExports(content: string): string {
  const exportMatches = content.match(/\bexport\s+(?:default\s+)?(?:class|function|const|let|var|interface|type)\s+[A-Za-z0-9_]+/g) || [];
  const moduleMatches = content.match(/module\.exports\s*=\s*[A-Za-z0-9_]+/g) || [];
  const names = [...exportMatches, ...moduleMatches]
    .map((m) => {
      const parts = m.split(/\s+/).filter(Boolean);
      return parts[parts.length - 1].replace(/[^A-Za-z0-9_]/g, "");
    })
    .filter(Boolean);
  return names.slice(0, 8).join(", ");
}

function buildHeuristicSummary(path: string, content: string, imports: string[]): FileSummary {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const firstCodeLike = lines.find((l) => !l.startsWith("//") && !l.startsWith("#") && !l.startsWith("/*")) || "";
  const folder = path.includes("/") ? path.split("/").slice(0, -1).join("/") : "root";
  const roleHint = path.endsWith(".test.ts") || path.endsWith(".spec.ts") || path.includes("/test")
    ? "test logic"
    : path.endsWith(".md")
      ? "documentation"
      : path.endsWith(".json") || path.endsWith(".yaml") || path.endsWith(".yml") || path.endsWith(".toml")
        ? "configuration/data"
        : "source logic";

  const purpose = firstCodeLike
    ? `Provides ${roleHint} in ${folder}. Main clue: ${firstCodeLike.slice(0, 110)}${firstCodeLike.length > 110 ? "..." : ""}`
    : `Provides ${roleHint} in ${folder}.`;

  return {
    path,
    purpose,
    exports: detectExports(content),
    dependencies: imports.join(", "),
  };
}

function mergeWithFallback(summary: FileSummary, path: string, content: string, imports: string[]): FileSummary {
  const fallback = buildHeuristicSummary(path, content, imports);
  return {
    path,
    purpose: summary.purpose?.trim() || fallback.purpose,
    exports: summary.exports?.trim() || fallback.exports,
    dependencies: summary.dependencies?.trim() || fallback.dependencies,
  };
}

// ─── Q&A AGENT ────────────────────────────────────────────────────────────────
export class QAAgent {
  private history: Message[] = [];

  constructor(
    private provider: AIProvider,
    private info: WorkspaceInfo,
    private graph: DependencyGraph,
    private summary: RepoSummary
  ) {}

  async ask(question: string): Promise<string> {
    // Build rich context from repo
    const context = this.buildContext(question);
    const systemPrompt = `You are RepoGraph AI, an expert code analyst helping developers understand the workspace "${this.info.name}".

Repository Summary:
${this.summary.overview}

Architecture: ${this.summary.architecture}

Tech Stack: ${this.summary.techStack.join(", ")}

Key Modules:
${this.summary.keyModules.map((m) => `- ${m.name}: ${m.description}`).join("\n")}

${context}

Answer questions clearly and concisely. Reference specific file paths when relevant. If you're unsure, say so.`;

    this.history.push({ role: "user", content: question });

    const response = await this.provider.chat([...this.history], systemPrompt);
    this.history.push({ role: "assistant", content: response });

    // Keep history manageable
    if (this.history.length > 20) {
      this.history = this.history.slice(-16);
    }

    return response;
  }

  private buildContext(question: string): string {
    const q = question.toLowerCase();
    const relevantFiles: string[] = [];

    // Find files relevant to the question
    for (const file of this.info.files) {
      const pathLower = file.path.toLowerCase();
      const words = q.split(/\s+/).filter((w) => w.length > 3);
      if (words.some((w) => pathLower.includes(w))) {
        relevantFiles.push(file.path);
      }
    }

    if (relevantFiles.length === 0) return "";

    const snippets = relevantFiles
      .slice(0, 3)
      .map((path) => {
        const file = this.info.files.find((f) => f.path === path);
        if (!file) return "";
        return `--- ${path} ---\n${file.content.slice(0, 500)}`;
      })
      .filter(Boolean)
      .join("\n\n");

    return snippets ? `\nRelevant File Snippets:\n${snippets}` : "";
  }

  clearHistory() {
    this.history = [];
  }
}