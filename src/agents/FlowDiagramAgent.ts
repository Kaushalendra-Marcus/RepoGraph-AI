import { AIProvider } from "../providers/types";
import { WorkspaceInfo } from "../analyzer/WorkspaceScanner";
import { RepoSummary } from "./RepoSummaryAgent";
import { FileSummary } from "./FileSummaryAgent";
import { FlowContext, CallChain } from "../analyzer/FlowAnalyzer";
import { SymbolNode } from "../analyzer/GraphBuilder";

// ── Types ──────────────────────────────────────────────────────────────────

export interface FlowSubDiagram {
  id: string;
  title: string;
  description: string;
  mermaidCode: string;
  category: FlowCategory;
  relatedFiles: string[];
  /** Mermaid dialect — flowchart renders offline, sequence/class need mermaid.js. */
  diagramKind?: 'flowchart' | 'sequence' | 'class';
  /** Exact jump targets parallel to relatedFiles: `path:line`. */
  relatedLines?: string[];
  /** Health/risk badges painted on tiles (god-file, dead, ambiguous). */
  badges?: string[];
}

export type FlowCategory =
  | "auth"
  | "api"
  | "data"
  | "component"
  | "service"
  | "background"
  | "custom";

interface ArchitectureProfile {
  kind: "frontend" | "backend" | "event-driven" | "data-heavy" | "cli" | "library" | "mixed";
  hasRoutes: boolean;
  hasDb: boolean;
  hasEvents: boolean;
  hasMiddleware: boolean;
  hasComponents: boolean;
  hasJobs: boolean;
  hasCli: boolean;
}

export interface FullFlowMap {
  subDiagrams: FlowSubDiagram[];
  overviewMermaid: string;
  tour?: TourStep[];
}

// ── Auto-detect flows ──────────────────────────────────────────────────────

export async function autoDetectFlows(
  provider: AIProvider,
  info: WorkspaceInfo,
  summary: RepoSummary,
  fileSummaries: FileSummary[],
  flowCtx: FlowContext,
  symbols: SymbolNode[] = []
): Promise<FullFlowMap> {
  void provider;
  void info;
  // Single complete diagram, with or without a key. Per-topic AI diagrams
  // are on demand only (ask row → generateCustomFlow), never bulk-built.
  return buildAdaptiveFlowMap(info.name, summary, fileSummaries, flowCtx, symbols);
}



// ── Custom diagram from user question ─────────────────────────────────────

export async function generateCustomFlow(
  provider: AIProvider,
  question: string,
  info: WorkspaceInfo,
  summary: RepoSummary,
  fileSummaries: FileSummary[],
  flowCtx: FlowContext,
  graph?: { nodes: Array<{ path: string; label: string }>; symbols?: Array<{ label: string; file: string }> }
): Promise<FlowSubDiagram> {
  const ctx = flowCtx.summary;
  // Vocab-constrained traversal (not keyword includes): pick ≤12 tokens that
  // actually exist in graph vocab, then score files/symbols by overlap.
  const vocab = new Set<string>();
  const addV = (s: string) => {
    for (const tok of s.toLowerCase().split(/[^a-z0-9]+/)) {
      if (tok.length >= 3 && tok.length <= 30) vocab.add(tok);
    }
  };
  for (const f of fileSummaries) { addV(f.path); addV(f.purpose); for (const fn of f.keyFunctions ?? []) addV(fn); }
  for (const n of graph?.nodes ?? []) { addV(n.path); addV(n.label); }
  for (const s of graph?.symbols ?? []) { addV(s.label); addV(s.file); }
  for (const r of ctx.routes) addV(r);

  const words = question.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  let expanded = words.filter((w) => vocab.has(w)).slice(0, 12);
  if (!expanded.length) {
    // substring fallback, still constrained to vocab (no invention)
    outer: for (const w of words) {
      for (const t of vocab) {
        if (t.includes(w) || w.includes(t)) {
          if (!expanded.includes(t)) expanded.push(t);
          if (expanded.length >= 12) break outer;
        }
      }
    }
  }
  const terms = expanded.length ? expanded : words.filter((w) => w.length > 3).slice(0, 8);
  const score = (hay: string) => terms.filter((t) => hay.toLowerCase().includes(t)).length;

  const relevantFiles = [...fileSummaries]
    .map((f) => ({
      f,
      s: Math.max(
        score(f.path),
        score(f.purpose),
        ...(f.keyFunctions ?? []).map((fn) => score(fn))
      ),
    }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 10)
    .map((x) => x.f);
  const fallbackFiles = relevantFiles.length ? relevantFiles : fileSummaries.slice(0, 5);

  // Filter call chains relevant to these files
  const relevantChains = flowCtx.callChains
    .filter((c) => fallbackFiles.some((f) => c.from === f.path || c.to === f.path))
    .slice(0, 15)
    .map((c) => `  ${c.from.split("/").slice(-2).join("/")} → ${c.to.split("/").slice(-2).join("/")} (${c.method})`);

  // Filter routes relevant to question (scored, not keyword-includes)
  const relevantRoutes = ctx.routes
    .map((r) => ({ r, s: score(r) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 8)
    .map((x) => x.r);

  // Filter DB access relevant to question
  const relevantDb = ctx.dbLines
    .map((d) => ({ d, s: score(d) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 5)
    .map((x) => x.d);

  const prompt = `You are analyzing the codebase "${info.name}".

User wants to understand: "${question}"

=== RELEVANT ROUTES ===
${relevantRoutes.length ? relevantRoutes.join("\n") : "None matched"}

=== RELEVANT CALL CHAINS ===
${relevantChains.length ? relevantChains.join("\n") : "None matched"}

=== RELEVANT DATABASE ACCESS ===
${relevantDb.length ? relevantDb.join("\n") : "None matched"}

=== RELEVANT FILES & THEIR PURPOSE ===
${fallbackFiles.map((f) => `${f.path}:\n  Purpose: ${f.purpose}\n  Exports: ${f.exports}\n  Key functions: ${f.keyFunctions?.join(", ") || "none"}`).join("\n")}

=== ALL EXPORTED FUNCTIONS ===
${ctx.exportedFunctions.slice(0, 15).join("\n")}

---

Generate a Mermaid flowchart that DIRECTLY answers the user's question using REAL names from the data above.

RULES:
- flowchart TD direction
- Node IDs: alphanumeric + underscores only
- Node labels in quotes if they contain spaces/special chars
- Use real function names, real route paths, real class names from data above
- Max 12 nodes
- Show actual data flow: input → processing → output
- Include error/edge cases if routes show them

Respond ONLY with valid JSON:
{
  "id": "custom_<snake_case>",
  "title": "Title using real names",
  "description": "One accurate sentence based on real code",
  "category": "custom",
  "relatedFiles": ["real/file/paths/from/above.ts"],
  "mermaidCode": "flowchart TD\\n  A[...] --> B[...]\\n  ..."
}`;

  const response = await provider.chat([{ role: "user", content: prompt }]);

  const known = {
    routes: ctx.routes,
    symbols: fileSummaries.flatMap((f) => [f.path, ...(f.keyFunctions ?? [])]),
    files: fallbackFiles.map((f) => f.path),
    methods: flowCtx.callChains.map((c) => c.method),
  };
  try {
    const parsed = parseJsonResponse<FlowSubDiagram>(response);
    parsed.mermaidCode = fixMermaidCycles(normalizeMermaid(parsed.mermaidCode));
    parsed.diagramKind = /^\s*(sequenceDiagram|classDiagram)/im.test(parsed.mermaidCode)
      ? (/sequenceDiagram/i.test(parsed.mermaidCode) ? 'sequence' : 'class')
      : 'flowchart';
    const v = validateDiagram(parsed, known);
    if (!v.valid) throw new Error(`ungrounded (${v.droppedNodes} dropped)`);
    if (!v.diagram.mermaidCode.includes("-->") && !v.diagram.mermaidCode.includes("->>")) {
      throw new Error("no edges");
    }
    return { ...v.diagram, relatedFiles: fallbackFiles.map((f) => f.path).slice(0, 8) };
  } catch {
    // Build a minimal but honest fallback from the extracted data
    return buildCustomFallback(question, fallbackFiles, relevantRoutes, relevantChains);
  }
}

// ── Mermaid normalizer ────────────────────────────────────────────────────

export function normalizeSequence(raw: string): string {
  if (!raw) return "sequenceDiagram\n  participant A\n  participant B\n  A->>B: no data";
  let code = raw.replace(/\\n/g, "\n").trim();
  code = code.replace(/^%%\{[\s\S]*?\}%%\s*/m, "").trim();
  if (!/^(sequenceDiagram|classDiagram|stateDiagram|erDiagram)/i.test(code)) {
    code = "sequenceDiagram\n" + code;
  }
  return code.replace(/\n{3,}/g, "\n\n");
}

export function normalizeMermaid(raw: string): string {
  if (!raw) return "flowchart TD\n  A[No data] --> B[Run analysis first]";
  // Sequence/class/state diagrams have their own headers — don't force flowchart.
  if (/^\s*(sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|mindmap)/im.test(raw)) {
    return normalizeSequence(raw);
  }

  // Unescape JSON-encoded newlines
  let code = raw.replace(/\\n/g, "\n").replace(/\\t/g, "  ").trim();

  // Strip any %%{init...}%% directives — we apply theme from JS side
  code = code.replace(/^%%\{[\s\S]*?\}%%\s*/m, "").trim();

  // Ensure it starts with flowchart directive
  if (!code.match(/^flowchart\s+(TD|LR|BT|RL)/i) && !code.match(/^graph\s+(TD|LR|BT|RL)/i)) {
    code = "flowchart TD\n" + code;
  }

  // Fix common AI mistakes:
  // 1. Node IDs with dots or slashes (e.g. src/auth/auth.service) → replace with underscore.
  //    IMPORTANT: only touch text OUTSIDE quoted labels — routes like
  //    "POST /auth/signup" must keep their slashes.
  code = code.split('"').map((seg, i) =>
    i % 2 === 0 ? seg.replace(/([A-Za-z_]\w*)[./](\w)/g, "$1_$2") : seg
  ).join('"');

  // 2. Unquoted labels with special chars — wrap in quotes
  // Match: ID[label with spaces] or ID(label) — ensure label is quoted if not already
  code = code.replace(/(\w+)\[([^\]"]+)\]/g, (_, id, label) => {
    // Already safe if no special chars
    if (!/[/:()\-@]/.test(label)) return `${id}[${label}]`;
    return `${id}["${label.replace(/"/g, "'")}"]`;
  });

  // 3. Remove duplicate blank lines
  code = code.replace(/\n{3,}/g, "\n\n");

  return code;
}

// ── JSON parser ───────────────────────────────────────────────────────────

function parseJsonResponse<T>(response: string): T {
  // Strip markdown code fences
  let clean = response
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/\s*```$/im, "")
    .trim();

  // Find first { to last } to extract the JSON object
  const start = clean.indexOf("{");
  const end   = clean.lastIndexOf("}");
  if (start >= 0 && end > start) clean = clean.slice(start, end + 1);

  // Remove trailing commas before } or ]
  clean = clean.replace(/,\s*([}\]])/g, "$1");

  return JSON.parse(clean) as T;
}

// ── Fallbacks ─────────────────────────────────────────────────────────────

function inferArchitectureProfile(
  summary: RepoSummary,
  fileSummaries: FileSummary[],
  flowCtx: FlowContext
): ArchitectureProfile {
  const corpus = [
    summary.overview,
    summary.architecture,
    summary.purpose,
    summary.techStack.join(" "),
    summary.keyModules.map((m) => `${m.name} ${m.description}`).join(" "),
    fileSummaries.map((f) => `${f.path} ${f.purpose} ${f.exports} ${f.keyFunctions?.join(" ") || ""}`).join(" "),
    flowCtx.summary.routes.join(" "),
    flowCtx.summary.callChainLines.join(" "),
    flowCtx.summary.dbLines.join(" "),
    flowCtx.summary.eventLines.join(" "),
    flowCtx.summary.middlewareLines.join(" "),
  ].join(" ").toLowerCase();

  const hasRoutes = /\b(route|routes|controller|endpoint|api)\b/.test(corpus);
  const hasDb = /\b(db|database|sql|prisma|mongoose|sequelize|typeorm|knex|orm|repository|model|sqlalchemy|django|alembic|asyncpg)\b/.test(corpus);
  const hasEvents = /\b(event|events|emit|listener|subscribe|pubsub|queue|topic)\b/.test(corpus) || flowCtx.eventFlows.length > 0;
  const hasMiddleware = /\b(middleware|guard|interceptor|pipe|auth)\b/.test(corpus);
  const hasComponents = /\b(component|page|layout|hook|widget|view|store|state|ui)\b/.test(corpus);
  const hasJobs = /\b(worker|background|job|cron|scheduler|queue|task)\b/.test(corpus);
  const hasCli = /\b(cli|command|argv|commander|yargs|bin\b|script)\b/.test(corpus);

  let kind: ArchitectureProfile["kind"] = "mixed";
  if (hasComponents && !hasRoutes) kind = "frontend";
  else if (hasJobs && !hasRoutes) kind = "background" as ArchitectureProfile["kind"];
  else if (hasEvents && !hasRoutes && !hasComponents) kind = "event-driven";
  else if (hasCli) kind = "cli";
  else if (hasRoutes || hasMiddleware) kind = "backend";
  else if (hasDb && !hasRoutes) kind = "data-heavy";

  return { kind, hasRoutes, hasDb, hasEvents, hasMiddleware, hasComponents, hasJobs, hasCli };
}

function matchesArchitectureProfile(parsed: FullFlowMap, profile: ArchitectureProfile): boolean {
  const text = [
    parsed.overviewMermaid,
    ...parsed.subDiagrams.map((d) => `${d.title} ${d.description} ${d.category} ${d.mermaidCode}`),
  ].join(" ").toLowerCase();

  const hasComponentTerms = /\b(component|page|hook|layout|widget|view|store|ui)\b/.test(text);
  const hasBackendTerms = /\b(route|request|handler|service|middleware|controller|api|database|db|model)\b/.test(text);
  const hasEventTerms = /\b(event|listener|emit|queue|worker|subscribe|pubsub)\b/.test(text);
  const hasCliTerms = /\b(cli|command|argv|script|bin)\b/.test(text);
  const hasDataTerms = /\b(db|database|orm|prisma|mongoose|sql|repository|model)\b/.test(text);

  switch (profile.kind) {
    case "frontend": return hasComponentTerms;
    case "backend": return hasBackendTerms || hasDataTerms;
    case "event-driven": return hasEventTerms;
    case "data-heavy": return hasDataTerms;
    case "cli": return hasCliTerms;
    case "library": return true;
    default: return true;
  }
}

/** Static-only flow map — no AI call. Used when no API key is set. */
export function buildStaticFlowMap(
  repoName: string,
  summary: RepoSummary,
  fileSummaries: FileSummary[],
  flowCtx: FlowContext,
  symbols: SymbolNode[] = []
): FullFlowMap {
  return buildAdaptiveFlowMap(repoName, summary, fileSummaries, flowCtx, symbols);
}

function buildAdaptiveFlowMap(
  repoName: string,
  summary: RepoSummary,
  fileSummaries: FileSummary[],
  flowCtx: FlowContext,
  symbols: SymbolNode[] = []
): FullFlowMap {
  void symbols;
  // Exactly one diagram: the complete data-travel map. Separate tiles hide
  // the connections that explain the codebase, so they are not built.
  const diagrams: FlowSubDiagram[] = [];
  const complete = buildCompleteDataFlow(repoName, summary, fileSummaries, flowCtx);
  if (complete) diagrams.push(complete);

  return {
    subDiagrams: diagrams,
    overviewMermaid: normalizeMermaid(`flowchart TD\n  OV0["${repoName} Data Flow"]`),
  };
}

/**
 * Deterministic end-to-end system flow: Entry → Routes → Handlers →
 * Services → Data/Events → Output. Built purely from static analysis
 * (routes, call chains, DB access, events) — no AI, always structured.
 */
function buildEndToEndDiagram(
  repoName: string,
  summary: RepoSummary,
  fileSummaries: FileSummary[],
  flowCtx: FlowContext
): FlowSubDiagram {
  const lines: string[] = ["flowchart TD"];
  const relatedFiles = new Set<string>();
  const chainTo = new Map<string, { to: string; method: string }[]>();
  for (const c of flowCtx.callChains) {
    const list = chainTo.get(c.from) ?? [];
    list.push({ to: c.to, method: c.method });
    chainTo.set(c.from, list);
  }
  const dbByFile = new Map(flowCtx.dbAccess.map((d) => [d.file, d]));

  const entry = summary.entryPoints[0] ?? fileSummaries[0]?.path ?? flowCtx.routes[0]?.file ?? "entry";
  lines.push(`  E["Entry: ${shortFile(entry)}"]`);
  relatedFiles.add(entry);

  if (flowCtx.routes.length > 0) {
    // Backend shape: entry → route → handler file → service/db → output
    const routes = flowCtx.routes.slice(0, 3);
    routes.forEach((route, i) => {
      const rId = `R${i}`, hId = `H${i}`;
      lines.push(`  E --> ${rId}["${route.httpMethod} ${route.path}"]`);
      const handlerLabel = route.controller ? `${route.controller}.${route.handler}` : route.handler;
      lines.push(`  ${rId} --> ${hId}["${handlerLabel} (${shortFile(route.file)})"]`);
      relatedFiles.add(route.file);

      const next = (chainTo.get(route.file) ?? []).filter((n) => n.to !== route.file)[0];
      const db = dbByFile.get(route.file) ?? (next ? dbByFile.get(next.to) : undefined);
      if (next) {
        const sId = `S${i}`;
        lines.push(`  ${hId} --> ${sId}["${next.method} (${shortFile(next.to)})"]`);
        relatedFiles.add(next.to);
        if (db) {
          lines.push(`  ${sId} --> D${i}{"${db.orm}: ${db.operations.slice(0, 2).join(", ")}"}`);
        } else {
          lines.push(`  ${sId} --> O${i}["Response"]`);
        }
      } else if (db) {
        lines.push(`  ${hId} --> D${i}{"${db.orm}: ${db.operations.slice(0, 2).join(", ")}"}`);
      } else {
        lines.push(`  ${hId} --> O${i}["Response"]`);
      }
      const mw = route.middlewares.slice(0, 2).join(", ");
      if (mw) lines.push(`  M${i}["mw: ${mw}"] -.-> ${rId}`);
    });
  } else if (flowCtx.eventFlows.length > 0) {
    // Event-driven shape: entry → emitter → event → listeners → output
    flowCtx.eventFlows.slice(0, 3).forEach((ef, i) => {
      lines.push(`  E --> EM${i}["${shortFile(ef.emitFile)}"]`);
      lines.push(`  EM${i} --> EV${i}{"${ef.event}"}`);
      relatedFiles.add(ef.emitFile);
      ef.listenerFiles.slice(0, 2).forEach((l, j) => {
        lines.push(`  EV${i} --> L${i}_${j}["${shortFile(l)}"]`);
        relatedFiles.add(l);
      });
    });
    lines.push(`  EV0 --> OUT["Side effects"]`);
  } else {
    // Module/library/frontend shape: entry → key modules in dependency order
    const mods = summary.keyModules.slice(0, 4).map((m) => m.name);
    let chain = mods.length ? mods : fileSummaries.slice(0, 4).map((f) => f.path);
    if (!chain.length) {
      // Last resort: most-chained files so the diagram is never a lonely node
      const seen = new Map<string, number>();
      for (const c of flowCtx.callChains) {
        seen.set(c.from, (seen.get(c.from) ?? 0) + 1);
        seen.set(c.to, (seen.get(c.to) ?? 0) + 1);
      }
      chain = [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([p]) => p);
    }
    chain.forEach((mod, i) => {
      lines.push(`  M${i}["${shortFile(mod)}"]`);
      relatedFiles.add(mod);
      lines.push(i === 0 ? `  E --> M0` : `  M${i - 1} --> M${i}`);
    });
    const lastDb = chain.map((c) => dbByFile.get(c)).find(Boolean);
    if (lastDb) lines.push(`  M${chain.length - 1} --> DB{"${lastDb.orm}"}`);
  }

  return {
    id: "end_to_end",
    title: `${repoName} End-to-End Flow`,
    description: "Complete request-to-output path from real static analysis: entry, routes, handlers, data.",
    category: "service",
    relatedFiles: [...relatedFiles].slice(0, 10),
    mermaidCode: normalizeMermaid(lines.join("\n")),
  };
}

function buildRequestFlowDiagram(
  repoName: string,
  summary: RepoSummary,
  flowCtx: FlowContext
): FlowSubDiagram | undefined {
  if (!flowCtx.routes.length) return undefined;

  const routes = flowCtx.routes.slice(0, 4);
  const dbByFile = new Map(flowCtx.dbAccess.map((db) => [db.file, db]));
  const lines: string[] = ["flowchart TD"];
  const relatedFiles = new Set<string>();

  routes.forEach((route, index) => {
    const routeId = `R${index}`;
    const handlerId = `H${index}`;
    const fileId = `F${index}`;
    const routeLabel = `${route.httpMethod} ${route.path}`;
    const handlerLabel = route.controller ? `${route.controller}.${route.handler}()` : `${route.handler}()`;
    const fileLabel = shortFile(route.file);
    lines.push(`  ${routeId}["${routeLabel}"] --> ${handlerId}["${handlerLabel}"]`);
    lines.push(`  ${handlerId} --> ${fileId}["${fileLabel}"]`);
    relatedFiles.add(route.file);

    const db = dbByFile.get(route.file);
    if (db) {
      const dbId = `D${index}`;
      lines.push(`  ${fileId} --> ${dbId}["${db.orm}: ${db.operations.slice(0, 3).join(", ")}"]`);
    }
  });

  return {
    id: "request_flow",
    title: `${repoName} Request Flow`,
    description: `Real HTTP entry points mapped to handler functions and files.`,
    category: "api",
    relatedFiles: [...relatedFiles],
    mermaidCode: normalizeMermaid(lines.join("\n")),
  };
}

function buildDependencyFlowDiagram(
  repoName: string,
  summary: RepoSummary,
  flowCtx: FlowContext
): FlowSubDiagram | undefined {
  if (!flowCtx.callChains.length) return undefined;

  const chains = flowCtx.callChains.slice(0, 6);
  const lines: string[] = ["flowchart TD"];
  const nodeIds = new Map<string, string>();
  const relatedFiles = new Set<string>();

  const nodeIdFor = (file: string) => {
    const existing = nodeIds.get(file);
    if (existing) return existing;
    const id = `N${nodeIds.size}`;
    nodeIds.set(file, id);
    lines.push(`  ${id}["${shortFile(file)}"]`);
    return id;
  };

  chains.forEach((chain) => {
    const fromId = nodeIdFor(chain.from);
    const toId = nodeIdFor(chain.to);
    lines.push(`  ${fromId} -->|${chain.method}| ${toId}`);
    relatedFiles.add(chain.from);
    relatedFiles.add(chain.to);
  });

  return {
    id: "dependency_flow",
    title: `${repoName} Dependency Flow`,
    description: summary.architecture?.trim()
      ? summary.architecture.slice(0, 140)
      : "Shows the actual file-to-file call chain relationships.",
    category: "service",
    relatedFiles: [...relatedFiles].slice(0, 8),
    mermaidCode: normalizeMermaid(lines.join("\n")),
  };
}

function buildDataFlowDiagram(repoName: string, flowCtx: FlowContext): FlowSubDiagram | undefined {
  if (!flowCtx.dbAccess.length) return undefined;

  const lines: string[] = ["flowchart TD"];
  const relatedFiles = new Set<string>();

  flowCtx.dbAccess.slice(0, 4).forEach((entry, index) => {
    const fileId = `F${index}`;
    const opId = `O${index}`;
    lines.push(`  ${fileId}["${shortFile(entry.file)}"] --> ${opId}["${entry.orm}: ${entry.operations.slice(0, 3).join(", ")}"]`);
    relatedFiles.add(entry.file);
  });

  return {
    id: "data_flow",
    title: `${repoName} Data Flow`,
    description: `Shows which files read and mutate persistent data in the repository.`,
    category: "data",
    relatedFiles: [...relatedFiles],
    mermaidCode: normalizeMermaid(lines.join("\n")),
  };
}

function buildEventFlowDiagram(repoName: string, flowCtx: FlowContext): FlowSubDiagram | undefined {
  if (!flowCtx.eventFlows.length) return undefined;

  const lines: string[] = ["flowchart TD"];
  const relatedFiles = new Set<string>();

  flowCtx.eventFlows.slice(0, 4).forEach((eventFlow, index) => {
    const emitId = `E${index}`;
    const evtId = `V${index}`;
    lines.push(`  ${emitId}["${shortFile(eventFlow.emitFile)}"] --> ${evtId}["${eventFlow.event}"]`);
    relatedFiles.add(eventFlow.emitFile);
    eventFlow.listenerFiles.slice(0, 3).forEach((listener, listenerIndex) => {
      const lisId = `L${index}_${listenerIndex}`;
      lines.push(`  ${evtId} --> ${lisId}["${shortFile(listener)}"]`);
      relatedFiles.add(listener);
    });
  });

  return {
    id: "event_flow",
    title: `${repoName} Event Flow`,
    description: "Shows event emitters and their listeners using the real files and event names.",
    category: "background",
    relatedFiles: [...relatedFiles],
    mermaidCode: normalizeMermaid(lines.join("\n")),
  };
}

function buildMiddlewareFlowDiagram(repoName: string, flowCtx: FlowContext): FlowSubDiagram | undefined {
  if (!flowCtx.middlewareStack.length) return undefined;

  const lines: string[] = ["flowchart TD"];
  const relatedFiles = new Set<string>();

  flowCtx.middlewareStack.slice(0, 4).forEach((entry, index) => {
    const fileId = `M${index}`;
    const middlewareId = `W${index}`;
    lines.push(`  ${fileId}["${shortFile(entry.file)}"] --> ${middlewareId}["${entry.names.slice(0, 3).join(", ")}"]`);
    relatedFiles.add(entry.file);
  });

  return {
    id: "middleware_flow",
    title: `${repoName} Middleware Flow`,
    description: "Shows the middleware, guards, interceptors, or pipes detected in the codebase.",
    category: "background",
    relatedFiles: [...relatedFiles],
    mermaidCode: normalizeMermaid(lines.join("\n")),
  };
}

function buildComponentFlowDiagram(
  repoName: string,
  componentLikeFiles: FileSummary[],
  flowCtx: FlowContext
): FlowSubDiagram | undefined {
  if (!componentLikeFiles.length) return undefined;

  const lines: string[] = ["flowchart TD"];
  const relatedFiles = new Set<string>();
  const selected = componentLikeFiles.slice(0, 5);
  const selectedPaths = new Set(selected.map((f) => f.path));
  const chains = flowCtx.callChains.filter((chain) => selectedPaths.has(chain.from) || selectedPaths.has(chain.to)).slice(0, 6);

  if (chains.length > 0) {
    const nodeIds = new Map<string, string>();
    const nodeIdFor = (file: string) => {
      const existing = nodeIds.get(file);
      if (existing) return existing;
      const id = `C${nodeIds.size}`;
      nodeIds.set(file, id);
      lines.push(`  ${id}["${shortFile(file)}"]`);
      return id;
    };

    chains.forEach((chain) => {
      const fromId = nodeIdFor(chain.from);
      const toId = nodeIdFor(chain.to);
      lines.push(`  ${fromId} -->|${chain.method}| ${toId}`);
      relatedFiles.add(chain.from);
      relatedFiles.add(chain.to);
    });
  } else {
    selected.forEach((file, index) => {
      const id = `C${index}`;
      lines.push(`  ${id}["${shortFile(file.path)}"]`);
      relatedFiles.add(file.path);
      if (index > 0) lines.push(`  C${index - 1} --> ${id}`);
    });
  }

  return {
    id: "component_flow",
    title: `${repoName} Component Flow`,
    description: "Shows how UI or stateful files interact based on the actual file summaries and call chains.",
    category: "component",
    relatedFiles: [...relatedFiles],
    mermaidCode: normalizeMermaid(lines.join("\n")),
  };
}

function buildBackgroundFlowDiagram(
  repoName: string,
  jobLikeFiles: FileSummary[],
  flowCtx: FlowContext
): FlowSubDiagram | undefined {
  if (!jobLikeFiles.length) return undefined;

  const lines: string[] = ["flowchart TD"];
  const relatedFiles = new Set<string>();

  jobLikeFiles.slice(0, 4).forEach((file, index) => {
    const id = `B${index}`;
    lines.push(`  ${id}["${shortFile(file.path)}"]`);
    relatedFiles.add(file.path);
    const matchingEvents = flowCtx.eventFlows.filter((evt) => evt.emitFile === file.path || evt.listenerFiles.includes(file.path)).slice(0, 2);
    matchingEvents.forEach((evt, evtIndex) => {
      lines.push(`  ${id} --> E${index}_${evtIndex}["${evt.event}"]`);
    });
  });

  return {
    id: "background_flow",
    title: `${repoName} Background Flow`,
    description: "Shows worker, scheduler, job, or queue files that were detected in the repository.",
    category: "background",
    relatedFiles: [...relatedFiles],
    mermaidCode: normalizeMermaid(lines.join("\n")),
  };
}

function buildModuleFlowDiagram(repoName: string, summary: RepoSummary): FlowSubDiagram | undefined {
  if (!summary.keyModules.length) return undefined;

  // NOTE: key modules are ranked hubs, not a chain — drawing M0→M1→M2 would
  // assert dependencies that don't exist. Emit standalone nodes instead.
  const lines: string[] = ["flowchart TD"];
  const relatedFiles = [...summary.entryPoints];
  summary.keyModules.slice(0, 5).forEach((module, index) => {
    const short = module.name.split("/").slice(-2).join("/");
    lines.push(`  M${index}["${short}"]`);
    relatedFiles.push(module.name);
  });

  return {
    id: "module_flow",
    title: `${repoName} Modules`,
    description: `Most-connected files (ranked hubs, not a dependency chain). Entry points: ${summary.entryPoints.slice(0, 3).join(", ") || "n/a"}.`,
    category: "service",
    relatedFiles: [...new Set(relatedFiles)],
    diagramKind: 'flowchart',
    mermaidCode: normalizeMermaid(lines.join("\n")),
  };
}

// ── Sequence diagrams (request flow done right) ─────────────────────────
// Participants = files/classes, messages = functions. Includes middleware + DB.
// This is what flowchart-only tools miss: order matters for request flows.

export function buildSequenceDiagram(
  repoName: string,
  flowCtx: FlowContext
): FlowSubDiagram | undefined {
  if (!flowCtx.routes.length) return undefined;
  const lines: string[] = ["sequenceDiagram"];
  const relatedFiles = new Set<string>();
  const relatedLines: string[] = [];
  const seen = new Set<string>();
  const alias = (name: string): string => {
    const clean = name.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 24) || "svc";
    if (!seen.has(clean)) { seen.add(clean); return clean; }
    let i = 2;
    while (seen.has(`${clean}${i}`)) i++;
    seen.add(`${clean}${i}`);
    return `${clean}${i}`;
  };

  const routes = flowCtx.routes.slice(0, 4);
  const byFile = new Map(flowCtx.dbAccess.map((d) => [d.file, d]));
  const chainsByFrom = new Map<string, typeof flowCtx.callChains>();
  for (const c of flowCtx.callChains) {
    const arr = chainsByFrom.get(c.from) ?? [];
    arr.push(c);
    chainsByFrom.set(c.from, arr);
  }

  lines.push(`  autonumber`);
  routes.forEach((route) => {
    const client = alias("client");
    const handlerBase = route.controller || shortFile(route.file).replace(/\.\w+$/, "");
    const handler = alias(handlerBase);
    const routeLabel = `${route.httpMethod} ${route.path}`;
    lines.push(`  ${client}->>+${handler}: ${routeLabel}`);
    relatedFiles.add(route.file);
    for (const mw of route.middlewares.slice(0, 2)) {
      const m = alias(mw.split(".").pop() || mw);
      lines.push(`  ${handler}->>+${m}: ${mw}`);
      lines.push(`  ${m}-->>-${handler}: next()`);
    }
    const next = (chainsByFrom.get(route.file) ?? []).slice(0, 2);
    for (const n of next) {
      const svc = alias(n.method || shortFile(n.to));
      lines.push(`  ${handler}->>+${svc}: ${n.method}`);
      const db = byFile.get(n.to) ?? byFile.get(route.file);
      if (db) {
        const dbA = alias(db.orm);
        lines.push(`  ${svc}->>+${dbA}: ${db.operations.slice(0, 2).join(", ")}`);
        lines.push(`  ${dbA}-->>-${svc}: rows`);
      }
      lines.push(`  ${svc}-->>-${handler}: result`);
    }
    if (!next.length) {
      const db = byFile.get(route.file);
      if (db) {
        const dbA = alias(db.orm);
        lines.push(`  ${handler}->>+${dbA}: ${db.operations.slice(0, 2).join(", ")}`);
        lines.push(`  ${dbA}-->>-${handler}: rows`);
      }
    }
    lines.push(`  ${handler}-->>-${client}: response`);
  });

  if (lines.length < 4) return undefined;
  return {
    id: "request_sequence",
    title: `${repoName} Request Sequence`,
    description: `Ordered request flow with middleware + DB participants (sequence, not boxes).`,
    category: "api",
    relatedFiles: [...relatedFiles],
    relatedLines: relatedLines,
    diagramKind: 'sequence',
    mermaidCode: normalizeSequence(lines.join("\n")),
  };
}

// ── Class diagrams (inheritance/composition from symbols) ───────────────

export function buildClassDiagram(
  repoName: string,
  fileSummaries: FileSummary[],
  flowCtx: FlowContext,
  symbols: SymbolNode[] = []
): FlowSubDiagram | undefined {
  // Driven ONLY by real extracted symbols (kind class/interface). Never
  // declare functions or filenames as classes — no data means no diagram.
  void fileSummaries;
  void flowCtx;
  const classes = symbols.filter((s) => s.kind === "class" || s.kind === "interface");
  if (!classes.length) return undefined;
  // Exported API surface first, then order encountered; cap for token diet.
  const ranked = [...classes].sort((a, b) => Number(b.exported) - Number(a.exported));
  const lines: string[] = ["classDiagram"];
  const relatedFiles = new Set<string>();
  const relatedLines: string[] = [];
  const seen = new Set<string>();
  for (const c of ranked.slice(0, 12)) {
    const cn = c.label.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 40);
    if (!cn || seen.has(cn)) continue;
    seen.add(cn);
    lines.push(`  class ${cn}`);
    lines.push(`  note for ${cn} "${shortFile(c.file)}:${c.line}"`);
    relatedFiles.add(c.file);
    relatedLines.push(`${c.file}:${c.line}`);
  }
  if (seen.size === 0) return undefined;
  return {
    id: "class_diagram",
    title: `${repoName} Classes`,
    description: `Real classes/interfaces from static symbol extraction (file:line notes).`,
    category: "service",
    relatedFiles: [...relatedFiles],
    relatedLines,
    diagramKind: 'class',
    mermaidCode: normalizeSequence(lines.join("\n")),
  };
}

// ── Function control-flow (L5 lite — no AI, regex CFG) ─────────────────
// if/else → diamonds, loops → back-edge, try/catch → split. Every node has file:line.

export interface FunctionFlowResult {
  diagram: FlowSubDiagram;
  ok: boolean;
}

export function buildFunctionFlow(
  filePath: string,
  functionName: string,
  content: string
): FunctionFlowResult | null {
  const lines = content.split("\n");
  // Find `function foo(`, `foo = (`, `def foo(`, `class Foo` then capture brace/indented block
  const defRe = new RegExp(
    `(function\\s+${functionName}\\s*\\(|${functionName}\\s*=\\s*(async\\s*)?\\(|def\\s+${functionName}\\s*\\(|class\\s+${functionName}\\b)`
  );
  const defIdx = lines.findIndex((l) => defRe.test(l));
  if (defIdx < 0) return null;
  const body = lines.slice(defIdx, defIdx + 120).join("\n");
  const mermaid: string[] = ["flowchart TD"];
  const relatedLines: string[] = [`${filePath}:${defIdx + 1}`];
  const nid = (s: string) => s.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 20) || "n";
  let prev = `F_${nid(functionName)}`;
  mermaid.push(`  ${prev}["${functionName}() ${filePath.split("/").pop()}:${defIdx + 1}"]`);
  let n = 0;
  const push = (label: string, shape: 'box' | 'diamond', line: number) => {
    n++;
    const id = `S${n}`;
    const node = shape === 'diamond' ? `${id}{"${label}"}` : `${id}["${label}"]`;
    mermaid.push(`  ${prev} --> ${node}`);
    mermaid.push(`  ${id} -.->|${filePath.split("/").pop()}:${line}| ${id}`);
    relatedLines.push(`${filePath}:${line}`);
    prev = id;
    return id;
  };
  const patterns: Array<[RegExp, string, 'box' | 'diamond']> = [
    [/\bif\s*\(|\bif\s+\w+:/, "if?", 'diamond'],
    [/\belse\b/, "else", 'box'],
    [/\bfor\s*\(|\bwhile\s*\(|\bfor\s+\w+\s+in\b/, "loop", 'diamond'],
    [/\btry\s*\{|\btry:/, "try", 'box'],
    [/\bcatch\s*\(|\bexcept\b/, "catch", 'box'],
    [/\breturn\b/, "return", 'box'],
    [/\bawait\b/, "await", 'box'],
    [/\.query\(|\.execute\(|findMany|findOne|create\(|update\(|delete\(/, "db", 'box'],
    [/\.emit\(|\.publish\(|\.send\(/, "emit", 'box'],
  ];
  let hits = 0;
  lines.slice(defIdx + 1, defIdx + 120).forEach((l, i) => {
    for (const [re, label, shape] of patterns) {
      if (re.test(l)) {
        push(label, shape, defIdx + 1 + i + 1);
        hits++;
        break;
      }
    }
  });
  if (!hits) {
    push("no branches — straight-line", 'box', defIdx + 1);
  }
  mermaid.push(`  ${prev} --> OUT["return"]`);
  return {
    ok: true,
    diagram: {
      id: `fn_${functionName}`,
      title: `${functionName}() control flow`,
      description: `Branches/loops/try + DB/emit markers from ${filePath}:${defIdx + 1}.`,
      category: "service",
      relatedFiles: [filePath],
      relatedLines,
      diagramKind: 'flowchart',
      mermaidCode: normalizeMermaid(mermaid.join("\n")),
    },
  };
}

// ── Grounding validator (beats prompt-stuffing tools) ───────────────────
// Drops invented nodes/edges: every label must match a real route, symbol,
// file, or method from static analysis. Never invents — filters instead.

export interface ValidationResult {
  diagram: FlowSubDiagram;
  droppedNodes: number;
  droppedEdges: number;
  valid: boolean;
}

export function validateDiagram(
  diagram: FlowSubDiagram,
  known: { routes: string[]; symbols: string[]; files: string[]; methods: string[] }
): ValidationResult {
  const code = diagram.mermaidCode || "";
  const knownLower = new Set(
    [...known.routes, ...known.symbols, ...known.files, ...known.methods]
      .map((s) => s.toLowerCase())
      .filter((s) => s.length >= 3)
  );
  const lines = code.split("\n");
  let droppedNodes = 0;
  const kept: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || /^(flowchart|graph|sequenceDiagram|classDiagram|autonumber)/i.test(t) || t.startsWith("%%")) {
      kept.push(line);
      continue;
    }
    // Sequence messages: A->>B: label — validate label tokens
    const seq = line.match(/:\s*(.+)$/);
    const label = seq ? seq[1] : line;
    const tokens = label.toLowerCase().split(/[^a-z0-9/_-]+/).filter((w) => w.length >= 4);
    const hit = tokens.some(
      (tok) => knownLower.has(tok) || [...knownLower].some((k) => k.includes(tok) || tok.includes(k))
    );
    // Participants lines (participant A) always kept; message lines need evidence
    if (/participant/i.test(t) || !line.includes(":") || hit) {
      kept.push(line);
    } else {
      droppedNodes++;
    }
  }
  const edgeCount = (kept.join("\n").match(/-->|->>|-->/g) || []).length;
  const valid = edgeCount >= 2 && droppedNodes <= 6;
  return {
    diagram: { ...diagram, mermaidCode: kept.join("\n") },
    droppedNodes,
    droppedEdges: 0,
    valid,
  };
}

export function fixMermaidCycles(code: string): string {
  // Mermaid flowchart fails on A-->A self-loops in some renderers — break them.
  return code
    .split("\n")
    .map((line) => {
      const m = line.match(/^\s*(\w+)\s*-->\s*(\w+)/);
      if (m && m[1] === m[2]) return line.replace(/-->/, "---|self|");
      return line;
    })
    .join("\n");
}

// ── Guided tour (onboarding order nobody else does well) ────────────────
// Order flows by centrality: entry → most-called → DB → events.

export interface TourStep {
  order: number;
  title: string;
  diagramId: string;
  why: string;
}

export function buildGuidedTour(flowMap: FullFlowMap): TourStep[] {
  const steps: TourStep[] = [];
  const byCat = (c: string) => flowMap.subDiagrams.find((d) => d.category === c);
  const push = (title: string, diagramId: string, why: string) => {
    steps.push({ order: steps.length + 1, title, diagramId, why });
  };
  const e2e = flowMap.subDiagrams.find((d) => d.id === "end_to_end");
  if (e2e) push("Start here: end-to-end", e2e.id, "One happy path through the whole system.");
  const seq = flowMap.subDiagrams.find((d) => d.diagramKind === "sequence");
  if (seq) push("Then: request order", seq.id, "See middleware + DB in call order.");
  const api = byCat("api");
  if (api && api.id !== seq?.id) push("API surface", api.id, "All routes at a glance.");
  const data = byCat("data");
  if (data) push("Data layer", data.id, "Where reads/writes actually happen.");
  const auth = byCat("auth");
  if (auth) push("Auth", auth.id, "Guards before data.");
  return steps.slice(0, 6);
}

// ── Health overlay (god/dead/ambiguous badges on tiles) ─────────────────

export function annotateWithHealth(
  flowMap: FullFlowMap,
  graph?: { godNodes?: string[]; health?: { warnings: string[] } }
): FullFlowMap {
  if (!graph) return flowMap;
  const gods = new Set((graph.godNodes ?? []).slice(0, 10));
  return {
    ...flowMap,
    subDiagrams: flowMap.subDiagrams.map((d) => {
      const badges: string[] = [...(d.badges ?? [])];
      const hits = (d.relatedFiles ?? []).filter((f) => gods.has(f));
      if (hits.length) badges.push(`god-file: ${hits.slice(0, 2).join(", ")}`);
      if ((d.relatedFiles ?? []).length === 0) badges.push("no-files");
      return badges.length ? { ...d, badges } : d;
    }),
  };
}

function shortFile(filePath: string): string {
  const parts = filePath.split("/").filter(Boolean);
  return parts.slice(-2).join("/") || filePath;
}

/**
 * THE flow diagram: one complete map of how data travels through the repo.
 * Entry → every detected route → handler file → next-hop files → data layer.
 * Single diagram on purpose: splitting it into tiles hides the connections
 * that actually explain the codebase.
 */
export function buildCompleteDataFlow(
  repoName: string,
  summary: RepoSummary,
  fileSummaries: FileSummary[],
  flowCtx: FlowContext
): FlowSubDiagram | undefined {
  void fileSummaries;
  const routes = flowCtx.routes.slice(0, 24);
  const dbByFile = new Map(flowCtx.dbAccess.map((d) => [d.file, d]));
  const chainByFrom = new Map<string, CallChain[]>();
  for (const c of flowCtx.callChains) {
    const list = chainByFrom.get(c.from) ?? [];
    list.push(c);
    chainByFrom.set(c.from, list);
  }

  const lines: string[] = ["flowchart TD"];
  const relatedFiles = new Set<string>();
  const fileNode = new Map<string, string>();
  let fCount = 0, nodeCount = 0;
  const MAX_NODES = 120;

  // Rank next-hops so the diagram follows logic, not import order: files
  // that themselves call further (services, pipelines) beat dead-end type
  // imports; synthetic methods (re-export panorama) go last.
  const rankHop = (n: CallChain): number => {
    const outLen = (chainByFrom.get(n.to) ?? []).length;
    const synth = /re-export|side-effect/i.test(n.method) ? -50 : 0;
    const wiring = n.method === "router" ? -5 : 0;
    return outLen * 10 + synth + wiring;
  };
  const topNexts = (file: string, k: number): CallChain[] =>
    (chainByFrom.get(file) ?? [])
      // `router` re-exports only wire modules together (already shown by
      // E → R edges); they hide real service hops, so drop them here.
      .filter((n) => n.to !== file && n.method !== "router")
      .sort((a, b) => rankHop(b) - rankHop(a))
      .slice(0, k);

  const fId = (path: string): string => {
    let id = fileNode.get(path);
    if (!id) {
      id = `F${fCount++}`;
      fileNode.set(path, id);
      lines.push(`  ${id}["${shortFile(path)}"]`);
      nodeCount++;
      relatedFiles.add(path);
    }
    return id;
  };

  const entry = summary.entryPoints[0] ?? routes[0]?.file ?? "entry";
  lines.push(`  E["Entry: ${shortFile(entry)}"]`);
  nodeCount++;
  relatedFiles.add(entry);

  if (!routes.length) {
    // No HTTP layer (frontend-only / library): show the strongest
    // file-to-file chains instead so the map is never empty.
    const chains = flowCtx.callChains.slice(0, 28);
    if (!chains.length) return undefined;
    for (const c of chains) {
      if (nodeCount >= MAX_NODES) break;
      const a = fId(c.from), b = fId(c.to);
      if (a === b) continue;
      lines.push(`  ${a} -->|${c.method.slice(0, 24)}| ${b}`);
    }
  } else {
    // Shared DB node per data-touched file: converging routes show they hit
    // the same layer instead of repeating identical diamonds.
    const dbNode = new Map<string, string>();
    let dCount = 0;
    const emitDb = (fromId: string, file: string): void => {
      const db = dbByFile.get(file);
      if (!db) return;
      let tag = dbNode.get(file);
      if (!tag) {
        if (nodeCount >= MAX_NODES) return;
        tag = `D${dCount++}`;
        dbNode.set(file, tag);
        lines.push(`  ${tag}{"${shortFile(file)}: ${db.orm}"}`);
        nodeCount++;
      }
      lines.push(`  ${fromId} --> ${tag}`);
    };
    // Pass 1: every route renders (E → R → [MW →] H), grouped by router file
    // so each API area reads as one visual block. No route is ever starved
    // by an early route's depth expansion.
    const withNexts: { route: (typeof routes)[number]; i: number; hId: string; nexts: CallChain[] }[] = [];
    const byFile = new Map<string, { route: (typeof routes)[number]; i: number }[]>();
    routes.forEach((route, i) => {
      const list = byFile.get(route.file) ?? [];
      list.push({ route, i });
      byFile.set(route.file, list);
    });
    let gCount = 0;
    for (const [file, items] of byFile) {
      if (nodeCount >= MAX_NODES) break;
      lines.push(`  subgraph G${gCount++} ["${shortFile(file)}"]`);
      for (const { route, i } of items) {
        if (nodeCount >= MAX_NODES) break;
        const rId = `R${i}`, hId = `H${i}`;
        const routeLabel = `${route.httpMethod} ${route.path}`.slice(0, 48);
        lines.push(`  E --> ${rId}["${routeLabel}"]`);
        nodeCount++;
        const handlerLabel = `${route.handler} (${shortFile(route.file)})`.slice(0, 48);
        // Middleware runs before the handler: R → MW → H when declared.
        const mws = route.middlewares.slice(0, 2).join(", ").slice(0, 30);
        if (mws && nodeCount < MAX_NODES) {
          lines.push(`  ${rId} --> W${i}["mw: ${mws}"]`);
          lines.push(`  W${i} --> ${hId}["${handlerLabel}"]`);
          nodeCount += 2;
        } else {
          lines.push(`  ${rId} --> ${hId}["${handlerLabel}"]`);
          nodeCount++;
        }
        relatedFiles.add(route.file);

        const nexts = topNexts(route.file, 2);
        if (!nexts.length) {
          emitDb(hId, route.file);
        } else {
          withNexts.push({ route, i, hId, nexts });
        }
      }
      lines.push(`  end`);
    }
    // Pass 2: next-hop files round-robin (one hop per route per round) so
    // every route shows its services, not just the first few.
    for (let round = 0; round < 2; round++) {
      for (const { route, hId, nexts } of withNexts) {
        const nx = nexts[round];
        if (!nx || nodeCount >= MAX_NODES) continue;
        const sId = fId(nx.to);
        lines.push(`  ${hId} -->|${nx.method.slice(0, 24)}| ${sId}`);
        // Depth 2: what the service file itself calls (the pipeline path,
        // e.g. route → langchain_pipeline → groq_service).
        const deeper = topNexts(nx.to, 3).filter((d) => d.to !== route.file).slice(0, 2);
        deeper.forEach((dd) => {
          if (nodeCount >= MAX_NODES) return;
          const tId = fId(dd.to);
          if (tId === sId) return;
          lines.push(`  ${sId} -->|${dd.method.slice(0, 24)}| ${tId}`);
        });
        emitDb(sId, nx.to);
      }
    }
  }

  return {
    id: "complete_data_flow",
    title: `${repoName} Data Flow`,
    description: `Complete map of how data travels: entry, all detected routes, handler files, next-hop files, data layer. Static analysis, no guessing.`,
    category: "api",
    relatedFiles: [...relatedFiles],
    diagramKind: 'flowchart',
    mermaidCode: normalizeMermaid(lines.join("\n")),
  };
}

function buildCustomFallback(
  question: string,
  relevantFiles: FileSummary[],
  relevantRoutes: string[],
  relevantChains: string[]
): FlowSubDiagram {
  const lines: string[] = ["flowchart TD"];

  if (relevantRoutes.length > 0) {
    // Parse out route info
    relevantRoutes.slice(0, 3).forEach((r, i) => {
      const parts = r.split("→");
      const route   = parts[0]?.trim().slice(0, 30) || `Step${i}`;
      const handler = parts[1]?.trim().slice(0, 30) || `Handler${i}`;
      lines.push(`  R${i}["${route}"] --> H${i}["${handler}"]`);
    });
  } else if (relevantFiles.length > 0) {
    relevantFiles.slice(0, 4).forEach((f, i) => {
      const name = f.path.split("/").pop()!.replace(/\.\w+$/, "");
      lines.push(`  F${i}["${name}"]`);
      if (i > 0) lines.push(`  F${i - 1} --> F${i}`);
    });
  } else {
    lines.push(`  A["${question.slice(0, 40)}"] --> B[No matching code found]`);
    lines.push(`  B --> C[Try a different question]`);
  }

  return {
    id: `custom_${Date.now()}`,
    title: question.slice(0, 50),
    description: `Flow for: ${question.slice(0, 80)}`,
    category: "custom",
    relatedFiles: relevantFiles.map((f) => f.path),
    mermaidCode: normalizeMermaid(lines.join("\n")),
  };
}
