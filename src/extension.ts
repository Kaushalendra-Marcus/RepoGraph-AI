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

  // Command to open panel
  context.subscriptions.push(
    vscode.commands.registerCommand("repograph.open", () => {
      vscode.commands.executeCommand("workbench.view.extension.repograph");
    })
  );
}

export function deactivate() {}