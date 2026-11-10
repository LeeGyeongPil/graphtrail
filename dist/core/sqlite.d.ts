export interface OpenOptions {
    /** Provide the sql-wasm.wasm bytes when the default lookup (next to sql.js) does not work, e.g. in a bundle. */
    wasmBinary?: Uint8Array;
    /** Files larger than this (bytes) produce a warning. Default 200 MB. */
    warnBytes?: number;
}
export type Row = Record<string, unknown>;
export declare class SqliteReader {
    readonly warnings: string[];
    /** True when the optional `task_path` column exists in `writes` (newer LangGraph versions). */
    readonly hasTaskPath: boolean;
    private readonly db;
    private constructor();
    static open(input: string | Uint8Array, options?: OpenOptions): Promise<SqliteReader>;
    private tables;
    private columns;
    private validate;
    /** Run a read-only query with bound parameters. */
    all(sql: string, params?: (string | number | null)[]): Row[];
    close(): void;
}
