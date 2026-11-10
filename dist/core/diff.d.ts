import type { DecodedCheckpoint, MessageDelta, StateDiff, ToolCall, ToolPair, ToolResult } from "./model.ts";
/** JSON with sorted keys, used to compare values and to keep exports deterministic. */
export declare function stable(value: unknown): string;
export declare function sortKeys(value: unknown): unknown;
/** `AIMessage`, `ToolMessage`, ... (last segment of the type), or null when it is not a tagged message. */
export declare function messageKind(message: unknown): string | null;
export declare function messageId(message: unknown): string | null;
export declare function extractToolCalls(message: unknown): ToolCall[];
export declare function extractToolResult(message: unknown): ToolResult | null;
export declare function messageDelta(before: unknown, after: unknown): MessageDelta;
/** Match every tool call with the ToolMessage that answers it (same tool_call_id). */
export declare function pairToolCalls(messages: unknown[], scope?: Set<unknown>): ToolPair[];
export declare function diffStates(a: DecodedCheckpoint, b: DecodedCheckpoint): StateDiff;
/** Engine bookkeeping channels (`__start__`, `branch:to:<node>`, ...) are not user state. */
export declare function isInternalChannel(key: string): boolean;
