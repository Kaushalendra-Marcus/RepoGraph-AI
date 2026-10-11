// GraphCache.ts — disk cache so reopen = instant, edits = incremental.
// This is what makes RepoGraph one-click vs graphify CLI (`/graphify . --update` by hand).
// Cache lives in extension storage (not the repo): <storage>/repograph-cache/graph.json + manifest.json
// Fallback: <workspace>/.repograph/ when storageUri is unavailable.

import * as vscode from "vscode";
import { DependencyGraph } from "./GraphBuilder";
import { WorkspaceFile } from "./WorkspaceScanner";

export interface CacheManifest {
  version: 1;
  repoName: string;
  rootPath: string;
  timestamp: number;
  files: Record<string, { size: number; hash: string }>;
}

export interface CachedGraph {
  graph: DependencyGraph;
  manifest: CacheManifest;
}

/** Cheap non-crypto hash (djb2) — enough to detect edits without re-reading. */
export function hashContent(content: string): string {
  let h = 5381;
  for (let i = 0; i < content.length; i++) {
    h = ((h << 5) + h + content.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

export function buildManifest(
  repoName: string,
  rootPath: string,
  files: WorkspaceFile[]
): CacheManifest {
  const out: CacheManifest = {
    version: 1,
    repoName,
    rootPath,
    timestamp: Date.now(),
    files: {},
  };
  for (const f of files) {
    out.files[f.path] = { size: f.size, hash: hashContent(f.content) };
  }
  return out;
}

/** Compare current files against a cached manifest. */
export function diffManifest(
  cached: CacheManifest | null,
  files: WorkspaceFile[]
): { added: string[]; changed: string[]; deleted: string[]; unchanged: string[]; isHit: boolean } {
  if (!cached) {
    return { added: files.map((f) => f.path), changed: [], deleted: [], unchanged: [], isHit: false };
  }
  const current = new Map(files.map((f) => [f.path, f]));
  const added: string[] = [];
  const changed: string[] = [];
  const unchanged: string[] = [];
  for (const f of files) {
    const prev = cached.files[f.path];
    if (!prev) {
      added.push(f.path);
    } else if (prev.size !== f.size || prev.hash !== hashContent(f.content)) {
      changed.push(f.path);
    } else {
      unchanged.push(f.path);
    }
  }
  const curSet = new Set(files.map((f) => f.path));
  const deleted = Object.keys(cached.files).filter((p) => !curSet.has(p));
  void current;
  return { added, changed, deleted, unchanged, isHit: added.length === 0 && changed.length === 0 && deleted.length === 0 };
}

async function ensureDir(uri: vscode.Uri): Promise<void> {
  try {
    await vscode.workspace.fs.createDirectory(uri);
  } catch {
    // exists — ignore
  }
}

async function readJson(uri: vscode.Uri): Promise<unknown | null> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

async function writeJson(uri: vscode.Uri, data: unknown): Promise<void> {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  await vscode.workspace.fs.writeFile(uri, bytes);
}

/** Resolve a writable cache dir. Prefers extension storage (invisible), falls back to .repograph/. */
export async function resolveCacheDir(
  context: vscode.ExtensionContext
): Promise<vscode.Uri | null> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) return null;
  let base: vscode.Uri | undefined = context.storageUri;
  if (!base) {
    base = vscode.Uri.joinPath(folders[0].uri, ".repograph");
  } else {
    base = vscode.Uri.joinPath(base, "repograph-cache");
  }
  await ensureDir(base);
  return base;
}

export async function loadGraphCache(dir: vscode.Uri): Promise<CachedGraph | null> {
  const [graphRaw, manRaw] = await Promise.all([
    readJson(vscode.Uri.joinPath(dir, "graph.json")),
    readJson(vscode.Uri.joinPath(dir, "manifest.json")),
  ]);
  if (!graphRaw || !manRaw) return null;
  const manifest = manRaw as CacheManifest;
  if (manifest.version !== 1) return null;
  return { graph: graphRaw as DependencyGraph, manifest };
}

export async function saveGraphCache(
  dir: vscode.Uri,
  graph: DependencyGraph,
  manifest: CacheManifest
): Promise<void> {
  // Slim before writing — same caps as history records.
  const slim: DependencyGraph = {
    nodes: graph.nodes,
    edges: graph.edges.slice(0, 2000),
    symbols: graph.symbols?.slice(0, 1200),
    typedEdges: graph.typedEdges?.slice(0, 3000),
    communities: graph.communities,
    godNodes: graph.godNodes,
    health: graph.health,
    stats: graph.stats,
  };
  await Promise.all([
    writeJson(vscode.Uri.joinPath(dir, "graph.json"), slim),
    writeJson(vscode.Uri.joinPath(dir, "manifest.json"), manifest),
  ]);
}
