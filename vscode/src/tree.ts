/** Tree view: threads of the focused database, each with its checkpoints. */
import * as vscode from "vscode";
import type { Registry } from "./editor.ts";

interface Node {
  threadId: string;
  ns: string;
  /** Present for checkpoint rows. */
  step?: number;
  nodes?: string[];
}

export class ThreadTree implements vscode.TreeDataProvider<Node> {
  private readonly registry: Registry;
  readonly onDidChangeTreeData: vscode.Event<void>;

  constructor(registry: Registry) {
    this.registry = registry;
    this.onDidChangeTreeData = registry.onDidChange;
  }

  getTreeItem(node: Node): vscode.TreeItem {
    const isCheckpoint = node.step !== undefined;
    const label = isCheckpoint
      ? `step ${node.step}`
      : `${node.threadId}${node.ns ? ` [${node.ns}]` : ""}`;
    const item = new vscode.TreeItem(
      label,
      isCheckpoint ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed,
    );
    if (isCheckpoint) item.description = node.nodes?.join(", ") || "input";
    else {
      const summary = this.registry.current?.db.listThreads().find((t) => t.threadId === node.threadId && t.ns === node.ns);
      item.description = summary ? `${summary.status}, ${summary.checkpoints} checkpoints` : "";
    }
    item.command = { command: "graphtrail.showThread", title: "Show thread", arguments: [node.threadId, node.ns] };
    return item;
  }

  getChildren(parent?: Node): Node[] {
    const db = this.registry.current?.db;
    if (!db) return [];
    if (!parent) return db.listThreads().map((t) => ({ threadId: t.threadId, ns: t.ns }));
    return db.timeline(parent.threadId, parent.ns).map((e) => ({
      threadId: parent.threadId,
      ns: parent.ns,
      step: e.step,
      nodes: e.nodes,
    }));
  }
}
