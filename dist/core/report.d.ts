import type { Report, StateDiff, ToolPair } from "./model.ts";
import type { CheckpointDb } from "./timeline.ts";
/** Build the full report of one thread: timeline, latest state, and the diff of each step. */
export declare function buildReport(db: CheckpointDb, threadId: string, ns?: string): Report;
export declare function renderJson(report: Report): string;
/** One-line preview of any decoded value. Strings are cut at `max` characters. */
export declare function compact(value: unknown, max?: number): string;
/** `AIMessage m-ai-1 "text" -> add({...})` style summary of a decoded message. */
export declare function describeMessage(message: unknown): string;
export declare function describePair(pair: ToolPair): string;
/** The change lines shared by the Markdown and HTML renderers. */
export declare function describeChanges(d: StateDiff): string[];
export declare function renderMarkdown(report: Report): string;
