import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildReport, openCheckpointDb, renderJson, renderMarkdown } from "../src/core/index.ts";
import { cli, fixture } from "./helpers.ts";

// wal-agent.sqlite was made while "the app was still running": 6 checkpoints were copied into the
// main file, the other 13 are committed but only in wal-agent.sqlite-wal (see fixtures/gen/make_wal_fixture.py).
const MAIN = fixture("wal-agent.sqlite");
const WAL = fixture("wal-agent.sqlite-wal");
const sha = (path: string): string => createHash("sha256").update(readFileSync(path)).digest("hex");

/** Copy the WAL fixture into a fresh temp directory; `wal` replaces the -wal file (or omits it when null). */
function tempDb(wal: Uint8Array | null | "original"): { dir: string; db: string } {
  const dir = mkdtempSync(join(tmpdir(), "graphtrail-wal-"));
  const db = join(dir, "app.sqlite");
  copyFileSync(MAIN, db);
  if (wal === "original") copyFileSync(WAL, `${db}-wal`);
  else if (wal !== null) writeFileSync(`${db}-wal`, wal);
  return { dir, db };
}

const totalCheckpoints = (stdout: string): number =>
  stdout
    .split("\n")
    .slice(1)
    .reduce((sum, line) => sum + Number(/^\S+\s+\S+\s+(\d+)\s/.exec(line)?.[1] ?? 0), 0);

// --- independent WAL writer helpers (the test does not reuse the code under test) ---
function checksum(buf: Uint8Array, off: number, len: number, s: [number, number], big: boolean): [number, number] {
  const dv = new DataView(buf.buffer, buf.byteOffset);
  let [s0, s1] = s;
  for (let i = off; i < off + len; i += 8) {
    s0 = (s0 + dv.getUint32(i, !big) + s1) >>> 0;
    s1 = (s1 + dv.getUint32(i + 4, !big) + s0) >>> 0;
  }
  return [s0, s1];
}

/** Recompute every checksum of a WAL with the given byte order (header magic low bit picks it). */
function rechecksum(wal: Uint8Array, big: boolean): Uint8Array {
  const out = Uint8Array.from(wal);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, big ? 0x377f0683 : 0x377f0682);
  const pageSize = dv.getUint32(8);
  let s = checksum(out, 0, 24, [0, 0], big);
  dv.setUint32(24, s[0]);
  dv.setUint32(28, s[1]);
  for (let off = 32; off + 24 + pageSize <= out.length; off += 24 + pageSize) {
    s = checksum(out, off, 8, s, big);
    s = checksum(out, off + 24, pageSize, s, big);
    dv.setUint32(off + 16, s[0]);
    dv.setUint32(off + 20, s[1]);
  }
  return out;
}

/** Append one frame whose checksum correctly continues the chain. commit 0 = not a commit frame. */
function appendFrame(wal: Uint8Array, pageNo: number, commit: number, fill: number): Uint8Array {
  const dv = new DataView(wal.buffer, wal.byteOffset);
  const big = (dv.getUint32(0) & 1) === 1;
  const pageSize = dv.getUint32(8);
  const frames = (wal.length - 32) / (24 + pageSize);
  const prev = 32 + (frames - 1) * (24 + pageSize);
  const out = new Uint8Array(wal.length + 24 + pageSize);
  out.set(wal);
  const odv = new DataView(out.buffer);
  const off = wal.length;
  odv.setUint32(off, pageNo);
  odv.setUint32(off + 4, commit);
  odv.setUint32(off + 8, dv.getUint32(16));
  odv.setUint32(off + 12, dv.getUint32(20));
  out.fill(fill, off + 24);
  let s: [number, number] = [dv.getUint32(prev + 16), dv.getUint32(prev + 20)];
  s = checksum(out, off, 8, s, big);
  s = checksum(out, off + 24, pageSize, s, big);
  odv.setUint32(off + 16, s[0]);
  odv.setUint32(off + 20, s[1]);
  return out;
}

// ③ (a) the committed WAL rows are visible
test("wal: committed rows that exist only in -wal are shown", () => {
  const r = cli("threads", MAIN);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /^t1\s/m);
  assert.match(r.stdout, /^t2\s/m);
  assert.match(r.stdout, /^t3\s/m);
  assert.equal(totalCheckpoints(r.stdout), 19);
  assert.match(r.stderr, /warning: included \d+ committed transaction\(s\) from .*wal-agent\.sqlite-wal that are not yet checkpointed/);
});

// ③ (b) same data as the non-WAL fixture it was made from
test("wal: timeline and export equal the py-agent fixture", async () => {
  const wal = await openCheckpointDb(MAIN);
  const plain = await openCheckpointDb(fixture("py-agent.sqlite"));
  assert.deepEqual(wal.listThreads(), plain.listThreads());
  for (const id of ["t1", "t2", "t3"]) {
    assert.equal(renderJson(buildReport(wal, id)), renderJson(buildReport(plain, id)));
    assert.equal(renderMarkdown(buildReport(wal, id)), renderMarkdown(buildReport(plain, id)));
  }
  wal.close();
  plain.close();
  const a = cli("export", MAIN, "--thread", "t1", "--format", "md");
  assert.equal(a.stdout, readFileSync(fixture("golden/t1.md"), "utf8"));
});

test("wal: bytes input with the wal option gives the same result", async () => {
  const db = await openCheckpointDb(readFileSync(MAIN), { wal: readFileSync(WAL) });
  assert.equal(db.listThreads().reduce((n, t) => n + t.checkpoints, 0), 19);
  db.close();
  const without = await openCheckpointDb(readFileSync(MAIN));
  assert.ok(without.listThreads().reduce((n, t) => n + t.checkpoints, 0) < 19);
  assert.equal(without.warnings.length, 0);
  without.close();
});

test("wal: both checksum byte orders are understood", () => {
  const original = readFileSync(WAL);
  for (const big of [false, true]) {
    const { dir, db } = tempDb(rechecksum(original, big));
    try {
      const r = cli("threads", db);
      assert.equal(r.code, 0, `big=${big}`);
      assert.equal(totalCheckpoints(r.stdout), 19, `big=${big}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

// ③ (c) tails after the last commit are dropped
test("wal: uncommitted and corrupt tails are ignored", () => {
  const original = readFileSync(WAL);
  const cases: Record<string, Uint8Array> = {
    // valid chain but never committed: must not be applied (it would wreck page 1)
    uncommitted: appendFrame(original, 1, 0, 0xab),
    // a frame copied from the middle: salt matches but the cumulative checksum cannot
    "bad checksum": (() => {
      const pageSize = new DataView(original.buffer, original.byteOffset).getUint32(8);
      const frame = original.subarray(32, 32 + 24 + pageSize);
      const out = new Uint8Array(original.length + frame.length);
      out.set(original);
      out.set(frame, original.length);
      return out;
    })(),
    // a commit frame behind a bad frame stays unreachable
    "commit after bad frame": appendFrame(appendFrame(original, 1, 0, 0xcd), 1, 1, 0xcd).map((b, i) =>
      i === original.length + 24 + 100 ? b ^ 0xff : b,
    ),
  };
  for (const [name, wal] of Object.entries(cases)) {
    const { dir, db } = tempDb(wal);
    try {
      const r = cli("threads", db);
      assert.equal(r.code, 0, name);
      assert.equal(totalCheckpoints(r.stdout), 19, name);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("wal: a broken commit frame drops that transaction but keeps the main file readable", () => {
  const broken = Uint8Array.from(readFileSync(WAL));
  broken[broken.length - 100] ^= 0xff; // inside the last frame's page data
  const { dir, db } = tempDb(broken);
  try {
    const r = cli("threads", db);
    assert.equal(r.code, 0);
    const n = totalCheckpoints(r.stdout);
    assert.ok(n >= 6 && n < 19, `got ${n}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ③ (d) no / empty / garbage / unreadable -wal
test("wal: missing, empty, foreign-salt, garbage and unreadable -wal fall back to the main file", () => {
  const original = readFileSync(WAL);
  const pageSize = new DataView(original.buffer, original.byteOffset).getUint32(8);
  const salted = Uint8Array.from(original); // frames with another salt = leftovers of an older WAL generation
  for (let off = 32; off + 24 + pageSize <= salted.length; off += 24 + pageSize) salted[off + 8] ^= 0xff;

  // Only the main file: 6 checkpoints (t1), no warning.
  const quiet: Record<string, Uint8Array | null> = { "no -wal": null, "empty -wal": new Uint8Array(0), "foreign salt": salted };
  for (const [name, wal] of Object.entries(quiet)) {
    const { dir, db } = tempDb(wal);
    try {
      const r = cli("threads", db);
      assert.equal(r.code, 0, name);
      assert.equal(totalCheckpoints(r.stdout), 6, name);
      assert.equal(r.stderr, "", name);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // A lone -shm must be ignored: main file only, no warning.
  const lone = tempDb(null);
  try {
    writeFileSync(`${lone.db}-shm`, new Uint8Array(32768));
    const r = cli("threads", lone.db);
    assert.equal(r.code, 0);
    assert.equal(r.stderr, "");
    assert.equal(totalCheckpoints(r.stdout), 6);
  } finally {
    rmSync(lone.dir, { recursive: true, force: true });
  }

  // Garbage: main file only, exactly one warning line.
  const garbage = tempDb(new TextEncoder().encode("this is not a wal file, just some text padding it out to be long enough"));
  try {
    const r = cli("threads", garbage.db);
    assert.equal(r.code, 0);
    assert.equal(totalCheckpoints(r.stdout), 6);
    const lines = r.stderr.trim().split("\n");
    assert.equal(lines.length, 1);
    assert.match(lines[0] ?? "", /warning: .*-wal could not be used; showing only data already checkpointed into .*app\.sqlite/);
  } finally {
    rmSync(garbage.dir, { recursive: true, force: true });
  }

  // Unreadable (permission denied): same fallback. chmod does not restrict root, so skip just this part there.
  const locked = tempDb("original");
  try {
    chmodSync(`${locked.db}-wal`, 0o000);
    let readable = true;
    try {
      readFileSync(`${locked.db}-wal`);
    } catch {
      readable = false;
    }
    if (!readable) {
      const r = cli("threads", locked.db);
      assert.equal(r.code, 0);
      assert.equal(totalCheckpoints(r.stdout), 6);
      assert.equal(r.stderr.trim().split("\n").length, 1);
      assert.match(r.stderr, /-wal could not be used/);
    }
  } finally {
    chmodSync(`${locked.db}-wal`, 0o644);
    rmSync(locked.dir, { recursive: true, force: true });
  }
});

// ③ (e) nothing is written, created or deleted
test("wal: reading never changes, creates or removes files", () => {
  const { dir, db } = tempDb("original");
  try {
    const walPath = `${db}-wal`;
    const before = [sha(db), sha(walPath)];
    const names = readdirSync(dir).sort();
    for (const args of [["threads", db], ["timeline", db, "--thread", "t3"], ["show", db, "--thread", "t2", "--json"], ["export", db, "--thread", "t3", "--format", "html"]]) {
      assert.equal(cli(...args).code, 0, args.join(" "));
    }
    assert.deepEqual([sha(db), sha(walPath)], before);
    assert.deepEqual(readdirSync(dir).sort(), names); // no -shm appeared, nothing was deleted
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("wal: committed fixtures in the repo are untouched by reading", () => {
  const before = [sha(MAIN), sha(WAL)];
  cli("threads", MAIN);
  cli("export", MAIN, "--thread", "t3", "--format", "json");
  assert.deepEqual([sha(MAIN), sha(WAL)], before);
});
