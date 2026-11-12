/** Report assembly and Markdown/JSON output. All output is deterministic for a given database. */
import { isTagged } from "./decode.ts";
import { diffStates, extractToolCalls, messageId, messageKind, stable } from "./diff.ts";
import type { Report, StateDiff, ToolPair } from "./model.ts";
import type { CheckpointDb } from "./timeline.ts";
import { t } from "./i18n.ts";
import type { Lang } from "./i18n.ts";

/** Options of the text renderers. */
export interface RenderOptions {
  /** Language of titles, labels and descriptions. Default "en". Data from the database is never translated. */
  lang?: Lang;
}

/** Build the full report of one thread: timeline, latest state, and the diff of each step. */
export function buildReport(db: CheckpointDb, threadId: string, ns = ""): Report {
  const summary = db.listThreads().find((t) => t.threadId === threadId && t.ns === ns);
  const timeline = db.timeline(threadId, ns);
  const checkpoints = db.checkpoints(threadId, ns);
  const latest = db.getCheckpoint(threadId, {}, ns);
  const diffs: StateDiff[] = [];
  for (let i = 1; i < checkpoints.length; i++) {
    const a = checkpoints[i - 1];
    const b = checkpoints[i];
    if (a && b) diffs.push(diffStates(a, b));
  }
  return {
    schemaVersion: 1,
    thread: {
      threadId,
      ns,
      status: summary?.status ?? "pending",
      writer: summary?.writer ?? "unknown",
    },
    timeline,
    latest,
    diffs,
  };
}

export function renderJson(report: Report): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

/** One-line preview of any decoded value. Strings are cut at `max` characters. */
export function compact(value: unknown, max = 120): string {
  const text = typeof value === "string" ? value : stable(value);
  const flat = text.replace(/\s+/g, " ");
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** `AIMessage m-ai-1 "text" -> add({...})` style summary of a decoded message. */
export function describeMessage(message: unknown): string {
  const kind = messageKind(message) ?? (isTagged(message) ? message.$type : "value");
  const id = messageId(message);
  const fields =
    isTagged(message) && message.value !== null && typeof message.value === "object"
      ? (message.value as Record<string, unknown>)
      : {};
  const content = fields.content === undefined || fields.content === "" ? "" : ` ${compact(fields.content, 80)}`;
  const calls = extractToolCalls(message)
    .map((c) => `${c.name}(${compact(c.args, 60)})`)
    .join(", ");
  return `${kind}${id ? ` ${id}` : ""}${content}${calls ? ` -> ${calls}` : ""}`;
}

export function describePair(pair: ToolPair): string {
  return `${pair.name}(${compact(pair.args, 60)}) -> ${compact(pair.result, 60)}`;
}

/** The change lines shared by the Markdown and HTML renderers. */
export function describeChanges(d: StateDiff, lang: Lang = "en"): string[] {
  const items: string[] = [];
  for (const c of d.changes) {
    if (c.key === "messages") continue;
    const detail =
      c.kind === "added"
        ? compact(c.after)
        : c.kind === "removed"
          ? compact(c.before)
          : `${compact(c.before)} -> ${compact(c.after)}`;
    const kind = t(lang, c.kind === "added" ? "kindAdded" : c.kind === "removed" ? "kindRemoved" : "kindChanged");
    items.push(t(lang, "changeLine", { kind, key: c.key, detail }));
  }
  for (const m of d.messages.added) items.push(t(lang, "messageLine", { text: describeMessage(m) }));
  for (const p of d.toolPairs) items.push(t(lang, "toolLine", { text: describePair(p) }));
  if (items.length === 0) items.push(t(lang, "noChange"));
  return items;
}

function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function renderMarkdown(report: Report, options: RenderOptions = {}): string {
  const lang = options.lang ?? "en";
  const th = report.thread;
  const lines: string[] = [];
  const ns = th.ns ? ` (ns ${th.ns})` : "";
  lines.push(`# ${t(lang, "mdTitle", { thread: th.threadId, ns })}`, "");
  lines.push(`- ${t(lang, "mdSchema", { v: report.schemaVersion })}`);
  lines.push(`- ${t(lang, "mdStatus", { status: th.status })}`);
  lines.push(`- ${t(lang, "mdWriter", { writer: th.writer })}`);
  lines.push(`- ${t(lang, "mdCheckpoints", { n: report.timeline.length })}`, "");
  lines.push(`## ${t(lang, "timelineHeading")}`, "");
  lines.push(t(lang, "timelineNote"), "");
  const head = [t(lang, "colStep"), t(lang, "colSource"), t(lang, "colNodes"), t(lang, "colChanged"), t(lang, "colInterrupt")];
  lines.push(`| ${head.join(" | ")} |`, "|---|---|---|---|---|");
  for (const e of report.timeline) {
    const interrupt = e.interrupts.length > 0 ? cell(compact(e.interrupts, 80)) : "";
    lines.push(
      `| ${e.step} | ${e.source} | ${cell(e.nodes.join(", "))} | ${cell(e.changedKeys.join(", "))} | ${interrupt} |`,
    );
  }
  lines.push("", `## ${t(lang, "stepsHeading")}`, "");
  for (const d of report.diffs) {
    lines.push(`### ${t(lang, "stepRange", { from: d.from.step, to: d.to.step })}`, "");
    for (const item of describeChanges(d, lang)) lines.push(`- ${item}`);
    lines.push("");
  }
  const failed = report.timeline.filter((e) => e.errors.length > 0);
  if (failed.length > 0) {
    lines.push(`## ${t(lang, "errorsHeading")}`, "");
    for (const e of failed) lines.push(`- ${t(lang, "errorLine", { step: e.step, text: compact(e.errors, 160) })}`);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}
