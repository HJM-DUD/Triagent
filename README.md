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
triagent status
triagent run hermes -- "Goal: inspect this project"
triagent run ant -- "Goal: review this design"
triagent run all -- "Design a safe migration plan"
triagent note <task-id> -- "Codex final decision: ..."
triagent report <task-id> --out triagent-report.md
```

Antigravity is invoked by Triagent through:

```bash
agy --print "<task packet>"
```

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
- SQLite uses WAL mode and a short busy timeout to reduce dashboard crashes while `/all` is writing logs.

## Version 0.2.0 Safety and Review Flow

- `triagent run` now auto-stuffs task packets with cwd, edit scope, deletion rules, output format, and evidence ID rules.
- Subagent factual claims must cite evidence IDs such as `[E1]`; missing IDs are left visible for Codex review.
- Dangerous recursive deletion text such as `rm -rf`, `del /s`, `rd /s`, `rmdir /s`, and `Remove-Item -Recurse` is blocked before a subagent is called.
- High-risk text such as production, config, migration, credential, or delete requires terminal confirmation. In non-interactive runs, re-run with `--yes-risk` only after GuGU confirms.
- `/all` asks Hermes and Antigravity for compact summaries under 500 Chinese characters before cross-checking, so cross-check phases do not rely on full raw logs.
- `triagent note <task-id> -- <markdown>` writes Codex's final decision back into the observer.
- `triagent report <task-id> [--out report.md]` exports the task packet, raw events, exit code, evidence IDs, and Codex note as Markdown.

## Memory Files

- Codex: `~/.codex/AGENTS.md`
- Hermes: `~/.hermes/memories/MEMORY.md` and `~/.hermes/memories/USER.md`
- Antigravity: `~/.gemini/GEMINI.md`
- Antigravity skill: `~/.gemini/antigravity-cli/skills/triagent/SKILL.md`
