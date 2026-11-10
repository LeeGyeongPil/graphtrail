/**
 * SQLite access through sql.js (WASM). The file is loaded into memory as a private copy,
 * so the original database is never opened for writing and never changes.
 */
import { readFile } from "node:fs/promises";
import initSqlJs from "sql.js";
import type { Database, SqlJsStatic } from "sql.js";
import { NotCheckpointDbError, NotFoundError } from "./model.ts";

export interface OpenOptions {
  /** Provide the sql-wasm.wasm bytes when the default lookup (next to sql.js) does not work, e.g. in a bundle. */
  wasmBinary?: Uint8Array;
  /** Files larger than this (bytes) produce a warning. Default 200 MB. */
  warnBytes?: number;
}

export type Row = Record<string, unknown>;

const SQLITE_MAGIC = "SQLite format 3\u0000";
const DEFAULT_WARN_BYTES = 200 * 1024 * 1024;
const REQUIRED_COLUMNS: Record<string, string[]> = {
  checkpoints: ["thread_id", "checkpoint_ns", "checkpoint_id", "parent_checkpoint_id", "type", "checkpoint", "metadata"],
  writes: ["thread_id", "checkpoint_ns", "checkpoint_id", "task_id", "idx", "channel", "type", "value"],
};

let sqlPromise: Promise<SqlJsStatic> | undefined;
let sqlWasmKey: Uint8Array | undefined;

function loadSql(wasmBinary?: Uint8Array): Promise<SqlJsStatic> {
  if (sqlPromise === undefined || sqlWasmKey !== wasmBinary) {
    sqlWasmKey = wasmBinary;
    sqlPromise = wasmBinary
      ? initSqlJs({ wasmBinary: wasmBinary.buffer.slice(wasmBinary.byteOffset, wasmBinary.byteOffset + wasmBinary.byteLength) as ArrayBuffer })
      : initSqlJs();
  }
  return sqlPromise;
}

export class SqliteReader {
  readonly warnings: string[];
  /** True when the optional `task_path` column exists in `writes` (newer LangGraph versions). */
  readonly hasTaskPath: boolean;

  private readonly db: Database;

  private constructor(db: Database, warnings: string[]) {
    this.db = db;
    this.warnings = warnings;
    this.hasTaskPath = this.columns("writes").includes("task_path");
  }

  static async open(input: string | Uint8Array, options: OpenOptions = {}): Promise<SqliteReader> {
    let bytes: Uint8Array;
    if (typeof input === "string") {
      try {
        bytes = await readFile(input);
      } catch (error) {
        throw new NotFoundError(`cannot read database file "${input}": ${(error as Error).message}`);
      }
    } else {
      bytes = input;
    }
    if (new TextDecoder().decode(bytes.subarray(0, 16)) !== SQLITE_MAGIC) {
      throw new NotCheckpointDbError("not a LangGraph checkpoint database (not a SQLite file)");
    }
    const warnings: string[] = [];
    const limit = options.warnBytes ?? DEFAULT_WARN_BYTES;
    if (bytes.length > limit) {
      warnings.push(
        `database is ${Math.round(bytes.length / 1024 / 1024)} MB and is loaded fully into memory; use --thread to limit the work`,
      );
    }
    const SQL = await loadSql(options.wasmBinary);
    let db: Database;
    try {
      db = new SQL.Database(bytes);
    } catch (error) {
      throw new NotCheckpointDbError(`not a LangGraph checkpoint database (${(error as Error).message})`);
    }
    const reader = new SqliteReader(db, warnings);
    reader.validate();
    return reader;
  }

  private tables(): string[] {
    return this.all("SELECT name FROM sqlite_master WHERE type = 'table'").map((r) => String(r.name));
  }

  private columns(table: string): string[] {
    // PRAGMA table_info cannot take bound parameters; the name is one of our own constants.
    return this.all(`PRAGMA table_info(${table})`).map((r) => String(r.name));
  }

  private validate(): void {
    let tables: string[];
    try {
      tables = this.tables();
    } catch (error) {
      throw new NotCheckpointDbError(`not a LangGraph checkpoint database (${(error as Error).message})`);
    }
    for (const [table, required] of Object.entries(REQUIRED_COLUMNS)) {
      if (!tables.includes(table)) {
        throw new NotCheckpointDbError(`not a LangGraph checkpoint database (missing table: ${table})`);
      }
      const have = this.columns(table);
      const missing = required.filter((c) => !have.includes(c));
      if (missing.length > 0) {
        throw new NotCheckpointDbError(
          `not a LangGraph checkpoint database (table ${table} is missing column: ${missing.join(", ")})`,
        );
      }
    }
  }

  /** Run a read-only query with bound parameters. */
  all(sql: string, params: (string | number | null)[] = []): Row[] {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      const rows: Row[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as Row);
      return rows;
    } finally {
      stmt.free();
    }
  }

  close(): void {
    this.db.close();
  }
}
