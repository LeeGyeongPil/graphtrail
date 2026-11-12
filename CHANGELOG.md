# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0]

### Added

- English and Korean display language. CLI: `--lang en|ko` > `GRAPHTRAIL_LANG` > `LC_ALL` > `LC_MESSAGES` > `LANG`; anything that is not Korean means English. Help, table headings, labels, errors (including `parseArgs` errors), warnings and the Markdown and HTML reports are localized. VS Code extension: `package.nls.json` / `package.nls.ko.json` for the manifest and a `graphtrail.language` setting (`auto`, `en`, `ko`) for the tree, the report and the dialogs; changing it redraws open panels.
- Library: optional `lang` in `OpenOptions` (error and warning messages), optional `{ lang }` for `renderMarkdown` / `renderHtml`, optional `lang` argument for `describeChanges`, and the `Lang` type and `resolveLang()`. The default stays `"en"`, so library output is unchanged.

### Changed

- On a Korean locale (`LANG=ko_KR.UTF-8` and the like) the CLI now prints Korean by default. Set `GRAPHTRAIL_LANG=en` (or pass `--lang en`) to keep English. `--json` and `export --format json` output is never translated and did not change; English text is identical to 0.1.3.
- Text tables line up Korean (full-width) characters by display width.

## [0.1.3]

### Fixed

- Checkpoints of a running app that were committed but not yet checkpointed into the main file (they live in `<db>-wal`, because `SqliteSaver` uses WAL mode) were silently missing: `threads` showed an empty or outdated list, or a wrong "missing table" error, with exit code 0 and no warning. graphtrail now applies the committed frames of `<db>-wal` to its in-memory copy (read-only; the database, `-wal` and `-shm` are never written, checkpointed, created or deleted) and prints a `warning:` line when it did. An unusable `-wal` falls back to the main file with a warning. The VS Code extension applies the `-wal` too, but does not display the warning (known limit), and `openCheckpointDb(bytes, { wal })` accepts the `-wal` bytes.

## [0.1.2]

### Changed

- Release preparation only: version bump so the release tag matches the code (includes the 0.1.1 security pin). No functional changes.

## [0.1.1]

### Security

- Pin `minimatch` to 11.0.5 via `overrides` (dev-only transitive dependency of `@vscode/vsce`) to fix GHSA-g3hv-75wg-m249 (denial of service via globparts amplification). Not part of the published runtime code.

## [0.1.0]

### Added

- `graphtrail threads|timeline|show|diff|export` CLI for LangGraph `SqliteSaver` databases (Python `msgpack` and JS `json` checkpoints).
- Safe decoder: msgpack extension types 0-7 and LangChain `lc` JSON envelopes become `$type`/`$ext` tags; unknown extensions and `pickle` are reported by size only. Nothing from the database is imported, constructed or evaluated.
- Timeline rebuilt from the `parent_checkpoint_id` chain: step, source, estimated nodes, changed keys, tool calls and results, interrupts.
- State diff with key-level changes, message additions by id, and tool call to result pairs.
- Deterministic `export` to JSON (`schemaVersion` 1), Markdown and a self-contained HTML report with a strict content security policy.
- Read-only VS Code extension (custom editor and thread tree) built from the same core; packaged with `npm run vsix`.
- Sample databases made with the real LangGraph libraries and a scripted stand-in model (practice data).
