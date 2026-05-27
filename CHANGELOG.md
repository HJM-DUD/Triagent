# Changelog

All notable Triagent version changes are recorded here. Before any future release or Git tag, update this file first.

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
