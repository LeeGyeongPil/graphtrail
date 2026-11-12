/** Public API of graphtrail. Everything not exported here is internal and may change. */
import { CheckpointDb } from "./timeline.ts";
import type { OpenOptions } from "./sqlite.ts";

export { decodeTyped, decodeMetadata, isTagged, EXT_NAMES } from "./decode.ts";
export { diffStates, messageDelta, pairToolCalls } from "./diff.ts";
export { buildReport, compact, describeChanges, describeMessage, renderJson, renderMarkdown } from "./report.ts";
export type { RenderOptions } from "./report.ts";
export { renderHtml } from "./html.ts";
export { resolveLang } from "./i18n.ts";
export type { Lang } from "./i18n.ts";
export { CheckpointDb } from "./timeline.ts";
export { NotCheckpointDbError, NotFoundError } from "./model.ts";
export type * from "./model.ts";
export type { OpenOptions } from "./sqlite.ts";

/** Open a SqliteSaver database from a path or from its bytes. The original file is never modified. */
export function openCheckpointDb(input: string | Uint8Array, options?: OpenOptions): Promise<CheckpointDb> {
  return CheckpointDb.open(input, options);
}
