import assert from "node:assert/strict";
import { test } from "node:test";
import { encode } from "@msgpack/msgpack";
import { decodeTyped } from "../src/core/index.ts";
import { ext } from "./helpers.ts";

const NAMES = ["ctor_single_arg", "ctor_pos_args", "ctor_kw_args", "method_single_arg", "pydantic_v1", "pydantic_v2"];

test("decodes ext 0-7 as tags", () => {
  NAMES.forEach((name, code) => {
    const payload = encode(["pkg.mod", "Thing", { a: 1 }, "from_json"]);
    const out = decodeTyped("msgpack", ext(code, payload)) as Record<string, unknown>;
    assert.equal(out.$ext, name);
    assert.equal(out.$type, "pkg.mod.Thing");
    assert.deepEqual(out.value, { a: 1 });
    assert.equal(out.method, "from_json");
  });
  const numpy = decodeTyped("msgpack", ext(6, encode(["<i4", [2], "C", new Uint8Array(8)]))) as Record<string, unknown>;
  assert.equal(numpy.$ext, "numpy_array");
  assert.deepEqual(numpy.value, { dtype: "<i4", shape: [2], order: "C", bytes: 8 });
  const delta = decodeTyped("msgpack", ext(7, encode({ channel: "x" }))) as Record<string, unknown>;
  assert.equal(delta.$ext, "delta_snapshot");
  assert.deepEqual(delta.value, { channel: "x" });
});

test("ext values nested inside arrays are decoded too", () => {
  const inner = ext(2, encode(["m", "K", { n: 1 }]));
  const blob = Uint8Array.from([0x91, ...inner]); // fixarray of one ext
  const out = decodeTyped("msgpack", blob) as { $ext: string }[];
  assert.equal(out[0]?.$ext, "ctor_kw_args");
});

test("unknown ext and pickle are reported not executed", () => {
  assert.deepEqual(decodeTyped("msgpack", ext(9, Uint8Array.from([1, 2, 3]))), { $ext: "unknown:9", bytes: 3 });
  assert.deepEqual(decodeTyped("pickle", Uint8Array.from([0x80, 4, 0x95, 1, 2])), { $unsupported: "pickle", bytes: 5 });
  assert.deepEqual(decodeTyped("bytes", Uint8Array.from([1, 2])), { $bytes: 2 });
});

test("bad input never throws", () => {
  assert.equal(decodeTyped("null", null), null);
  assert.equal(decodeTyped("msgpack", null), null);
  const broken = decodeTyped("msgpack", Uint8Array.from([0xc1, 0xff])) as Record<string, unknown>;
  assert.equal(typeof broken.$error, "string");
  const badJson = decodeTyped("json", new TextEncoder().encode("{oops")) as Record<string, unknown>;
  assert.equal(typeof badJson.$error, "string");
  // ext 0-5 with a payload that is not (module, name, value): kept as unknown, not guessed
  const odd = decodeTyped("msgpack", ext(0, encode(42))) as Record<string, unknown>;
  assert.equal(odd.$type, "unknown");
});

test("lc JSON envelopes become the same tag shape; method is display only", () => {
  const lc = {
    lc: 1,
    type: "constructor",
    id: ["langchain_core", "messages", "AIMessage"],
    kwargs: { content: "hi" },
    method: "from_x",
  };
  const out = decodeTyped("json", new TextEncoder().encode(JSON.stringify([lc]))) as Record<string, unknown>[];
  assert.equal(out[0]?.$type, "langchain_core.messages.AIMessage");
  assert.equal(out[0]?.$ext, "lc_constructor");
  assert.equal(out[0]?.method, "from_x");
});

test("hostile keys do not pollute prototypes", () => {
  const text = '{"__proto__":{"polluted":true},"constructor":{"x":1}}';
  const out = decodeTyped("json", new TextEncoder().encode(text)) as Record<string, unknown>;
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.deepEqual(Object.keys(out).sort(), ["__proto__", "constructor"]);
});

test("big integers and non-string map keys are readable", () => {
  const big = decodeTyped("msgpack", Uint8Array.from([0xcf, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]));
  assert.deepEqual(big, { $bigint: "18446744073709551615" });
  const intKeyMap = decodeTyped("msgpack", Uint8Array.from([0x81, 0x01, 0xa1, 0x78])); // {1: "x"}
  assert.deepEqual(intKeyMap, { "1": "x" });
});
