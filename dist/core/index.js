/** Public API of graphtrail. Everything not exported here is internal and may change. */
import { CheckpointDb } from "./timeline.js";
export { decodeTyped, decodeMetadata, isTagged, EXT_NAMES } from "./decode.js";
export { diffStates, messageDelta, pairToolCalls } from "./diff.js";
export { buildReport, compact, describeChanges, describeMessage, renderJson, renderMarkdown } from "./report.js";
export { renderHtml } from "./html.js";
export { resolveLang } from "./i18n.js";
export { CheckpointDb } from "./timeline.js";
export { NotCheckpointDbError, NotFoundError } from "./model.js";
/** Open a SqliteSaver database from a path or from its bytes. The original file is never modified. */
export function openCheckpointDb(input, options) {
    return CheckpointDb.open(input, options);
}
