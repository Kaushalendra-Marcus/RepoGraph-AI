import * as vscode from "vscode";
import * as path from "path";

export interface WorkspaceFile {
  path: string;
  absPath: string;
  content: string;
  size: number;
  language: string;
}

export interface WorkspaceInfo {
  name: string;
  rootPath: string;
  files: WorkspaceFile[];
  isLocal: true;
}

// All directories that should never be analyzed
const SKIP_DIRS = new Set([
  // package managers / deps
  "node_modules", "bower_components", "jspm_packages", "vendor",
  // build outputs
  "dist", "build", "out", "output", ".output", ".next", ".nuxt",
  ".svelte-kit", ".astro", "storybook-static", ".expo",
  // version control
  ".git", ".svn", ".hg",
  // python
  "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache",
  ".venv", "venv", "env", ".tox", "site-packages",
  // java / kotlin / scala
  "target", "bin", "obj", ".gradle", "build",
  // rust
  "target",
  // ruby
  ".bundle",
  // coverage / cache
  "coverage", ".cache", ".turbo", ".vercel", ".netlify",
  // IDEs
  ".idea", ".vscode", ".vs",
  // misc
  "tmp", "temp", "logs", ".DS_Store",
  // generated assets
  "public", "static", "assets", "media",
]);

// Files that are auto-generated and should not be analyzed
const SKIP_FILE_PATTERNS = [
  /\.min\.(js|css)$/,
  /\.bundle\.(js|css)$/,
  /\.chunk\.(js|css)$/,
  /\.map$/,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
  /composer\.lock$/,
  /Gemfile\.lock$/,
  /Cargo\.lock$/,
  /poetry\.lock$/,
  /\.lock$/,
  /\.snap$/,
  /\.pb\.go$/,
  /_pb2\.py$/,
  /\.generated\./,
  /\.auto\./,
  /migration.*\d{10,}/,  // numbered migration files
];

const CODE_EXTS: Record<string, string> = {
  ".ts": "TypeScript", ".tsx": "TypeScript",
  ".js": "JavaScript", ".jsx": "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript",
  ".py": "Python",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java", ".kt": "Kotlin",
  ".rb": "Ruby",
  ".php": "PHP",
  ".cs": "C#",
  ".cpp": "C++", ".cc": "C++", ".cxx": "C++",
  ".c": "C", ".h": "C", ".hpp": "C++",
  ".swift": "Swift",
  ".vue": "Vue",
  ".svelte": "Svelte",
  ".astro": "Astro",
  ".json": "JSON",
  ".yaml": "YAML", ".yml": "YAML",
  ".toml": "TOML",
  ".md": "Markdown", ".mdx": "Markdown",
  ".graphql": "GraphQL", ".gql": "GraphQL",
  ".prisma": "Prisma",
  ".sql": "SQL",
  ".sh": "Shell", ".bash": "Shell", ".zsh": "Shell",
  ".dockerfile": "Dockerfile",
};

function shouldSkipFile(filePath: string): boolean {
  const name = path.basename(filePath).toLowerCase();
  return SKIP_FILE_PATTERNS.some((p) => p.test(name));
}

function shouldSkipDir(dirName: string): boolean {
  return SKIP_DIRS.has(dirName) || dirName.startsWith(".");
}

export async function scanWorkspace(
  onProgress?: (msg: string) => void
): Promise<WorkspaceInfo | null> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    throw new Error("No workspace folder open. Open a folder in VS Code first.");
  }

  const root = workspaceFolders[0];
  const rootPath = root.uri.fsPath;
  const name = root.name;

  onProgress?.(`Scanning workspace: ${name}...`);

  // Build exclusion glob from SKIP_DIRS
  const skipGlob = `**/{${[...SKIP_DIRS].join(",")}}/**`;

  const allUris = await vscode.workspace.findFiles(
    new vscode.RelativePattern(root, "**/*"),
    skipGlob
  );

  // Filter: only code extensions, no auto-generated files, no hidden dirs
  const codeUris = allUris.filter((uri) => {
    const ext = path.extname(uri.fsPath).toLowerCase();
    if (!CODE_EXTS[ext]) return false;
    if (shouldSkipFile(uri.fsPath)) return false;

    const rel = path.relative(rootPath, uri.fsPath);
    const parts = rel.split(path.sep);
    // ensure no skipped directory in path
    if (parts.slice(0, -1).some((p: string) => shouldSkipDir(p))) return false;

    return true;
  });

  onProgress?.(`Found ${codeUris.length} code files. Reading contents...`);

  const files: WorkspaceFile[] = [];
  const MAX_FILES = 200;
  const MAX_FILE_SIZE = 150 * 1024; // 150 KB per file
  const batchSize = 20;
  let done = 0;

  for (let i = 0; i < Math.min(codeUris.length, MAX_FILES); i += batchSize) {
    const batch = codeUris.slice(i, i + batchSize);

    const results = await Promise.allSettled(
      batch.map(async (uri) => {
        const stat = await vscode.workspace.fs.stat(uri);
        if (stat.size > MAX_FILE_SIZE) return null; // skip very large files

        const bytes = await vscode.workspace.fs.readFile(uri);
        const content = new TextDecoder("utf-8").decode(bytes);
        const ext = path.extname(uri.fsPath).toLowerCase();
        const relPath = path.relative(rootPath, uri.fsPath).replace(/\\/g, "/");

        return {
          path: relPath,
          absPath: uri.fsPath,
          content: content.slice(0, 60000),
          size: stat.size,
          language: CODE_EXTS[ext] || "Unknown",
        } satisfies WorkspaceFile;
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        files.push(r.value);
      }
    }

    done += batch.length;
    onProgress?.(
      `Read ${Math.min(done, codeUris.length)}/${Math.min(codeUris.length, MAX_FILES)} files...`
    );
  }

  return { name, rootPath, files, isLocal: true };
}