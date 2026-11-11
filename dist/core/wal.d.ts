/**
 * Read-only SQLite WAL merge. A running LangGraph app keeps its database in WAL mode, so the
 * newest committed pages live in `<db>-wal` until SQLite checkpoints them into the main file.
 * This module overlays the *committed* frames of a WAL onto the main-file bytes, in memory only.
 * Nothing is written, no checkpoint is run, and the `-shm` file is neither read nor needed.
 *
 * Format reference: https://www.sqlite.org/fileformat2.html#walformat
 * - 32-byte header: magic, version, page size, checkpoint seq, salt-1, salt-2, checksum (2 words)
 * - then frames of 24-byte header (page no, db size after commit or 0, salt-1, salt-2, checksum) + one page
 * - checksums are cumulative, start from the header checksum, and use the byte order the magic number selects
 * - a transaction counts only when its commit frame (db size > 0) is reached with every checksum valid
 */
export type WalMergeResult = 
/** The WAL held nothing to apply (empty, no committed frame, frames from an older generation). Not an error. */
{
    kind: "none";
}
/** The WAL header is not valid, so it cannot be trusted at all. */
 | {
    kind: "invalid";
    reason: string;
}
/** Committed frames were applied. `transactions` counts commit frames; `changed` is false when they equal the main file. */
 | {
    kind: "applied";
    bytes: Uint8Array;
    transactions: number;
    changed: boolean;
};
/**
 * Overlay the committed frames of `wal` onto `main` and return a new buffer; `main` and `wal` are not modified.
 * The returned bytes have the "legacy journal" flag set in the header so sql.js does not look for a WAL itself.
 */
export declare function mergeWal(main: Uint8Array, wal: Uint8Array): WalMergeResult;
