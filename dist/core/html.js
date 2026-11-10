/**
 * Self-contained HTML report (also used by the VS Code webview).
 * Every value from the database goes through `esc`; there is no script and no external resource.
 */
import { compact, describeChanges } from "./report.js";
export function esc(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";
const STYLE = `
body{font:14px/1.5 system-ui,sans-serif;margin:1.5rem;color:#222;background:#fff}
table{border-collapse:collapse;width:100%}
th,td{border:1px solid #ccc;padding:.3rem .5rem;text-align:left;vertical-align:top}
th{background:#f3f3f3}
code,pre{font:12px ui-monospace,monospace}
.interrupt{background:#fff4d6}
.muted{color:#666}
`;
export function renderHtml(report) {
    const t = report.thread;
    const rows = report.timeline
        .map((e) => {
        const interrupt = e.interrupts.length > 0 ? esc(compact(e.interrupts, 120)) : "";
        const cls = e.interrupts.length > 0 ? ' class="interrupt"' : "";
        return `<tr${cls}><td>${e.step}</td><td>${esc(e.source)}</td><td>${esc(e.nodes.join(", "))}</td><td>${esc(e.changedKeys.join(", "))}</td><td>${interrupt}</td></tr>`;
    })
        .join("\n");
    const steps = report.diffs
        .map((d) => {
        const items = describeChanges(d).map((i) => `<li>${esc(i)}</li>`);
        return `<h3>step ${d.from.step} -&gt; ${d.to.step}</h3><ul>${items.join("")}</ul>`;
    })
        .join("\n");
    const ns = t.ns ? ` <span class="muted">(ns ${esc(t.ns)})</span>` : "";
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<title>graphtrail: ${esc(t.threadId)}</title>
<style>${STYLE}</style>
</head>
<body>
<h1>graphtrail: thread ${esc(t.threadId)}${ns}</h1>
<p>status <b>${esc(t.status)}</b>, written by ${esc(t.writer)}, ${report.timeline.length} checkpoints, schema ${report.schemaVersion}</p>
<h2>Timeline</h2>
<p class="muted">Each row is the step that runs from that checkpoint: nodes are estimated from versions_seen (the database does not store node names), changed keys are the state difference that step produced.</p>
<div id="timeline">
<table>
<tr><th>step</th><th>source</th><th>nodes (estimated)</th><th>changed keys</th><th>interrupt</th></tr>
${rows}
</table>
</div>
<h2>Steps</h2>
<div id="steps">
${steps}
</div>
</body>
</html>
`;
}
