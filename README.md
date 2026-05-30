# Triagent

Triagent is GuGU's local observer and wrapper for the Codex + Hermes + Antigravity workflow.

## Roles

- Codex is the lead agent in Codex App.
- Hermes is the local DeepSeek subagent.
- Antigravity CLI is the Gemini subagent. The confirmed CLI command is `agy`.
- The dashboard is read-only. It records task packets, raw CLI output, status, exit codes, and `/all` discussion phases. It does not call any model.

## Commands

```bash
npm test
triagent dashboard
triagent dashboard --enable-actions
triagent status
triagent run hermes -- "Goal: inspect this project"
triagent run ant -- "Goal: review this design"
triagent run all -- "Design a safe migration plan"
triagent run all --legacy -- "Use the old seven-phase /all flow"
triagent run all --no-token-save -- "Disable token-save for this run"
triagent run --dry-run hermes -- "Refactor safely in a sandbox"
triagent reply <task-id> -- "Use the local dependency only."
triagent reply --full-context <task-id> -- "Use the old full-context reply packet."
triagent audit <task-id> --agent ant
triagent apply <sandbox-task-id> --yes-risk
triagent gc
triagent gc --apply
triagent sync-memory --dry-run
triagent note <task-id> -- "Codex final decision: ..."
triagent report <task-id> --out triagent-report.md
```

Antigravity is invoked by Triagent through:

```bash
agy --print "<task packet>"
```

Inside the interactive Antigravity CLI, use `/model` to switch models and `/usage` to inspect available models, quota, rate limits, and remaining free/paid package percentage before choosing a model.

Known model choices include Gemini 3.5 Flash (Medium/High/Low), Gemini 3.1 Pro (Low/High), Claude Sonnet 4.6 (Thinking), Claude Opus 4.6 (Thinking), and GPT-OSS 120B (Medium).

## Routing Prefixes

- `/co <task>`: Codex does the task personally.
- `/her <task>`: Codex delegates to Hermes through `triagent run hermes`.
- `/ant <task>`: Codex delegates to Antigravity through `triagent run ant`.
- `/all <task>`: Codex starts the three-agent discussion and cross-check workflow.
- No prefix: Codex chooses the route. High-risk work still needs GuGU confirmation.

## Data

- Runtime data defaults to `~/.triagent/triagent.sqlite`.
- Tasks older than 30 days are pruned from SQLite rows.
- The project does not batch-delete log files.
- Common secrets are redacted before logs are stored.
- The dashboard auto-refreshes while open. New tasks and new output pulse briefly so GuGU can see fresh dialogue without manual refresh.
- The dashboard frontend is static HTML/CSS/JS in `public/`. Version 0.3.4 uses a dark AI command-center visual style, bounded task stream, all-task toggle, date/time task stamps, grouped raw-output reading blocks, and reduced-motion support.
- SQLite uses WAL mode, a longer busy timeout, write retries, and log chunking to reduce dashboard crashes while `/all` is writing logs.
- `triagent.config.json` can set `token_save_mode`, `prefilter_max_chars`, and `compliance_mode`.

## Version 0.2.0 Safety and Review Flow

- `triagent run` now auto-stuffs task packets with cwd, edit scope, deletion rules, output format, and evidence ID rules.
- Subagent factual claims must cite evidence IDs such as `[E1]`; missing IDs are left visible for Codex review.
- Dangerous recursive deletion text such as `rm -rf`, `del /s`, `rd /s`, `rmdir /s`, and `Remove-Item -Recurse` is blocked before a subagent is called.
- High-risk text such as production, config, migration, credential, or delete requires terminal confirmation. In non-interactive runs, re-run with `--yes-risk` only after GuGU confirms.
- `/all` asks Hermes and Antigravity for compact summaries under 500 Chinese characters before cross-checking, so cross-check phases do not rely on full raw logs.
- `triagent note <task-id> -- <markdown>` writes Codex's final decision back into the observer.
- `triagent report <task-id> [--out report.md]` exports the task packet, raw events, exit code, evidence IDs, and Codex note as Markdown.

## Version 0.3.0 Interactive and Audit Flow

- Agent output containing `[NEED_CLARIFY]: <question>` marks a task as `needs_clarification`.
- `triagent reply <task-id> -- <answer>` resumes work with the original packet, recent history, and GuGU/Codex's clarification. Each task gets at most three clarification replies.
- `triagent audit <task-id> --agent ant|hermes` launches a shadow audit from the structured report, not the full raw log.
- `triagent run --dry-run <agent> -- <goal>` runs a task inside a Git sandbox worktree and records the sandbox path in task metadata.
- `triagent apply <sandbox-task-id> --yes-risk` applies a successful sandbox diff only when the real worktree is clean and the diff passes safety checks.
- `triagent sync-memory --dry-run` compares Codex, Hermes, and Antigravity memory files without writing them.
- `triagent dashboard --enable-actions` reveals the sandbox Apply command button; the default dashboard remains read-only.
- Version history is maintained in `CHANGELOG.md`.

## Version 0.3.1 Stability Fixes

- `triagent gc` previews sandbox worktrees that are safe to clean.
- `triagent gc --apply` removes eligible Git sandbox worktrees through `git worktree remove <path>`, not shell recursive deletion.
- Applied sandboxes are eligible for cleanup. Old clean sandboxes become eligible after 7 days.
- Successful Hermes or Antigravity output without evidence IDs now marks the task as `needs_evidence` for Codex review.
- SQLite writes retry transient `SQLITE_BUSY` / `SQLITE_LOCKED` errors and split long stdout/stderr chunks before storing.

## Version 0.3.2 Token Save Mode

- `token_save_mode` is on by default for `/all`.
- Default `/all` now runs: Hermes pre-filter, Antigravity alternative, Hermes joint proposal, Hermes compliance check, then Codex review.
- Use `triagent run all --legacy -- "<goal>"` to keep the 0.3.1 seven-phase discussion.
- Hermes pre-filter summaries are saved in `task_meta.prefilter_summary`; joint proposals are saved in `task_meta.joint_proposal`.
- Compliance failures mark tasks as `needs_compliance` instead of sending noisy low-quality results to Codex.
- `triagent reply` uses incremental context when a saved summary exists; `--full-context` restores the old full packet.

Optional config:

```json
{
  "token_save_mode": true,
  "prefilter_max_chars": 800,
  "compliance_mode": "block"
}
```

## Version 0.3.4 Dashboard UX

- The dashboard keeps the same read-only APIs and CLI behavior.
- `public/index.html` defines the observer shell, task stream, task packet pane, and raw output pane.
- `public/app.js` keeps the WebSocket/auto-refresh data flow, shows the latest 8 tasks by default, keeps the selected older task visible, and lets GuGU toggle all tasks.
- `public/app.js` also groups consecutive SQLite log chunks with the same `agent` and `stream` into one readable raw-output block.
- `public/styles.css` owns the dark AI command-center theme, compact task cards, grouped raw-output reading blocks, scrollable long output, responsive layout, and `prefers-reduced-motion` fallback.
- No backend, SQLite, runner, task status, or subagent workflow behavior changed in 0.3.4.

## Memory Files

- Codex: `~/.codex/AGENTS.md`
- Hermes: `~/.hermes/memories/MEMORY.md` and `~/.hermes/memories/USER.md`
- Antigravity: `~/.gemini/GEMINI.md`
- Antigravity skill: `~/.gemini/antigravity-cli/skills/triagent/SKILL.md`
