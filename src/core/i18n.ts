/**
 * Message table for every user-visible sentence (CLI, reports, VS Code extension).
 * Two languages with identical keys; `{name}` placeholders are replaced by `t()`.
 * Data from the database (thread ids, keys, node names, message contents) is never translated.
 */
export type Lang = "en" | "ko";

export const LANGS: readonly Lang[] = ["en", "ko"];

const HELP_EN = `graphtrail - read LangGraph SqliteSaver checkpoint databases without running any code

Usage:
  graphtrail threads  <db> [--json]
  graphtrail timeline <db> [--thread ID] [--ns NS] [--json]
  graphtrail show     <db> [--thread ID] [--ns NS] [--step N | --id PREFIX] [--json]
  graphtrail diff     <db> [--thread ID] [--ns NS] --from STEP --to STEP [--json]
  graphtrail export   <db> [--thread ID] [--ns NS] --format json|md|html

Options:
  --thread ID   thread to read (optional when the database has exactly one thread)
  --ns NS       subgraph checkpoint namespace (default: root graph)
  --lang en|ko  display language (default: GRAPHTRAIL_LANG, then LC_ALL / LC_MESSAGES / LANG; English if not Korean)
  --version     print the version
  --help        print this help

Environment: GRAPHTRAIL_LANG=en|ko sets the display language. JSON output is never translated.
Exit codes: 0 ok, 2 not a LangGraph checkpoint database or invalid arguments, 1 other errors.
`;

const HELP_KO = `graphtrail - 코드를 실행하지 않고 LangGraph SqliteSaver 체크포인트 데이터베이스를 읽습니다

사용법:
  graphtrail threads  <db> [--json]
  graphtrail timeline <db> [--thread ID] [--ns NS] [--json]
  graphtrail show     <db> [--thread ID] [--ns NS] [--step N | --id PREFIX] [--json]
  graphtrail diff     <db> [--thread ID] [--ns NS] --from STEP --to STEP [--json]
  graphtrail export   <db> [--thread ID] [--ns NS] --format json|md|html

옵션:
  --thread ID   읽을 스레드 (데이터베이스에 스레드가 하나뿐이면 생략할 수 있습니다)
  --ns NS       서브그래프 체크포인트 네임스페이스 (기본값: 루트 그래프)
  --lang en|ko  표시 언어 (기본값: GRAPHTRAIL_LANG, 그다음 LC_ALL / LC_MESSAGES / LANG이며, 한국어가 아니면 영어입니다)
  --version     버전을 출력합니다
  --help        이 도움말을 출력합니다

환경 변수: GRAPHTRAIL_LANG=en|ko 로 표시 언어를 정합니다. JSON 출력은 번역하지 않습니다.
종료 코드: 0 정상, 2 LangGraph 체크포인트 데이터베이스가 아니거나 인자가 잘못됨, 1 그 밖의 오류.
`;

const en = {
  // ---- core: database access ----
  walNameGeneric: "the WAL",
  dbNameGeneric: "the database",
  walUnusable: "{walName} could not be used; showing only data already checkpointed into {dbName}",
  walApplied: "included {n} committed transaction(s) from {walName} that are not yet checkpointed",
  bigDb: "database is {mb} MB and is loaded fully into memory; use --thread to limit the work",
  cannotRead: 'cannot read database file "{path}": {detail}',
  notDbNotSqlite: "not a LangGraph checkpoint database (not a SQLite file)",
  notDbDetail: "not a LangGraph checkpoint database ({detail})",
  notDbMissingTable: "not a LangGraph checkpoint database (missing table: {table})",
  notDbMissingColumn: "not a LangGraph checkpoint database (table {table} is missing column: {columns})",
  // ---- core: timeline ----
  noCheckpoints: 'no checkpoints for thread "{thread}" in namespace "{ns}"; run "graphtrail threads" to list them',
  noIdPrefix: 'no checkpoint id starts with "{id}" in thread "{thread}"',
  ambiguousId: 'checkpoint id prefix "{id}" is ambiguous ({n} matches); use more characters',
  noStep: 'thread "{thread}" has no step {step}; available steps: {steps}',
  branches: 'thread "{thread}" has {n} branches (fork or update_state); showing the chain of the newest one',
  // ---- reports ----
  kindAdded: "added",
  kindRemoved: "removed",
  kindChanged: "changed",
  changeLine: "{kind} {key}: {detail}",
  messageLine: "message: {text}",
  toolLine: "tool: {text}",
  noChange: "no state change",
  mdTitle: "graphtrail report: thread {thread}{ns}",
  mdSchema: "schema version: {v}",
  mdStatus: "status: {status}",
  mdWriter: "written by: {writer}",
  mdCheckpoints: "checkpoints: {n}",
  timelineHeading: "Timeline",
  timelineNote:
    "Each row is the step that runs from that checkpoint: nodes are estimated from versions_seen (the database does not store node names), changed keys are the state difference that step produced.",
  colStep: "step",
  colSource: "source",
  colNodes: "nodes (estimated)",
  colChanged: "changed keys",
  colInterrupt: "interrupt",
  stepsHeading: "Steps",
  stepRange: "step {from} -> {to}",
  errorsHeading: "Errors",
  errorLine: "step {step}: {text}",
  htmlTitle: "graphtrail: {thread}",
  htmlHeading: "graphtrail: thread {thread}{ns}",
  htmlSummary: "status {status}, written by {writer}, {n} checkpoints, schema {v}",
  // ---- CLI ----
  help: HELP_EN,
  warningPrefix: "warning: ",
  threadRequired: "--thread is required; this database has {n} threads: {ids}",
  unknownCommand: 'unknown command "{command}"; run "graphtrail --help"',
  missingPath: "missing database path; usage: graphtrail {command} <db>",
  stepInteger: '--step must be an integer, got "{value}"',
  diffNeeds: "diff needs --from and --to (step numbers or checkpoint id prefixes)",
  formatInvalid: '--format must be json, md or html, got "{value}"',
  langInvalid: '--lang must be en or ko, got "{value}"',
  rootNs: "(root)",
  colThread: "thread",
  colNs: "ns",
  colCheckpointCount: "checkpoints",
  colLastStep: "last step",
  colStatus: "status",
  colWriter: "writer",
  toolCallLine: "  step {step}: tool call {name}({args})",
  toolResultLine: "  step {step}: tool result {text}",
  interruptLine: "  step {step}: __interrupt__ {text}",
  errorStepLine: "  step {step}: __error__ {text}",
  showHead: "thread {thread}{ns}  step {step}  source {source}",
  showCheckpoint: "checkpoint {value}",
  showParent: "parent     {value}",
  showTs: "ts         {value}",
  showState: "state:",
  showHint: "(use --json for the full tagged state; {n} writes recorded after this checkpoint)",
  diffHead: "step {from} -> step {to}",
  diffAddedIds: "added message ids: {ids}",
  diffRemovedIds: "removed message ids: {ids}",
  parseUnknownOption: "{raw}",
  parseInvalidValue: "{raw}",
  parseUnexpectedPositional: "{raw}",
  // ---- VS Code extension ----
  dialogFilter: "SQLite databases",
  dialogOpenLabel: "Open checkpoint database",
  treeStep: "step {step}",
  treeInput: "input",
  treeThreadSummary: "{status}, {n} checkpoints",
  treeShowThread: "Show thread",
  emptyDb: "This database has no checkpoints.",
  editorError: "graphtrail: {text}",
} as const;

export type MessageKey = keyof typeof en;

const ko: Record<MessageKey, string> = {
  walNameGeneric: "WAL",
  dbNameGeneric: "데이터베이스",
  walUnusable: "{walName}을(를) 사용할 수 없어 {dbName}에 이미 체크포인트된 데이터만 표시합니다",
  walApplied: "아직 체크포인트되지 않은 커밋된 트랜잭션 {n}개를 {walName}에서 포함했습니다",
  bigDb: "데이터베이스 크기가 {mb} MB이며 전체를 메모리에 불러옵니다. --thread 로 작업 범위를 줄이십시오",
  cannotRead: '데이터베이스 파일 "{path}"을(를) 읽을 수 없습니다: {detail}',
  notDbNotSqlite: "LangGraph 체크포인트 데이터베이스가 아닙니다 (SQLite 파일이 아닙니다)",
  notDbDetail: "LangGraph 체크포인트 데이터베이스가 아닙니다 ({detail})",
  notDbMissingTable: "LangGraph 체크포인트 데이터베이스가 아닙니다 (테이블이 없습니다: {table})",
  notDbMissingColumn: "LangGraph 체크포인트 데이터베이스가 아닙니다 (테이블 {table}에 열이 없습니다: {columns})",
  noCheckpoints: '네임스페이스 "{ns}"의 스레드 "{thread}"에 체크포인트가 없습니다. "graphtrail threads"로 목록을 확인하십시오',
  noIdPrefix: '스레드 "{thread}"에 "{id}"(으)로 시작하는 체크포인트 ID가 없습니다',
  ambiguousId: '체크포인트 ID 접두사 "{id}"이(가) 모호합니다 ({n}개 일치). 더 많은 글자를 입력하십시오',
  noStep: '스레드 "{thread}"에 단계 {step}이(가) 없습니다. 사용할 수 있는 단계: {steps}',
  branches: '스레드 "{thread}"에 분기가 {n}개 있습니다 (fork 또는 update_state). 가장 최신 분기의 체인을 표시합니다',
  kindAdded: "추가",
  kindRemoved: "삭제",
  kindChanged: "변경",
  changeLine: "{kind} {key}: {detail}",
  messageLine: "메시지: {text}",
  toolLine: "도구: {text}",
  noChange: "상태 변경 없음",
  mdTitle: "graphtrail 보고서: 스레드 {thread}{ns}",
  mdSchema: "스키마 버전: {v}",
  mdStatus: "상태: {status}",
  mdWriter: "기록 주체: {writer}",
  mdCheckpoints: "체크포인트: {n}개",
  timelineHeading: "타임라인",
  timelineNote:
    "각 행은 해당 체크포인트에서 실행되는 단계입니다. 노드는 versions_seen 으로 추정한 값이며(데이터베이스에는 노드 이름이 저장되지 않습니다), 변경된 키는 그 단계가 만든 상태 차이입니다.",
  colStep: "단계",
  colSource: "출처",
  colNodes: "노드 (추정)",
  colChanged: "변경된 키",
  colInterrupt: "인터럽트",
  stepsHeading: "단계별 변경",
  stepRange: "단계 {from} -> {to}",
  errorsHeading: "오류",
  errorLine: "단계 {step}: {text}",
  htmlTitle: "graphtrail: {thread}",
  htmlHeading: "graphtrail: 스레드 {thread}{ns}",
  htmlSummary: "상태 {status}, 기록 주체 {writer}, 체크포인트 {n}개, 스키마 {v}",
  help: HELP_KO,
  warningPrefix: "경고: ",
  threadRequired: "--thread 가 필요합니다. 이 데이터베이스에는 스레드가 {n}개 있습니다: {ids}",
  unknownCommand: '알 수 없는 명령 "{command}"입니다. "graphtrail --help"를 실행하십시오',
  missingPath: "데이터베이스 경로가 없습니다. 사용법: graphtrail {command} <db>",
  stepInteger: '--step 은 정수여야 합니다. 입력값: "{value}"',
  diffNeeds: "diff 에는 --from 과 --to 가 필요합니다 (단계 번호 또는 체크포인트 ID 접두사)",
  formatInvalid: '--format 은 json, md, html 중 하나여야 합니다. 입력값: "{value}"',
  langInvalid: '--lang 은 en 또는 ko 여야 합니다. 입력값: "{value}"',
  rootNs: "(루트)",
  colThread: "스레드",
  colNs: "ns",
  colCheckpointCount: "체크포인트",
  colLastStep: "마지막 단계",
  colStatus: "상태",
  colWriter: "기록 주체",
  toolCallLine: "  단계 {step}: 도구 호출 {name}({args})",
  toolResultLine: "  단계 {step}: 도구 결과 {text}",
  interruptLine: "  단계 {step}: __interrupt__ {text}",
  errorStepLine: "  단계 {step}: __error__ {text}",
  showHead: "스레드 {thread}{ns}  단계 {step}  출처 {source}",
  showCheckpoint: "체크포인트 {value}",
  showParent: "부모       {value}",
  showTs: "시각       {value}",
  showState: "상태:",
  showHint: "(태그가 붙은 전체 상태는 --json 으로 볼 수 있습니다. 이 체크포인트 이후에 기록된 쓰기는 {n}개입니다)",
  diffHead: "단계 {from} -> 단계 {to}",
  diffAddedIds: "추가된 메시지 ID: {ids}",
  diffRemovedIds: "삭제된 메시지 ID: {ids}",
  parseUnknownOption: "알 수 없는 옵션입니다: {option}. \"graphtrail --help\"를 실행하십시오",
  parseInvalidValue: "옵션 {option}의 값이 없거나 올바르지 않습니다. \"graphtrail --help\"를 실행하십시오",
  parseUnexpectedPositional: "예상하지 못한 인자입니다: {option}. \"graphtrail --help\"를 실행하십시오",
  dialogFilter: "SQLite 데이터베이스",
  dialogOpenLabel: "체크포인트 데이터베이스 열기",
  treeStep: "단계 {step}",
  treeInput: "입력",
  treeThreadSummary: "{status}, 체크포인트 {n}개",
  treeShowThread: "스레드 보기",
  emptyDb: "이 데이터베이스에는 체크포인트가 없습니다.",
  editorError: "graphtrail: {text}",
};

export const MESSAGES: Record<Lang, Record<MessageKey, string>> = { en, ko };

/** Look up a message and fill its `{name}` placeholders. Unknown placeholders stay as written. */
export function t(lang: Lang, key: MessageKey, params: Record<string, string | number> = {}): string {
  return MESSAGES[lang][key].replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

/** `ko`, `ko-KR`, `ko_KR.UTF-8` mean Korean; anything else (including undefined) means English. */
export function resolveLang(value: string | undefined | null): Lang {
  return /^ko(?:[-_.@]|$)/i.test((value ?? "").trim()) ? "ko" : "en";
}

/**
 * CLI language: `--lang` value > GRAPHTRAIL_LANG > LC_ALL > LC_MESSAGES > LANG.
 * The first variable that is set and non-empty decides (like POSIX locale lookup); not Korean means English.
 */
export function langFromEnv(env: Record<string, string | undefined>, flag?: string): Lang {
  const order = [flag, env.GRAPHTRAIL_LANG, env.LC_ALL, env.LC_MESSAGES, env.LANG];
  return resolveLang(order.find((v) => v !== undefined && v !== ""));
}
