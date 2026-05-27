#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";

import { startDashboard } from "../src/dashboard.js";
import { runAllDiscussion, runSingleAgent, openStore } from "../src/runner.js";
import { buildMarkdownReport } from "../src/report.js";
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
  triagent dashboard [--port 8765]
  triagent status
  triagent note <task-id> -- <markdown note>
  triagent report <task-id> [--out report.md]
  triagent run hermes -- <task packet>
  triagent run ant -- <task packet>
  triagent run all [--yes-risk] -- <goal>
`);
}

async function dashboard(argv) {
  const port = Number(readFlag(argv, "--port") || 8765);
  const { url } = await startDashboard({ port });
  console.log(`Triagent dashboard: ${url}`);
}

async function run(argv) {
  const agent = argv[0];
  const yesRisk = argv.includes("--yes-risk");
  const filteredArgv = argv.filter((item) => item !== "--yes-risk");
  const separator = filteredArgv.indexOf("--");
  const taskText = (separator >= 0 ? filteredArgv.slice(separator + 1) : filteredArgv.slice(1)).join(" ").trim();

  if (!agent || !taskText) {
    throw new Error("Usage: triagent run <hermes|ant|all> -- <task packet>");
  }

  await confirmHighRisk({ taskText, yesRisk });

  if (agent === "all") {
    const result = await runAllDiscussion({ goal: taskText });
    console.log(`triagent all task ${result.taskId}: ${result.status}`);
    return;
  }

  const result = await runSingleAgent({ agent, goal: taskText });
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
