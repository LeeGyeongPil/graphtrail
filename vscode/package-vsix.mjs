// Package vscode/ into graphtrail-vscode-<version>.vsix (no marketplace upload; publishing is a manual step).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const vsce = fileURLToPath(new URL("../node_modules/.bin/vsce", import.meta.url));
const { version } = JSON.parse(readFileSync(`${here}package.json`, "utf8"));

const result = spawnSync(vsce, ["package", "--no-dependencies", "--out", `graphtrail-vscode-${version}.vsix`], {
  cwd: here,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
