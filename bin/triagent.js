#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";

import { startDashboard } from "../src/dashboard.js";
import { loadTriagentConfig, saveTriagentConfig, validateTriagentConfig } from "../src/config.js";
import { runAllDiscussion, runAudit, runDryRunAgent, runSingleAgent, openStore, replyToTask } from "../src/runner.js";
import { buildMarkdownReport } from "../src/report.js";
import { buildMemorySyncDryRun } from "../src/memory.js";
import { applyDiff, applySandboxGcPlan, assertApplyAllowed, buildSandboxGcPlan, getGitDiff, isWorktreeClean } from "../src/sandbox.js";
import { classifyRisk, isHighRiskTask } from "../src/safety.js";
import { printJson, printTable } from "../src/output.js";
import { routeTask } from "../src/router.js";

const args = process.argv.slice(2);
const command = args[0];

try {
  if (!command || command === "help" || command === "--help") {
    printHelp();
  } else if (command === "dashboard") {
    await dashboard(args.slice(1));
  } else if (command === "run") {
    await run(args.slice(1));
  } else if (command === "check") {
    await check(args.slice(1));
  } else if (command === "config") {
    await config(args.slice(1));
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
    status(args.slice(1));
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
  triagent status [--json]
  triagent check [--json] [--task <task>]
  triagent config show|get|set|validate [--json]
  triagent note <task-id> -- <markdown note>
  triagent report <task-id> [--out report.md]
  triagent reply [--full-context] <task-id> -- <clarification answer>
  triagent audit <task-id> --agent ant|hermes
  triagent run [--dry-run] hermes -- <task packet>
  triagent run [--dry-run] ant -- <task packet>
  triagent run [--dry-run] all [--yes-risk] [--legacy|--token-save|--no-token-save] -- <goal>
  triagent run [--dry-run] auto -- <task>
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
  const legacy = argv.includes("--legacy");
  const tokenSaveFlag = argv.includes("--token-save");
  const noTokenSaveFlag = argv.includes("--no-token-save");
  const filteredArgv = argv.filter(
    (item) => !["--yes-risk", "--dry-run", "--legacy", "--token-save", "--no-token-save"].includes(item)
  );
  let agent = filteredArgv[0];
  const separator = filteredArgv.indexOf("--");
  let taskText = (separator >= 0 ? filteredArgv.slice(separator + 1) : filteredArgv.slice(1)).join(" ").trim();

  if (!agent || !taskText) {
    throw new Error("Usage: triagent run <auto|hermes|ant|all> -- <task packet>");
  }

  await confirmHighRisk({ taskText, yesRisk });

  let route;
  let routeConfig;
  if (agent === "auto") {
    routeConfig = loadTriagentConfig({ cwd: process.cwd() });
    route = routeTask(taskText, routeConfig);
    agent = route.agent;
    taskText = route.task;
    if (agent === "codex") {
      const store = openStore();
      const task = store.createTask({
        mode: "codex",
        agent: "codex",
        cwd: process.cwd(),
        title: taskText,
        taskPacket: `Goal: ${taskText}`,
        status: "needs_codex_review",
        priority: routeConfig.defaults.priority,
        maxAttempts: routeConfig.defaults.maxAttempts,
        routeAgent: "codex",
        routeReason: route.reason,
        riskLevel: classifyRisk(taskText).level
      });
      store.close();
      console.log(`triagent auto task ${task.id}: needs_codex_review (${route.reason})`);
      return;
    }
  }

  if (agent === "all") {
    const config = loadTriagentConfig({
      cwd: process.cwd(),
      overrides: {
        tokenSaveMode: legacy || noTokenSaveFlag ? false : tokenSaveFlag ? true : undefined
      }
    });
    const result = dryRun
      ? await runDryRunAgent({
          agent,
          goal: taskText,
          tokenSaveMode: config.tokenSaveMode,
          prefilterMaxChars: config.prefilterMaxChars,
          complianceMode: config.complianceMode
        })
      : await runAllDiscussion({
          goal: taskText,
          tokenSaveMode: config.tokenSaveMode,
          prefilterMaxChars: config.prefilterMaxChars,
          complianceMode: config.complianceMode,
          priority: routeConfig?.defaults.priority,
          maxAttempts: routeConfig?.defaults.maxAttempts,
          routeReason: route?.reason,
          riskLevel: classifyRisk(taskText).level
        });
    console.log(`triagent all task ${result.taskId}: ${result.status}${route ? ` (${route.reason})` : ""}`);
    return;
  }

  const result = dryRun
    ? await runDryRunAgent({ agent, goal: taskText })
    : await runSingleAgent({
        agent,
        goal: taskText,
        priority: routeConfig?.defaults.priority,
        maxAttempts: routeConfig?.defaults.maxAttempts,
        routeAgent: route?.agent,
        routeReason: route?.reason,
        riskLevel: classifyRisk(taskText).level
      });
  console.log(`triagent ${agent} task ${result.taskId}: ${result.status}${route ? ` (${route.reason})` : ""}`);
}

async function check(argv) {
  const json = argv.includes("--json");
  const task = readFlag(argv, "--task") || readAfterSeparator(argv);
  const config = loadTriagentConfig({ cwd: process.cwd() });
  const validation = validateTriagentConfig(config);
  const risk = classifyRisk(task || "");
  const route = task ? routeTask(task, config) : undefined;
  const result = {
    ok: validation.ok && risk.level !== "blocked",
    config: validation,
    task: route?.task || task || "",
    route,
    risk
  };

  if (json) {
    printJson(result);
    return;
  }

  console.log(`Config: ${validation.ok ? "ok" : validation.errors.join("; ")}`);
  if (task) {
    console.log(`Route: ${route.agent} (${route.reason})`);
    console.log(`Risk: ${risk.level} (${risk.reason})`);
  }
}

async function config(argv) {
  const subcommand = argv[0] || "show";
  const json = argv.includes("--json");
  const current = loadTriagentConfig({ cwd: process.cwd() });

  if (subcommand === "show") {
    json ? printJson(current) : printConfigTable(current);
    return;
  }

  if (subcommand === "validate") {
    const validation = validateTriagentConfig(current);
    if (json) {
      printJson(validation);
    } else {
      console.log(validation.ok ? "triagent config: ok" : `triagent config: ${validation.errors.join("; ")}`);
    }
    if (!validation.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (subcommand === "get") {
    const key = argv[1];
    if (!key) {
      throw new Error("Usage: triagent config get <key>");
    }
    const value = getConfigValue(current, key);
    json ? printJson({ key, value }) : console.log(value);
    return;
  }

  if (subcommand === "set") {
    const key = argv[1];
    const value = argv[2];
    if (!key || value === undefined) {
      throw new Error("Usage: triagent config set <key> <value>");
    }
    setConfigValue(current, key, coerceConfigValue(value));
    const validation = validateTriagentConfig(current);
    if (!validation.ok) {
      throw new Error(`Invalid config: ${validation.errors.join("; ")}`);
    }
    const path = saveTriagentConfig(current, { cwd: process.cwd() });
    console.log(`triagent config written: ${path}`);
    return;
  }

  throw new Error("Usage: triagent config show|get|set|validate");
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
  const fullContext = argv.includes("--full-context");
  const filteredArgv = argv.filter((item) => item !== "--full-context");
  const taskId = filteredArgv[0];
  const separator = filteredArgv.indexOf("--");
  const answer = (separator >= 0 ? filteredArgv.slice(separator + 1) : filteredArgv.slice(1)).join(" ").trim();

  if (!taskId || !answer) {
    throw new Error("Usage: triagent reply <task-id> -- <clarification answer>");
  }

  const result = await replyToTask({ taskId, answer, fullContext });
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

function status(argv = []) {
  const store = openStore();
  const tasks = store.listTasks(20);
  if (!tasks.length) {
    argv.includes("--json") ? printJson({ tasks: [] }) : console.log("No triagent tasks yet.");
    store.close();
    return;
  }

  if (argv.includes("--json")) {
    printJson({ tasks });
    store.close();
    return;
  }

  for (const task of tasks) {
    console.log(`${task.createdAt} ${task.status.padEnd(18)} ${task.agent.padEnd(6)} ${task.title}`);
  }
  store.close();
}

function readAfterSeparator(argv) {
  const separator = argv.indexOf("--");
  return separator >= 0 ? argv.slice(separator + 1).join(" ").trim() : "";
}

function printConfigTable(config) {
  printTable(
    ["Key", "Value"],
    [
      ["version", config.version],
      ["defaults.route", config.defaults.route],
      ["defaults.priority", config.defaults.priority],
      ["defaults.max_attempts", config.defaults.maxAttempts],
      ["token_save_mode", config.tokenSaveMode],
      ["prefilter_max_chars", config.prefilterMaxChars],
      ["compliance_mode", config.complianceMode]
    ]
  );
}

function getConfigValue(config, key) {
  return key.split(".").reduce((value, part) => value?.[part], config);
}

function setConfigValue(config, key, value) {
  const parts = key.split(".");
  let target = config;
  for (const part of parts.slice(0, -1)) {
    target[part] ||= {};
    target = target[part];
  }
  target[parts.at(-1)] = value;
}

function coerceConfigValue(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+$/.test(value)) return Number(value);
  if (value.startsWith("[") || value.startsWith("{")) return JSON.parse(value);
  return value;
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
