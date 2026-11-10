# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
