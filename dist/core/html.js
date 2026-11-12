/**
 * Self-contained HTML report (also used by the VS Code webview).
 * Every value from the database goes through `esc`; there is no script and no external resource.
 */
import { compact, describeChanges } from "./report.js";
import { t } from "./i18n.js";
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
export function renderHtml(report, options = {}) {
    const lang = options.lang ?? "en";
    const th = report.thread;
    const rows = report.timeline
        .map((e) => {
        const interrupt = e.interrupts.length > 0 ? esc(compact(e.interrupts, 120)) : "";
        const cls = e.interrupts.length > 0 ? ' class="interrupt"' : "";
        return `<tr${cls}><td>${e.step}</td><td>${esc(e.source)}</td><td>${esc(e.nodes.join(", "))}</td><td>${esc(e.changedKeys.join(", "))}</td><td>${interrupt}</td></tr>`;
    })
        .join("\n");
    const steps = report.diffs
        .map((d) => {
        const items = describeChanges(d, lang).map((i) => `<li>${esc(i)}</li>`);
        return `<h3>${esc(t(lang, "stepRange", { from: d.from.step, to: d.to.step }))}</h3><ul>${items.join("")}</ul>`;
    })
        .join("\n");
    const head = ["colStep", "colSource", "colNodes", "colChanged", "colInterrupt"]
        .map((k) => `<th>${esc(t(lang, k))}</th>`)
        .join("");
    const ns = th.ns ? ` <span class="muted">(ns ${esc(th.ns)})</span>` : "";
    return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<title>${esc(t(lang, "htmlTitle", { thread: th.threadId }))}</title>
<style>${STYLE}</style>
</head>
<body>
<h1>${esc(t(lang, "htmlHeading", { thread: th.threadId, ns: "\u0000" })).replace("\u0000", ns)}</h1>
<p>${esc(t(lang, "htmlSummary", { status: "\u0001", writer: th.writer, n: report.timeline.length, v: report.schemaVersion })).replace("\u0001", `<b>${esc(th.status)}</b>`)}</p>
<h2>${esc(t(lang, "timelineHeading"))}</h2>
<p class="muted">${esc(t(lang, "timelineNote"))}</p>
<div id="timeline">
<table>
<tr>${head}</tr>
${rows}
</table>
</div>
<h2>${esc(t(lang, "stepsHeading"))}</h2>
<div id="steps">
${steps}
</div>
</body>
</html>
`;
}
