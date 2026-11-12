/** Extension entry point: registers the read-only editor, the thread tree and two commands. */
import * as vscode from "vscode";
import { CheckpointEditorProvider, Registry, VIEW_TYPE } from "./editor.ts";
import { ThreadTree } from "./tree.ts";
import { t } from "../../src/core/i18n.ts";

export function activate(context: vscode.ExtensionContext): void {
  const registry = new Registry();
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(VIEW_TYPE, new CheckpointEditorProvider(context.extensionUri, registry), {
      supportsMultipleEditorsPerDocument: true,
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("graphtrail.language")) registry.refresh();
    }),
    vscode.window.createTreeView("graphtrail.threads", { treeDataProvider: new ThreadTree(registry) }),
    vscode.commands.registerCommand("graphtrail.openDatabase", async () => {
      const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { [t(registry.lang, "dialogFilter")]: ["sqlite", "sqlite3", "db"] },
        openLabel: t(registry.lang, "dialogOpenLabel"),
      });
      const uri = picked?.[0];
      if (uri) await vscode.commands.executeCommand("vscode.openWith", uri, VIEW_TYPE);
    }),
    vscode.commands.registerCommand("graphtrail.showThread", (threadId: string, ns: string) => {
      registry.show(threadId, ns);
    }),
  );
}

export function deactivate(): void {}
