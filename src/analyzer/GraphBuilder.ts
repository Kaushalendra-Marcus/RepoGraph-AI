export interface GraphNode {
  id: string;
  label: string;
  path: string;
  absPath?: string;
  language: string;
  size: number;
  imports: string[];       // raw import strings
  importedBy: string[];    // resolved paths that import this file
  exports: string[];
  group: string;
  inDegree: number;
  outDegree: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  label?: string;
}

export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface ImportMatch {
  path: string;
  names?: string;
}

// ── Import extraction per language ─────────────────────────────────────────

function extractImports(content: string, lang: string): ImportMatch[] {
  const results: ImportMatch[] = [];
  let m: RegExpExecArray | null;

  if (
    lang === "TypeScript" ||
    lang === "JavaScript" ||
    lang === "Vue" ||
    lang === "Svelte" ||
    lang === "Astro"
  ) {
    // static imports: import X from 'y', import 'y'
    const r1 = /import\s+(?:type\s+)?(?:([\w*{}\s,]+)\s+from\s+)?['"]([^'"]+)['"]/g;
    while ((m = r1.exec(content)) !== null) {
      results.push({ path: m[2], names: m[1]?.trim() });
    }
    // require()
    const r2 = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((m = r2.exec(content)) !== null) results.push({ path: m[1] });
    // dynamic import()
    const r3 = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((m = r3.exec(content)) !== null) results.push({ path: m[1] });
    // export ... from
    const r4 = /export\s+(?:type\s+)?(?:[\w{}\s,*]+)\s+from\s+['"]([^'"]+)['"]/g;
    while ((m = r4.exec(content)) !== null) results.push({ path: m[1] });
  } else if (lang === "Python") {
    const r1 = /^from\s+([\w.]+)\s+import\s+(.+)/gm;
    while ((m = r1.exec(content)) !== null) {
      results.push({ path: m[1].replace(/\./g, "/"), names: m[2].trim() });
    }
    const r2 = /^import\s+([\w.]+)/gm;
    while ((m = r2.exec(content)) !== null) {
      results.push({ path: m[1].replace(/\./g, "/") });
    }
  } else if (lang === "Go") {
    const r1 = /import\s+"([^"]+)"/g;
    while ((m = r1.exec(content)) !== null) results.push({ path: m[1] });
    const block = content.match(/import\s*\(([^)]+)\)/s);
    if (block) {
      const r2 = /"([^"]+)"/g;
      while ((m = r2.exec(block[1])) !== null) results.push({ path: m[1] });
    }
  } else if (lang === "Rust") {
    const r1 = /^use\s+([\w:]+)/gm;
    while ((m = r1.exec(content)) !== null) {
      results.push({ path: m[1].replace(/::/g, "/") });
    }
    const r2 = /^mod\s+(\w+)\s*;/gm;
    while ((m = r2.exec(content)) !== null) results.push({ path: m[1] });
  } else if (lang === "Java" || lang === "Kotlin") {
    const r1 = /^import\s+([\w.]+);/gm;
    while ((m = r1.exec(content)) !== null) {
      results.push({ path: m[1].replace(/\./g, "/") });
    }
  } else if (lang === "Ruby") {
    const r1 = /require(?:_relative)?\s+['"]([^'"]+)['"]/g;
    while ((m = r1.exec(content)) !== null) results.push({ path: m[1] });
  } else if (lang === "PHP") {
    const r1 = /(?:require|include)(?:_once)?\s+['"]([^'"]+)['"]/g;
    while ((m = r1.exec(content)) !== null) results.push({ path: m[1] });
  } else if (lang === "C#") {
    const r1 = /^using\s+([\w.]+);/gm;
    while ((m = r1.exec(content)) !== null) {
      results.push({ path: m[1].replace(/\./g, "/") });
    }
  }

  return results;
}

function extractExports(content: string, lang: string): string[] {
  const exports: string[] = [];
  if (lang === "TypeScript" || lang === "JavaScript") {
    let m: RegExpExecArray | null;
    const r1 =
      /export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type|enum|abstract\s+class)\s+(\w+)/g;
    while ((m = r1.exec(content)) !== null) exports.push(m[1]);
    const r2 = /export\s+\{([^}]+)\}/g;
    while ((m = r2.exec(content)) !== null) {
      exports.push(
        ...m[1]
          .split(",")
          .map((s) => s.trim().split(/\s+as\s+/).pop()!.trim())
          .filter(Boolean)
      );
    }
  } else if (lang === "Python") {
    let m: RegExpExecArray | null;
    const r1 = /^(?:class|def)\s+(\w+)/gm;
    while ((m = r1.exec(content)) !== null) {
      if (!m[1].startsWith("_")) exports.push(m[1]);
    }
  }
  return [...new Set(exports)].slice(0, 12);
}

// ── Path resolution ────────────────────────────────────────────────────────

function normalizePath(raw: string): string {
  const parts = raw.replace(/\\/g, "/").split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p !== ".") out.push(p);
  }
  return out.join("/");
}

function expandCandidates(base: string): string[] {
  return [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.vue`,
    `${base}.svelte`,
    `${base}.py`,
    `${base}.go`,
    `${base}.rs`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
    `${base}/index.jsx`,
    `${base}/index.vue`,
    `${base}/index.svelte`,
    `${base}/mod.rs`,
    `${base}/__init__.py`,
  ];
}

function resolveImport(
  imp: string,
  fromPath: string,
  allPaths: Set<string>
): string | null {
  // Only resolve relative and alias imports
  const isRelative = imp.startsWith(".");
  const isAlias =
    imp.startsWith("@/") ||
    imp.startsWith("~/") ||
    imp.startsWith("/") ||
    imp.startsWith("src/") ||
    imp.startsWith("app/") ||
    imp.startsWith("lib/") ||
    imp.startsWith("components/") ||
    imp.startsWith("pages/") ||
    imp.startsWith("utils/") ||
    imp.startsWith("hooks/") ||
    imp.startsWith("store/") ||
    imp.startsWith("api/") ||
    imp.startsWith("services/");

  if (!isRelative && !isAlias) return null;

  let base: string;

  if (isRelative) {
    const fromDir = normalizePath(fromPath).split("/").slice(0, -1).join("/");
    base = normalizePath(`${fromDir}/${imp}`);
  } else if (imp.startsWith("@/") || imp.startsWith("~/")) {
    base = normalizePath(imp.slice(2));
  } else if (imp.startsWith("/")) {
    base = normalizePath(imp.slice(1));
  } else {
    base = normalizePath(imp);
  }

  for (const candidate of expandCandidates(base)) {
    if (allPaths.has(candidate)) return candidate;
  }

  // Fuzzy suffix match for when path roots don't align
  const baseName = base.split("/").pop() || "";
  if (baseName.length > 2) {
    for (const p of allPaths) {
      if (
        p.endsWith(`/${base}`) ||
        p.endsWith(`/${base}.ts`) ||
        p.endsWith(`/${base}.tsx`) ||
        p.endsWith(`/${base}.js`) ||
        p.endsWith(`/${base}/index.ts`) ||
        p.endsWith(`/${base}/index.js`)
      ) {
        return p;
      }
    }
  }

  return null;
}

// ── Main graph builder ─────────────────────────────────────────────────────

export function buildDependencyGraph(
  files: Array<{
    path: string;
    content: string;
    size: number;
    language: string;
    absPath?: string;
  }>
): DependencyGraph {
  const allPaths = new Set(files.map((f) => f.path));
  const nodeMap = new Map<string, GraphNode>();

  // First pass: create all nodes
  for (const file of files) {
    const matches = extractImports(file.content, file.language);
    const exports = extractExports(file.content, file.language);
    const label = file.path.split("/").pop() || file.path;
    const parts = file.path.split("/");
    // Group by top-level directory, or "root" if at root level
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
      exports,
      group,
      inDegree: 0,
      outDegree: 0,
    });
  }

  // Second pass: resolve imports and build edges
  const edges: GraphEdge[] = [];
  const edgeSet = new Set<string>();

  for (const file of files) {
    const node = nodeMap.get(file.path)!;
    const matches = extractImports(file.content, file.language);

    for (const match of matches) {
      const resolved = resolveImport(match.path, file.path, allPaths);
      if (!resolved || resolved === file.path) continue;

      const edgeKey = `${file.path}=>${resolved}`;
      if (edgeSet.has(edgeKey)) continue;
      edgeSet.add(edgeKey);

      edges.push({
        source: file.path,
        target: resolved,
        label: match.names?.slice(0, 40),
      });

      node.outDegree++;
      const target = nodeMap.get(resolved);
      if (target) {
        target.inDegree++;
        target.importedBy.push(file.path);
      }
    }
  }

  // Deduplicate importedBy
  for (const node of nodeMap.values()) {
    node.importedBy = [...new Set(node.importedBy)];
    node.imports = [...new Set(node.imports)];
  }

  return { nodes: [...nodeMap.values()], edges };
}

export function getTopFiles(graph: DependencyGraph, n = 20): GraphNode[] {
  return [...graph.nodes]
    .sort((a, b) => b.inDegree + b.outDegree - (a.inDegree + a.outDegree))
    .slice(0, n);
}