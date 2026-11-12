import type { Report, StateDiff, ToolPair } from "./model.ts";
import type { CheckpointDb } from "./timeline.ts";
import type { Lang } from "./i18n.ts";
/** Options of the text renderers. */
export interface RenderOptions {
    /** Language of titles, labels and descriptions. Default "en". Data from the database is never translated. */
    lang?: Lang;
}
/** Build the full report of one thread: timeline, latest state, and the diff of each step. */
export declare function buildReport(db: CheckpointDb, threadId: string, ns?: string): Report;
export declare function renderJson(report: Report): string;
/** One-line preview of any decoded value. Strings are cut at `max` characters. */
export declare function compact(value: unknown, max?: number): string;
/** `AIMessage m-ai-1 "text" -> add({...})` style summary of a decoded message. */
export declare function describeMessage(message: unknown): string;
export declare function describePair(pair: ToolPair): string;
/** The change lines shared by the Markdown and HTML renderers. */
export declare function describeChanges(d: StateDiff, lang?: Lang): string[];
export declare function renderMarkdown(report: Report, options?: RenderOptions): string;
