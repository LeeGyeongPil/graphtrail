/** Shared types of the graphtrail core. Nothing in here executes or constructs user code. */
/** A serialized object shown as a tag. Produced for msgpack ext 0-6 and JS `lc` envelopes. */
export interface Tagged {
    /** `module.ClassName` (Python) or the joined `lc` id (JS). */
    $type: string;
    /** How it was stored: ctor_single_arg, ctor_pos_args, ctor_kw_args, method_single_arg, pydantic_v1, pydantic_v2, numpy_array, delta_snapshot, lc_constructor. */
    $ext: string;
    /** The payload (constructor argument, kwargs, fields...), already decoded. */
    value: unknown;
    /** Name of the factory method the writer would call on load (display only, never called). */
    method?: string;
}
/** An extension code this version does not know. Only its size is reported. */
export interface UnknownExt {
    $ext: string;
    bytes: number;
}
/** A serialization type that is never interpreted (for example pickle). */
export interface Unsupported {
    $unsupported: string;
    bytes: number;
}
export type ThreadStatus = "done" | "interrupted" | "pending";
export type Writer = "python" | "js" | "unknown";
export interface ThreadSummary {
    threadId: string;
    /** checkpoint_ns; empty string is the root graph, "name:<task>" is a subgraph. */
    ns: string;
    checkpoints: number;
    lastStep: number;
    status: ThreadStatus;
    writer: Writer;
}
export interface TaskInfo {
    taskId: string;
    /** Node name when it could be estimated, otherwise null. */
    node: string | null;
    /** Channels this task wrote. */
    channels: string[];
}
export interface ToolCall {
    id: string | null;
    name: string;
    args: unknown;
}
export interface ToolResult {
    toolCallId: string | null;
    content: unknown;
}
export interface TimelineEntry {
    checkpointId: string;
    parentId: string | null;
    step: number;
    source: string;
    ts: string | null;
    /** Channel keys changed by the step that runs from this checkpoint (vs. its child); empty on the latest one. */
    changedKeys: string[];
    /** Nodes that ran *after* this checkpoint (estimated from versions_seen / pending triggers). */
    nodes: string[];
    tasks: TaskInfo[];
    toolCalls: ToolCall[];
    toolResults: ToolResult[];
    /** Values of `__interrupt__` writes (what the graph asked for). */
    interrupts: unknown[];
    /** Text of `__error__` writes, if any. */
    errors: unknown[];
}
export interface DecodedCheckpoint {
    threadId: string;
    ns: string;
    checkpointId: string;
    parentId: string | null;
    step: number;
    source: string;
    ts: string | null;
    /** Checkpoint format version `v` as stored. */
    version: number | null;
    channelValues: Record<string, unknown>;
    metadata: Record<string, unknown>;
    /** Raw (decoded) writes of this checkpoint grouped per task. */
    writes: {
        taskId: string;
        idx: number;
        channel: string;
        value: unknown;
    }[];
}
export interface MessageDelta {
    added: unknown[];
    addedIds: string[];
    removedIds: string[];
}
export interface ToolPair {
    id: string | null;
    name: string;
    args: unknown;
    result: unknown;
}
export interface KeyChange {
    key: string;
    kind: "added" | "removed" | "changed";
    before?: unknown;
    after?: unknown;
}
export interface StateDiff {
    from: {
        step: number;
        checkpointId: string;
    };
    to: {
        step: number;
        checkpointId: string;
    };
    changes: KeyChange[];
    messages: MessageDelta;
    toolPairs: ToolPair[];
}
export interface ReportThread {
    threadId: string;
    ns: string;
    status: ThreadStatus;
    writer: Writer;
}
export interface Report {
    schemaVersion: 1;
    thread: ReportThread;
    timeline: TimelineEntry[];
    /** Full state of the latest checkpoint. */
    latest: DecodedCheckpoint;
    /** Diff of every consecutive pair of checkpoints. */
    diffs: StateDiff[];
}
export declare class NotCheckpointDbError extends Error {
    name: string;
}
export declare class NotFoundError extends Error {
    name: string;
}
