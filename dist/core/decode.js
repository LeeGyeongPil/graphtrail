/**
 * Safe decoder for LangGraph checkpoint blobs.
 *
 * The rule of this file: bytes are turned into plain JSON-like data and tags.
 * No module is imported, no class is looked up, nothing from the database is evaluated.
 * Unknown extension codes and `pickle` are only reported with their size.
 */
import { Decoder, ExtData, ExtensionCodec } from "@msgpack/msgpack";
/** Names of the msgpack extension codes written by LangGraph's JsonPlusSerializer. */
export const EXT_NAMES = {
    0: "ctor_single_arg",
    1: "ctor_pos_args",
    2: "ctor_kw_args",
    3: "method_single_arg",
    4: "pydantic_v1",
    5: "pydantic_v2",
    6: "numpy_array",
    7: "delta_snapshot",
};
const textDecoder = new TextDecoder("utf-8", { fatal: false });
/** Assign a key without ever touching the prototype (keys come from untrusted files). */
function setKey(target, key, value) {
    Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}
/** msgpack maps written with non-string keys (ints, tuples) become readable string keys. */
function mapKeyConverter(key) {
    if (typeof key === "string" || typeof key === "number")
        return key;
    if (typeof key === "bigint")
        return key.toString();
    try {
        return JSON.stringify(finalize(key));
    }
    catch {
        return String(key);
    }
}
/** Decode a msgpack buffer with a fresh decoder (nested ext payloads must not share state). */
function rawDecode(data) {
    return new Decoder({ extensionCodec: codec, useBigInt64: true, mapKeyConverter }).decode(data);
}
function nested(data) {
    return finalize(rawDecode(data));
}
function isStringArrayHead(inner, min) {
    return Array.isArray(inner) && inner.length >= min && typeof inner[0] === "string" && typeof inner[1] === "string";
}
function tagFromTuple(code, data) {
    const inner = nested(data);
    const ext = EXT_NAMES[code] ?? `ext_${code}`;
    if (!isStringArrayHead(inner, 3)) {
        // Not the (module, name, payload) shape we know: keep the decoded content, never guess.
        return { $type: "unknown", $ext: ext, value: inner };
    }
    const tag = { $type: `${inner[0]}.${inner[1]}`, $ext: ext, value: inner[2] };
    const method = inner[3];
    if (typeof method === "string")
        tag.method = method;
    return tag;
}
function numpyTag(data) {
    const inner = nested(data);
    if (Array.isArray(inner) && inner.length >= 4) {
        const buf = inner[3];
        return {
            $type: "numpy.ndarray",
            $ext: "numpy_array",
            value: { dtype: inner[0], shape: inner[1], order: inner[2], bytes: buf?.$bytes ?? null },
        };
    }
    return { $type: "numpy.ndarray", $ext: "numpy_array", value: inner };
}
const codec = new ExtensionCodec();
for (const code of [0, 1, 2, 3, 4, 5]) {
    codec.register({ type: code, encode: () => null, decode: (data) => tagFromTuple(code, data) });
}
codec.register({ type: 6, encode: () => null, decode: (data) => numpyTag(data) });
codec.register({
    type: 7,
    encode: () => null,
    decode: (data) => ({
        $type: "langgraph.DeltaSnapshot",
        $ext: "delta_snapshot",
        value: nested(data),
    }),
});
/** Replace everything that is not plain JSON data: unknown ext, bytes, bigint, Date. */
function finalize(value) {
    if (value === null || value === undefined)
        return null;
    if (typeof value === "bigint") {
        return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)
            ? Number(value)
            : { $bigint: value.toString() };
    }
    if (value instanceof ExtData) {
        const unknown = { $ext: `unknown:${value.type}`, bytes: value.data.length };
        return unknown;
    }
    if (value instanceof Uint8Array)
        return { $bytes: value.length };
    if (value instanceof Date)
        return Number.isNaN(value.getTime()) ? null : value.toISOString();
    if (Array.isArray(value))
        return value.map(finalize);
    if (typeof value === "object") {
        const out = {};
        for (const [k, v] of Object.entries(value))
            setKey(out, k, finalize(v));
        return out;
    }
    return value;
}
/** Turn LangChain `lc` JSON envelopes into the same tag shape the msgpack path produces. */
function normalizeLc(value) {
    if (Array.isArray(value))
        return value.map(normalizeLc);
    if (value === null || typeof value !== "object")
        return value;
    const obj = value;
    if (typeof obj.lc === "number" && typeof obj.type === "string" && Array.isArray(obj.id)) {
        const id = obj.id.map(String).join(".");
        if (obj.type === "constructor") {
            const tag = { $type: id, $ext: "lc_constructor", value: normalizeLc(obj.kwargs ?? {}) };
            // `method` is only displayed; nothing is ever dispatched on it.
            if (typeof obj.method === "string")
                tag.method = obj.method;
            return tag;
        }
        if (obj.type === "not_implemented")
            return { $type: id, $ext: "lc_not_implemented", value: obj.repr ?? null };
        if (obj.type === "secret")
            return { $type: id, $ext: "lc_secret", value: null };
    }
    const out = {};
    for (const [k, v] of Object.entries(obj))
        setKey(out, k, normalizeLc(v));
    return out;
}
function toBytes(blob) {
    if (blob === null || blob === undefined)
        return null;
    if (typeof blob === "string")
        return new TextEncoder().encode(blob);
    if (blob instanceof Uint8Array)
        return blob;
    if (blob instanceof ArrayBuffer)
        return new Uint8Array(blob);
    return Uint8Array.from(blob);
}
/**
 * Decode one `(type, bytes)` pair as stored by LangGraph serializers.
 * Never throws: failures and unsupported types come back as `$error` / `$unsupported` markers.
 */
export function decodeTyped(type, blob) {
    const bytes = toBytes(blob);
    if (type === "null" || bytes === null)
        return null;
    try {
        switch (type) {
            case "msgpack":
                return finalize(rawDecode(bytes));
            case "json":
                return normalizeLc(JSON.parse(textDecoder.decode(bytes)));
            case "bytes":
            case "bytearray":
                return { $bytes: bytes.length };
            default: {
                // pickle and anything else: report the size, never interpret.
                const unsupported = { $unsupported: String(type), bytes: bytes.length };
                return unsupported;
            }
        }
    }
    catch (error) {
        return { $error: `${type ?? "unknown"} decode failed: ${error.message}`, bytes: bytes.length };
    }
}
/** Checkpoint metadata is stored as JSON text (not msgpack). Returns {} when it cannot be read. */
export function decodeMetadata(blob) {
    const bytes = toBytes(blob);
    if (bytes === null)
        return {};
    try {
        const parsed = JSON.parse(textDecoder.decode(bytes));
        return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed
            : {};
    }
    catch {
        return {};
    }
}
export function isTagged(value) {
    return (value !== null &&
        typeof value === "object" &&
        typeof value.$type === "string" &&
        typeof value.$ext === "string");
}
