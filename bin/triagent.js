#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";

import { startDashboard } from "../src/dashboard.js";
import { runAllDiscussion, runAudit, runDryRunAgent, runSingleAgent, openStore, replyToTask } from "../src/runner.js";
import { buildMarkdownReport } from "../src/report.js";
import { buildMemorySyncDryRun } from "../src/memory.js";
import { applyDiff, applySandboxGcPlan, assertApplyAllowed, buildSandboxGcPlan, getGitDiff, isWorktreeClean } from "../src/sandbox.js";
import { isHighRiskTask } from "../src/safety.js";

const args = process.argv.slice(2);
const command = args[0];

try {
  if (!command || command === "help" || command === "--help") {
    printHelp();
  } else if (command === "dashboard") {
    await dashboard(args.slice(1));
  } else if (command === "run") {
    await run(args.slice(1));
  } else if (command === "note") {
    await note(args.slice(1));
  } else if (command === "report") {
    await report(args.slice(1));
  } else if (command === "reply") {
    await reply(args.slice(1));
  } else if (command === "audit") {
    await audit(args.slice(1));
  } else if (command === "apply") {
    await apply(args.slice(1));
  } else if (command === "gc") {
    await gc(args.slice(1));
  } else if (command === "sync-memory") {
    await syncMemory(args.slice(1));
  } else if (command === "status") {
    status();
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

function printHelp() {
  console.log(`triagent

Usage:
  triagent dashboard [--port 8765] [--enable-actions]
  triagent status
  triagent note <task-id> -- <markdown note>
  triagent report <task-id> [--out report.md]
  triagent reply <task-id> -- <clarification answer>
  triagent audit <task-id> --agent ant|hermes
  triagent run [--dry-run] hermes -- <task packet>
  triagent run [--dry-run] ant -- <task packet>
  triagent run [--dry-run] all [--yes-risk] -- <goal>
  triagent apply <sandbox-task-id> --yes-risk
  triagent gc [--apply]
  triagent sync-memory --dry-run
`);
}

async function dashboard(argv) {
  const port = Number(readFlag(argv, "--port") || 8765);
  const enableActions = argv.includes("--enable-actions");
  const { url } = await startDashboard({ port, enableActions });
  console.log(`Triagent dashboard: ${url}`);
}

async function run(argv) {
  const dryRun = argv.includes("--dry-run");
  const yesRisk = argv.includes("--yes-risk");
  const filteredArgv = argv.filter((item) => item !== "--yes-risk" && item !== "--dry-run");
  const agent = filteredArgv[0];
  const separator = filteredArgv.indexOf("--");
  const taskText = (separator >= 0 ? filteredArgv.slice(separator + 1) : filteredArgv.slice(1)).join(" ").trim();

  if (!agent || !taskText) {
    throw new Error("Usage: triagent run <hermes|ant|all> -- <task packet>");
  }

  await confirmHighRisk({ taskText, yesRisk });

  if (agent === "all") {
    const result = dryRun
      ? await runDryRunAgent({ agent, goal: taskText })
      : await runAllDiscussion({ goal: taskText });
    console.log(`triagent all task ${result.taskId}: ${result.status}`);
    return;
  }

  const result = dryRun
    ? await runDryRunAgent({ agent, goal: taskText })
    : await runSingleAgent({ agent, goal: taskText });
  console.log(`triagent ${agent} task ${result.taskId}: ${result.status}`);
}

async function note(argv) {
  const taskId = argv[0];
  const separator = argv.indexOf("--");
  const content = (separator >= 0 ? argv.slice(separator + 1) : argv.slice(1)).join(" ").trim();

  if (!taskId || !content) {
    throw new Error("Usage: triagent note <task-id> -- <markdown note>");
  }

  const store = openStore();
  if (!store.getTask(taskId)) {
    store.close();
    throw new Error(`Task not found: ${taskId}`);
  }
  store.addCodexNote(taskId, content);
  store.close();
  console.log(`triagent note saved for ${taskId}`);
}

async function report(argv) {
  const taskId = argv[0];
  const out = readFlag(argv, "--out");

  if (!taskId) {
    throw new Error("Usage: triagent report <task-id> [--out report.md]");
  }

  const store = openStore();
  const markdown = buildMarkdownReport({ store, taskId });
  store.close();

  if (out) {
    await writeFile(out, markdown, "utf8");
    console.log(`triagent report written: ${out}`);
  } else {
    console.log(markdown);
  }
}

async function reply(argv) {
  const taskId = argv[0];
  const separator = argv.indexOf("--");
  const answer = (separator >= 0 ? argv.slice(separator + 1) : argv.slice(1)).join(" ").trim();

  if (!taskId || !answer) {
    throw new Error("Usage: triagent reply <task-id> -- <clarification answer>");
  }

  const result = await replyToTask({ taskId, answer });
  console.log(`triagent reply task ${result.taskId}: ${result.status}`);
}

async function audit(argv) {
  const taskId = argv[0];
  const auditor = readFlag(argv, "--agent");
  if (!taskId || !auditor) {
    throw new Error("Usage: triagent audit <task-id> --agent ant|hermes");
  }

  const result = await runAudit({ taskId, auditor });
  console.log(`triagent audit task ${result.taskId}: ${result.status}`);
}

async function apply(argv) {
  const taskId = argv[0];
  if (!taskId || !argv.includes("--yes-risk")) {
    throw new Error("Usage: triagent apply <sandbox-task-id> --yes-risk");
  }

  const store = openStore();
  const task = store.getTask(taskId);
  if (!task) {
    store.close();
    throw new Error(`Task not found: ${taskId}`);
  }
  const sandboxCwd = store.getTaskMeta(taskId, "sandbox_cwd");
  if (!sandboxCwd) {
    store.close();
    throw new Error(`Task is not a sandbox task: ${taskId}`);
  }
  const diffText = await getGitDiff({ cwd: sandboxCwd });
  const clean = await isWorktreeClean({ cwd: process.cwd() });
  assertApplyAllowed({ realWorktreeClean: clean, sandboxStatus: task.status, diffText });
  const message = await applyDiff({ cwd: process.cwd(), diffText });
  store.appendEvent({ taskId, agent: "codex", stream: "apply", content: message });
  store.updateTaskStatus(taskId, "applied");
  store.close();
  console.log(`triagent apply ${taskId}: applied`);
}

async function gc(argv) {
  const shouldApply = argv.includes("--apply");
  const store = openStore();
  const plan = await buildSandboxGcPlan({ store });
  store.close();

  if (!plan.candidates.length) {
    console.log("triagent gc: no sandbox worktrees eligible for cleanup");
    return;
  }

  for (const candidate of plan.candidates) {
    console.log(
      `${shouldApply ? "remove" : "preview"} ${candidate.taskId} ${candidate.status} ${candidate.ageDays}d ${candidate.reason} ${candidate.path}`
    );
  }

  if (!shouldApply) {
    console.log("triagent gc: preview only. Re-run with --apply to remove eligible Git worktrees.");
    return;
  }

  const result = await applySandboxGcPlan({ candidates: plan.candidates });
  console.log(`triagent gc: removed ${result.removed.length} sandbox worktree(s)`);
}

async function syncMemory(argv) {
  if (!argv.includes("--dry-run")) {
    throw new Error("Usage: triagent sync-memory --dry-run");
  }
  console.log(await buildMemorySyncDryRun());
}

function status() {
  const store = openStore();
  const tasks = store.listTasks(20);
  if (!tasks.length) {
    console.log("No triagent tasks yet.");
    store.close();
    return;
  }

  for (const task of tasks) {
    console.log(`${task.createdAt} ${task.status.padEnd(18)} ${task.agent.padEnd(6)} ${task.title}`);
  }
  store.close();
}

function readFlag(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return argv[index + 1];
}

async function confirmHighRisk({ taskText, yesRisk }) {
  if (!isHighRiskTask(taskText) || yesRisk) {
    return;
  }

  if (!process.stdin.isTTY) {
    throw new Error("High-risk task detected. Re-run with --yes-risk after GuGU confirms.");
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question("High-risk task detected. Continue? [Y/N] ");
  rl.close();

  if (!/^y(es)?$/i.test(answer.trim())) {
    throw new Error("Cancelled by user.");
  }
}
