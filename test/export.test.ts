import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildReport, openCheckpointDb, renderHtml, renderJson, renderMarkdown } from "../src/core/index.ts";
import type { Report } from "../src/core/index.ts";
import { cli, fixture } from "./helpers.ts";

test("md and json match golden", async () => {
  const db = await openCheckpointDb(fixture("py-agent.sqlite"));
  const report = buildReport(db, "t1");
  assert.equal(report.schemaVersion, 1);
  assert.equal(renderMarkdown(report), readFileSync(fixture("golden/t1.md"), "utf8"));
  assert.equal(renderJson(report), readFileSync(fixture("golden/t1.json"), "utf8"));
  db.close();
  // The CLI prints the same bytes, and two runs are identical (deterministic).
  const a = cli("export", fixture("py-agent.sqlite"), "--thread", "t1", "--format", "md");
  const b = cli("export", fixture("py-agent.sqlite"), "--thread", "t1", "--format", "md");
  assert.equal(a.stdout, readFileSync(fixture("golden/t1.md"), "utf8"));
  assert.equal(a.stdout, b.stdout);
});

test("html escapes state content", async () => {
  const db = await openCheckpointDb(fixture("py-agent.sqlite"));
  const report: Report = structuredClone(buildReport(db, "t1"));
  db.close();
  report.thread.threadId = "<script>alert(1)</script>";
  const first = report.timeline[0];
  const second = report.timeline[1];
  if (!first || !second) throw new Error("fixture has no timeline");
  first.source = '"><img src=x onerror=alert(1)>';
  second.changedKeys = ["<script>x</script>"];
  const html = renderHtml(report);
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(!html.includes("<script"));
  assert.ok(!html.includes("<img"));
  assert.match(html, /<meta http-equiv="Content-Security-Policy" content="default-src 'none'/);
  assert.ok(!/https?:\/\//.test(html), "no external URLs");
  assert.ok(html.includes('id="timeline"'));
});

test("export validates --format", () => {
  const r = cli("export", fixture("py-agent.sqlite"), "--thread", "t1", "--format", "pdf");
  assert.equal(r.code, 2);
  assert.match(r.stderr, /--format must be json, md or html/);
});
