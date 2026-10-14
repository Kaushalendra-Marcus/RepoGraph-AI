import { WorkspaceFile } from "./WorkspaceScanner";
import { resolveImportPath } from "./GraphBuilder";

// ── Types ──────────────────────────────────────────────────────────────────

export interface CallChain {
  from: string;        // file path
  to: string;          // file path
  method: string;      // the imported identifier that connects them
  kind: "import" | "route" | "event" | "dynamic";
}

export interface RouteDefinition {
  httpMethod: string;  // GET POST PUT DELETE PATCH
  path: string;        // "/api/users/:id"
  handler: string;     // function or controller method name
  controller?: string; // class name if decorator style
  file: string;
  middlewares: string[];
}

export interface EventFlow {
  emitFile: string;
  event: string;
  listenerFiles: string[];
}

export interface DbAccessPattern {
  file: string;
  orm: string;       // "prisma" | "mongoose" | "typeorm" | "sequelize" | "raw-sql" | "knex" | "sqlalchemy" | "django-orm" | "asyncpg"
  operations: string[]; // ["findMany", "create", "update"]
  models: string[];  // ["User", "Post"] — detected model names
}

export interface FunctionSignature {
  name: string;
  isAsync: boolean;
  isExported: boolean;
  params: string[];
  file: string;
}

export interface FlowContext {
  callChains: CallChain[];
  routes: RouteDefinition[];
  eventFlows: EventFlow[];
  dbAccess: DbAccessPattern[];
  functions: FunctionSignature[];   // key exported functions across the codebase
  middlewareStack: { file: string; names: string[] }[];
  // Serialisable snapshot handed to AI
  summary: FlowContextSummary;
}

export interface FlowContextSummary {
  routeCount: number;
  routes: string[];                 // "GET /api/users → UserController.getAll (src/...)"
  callChainLines: string[];         // "src/auth/auth.service.ts → src/users/user.service.ts (UserService)"
  eventLines: string[];             // "src/orders/order.service.ts emits 'order.created' → [src/email/...]"
  dbLines: string[];                // "src/users/user.service.ts: Prisma → findMany, create [User]"
  middlewareLines: string[];
  exportedFunctions: string[];      // "src/auth/auth.service.ts: validateUser, signToken, refreshToken"
}

// ── Entry point ────────────────────────────────────────────────────────────

export function analyzeFlows(files: WorkspaceFile[]): FlowContext {
  const routes: RouteDefinition[]    = [];
  const dbAccess: DbAccessPattern[]  = [];
  const functions: FunctionSignature[] = [];
  const middlewareStack: { file: string; names: string[] }[] = [];
  const emitMap = new Map<string, { file: string; event: string }[]>();
  const listenMap = new Map<string, string[]>();   // event → listener files

  for (const file of files) {
    extractRoutes(file, routes);
    extractDbAccess(file, dbAccess);
    extractFunctions(file, functions);
    extractMiddleware(file, middlewareStack);
    extractEventEmits(file, emitMap);
    extractEventListeners(file, listenMap);
  }

  // Build event flow objects
  const eventFlows: EventFlow[] = [];
  for (const [event, emitters] of emitMap) {
    eventFlows.push({
      emitFile: emitters[0].file,
      event,
      listenerFiles: listenMap.get(event) || [],
    });
  }

  // Build call chains from actual import → export matching
  const callChains = buildCallChains(files, routes);
  // Route-touching chains first: the flow diagram is built from them, so a
  // cap must never cut the exact edges the diagram needs to show depth.
  // Priority 2 = within 2 hops of any route file (the pipeline path),
  // priority 1 = touches a route file, else 0.
  const routeFiles = new Set(routes.map((r) => r.file));
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a)!.add(b);
  };
  for (const c of callChains) { link(c.from, c.to); link(c.to, c.from); }
  const nearRoutes = new Set<string>(routeFiles);
  let frontier = [...routeFiles];
  for (let hop = 0; hop < 2 && frontier.length; hop++) {
    const next: string[] = [];
    for (const cur of frontier) {
      for (const nb of adj.get(cur) ?? []) {
        if (!nearRoutes.has(nb)) { nearRoutes.add(nb); next.push(nb); }
      }
    }
    frontier = next;
  }
  const prio = (c: CallChain): number =>
    // 3: the route file's own imports (the diagram's backbone — these must
    //    never be cut, no matter how many test files sort earlier).
    // 2/1: depth material around routes. 0: everything else.
    routeFiles.has(c.from) ? 3
    : nearRoutes.has(c.to) ? 2
    : nearRoutes.has(c.from) ? 1 : 0;
  const scored = [...callChains].sort((a, b) => prio(b) - prio(a));

  const ctx: FlowContext = {
    // Generous raw budget: chains are never dumped raw anywhere (every
    // user-facing sample caps separately), so keep everything found.
    // Ordering still matters for the diagram: route files first, then
    // their neighborhood, balanced across stacks.
    callChains: balanceChains(scored, 2000),
    routes,
    eventFlows,
    dbAccess,
    functions,
    middlewareStack,
    summary: buildSummary(routes, scored, eventFlows, dbAccess, middlewareStack, functions),
  };

  return ctx;
}

// ── Route extraction ──────────────────────────────────────────────────────

/** Round-robin cap across top-level folders (Backend/Frontend/...) so the
 * 120-chain budget represents every stack instead of scan order. */
function balanceChains(chains: CallChain[], cap: number): CallChain[] {
  const buckets = new Map<string, CallChain[]>();
  for (const c of chains) {
    const g = c.from.split("/")[0];
    if (!buckets.has(g)) buckets.set(g, []);
    buckets.get(g)!.push(c);
  }
  const groups = [...buckets.values()];
  const out: CallChain[] = [];
  let i = 0;
  while (out.length < cap) {
    let progressed = false;
    for (const g of groups) {
      if (i < g.length && out.length < cap) { out.push(g[i]); progressed = true; }
    }
    if (!progressed) break;
    i++;
  }
  return out;
}

function joinUrlPrefix(prefix: string, routePath: string): string {
  if (!prefix) return routePath || "/";
  if (!routePath || routePath === "/") return prefix;
  if (routePath.startsWith("/")) return `${prefix}${routePath}`;
  return `${prefix}/${routePath}`;
}

function extractRoutes(file: WorkspaceFile, out: RouteDefinition[]) {
  const content = file.content;
  const lang = file.language;
  const isTS = lang === "TypeScript" || lang === "JavaScript" || lang === "Vue" || lang === "Svelte";

  // ── Python: FastAPI / Flask / Django ──────────────────────────────────
  if (lang === "Python") {
    // Same-file APIRouter prefix, e.g. router = APIRouter(prefix="/chat")
    let pyPrefix = "";
    const prefixMatch = content.match(/APIRouter\s*\([^)]*?prefix\s*=\s*['"`]([^'"`]+)['"`]/);
    if (prefixMatch) pyPrefix = prefixMatch[1].replace(/\/$/, "");

    // FastAPI: @router.post("/path", ...) / @app.get("", ...) followed by def handler(
    const fastRe = /@(router|app)\s*\.\s*(get|post|put|patch|delete|head|options)\s*\(\s*['"`]([^'"`]*)['"`]([^)]*)\)/gi;
    let m: RegExpExecArray | null;
    while ((m = fastRe.exec(content)) !== null) {
      const after = content.slice(m.index + m[0].length, m.index + m[0].length + 600);
      const defMatch = after.match(/(?:async\s+)?def\s+(\w+)\s*\(/);
      const handler = defMatch ? defMatch[1] : "anonymous";
      const middlewares: string[] = [];
      const depRe = /Depends\s*\(\s*([\w.]+)/g;
      let dm: RegExpExecArray | null;
      const decoratorArgs = m[4] || "";
      while ((dm = depRe.exec(decoratorArgs)) !== null) middlewares.push(dm[1]);
      out.push({
        httpMethod: m[2].toUpperCase(),
        path: joinUrlPrefix(pyPrefix, m[3]),
        handler,
        file: file.path,
        middlewares,
      });
    }

    // Flask: @app.route("/path", methods=["GET", "POST"]) + def handler(
    const flaskRe = /@(app|blueprint|bp)\s*\.route\s*\(\s*['"`]([^'"`]+)['"`]([^)]*)\)/gi;
    while ((m = flaskRe.exec(content)) !== null) {
      const after = content.slice(m.index + m[0].length, m.index + m[0].length + 600);
      const defMatch = after.match(/(?:async\s+)?def\s+(\w+)\s*\(/);
      const handler = defMatch ? defMatch[1] : "anonymous";
      const methodsMatch = (m[3] || "").match(/methods\s*=\s*\[([^\]]+)\]/i);
      const methods = methodsMatch
        ? [...methodsMatch[1].matchAll(/['"`](\w+)['"`]/g)].map((x) => x[1].toUpperCase())
        : ["GET"];
      for (const method of methods) {
        out.push({ httpMethod: method, path: m[2], handler, file: file.path, middlewares: [] });
      }
    }

    // Django: path("route/", views.handler) in urls.py
    if (/urls\.py$/.test(file.path)) {
      const djangoRe = /(?:path|re_path)\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*([\w.]+)/g;
      while ((m = djangoRe.exec(content)) !== null) {
        const handlerFull = m[2].split(".").pop() || m[2];
        out.push({ httpMethod: "ALL", path: `/${m[1]}`.replace(/\/+/g, "/"), handler: handlerFull, file: file.path, middlewares: [] });
      }
    }
    return;
  }

  if (!isTS) return;

  // Express/Fastify/Hapi style: router.get('/path', middleware, handler)
  const expressRe = /(?:router|app|server|fastify)\s*\.\s*(get|post|put|patch|delete|all|use)\s*\(\s*['"`]([^'"`]+)['"`]\s*,([^)]+)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = expressRe.exec(content)) !== null) {
    const fnParts = m[3].split(",").map((s) => s.trim().replace(/\s*async\s*/, "")).filter(Boolean);
    const handler = fnParts[fnParts.length - 1] || "anonymous";
    const middlewares = fnParts.slice(0, -1);
    out.push({ httpMethod: m[1].toUpperCase(), path: m[2], handler, file: file.path, middlewares });
  }

  // NestJS/TypeScript decorator style: @Get('/path') async methodName(
  const decoratorRe = /@(Get|Post|Put|Patch|Delete|All)\s*\(\s*['"`]?([^'"`\s)]*)['"`]?\s*\)\s*\n?\s*(?:@\w+[^\n]*\n\s*)*(?:async\s+)?(\w+)\s*\(/g;
  while ((m = decoratorRe.exec(content)) !== null) {
    // Try to detect the controller class name
    const before = content.slice(0, m.index);
    const classMatch = before.match(/(?:@Controller\([^)]*\)\s*\n\s*)?export\s+class\s+(\w+)/g);
    const controller = classMatch ? classMatch[classMatch.length - 1].replace(/.*class\s+/, "").trim() : undefined;
    out.push({ httpMethod: m[1].toUpperCase(), path: m[2] || "/", handler: m[3], controller, file: file.path, middlewares: [] });
  }

  // Next.js API routes: export default function handler or export async function GET
  if (file.path.includes("/pages/api/") || file.path.includes("/app/api/") || file.path.includes("/route.ts") || file.path.includes("/route.js")) {
    const nextRe = /export\s+(?:default\s+)?(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|handler)\s*\(/g;
    while ((m = nextRe.exec(content)) !== null) {
      const httpMethod = m[1] === "handler" ? "ALL" : m[1];
      const routePath  = file.path.replace(/.*\/pages\/api|.*\/app\/api/, "").replace(/\.(ts|js)x?$/, "").replace(/\/route$/, "") || "/";
      out.push({ httpMethod, path: routePath, handler: m[1], file: file.path, middlewares: [] });
    }
  }
}

// ── DB access extraction ──────────────────────────────────────────────────

const ORM_SIGNATURES: { orm: string; pattern: RegExp; modelPattern?: RegExp; langs?: string[] }[] = [
  { orm: "prisma",    pattern: /prisma\.(\w+)\.(findMany|findFirst|findUnique|create|createMany|update|updateMany|delete|deleteMany|upsert|count|aggregate)/g, modelPattern: /prisma\.(\w+)\./g, langs: ["TypeScript", "JavaScript"] },
  { orm: "mongoose",  pattern: /([A-Z]\w*Model|new [A-Z]\w*|Model)\.(?:find|findOne|findById|save|create|updateOne|updateMany|deleteOne|deleteMany|aggregate|populate)\(/g, langs: ["TypeScript", "JavaScript"] },
  { orm: "typeorm",   pattern: /(?:getRepository|repository|this\.\w+Repository|\.createQueryBuilder)\s*[.(]/g, langs: ["TypeScript", "JavaScript"] },
  // Tightened: model must be Capitalized so `x.create(` / `db.update(` don't false-positive.
  { orm: "sequelize", pattern: /([A-Z]\w*)\.(?:findAll|findOne|findByPk|create|update|destroy|upsert|bulkCreate)\s*\(/g, langs: ["TypeScript", "JavaScript"] },
  { orm: "knex",      pattern: /knex\s*\(\s*['"`](\w+)['"`]\s*\)|\.from\s*\(\s*['"`](\w+)['"`]\s*\)/g, langs: ["TypeScript", "JavaScript"] },
  { orm: "raw-sql",   pattern: /(?:db|pool|connection|client)\s*\.(?:query|execute|run)\s*\(\s*['"`]/g },
  // ── Python ORMs ──
  { orm: "sqlalchemy", pattern: /\bsession\s*\.\s*(query|add|add_all|execute|delete|merge|commit|flush)\s*\(|\bconn\s*\.\s*(execute|run_sync)\s*\(|select\s*\(\s*[A-Z]\w*|insert\s*\(\s*[A-Z]\w*|update\s*\(\s*[A-Z]\w*|delete\s*\(\s*[A-Z]\w*/g, modelPattern: /(?:class\s+([A-Z]\w*)\s*\(.*Base|select\s*\(\s*([A-Z]\w*))/g, langs: ["Python"] },
  { orm: "django-orm", pattern: /objects\s*\.\s*(filter|get|create|get_or_create|update|update_or_create|delete|all|exclude|annotate|aggregate)\s*\(/g, langs: ["Python"] },
  // NOTE: `execute` intentionally excluded — `await conn.execute(...)` is also
  // SQLAlchemy's connection API; asyncpg is identified by its fetch* family.
  { orm: "asyncpg",   pattern: /await\s+(?:conn|connection|pool)\s*\.\s*(fetch|fetchrow|fetchval)\s*\(/g, langs: ["Python"] },
];

function extractDbAccess(file: WorkspaceFile, out: DbAccessPattern[]) {
  const content = file.content;

  for (const sig of ORM_SIGNATURES) {
    // Skip ORMs that don't apply to this file's language (prevents
    // `sequelize` firing on Python test files that call `.create(`).
    if (sig.langs && !sig.langs.includes(file.language)) continue;
    if (!sig.pattern.test(content)) { sig.pattern.lastIndex = 0; continue; }
    sig.pattern.lastIndex = 0;

    const operations: string[] = [];
    const models: string[] = [];
    let m: RegExpExecArray | null;

    // Extract operations
    const opRe = new RegExp(sig.pattern.source, sig.pattern.flags);
    while ((m = opRe.exec(content)) !== null) {
      // For prisma: group 2 is the operation, group 1 is the model
      if (sig.orm === "prisma") {
        if (m[2]) operations.push(m[2]);
        if (m[1]) models.push(capitalize(m[1]));
      } else {
        // Generic: last capture group is often the operation
        const op = m[2] || m[1] || "query";
        operations.push(op);
      }
    }

    // Extract model names via model pattern if present
    if (sig.modelPattern) {
      const modelRe = new RegExp(sig.modelPattern.source, sig.modelPattern.flags);
      while ((m = modelRe.exec(content)) !== null) {
        if (m[1] && m[1] !== "then" && m[1] !== "catch" && m[1] !== "finally" && /^[A-Z]/.test(m[1]))
          models.push(m[1]);
      }
    }

    const uniqueOps    = [...new Set(operations)].slice(0, 8);
    const uniqueModels = [...new Set(models)].slice(0, 6);

    if (uniqueOps.length === 0 && uniqueModels.length === 0) continue;

    const existing = out.find((d) => d.file === file.path && d.orm === sig.orm);
    if (existing) {
      existing.operations.push(...uniqueOps);
      existing.models.push(...uniqueModels);
      existing.operations = [...new Set(existing.operations)].slice(0, 8);
      existing.models = [...new Set(existing.models)].slice(0, 6);
    } else {
      out.push({ file: file.path, orm: sig.orm, operations: uniqueOps, models: uniqueModels });
    }
    // No break: a file can legitimately use multiple data-access styles.
  }
}

// ── Function/class extraction ─────────────────────────────────────────────

function extractFunctions(file: WorkspaceFile, out: FunctionSignature[]) {
  const content = file.content;
  // Only extract from source files that export things
  if (!content.includes("export")) return;

  const patterns: RegExp[] = [
    /(?:export\s+)?(async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g,
    /export\s+const\s+(\w+)\s*=\s*(async\s+)?\(([^)]*)\)\s*=>/g,
    /export\s+class\s+(\w+)/g,
  ];

  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const isExported = m[0].startsWith("export");
      const isAsync    = m[0].includes("async");
      let name: string, params: string[];

      if (m[0].includes("class")) {
        name   = m[1];
        params = [];
      } else if (m[0].includes("const")) {
        name   = m[1];
        params = (m[3] || "").split(",").map((p) => p.trim().split(":")[0].trim()).filter(Boolean);
      } else {
        name   = m[2];
        params = (m[3] || "").split(",").map((p) => p.trim().split(":")[0].trim()).filter(Boolean);
      }

      if (!name || name.length < 2) continue;
      out.push({ name, isAsync, isExported, params: params.slice(0, 4), file: file.path });
    }
  }
}

// ── Middleware extraction ─────────────────────────────────────────────────

function extractMiddleware(file: WorkspaceFile, out: { file: string; names: string[] }[]) {
  const content = file.content;
  const names: string[] = [];

  // app.use(middleware) — single line
  const useRe = /(?:app|router|server)\s*\.use\s*\(\s*([\w.]+)\s*(?:,|\))/g;
  let m: RegExpExecArray | null;
  while ((m = useRe.exec(content)) !== null) {
    if (m[1] && !/['"`]/.test(m[1])) names.push(m[1]);
  }

  // app.use(require('cors')), app.use(cors()), app.use(authMw('x'))
  const useCallRe = /(?:app|router|server)\s*\.use\s*\(\s*(?:require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)|([\w.]+)\s*\()/g;
  while ((m = useCallRe.exec(content)) !== null) {
    const name = (m[1] || m[2] || "").split("/").pop();
    if (name && !/['"`]/.test(name)) names.push(name);
  }

  // NestJS guards / interceptors / pipes
  const nestRe = /@Use(?:Guards|Interceptors|Pipes)\s*\(([^)]+)\)/g;
  while ((m = nestRe.exec(content)) !== null) {
    m[1].split(",").map((s) => s.trim()).filter(Boolean).forEach((n) => names.push(n));
  }

  if (names.length > 0) out.push({ file: file.path, names: [...new Set(names)] });
}

// ── Event extraction ──────────────────────────────────────────────────────

function extractEventEmits(file: WorkspaceFile, map: Map<string, { file: string; event: string }[]>) {
  const emitPatterns = [
    /\.emit\s*\(\s*['"`]([\w:.-]+)['"`]/g,
    /\.publish\s*\(\s*['"`]([\w:.-]+)['"`]/g,
    /EventBus\.(?:emit|publish)\s*\(\s*['"`]([\w:.-]+)['"`]/g,
    /new\s+\w+Event\s*\(/g,  // NestJS event objects
  ];
  for (const re of emitPatterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(file.content)) !== null) {
      if (!m[1]) continue;
      const existing = map.get(m[1]) || [];
      existing.push({ file: file.path, event: m[1] });
      map.set(m[1], existing);
    }
  }
}

function extractEventListeners(file: WorkspaceFile, map: Map<string, string[]>) {
  const listenPatterns = [
    /\.on\s*\(\s*['"`]([\w:.-]+)['"`]/g,
    /\.subscribe\s*\(\s*['"`]([\w:.-]+)['"`]/g,
    /@(?:On|Subscribe|EventPattern)\s*\(\s*['"`]([\w:.-]+)['"`]/g,
  ];
  for (const re of listenPatterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(file.content)) !== null) {
      if (!m[1]) continue;
      const existing = map.get(m[1]) || [];
      if (!existing.includes(file.path)) existing.push(file.path);
      map.set(m[1], existing);
    }
  }
}

// ── Call chain builder ────────────────────────────────────────────────────

function buildCallChains(files: WorkspaceFile[], routes: RouteDefinition[]): CallChain[] {
  const chains: CallChain[] = [];
  const seen = new Set<string>();

  // Build export index: exported name → file paths (TS + Python).
  // Same name can live in many files; the importer picks same-top-folder first.
  const exportIndex = new Map<string, string[]>();
  const addExport = (name: string, path: string) => {
    if (!name || name.length < 2) return;
    const list = exportIndex.get(name) ?? [];
    if (!list.includes(path)) list.push(path);
    exportIndex.set(name, list);
  };
  for (const file of files) {
    const re = /export\s+(?:default\s+)?(?:class|function|const|let|var)\s+(\w+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(file.content)) !== null) addExport(m[1], file.path);
    if (file.language === "Python") {
      const reDef = /^(?:async\s+)?def\s+(\w+)\s*\(/gm;
      while ((m = reDef.exec(file.content)) !== null) {
        if (!m[1].startsWith("_")) addExport(m[1], file.path);
      }
      const reCls = /^class\s+(\w+)/gm;
      while ((m = reCls.exec(file.content)) !== null) addExport(m[1], file.path);
    }
  }
  const lookupExport = (name: string, fromPath: string): string | undefined => {
    const cands = exportIndex.get(name);
    if (!cands?.length) return undefined;
    const top = fromPath.split("/")[0];
    return cands.find((p) => p.split("/")[0] === top) ?? cands[0];
  };

  const pathSet = new Set(files.map((f) => f.path));

  const push = (from: string, to: string, method: string, kind: CallChain["kind"]) => {
    if (!to || to === from) return;
    const key = `${from}→${to}→${method}`;
    if (!seen.has(key)) { seen.add(key); chains.push({ from, to, method, kind }); }
  };

  for (const file of files) {
    // Named imports: import { Foo, Bar } from './something'
    const namedRe = /import\s+\{([^}]+)\}\s+from\s+['"`]([^'"`]+)['"`]/g;
    let m: RegExpExecArray | null;
    while ((m = namedRe.exec(file.content)) !== null) {
      const importPath = m[2];
      const names = m[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
      for (const name of names) {
        const targetFile = resolveImportTarget(file.path, importPath, pathSet) ?? lookupExport(name, file.path);
        if (targetFile) push(file.path, targetFile, name, "import");
      }
    }

    // Default imports: import Foo from './something'
    const defaultRe = /import\s+(\w+)\s+from\s+['"`]([^'"`]+)['"`]/g;
    while ((m = defaultRe.exec(file.content)) !== null) {
      const name = m[1];
      if (/^(React|Vue|express|path|fs|http|https|os|util)$/.test(name)) continue;
      const targetFile = resolveImportTarget(file.path, m[2], pathSet) ?? lookupExport(name, file.path);
      if (targetFile) push(file.path, targetFile, name, "import");
    }

    // Namespace imports: import * as ns from './something'
    const nsRe = /import\s+\*\s+as\s+(\w+)\s+from\s+['"`]([^'"`]+)['"`]/g;
    while ((m = nsRe.exec(file.content)) !== null) {
      const targetFile = resolveImportTarget(file.path, m[2], pathSet);
      if (targetFile) push(file.path, targetFile, m[1], "import");
    }

    // Side-effect imports: import './something'
    const sideRe = /import\s+['"`]([^'"`]+)['"`]\s*;?/g;
    while ((m = sideRe.exec(file.content)) !== null) {
      const targetFile = resolveImportTarget(file.path, m[1], pathSet);
      if (targetFile) push(file.path, targetFile, "(side-effect)", "import");
    }

    // CommonJS: const X = require('./y'), const {A,B} = require('./y'), require('./y')
    const reqRe = /(?:const|let|var)\s+(?:(\w+)|\{([^}]+)\})\s*=\s*require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)|require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
    while ((m = reqRe.exec(file.content)) !== null) {
      const reqPath = m[3] ?? m[4];
      if (!reqPath || !reqPath.startsWith(".")) continue; // only relative
      const targetFile = resolveImportTarget(file.path, reqPath, pathSet);
      if (!targetFile) continue;
      if (m[1]) push(file.path, targetFile, m[1], "import");
      else if (m[2]) {
        for (const name of m[2].split(",").map((s) => s.trim().split(/\s*:\s*/)[0].trim()).filter(Boolean)) {
          push(file.path, targetFile, name, "import");
        }
      } else push(file.path, targetFile, "(side-effect)", "import");
    }

    // Re-exports: export { X } from './y', export * from './y'
    const reExpRe = /export\s+(?:\{([^}]+)\}|\*)\s+from\s+['"`]([^'"`]+)['"`]/g;
    while ((m = reExpRe.exec(file.content)) !== null) {
      const targetFile = resolveImportTarget(file.path, m[2], pathSet);
      if (!targetFile) continue;
      if (m[1]) {
        for (const name of m[1].split(",").map((s) => s.trim().split(/\s+as\s+/).pop()!.trim()).filter(Boolean)) {
          push(file.path, targetFile, name, "import");
        }
      } else push(file.path, targetFile, "(re-export)", "import");
    }

    // Python: from x.y import a, b / from . import sib / import x.y
    // Resolved with the same language-aware resolver as the graph, so
    // `from .visuals import f` hits the sibling .py, never a stray .ts.
    if (file.language === "Python") {
      const pyFromRe = /^from\s+([\w.]+)\s+import\s+(.+)/gm;
      while ((m = pyFromRe.exec(file.content)) !== null) {
        const raw = m[1].trim();
        let rest = m[2];
        if (rest.trim().startsWith("(") && !rest.includes(")")) {
          // Parenthesized multi-line import: gather continuation lines so
          // names (and chain methods) are real, not "(re-export)".
          const after = file.content.slice(m.index + m[0].length).split("\n").slice(0, 15);
          const collected: string[] = [];
          for (const ln of after) {
            const code = ln.split("#")[0];
            if (code.includes(")")) { collected.push(code.slice(0, code.indexOf(")"))); break; }
            collected.push(code);
          }
          rest = collected.join(",");
        }
        const names = rest.split(",")
          .map((s) => s.trim().split(/\s+/)[0].replace(/^[*(]|[),;]*$/g, "").trim())
          .filter((s) => /^[\w*]+$/.test(s) && s !== "*");
        const targetFile = resolveImportPath(raw, file.path, pathSet, "Python");
        if (!targetFile) continue;
        if (/^\.+$/.test(raw)) {
          // `from . import foo` — each name is the module; resolve per name
          for (const nm of names) {
            const t2 = resolveImportPath(`${raw}${nm}`, file.path, pathSet, "Python")
              ?? lookupExport(nm, file.path);
            if (t2) push(file.path, t2, nm, "import");
          }
        } else if (!names.length) {
          push(file.path, targetFile, "(re-export)", "import");
        } else {
          for (const nm of names.slice(0, 8)) push(file.path, targetFile, nm, "import");
        }
      }
      const pyImpRe = /^import\s+([\w.]+)/gm;
      while ((m = pyImpRe.exec(file.content)) !== null) {
        const targetFile = resolveImportPath(m[1].trim(), file.path, pathSet, "Python");
        if (targetFile) push(file.path, targetFile, m[1].trim().split(".").pop()!, "import");
      }
    }
  }

  // Route → handler file chains
  for (const route of routes) {
    const handlerFile = lookupExport(route.handler, route.file);
    if (handlerFile && handlerFile !== route.file) {
      const key = `${route.file}→${handlerFile}→${route.handler}`;
      if (!seen.has(key)) { seen.add(key); chains.push({ from: route.file, to: handlerFile, method: route.handler, kind: "route" }); }
    }
  }

  return chains;
}

// ── Summary builder (what gets sent to the AI) ────────────────────────────

function buildSummary(
  routes: RouteDefinition[],
  chains: CallChain[],
  events: EventFlow[],
  db: DbAccessPattern[],
  mw: { file: string; names: string[] }[],
  fns: FunctionSignature[]
): FlowContextSummary {
  const routeLines = routes.slice(0, 30).map((r) => {
    const ctrl = r.controller ? ` (${r.controller}.${r.handler})` : ` → ${r.handler}`;
    const mws = r.middlewares.length ? ` [mw: ${r.middlewares.slice(0, 2).join(", ")}]` : "";
    return `${r.httpMethod} ${r.path}${ctrl}${mws} (${r.file})`;
  });

  const chainLines = balanceChains(chains, 40).map((c) =>
    `${c.from.split("/").slice(-2).join("/")} → ${c.to.split("/").slice(-2).join("/")} via ${c.method}`
  );

  const eventLines = events.slice(0, 15).map((e) => {
    const listeners = e.listenerFiles.length ? ` → [${e.listenerFiles.slice(0, 3).map((f) => f.split("/").pop()).join(", ")}]` : " → (no listeners found)";
    return `${e.emitFile.split("/").pop()} emits '${e.event}'${listeners}`;
  });

  const dbLines = db.slice(0, 20).map((d) => {
    const models = d.models.length ? ` [${d.models.slice(0, 4).join(", ")}]` : "";
    return `${d.file.split("/").slice(-2).join("/")}: ${d.orm} → ${d.operations.slice(0, 4).join(", ")}${models}`;
  });

  const mwLines = mw.slice(0, 10).map((m) => `${m.file.split("/").pop()}: ${m.names.join(", ")}`);

  // Group exported functions by file
  const fnByFile = new Map<string, string[]>();
  for (const fn of fns) {
    if (!fn.isExported) continue;
    const existing = fnByFile.get(fn.file) || [];
    existing.push(fn.name);
    fnByFile.set(fn.file, existing);
  }
  const fnLines = [...fnByFile.entries()].slice(0, 20).map(([file, names]) =>
    `${file.split("/").slice(-2).join("/")}: ${names.slice(0, 6).join(", ")}`
  );

  return {
    routeCount: routes.length,
    routes: routeLines,
    callChainLines: chainLines,
    eventLines,
    dbLines,
    middlewareLines: mwLines,
    exportedFunctions: fnLines,
  };
}

// ── Utility ───────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Resolve a relative import ('./x', '../y') to a real workspace file path.
 * Returns undefined for bare package imports or unresolvable paths.
 */
function resolveImportTarget(from: string, importPath: string, pathSet: Set<string>): string | undefined {
  if (!importPath.startsWith(".")) return undefined;
  const dir = from.split("/").slice(0, -1).join("/");
  const parts: string[] = [];
  for (const seg of `${dir}/${importPath}`.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  const base = parts.join("/");
  const candidates = [
    base,
    `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`,
    `${base}.py`, `${base}.go`, `${base}.java`, `${base}.rb`, `${base}.php`,
    `${base}/index.ts`, `${base}/index.tsx`, `${base}/index.js`, `${base}/index.jsx`,
  ];
  for (const c of candidates) if (pathSet.has(c)) return c;
  // Prefix match (handles compiled/out mirrors like src/x → same tree)
  for (const c of candidates) {
    const hit = [...pathSet].find((p) => p === c || p.endsWith(`/${c}`));
    if (hit) return hit;
  }
  return undefined;
}
