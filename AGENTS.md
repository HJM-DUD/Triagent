# Triagent Project Instructions

GuGU is the user. User-facing final reports must be in Simplified Chinese. Machine-facing planning, logs, and technical notes may use English.

## Non-negotiable deletion rules

Never batch-delete files or directories. Do not use:

- `del /s`
- `rd /s`
- `rmdir /s`
- `Remove-Item -Recurse`
- `rm -rf`

If deletion is required, delete only one explicit file path at a time. For any batch deletion, stop and ask GuGU for separate confirmation.

## Triagent collaboration rules

Routing prefixes:

- `/co <task>`: Codex does the task directly; do not delegate by default.
- `/so <task>`: send to the Codex subagent; Codex packages the task, reviews the result, and gives the final report.
- `/her <task>`: send to Hermes; Codex packages the task, reviews the result, and gives the final report.
- `/ant <task>`: send to Antigravity CLI; Codex packages the task, reviews the result, and gives the final report.
- `/all <task>`: run Codex subagent + Hermes + Antigravity discussion/cross-checking, with Codex making the final decision.
- No prefix: Codex decides the route. Ask GuGU first for high-risk work: credentials, deletion, migrations, broad rewrites, private uploads, account actions, browser login state, or settings changes.

Core commands:

- `triagent dashboard`: start the read-only web observer.
- `triagent status`: list tasks.
- `triagent status --json`: machine-readable task list.
- `triagent check --task "<task>"`: preview config, route, and risk only; do not start subagents.
- `triagent config show|get|set|validate`: manage local `triagent.config.json`.
- `triagent run auto -- "<task>"`: route by prefix and local rules.
- `triagent run so -- "<task packet>"`: record and start the Codex subagent through `codex exec`.
- `triagent run hermes -- "<task packet>"`: record and start Hermes.
- `triagent run ant -- "<task packet>"`: record and start Antigravity; current backend command is `agy --print`.
- `triagent run all -- "<goal>"`: default token-saving flow: Hermes prefilter, Codex subagent engineering review, Antigravity alternate view, Hermes joint proposal, Codex subagent compliance check, Codex final decision.
- `triagent run all --legacy -- "<goal>"`: old 0.3.1 seven-stage discussion flow.
- `triagent run all --no-token-save -- "<goal>"`: disable token-saving flow for this run.
- `triagent reply --full-context <task-id> -- "<reply>"`: use the older full-context packet for clarification continuation.
- `triagent gc`: preview safe dry-run Git sandbox worktree cleanup.
- `triagent gc --apply`: remove eligible sandboxes through `git worktree remove <path>`; never use recursive delete commands.

Direct agent commands when needed:

- Codex subagent: `RUST_LOG=off codex exec --cd "<cwd>" --sandbox read-only --color never "<task packet>"`; set `TRIAGENT_CODEX_RUST_LOG=<value>` only when debugging Codex CLI internals.
- Hermes: `hermes -z "<task packet>" --provider deepseek --model deepseek-v4-pro`
- Antigravity: `agy --print "<task packet>"`

## Antigravity models and quota guidance

Available choices noted in this project:

- Gemini 3.5 Flash (Medium/High/Low)
- Gemini 3.1 Pro (Low/High)
- Claude Sonnet 4.6 (Thinking)
- Claude Opus 4.6 (Thinking)
- GPT-OSS 120B (Medium)

Use cheaper/fast models for prototypes, summaries, and light product judgment. Use Gemini 3.1 Pro High or Claude Sonnet Thinking for architecture, difficult reasoning, and long-context synthesis. Use Claude Opus Thinking only for critical reviews after checking quota. If quota is low, rate-limited, or unavailable, switch to a lower-cost comparable model and say so in the result.

## Division of labor

- Codex is the lead engineer and final reviewer.
- Codex subagent is best for bounded implementation/architecture checks that should use Codex reasoning without consuming the lead Codex thread.
- Hermes is best for code search, file inventory, logs, dependency review, and small scoped mechanical edits.
- Antigravity is best for multimodal checks, long-context product alternatives, frontend/prototype thinking, and Google-ecosystem reasoning.
- Codex must review subagent output, inspect diffs, and run or judge verification before reporting to GuGU.

## Observer and safety

`triagent.config.json` may use old keys such as `token_save_mode`, `prefilter_max_chars`, and `compliance_mode`, and also supports schema v1 keys such as `defaults`, `agents`, `routing`, and `safety`. CLI flags override config.

Every subagent task packet must include: deletion rules, current working directory, edit permission, allowed paths, expected output format, and stop conditions.

## Release rules

For versioned releases, update docs/changelog, run relevant checks, keep the diff reviewable, and explain the release impact to GuGU in Simplified Chinese.
