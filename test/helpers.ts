import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Pin the display language when this module is imported, so the golden and message tests give the same
// result whatever locale the shell or the test runner uses (for example LANG=ko_KR.UTF-8).
process.env.GRAPHTRAIL_LANG = "en";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const fixture = (name: string): string => `${ROOT}fixtures/${name}`;

/** Run the built CLI (dist/cli.js) like a user would. Language is English unless `env` says otherwise. */
export function cli(...args: string[]): { code: number | null; stdout: string; stderr: string } {
  return cliEnv({}, ...args);
}

/** Same as `cli`, with extra environment variables. Pass `GRAPHTRAIL_LANG: ""` to leave it unset (then LC_ALL/LANG apply). */
export function cliEnv(env: Record<string, string>, ...args: string[]): { code: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [`${ROOT}dist/cli.js`, ...args], {
    encoding: "utf8",
    cwd: ROOT,
    env: { ...process.env, GRAPHTRAIL_LANG: "en", ...env },
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}
/** Build a msgpack ext value by hand (ext8 header), so tests do not depend on the decoder's own codec. */
export function ext(type: number, data: Uint8Array): Uint8Array {
  if (data.length > 255) throw new Error("test helper only builds small ext values");
  return Uint8Array.from([0xc7, data.length, type, ...data]);
}
