#!/usr/bin/env node
import { startDashboard } from "../src/dashboard.js";
import { runAllDiscussion, runSingleAgent, openStore } from "../src/runner.js";

const args = process.argv.slice(2);
const command = args[0];

try {
  if (!command || command === "help" || command === "--help") {
    printHelp();
  } else if (command === "dashboard") {
    await dashboard(args.slice(1));
  } else if (command === "run") {
    await run(args.slice(1));
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
  triagent run hermes -- <task packet>
  triagent run ant -- <task packet>
  triagent run all -- <goal>
`);
}

async function dashboard(argv) {
  const port = Number(readFlag(argv, "--port") || 8765);
  const { url } = await startDashboard({ port });
  console.log(`Triagent dashboard: ${url}`);
}

async function run(argv) {
  const agent = argv[0];
  const separator = argv.indexOf("--");
  const taskText = (separator >= 0 ? argv.slice(separator + 1) : argv.slice(1)).join(" ").trim();

  if (!agent || !taskText) {
    throw new Error("Usage: triagent run <hermes|ant|all> -- <task packet>");
  }

  if (agent === "all") {
    const result = await runAllDiscussion({ goal: taskText });
    console.log(`triagent all task ${result.taskId}: ${result.status}`);
    return;
  }

  const result = await runSingleAgent({ agent, goal: taskText, taskPacket: taskText });
  console.log(`triagent ${agent} task ${result.taskId}: ${result.status}`);
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
