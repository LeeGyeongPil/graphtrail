import type { Tagged } from "./model.ts";
/** Names of the msgpack extension codes written by LangGraph's JsonPlusSerializer. */
export declare const EXT_NAMES: Readonly<Record<number, string>>;
/**
 * Decode one `(type, bytes)` pair as stored by LangGraph serializers.
 * Never throws: failures and unsupported types come back as `$error` / `$unsupported` markers.
 */
export declare function decodeTyped(type: string | null | undefined, blob: Uint8Array | ArrayBuffer | string | null | undefined): unknown;
/** Checkpoint metadata is stored as JSON text (not msgpack). Returns {} when it cannot be read. */
export declare function decodeMetadata(blob: Uint8Array | ArrayBuffer | string | null | undefined): Record<string, unknown>;
export declare function isTagged(value: unknown): value is Tagged;
