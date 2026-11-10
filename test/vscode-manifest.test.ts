import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { ROOT } from "./helpers.ts";

type Manifest = {
  version: string;
  main: string;
  contributes: {
    customEditors: { viewType: string; priority: string; selector: { filenamePattern: string }[] }[];
    views: Record<string, { id: string }[]>;
    commands: { command: string }[];
  };
};
const manifest = JSON.parse(readFileSync(`${ROOT}vscode/package.json`, "utf8")) as Manifest;

test("manifest declares readonly custom editor and tree view", () => {
  const editor = manifest.contributes.customEditors[0];
  assert.equal(editor?.viewType, "graphtrail.checkpointDb");
  const patterns = editor?.selector.map((s) => s.filenamePattern) ?? [];
  assert.ok(patterns.includes("*.sqlite") && patterns.includes("*.db"));
  assert.equal(editor?.priority, "option", "must not hijack every .db file");
  assert.equal(manifest.contributes.views.explorer?.[0]?.id, "graphtrail.threads");
  assert.ok(manifest.contributes.commands.some((c) => c.command === "graphtrail.openDatabase"));
});

test("extension version matches the package", () => {
  const root = JSON.parse(readFileSync(`${ROOT}package.json`, "utf8")) as { version: string };
  assert.equal(manifest.version, root.version);
});

test("npm run vsix builds a package that bundles the wasm", () => {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const run = spawnSync(npm, ["run", "vsix"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  const vsix = `${ROOT}vscode/graphtrail-vscode-${manifest.version}.vsix`;
  assert.ok(existsSync(vsix), "the .vsix file exists");
  const listing = spawnSync("unzip", ["-l", vsix], { encoding: "utf8" });
  assert.equal(listing.status, 0, "unzip is needed to inspect the package");
  assert.match(listing.stdout, /extension\/dist\/sql-wasm\.wasm/);
  assert.match(listing.stdout, /extension\/dist\/extension\.js/);
  assert.ok(!/extension\/src\//.test(listing.stdout), "sources are not shipped");
});
