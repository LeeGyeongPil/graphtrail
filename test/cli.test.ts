import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
const require = createRequire(import.meta.url);
import { cli, cliEnv, fixture, ROOT } from "./helpers.ts";

const pkg = JSON.parse(readFileSync(`${ROOT}package.json`, "utf8")) as {
  version: string;
  scripts: Record<string, string>;
  bin: Record<string, string>;
  files: string[];
  dependencies: Record<string, string>;
};

test("package has no install-time build", () => {
  for (const hook of ["prepare", "prepack", "postinstall", "preinstall", "install"]) {
    assert.equal(pkg.scripts[hook], undefined, `scripts.${hook} must not exist`);
  }
  assert.equal(pkg.bin.graphtrail, "dist/cli.js");
  assert.ok(pkg.files.includes("dist"));
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ["@msgpack/msgpack", "sql.js"]);
});

test("committed dist is executable and has a shebang", () => {
  const text = readFileSync(`${ROOT}dist/cli.js`, "utf8");
  assert.ok(text.startsWith("#!/usr/bin/env node"));
  assert.ok((statSync(`${ROOT}dist/cli.js`).mode & 0o111) !== 0);
});

test("--version and --help", () => {
  const v = cli("--version");
  assert.equal(v.code, 0);
  assert.equal(v.stdout.trim(), pkg.version);
  const h = cli("--help");
  assert.equal(h.code, 0);
  assert.match(h.stdout, /graphtrail threads/);
  assert.equal(cli().code, 2);
});

test("branch warning is printed once by timeline, show, diff and export", async () => {
  // Fork t1: add a checkpoint whose parent is step 1, like time travel or update_state would.
  const initSqlJs = require("sql.js");
  const SQL = await initSqlJs();
  const sdb = new SQL.Database(readFileSync(fixture("py-agent.sqlite")));
  const parent = "1f1dcba9-9a4c-68b4-8001-522b7aa2e261";
  sdb.run(
    `INSERT INTO checkpoints (thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, type, checkpoint, metadata)
     SELECT thread_id, checkpoint_ns, '1f1dcba9-9a54-6f3c-8004-3ffbe48dffff', ?, type, checkpoint, metadata
     FROM checkpoints WHERE thread_id = 't1' AND checkpoint_ns = '' AND checkpoint_id = ?`,
    [parent, parent],
  );
  const dir = mkdtempSync(join(tmpdir(), "graphtrail-fork-"));
  try {
    const file = join(dir, "fork.sqlite");
    writeFileSync(file, Buffer.from(sdb.export()));
    const expected = 'warning: thread "t1" has 2 branches (fork or update_state); showing the chain of the newest one\n';
    const commands: string[][] = [
      ["timeline", file, "--thread", "t1"],
      ["timeline", file, "--thread", "t1", "--json"],
      ["show", file, "--thread", "t1"],
      ["diff", file, "--thread", "t1", "--from", "0", "--to", "1"],
      ["export", file, "--thread", "t1", "--format", "md"],
    ];
    for (const args of commands) {
      const r = cli(...args);
      assert.equal(r.code, 0, args.join(" "));
      assert.equal(r.stderr, expected, args.join(" "));
    }
    // stdout stays clean: --json output is still valid JSON.
    JSON.parse(cli("timeline", file, "--thread", "t1", "--json").stdout);
    // Korean display language uses the Korean message.
    const ko = cliEnv({ GRAPHTRAIL_LANG: "ko" }, "timeline", file, "--thread", "t1");
    assert.match(ko.stderr, /t1/);
    assert.notEqual(ko.stderr, expected);
    assert.equal(ko.stderr.split("\n").filter(Boolean).length, 1);
    // A file without a fork prints no warning.
    assert.equal(cli("timeline", fixture("py-agent.sqlite"), "--thread", "t1").stderr, "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
