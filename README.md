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

## Memory Files

- Codex: `~/.codex/AGENTS.md`
- Hermes: `~/.hermes/memories/MEMORY.md` and `~/.hermes/memories/USER.md`
- Antigravity: `~/.gemini/GEMINI.md`
- Antigravity skill: `~/.gemini/antigravity-cli/skills/triagent/SKILL.md`
