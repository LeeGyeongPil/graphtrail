import type { Lang } from "./i18n.ts";
import type { DecodedCheckpoint, ThreadSummary, TimelineEntry } from "./model.ts";
import type { OpenOptions } from "./sqlite.ts";
/** Read-only view of one LangGraph SqliteSaver database. */
export declare class CheckpointDb {
    readonly warnings: string[];
    /** Language of error messages raised after opening; may be changed at any time (e.g. a UI language switch). */
    lang: Lang;
    private readonly reader;
    private readonly cache;
    private constructor();
    /** @throws NotCheckpointDbError when the file is not a LangGraph checkpoint database. */
    static open(input: string | Uint8Array, options?: OpenOptions): Promise<CheckpointDb>;
    close(): void;
    /** One row per (thread, namespace). Subgraph namespaces are listed separately. */
    listThreads(): ThreadSummary[];
    /** Entries from the first checkpoint (step -1) to the latest, following parent_checkpoint_id. */
    timeline(threadId: string, ns?: string): TimelineEntry[];
    /** Number of checkpoint rows of a thread/namespace (includes rows outside the main chain). */
    private count;
    /** Every checkpoint of the main chain, decoded, oldest first. */
    checkpoints(threadId: string, ns?: string): DecodedCheckpoint[];
    /** Select by `step` (metadata step) or by `id` (unique prefix allowed); no selector means the latest. */
    getCheckpoint(threadId: string, sel?: {
        step?: number;
        id?: string;
    }, ns?: string): DecodedCheckpoint;
    private chain;
    private load;
    private writesOf;
    /** Nodes that run after `current`: those whose `versions_seen` moved in the child checkpoint. */
    private nodesAfter;
    private entries;
    private statusOf;
}
