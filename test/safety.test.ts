import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { cli, fixture, ROOT } from "./helpers.ts";

const sha = (path: string): string => createHash("sha256").update(readFileSync(path)).digest("hex");

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (name === "node_modules" || name === "dist") return [];
    return statSync(full).isDirectory() ? sourceFiles(full) : /\.(ts|mjs)$/.test(name) ? [full] : [];
  });
}

test("db file unchanged", () => {
  const files = ["py-agent.sqlite", "js-agent.sqlite", "not-langgraph.sqlite"].map(fixture);
  const before = files.map(sha);
  for (const f of files.slice(0, 2)) {
    cli("threads", f);
    cli("timeline", f, "--thread", "t1");
    cli("show", f, "--thread", "t1", "--json");
    cli("diff", f, "--thread", "t1", "--from", "0", "--to", "3");
    cli("export", f, "--thread", "t1", "--format", "html");
  }
  cli("threads", fixture("not-langgraph.sqlite"));
  assert.deepEqual(files.map(sha), before);
});

test("no code execution primitives in src", () => {
  const banned = [
    /child_process/,
    /\beval\s*\(/,
    /new Function\b/,
    /\bfetch\s*\(/,
    /node:https?/,
    /node:net/,
    /node:dgram/,
    /XMLHttpRequest/,
    /WebSocket/,
    /node:vm/,
    /worker_threads/,
  ];
  const files = [...sourceFiles(join(ROOT, "src")), ...sourceFiles(join(ROOT, "vscode", "src"))];
  assert.ok(files.length > 5);
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const pattern of banned) assert.ok(!pattern.test(text), `${file} contains ${pattern}`);
  }
});

test("fixtures contain no absolute paths", () => {
  for (const name of ["py-agent.sqlite", "js-agent.sqlite", "not-langgraph.sqlite", "golden/t1.md", "golden/t1.json"]) {
    const text = readFileSync(fixture(name)).toString("latin1");
    for (const needle of ["/Us" + "ers/", "/ho" + "me/", "C:\\", "/pri" + "vate/"]) {
      assert.ok(!text.includes(needle), `${name} contains ${needle}`);
    }
  }
});

test("non-LangGraph database is rejected with exit code 2", () => {
  const r = cli("threads", fixture("not-langgraph.sqlite"));
  assert.equal(r.code, 2);
  assert.match(r.stderr, /not a LangGraph checkpoint database \(missing table: checkpoints\)/);
});

test("other bad inputs are rejected clearly", () => {
  assert.equal(cli("threads", fixture("golden/t1.md")).code, 2); // not SQLite at all
  assert.match(cli("threads", `${ROOT}missing.sqlite`).stderr, /cannot read database file/);
  assert.equal(cli("nonsense", fixture("py-agent.sqlite")).code, 2);
  assert.equal(cli("timeline", fixture("py-agent.sqlite")).code, 2); // several threads, --thread missing
  assert.equal(cli("timeline", fixture("py-agent.sqlite"), "--bogus").code, 2);
});
