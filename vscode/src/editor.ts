/**
 * Read-only custom editor: opens a checkpoint database with the graphtrail core
 * and shows the same HTML report as `graphtrail export --format html`.
 * The webview has scripts disabled and no access to local files.
 */
import * as vscode from "vscode";
import { buildReport, openCheckpointDb, renderHtml } from "../../src/core/index.ts";
import type { CheckpointDb, Lang } from "../../src/core/index.ts";
import { resolveLang } from "../../src/core/index.ts";
import { t } from "../../src/core/i18n.ts";

export const VIEW_TYPE = "graphtrail.checkpointDb";

/** One open database and the panel that shows it. */
export interface OpenDb {
  uri: vscode.Uri;
  db: CheckpointDb;
  panel: vscode.WebviewPanel;
  /** The thread currently rendered in the panel (undefined for an empty database). */
  shown?: { threadId: string; ns: string };
}

class DbDocument implements vscode.CustomDocument {
  readonly uri: vscode.Uri;
  constructor(uri: vscode.Uri) {
    this.uri = uri;
  }
  dispose(): void {}
}

export class Registry {
  /** The database whose editor was focused last; the tree view shows its threads. */
  current: OpenDb | undefined;
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;
  /** Every open database; all of them are redrawn when the language changes. */
  readonly opened = new Set<OpenDb>();

  /** Display language: the `graphtrail.language` setting (auto | en | ko); auto follows the VS Code display language. */
  get lang(): Lang {
    const setting = vscode.workspace.getConfiguration("graphtrail").get<string>("language", "auto");
    return setting === "en" || setting === "ko" ? setting : resolveLang(vscode.env.language);
  }

  /** Redraw panels and tree after the language setting changed. */
  refresh(): void {
    for (const open of this.opened) {
      open.db.lang = this.lang;
      if (open.shown) this.render(open, open.shown.threadId, open.shown.ns);
      else open.panel.webview.html = `<p>${t(this.lang, "emptyDb")}</p>`;
    }
    this.changed.fire();
  }

  private render(open: OpenDb, threadId: string, ns: string): void {
    open.shown = { threadId, ns };
    open.panel.webview.html = renderHtml(buildReport(open.db, threadId, ns), { lang: this.lang });
  }

  setCurrent(open: OpenDb | undefined): void {
    this.current = open;
    void vscode.commands.executeCommand("setContext", "graphtrail.hasDatabase", open !== undefined);
    this.changed.fire();
  }

  /** Render one thread into the panel of the current database. */
  show(threadId: string, ns: string): void {
    const open = this.current;
    if (!open) return;
    this.render(open, threadId, ns);
  }
}

export class CheckpointEditorProvider implements vscode.CustomReadonlyEditorProvider<DbDocument> {
  private readonly extensionUri: vscode.Uri;
  private readonly registry: Registry;

  constructor(extensionUri: vscode.Uri, registry: Registry) {
    this.extensionUri = extensionUri;
    this.registry = registry;
  }

  openCustomDocument(uri: vscode.Uri): DbDocument {
    return new DbDocument(uri);
  }

  async resolveCustomEditor(document: DbDocument, panel: vscode.WebviewPanel): Promise<void> {
    panel.webview.options = { enableScripts: false };
    try {
      // The file is read once into memory; the original is never opened for writing.
      // A running app keeps its newest committed rows in "<db>-wal". Read it first, then the main file (a
      // checkpoint in between is harmless this way). Both are only read; a missing or unreadable -wal is ignored.
      let wal: Uint8Array | undefined;
      try {
        wal = await vscode.workspace.fs.readFile(document.uri.with({ path: `${document.uri.path}-wal` }));
      } catch {
        wal = undefined;
      }
      const bytes = await vscode.workspace.fs.readFile(document.uri);
      const wasm = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(this.extensionUri, "dist", "sql-wasm.wasm"));
      const db = await openCheckpointDb(bytes, wal ? { wasmBinary: wasm, wal, lang: this.registry.lang } : { wasmBinary: wasm, lang: this.registry.lang });
      const open: OpenDb = { uri: document.uri, db, panel };
      const first = db.listThreads()[0];
      this.registry.opened.add(open);
      this.registry.setCurrent(open);
      if (first) this.registry.show(first.threadId, first.ns);
      else panel.webview.html = `<p>${t(this.registry.lang, "emptyDb")}</p>`;
      panel.onDidChangeViewState((e) => {
        if (e.webviewPanel.active) this.registry.setCurrent(open);
      });
      panel.onDidDispose(() => {
        db.close();
        this.registry.opened.delete(open);
        if (this.registry.current === open) this.registry.setCurrent(undefined);
      });
    } catch (error) {
      // Show the reason (for example "not a LangGraph checkpoint database") instead of a blank editor.
      const message = error instanceof Error ? error.message : String(error);
      panel.webview.html = `<p>${t(this.registry.lang, "editorError", { text: message }).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`;
    }
  }
}
