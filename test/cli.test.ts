import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";
import { cli, ROOT } from "./helpers.ts";

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
