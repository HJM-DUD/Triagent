# Changelog

All notable Triagent version changes are recorded here. Before any future release or Git tag, update this file first.

## 0.4.0 - 2026-05-31

### Added
- Added `triagent check [--json] [--task <task>]` to preview local config validity, routing, and risk level without launching an agent.
- Added `triagent config show|get|set|validate [--json]` for local `triagent.config.json` management.
- Added `triagent run auto -- "<task>"` with `/co`, `/her`, `/ant`, and `/all` prefix routing plus task-type fallback routing.
- Added a schema v1 `triagent.config.json` shape for defaults, agent commands, routing prefixes/rules, and safety switches while keeping legacy config keys compatible.
- Added local queue helpers for priority ordering and conservative retry decisions.
- Added SQLite task fields for priority, attempt count, max attempts, route agent, route reason, risk level, and run-after time.
- Added dashboard route, risk, and attempt labels for task cards and selected task summary metrics.

### Changed
- Version upgraded to `0.4.0`.
- `triagent status --json` now exposes the richer task shape for scripts and dashboard consumers.
- Safety classification now reports `low`, `medium`, `high`, or `blocked` with a concrete reason.
- Dashboard visual design changed from the old neon command-center treatment to a quieter local workspace with denser task scanning, clearer metrics, and less decorative chrome.

### Safety
- Recursive and batch deletion commands remain blocked before any subagent call.
- High-risk and medium-risk tasks still require terminal confirmation, or `--yes-risk` in non-interactive runs after GuGU confirms.
- `needs_clarification`, `needs_evidence`, and `needs_compliance` are not auto-retryable.
- The new router is purely local and does not add any cloud dependency.

### Tests
- `npm test`: 57 tests passing.
- `git diff --check`: passing.
- Manual CLI checks passed: `triagent check --json --task "/all plan a safe production migration"` and `triagent config validate --json`.
- Dashboard visual check passed in Chrome at desktop width and 390px mobile width with no horizontal overflow.

### Known Limits
- Queue helpers are local building blocks in 0.4.0; there is no long-running daemon loop yet.
- `triagent run auto` records `/co` tasks for Codex review but cannot make Codex App execute them automatically.
- Antigravity model selection remains controlled by the user's Antigravity CLI settings.

## 0.3.4 - 2026-05-31

### Changed
- Version upgraded to `0.3.4`.
- Dashboard task stream now renders a bounded recent task set instead of every stored task.
- Task cards are more compact, with two-line title clamping and a visible task count chip.
- Task card timestamps now include date and time.
- Added a task stream toggle so older hidden tasks remain accessible from the dashboard.
- Redesigned the task packet and raw output panes for better readability.

### UX
- Prevents the left task stream from growing into an oversized card wall during long sessions.
- Keeps an older selected task visible if GuGU is reviewing it while newer tasks continue to arrive.
- Makes task history easier to scan across different days.
- Lets GuGU switch between latest-only and all-task views without changing backend data.
- Raw output is now grouped into event cards with agent, stream, and timestamp metadata.
- Task packet and output text use larger type, more line spacing, and stronger contrast.
- Consecutive SQLite log chunks from the same agent and stream are merged into a single readable block.
- Grouped raw-output blocks now use normal document flow so long blocks are scrollable and not clipped.

### Safety
- No command, API, database, runner, or subagent workflow behavior changed in this release.

### Tests
- `npm test`: 43 tests passing.
- Browser check: task stream renders 8 visible cards out of 31 stored tasks by default, the all-task toggle expands to 31 cards and collapses back, timestamps include date and time, and no horizontal overflow was detected.
- Browser check: raw output renders as 3 grouped reading blocks instead of 25 chunk cards, with 14px text, roughly 25px line height, scrollable long-block content, and no horizontal overflow.
- Browser check: raw output viewport is scrollable (`scrollHeight 6558 / clientHeight 689`) and the final grouped block remains reachable.

### Known Limits
- Older tasks are accessible through the all-task toggle, but task search/filtering is not implemented yet.

## 0.3.3 - 2026-05-31

### Changed
- Version upgraded to `0.3.3`.
- Redesigned the read-only dashboard as a dark AI command center while keeping the existing dashboard APIs and CLI behavior unchanged.
- Improved task list hierarchy with agent labels, task mode chips, timestamps, selected states, and status rails.
- Improved task detail and output panels with clearer headers, stronger contrast, and a more readable terminal surface.

### UX
- Added more distinct visual states for `running`, `succeeded`, `failed`, `needs_evidence`, `needs_compliance`, `needs_clarification`, and `needs_codex_review`.
- Refined new-task and new-output motion so updates feel visible without disrupting log reading.
- Added responsive layout treatment for mobile, tablet, and desktop dashboard widths.
- Added reduced-motion handling for users who disable interface animation.

### Safety
- No command, API, database, runner, or subagent workflow behavior changed in this release.
- Browser Apply remains a copy-command affordance when `triagent dashboard --enable-actions` is used.

### Tests
- `npm test`: 43 tests passing.

### Known Limits
- This release is visual-only and does not add dashboard filtering, searching, or direct browser actions.

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
