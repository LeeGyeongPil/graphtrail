/**
 * SQLite access through sql.js (WASM). The file is loaded into memory as a private copy,
 * so the original database is never opened for writing and never changes.
 */
import { readFile } from "node:fs/promises";
import initSqlJs from "sql.js";
import { NotCheckpointDbError, NotFoundError } from "./model.js";
import { mergeWal } from "./wal.js";
import { t } from "./i18n.js";
const SQLITE_MAGIC = "SQLite format 3\u0000";
const DEFAULT_WARN_BYTES = 200 * 1024 * 1024;
const REQUIRED_COLUMNS = {
    checkpoints: ["thread_id", "checkpoint_ns", "checkpoint_id", "parent_checkpoint_id", "type", "checkpoint", "metadata"],
    writes: ["thread_id", "checkpoint_ns", "checkpoint_id", "task_id", "idx", "channel", "type", "value"],
};
let sqlPromise;
let sqlWasmKey;
function loadSql(wasmBinary) {
    if (sqlPromise === undefined || sqlWasmKey !== wasmBinary) {
        sqlWasmKey = wasmBinary;
        sqlPromise = wasmBinary
            ? initSqlJs({ wasmBinary: wasmBinary.buffer.slice(wasmBinary.byteOffset, wasmBinary.byteOffset + wasmBinary.byteLength) })
            : initSqlJs();
    }
    return sqlPromise;
}
export class SqliteReader {
    warnings;
    /** True when the optional `task_path` column exists in `writes` (newer LangGraph versions). */
    hasTaskPath;
    db;
    lang;
    constructor(db, warnings, lang) {
        this.lang = lang;
        this.db = db;
        this.warnings = warnings;
        this.hasTaskPath = this.columns("writes").includes("task_path");
    }
    static async open(input, options = {}) {
        const warnings = [];
        const lang = options.lang ?? "en";
        let bytes;
        let wal = options.wal;
        // Name used in messages: the "-wal" path next to the database, or a generic phrase for byte input.
        const walName = typeof input === "string" ? `${input}-wal` : t(lang, "walNameGeneric");
        const dbName = typeof input === "string" ? input : t(lang, "dbNameGeneric");
        if (typeof input === "string") {
            // Read the -wal first and the main file second: if a checkpoint runs in between, the main file is
            // newer than the log we hold, which is safe (the log's pages are then already in the main file).
            if (wal === undefined) {
                try {
                    wal = await readFile(`${input}-wal`);
                }
                catch (error) {
                    // No -wal is the normal case. Any other failure (permissions, a directory...) must not stop the read.
                    if (error.code !== "ENOENT") {
                        warnings.push(t(lang, "walUnusable", { walName, dbName }));
                    }
                }
            }
            try {
                bytes = await readFile(input);
            }
            catch (error) {
                throw new NotFoundError(t(lang, "cannotRead", { path: input, detail: error.message }));
            }
        }
        else {
            bytes = input;
        }
        if (new TextDecoder().decode(bytes.subarray(0, 16)) !== SQLITE_MAGIC) {
            throw new NotCheckpointDbError(t(lang, "notDbNotSqlite"));
        }
        if (wal !== undefined) {
            const merged = mergeWal(bytes, wal);
            if (merged.kind === "invalid") {
                warnings.push(t(lang, "walUnusable", { walName, dbName }));
            }
            else if (merged.kind === "applied") {
                bytes = merged.bytes;
                if (merged.changed) {
                    warnings.push(t(lang, "walApplied", { n: merged.transactions, walName }));
                }
            }
        }
        const limit = options.warnBytes ?? DEFAULT_WARN_BYTES;
        if (bytes.length > limit) {
            warnings.push(t(lang, "bigDb", { mb: Math.round(bytes.length / 1024 / 1024) }));
        }
        const SQL = await loadSql(options.wasmBinary);
        let db;
        try {
            db = new SQL.Database(bytes);
        }
        catch (error) {
            throw new NotCheckpointDbError(t(lang, "notDbDetail", { detail: error.message }));
        }
        const reader = new SqliteReader(db, warnings, lang);
        reader.validate();
        return reader;
    }
    tables() {
        return this.all("SELECT name FROM sqlite_master WHERE type = 'table'").map((r) => String(r.name));
    }
    columns(table) {
        // PRAGMA table_info cannot take bound parameters; the name is one of our own constants.
        return this.all(`PRAGMA table_info(${table})`).map((r) => String(r.name));
    }
    validate() {
        let tables;
        try {
            tables = this.tables();
        }
        catch (error) {
            throw new NotCheckpointDbError(t(this.lang, "notDbDetail", { detail: error.message }));
        }
        for (const [table, required] of Object.entries(REQUIRED_COLUMNS)) {
            if (!tables.includes(table)) {
                throw new NotCheckpointDbError(t(this.lang, "notDbMissingTable", { table }));
            }
            const have = this.columns(table);
            const missing = required.filter((c) => !have.includes(c));
            if (missing.length > 0) {
                throw new NotCheckpointDbError(t(this.lang, "notDbMissingColumn", { table, columns: missing.join(", ") }));
            }
        }
    }
    /** Run a read-only query with bound parameters. */
    all(sql, params = []) {
        const stmt = this.db.prepare(sql);
        try {
            stmt.bind(params);
            const rows = [];
            while (stmt.step())
                rows.push(stmt.getAsObject());
            return rows;
        }
        finally {
            stmt.free();
        }
    }
    close() {
        this.db.close();
    }
}
