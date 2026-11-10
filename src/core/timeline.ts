/**
 * Thread list, parent-chain timeline and checkpoint lookup.
 *
 * Where the facts come from (see docs/format.md):
 * - `checkpoints` rows form a chain through `parent_checkpoint_id`.
 * - `writes` rows hold what each task produced *after* the checkpoint they belong to.
 *   The node name is not stored, so it is estimated from `versions_seen` of the next checkpoint.
 */
import { decodeMetadata, decodeTyped } from "./decode.ts";
import { extractToolCalls, extractToolResult, isInternalChannel, stable } from "./diff.ts";
import { NotFoundError } from "./model.ts";
import type {
  DecodedCheckpoint,
  TaskInfo,
  ThreadStatus,
  ThreadSummary,
  TimelineEntry,
  ToolCall,
  ToolResult,
  Writer,
} from "./model.ts";
import { SqliteReader } from "./sqlite.ts";
import type { OpenOptions } from "./sqlite.ts";

/** Internal record: the public checkpoint plus the version maps used for node estimation. */
interface Loaded {
  cp: DecodedCheckpoint;
  versions: Record<string, unknown>;
  seen: Record<string, Record<string, unknown>>;
  writer: Writer;
}

/** The "null task" LangGraph uses for resume values; it is not a node run. */
const NULL_TASK_ID = "00000000-0000-0000-0000-000000000000";
/** Keys of `versions_seen` that are bookkeeping, not nodes. */
const NOT_NODES = new Set(["__input__", "__interrupt__", "__start__", "__end__"]);

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asSeen(value: unknown): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [node, versions] of Object.entries(asRecord(value))) out[node] = asRecord(versions);
  return out;
}

function writerOf(type: string): Writer {
  if (type === "msgpack") return "python";
  if (type === "json") return "js";
  return "unknown";
}

function flatten(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value === null || value === undefined ? [] : [value];
}

/** Read-only view of one LangGraph SqliteSaver database. */
export class CheckpointDb {
  readonly warnings: string[];
  private readonly reader: SqliteReader;
  private readonly cache = new Map<string, Loaded[]>();

  private constructor(reader: SqliteReader) {
    this.reader = reader;
    this.warnings = reader.warnings;
  }

  /** @throws NotCheckpointDbError when the file is not a LangGraph checkpoint database. */
  static async open(input: string | Uint8Array, options: OpenOptions = {}): Promise<CheckpointDb> {
    return new CheckpointDb(await SqliteReader.open(input, options));
  }

  close(): void {
    this.cache.clear();
    this.reader.close();
  }

  /** One row per (thread, namespace). Subgraph namespaces are listed separately. */
  listThreads(): ThreadSummary[] {
    const pairs = this.reader.all(
      "SELECT DISTINCT thread_id, checkpoint_ns FROM checkpoints ORDER BY thread_id, checkpoint_ns",
    );
    return pairs.map((row) => {
      const threadId = String(row.thread_id);
      const ns = String(row.checkpoint_ns);
      const chain = this.chain(threadId, ns);
      const entries = this.entries(threadId, ns);
      const last = chain.at(-1);
      return {
        threadId,
        ns,
        checkpoints: this.count(threadId, ns),
        lastStep: last?.cp.step ?? -1,
        status: this.statusOf(entries, last),
        writer: last?.writer ?? "unknown",
      };
    });
  }

  /** Entries from the first checkpoint (step -1) to the latest, following parent_checkpoint_id. */
  timeline(threadId: string, ns = ""): TimelineEntry[] {
    if (this.chain(threadId, ns).length === 0) {
      throw new NotFoundError(`no checkpoints for thread "${threadId}" in namespace "${ns}"; run "graphtrail threads" to list them`);
    }
    return this.entries(threadId, ns);
  }

  /** Number of checkpoint rows of a thread/namespace (includes rows outside the main chain). */
  private count(threadId: string, ns: string): number {
    const rows = this.reader.all(
      "SELECT COUNT(*) AS n FROM checkpoints WHERE thread_id = ? AND checkpoint_ns = ?",
      [threadId, ns],
    );
    return Number(rows[0]?.n ?? 0);
  }

  /** Every checkpoint of the main chain, decoded, oldest first. */
  checkpoints(threadId: string, ns = ""): DecodedCheckpoint[] {
    return this.chain(threadId, ns).map((l) => l.cp);
  }

  /** Select by `step` (metadata step) or by `id` (unique prefix allowed); no selector means the latest. */
  getCheckpoint(threadId: string, sel: { step?: number; id?: string } = {}, ns = ""): DecodedCheckpoint {
    const chain = this.chain(threadId, ns);
    if (chain.length === 0) {
      throw new NotFoundError(`no checkpoints for thread "${threadId}" in namespace "${ns}"; run "graphtrail threads" to list them`);
    }
    if (sel.id !== undefined) {
      const wanted = sel.id;
      const hits = chain.filter((l) => l.cp.checkpointId.startsWith(wanted));
      if (hits.length === 1 && hits[0]) return hits[0].cp;
      throw new NotFoundError(
        hits.length === 0
          ? `no checkpoint id starts with "${wanted}" in thread "${threadId}"`
          : `checkpoint id prefix "${wanted}" is ambiguous (${hits.length} matches); use more characters`,
      );
    }
    if (sel.step !== undefined) {
      const hit = chain.find((l) => l.cp.step === sel.step);
      if (hit) return hit.cp;
      const steps = chain.map((l) => l.cp.step).join(", ");
      throw new NotFoundError(`thread "${threadId}" has no step ${sel.step}; available steps: ${steps}`);
    }
    return (chain.at(-1) as Loaded).cp;
  }

  // ---- internals -------------------------------------------------------------------------

  private chain(threadId: string, ns: string): Loaded[] {
    const key = `${threadId}\u0000${ns}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const rows = this.reader.all(
      "SELECT checkpoint_id, parent_checkpoint_id, type, checkpoint, metadata FROM checkpoints WHERE thread_id = ? AND checkpoint_ns = ? ORDER BY checkpoint_id",
      [threadId, ns],
    );
    const byId = new Map<string, Record<string, unknown>>();
    const hasChild = new Set<string>();
    for (const row of rows) {
      byId.set(String(row.checkpoint_id), row);
      if (row.parent_checkpoint_id !== null && row.parent_checkpoint_id !== undefined) {
        hasChild.add(String(row.parent_checkpoint_id));
      }
    }
    const leaves = [...byId.keys()].filter((id) => !hasChild.has(id)).sort();
    if (leaves.length > 1) {
      this.warnings.push(
        `thread "${threadId}" has ${leaves.length} branches (fork or update_state); showing the chain of the newest one`,
      );
    }
    const result: Loaded[] = [];
    const visited = new Set<string>();
    let walker: string | null = leaves.at(-1) ?? null;
    // The visited set stops a corrupted file whose parent pointers form a loop.
    while (walker !== null && !visited.has(walker)) {
      visited.add(walker);
      const row = byId.get(walker);
      if (!row) break;
      result.push(this.load(threadId, ns, row));
      walker = row.parent_checkpoint_id === null || row.parent_checkpoint_id === undefined ? null : String(row.parent_checkpoint_id);
    }
    result.reverse();
    this.cache.set(key, result);
    return result;
  }

  private load(threadId: string, ns: string, row: Record<string, unknown>): Loaded {
    const type = String(row.type);
    const blob = decodeTyped(type, row.checkpoint as Uint8Array | null);
    const data = asRecord(blob);
    const metadata = decodeMetadata(row.metadata as Uint8Array | string | null);
    const checkpointId = String(row.checkpoint_id);
    const step = typeof metadata.step === "number" ? metadata.step : -1;
    const cp: DecodedCheckpoint = {
      threadId,
      ns,
      checkpointId,
      parentId: row.parent_checkpoint_id === null || row.parent_checkpoint_id === undefined ? null : String(row.parent_checkpoint_id),
      step,
      source: typeof metadata.source === "string" ? metadata.source : "unknown",
      ts: typeof data.ts === "string" ? data.ts : null,
      version: typeof data.v === "number" ? data.v : null,
      channelValues: asRecord(data.channel_values),
      metadata,
      writes: this.writesOf(threadId, ns, checkpointId),
    };
    return { cp, versions: asRecord(data.channel_versions), seen: asSeen(data.versions_seen), writer: writerOf(type) };
  }

  private writesOf(threadId: string, ns: string, checkpointId: string): DecodedCheckpoint["writes"] {
    const rows = this.reader.all(
      "SELECT task_id, idx, channel, type, value FROM writes WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ? ORDER BY rowid",
      [threadId, ns, checkpointId],
    );
    return rows.map((r) => ({
      taskId: String(r.task_id),
      idx: Number(r.idx),
      channel: String(r.channel),
      value: decodeTyped(r.type === null ? null : String(r.type), r.value as Uint8Array | null),
    }));
  }

  /** Nodes that run after `current`: those whose `versions_seen` moved in the child checkpoint. */
  private nodesAfter(current: Loaded, child: Loaded | undefined): string[] {
    if (child) {
      return Object.keys(child.seen).filter(
        (node) => !NOT_NODES.has(node) && stable(child.seen[node]) !== stable(current.seen[node] ?? {}),
      );
    }
    // Latest checkpoint: pending nodes are those with an unconsumed `branch:to:<node>` channel.
    const pending: string[] = [];
    for (const channel of Object.keys(current.versions)) {
      if (!channel.startsWith("branch:to:")) continue;
      const node = channel.slice("branch:to:".length);
      if (NOT_NODES.has(node)) continue;
      if (current.seen[node]?.[channel] !== current.versions[channel]) pending.push(node);
    }
    return pending;
  }

  private entries(threadId: string, ns: string): TimelineEntry[] {
    const chain = this.chain(threadId, ns);
    return chain.map((current, index): TimelineEntry => {
      const child = chain[index + 1];
      const cp = current.cp;
      // Changed keys use the same point of view as `nodes`: what the step that runs *from* this
      // checkpoint changed, i.e. the difference between this checkpoint and its child.
      const after = child?.cp.channelValues;
      const changedKeys = !after
        ? []
        : [...new Set([...Object.keys(cp.channelValues), ...Object.keys(after)])].filter(
            (k) =>
              !isInternalChannel(k) &&
              (k in cp.channelValues !== k in after || stable(cp.channelValues[k]) !== stable(after[k])),
          );

      // Group writes per task. The null task only carries resume values.
      const byTask = new Map<string, TaskInfo>();
      const interrupts: unknown[] = [];
      const errors: unknown[] = [];
      const toolCalls: ToolCall[] = [];
      const toolResults: ToolResult[] = [];
      for (const w of cp.writes) {
        if (w.channel === "__interrupt__") interrupts.push(...flatten(w.value));
        if (w.channel === "__error__") errors.push(w.value);
        if (w.taskId === NULL_TASK_ID) continue;
        let task = byTask.get(w.taskId);
        if (!task) {
          task = { taskId: w.taskId, node: null, channels: [] };
          byTask.set(w.taskId, task);
        }
        const isData = !w.channel.startsWith("__") && !w.channel.startsWith("branch:to:");
        if (isData && !task.channels.includes(w.channel)) task.channels.push(w.channel);
        if (w.channel === "messages") {
          for (const message of flatten(w.value)) {
            toolCalls.push(...extractToolCalls(message));
            const result = extractToolResult(message);
            if (result) toolResults.push(result);
          }
        }
      }
      const tasks = [...byTask.values()];
      // The latest checkpoint without any writes has nothing pending, whatever its version maps say.
      const nodes = child === undefined && tasks.length === 0 ? [] : this.nodesAfter(current, child);
      if (tasks.length === 1 && nodes.length === 1 && tasks[0]) tasks[0].node = nodes[0] ?? null;
      return {
        checkpointId: cp.checkpointId,
        parentId: cp.parentId,
        step: cp.step,
        source: cp.source,
        ts: cp.ts,
        changedKeys,
        nodes,
        tasks,
        toolCalls,
        toolResults,
        interrupts,
        errors,
      };
    });
  }

  private statusOf(entries: TimelineEntry[], last: Loaded | undefined): ThreadStatus {
    const tail = entries.at(-1);
    if (!tail || !last) return "pending";
    if (tail.interrupts.length > 0) return "interrupted";
    if (tail.errors.length > 0 || tail.nodes.length > 0) return "pending";
    // An input checkpoint that was never run is waiting for its first step.
    return last.cp.source === "input" ? "pending" : "done";
  }
}
