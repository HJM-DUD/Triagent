# Changelog

All notable Triagent version changes are recorded here. Before any future release or Git tag, update this file first.

## 0.3.2 - 2026-05-28

### Added
- Added default `token_save_mode` for `/all`.
- Added `triagent.config.json` support for `token_save_mode`, `prefilter_max_chars`, and `compliance_mode`.
- Added `triagent run all --legacy`, `--token-save`, and `--no-token-save` routing flags.
- Added Hermes pre-filter, Antigravity alternative review, Hermes joint proposal, and Hermes compliance check packets.
- Added incremental `triagent reply` packets and `triagent reply --full-context` fallback.

### Changed
- Version upgraded to `0.3.2`.
- Default `/all` now presents Codex with a compact joint proposal instead of the old seven-phase debate history.
- Legacy `/all` remains available through `--legacy`.
- Dashboard styling recognizes `needs_compliance`.

### Safety
- Compliance failures are blocked as `needs_compliance` instead of being accepted for Codex review.
- Node.js deletion and evidence gates remain active before and after token-save phases.
- Original raw output is still stored locally in SQLite, but Codex-facing packets prefer summaries and deltas.

### Tests
- `npm test`: 43 tests passing.

### Known Limits
- Triagent cannot intercept Codex App's internal stdin; token saving applies to Triagent-generated packets, reports, and handoff summaries.
- Hermes semantic compliance is still model-assisted and should be reviewed by Codex before final acceptance.

## 0.3.1 - 2026-05-27

### Added
- Added `triagent gc` to preview eligible dry-run Git sandbox worktrees.
- Added `triagent gc --apply` to clean eligible sandbox worktrees with `git worktree remove <path>`.
- Added hard evidence checking for successful Hermes and Antigravity output.

### Changed
- Version upgraded to `0.3.1`.
- SQLite writes now retry transient `SQLITE_BUSY` / `SQLITE_LOCKED` errors.
- Long stdout/stderr content is split into bounded chunks before being stored.
- Dashboard styling now recognizes the `needs_evidence` task status.

### Safety
- Sandbox cleanup only targets Triagent-recorded sandbox paths.
- Sandbox cleanup defaults to preview-only and requires explicit `--apply` before any Git worktree is removed.
- Applied sandboxes are removed through Git worktree removal with force because their diff has already been applied back to the real worktree.
- Evidence-free successful subagent output is blocked as `needs_evidence` instead of being accepted as `succeeded`.

### Tests
- `npm test`: 30 tests passing.

### Known Limits
- `triagent gc --apply` cleans eligible Git worktrees but does not rewrite or delete unrelated files.
- Rust interceptor and high-performance log search remain future work.

## 0.3.0 - 2026-05-27

### Added
- Added `[NEED_CLARIFY]: ...` detection and `triagent reply <task-id> -- <answer>` continuation flow with a three-reply limit.
- Added `triagent audit <task-id> --agent ant|hermes` for shadow audits from structured reports.
- Added `triagent run --dry-run <agent> -- <goal>` to run agent tasks in a Git sandbox worktree.
- Added `triagent apply <sandbox-task-id> --yes-risk` to apply safe sandbox diffs back to the real worktree.
- Added `triagent sync-memory --dry-run` for non-mutating memory conflict checks.
- Added `task_meta` storage for workflow metadata such as clarification count, parent task, sandbox path, and real cwd.
- Added `triagent dashboard --enable-actions` to show a sandbox Apply command button while keeping the default dashboard read-only.

### Changed
- `/all` now stops early with `needs_clarification` if a subagent asks for clarification.
- Dashboard exposes `/api/config` so the frontend can stay read-only by default and only reveal action affordances when explicitly enabled.
- Version upgraded to `0.3.0`.

### Safety
- Sandbox apply refuses dirty real worktrees, failed sandbox tasks, dangerous deletion diffs, and suspicious parent-path diffs.
- Memory sync is dry-run only in 0.3.0 and does not rewrite memory files.
- Sandbox worktrees are not auto-deleted, preserving GuGU's no-batch-delete rule.

### Tests
- `npm test`: 22 tests passing.

### Known Limits
- Rust interceptor and high-performance log search remain future work.
- Web Apply copies the CLI apply command instead of directly mutating the repository from the browser.

## 0.2.0 - 2026-05-27

### Added
- Added `triagent note <task-id> -- <markdown>` for Codex final decisions.
- Added `triagent report <task-id> [--out report.md]` for Markdown exports.
- Added evidence ID requirements to task packets.

### Changed
- Dashboard auto-refreshes and highlights new tasks/output.
- SQLite uses WAL mode and a busy timeout to reduce `/all` write/read contention.
- `/all` asks subagents for compact summaries before cross-checking.

### Safety
- Added deterministic blocking for dangerous recursive deletion commands.
- Added high-risk keyword confirmation for production, config, migration, credential, and deletion tasks.

### Tests
- `npm test`: 13 tests passing.

## 0.1.0 - 2026-05-25

### Initial Implementation
- Created Triagent as GuGU's local observer and wrapper for Codex, Hermes, and Antigravity.
- Added the read-only dashboard for recording task packets, raw CLI output, statuses, exit codes, and `/all` phases.
- Added core commands: `triagent dashboard`, `triagent status`, `triagent run hermes`, `triagent run ant`, and `triagent run all`.
- Added Hermes command wiring through `hermes -z ... --provider deepseek --model deepseek-v4-pro`.
- Added Antigravity command wiring through `agy --print`.
- Added deterministic `/all` discussion phases: Codex problem definition, Hermes analysis, Antigravity analysis, Codex draft decision, cross-checks, and Codex final decision.

### Original Design Intent
- Keep Codex as the lead brain for requirements, architecture, safety boundaries, final review, and GuGU-facing reports.
- Use Hermes for local code search, logs, dependency/config inspection, reproducible analysis, and small bounded mechanical work.
- Use Antigravity for long-context review, product/UX perspective, alternatives, Google ecosystem fit, and Gemini-native workflows.
- Keep the dashboard read-only so it records local logs without calling models or spending extra tokens.
- Store runtime data locally in SQLite under `~/.triagent/triagent.sqlite`.

### Safety
- Added the project deletion rule to every generated task packet.
- Required task packets to include current working directory, edit permission, allowed paths, output format, and stop conditions.
- Added basic secret redaction before logs are stored.
- Added 30-day retention pruning for old SQLite task records.

### Tests
- `npm test`: 7 tests passing in the initial release.
