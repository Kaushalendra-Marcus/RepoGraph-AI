// GraphBuilder.ts — builds a dependency graph from scanned workspace files.
// Note: RepoFetcher is kept for type compatibility but not directly used here.

export interface GraphNode {
  id: string;
  label: string;
  path: string;
  absPath?: string;
  language: string;
  size: number;
  imports: string[];
  importedBy: string[];
  exports: string[];
  group: string;
  inDegree: number;
  outDegree: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  label?: string;
  // Provenance (graphify.com parity). Optional so old records still load.
  relation?: 'imports' | 'calls' | 'defines';
  confidence?: EdgeConfidence;
  confidenceScore?: number;
  sourceLocation?: number; // 1-based line where the import/call was found
}

export type EdgeConfidence = 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS';

export interface SymbolNode {
  id: string; // `${file}::${name}` — stable, no chunk suffixes
  label: string;
  kind: 'function' | 'class' | 'method' | 'interface' | 'type';
  file: string; // repo-relative path
  line: number; // 1-based definition line
  exported: boolean;
  params?: string[];
}

export interface TypedEdge {
  source: string; // file path or symbol id
  target: string; // file path or symbol id
  relation: 'imports' | 'calls' | 'defines' | 'contains';
  confidence: EdgeConfidence;
  confidenceScore: number;
  sourceFile: string;
  sourceLocation?: number;
}

export interface GraphCommunity {
  id: number;
  label: string;
  members: string[]; // file paths
  size: number;
}

export interface GraphHealth {
  dangling: number;
  missing: number;
  selfLoops: number;
  ok: boolean;
  warnings: string[];
}

export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  // ── Knowledge-graph extensions (additive, UI keeps using nodes/edges) ──
  symbols?: SymbolNode[];
  typedEdges?: TypedEdge[];
  communities?: GraphCommunity[];
  godNodes?: string[]; // file paths, top hubs
  health?: GraphHealth;
  stats?: { extracted: number; inferred: number; ambiguous: number };
}

interface ImportMatch { path: string; names?: string; }

function extractImports(content: string, lang: string): ImportMatch[] {
  const results: ImportMatch[] = [];
  let m: RegExpExecArray | null;

  if (lang === "TypeScript" || lang === "JavaScript" || lang === "Vue" || lang === "Svelte") {
    const r1 = /import\s+(?:type\s+)?(?:([\w*{}\s,]+)\s+from\s+)?['"]([^'"]+)['"]/g;
    while ((m = r1.exec(content)) !== null) results.push({ path: m[2], names: m[1]?.trim() });
    const r1b = /import\s+['"]([^'"]+)['"]/g;
    while ((m = r1b.exec(content)) !== null) results.push({ path: m[1] });
    const r1c = /import\s+\*\s+as\s+[\w$]+\s+from\s+['"]([^'"]+)['"]/g;
    while ((m = r1c.exec(content)) !== null) results.push({ path: m[1] });
    const r2 = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((m = r2.exec(content)) !== null) results.push({ path: m[1] });
    const r3 = /export\s+(?:type\s+)?(?:[\w{}\s,*]+)\s+from\s+['"]([^'"]+)['"]/g;
    while ((m = r3.exec(content)) !== null) results.push({ path: m[1] });
    const r4 = /export\s*\{[^}]+\}\s*from\s*['"]([^'"]+)['"]/g;
    while ((m = r4.exec(content)) !== null) results.push({ path: m[1] });
  } else if (lang === "Python") {
    // Keep the raw dotted path (e.g. ".visuals", "..utils", "app.routes.auth").
    // Dot-to-slash conversion happens in resolveImport where the importing
    // file's directory + language are known. Converting here would destroy
    // relative-import info and cause cross-language false matches.
    const r1 = /^from\s+([\w.]+)\s+import\s+(.+)/gm;
    while ((m = r1.exec(content)) !== null) {
      const raw = m[1].trim();
      let names = m[2].trim();
      if (names.startsWith("(") && !names.includes(")")) {
        // Parenthesized multi-line import: gather continuation lines so the
        // edge label lists real names instead of a stray "(".
        const after = content.slice(m.index + m[0].length).split("\n").slice(0, 15);
        const collected: string[] = [];
        for (const ln of after) {
          const code = ln.split("#")[0];
          if (code.includes(")")) { collected.push(code.slice(0, code.indexOf(")"))); break; }
          collected.push(code);
        }
        names = collected.map((s) => s.trim()).filter(Boolean).join(", ");
        names = names.split(",").map((s) => s.trim()).filter(Boolean).join(", ");
      }
      // `from . import foo, bar` — the path alone is just dots; expand per name
      // so each resolves to a sibling module instead of the package dir.
      if (/^\.+$/.test(raw)) {
        for (const part of names.split(",")) {
          const nm = part.trim().split(/\s+/)[0].replace(/^\*/, "").trim();
          if (nm && /^\w+$/.test(nm)) results.push({ path: `${raw}${nm}`, names });
        }
      } else {
        results.push({ path: raw, names });
      }
    }
    const r2 = /^import\s+([\w.]+)/gm;
    while ((m = r2.exec(content)) !== null) results.push({ path: m[1].trim() });
  } else if (lang === "Go") {
    const r1 = /import\s+"([^"]+)"/g;
    while ((m = r1.exec(content)) !== null) results.push({ path: m[1] });
    const block = content.match(/import\s*\(([^)]+)\)/s);
    if (block) { const r2 = /"([^"]+)"/g; while ((m = r2.exec(block[1])) !== null) results.push({ path: m[1] }); }
  } else if (lang === "Rust") {
    const r1 = /use\s+([\w:]+)/g;
    while ((m = r1.exec(content)) !== null) results.push({ path: m[1].replace(/::/g, "/") });
    const r2 = /^mod\s+(\w+)\s*;/gm;
    while ((m = r2.exec(content)) !== null) results.push({ path: m[1] });
  } else if (lang === "Java") {
    const r1 = /^import\s+([\w.]+);/gm;
    while ((m = r1.exec(content)) !== null) results.push({ path: m[1].replace(/\./g, "/") });
  } else if (lang === "Ruby") {
    const r1 = /require(?:_relative)?\s+['"]([^'"]+)['"]/g;
    while ((m = r1.exec(content)) !== null) results.push({ path: m[1] });
  } else if (lang === "PHP") {
    const r1 = /(?:require|include)(?:_once)?\s+['"]([^'"]+)['"]/g;
    while ((m = r1.exec(content)) !== null) results.push({ path: m[1] });
  }

  return results;
}

function extractExports(content: string, lang: string): string[] {
  const exports: string[] = [];
  if (lang === "TypeScript" || lang === "JavaScript") {
    let m: RegExpExecArray | null;
    const r1 = /export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type|enum)\s+(\w+)/g;
    while ((m = r1.exec(content)) !== null) exports.push(m[1]);
    const r2 = /export\s+\{([^}]+)\}/g;
    while ((m = r2.exec(content)) !== null) {
      exports.push(...m[1].split(",").map((s) => s.trim().split(/\s+/)[0]).filter(Boolean));
    }
  } else if (lang === "Python") {
    let m: RegExpExecArray | null;
    const r1 = /^(?:async\s+)?def\s+(\w+)\s*\(/gm;
    while ((m = r1.exec(content)) !== null) {
      if (!m[1].startsWith("_") || m[1].startsWith("__")) exports.push(m[1]);
    }
    const r2 = /^class\s+(\w+)/gm;
    while ((m = r2.exec(content)) !== null) exports.push(m[1]);
  }
  return [...new Set(exports)].slice(0, 10);
}

function normalizePath(raw: string): string {
  const parts = raw.replace(/\\/g, "/").split("/");
  const out: string[] = [];
  for (const p of parts) { if (p === "..") out.pop(); else if (p !== ".") out.push(p); }
  return out.join("/");
}

/**
 * Expands a normalized import base path into all possible candidate file paths
 * (with and without extensions, plus barrel index files).
 * Candidates are ordered so the importing file's own language wins — this
 * prevents `from .visuals import x` (Python) from resolving to `visuals.ts`.
 */
function expandImportCandidates(base: string, fromLang?: string): string[] {
  const extsByLang: Record<string, string[]> = {
    Python: [".py"],
    TypeScript: [".ts", ".tsx", ".js", ".jsx"],
    JavaScript: [".js", ".jsx", ".ts", ".tsx"],
    Vue: [".vue", ".ts", ".js"],
    Svelte: [".svelte", ".ts", ".js"],
    Go: [".go"],
    Ruby: [".rb"],
  };
  const preferred = (fromLang && extsByLang[fromLang]) || [];
  const rest = [".ts", ".tsx", ".js", ".jsx", ".vue", ".svelte", ".py", ".rb", ".go"]
    .filter((e) => !preferred.includes(e));
  const exts = [...preferred, ...rest];
  const candidates: string[] = [base];
  for (const ext of exts) {
    candidates.push(`${base}${ext}`);
    candidates.push(`${base}/index${ext}`);
  }
  return candidates;
}

/** File extensions that belong to a source language. Used to avoid cross-stack matches. */
function langExtensions(lang?: string): string[] {
  switch (lang) {
    case "Python": return [".py"];
    case "TypeScript": return [".ts", ".tsx"];
    case "JavaScript": return [".js", ".jsx"];
    case "Vue": return [".vue"];
    case "Svelte": return [".svelte"];
    case "Go": return [".go"];
    case "Ruby": return [".rb"];
    default: return [];
  }
}

function findBySuffix(base: string, allPaths: Set<string>, fromLang?: string, fromPath?: string): string | null {
  const normalized = normalizePath(base);
  if (allPaths.has(normalized)) return normalized;

  const wantExts = langExtensions(fromLang);
  const fromTop = fromPath?.split("/")[0];
  const fromDir = fromPath ? normalizePath(fromPath).split("/").slice(0, -1).join("/") : "";

  const matches = [...allPaths].filter((candidate) => {
    const p = normalizePath(candidate);
    return p === normalized ||
      p.endsWith(`/${normalized}`) ||
      p.endsWith(`/${normalized}.ts`) ||
      p.endsWith(`/${normalized}.tsx`) ||
      p.endsWith(`/${normalized}.js`) ||
      p.endsWith(`/${normalized}.jsx`) ||
      p.endsWith(`/${normalized}.vue`) ||
      p.endsWith(`/${normalized}.svelte`) ||
      p.endsWith(`/${normalized}.py`) ||
      p === `${normalized}/index.ts` ||
      p === `${normalized}/index.tsx` ||
      p === `${normalized}/index.js` ||
      p === `${normalized}/index.jsx` ||
      p === `${normalized}/index.vue` ||
      p === `${normalized}/index.svelte` ||
      p === `${normalized}/index.py` ||
      // Python packages: `from pkg.sub import x` lives in pkg/sub/__init__.py
      p === `${normalized}/__init__.py` ||
      p.endsWith(`/${normalized}/__init__.py`);
  });
  if (!matches.length) return null;
  // Rank: same-language extension first, then same top-level folder
  // (Backend vs Frontend), then same directory subtree, then shortest.
  const score = (p: string): number => {
    let s = 0;
    if (wantExts.some((e) => p.endsWith(e))) s += 100;
    else if (wantExts.length > 0) s -= 100; // cross-language penalty
    if (fromTop && p.split("/")[0] === fromTop) s += 50;
    if (fromDir && normalizePath(p).startsWith(`${fromDir}/`)) s += 30;
    s -= Math.min(p.length / 100, 5); // slight preference for shorter paths
    return s;
  };
  matches.sort((a, b) => score(b) - score(a));
  return matches[0];
}

/** Resolve a Python dotted import to a repo-relative base path. Returns null for stdlib/external. */
function resolvePythonImport(raw: string, fromPath: string): string | null {
  const fromDir = normalizePath(fromPath).split("/").slice(0, -1).join("/");
  if (raw.startsWith(".")) {
    // Relative: leading dots = level (1 = same dir, 2 = parent, ...)
    const levelMatch = raw.match(/^(\.+)(.*)$/);
    if (!levelMatch) return null;
    const level = levelMatch[1].length;
    const rest = levelMatch[2].replace(/^\./, "").replace(/\./g, "/");
    const dirParts = fromDir.split("/").filter(Boolean);
    const up = level - 1;
    if (up > dirParts.length) return null;
    const baseDir = dirParts.slice(0, dirParts.length - up).join("/");
    return normalizePath(rest ? `${baseDir}/${rest}` : baseDir);
  }
  // Absolute module path (e.g. app.routes.auth, os, fastapi): stdlib/external
  // names won't match any repo file, so suffix-match handles the rest.
  const dotted = raw.replace(/\./g, "/");
  // Bare single-segment imports (os, sys, re, typing, json) are stdlib — skip
  // unless the repo actually contains such a module file.
  return normalizePath(dotted);
}

function resolveImportWithProvenance(
  imp: string, fromPath: string, allPaths: Set<string>, fromLang?: string
): { path: string; confidence: EdgeConfidence; score: number } | null {
  // How the hit was made decides confidence: exact candidate membership =
  // EXTRACTED (deterministic), suffix fallback = INFERRED (same top folder)
  // or AMBIGUOUS (cross-folder guess). Never regex-guess afterwards.
  const hit = ((): { path: string; exact: boolean } | null => {
    // Fast path: exact candidate hit = EXTRACTED, suffix fallback = INFERRED
    if (fromLang === "Python" && /^[\w.]+$/.test(imp) && imp.includes(".")) {
      const base = resolvePythonImport(imp, fromPath);
      if (!base) return null;
      for (const c of expandImportCandidates(base, fromLang)) {
        if (allPaths.has(c)) return { path: c, exact: true }; // exact
      }
      const fz = findBySuffix(base, allPaths, fromLang, fromPath); // fuzzy
      return fz ? { path: fz, exact: false } : null;
    }
    if (fromLang === "Python" && /^\w+$/.test(imp)) {
      for (const c of expandImportCandidates(normalizePath(imp), fromLang)) {
        if (allPaths.has(c)) return { path: c, exact: true };
      }
      // Bare absolute import (sys.path style, e.g. `from utils import x`):
      // fall back to suffix match instead of dropping the edge — stdlib
      // names simply won't match any repo file.
      const fz = findBySuffix(normalizePath(imp), allPaths, fromLang, fromPath);
      return fz ? { path: fz, exact: false } : null;
    }
    if (!imp.startsWith(".") && !imp.startsWith("~") && !imp.startsWith("@/") && !imp.startsWith("/")) return null;
    const fromDir = normalizePath(fromPath).split("/").slice(0, -1).join("/");
    const rawBase = imp.startsWith("@/") || imp.startsWith("~/")
      ? imp.slice(2)
      : imp.startsWith("/") ? imp.slice(1) : normalizePath(`${fromDir}/${imp}`);
    const base = normalizePath(rawBase);
    for (const c of expandImportCandidates(base, fromLang)) {
      if (allPaths.has(c)) return { path: c, exact: true };
    }
    const fz = findBySuffix(base, allPaths, fromLang, fromPath);
    return fz ? { path: fz, exact: false } : null;
  })();
  if (!hit) return null;
  if (hit.exact) return { path: hit.path, confidence: 'EXTRACTED', score: 1.0 };
  const fromTop = fromPath.split("/")[0];
  const sameTop = hit.path.split("/")[0] === fromTop;
  return sameTop
    ? { path: hit.path, confidence: 'INFERRED', score: 0.85 }
    : { path: hit.path, confidence: 'AMBIGUOUS', score: 0.3 };
}

/**
 * Path-only wrapper for consumers (flow analysis) that need edge targets
 * without provenance bookkeeping. Same resolver, same language rules.
 */
export function resolveImportPath(
  imp: string, fromPath: string, allPaths: Set<string>, fromLang?: string
): string | null {
  return resolveImportWithProvenance(imp, fromPath, allPaths, fromLang)?.path ?? null;
}

function lineOf(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

/** Lightweight symbol extraction with line numbers (no new deps). */
export function extractSymbols(
  content: string, lang: string, filePath: string
): SymbolNode[] {
  // Docs/configs/manifests are not source — a ```python block in a .md file
  // must never become "symbols" of that doc.
  switch (lang) {
    case "TypeScript": case "JavaScript": case "Vue": case "Svelte":
    case "Python": case "Go": case "Rust": case "Java": case "Ruby": case "PHP":
      break;
    default:
      return [];
  }
  const out: SymbolNode[] = [];
  const push = (label: string, kind: SymbolNode['kind'], index: number, exported: boolean, params?: string[]) => {
    if (!label || label.length < 2 || label.length > 80) return;
    if (/^(if|for|while|switch|catch|return|import|export|const|let|var)$/.test(label)) return;
    out.push({
      id: `${filePath}::${label}`,
      label, kind, file: filePath,
      line: lineOf(content, index),
      exported, params: params?.slice(0, 4),
    });
  };
  let m: RegExpExecArray | null;
  if (lang === "TypeScript" || lang === "JavaScript" || lang === "Vue" || lang === "Svelte") {
    const reFn = /(export\s+)?(async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g;
    while ((m = reFn.exec(content)) !== null) {
      push(m[3], 'function', m.index, !!m[1], m[4].split(",").map(s => s.trim().split(":")[0].trim()).filter(Boolean));
    }
    const reClass = /(export\s+)?(default\s+)?class\s+(\w+)/g;
    while ((m = reClass.exec(content)) !== null) push(m[3], 'class', m.index, !!m[1]);
    const reArrow = /export\s+const\s+(\w+)\s*=\s*(async\s*)?\(/g;
    while ((m = reArrow.exec(content)) !== null) push(m[1], 'function', m.index, true);
    const reIface = /export\s+(interface|type|enum)\s+(\w+)/g;
    while ((m = reIface.exec(content)) !== null) push(m[2], m[1] === 'interface' ? 'interface' : 'type', m.index, true);
    const reMethod = /^\s*(async\s+)?(public|private|protected\s+)?(\w+)\s*\([^)]*\)\s*\{/gm;
    while ((m = reMethod.exec(content)) !== null) {
      if (out.some(s => s.label === m![3])) continue;
      if (m[3].length > 2) push(m[3], 'method', m.index, false);
    }
  } else if (lang === "Python") {
    const reDef = /^(async\s+)?def\s+(\w+)\s*\(([^)]*)\)/gm;
    while ((m = reDef.exec(content)) !== null) {
      const exported = !m[2].startsWith("_") || m[2].startsWith("__");
      push(m[2], 'function', m.index, exported, m[3].split(",").map(s => s.trim().split(":")[0].trim()).filter(Boolean));
    }
    const reCls = /^class\s+(\w+)/gm;
    while ((m = reCls.exec(content)) !== null) push(m[1], 'class', m.index, true);
  } else {
    // Go/Rust/Java/Ruby/PHP: generic func/class shape
    const reG = /^(?:func\s+(\w+)|class\s+(\w+)|def\s+(\w+))\b/gm;
    while ((m = reG.exec(content)) !== null) {
      push(m[1] || m[2] || m[3], 'function', m.index, true);
    }
  }
  // Dedup, cap per file
  return [...new Map(out.map(s => [s.id, s])).values()].slice(0, 40);
}

/** Detect connected components (communities) over undirected file graph. */
export function detectCommunities(graph: DependencyGraph): GraphCommunity[] {
  const adj = new Map<string, Set<string>>();
  for (const n of graph.nodes) adj.set(n.id, new Set());
  for (const e of graph.edges) {
    adj.get(e.source)?.add(e.target);
    adj.get(e.target)?.add(e.source);
  }
  const seen = new Set<string>();
  const comps: string[][] = [];
  for (const n of graph.nodes) {
    if (seen.has(n.id)) continue;
    const stack = [n.id]; seen.add(n.id);
    const comp: string[] = [];
    while (stack.length) {
      const cur = stack.pop()!;
      comp.push(cur);
      for (const nb of adj.get(cur) ?? []) {
        if (!seen.has(nb)) { seen.add(nb); stack.push(nb); }
      }
    }
    comps.push(comp);
  }
  return comps
    .sort((a, b) => b.length - a.length)
    .slice(0, 12)
    .map((members, i) => {
      const tops = [...new Set(members.map(m => m.split("/")[0]))].slice(0, 3).join("/");
      const layer = detectArchLayer(members[0] ?? "");
      return { id: i, label: `${layer} · ${tops || "root"}`, members, size: members.length };
    });
}

export function getGodNodes(graph: DependencyGraph, n = 10): string[] {
  return [...graph.nodes]
    .sort((a, b) => (b.inDegree + b.outDegree) - (a.inDegree + a.outDegree))
    .slice(0, n)
    .map(x => x.path);
}

/** Blast radius: 2-hop callers + callees around changed files (graphify PR parity). */
export function getBlastRadius(graph: DependencyGraph, changed: string[], hops = 2): string[] {
  const adj = new Map<string, Set<string>>();
  for (const n of graph.nodes) adj.set(n.path, new Set());
  for (const e of graph.edges) {
    adj.get(e.source)?.add(e.target);
    adj.get(e.target)?.add(e.source);
  }
  const paths = new Set<string>();
  const norm = (p: string) => p.replace(/^[ab]\//, "");
  const known = new Set(graph.nodes.map(n => n.path));
  const starts = changed.map(norm).filter(p =>
    known.has(p) || [...known].some(k => k.endsWith("/" + p) || k === p)
  ).map(p => [...known].find(k => k === p || k.endsWith("/" + p))!);
  const seen = new Set(starts);
  let frontier = new Set(starts);
  for (let h = 0; h < hops; h++) {
    const next = new Set<string>();
    for (const cur of frontier) {
      for (const nb of adj.get(cur) ?? []) {
        if (!seen.has(nb)) { seen.add(nb); next.add(nb); paths.add(nb); }
      }
    }
    frontier = next;
    if (!frontier.size) break;
  }
  return [...paths].slice(0, 30);
}

export function diagnoseGraph(graph: DependencyGraph): GraphHealth {
  const ids = new Set(graph.nodes.map(n => n.id));
  let dangling = 0, missing = 0, selfLoops = 0;
  for (const e of graph.edges) {
    if (e.source === e.target) selfLoops++;
    if (!ids.has(e.source) || !ids.has(e.target)) { dangling++; missing++; }
  }
  const warnings: string[] = [];
  if (dangling) warnings.push(`${dangling} edges reference missing nodes (fuzzy resolve?)`);
  if (selfLoops) warnings.push(`${selfLoops} self-loops ignored`);
  const amb = graph.edges.filter(e => e.confidence === 'AMBIGUOUS').length;
  if (amb) warnings.push(`${amb} AMBIGUOUS imports (verify by reading source)`);
  return { dangling, missing, selfLoops, ok: warnings.length === 0, warnings };
}

/** GraphRAG-ready JSON (graphify parity: nodes carry community + line info). */
export function toGraphJSON(graph: DependencyGraph): object {
  const commOf = new Map<string, number>();
  (graph.communities ?? []).forEach(c => c.members.forEach(m => commOf.set(m, c.id)));
  return {
    nodes: [
      ...graph.nodes.map(n => ({
        id: n.path, label: n.label, file_type: 'code',
        source_file: n.path, source_location: null,
        language: n.language, inDegree: n.inDegree, outDegree: n.outDegree,
        community: commOf.get(n.path) ?? null, group: n.group,
      })),
      ...(graph.symbols ?? []).map(s => ({
        id: s.id, label: s.label, file_type: 'code',
        source_file: s.file, source_location: s.line,
        kind: s.kind, exported: s.exported,
        community: commOf.get(s.file) ?? null,
      })),
    ],
    links: (graph.typedEdges ?? []).map(e => ({
      source: e.source, target: e.target, relation: e.relation,
      confidence: e.confidence, confidence_score: e.confidenceScore,
      source_file: e.sourceFile, source_location: e.sourceLocation ?? null,
    })),
  };
}

export function buildGraphReport(graph: DependencyGraph, repoName: string): string {
  const L: string[] = [];
  L.push(`# ${repoName}: Graph Report`);
  L.push(`Files: ${graph.nodes.length} · imports: ${graph.edges.length} · symbols: ${graph.symbols?.length ?? 0}`);
  L.push(`Provenance: EXTRACTED ${graph.stats?.extracted ?? 0} · INFERRED ${graph.stats?.inferred ?? 0} · AMBIGUOUS ${graph.stats?.ambiguous ?? 0}`);
  L.push(``);
  L.push(`## God nodes (highest risk to change)`);
  for (const g of (graph.godNodes ?? []).slice(0, 10)) L.push(`- \`${g}\``);
  L.push(``);
  L.push(`## Communities`);
  for (const c of (graph.communities ?? []).slice(0, 8)) {
    L.push(`- ${c.label} (${c.size} files): ${c.members.slice(0, 5).map(m => `\`${m}\``).join(", ")}${c.size > 5 ? " …" : ""}`);
  }
  L.push(``);
  if (graph.health && !graph.health.ok) {
    L.push(`## Health warnings`);
    for (const w of graph.health.warnings) L.push(`- ${w}`);
  } else {
    L.push(`Health: OK`);
  }
  return L.join("\n");
}

export function buildDependencyGraph(
  files: Array<{ path: string; content: string; size: number; language: string; absPath?: string }>
): DependencyGraph {
  const allPaths = new Set(files.map((f) => f.path));
  const nodeMap = new Map<string, GraphNode>();

  for (const file of files) {
    const matches = extractImports(file.content, file.language);
    const fileExports = extractExports(file.content, file.language);
    const label = file.path.split("/").pop() || file.path;
    const parts = file.path.split("/");
    const group = parts.length > 1 ? parts[0] : "root";
    nodeMap.set(file.path, {
      id: file.path,
      label,
      path: file.path,
      absPath: (file as any).absPath,
      language: file.language,
      size: file.size,
      imports: matches.map((i) => i.path),
      importedBy: [],
      exports: fileExports,
      group,
      inDegree: 0,
      outDegree: 0,
    });
  }

  const edges: GraphEdge[] = [];
  const edgeSet = new Set<string>();
  const typedEdges: TypedEdge[] = [];
  const symbols: SymbolNode[] = [];
  const contentByPath = new Map(files.map(f => [f.path, f.content]));

  // Symbols + defines edges (EXTRACTED — straight out of the file)
  for (const file of files) {
    for (const s of extractSymbols(file.content, file.language, file.path)) {
      symbols.push(s);
      typedEdges.push({
        source: file.path, target: s.id, relation: 'defines',
        confidence: 'EXTRACTED', confidenceScore: 1.0,
        sourceFile: file.path, sourceLocation: s.line,
      });
    }
  }

  for (const file of files) {
    const node = nodeMap.get(file.path)!;
    const matches = extractImports(file.content, file.language);
    // Import statement line numbers for citations
    const importLines = new Map<string, number>();
    for (const m of matches) {
      const idx = file.content.indexOf(m.path);
      if (idx >= 0 && !importLines.has(m.path)) importLines.set(m.path, lineOf(file.content, idx));
    }
    for (const match of matches) {
      const r = resolveImportWithProvenance(match.path, file.path, allPaths, file.language);
      if (!r || r.path === file.path) continue;
      const resolved = r.path;
      const key = `${file.path}→${resolved}`;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      edges.push({
        source: file.path, target: resolved, label: match.names?.split("\n")[0].slice(0, 60),
        relation: 'imports', confidence: r.confidence, confidenceScore: r.score,
        sourceLocation: importLines.get(match.path),
      });
      typedEdges.push({
        source: file.path, target: resolved, relation: 'imports',
        confidence: r.confidence, confidenceScore: r.score,
        sourceFile: file.path, sourceLocation: importLines.get(match.path),
      });
      node.outDegree++;
      const target = nodeMap.get(resolved);
      if (target) { target.inDegree++; target.importedBy.push(file.path); }

      // Calls edge (INFERRED): imported name is actually invoked in this file.
      // e.g. `import { Foo } from './bar'` + `Foo(` → calls. Never assert without evidence.
      if (match.names) {
        const names = match.names.split(",").map(s => s.trim().split(/\s+/)[0]).filter(Boolean).slice(0, 5);
        for (const nm of names) {
          if (nm.length < 2 || nm === "*" || nm === "type") continue;
          const callRe = new RegExp(`\\b${nm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\(`, "g");
          const cm = callRe.exec(file.content);
          if (cm) {
            typedEdges.push({
              source: file.path, target: resolved, relation: 'calls',
              confidence: r.confidence === 'EXTRACTED' ? 'INFERRED' : 'AMBIGUOUS',
              confidenceScore: r.confidence === 'EXTRACTED' ? 0.85 : 0.3,
              sourceFile: file.path, sourceLocation: lineOf(file.content, cm.index),
            });
            break; // one calls edge per import is enough
          }
        }
      }
    }
  }

  for (const node of nodeMap.values()) {
    node.importedBy = [...new Set(node.importedBy)];
    node.imports = [...new Set(node.imports)];
  }

  const graph: DependencyGraph = { nodes: [...nodeMap.values()], edges, symbols, typedEdges };
  graph.communities = detectCommunities(graph);
  graph.godNodes = getGodNodes(graph, 10);
  graph.health = diagnoseGraph(graph);
  let ex = 0, inf = 0, amb = 0;
  for (const e of edges) {
    if (e.confidence === 'EXTRACTED') ex++;
    else if (e.confidence === 'INFERRED') inf++;
    else amb++; // AMBIGUOUS or untagged (old records) — never silently EXTRACTED
  }
  graph.stats = { extracted: ex, inferred: inf, ambiguous: amb };
  void contentByPath;
  return graph;
}

export function getTopFiles(graph: DependencyGraph, n = 20): GraphNode[] {
  return [...graph.nodes]
    .sort((a, b) => (b.inDegree + b.outDegree) - (a.inDegree + a.outDegree))
    .slice(0, n);
}

// ── Architectural Layer Detection ──────────────────────────────────────────

export type ArchLayer =
  | 'api'
  | 'service'
  | 'data'
  | 'ui'
  | 'util'
  | 'config'
  | 'test'
  | 'infra'
  | 'core';

const LAYER_PATTERNS: Array<{ layer: ArchLayer; patterns: RegExp[] }> = [
  { layer: 'test',    patterns: [/[._-](spec|test)\.(ts|js|tsx|jsx|py|rb|go)$/, /\/(tests?|__tests?__|spec|__spec__|e2e|cypress)\//i] },
  { layer: 'infra',   patterns: [/\/(k8s|kubernetes|terraform|helm|docker|ci|cd|deploy|infra|devops|pipeline|github|actions|workflows)\//i, /\.ya?ml$/, /Dockerfile/i, /\.tf$/] },
  { layer: 'config',  patterns: [/\/(config|configs|configuration|settings|env|environments)\//i, /\.(config|env|rc)\.(ts|js|json)$/, /^(vite|webpack|rollup|tsconfig|jest|eslint|babel|next)\./, /\.json$/] },
  { layer: 'api',     patterns: [/\/(routes?|controllers?|handlers?|endpoints?|api|rest|graphql|grpc|gateway)\//i, /\.(route|controller|handler|resolver|schema)\.(ts|js|py|go|rb)$/i] },
  { layer: 'data',    patterns: [/\/(models?|entities|schemas?|migrations?|repositories?|dao|db|database|prisma|mongo|orm|seeds?)\//i, /\.(model|entity|schema|migration|repository|dao)\.(ts|js|py|go|rb)$/i] },
  { layer: 'service', patterns: [/\/(services?|providers?|agents?|workers?|jobs?|queues?|processors?|use-?cases?)\//i, /\.(service|provider|agent|worker|job|usecase)\.(ts|js|py|go|rb)$/i] },
  { layer: 'ui',      patterns: [/\/(components?|pages?|views?|screens?|layouts?|ui|widgets?|containers?)\//i, /\.(component|page|view|screen|layout|widget)\.(tsx|jsx|vue|svelte)$/i, /\.(tsx|jsx|vue|svelte)$/] },
  { layer: 'util',    patterns: [/\/(utils?|helpers?|lib|libs?|shared|common|core|internal|tools?|support)\//i, /\.(util|helper|lib|shared)\.(ts|js|py|go|rb)$/i] },
];

export function detectArchLayer(path: string): ArchLayer {
  for (const { layer, patterns } of LAYER_PATTERNS) {
    for (const pat of patterns) {
      if (pat.test(path)) return layer;
    }
  }
  return 'core';
}

export interface LayerGroup {
  layer: ArchLayer;
  label: string;
  description: string;
  fileCount: number;
  filePaths: string[];
  totalDegree: number;         // sum of inDegree+outDegree for complexity
  complexity: 'simple' | 'moderate' | 'complex';
  dependsOn: ArchLayer[];      // layers this one imports from
  dependedOnBy: ArchLayer[];   // layers that import from this one
}

const LAYER_LABELS: Record<ArchLayer, string> = {
  api:     'API / Routes',
  service: 'Services',
  data:    'Data / Models',
  ui:      'UI / Components',
  util:    'Utilities',
  config:  'Config',
  test:    'Tests',
  infra:   'Infrastructure',
  core:    'Core',
};

const LAYER_DESC: Record<ArchLayer, string> = {
  api:     'HTTP routes, controllers, and request handlers',
  service: 'Business logic, use cases, and background workers',
  data:    'Database models, repositories, and migrations',
  ui:      'Components, pages, views, and UI logic',
  util:    'Shared helpers, utilities, and common code',
  config:  'App configuration, environment, and build setup',
  test:    'Unit tests, integration tests, and test fixtures',
  infra:   'Infrastructure, CI/CD, deployment config',
  core:    'Core application code and entry points',
};

export function buildLayerGroups(graph: DependencyGraph): LayerGroup[] {
  // 1. Assign each node a layer
  const nodeLayer = new Map<string, ArchLayer>();
  for (const node of graph.nodes) {
    nodeLayer.set(node.id, detectArchLayer(node.path));
  }

  // 2. Collect nodes per layer
  const layerNodes = new Map<ArchLayer, GraphNode[]>();
  for (const node of graph.nodes) {
    const l = nodeLayer.get(node.id)!;
    if (!layerNodes.has(l)) layerNodes.set(l, []);
    layerNodes.get(l)!.push(node);
  }

  // 3. Build cross-layer dependency edges
  const layerDeps = new Map<string, Set<ArchLayer>>();  // "from→to"
  for (const edge of graph.edges) {
    const fromLayer = nodeLayer.get(edge.source);
    const toLayer   = nodeLayer.get(edge.target);
    if (!fromLayer || !toLayer || fromLayer === toLayer) continue;
    const key = fromLayer;
    if (!layerDeps.has(key)) layerDeps.set(key, new Set());
    layerDeps.get(key)!.add(toLayer);
  }

  // 4. Build groups for layers that have at least 1 file
  const groups: LayerGroup[] = [];
  for (const [layer, nodes] of layerNodes.entries()) {
    const totalDegree = nodes.reduce((s, n) => s + n.inDegree + n.outDegree, 0);
    const avgDegree   = totalDegree / nodes.length;
    const complexity: LayerGroup['complexity'] =
      avgDegree > 10 ? 'complex' : avgDegree > 4 ? 'moderate' : 'simple';

    const dependsOn   = [...(layerDeps.get(layer) ?? [])];
    // dependedOnBy: which other layers have this layer in their dependsOn
    const dependedOnBy: ArchLayer[] = [];
    for (const [fromLayer, deps] of layerDeps.entries()) {
      if (deps.has(layer) && fromLayer !== layer) dependedOnBy.push(fromLayer as ArchLayer);
    }

    groups.push({
      layer,
      label: LAYER_LABELS[layer],
      description: LAYER_DESC[layer],
      fileCount: nodes.length,
      filePaths: nodes.map(n => n.path),
      totalDegree,
      complexity,
      dependsOn,
      dependedOnBy,
    });
  }

  // Sort by descending fileCount so biggest layers are prominent
  return groups.sort((a, b) => b.fileCount - a.fileCount);
}
