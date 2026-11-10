import assert from "node:assert/strict";
import { test } from "node:test";
import { openCheckpointDb } from "../src/core/index.ts";
import { readFileSync } from "node:fs";
import { cli, fixture, ROOT } from "./helpers.ts";

type Tag = { $type: string; $ext: string; value: Record<string, unknown> };

test("python fixture decodes user types as tags", async () => {
  const db = await openCheckpointDb(fixture("py-agent.sqlite"));
  const cp = db.getCheckpoint("t1");
  const v = cp.channelValues as Record<string, Tag>;
  assert.equal(v.plan?.$type, "demo_types.Plan");
  assert.equal(v.plan?.$ext, "pydantic_v2");
  assert.equal(v.budget?.$ext, "ctor_kw_args");
  assert.equal(v.started?.$type, "datetime.datetime");
  assert.equal(v.run_id?.$type, "uuid.UUID");
  assert.equal(v.level?.$type, "demo_types.Level");
  const messages = cp.channelValues.messages as Tag[];
  const ai = messages.find((m) => m.value.id === "m-ai-1");
  assert.equal((ai?.value.tool_calls as { name: string }[])[0]?.name, "add");
  db.close();

  const r = cli("show", fixture("py-agent.sqlite"), "--thread", "t1", "--json");
  assert.equal(r.code, 0);
  const shown = JSON.parse(r.stdout) as { channelValues: Record<string, Tag> };
  assert.equal(shown.channelValues.plan?.$type, "demo_types.Plan");
});

test("js fixture normalizes lc envelopes", async () => {
  const db = await openCheckpointDb(fixture("js-agent.sqlite"));
  assert.equal(db.listThreads()[0]?.writer, "js");
  const messages = db.getCheckpoint("t1").channelValues.messages as Tag[];
  assert.ok(messages.length >= 4);
  for (const m of messages) assert.match(m.$type, /^langchain_core\.messages\.\w+Message$/);
  assert.deepEqual(db.timeline("t1").flatMap((e) => e.nodes), ["agent", "tools", "agent", "approve"]);
  db.close();

  const js = cli("timeline", fixture("js-agent.sqlite"), "--thread", "t1");
  const py = cli("timeline", fixture("py-agent.sqlite"), "--thread", "t1");
  assert.equal(js.code, 0);
  const nodes = (text: string) => text.split("\n").slice(1, 7).map((l) => l.split(/\s+/)[2] ?? "");
  assert.deepEqual(nodes(js.stdout), nodes(py.stdout));
  assert.match(js.stdout, /__interrupt__/);
});

test("opens from bytes with an explicit wasm binary (the editor path)", async () => {
  const bytes = readFileSync(fixture("py-agent.sqlite"));
  const wasm = readFileSync(`${ROOT}node_modules/sql.js/dist/sql-wasm.wasm`);
  const db = await openCheckpointDb(new Uint8Array(bytes), { wasmBinary: new Uint8Array(wasm) });
  assert.equal(db.listThreads().length, 4);
  db.close();
});
