import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const fixture = (name: string): string => `${ROOT}fixtures/${name}`;

/** Run the built CLI (dist/cli.js) like a user would. */
export function cli(...args: string[]): { code: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [`${ROOT}dist/cli.js`, ...args], { encoding: "utf8", cwd: ROOT });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** Build a msgpack ext value by hand (ext8 header), so tests do not depend on the decoder's own codec. */
export function ext(type: number, data: Uint8Array): Uint8Array {
  if (data.length > 255) throw new Error("test helper only builds small ext values");
  return Uint8Array.from([0xc7, data.length, type, ...data]);
}
