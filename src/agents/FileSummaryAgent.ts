import { AIProvider } from "../providers/types";
import { WorkspaceFile } from "../analyzer/WorkspaceScanner";
import { GraphNode } from "../analyzer/GraphBuilder";

export interface FileSummary {
  path: string;
  purpose: string;
  exports: string;
  complexity: "low" | "medium" | "high";
  keyFunctions: string[];
}

// ── Scoring: which files actually matter ──────────────────────────────────

const SKIP_EXTENSIONS = new Set([
  ".lock", ".log", ".map", ".min.js", ".min.css",
  ".ico", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".woff", ".woff2", ".ttf", ".eot",
  ".zip", ".gz", ".tar", ".env", ".env.example",
]);

const SKIP_PATTERNS = [
  /node_modules/, /\.git\//, /dist\//, /build\//, /coverage\//, /\.next\//,
  /__pycache__/, /\.pytest_cache/, /vendor\//, /\.idea\//, /\.vscode\//,
  /package-lock\.json/, /yarn\.lock/, /pnpm-lock/, /Gemfile\.lock/,
  /\.d\.ts$/, /\.min\./, /\.map$/,
];

const DEPRIORITIZE_PATTERNS = [
  /\.test\./, /\.spec\./, /\.stories\./, /__tests__/, /\.mock\./,
  /migration/, /seed/, /fixture/, /\.md$/, /\.txt$/, /\.csv$/,
];

function scoreFile(file: WorkspaceFile, node?: GraphNode): number {
  const p = file.path.toLowerCase();

  // Hard skip
  for (const pat of SKIP_PATTERNS) if (pat.test(p)) return -1;
  const ext = "." + p.split(".").pop();
  if (SKIP_EXTENSIONS.has(ext)) return -1;

  // Config/data files — skip AI, no summary needed
  if ([".json", ".yaml", ".yml", ".toml", ".ini", ".env", ".txt", ".md"].some((e) => p.endsWith(e))) return -1;

  let score = 0;

  // High-value indicators
  if (p.includes("service"))    score += 30;
  if (p.includes("controller")) score += 28;
  if (p.includes("handler"))    score += 25;
  if (p.includes("middleware")) score += 22;
  if (p.includes("router") || p.includes("routes")) score += 22;
  if (p.includes("model"))      score += 20;
  if (p.includes("schema"))     score += 18;
  if (p.includes("store"))      score += 18;
  if (p.includes("context"))    score += 16;
  if (p.includes("hook"))       score += 14;
  if (p.includes("util") || p.includes("helper")) score += 10;
  if (p.includes("index."))     score += 8;
  if (p.includes("main.") || p.includes("app.") || p.includes("server.")) score += 35;

  // Graph centrality — most connected files are most important
  if (node) {
    score += node.inDegree * 5;
    score += node.outDegree * 2;
  }

  // Penalise tests and stories — still include if very central
  for (const pat of DEPRIORITIZE_PATTERNS) if (pat.test(p)) { score -= 40; break; }

  // Minimum content threshold
  if (file.content.trim().length < 80) score -= 50;

  return score;
}

// ── Public: select & summarize important files only ───────────────────────
// NOTE: capped at 10 to save tokens. UI shows top 5 + on-demand lookup.

export function selectTopFiles(
  nodes: GraphNode[],
  files: WorkspaceFile[],
  topN = 10
): WorkspaceFile[] {
  const nodeByPath = new Map(nodes.map((n) => [n.path, n]));
  return files
    .map((f) => ({ file: f, score: scoreFile(f, nodeByPath.get(f.path)) }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map(({ file }) => file);
}

export async function summarizeFiles(
  provider: AIProvider,
  nodes: GraphNode[],
  files: WorkspaceFile[],
  onProgress?: (done: number, total: number) => void
): Promise<FileSummary[]> {
  const nodeByPath = new Map(nodes.map((n) => [n.path, n]));

  // Score every file and select the top meaningful ones (cap 10 — token saver)
  const selected = selectTopFiles(nodes, files, 10);

  const summaries: FileSummary[] = [];

  for (let i = 0; i < selected.length; i++) {
    const file = selected[i];
    const node = nodeByPath.get(file.path);
    onProgress?.(i + 1, selected.length);

    try {
      const summary = await summarizeSingleFile(provider, file, node);
      summaries.push(summary);
    } catch {
      summaries.push(buildHeuristicSummary(file, node));
    }
  }

  // Sort by centrality for display — most important first
  summaries.sort((a, b) => {
    const na = nodeByPath.get(a.path);
    const nb = nodeByPath.get(b.path);
    return ((nb?.inDegree ?? 0) + (nb?.outDegree ?? 0)) - ((na?.inDegree ?? 0) + (na?.outDegree ?? 0));
  });

  return summaries;
}

// ── AI summarizer for a single file ──────────────────────────────────────

async function summarizeSingleFile(
  provider: AIProvider,
  file: WorkspaceFile,
  node?: GraphNode
): Promise<FileSummary> {
  // Give the AI real code — not just first 1600 chars blindly.
  // For large files: take the first 1200 (usually imports + class/function signatures)
  // and the last 400 (often the main export/module.exports).
  const content = file.content.length > 1600
    ? file.content.slice(0, 1200) + "\n\n// ... (truncated) ...\n\n" + file.content.slice(-400)
    : file.content;

  const importedBy = node?.importedBy?.slice(0, 5).join(", ") || "none";
  const importsOthers = node?.imports?.slice(0, 8).join(", ") || "none";

  const prompt = `You are analyzing a real source file from the project. Read the ACTUAL CODE carefully and give a precise, accurate summary.

File: ${file.path}
Language: ${file.language}
Imported by: ${importedBy}
Imports: ${importsOthers}

SOURCE CODE:
\`\`\`
${content}
\`\`\`

Based on the ACTUAL CODE ABOVE (not assumptions), respond ONLY with valid JSON:
{
  "path": "${file.path}",
  "purpose": "Precise 1-2 sentence description of what this file actually does, based on the real code, naming real classes/functions/routes",
  "exports": "Comma-separated list of actual exported names visible in the code",
  "complexity": "low | medium | high (based on code complexity)",
  "keyFunctions": ["actual function/class names from the code, max 5"]
}

Rules:
- Read the actual code. Do NOT guess or use the file path alone.
- purpose must mention what the code actually does (e.g. 'Defines the UserService class with methods for creating, finding, and deleting users via Prisma ORM' not just 'handles users')
- exports must be real names from the code
- keyFunctions must be real identifiers visible in the code`;

  const res = await provider.chat([{ role: "user", content: prompt }]);
  const clean = res.replace(/```json[\s\S]*?```|```[\s\S]*?```/g, (m) => {
    // extract content inside fences if present
    const inner = m.replace(/```(?:json)?/g, "").trim();
    return inner;
  }).trim();

  const jsonStr = extractFirstJsonObject(clean) || clean;
  const parsed = JSON.parse(jsonStr) as FileSummary;

  // Validate that the parsed result isn't garbage
  if (!parsed.purpose || parsed.purpose.length < 10) throw new Error("bad parse");
  return { ...parsed, path: file.path };
}

// ── On-demand single file summary (used by Insights file lookup) ─────────

export async function summarizeOneFile(
  provider: AIProvider,
  targetPath: string,
  nodes: GraphNode[],
  files: WorkspaceFile[]
): Promise<FileSummary> {
  const file = files.find((f) => f.path === targetPath);
  if (!file) throw new Error(`File not found in workspace: ${targetPath}`);
  const nodeByPath = new Map(nodes.map((n) => [n.path, n]));
  try {
    return await summarizeSingleFile(provider, file, nodeByPath.get(file.path));
  } catch {
    return buildHeuristicSummary(file, nodeByPath.get(file.path));
  }
}

/** Static summaries without any AI call — used when no API key is set. */
export function buildHeuristicSummaries(
  nodes: GraphNode[],
  files: WorkspaceFile[],
  topN = 5
): FileSummary[] {
  const nodeByPath = new Map(nodes.map((n) => [n.path, n]));
  return selectTopFiles(nodes, files, topN).map((f) =>
    buildHeuristicSummary(f, nodeByPath.get(f.path))
  );
}

// ── Heuristic fallback (no AI call) ──────────────────────────────────────

export function buildHeuristicSummary(file: WorkspaceFile, node?: GraphNode): FileSummary {
  const content = file.content;

  // Extract real exported names from code
  const exportedNames = extractExportedNames(content);

  // Extract real function/class names
  const fnNames = extractFunctionNames(content).slice(0, 5);

  // Strip comments so prose like "first-class stage" isn't mistaken for code.
  const codeOnly = content
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|\s)\/\/.*$/gm, "$1")
    .replace(/"""[\s\S]*?"""/g, " ")
    .replace(/'''[\s\S]*?'''/g, " ");

  // Build a purpose string from actual code structure.
  // NOTE: class detection is line-anchored so `@dataclass\nclass X`
  // (Python decorator + newline) doesn't phantom-match a class named "class".
  const classMatches   = codeOnly.match(/^[ \t]*(?:export\s+)?(?:default\s+)?class\s+(\w+)/gm) || [];
  const expressRoutes  = codeOnly.match(/(?:router|app)\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/g) || [];
  const fastapiRoutes  = codeOnly.match(/@(router|app)\s*\.\s*(get|post|put|patch|delete|head|options)\s*\(\s*['"`]([^'"`]*)['"`]/gi) || [];
  const flaskRoutes    = codeOnly.match(/@(?:app|blueprint|bp)\s*\.route\s*\(\s*['"`]([^'"`]+)['"`]/gi) || [];
  const decoratorRoutes = codeOnly.match(/@(Get|Post|Put|Patch|Delete|Controller)\s*\(\s*['"]([^'"]*)['"]\s*\)/g) || [];
  const tsTypes        = codeOnly.match(/\bexport\s+(?:default\s+)?(?:interface|type|enum)\s+(\w+)/g) || [];
  const barrelReexport = codeOnly.match(/\bexport\s+(?:\*|\{[^}]*\})\s*from\s*['"][^'"]+['"]/g) || [];
  const pyDefs         = file.path.endsWith(".py")
    ? (codeOnly.match(/^(?:async\s+)?def\s+(\w+)\s*\(/gm) || []).map((m) => m.replace(/.*def\s+/, "").replace(/\s*\(.*/, "").trim())
    : [];
  const pyClasses      = file.path.endsWith(".py")
    ? (codeOnly.match(/^class\s+(\w+)/gm) || []).map((m) => m.replace(/.*class\s+/, "").trim())
    : [];
  // Python compatibility shim: only `from x import *` re-exports, no own code.
  const pyStarReexport = file.path.endsWith(".py")
    ? (codeOnly.match(/^from\s+([\w.]+)\s+import\s+\*/gm) || []).map((m) => m.replace(/^from\s+/, "").replace(/\s+import\s+\*.*/, "").trim())
    : [];

  let purpose = "";

  const allRoutes = [...expressRoutes, ...fastapiRoutes, ...flaskRoutes];
  if (classMatches.length > 0) {
    const names = classMatches.map((m) => m.replace(/.*class\s+/, "").trim()).join(", ");
    purpose = `Defines ${names}`;
    if (node?.inDegree && node.inDegree > 2) purpose += ` (used by ${node.inDegree} other files)`;
  } else if (allRoutes.length > 0) {
    purpose = `Defines ${allRoutes.length} HTTP route${allRoutes.length > 1 ? "s" : ""}`;
    const sample = allRoutes.slice(0, 3).map((r) => {
      const m = r.match(/\.(get|post|put|patch|delete|route)\s*\(\s*['"`]([^'"`]+)['"`]/i) || r.match(/\(\s*['"`]([^'"`]+)['"`]/);
      if (m && m[2]) return `${(m[1] || "ROUTE").toUpperCase()} ${m[2]}`;
      if (m && m[1] && !/route/i.test(m[0])) return m[1];
      return r.slice(0, 40);
    });
    purpose += `: ${sample.join(", ")}`;
  } else if (decoratorRoutes.length > 0) {
    purpose = `NestJS controller with ${decoratorRoutes.length} route handler${decoratorRoutes.length > 1 ? "s" : ""}`;
  } else if (tsTypes.length > 0) {
    const names = tsTypes.map((m) => m.replace(/.*(?:interface|type|enum)\s+/, "").trim()).slice(0, 4).join(", ");
    const usedBy = node?.inDegree ? ` (used by ${node.inDegree} other files)` : "";
    purpose = barrelReexport.length > 0
      ? `Shared type definitions (${names}), barrel re-export${usedBy}`
      : `Shared type definitions: ${names}${usedBy}`;
  } else if (barrelReexport.length > 0) {
    const targets = barrelReexport.slice(0, 3).map((m) => {
      const mm = m.match(/from\s*['"]([^'"]+)['"]/);
      return mm ? mm[1] : "?";
    }).join(", ");
    purpose = `Barrel re-export of ${targets}${node?.inDegree ? ` (used by ${node.inDegree} files)` : ""}`;
  } else if (pyClasses.length > 0) {
    purpose = `Defines ${pyClasses.slice(0, 3).join(", ")}`;
    if (node?.inDegree && node.inDegree > 2) purpose += ` (used by ${node.inDegree} other files)`;
  } else if (pyStarReexport.length > 0) {
    purpose = `Compatibility re-export shim for ${pyStarReexport.slice(0, 2).join(", ")} (no own logic)`;
  } else if (pyDefs.length > 0) {
    purpose = `Exports utilities: ${pyDefs.slice(0, 3).join(", ")}`;
  } else if (fnNames.length > 0) {
    purpose = `Exports utilities: ${fnNames.slice(0, 3).join(", ")}`;
  } else {
    const folder = file.path.split("/").slice(0, -2).join("/") || "project root";
    purpose = `Module in ${folder}`;
  }

  const complexity: FileSummary["complexity"] =
    content.length > 4000 ? "high" : content.length > 1200 ? "medium" : "low";

  return { path: file.path, purpose, exports: exportedNames, complexity, keyFunctions: fnNames };
}

// ── Code parsers ─────────────────────────────────────────────────────────

function extractExportedNames(content: string): string {
  const names: string[] = [];
  // Python: top-level defs + classes (public only)
  const pyDef = /^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/gm;
  const pyCls = /^class\s+([A-Za-z_]\w*)/gm;
  let m: RegExpExecArray | null;
  while ((m = pyDef.exec(content)) !== null) {
    if (!m[1].startsWith("_")) names.push(m[1]);
  }
  while ((m = pyCls.exec(content)) !== null) names.push(m[1]);
  if (names.length) return [...new Set(names)].slice(0, 8).join(", ");
  // export class/function/const/type/interface Foo
  const re1 = /\bexport\s+(?:default\s+)?(?:class|function|const|let|var|interface|type|enum)\s+(\w+)/g;
  while ((m = re1.exec(content)) !== null) names.push(m[1]);
  // export { Foo, Bar }
  const re2 = /\bexport\s+\{([^}]+)\}/g;
  while ((m = re2.exec(content)) !== null) {
    m[1].split(",").forEach((s) => {
      const name = s.trim().split(/\s+as\s+/).pop()?.trim();
      if (name && /^\w+$/.test(name)) names.push(name);
    });
  }
  // module.exports = Foo
  const re3 = /module\.exports\s*=\s*(\w+)/g;
  while ((m = re3.exec(content)) !== null) names.push(m[1]);
  return [...new Set(names)].slice(0, 8).join(", ");
}

function extractFunctionNames(content: string): string[] {
  const names: string[] = [];
  const patterns = [
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/g,
    /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(/g,
    /(?:export\s+)?class\s+(\w+)/g,
    /(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    const r = new RegExp(re.source, re.flags);
    while ((m = r.exec(content)) !== null) {
      if (m[1] && m[1].length > 2 && !/^(if|for|while|switch|catch|async|function|const|let|var)$/.test(m[1]))
        names.push(m[1]);
    }
  }
  return [...new Set(names)].slice(0, 5);
}

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === '"') { inString = false; }
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") depth++;
    if (ch === "}") { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return null;
}
