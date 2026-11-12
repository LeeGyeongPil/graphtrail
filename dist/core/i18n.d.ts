/**
 * Message table for every user-visible sentence (CLI, reports, VS Code extension).
 * Two languages with identical keys; `{name}` placeholders are replaced by `t()`.
 * Data from the database (thread ids, keys, node names, message contents) is never translated.
 */
export type Lang = "en" | "ko";
export declare const LANGS: readonly Lang[];
declare const en: {
    readonly walNameGeneric: "the WAL";
    readonly dbNameGeneric: "the database";
    readonly walUnusable: "{walName} could not be used; showing only data already checkpointed into {dbName}";
    readonly walApplied: "included {n} committed transaction(s) from {walName} that are not yet checkpointed";
    readonly bigDb: "database is {mb} MB and is loaded fully into memory; use --thread to limit the work";
    readonly cannotRead: 'cannot read database file "{path}": {detail}';
    readonly notDbNotSqlite: "not a LangGraph checkpoint database (not a SQLite file)";
    readonly notDbDetail: "not a LangGraph checkpoint database ({detail})";
    readonly notDbMissingTable: "not a LangGraph checkpoint database (missing table: {table})";
    readonly notDbMissingColumn: "not a LangGraph checkpoint database (table {table} is missing column: {columns})";
    readonly noCheckpoints: 'no checkpoints for thread "{thread}" in namespace "{ns}"; run "graphtrail threads" to list them';
    readonly noIdPrefix: 'no checkpoint id starts with "{id}" in thread "{thread}"';
    readonly ambiguousId: 'checkpoint id prefix "{id}" is ambiguous ({n} matches); use more characters';
    readonly noStep: 'thread "{thread}" has no step {step}; available steps: {steps}';
    readonly branches: 'thread "{thread}" has {n} branches (fork or update_state); showing the chain of the newest one';
    readonly kindAdded: "added";
    readonly kindRemoved: "removed";
    readonly kindChanged: "changed";
    readonly changeLine: "{kind} {key}: {detail}";
    readonly messageLine: "message: {text}";
    readonly toolLine: "tool: {text}";
    readonly noChange: "no state change";
    readonly mdTitle: "graphtrail report: thread {thread}{ns}";
    readonly mdSchema: "schema version: {v}";
    readonly mdStatus: "status: {status}";
    readonly mdWriter: "written by: {writer}";
    readonly mdCheckpoints: "checkpoints: {n}";
    readonly timelineHeading: "Timeline";
    readonly timelineNote: "Each row is the step that runs from that checkpoint: nodes are estimated from versions_seen (the database does not store node names), changed keys are the state difference that step produced.";
    readonly colStep: "step";
    readonly colSource: "source";
    readonly colNodes: "nodes (estimated)";
    readonly colChanged: "changed keys";
    readonly colInterrupt: "interrupt";
    readonly stepsHeading: "Steps";
    readonly stepRange: "step {from} -> {to}";
    readonly errorsHeading: "Errors";
    readonly errorLine: "step {step}: {text}";
    readonly htmlTitle: "graphtrail: {thread}";
    readonly htmlHeading: "graphtrail: thread {thread}{ns}";
    readonly htmlSummary: "status {status}, written by {writer}, {n} checkpoints, schema {v}";
    readonly help: "graphtrail - read LangGraph SqliteSaver checkpoint databases without running any code\n\nUsage:\n  graphtrail threads  <db> [--json]\n  graphtrail timeline <db> [--thread ID] [--ns NS] [--json]\n  graphtrail show     <db> [--thread ID] [--ns NS] [--step N | --id PREFIX] [--json]\n  graphtrail diff     <db> [--thread ID] [--ns NS] --from STEP --to STEP [--json]\n  graphtrail export   <db> [--thread ID] [--ns NS] --format json|md|html\n\nOptions:\n  --thread ID   thread to read (optional when the database has exactly one thread)\n  --ns NS       subgraph checkpoint namespace (default: root graph)\n  --lang en|ko  display language (default: GRAPHTRAIL_LANG, then LC_ALL / LC_MESSAGES / LANG; English if not Korean)\n  --version     print the version\n  --help        print this help\n\nEnvironment: GRAPHTRAIL_LANG=en|ko sets the display language. JSON output is never translated.\nExit codes: 0 ok, 2 not a LangGraph checkpoint database or invalid arguments, 1 other errors.\n";
    readonly warningPrefix: "warning: ";
    readonly threadRequired: "--thread is required; this database has {n} threads: {ids}";
    readonly unknownCommand: 'unknown command "{command}"; run "graphtrail --help"';
    readonly missingPath: "missing database path; usage: graphtrail {command} <db>";
    readonly stepInteger: '--step must be an integer, got "{value}"';
    readonly diffNeeds: "diff needs --from and --to (step numbers or checkpoint id prefixes)";
    readonly formatInvalid: '--format must be json, md or html, got "{value}"';
    readonly langInvalid: '--lang must be en or ko, got "{value}"';
    readonly rootNs: "(root)";
    readonly colThread: "thread";
    readonly colNs: "ns";
    readonly colCheckpointCount: "checkpoints";
    readonly colLastStep: "last step";
    readonly colStatus: "status";
    readonly colWriter: "writer";
    readonly toolCallLine: "  step {step}: tool call {name}({args})";
    readonly toolResultLine: "  step {step}: tool result {text}";
    readonly interruptLine: "  step {step}: __interrupt__ {text}";
    readonly errorStepLine: "  step {step}: __error__ {text}";
    readonly showHead: "thread {thread}{ns}  step {step}  source {source}";
    readonly showCheckpoint: "checkpoint {value}";
    readonly showParent: "parent     {value}";
    readonly showTs: "ts         {value}";
    readonly showState: "state:";
    readonly showHint: "(use --json for the full tagged state; {n} writes recorded after this checkpoint)";
    readonly diffHead: "step {from} -> step {to}";
    readonly diffAddedIds: "added message ids: {ids}";
    readonly diffRemovedIds: "removed message ids: {ids}";
    readonly parseUnknownOption: "{raw}";
    readonly parseInvalidValue: "{raw}";
    readonly parseUnexpectedPositional: "{raw}";
    readonly dialogFilter: "SQLite databases";
    readonly dialogOpenLabel: "Open checkpoint database";
    readonly treeStep: "step {step}";
    readonly treeInput: "input";
    readonly treeThreadSummary: "{status}, {n} checkpoints";
    readonly treeShowThread: "Show thread";
    readonly emptyDb: "This database has no checkpoints.";
    readonly editorError: "graphtrail: {text}";
};
export type MessageKey = keyof typeof en;
export declare const MESSAGES: Record<Lang, Record<MessageKey, string>>;
/** Look up a message and fill its `{name}` placeholders. Unknown placeholders stay as written. */
export declare function t(lang: Lang, key: MessageKey, params?: Record<string, string | number>): string;
/** `ko`, `ko-KR`, `ko_KR.UTF-8` mean Korean; anything else (including undefined) means English. */
export declare function resolveLang(value: string | undefined | null): Lang;
/**
 * CLI language: `--lang` value > GRAPHTRAIL_LANG > LC_ALL > LC_MESSAGES > LANG.
 * The first variable that is set and non-empty decides (like POSIX locale lookup); not Korean means English.
 */
export declare function langFromEnv(env: Record<string, string | undefined>, flag?: string): Lang;
export {};
