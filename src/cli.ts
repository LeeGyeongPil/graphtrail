#!/usr/bin/env node
/** graphtrail command line: threads | timeline | show | diff | export. Read-only, offline, runs no code from the database. */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { describeChanges, compact, buildReport, renderHtml, renderJson, renderMarkdown, diffStates, openCheckpointDb } from "./core/index.ts";
import type { CheckpointDb, DecodedCheckpoint } from "./core/index.ts";
import { NotCheckpointDbError, NotFoundError } from "./core/index.ts";

const HELP = `graphtrail - read LangGraph SqliteSaver checkpoint databases without running any code

Usage:
  graphtrail threads  <db> [--json]
  graphtrail timeline <db> [--thread ID] [--ns NS] [--json]
  graphtrail show     <db> [--thread ID] [--ns NS] [--step N | --id PREFIX] [--json]
  graphtrail diff     <db> [--thread ID] [--ns NS] --from STEP --to STEP [--json]
  graphtrail export   <db> [--thread ID] [--ns NS] --format json|md|html

Options:
  --thread ID   thread to read (optional when the database has exactly one thread)
  --ns NS       subgraph checkpoint namespace (default: root graph)
  --version     print the version
  --help        print this help

Exit codes: 0 ok, 2 not a LangGraph checkpoint database or invalid arguments, 1 other errors.
`;

/** An error caused by the user's input; printed without a stack trace and exits with code 2. */
class UsageError extends Error {
  override name = "UsageError";
}

function version(): string {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
  return pkg.version;
}

function table(rows: string[][]): string {
  const widths = rows[0]?.map((_, col) => Math.max(...rows.map((r) => (r[col] ?? "").length))) ?? [];
  return rows.map((r) => r.map((c, i) => (i === r.length - 1 ? c : c.padEnd(widths[i] ?? 0))).join("  ").trimEnd()).join("\n");
}

/** Pick the thread: explicit, or the only root thread of the file. */
function pickThread(db: CheckpointDb, thread: string | undefined): string {
  if (thread !== undefined) return thread;
  const ids = [...new Set(db.listThreads().map((t) => t.threadId))];
  if (ids.length === 1 && ids[0] !== undefined) return ids[0];
  throw new UsageError(`--thread is required; this database has ${ids.length} threads: ${ids.join(", ")}`);
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
    `thread ${cp.threadId}${cp.ns ? ` (ns ${cp.ns})` : ""}  step ${cp.step}  source ${cp.source}`,
    `checkpoint ${cp.checkpointId}`,
    `parent     ${cp.parentId ?? "-"}`,
    `ts         ${cp.ts ?? "-"}`,
    "",
    "state:",
  ];
  for (const [key, value] of Object.entries(cp.channelValues)) lines.push(`  ${key}: ${compact(value, 160)}`);
  lines.push("", `(use --json for the full tagged state; ${cp.writes.length} writes recorded after this checkpoint)`);
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
      json: { type: "boolean", default: false },
      version: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.version) {
    process.stdout.write(`${version()}\n`);
    return 0;
  }
  const [command, dbPath] = positionals;
  if (values.help || command === undefined) {
    process.stdout.write(HELP);
    return values.help ? 0 : 2;
  }
  if (!["threads", "timeline", "show", "diff", "export"].includes(command)) {
    throw new UsageError(`unknown command "${command}"; run "graphtrail --help"`);
  }
  if (dbPath === undefined) throw new UsageError(`missing database path; usage: graphtrail ${command} <db>`);

  const db = await openCheckpointDb(dbPath);
  try {
    for (const w of db.warnings) process.stderr.write(`warning: ${w}\n`);
    const ns = values.ns ?? "";

    if (command === "threads") {
      const threads = db.listThreads();
      if (values.json) printJson(threads);
      else {
        const rows = [["thread", "ns", "checkpoints", "last step", "status", "writer"]];
        for (const t of threads) rows.push([t.threadId, t.ns || "(root)", String(t.checkpoints), String(t.lastStep), t.status, t.writer]);
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
      const rows = [["step", "source", "nodes (estimated)", "changed keys"]];
      for (const e of entries) rows.push([String(e.step), e.source, e.nodes.join(", ") || "-", e.changedKeys.join(", ") || "-"]);
      process.stdout.write(`${table(rows)}\n`);
      for (const e of entries) {
        for (const call of e.toolCalls) process.stdout.write(`  step ${e.step}: tool call ${call.name}(${compact(call.args, 60)})\n`);
        for (const r of e.toolResults) process.stdout.write(`  step ${e.step}: tool result ${compact(r.content, 60)}\n`);
        if (e.interrupts.length > 0) process.stdout.write(`  step ${e.step}: __interrupt__ ${compact(e.interrupts, 100)}\n`);
        if (e.errors.length > 0) process.stdout.write(`  step ${e.step}: __error__ ${compact(e.errors, 100)}\n`);
      }
      return 0;
    }

    if (command === "show") {
      if (values.step !== undefined && !/^-?\d+$/.test(values.step)) throw new UsageError(`--step must be an integer, got "${values.step}"`);
      const sel = values.id !== undefined ? { id: values.id } : values.step !== undefined ? { step: Number(values.step) } : {};
      const cp = db.getCheckpoint(threadId, sel, ns);
      if (values.json) printJson(cp);
      else process.stdout.write(`${showText(cp)}\n`);
      return 0;
    }

    if (command === "diff") {
      if (values.from === undefined || values.to === undefined) throw new UsageError("diff needs --from and --to (step numbers or checkpoint id prefixes)");
      const d = diffStates(db.getCheckpoint(threadId, selector(values.from), ns), db.getCheckpoint(threadId, selector(values.to), ns));
      if (values.json) printJson(d);
      else {
        process.stdout.write(`step ${d.from.step} -> step ${d.to.step}\n`);
        if (d.messages.addedIds.length > 0) process.stdout.write(`added message ids: ${d.messages.addedIds.join(", ")}\n`);
        if (d.messages.removedIds.length > 0) process.stdout.write(`removed message ids: ${d.messages.removedIds.join(", ")}\n`);
        for (const item of describeChanges(d)) process.stdout.write(`  ${item}\n`);
      }
      return 0;
    }

    // export
    const format = values.format ?? "";
    if (!["json", "md", "html"].includes(format)) throw new UsageError(`--format must be json, md or html, got "${format}"`);
    const report = buildReport(db, threadId, ns);
    process.stdout.write(format === "json" ? renderJson(report) : format === "md" ? renderMarkdown(report) : renderHtml(report));
    return 0;
  } finally {
    db.close();
  }
}

try {
  process.exitCode = await run(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const known = error instanceof NotCheckpointDbError || error instanceof NotFoundError || error instanceof UsageError;
  const isArgError = error instanceof Error && "code" in error && String((error as { code: unknown }).code).startsWith("ERR_PARSE_ARGS");
  process.stderr.write(`graphtrail: ${message}\n`);
  process.exitCode = known || isArgError ? 2 : 1;
}
