import type { Lang } from "./i18n.ts";
export interface OpenOptions {
    /** Provide the sql-wasm.wasm bytes when the default lookup (next to sql.js) does not work, e.g. in a bundle. */
    wasmBinary?: Uint8Array;
    /** Files larger than this (bytes) produce a warning. Default 200 MB. */
    warnBytes?: number;
    /**
     * Bytes of the `<db>-wal` file that belongs to the database bytes passed in (byte input only).
     * Its committed frames are applied to the in-memory copy. For a path input the `-wal` file is found automatically.
     */
    wal?: Uint8Array;
    /** Language of error and warning messages. Default "en". Data from the database is never translated. */
    lang?: Lang;
}
export type Row = Record<string, unknown>;
export declare class SqliteReader {
    readonly warnings: string[];
    /** True when the optional `task_path` column exists in `writes` (newer LangGraph versions). */
    readonly hasTaskPath: boolean;
    private readonly db;
    private readonly lang;
    private constructor();
    static open(input: string | Uint8Array, options?: OpenOptions): Promise<SqliteReader>;
    private tables;
    private columns;
    private validate;
    /** Run a read-only query with bound parameters. */
    all(sql: string, params?: (string | number | null)[]): Row[];
    close(): void;
}
