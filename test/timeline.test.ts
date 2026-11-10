import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { openCheckpointDb } from "../src/core/index.ts";
import { cli, fixture } from "./helpers.ts";

test("t1 timeline follows parent chain", async () => {
  const db = await openCheckpointDb(fixture("py-agent.sqlite"));
  const entries = db.timeline("t1");
  assert.deepEqual(entries.map((e) => e.step), [-1, 0, 1, 2, 3, 4]);
  assert.equal(entries[0]?.parentId, null);
  entries.slice(1).forEach((e, i) => assert.equal(e.parentId, entries[i]?.checkpointId));
  assert.deepEqual(entries.flatMap((e) => e.nodes), ["agent", "tools", "agent", "approve"]);
  assert.equal(entries[2]?.interrupts.length, 0);
  assert.equal(entries[4]?.interrupts.length, 1, "the approve step carries the interrupt");
  assert.deepEqual(entries[2]?.changedKeys, ["messages"], "the tools step only wrote messages");
  assert.equal(entries[1]?.toolCalls[0]?.name, "add");
  assert.equal(entries[2]?.toolResults[0]?.content, "5");
  db.close();

  const r = cli("timeline", fixture("py-agent.sqlite"), "--thread", "t1");
  assert.equal(r.code, 0);
  assert.match(r.stdout, /agent\s+messages/);
  assert.match(r.stdout, /__interrupt__/);
});

test("threads lists status and subgraph namespaces separately", async () => {
  const db = await openCheckpointDb(fixture("py-agent.sqlite"));
  const rows = db.listThreads();
  const status = (id: string, ns = "") => rows.find((t) => t.threadId === id && t.ns === ns)?.status;
  assert.equal(status("t1"), "done");
  assert.equal(status("t2"), "interrupted");
  assert.equal(rows.filter((t) => t.threadId === "t3").length, 2);
  assert.equal(rows.filter((t) => t.threadId === "t3" && t.ns.startsWith("sub:")).length, 1);
  db.close();

  const r = cli("threads", fixture("py-agent.sqlite"));
  assert.equal(r.code, 0);
  assert.match(r.stdout, /t1\s+\(root\)\s+6\s+4\s+done/);
  assert.match(r.stdout, /t2\s+\(root\)\s+5\s+3\s+interrupted/);
  assert.match(r.stdout, /sub:/);
});

test("subgraph namespace timeline is selectable", async () => {
  const db = await openCheckpointDb(fixture("py-agent.sqlite"));
  const ns = db.listThreads().find((t) => t.threadId === "t3" && t.ns !== "")?.ns ?? "";
  assert.deepEqual(db.timeline("t3", ns).flatMap((e) => e.nodes), ["inner_a", "inner_b"]);
  db.close();
});

test("lookup errors say what exists", async () => {
  const db = await openCheckpointDb(fixture("py-agent.sqlite"));
  assert.throws(() => db.getCheckpoint("t1", { step: 99 }), /available steps: -1, 0, 1, 2, 3, 4/);
  assert.throws(() => db.getCheckpoint("t1", { id: "zzz" }), /no checkpoint id starts with/);
  assert.throws(() => db.getCheckpoint("nope"), /no checkpoints for thread "nope"/);
  assert.equal(db.getCheckpoint("t1", { id: "1f1dcba9-9a43" }).step, -1);
  db.close();
  const r = cli("show", fixture("py-agent.sqlite"), "--thread", "nope");
  assert.equal(r.code, 2);
  assert.equal(cli("timeline", fixture("py-agent.sqlite"), "--thread", "nope").code, 2);
  assert.equal(cli("timeline", fixture("py-agent.sqlite"), "--thread", "t1", "--ns", "nope").code, 2);
});

test("a parent loop in a damaged file does not hang", async () => {
  // Two checkpoints that point at each other.
  const initSqlJs = createRequire(import.meta.url)("sql.js");
  const SQL = await initSqlJs();
  const sdb = new SQL.Database();
  sdb.run(`CREATE TABLE checkpoints (thread_id TEXT, checkpoint_ns TEXT, checkpoint_id TEXT, parent_checkpoint_id TEXT, type TEXT, checkpoint BLOB, metadata BLOB);
    CREATE TABLE writes (thread_id TEXT, checkpoint_ns TEXT, checkpoint_id TEXT, task_id TEXT, idx INTEGER, channel TEXT, type TEXT, value BLOB);
    INSERT INTO checkpoints VALUES ('t','', 'a','b','json','{}','{"step":0}'), ('t','', 'b','a','json','{}','{"step":1}');`);
  const db = await openCheckpointDb(sdb.export());
  // A pure loop has no leaf, so it is reported as empty instead of hanging.
  assert.throws(() => db.timeline("t"), /no checkpoints for thread "t"/);
  db.close();
});

test("a row's nodes and changed keys describe the same step", async () => {
  const db = await openCheckpointDb(fixture("py-agent.sqlite"));
  const rows = db.timeline("t1");
  const at = (step: number) => rows.find((r) => r.step === step)!;
  // agent (step 0) is the node that wrote plan and budget; tools (step 1) only wrote messages.
  assert.deepEqual(at(0).nodes, ["agent"]);
  assert.ok(at(0).changedKeys.includes("plan") && at(0).changedKeys.includes("budget"));
  assert.deepEqual(at(1).nodes, ["tools"]);
  assert.deepEqual(at(1).changedKeys, ["messages"]);
  assert.deepEqual(at(3).nodes, ["approve"]);
  assert.ok(at(3).changedKeys.includes("approved"));
  assert.deepEqual(at(4).changedKeys, []);
  db.close();
});
