import { AIProvider } from "../providers/types";
import { WorkspaceInfo } from "../analyzer/WorkspaceScanner";
import { DependencyGraph } from "../analyzer/GraphBuilder";

export interface RepoSummary {
  overview: string;
  purpose: string;
  architecture: string;
  techStack: string[];
  entryPoints: string[];
  keyModules: { name: string; description: string }[];
}

export async function summarizeRepo(
  provider: AIProvider,
  info: WorkspaceInfo,
  graph: DependencyGraph
): Promise<RepoSummary> {
  const topFiles = [...graph.nodes]
    .sort((a, b) => b.inDegree + b.outDegree - (a.inDegree + a.outDegree))
    .slice(0, 15)
    .map((n) => `- ${n.path} (${n.language}, imports: ${n.imports.slice(0, 5).join(", ")})`)
    .join("\n");

  const fileTree = info.files.slice(0, 30).map((f) => f.path).join("\n");

  const sampleContent = info.files
    .slice(0, 3)
    .map((f) => `--- ${f.path} ---\n${f.content.slice(0, 400)}`)
    .join("\n\n");

  const prompt = `You are analyzing a workspace/codebase. Based on the structure and code below, provide a comprehensive JSON summary.

Workspace: ${info.name}
Root: ${info.rootPath}
Primary Language: ${info.files[0]?.language || "Mixed"}

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
  "techStack": ["tech1", "tech2"],
  "entryPoints": ["path/to/entry1"],
  "keyModules": [{ "name": "module name", "description": "what it does" }]
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
      techStack: detectTechStack(info),
      entryPoints: [],
      keyModules: [],
    };
  }
}

const TEST_PATH_RE = /[._-](test|spec)\.[A-Za-z]+$|\/(tests?|__tests?__|spec|__spec__|e2e|cypress|fixtures?)\//i;

/** Languages that are docs/config/manifests — never counted as source files. */
const NON_SOURCE_LANGUAGES = new Set(["Markdown", "JSON", "YAML", "TOML", "Text", "Unknown"]);

export function isSourceLanguage(lang: string): boolean {
  return !NON_SOURCE_LANGUAGES.has(lang);
}

export function countSourceFiles(info: WorkspaceInfo): number {
  return info.files.filter((f) => isSourceLanguage(f.language)).length;
}

const ENTRY_BASENAMES = new Set([
  "main", "server", "app", "index", "manage", "wsgi", "asgi", "cli", "run",
]);

function isTestPath(p: string): boolean {
  return TEST_PATH_RE.test(p);
}

function entryScore(path: string): number {
  const base = (path.split("/").pop() || "").toLowerCase().replace(/\.[a-z0-9]+$/, "");
  let s = 0;
  if (ENTRY_BASENAMES.has(base)) s += 50;
  if (/main\.tsx?$/.test(path.toLowerCase())) s += 20;
  if (/\/main\.py$/.test(path)) s += 20;
  if (isTestPath(path)) s -= 100;
  return s;
}

/**
 * Detect the real tech stack from manifests first (package.json,
 * requirements.txt), falling back to source languages. Never reports
 * Markdown/JSON/YAML as "stack".
 */
export function detectTechStack(info: WorkspaceInfo): string[] {
  const stack: string[] = [];
  const byPath = new Map(info.files.map((f) => [f.path, f.content]));

  // package.json → JS framework + build tool
  for (const [p, content] of byPath) {
    if (!p.endsWith("package.json")) continue;
    try {
      const pkg = JSON.parse(content);
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      const has = (...names: string[]) => names.some((n) => n in deps);
      const feats: string[] = [];
      if (has("react")) feats.push("React");
      if (has("vue")) feats.push("Vue");
      if (has("svelte")) feats.push("Svelte");
      if (has("next")) feats.push("Next.js");
      if (has("express", "fastify", "koa", "hapi")) feats.push("Node API");
      if (has("@nestjs/core")) feats.push("NestJS");
      if (has("vite")) feats.push("Vite");
      if (has("prisma", "@prisma/client")) feats.push("Prisma");
      if (has("mongoose")) feats.push("Mongoose");
      if (has("typeorm")) feats.push("TypeORM");
      if (has("sequelize")) feats.push("Sequelize");
      if (feats.length) stack.push(`TypeScript/JavaScript (${feats.join(", ")})`);
      else stack.push("TypeScript/JavaScript");
    } catch { /* ignore malformed json */ }
    break;
  }

  // requirements.txt / pyproject.toml → Python framework + ORM
  for (const [p, content] of byPath) {
    if (p.endsWith("requirements.txt") || p.endsWith("pyproject.toml") || p.endsWith("Pipfile")) {
      const lower = content.toLowerCase();
      const feats: string[] = [];
      if (lower.includes("fastapi")) feats.push("FastAPI");
      if (lower.includes("django")) feats.push("Django");
      if (lower.includes("flask")) feats.push("Flask");
      if (lower.includes("sqlalchemy")) feats.push("SQLAlchemy");
      if (lower.includes("alembic")) feats.push("Alembic");
      if (lower.includes("langchain")) feats.push("LangChain");
      if (lower.includes("groq")) feats.push("Groq");
      stack.push(feats.length ? `Python (${feats.join(", ")})` : "Python");
      break;
    }
  }

  // go.mod / Cargo.toml / Gemfile / composer.json
  if ([...byPath.keys()].some((p) => p.endsWith("go.mod"))) stack.push("Go");
  if ([...byPath.keys()].some((p) => p.endsWith("Cargo.toml"))) stack.push("Rust");
  if ([...byPath.keys()].some((p) => p.endsWith("Gemfile"))) stack.push("Ruby");
  if ([...byPath.keys()].some((p) => p.endsWith("composer.json"))) stack.push("PHP");

  // Fallback: source languages only (docs/config excluded)
  if (!stack.length) {
    const langs = [...new Set(
      info.files
        .map((f) => f.language)
        .filter((l) => !["Markdown", "JSON", "YAML", "TOML"].includes(l))
    )].slice(0, 5);
    return langs.length ? langs : ["Mixed"];
  }
  return [...new Set(stack)].slice(0, 6);
}

/**
 * Static repo summary without any AI call.
 * Used when no API key is configured so graph + flows still work.
 * Built purely from graph centrality + file extensions.
 */
export function buildHeuristicRepoSummary(
  info: WorkspaceInfo,
  graph: DependencyGraph
): RepoSummary {
  const ranked = [...graph.nodes].sort(
    (a, b) => b.inDegree + b.outDegree - (a.inDegree + a.outDegree)
  );
  const top = ranked.slice(0, 5);

  // Entry points: prefer real bootstraps (main/server/app/index), never tests.
  // Score = entry-name bonus − test penalty + outDegree (hubs that start chains).
  const candidates = ranked
    .filter((n) => !isTestPath(n.path))
    .map((n) => ({ n, s: entryScore(n.path) + Math.min(n.outDegree, 10) }))
    .sort((a, b) => b.s - a.s);
  const entries = candidates.slice(0, 3).map(({ n }) => n.path);
  if (!entries.length) {
    // Degenerate repo (only tests?) — fall back to top hubs so it's non-empty.
    entries.push(...top.slice(0, 2).map((n) => n.path));
  }

  const groups = [...new Set(graph.nodes.map((n) => n.group))].slice(0, 6);

  return {
    overview:
      `"${info.name}" has ${countSourceFiles(info)} source files ` +
      `(${graph.edges.length} import connections). Top hub: ${top[0]?.path ?? "n/a"}. ` +
      `Add an AI key to unlock a real architectural summary.`,
    purpose: `Static structural overview (no AI key). Folders: ${groups.join(", ") || "flat"}.`,
    architecture:
      `Static analysis only. ${groups.length} top-level folders. ` +
      `Most-connected files: ${top.map((n) => n.path).join(", ") || "none"}.`,
    techStack: detectTechStack(info),
    entryPoints: [...new Set(entries)],
    keyModules: top.map((n) => ({
      name: n.path,
      description: `Hub file: used by ${n.inDegree}, imports ${n.outDegree}.`,
    })),
  };
}
