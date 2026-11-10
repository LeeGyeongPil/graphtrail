/** Report assembly and Markdown/JSON output. All output is deterministic for a given database. */
import { isTagged } from "./decode.js";
import { diffStates, extractToolCalls, messageId, messageKind, stable } from "./diff.js";
/** Build the full report of one thread: timeline, latest state, and the diff of each step. */
export function buildReport(db, threadId, ns = "") {
    const summary = db.listThreads().find((t) => t.threadId === threadId && t.ns === ns);
    const timeline = db.timeline(threadId, ns);
    const checkpoints = db.checkpoints(threadId, ns);
    const latest = db.getCheckpoint(threadId, {}, ns);
    const diffs = [];
    for (let i = 1; i < checkpoints.length; i++) {
        const a = checkpoints[i - 1];
        const b = checkpoints[i];
        if (a && b)
            diffs.push(diffStates(a, b));
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
export function renderJson(report) {
    return `${JSON.stringify(report, null, 2)}\n`;
}
/** One-line preview of any decoded value. Strings are cut at `max` characters. */
export function compact(value, max = 120) {
    const text = typeof value === "string" ? value : stable(value);
    const flat = text.replace(/\s+/g, " ");
    return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
/** `AIMessage m-ai-1 "text" -> add({...})` style summary of a decoded message. */
export function describeMessage(message) {
    const kind = messageKind(message) ?? (isTagged(message) ? message.$type : "value");
    const id = messageId(message);
    const fields = isTagged(message) && message.value !== null && typeof message.value === "object"
        ? message.value
        : {};
    const content = fields.content === undefined || fields.content === "" ? "" : ` ${compact(fields.content, 80)}`;
    const calls = extractToolCalls(message)
        .map((c) => `${c.name}(${compact(c.args, 60)})`)
        .join(", ");
    return `${kind}${id ? ` ${id}` : ""}${content}${calls ? ` -> ${calls}` : ""}`;
}
export function describePair(pair) {
    return `${pair.name}(${compact(pair.args, 60)}) -> ${compact(pair.result, 60)}`;
}
/** The change lines shared by the Markdown and HTML renderers. */
export function describeChanges(d) {
    const items = [];
    for (const c of d.changes) {
        if (c.key === "messages")
            continue;
        const detail = c.kind === "added"
            ? compact(c.after)
            : c.kind === "removed"
                ? compact(c.before)
                : `${compact(c.before)} -> ${compact(c.after)}`;
        items.push(`${c.kind} ${c.key}: ${detail}`);
    }
    for (const m of d.messages.added)
        items.push(`message: ${describeMessage(m)}`);
    for (const p of d.toolPairs)
        items.push(`tool: ${describePair(p)}`);
    if (items.length === 0)
        items.push("no state change");
    return items;
}
function cell(text) {
    return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
export function renderMarkdown(report) {
    const t = report.thread;
    const lines = [];
    lines.push(`# graphtrail report: thread ${t.threadId}${t.ns ? ` (ns ${t.ns})` : ""}`, "");
    lines.push(`- schema version: ${report.schemaVersion}`);
    lines.push(`- status: ${t.status}`);
    lines.push(`- written by: ${t.writer}`);
    lines.push(`- checkpoints: ${report.timeline.length}`, "");
    lines.push("## Timeline", "");
    lines.push("Each row is the step that runs from that checkpoint: nodes are estimated from versions_seen (the database does not store node names), changed keys are the state difference that step produced.", "");
    lines.push("| step | source | nodes (estimated) | changed keys | interrupt |", "|---|---|---|---|---|");
    for (const e of report.timeline) {
        const interrupt = e.interrupts.length > 0 ? cell(compact(e.interrupts, 80)) : "";
        lines.push(`| ${e.step} | ${e.source} | ${cell(e.nodes.join(", "))} | ${cell(e.changedKeys.join(", "))} | ${interrupt} |`);
    }
    lines.push("", "## Steps", "");
    for (const d of report.diffs) {
        lines.push(`### step ${d.from.step} -> ${d.to.step}`, "");
        for (const item of describeChanges(d))
            lines.push(`- ${item}`);
        lines.push("");
    }
    const failed = report.timeline.filter((e) => e.errors.length > 0);
    if (failed.length > 0) {
        lines.push("## Errors", "");
        for (const e of failed)
            lines.push(`- step ${e.step}: ${compact(e.errors, 160)}`);
        lines.push("");
    }
    return `${lines.join("\n")}\n`;
}
