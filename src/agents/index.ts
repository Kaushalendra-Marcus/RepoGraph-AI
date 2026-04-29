import { AIProvider, Message } from "../providers";
import { RepoInfo } from "../analyzer/RepoFetcher";
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
  info: RepoInfo,
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

  const prompt = `You are analyzing a GitHub repository. Based on the structure and code below, provide a comprehensive JSON summary.

Repository: ${info.owner}/${info.repo}
Description: ${info.description}
Primary Language: ${info.language}

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
    return {
      overview: response.slice(0, 200),
      purpose: "Could not parse full summary",
      architecture: "",
      techStack: [info.language],
      entryPoints: [],
      keyModules: [],
    };
  }
}

// ─── FILE SUMMARY AGENT ───────────────────────────────────────────────────────
export async function summarizeFiles(
  provider: AIProvider,
  nodes: GraphNode[],
  info: RepoInfo,
  onProgress?: (done: number, total: number) => void
): Promise<FileSummary[]> {
  const summaries: FileSummary[] = [];
  const topNodes = nodes.slice(0, 20); // Summarize top 20 files

  for (let i = 0; i < topNodes.length; i++) {
    const node = topNodes[i];
    const file = info.files.find((f) => f.path === node.path);
    if (!file) continue;

    try {
      const summary = await summarizeFile(provider, file.path, file.content, node.imports);
      summaries.push(summary);
    } catch {
      summaries.push({
        path: node.path,
        purpose: "Could not summarize",
        exports: "",
        dependencies: node.imports.join(", "),
      });
    }
    onProgress?.(i + 1, topNodes.length);
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

Content (first 800 chars):
${content.slice(0, 800)}

JSON schema:
{
  "path": "${path}",
  "purpose": "What does this file do? (1-2 sentences)",
  "exports": "What does it export or expose?",
  "dependencies": "Key dependencies or modules it uses"
}`;

  const res = await provider.chat([{ role: "user", content: prompt }]);
  const clean = res.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(clean) as FileSummary;
  } catch {
    return {
      path,
      purpose: "Could not parse file summary from AI response",
      exports: "",
      dependencies: imports.join(", "),
    };
  }
}

// ─── Q&A AGENT ────────────────────────────────────────────────────────────────
export class QAAgent {
  private history: Message[] = [];

  constructor(
    private provider: AIProvider,
    private info: RepoInfo,
    private graph: DependencyGraph,
    private summary: RepoSummary
  ) {}

  async ask(question: string): Promise<string> {
    // Build rich context from repo
    const context = this.buildContext(question);
    const systemPrompt = `You are RepoGraph AI, an expert code analyst helping developers understand the repository "${this.info.owner}/${this.info.repo}".

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
