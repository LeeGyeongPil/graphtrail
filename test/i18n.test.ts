import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildReport, openCheckpointDb, renderHtml, renderJson, renderMarkdown } from "../src/core/index.ts";
import { langFromEnv, MESSAGES, resolveLang, t } from "../src/core/i18n.ts";
import type { MessageKey } from "../src/core/i18n.ts";
import { cli, cliEnv, fixture, ROOT } from "./helpers.ts";

const DB = fixture("py-agent.sqlite");
const HANGUL = /[가-힣]/;

test("message tables: same keys, no empty text, same placeholders", () => {
  const en = Object.keys(MESSAGES.en).sort();
  const ko = Object.keys(MESSAGES.ko).sort();
  assert.deepEqual(ko, en);
  for (const key of en as MessageKey[]) {
    assert.notEqual(MESSAGES.en[key].trim(), "", `en ${key} is empty`);
    assert.notEqual(MESSAGES.ko[key].trim(), "", `ko ${key} is empty`);
    // Korean text uses the formal register (합니다체); the -세요 / -해요 endings are not allowed.
    assert.doesNotMatch(MESSAGES.ko[key], /(세요|해요|보세요)([.\s"')]|$)/, `ko ${key} uses informal register`);
    const names = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? "").sort();
    // parse* messages use {raw} in English and {option} in Korean by design.
    if (!key.startsWith("parse")) assert.deepEqual(names(MESSAGES.ko[key]), names(MESSAGES.en[key]), `placeholders of ${key}`);
  }
});

test("manifest strings: nls files have the same keys and every %key% exists", () => {
  const nls = JSON.parse(readFileSync(`${ROOT}vscode/package.nls.json`, "utf8")) as Record<string, string>;
  const nlsKo = JSON.parse(readFileSync(`${ROOT}vscode/package.nls.ko.json`, "utf8")) as Record<string, string>;
  assert.deepEqual(Object.keys(nlsKo).sort(), Object.keys(nls).sort());
  for (const v of Object.values(nlsKo)) assert.notEqual(v.trim(), "");
  const manifestText = readFileSync(`${ROOT}vscode/package.json`, "utf8");
  const used = [...manifestText.matchAll(/"%([^%"]+)%"/g)].map((m) => m[1] ?? "");
  assert.ok(used.length >= 8);
  for (const key of used) assert.ok(key in nls, `package.nls.json lacks ${key}`);
  assert.ok(manifestText.includes('"graphtrail.language"'));
});

test("resolveLang and the CLI priority order", () => {
  for (const v of ["ko", "ko-KR", "ko_KR.UTF-8", "KO"]) assert.equal(resolveLang(v), "ko", v);
  for (const v of ["en", "en_US.UTF-8", "ja_JP", "C", "", undefined, "kok"]) assert.equal(resolveLang(v), "en", String(v));
  assert.equal(langFromEnv({ LANG: "ko_KR.UTF-8" }), "ko");
  assert.equal(langFromEnv({ LANG: "ko_KR.UTF-8", LC_MESSAGES: "en_US" }), "en");
  assert.equal(langFromEnv({ LC_MESSAGES: "en_US", LC_ALL: "ko_KR" }), "ko");
  assert.equal(langFromEnv({ LC_ALL: "ko", GRAPHTRAIL_LANG: "en" }), "en");
  assert.equal(langFromEnv({ GRAPHTRAIL_LANG: "ko", LANG: "en_US" }, "en"), "en");
  assert.equal(langFromEnv({ GRAPHTRAIL_LANG: "en", LANG: "en_US" }, "ko"), "ko");
  assert.equal(langFromEnv({ GRAPHTRAIL_LANG: "", LANG: "ko_KR" }), "ko", "empty means unset");
  assert.equal(langFromEnv({}), "en");
});

test("CLI: --lang, GRAPHTRAIL_LANG and LANG switch the language", () => {
  const en = cli("--help");
  assert.match(en.stdout, /Usage:/);
  assert.ok(!HANGUL.test(en.stdout));
  const ko = cli("--lang", "ko", "--help");
  assert.equal(ko.code, 0);
  assert.match(ko.stdout, /사용법:/);
  assert.match(ko.stdout, /--lang en\|ko/);
  assert.equal(cli("--lang=ko", "--help").stdout, ko.stdout);
  assert.equal(cliEnv({ GRAPHTRAIL_LANG: "ko" }, "--help").stdout, ko.stdout);
  assert.equal(cliEnv({ GRAPHTRAIL_LANG: "", LC_ALL: "", LC_MESSAGES: "", LANG: "ko_KR.UTF-8" }, "--help").stdout, ko.stdout);
  assert.equal(cliEnv({ GRAPHTRAIL_LANG: "", LC_ALL: "", LC_MESSAGES: "", LANG: "en_US.UTF-8" }, "--help").stdout, en.stdout);
  assert.equal(cliEnv({ GRAPHTRAIL_LANG: "ko" }, "--lang", "en", "--help").stdout, en.stdout, "flag beats env");
  assert.match(cli("--lang", "ko", "threads", DB).stdout, /^스레드\s+ns\s+체크포인트/);
  assert.match(cli("threads", DB).stdout, /^thread\s+ns\s+checkpoints/);
});

test("CLI: errors, parseArgs errors and warnings are localized, exit codes unchanged", () => {
  const bad = cli("--lang", "fr", "threads", DB);
  assert.equal(bad.code, 2);
  assert.match(bad.stderr, /--lang must be en or ko, got "fr"/);
  assert.match(cliEnv({ GRAPHTRAIL_LANG: "ko" }, "--lang", "fr", "threads", DB).stderr, /--lang 은 en 또는 ko 여야 합니다/);

  const noThread = cli("--lang", "ko", "timeline", fixture("not-langgraph.sqlite"));
  assert.equal(noThread.code, 2);
  assert.match(noThread.stderr, /^graphtrail: LangGraph 체크포인트 데이터베이스가 아닙니다/);

  const unknown = cli("--lang", "ko", "threads", DB, "--bogus");
  assert.equal(unknown.code, 2);
  assert.match(unknown.stderr, /알 수 없는 옵션입니다: --bogus/);
  assert.match(cli("threads", DB, "--bogus").stderr, /Unknown option '--bogus'/);

  const missingValue = cli("--lang", "ko", "threads", DB, "--thread");
  assert.equal(missingValue.code, 2);
  assert.match(missingValue.stderr, /옵션 --thread/);

  assert.match(cli("--lang", "ko", "bogus", DB).stderr, /알 수 없는 명령 "bogus"/);
  assert.match(cli("--lang", "ko", "show", DB, "--thread", "t1", "--step", "x").stderr, /--step 은 정수여야 합니다/);
  assert.match(cli("--lang", "ko", "show", DB, "--thread", "t1", "--step", "999").stderr, /단계 999/);
  assert.match(cli("--lang", "ko", "diff", DB, "--thread", "t1").stderr, /--from 과 --to/);
  assert.match(cli("--lang", "ko", "export", DB, "--thread", "t1", "--format", "pdf").stderr, /--format 은/);
  assert.match(cli("--lang", "ko", "threads", fixture("nope.sqlite")).stderr, /읽을 수 없습니다/);
});

test("CLI: warnings use the localized prefix", () => {
  const ko = cli("--lang", "ko", "threads", fixture("wal-agent.sqlite"));
  assert.equal(ko.code, 0);
  assert.match(ko.stderr, /^경고: .*트랜잭션/m);
  assert.match(cli("threads", fixture("wal-agent.sqlite")).stderr, /^warning: included \d+ committed transaction/m);
});

test("CLI: text views show Korean labels but keep data", () => {
  const timeline = cli("--lang", "ko", "timeline", DB, "--thread", "t1").stdout;
  assert.match(timeline, /^단계\s+출처/);
  const show = cli("--lang", "ko", "show", DB, "--thread", "t1").stdout;
  assert.match(show, /^스레드 t1\s+단계 \d+\s+출처 /);
  assert.match(show, /상태:/);
  const diff = cli("--lang", "ko", "diff", DB, "--thread", "t1", "--from", "0", "--to", "1").stdout;
  assert.match(diff, /^단계 0 -> 단계 1/);
});

test("JSON output is byte-identical in both languages", () => {
  const commands: string[][] = [
    ["threads", DB, "--json"],
    ["timeline", DB, "--thread", "t1", "--json"],
    ["show", DB, "--thread", "t1", "--json"],
    ["diff", DB, "--thread", "t1", "--from", "0", "--to", "1", "--json"],
    ["export", DB, "--thread", "t1", "--format", "json"],
  ];
  for (const args of commands) {
    const en = cli(...args);
    const ko = cli("--lang", "ko", ...args);
    assert.equal(en.code, 0, args.join(" "));
    assert.equal(ko.stdout, en.stdout, args.join(" "));
  }
  assert.equal(cli("export", DB, "--thread", "t1", "--format", "json").stdout, readFileSync(fixture("golden/t1.json"), "utf8"));
});

test("reports: English default equals golden, Korean changes headings only", async () => {
  const db = await openCheckpointDb(DB);
  const report = buildReport(db, "t1");
  const golden = readFileSync(fixture("golden/t1.md"), "utf8");
  assert.equal(renderMarkdown(report), golden);
  assert.equal(renderMarkdown(report, { lang: "en" }), golden);
  const ko = renderMarkdown(report, { lang: "ko" });
  assert.notEqual(ko, golden);
  assert.match(ko, /^# graphtrail 보고서: 스레드 t1/);
  assert.match(ko, /## 타임라인/);
  assert.match(ko, /\| 단계 \| 출처 \| 노드 \(추정\)/);
  assert.equal(ko.split("\n").length, golden.split("\n").length, "same structure");
  const html = renderHtml(report, { lang: "ko" });
  assert.match(html, /<html lang="ko">/);
  assert.match(html, /<h2>타임라인<\/h2>/);
  assert.match(renderHtml(report), /<html lang="en">/);
  assert.equal(renderJson(report), readFileSync(fixture("golden/t1.json"), "utf8"));
  assert.equal(cli("--lang", "ko", "export", DB, "--thread", "t1", "--format", "md").stdout, ko);
  db.close();
});

test("library errors follow OpenOptions.lang and default to English", async () => {
  const ko = await openCheckpointDb(DB, { lang: "ko" });
  assert.throws(() => ko.timeline("nope"), /체크포인트가 없습니다/);
  ko.lang = "en";
  assert.throws(() => ko.timeline("nope"), /no checkpoints for thread "nope"/);
  ko.close();
  const en = await openCheckpointDb(DB);
  assert.throws(() => en.getCheckpoint("t1", { step: 999 }), /has no step 999/);
  en.close();
  assert.equal(t("ko", "noChange"), "상태 변경 없음");
});
