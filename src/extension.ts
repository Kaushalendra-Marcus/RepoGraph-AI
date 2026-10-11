import * as vscode from "vscode";
import { RepoGraphPanel } from "./panel/RepoGraphPanel";

export function activate(context: vscode.ExtensionContext) {
  // Register webview view provider
  const provider = new RepoGraphPanel(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("repograph.mainView", provider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  // Status bar — one glance instead of a terminal + `graphify query` loop.
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.text = "$(graph) RepoGraph";
  status.tooltip = "RepoGraph AI — code knowledge graph";
  status.command = "repograph.open";
  status.show();
  context.subscriptions.push(status);
  provider.onIndexStatus = (msg) => {
    status.text = msg;
  };

  // Command to open panel
  context.subscriptions.push(
    vscode.commands.registerCommand("repograph.open", () => {
      vscode.commands.executeCommand("workbench.view.extension.repograph");
    })
  );

  // One-click reindex (manual escape hatch — auto-index covers the rest).
  context.subscriptions.push(
    vscode.commands.registerCommand("repograph.reindex", async () => {
      status.text = "$(sync~spin) RepoGraph: indexing…";
      try {
        await provider.ensureGraphIndexed("manual");
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        vscode.window.showErrorMessage(`RepoGraph reindex failed: ${message}`);
      }
    })
  );

  // Auto-index on folder open — no `/graphify .` needed.
  // Delayed slightly so VS Code finishes restoring the workspace first.
  setTimeout(() => {
    void provider.ensureGraphIndexed("startup").catch(() => {
      // Silent on startup: panel shows empty state, user can still click Analyze.
    });
  }, 1500);

  // File watcher — replaces `graphify --update` / commit hooks by hand.
  // Code extensions only; debounce + autoIndex gate live inside the panel.
  const watcher = vscode.workspace.createFileSystemWatcher(
    "**/*.{ts,tsx,js,jsx,mjs,py,go,rs,java,rb,php,cs,cpp,c,h,vue,svelte,json,yaml,yml,toml,md}"
  );
  const onEvent = (uri: vscode.Uri) => {
    const p = uri.fsPath.replace(/\\/g, "/");
    if (
      p.includes("/node_modules/") || p.includes("/.git/") || p.includes("/dist/") ||
      p.includes("/build/") || p.includes("/out/") || p.includes("/.repograph/") ||
      p.includes("/repograph-cache/")
    ) {
      return;
    }
    provider.queueFileEvent();
  };
  watcher.onDidChange(onEvent, null, context.subscriptions);
  watcher.onDidCreate(onEvent, null, context.subscriptions);
  watcher.onDidDelete(onEvent, null, context.subscriptions);
  context.subscriptions.push(watcher);
}

export function deactivate() {}