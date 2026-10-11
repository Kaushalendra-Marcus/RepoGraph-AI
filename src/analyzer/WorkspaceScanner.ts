import * as vscode from "vscode";
import * as path from "path";

export interface WorkspaceFile {
  path: string;        // relative path from workspace root
  absPath: string;     // absolute path (for opening)
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

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", ".nuxt", "__pycache__",
  ".venv", "venv", "env", ".tox", "coverage", ".cache", "vendor",
  "target", "bin", "obj", ".idea", ".vscode", ".opencode", "out", ".output",
  ".turbo", ".vercel", ".parcel-cache", ".sass-cache", ".eslintcache",
  "tmp", "temp", "logs",
  ".pytest_cache", ".mypy_cache", ".ruff_cache", "screenshots", "__snapshots__",
]);

const SKIP_FILE_RES: RegExp[] = [
  /package-lock\.json$/, /yarn\.lock$/, /pnpm-lock.*$/, /poetry\.lock$/,
  /\.min\.(js|css)$/, /\.map$/, /\.pyc$/, /e2e-results\.json$/,
  /\.d\.ts$/,
  /robots\.txt$/,
  /(^|\/)REPOGRAPH-CONTEXT\.md$/,
];

const CODE_EXTS: Record<string, string> = {
  ".ts": "TypeScript", ".tsx": "TypeScript",
  ".js": "JavaScript", ".jsx": "JavaScript", ".mjs": "JavaScript",
  ".py": "Python", ".go": "Go",
  ".rs": "Rust", ".java": "Java",
  ".rb": "Ruby", ".php": "PHP",
  ".cs": "C#", ".cpp": "C++", ".c": "C", ".h": "C",
  ".vue": "Vue", ".svelte": "Svelte",
  ".json": "JSON", ".yaml": "YAML", ".yml": "YAML",
  ".toml": "TOML", ".md": "Markdown",
  // Plain text is scanned ONLY so manifest files (requirements.txt) are
  // available for tech-stack detection — never counted as source code.
  ".txt": "Text",
};

/** Non-source .txt basenames worth scanning for stack detection. */
const MANIFEST_TXT_BASENAMES = new Set([
  "requirements.txt", "requirements-dev.txt", "requirements-test.txt",
]);

export async function scanWorkspace(
  onProgress?: (msg: string) => void
): Promise<WorkspaceInfo | null> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    throw new Error("No workspace folder open. Please open a folder in VS Code first.");
  }

  const root = workspaceFolders[0];
  const rootPath = root.uri.fsPath;
  const name = root.name;

  onProgress?.(`Scanning workspace: ${name}...`);

  // Use VS Code API to find all files (respects .gitignore automatically)
  const pattern = new vscode.RelativePattern(root, "**/*");
  const allUris = await vscode.workspace.findFiles(
    pattern,
    "**/{node_modules,.git,dist,build,.next,.nuxt,__pycache__,.venv,venv,env,.tox,coverage,.cache,.pytest_cache,.mypy_cache,.ruff_cache,vendor,target,bin,obj,.idea,.vscode,.opencode,out,.output,.turbo,.vercel,.parcel-cache,.sass-cache,.eslintcache,tmp,temp,logs,screenshots}/**"
  );

  // Filter to code files only (+ manifests needed for stack detection)
  const codeUris = allUris.filter((uri) => {
    const ext = path.extname(uri.fsPath).toLowerCase();
    if (!CODE_EXTS[ext]) return false;
    // Double-check no skipped dirs
    const rel = path.relative(rootPath, uri.fsPath);
    const parts = rel.split(path.sep);
    if (parts.some((p) => SKIP_DIRS.has(p))) return false;
    const relPosix = rel.replace(/\\/g, "/");
    if (SKIP_FILE_RES.some((re) => re.test(relPosix))) return false;
    // .txt files: only manifests (requirements.txt), not docs like robots.txt
    if (ext === ".txt" && !MANIFEST_TXT_BASENAMES.has(parts[parts.length - 1])) return false;
    return true;
  });

  onProgress?.(`Found ${codeUris.length} code files. Reading contents...`);

  const files: WorkspaceFile[] = [];
  let done = 0;

  // Read in batches
  const batchSize = 20;
  for (let i = 0; i < codeUris.length; i += batchSize) {
    const batch = codeUris.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (uri) => {
        const bytes = await vscode.workspace.fs.readFile(uri);
        const content = new TextDecoder("utf-8").decode(bytes);
        const ext = path.extname(uri.fsPath).toLowerCase();
        const relPath = path.relative(rootPath, uri.fsPath).replace(/\\/g, "/");
        return {
          path: relPath,
          absPath: uri.fsPath,
          content: content.slice(0, 50000), // limit per file
          size: bytes.length,
          language: CODE_EXTS[ext] || "Unknown",
        };
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled") files.push(r.value);
    }

    done += batch.length;
    onProgress?.(`Read ${Math.min(done, codeUris.length)}/${codeUris.length} files...`);
  }

  return { name, rootPath, files, isLocal: true };
}