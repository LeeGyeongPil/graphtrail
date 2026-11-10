import assert from "node:assert/strict";
import { test } from "node:test";
import { diffStates, messageDelta, openCheckpointDb } from "../src/core/index.ts";
import { cli, fixture } from "./helpers.ts";

test("diff shows message delta and tool pairs", async () => {
  const db = await openCheckpointDb(fixture("py-agent.sqlite"));
  const d = diffStates(db.getCheckpoint("t1", { step: 0 }), db.getCheckpoint("t1", { step: 3 }));
  assert.deepEqual(d.messages.addedIds, ["m-ai-1", "m-tool-1", "m-ai-2"]);
  assert.equal(d.toolPairs.length, 1);
  assert.deepEqual(d.toolPairs[0]?.args, { a: 2, b: 3 });
  assert.equal(d.toolPairs[0]?.result, "5");
  assert.ok(d.changes.some((c) => c.key === "budget"));
  assert.ok(!d.changes.some((c) => c.key.startsWith("branch:to:")), "engine channels are hidden");
  db.close();

  const r = cli("diff", fixture("py-agent.sqlite"), "--thread", "t1", "--from", "0", "--to", "3");
  assert.equal(r.code, 0);
  assert.match(r.stdout, /added message ids: m-ai-1, m-tool-1, m-ai-2/);
  assert.match(r.stdout, /tool: add\(\{"a":2,"b":3\}\) -> 5/);
  assert.match(r.stdout, /budget/);
});

test("budget changes between consecutive steps", async () => {
  const db = await openCheckpointDb(fixture("py-agent.sqlite"));
  const d = diffStates(db.getCheckpoint("t1", { step: 2 }), db.getCheckpoint("t1", { step: 3 }));
  assert.equal(d.changes.find((c) => c.key === "budget")?.kind, "changed");
  db.close();
});

test("messageDelta works by id and reports removals", () => {
  const m = (id: string) => ({ $type: "x.AIMessage", $ext: "pydantic_v2", value: { id } });
  const d = messageDelta([m("a"), m("b")], [m("b"), m("c")]);
  assert.deepEqual(d.addedIds, ["c"]);
  assert.deepEqual(d.removedIds, ["a"]);
});

test("diff arguments are validated", () => {
  const r = cli("diff", fixture("py-agent.sqlite"), "--thread", "t1", "--from", "0");
  assert.equal(r.code, 2);
  assert.match(r.stderr, /needs --from and --to/);
});
