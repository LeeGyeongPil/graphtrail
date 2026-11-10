// Bundle the extension into one file and copy the sql.js WASM next to it.
// Usage: node vscode/build.mjs   (run from the repository root)
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = fileURLToPath(new URL(".", import.meta.url));
const out = `${here}dist`;
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [`${here}src/extension.ts`],
  outfile: `${out}/extension.js`,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode"], // provided by the extension host
  minify: false,
  logLevel: "info",
});

// The editor reads this file with vscode.workspace.fs and hands the bytes to sql.js (no path lookup in the host).
copyFileSync(fileURLToPath(new URL("../node_modules/sql.js/dist/sql-wasm.wasm", import.meta.url)), `${out}/sql-wasm.wasm`);
