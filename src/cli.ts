#!/usr/bin/env node
/** graphtrail command line: threads | timeline | show | diff | export. Read-only, offline, runs no code from the database. */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { describeChanges, compact, buildReport, renderHtml, renderJson, renderMarkdown, diffStates, openCheckpointDb } from "./core/index.ts";
import type { CheckpointDb, DecodedCheckpoint } from "./core/index.ts";
import { NotCheckpointDbError, NotFoundError } from "./core/index.ts";
import { langFromEnv, LANGS, t } from "./core/i18n.ts";
import type { Lang } from "./core/i18n.ts";

/** The display language; set once at startup from --lang / GRAPHTRAIL_LANG / LC_ALL / LC_MESSAGES / LANG. */
let lang: Lang = "en";

/** Read `--lang x` or `--lang=x` from argv before parseArgs, so parseArgs errors are localized too. */
function langFlag(argv: string[]): string | undefined {
  let found: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? "";
    if (a === "--") break;
    if (a === "--lang") found = argv[i + 1] ?? "";
    else if (a.startsWith("--lang=")) found = a.slice("--lang=".length);
  }
  return found;
}

/** An error caused by the user's input; printed without a stack trace and exits with code 2. */
class UsageError extends Error {
  override name = "UsageError";
}

function version(): string {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
  return pkg.version;
}

/** Terminal columns of a text: Hangul syllables and other full-width characters take two. */
function cols(text: string): number {
  let n = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    n += (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xff00 && c <= 0xff60) ? 2 : 1;
  }
  return n;
}

function table(rows: string[][]): string {
  const widths = rows[0]?.map((_, col) => Math.max(...rows.map((r) => cols(r[col] ?? "")))) ?? [];
  const pad = (c: string, w: number): string => c + " ".repeat(Math.max(0, w - cols(c)));
  return rows.map((r) => r.map((c, i) => (i === r.length - 1 ? c : pad(c, widths[i] ?? 0))).join("  ").trimEnd()).join("\n");
}

/** Pick the thread: explicit, or the only root thread of the file. */
function pickThread(db: CheckpointDb, thread: string | undefined): string {
  if (thread !== undefined) return thread;
  const ids = [...new Set(db.listThreads().map((t) => t.threadId))];
  if (ids.length === 1 && ids[0] !== undefined) return ids[0];
  throw new UsageError(t(lang, "threadRequired", { n: ids.length, ids: ids.join(", ") }));
}

/** `--from`/`--to` accept a step number or a checkpoint id prefix. */
function selector(text: string): { step?: number; id?: string } {
  return /^-?\d+$/.test(text) ? { step: Number(text) } : { id: text };
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function showText(cp: DecodedCheckpoint): string {
  const lines = [
    t(lang, "showHead", { thread: cp.threadId, ns: cp.ns ? ` (ns ${cp.ns})` : "", step: cp.step, source: cp.source }),
    t(lang, "showCheckpoint", { value: cp.checkpointId }),
    t(lang, "showParent", { value: cp.parentId ?? "-" }),
    t(lang, "showTs", { value: cp.ts ?? "-" }),
    "",
    t(lang, "showState"),
  ];
  for (const [key, value] of Object.entries(cp.channelValues)) lines.push(`  ${key}: ${compact(value, 160)}`);
  lines.push("", t(lang, "showHint", { n: cp.writes.length }));
  return lines.join("\n");
}

async function run(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      thread: { type: "string" },
      ns: { type: "string", default: "" },
      step: { type: "string" },
      id: { type: "string" },
      from: { type: "string" },
      to: { type: "string" },
      format: { type: "string" },
      lang: { type: "string" },
      json: { type: "boolean", default: false },
      version: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.lang !== undefined && !(LANGS as readonly string[]).includes(values.lang)) {
    throw new UsageError(t(lang, "langInvalid", { value: values.lang }));
  }
  if (values.version) {
    process.stdout.write(`${version()}\n`);
    return 0;
  }
  const [command, dbPath] = positionals;
  if (values.help || command === undefined) {
    process.stdout.write(t(lang, "help"));
    return values.help ? 0 : 2;
  }
  if (!["threads", "timeline", "show", "diff", "export"].includes(command)) {
    throw new UsageError(t(lang, "unknownCommand", { command }));
  }
  if (dbPath === undefined) throw new UsageError(t(lang, "missingPath", { command }));

  const db = await openCheckpointDb(dbPath, { lang });
  try {
    for (const w of db.warnings) process.stderr.write(`${t(lang, "warningPrefix")}${w}\n`);
    const ns = values.ns ?? "";

    if (command === "threads") {
      const threads = db.listThreads();
      if (values.json) printJson(threads);
      else {
        const rows = [(["colThread", "colNs", "colCheckpointCount", "colLastStep", "colStatus", "colWriter"] as const).map((k) => t(lang, k))];
        for (const th of threads) rows.push([th.threadId, th.ns || t(lang, "rootNs"), String(th.checkpoints), String(th.lastStep), th.status, th.writer]);
        process.stdout.write(`${table(rows)}\n`);
      }
      return 0;
    }

    const threadId = pickThread(db, values.thread);

    if (command === "timeline") {
      const entries = db.timeline(threadId, ns);
      if (values.json) {
        printJson(entries);
        return 0;
      }
      const rows = [(["colStep", "colSource", "colNodes", "colChanged"] as const).map((k) => t(lang, k))];
      for (const e of entries) rows.push([String(e.step), e.source, e.nodes.join(", ") || "-", e.changedKeys.join(", ") || "-"]);
      process.stdout.write(`${table(rows)}\n`);
      for (const e of entries) {
        for (const call of e.toolCalls) process.stdout.write(`${t(lang, "toolCallLine", { step: e.step, name: call.name, args: compact(call.args, 60) })}\n`);
        for (const r of e.toolResults) process.stdout.write(`${t(lang, "toolResultLine", { step: e.step, text: compact(r.content, 60) })}\n`);
        if (e.interrupts.length > 0) process.stdout.write(`${t(lang, "interruptLine", { step: e.step, text: compact(e.interrupts, 100) })}\n`);
        if (e.errors.length > 0) process.stdout.write(`${t(lang, "errorStepLine", { step: e.step, text: compact(e.errors, 100) })}\n`);
      }
      return 0;
    }

    if (command === "show") {
      if (values.step !== undefined && !/^-?\d+$/.test(values.step)) throw new UsageError(t(lang, "stepInteger", { value: values.step }));
      const sel = values.id !== undefined ? { id: values.id } : values.step !== undefined ? { step: Number(values.step) } : {};
      const cp = db.getCheckpoint(threadId, sel, ns);
      if (values.json) printJson(cp);
      else process.stdout.write(`${showText(cp)}\n`);
      return 0;
    }

    if (command === "diff") {
      if (values.from === undefined || values.to === undefined) throw new UsageError(t(lang, "diffNeeds"));
      const d = diffStates(db.getCheckpoint(threadId, selector(values.from), ns), db.getCheckpoint(threadId, selector(values.to), ns));
      if (values.json) printJson(d);
      else {
        process.stdout.write(`${t(lang, "diffHead", { from: d.from.step, to: d.to.step })}\n`);
        if (d.messages.addedIds.length > 0) process.stdout.write(`${t(lang, "diffAddedIds", { ids: d.messages.addedIds.join(", ") })}\n`);
        if (d.messages.removedIds.length > 0) process.stdout.write(`${t(lang, "diffRemovedIds", { ids: d.messages.removedIds.join(", ") })}\n`);
        for (const item of describeChanges(d, lang)) process.stdout.write(`  ${item}\n`);
      }
      return 0;
    }

    // export
    const format = values.format ?? "";
    if (!["json", "md", "html"].includes(format)) throw new UsageError(t(lang, "formatInvalid", { value: format }));
    const report = buildReport(db, threadId, ns);
    process.stdout.write(format === "json" ? renderJson(report) : format === "md" ? renderMarkdown(report, { lang }) : renderHtml(report, { lang }));
    return 0;
  } finally {
    db.close();
  }
}

/** Localize the three parseArgs error codes; unknown codes keep the original text. */
function argErrorMessage(error: Error & { code: string }): string {
  const key = { ERR_PARSE_ARGS_UNKNOWN_OPTION: "parseUnknownOption", ERR_PARSE_ARGS_INVALID_OPTION_VALUE: "parseInvalidValue", ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL: "parseUnexpectedPositional" }[error.code];
  if (key === undefined) return error.message;
  const option = /'([^']+)'/.exec(error.message)?.[1]?.replace(/ <value>$/, "") ?? "";
  return t(lang, key as "parseUnknownOption", { raw: error.message, option });
}

try {
  lang = langFromEnv(process.env, undefined);
  const flag = langFlag(process.argv.slice(2));
  // A valid --lang wins over the environment; an invalid one is reported by run() in the environment language.
  if (flag !== undefined && (LANGS as readonly string[]).includes(flag)) lang = flag as Lang;
  process.exitCode = await run(process.argv.slice(2));
} catch (error) {
  const isArgError = error instanceof Error && "code" in error && String((error as { code: unknown }).code).startsWith("ERR_PARSE_ARGS");
  const message = isArgError ? argErrorMessage(error as Error & { code: string }) : error instanceof Error ? error.message : String(error);
  const known = error instanceof NotCheckpointDbError || error instanceof NotFoundError || error instanceof UsageError;
  process.stderr.write(`graphtrail: ${message}\n`);
  process.exitCode = known || isArgError ? 2 : 1;
}
