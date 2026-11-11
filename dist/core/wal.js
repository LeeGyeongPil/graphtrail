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
const WAL_MAGIC_LE = 0x377f0682;
const WAL_MAGIC_BE = 0x377f0683;
const WAL_VERSION = 3007000;
const HEADER_BYTES = 32;
const FRAME_HEADER_BYTES = 24;
/** One step of the SQLite WAL checksum over `len` bytes (a multiple of 8). */
function checksum(view, offset, len, s, bigEndian) {
    let [s0, s1] = s;
    for (let i = offset; i < offset + len; i += 8) {
        s0 = (s0 + view.getUint32(i, !bigEndian) + s1) >>> 0;
        s1 = (s1 + view.getUint32(i + 4, !bigEndian) + s0) >>> 0;
    }
    return [s0, s1];
}
/**
 * Overlay the committed frames of `wal` onto `main` and return a new buffer; `main` and `wal` are not modified.
 * The returned bytes have the "legacy journal" flag set in the header so sql.js does not look for a WAL itself.
 */
export function mergeWal(main, wal) {
    if (wal.length < HEADER_BYTES)
        return { kind: "none" }; // empty or still being created: nothing committed yet
    const view = new DataView(wal.buffer, wal.byteOffset, wal.byteLength);
    const magic = view.getUint32(0);
    if (magic !== WAL_MAGIC_LE && magic !== WAL_MAGIC_BE)
        return { kind: "invalid", reason: "bad magic number" };
    // The lowest bit of the magic number tells which byte order the checksums were computed with.
    const bigEndian = (magic & 1) === 1;
    if (view.getUint32(4) !== WAL_VERSION)
        return { kind: "invalid", reason: "unsupported WAL version" };
    const rawPageSize = view.getUint32(8);
    const pageSize = rawPageSize === 1 ? 65536 : rawPageSize;
    if (pageSize < 512 || pageSize > 65536 || (pageSize & (pageSize - 1)) !== 0) {
        return { kind: "invalid", reason: "bad page size" };
    }
    const salt1 = view.getUint32(16);
    const salt2 = view.getUint32(20);
    // The header checksum is where the cumulative frame checksums start.
    let sum = checksum(view, 0, 24, [0, 0], bigEndian);
    if (sum[0] !== view.getUint32(24) || sum[1] !== view.getUint32(28)) {
        return { kind: "invalid", reason: "header checksum mismatch" };
    }
    if (main.length >= 18) {
        const mainRaw = (main[16] ?? 0) * 256 + (main[17] ?? 0);
        if ((mainRaw === 1 ? 65536 : mainRaw) !== pageSize)
            return { kind: "invalid", reason: "page size differs from the database" };
    }
    const pending = new Map(); // page number -> offset of its data, for the open transaction
    const committed = new Map();
    let dbPages = 0;
    let transactions = 0;
    const frameBytes = FRAME_HEADER_BYTES + pageSize;
    for (let off = HEADER_BYTES; off + frameBytes <= wal.length; off += frameBytes) {
        // A frame from an older WAL generation (different salt) ends the valid log.
        if (view.getUint32(off + 8) !== salt1 || view.getUint32(off + 12) !== salt2)
            break;
        sum = checksum(view, off, 8, sum, bigEndian);
        sum = checksum(view, off + FRAME_HEADER_BYTES, pageSize, sum, bigEndian);
        if (sum[0] !== view.getUint32(off + 16) || sum[1] !== view.getUint32(off + 20))
            break; // broken chain: stop here
        pending.set(view.getUint32(off), off + FRAME_HEADER_BYTES);
        const sizeAfterCommit = view.getUint32(off + 4);
        if (sizeAfterCommit > 0) {
            for (const [page, at] of pending)
                committed.set(page, at);
            pending.clear();
            dbPages = sizeAfterCommit;
            transactions += 1;
        }
        // Frames after the last commit frame (still in `pending`) are an unfinished transaction and are dropped.
    }
    if (transactions === 0)
        return { kind: "none" };
    const out = new Uint8Array(dbPages * pageSize);
    out.set(main.subarray(0, Math.min(main.length, out.length)));
    let changed = out.length !== main.length;
    for (const [page, at] of committed) {
        if (page < 1 || page > dbPages)
            continue; // truncated away by a later commit
        const target = (page - 1) * pageSize;
        const data = wal.subarray(at, at + pageSize);
        if (!changed) {
            for (let i = 0; i < pageSize; i++) {
                if (out[target + i] !== data[i]) {
                    changed = true;
                    break;
                }
            }
        }
        out.set(data, target);
    }
    // Bytes 18 and 19 are the file-format write/read versions (2 = WAL). Setting them to 1 (legacy) makes the
    // private in-memory copy open without looking for a -wal/-shm file.
    out[18] = 1;
    out[19] = 1;
    return { kind: "applied", bytes: out, transactions, changed };
}
