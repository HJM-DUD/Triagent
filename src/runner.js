import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";

import { buildAgentCommand, buildAllDiscussionPlan, buildTaskPacket, resolveAntigravityCommand } from "./commands.js";
import { defaultDbPath } from "./paths.js";
import { assertSafeTaskPacket } from "./safety.js";
import { TriagentStore } from "./store.js";

export const bus = new EventEmitter();

export function openStore(dbPath = defaultDbPath()) {
  const store = new TriagentStore(dbPath);
  store.pruneOlderThan(new Date().toISOString(), 30);
  return store;
}

export function publish(type, payload) {
  bus.emit("message", { type, payload });
}

export async function runSingleAgent({
  agent,
  goal,
  taskPacket,
  cwd = process.cwd(),
  edit = false,
  title,
  store = openStore(),
  antCommand
}) {
  const normalizedAgent = agent === "antigravity" ? "ant" : agent;
  const packet = taskPacket || buildTaskPacket({ goal, cwd, edit });
  assertSafeTaskPacket(packet);
  const command = buildAgentCommand({
    agent: normalizedAgent,
    taskPacket: packet,
    edit,
    antCommand: antCommand || (normalizedAgent === "ant" ? resolveAntigravityCommand() : undefined)
  });
  const task = store.createTask({
    mode: "single",
    agent: normalizedAgent,
    cwd,
    title: title || firstLine(goal || packet),
    taskPacket: packet
  });

  publish("task", task);
  store.appendEvent({
    taskId: task.id,
    agent: normalizedAgent,
    stream: "system",
    content: `$ ${command.cmd} ${command.args.map(shellQuote).join(" ")}`
  });

  const result = await spawnTrackedProcess({ task, command, cwd, store, agent: normalizedAgent });
  store.close();
  return result;
}

export async function runAllDiscussion({ goal, cwd = process.cwd(), store = openStore() }) {
  const phases = buildAllDiscussionPlan(goal, cwd);
  for (const phase of phases) {
    assertSafeTaskPacket(phase.taskPacket);
  }
  const task = store.createTask({
    mode: "all",
    agent: "all",
    cwd,
    title: firstLine(goal),
    taskPacket: phases.map((phase, index) => `# ${index + 1}. ${phase.title}\n${phase.taskPacket}`).join("\n\n")
  });
  publish("task", task);

  let failed = false;
  for (const [index, phase] of phases.entries()) {
    store.appendEvent({
      taskId: task.id,
      agent: phase.agent,
      stream: "phase",
      content: `Phase ${index + 1}: ${phase.title}\n${phase.taskPacket}`
    });
    publish("event", { taskId: task.id });

    if (phase.agent === "codex") {
      store.appendEvent({
        taskId: task.id,
        agent: "codex",
        stream: "system",
        content: "Codex phase is recorded for the lead agent to answer in Codex App; no local model call is made by the dashboard."
      });
      publish("event", { taskId: task.id });
      continue;
    }

    const command = buildAgentCommand({
      agent: phase.agent,
      taskPacket: phase.taskPacket,
      antCommand: phase.agent === "ant" ? resolveAntigravityCommand() : undefined
    });
    store.appendEvent({
      taskId: task.id,
      agent: phase.agent,
      stream: "system",
      content: `$ ${command.cmd} ${command.args.map(shellQuote).join(" ")}`
    });
    const result = await spawnTrackedProcess({ task, command, cwd, store, agent: phase.agent });
    failed ||= result.exitCode !== 0;
  }

  const status = failed ? "failed" : "needs_codex_review";
  store.finishTask(task.id, { status, exitCode: failed ? 1 : 0 });
  publish("task", { ...task, status });
  store.close();
  return { taskId: task.id, status };
}

async function spawnTrackedProcess({ task, command, cwd, store, agent }) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command.cmd, command.args, {
        cwd,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch (error) {
      recordProcessError({ task, store, agent, error });
      resolve({ taskId: task.id, status: "failed", exitCode: 1 });
      return;
    }

    child.stdout.on("data", (chunk) => {
      store.appendEvent({ taskId: task.id, agent, stream: "stdout", content: chunk.toString() });
      publish("event", { taskId: task.id });
    });

    child.stderr.on("data", (chunk) => {
      store.appendEvent({ taskId: task.id, agent, stream: "stderr", content: chunk.toString() });
      publish("event", { taskId: task.id });
    });

    child.on("error", (error) => {
      recordProcessError({ task, store, agent, error });
      resolve({ taskId: task.id, status: "failed", exitCode: 1 });
    });

    child.on("close", (code) => {
      const status = code === 0 ? "succeeded" : "failed";
      store.finishTask(task.id, { status, exitCode: code ?? 1 });
      publish("task", { ...task, status, exitCode: code ?? 1 });
      resolve({ taskId: task.id, status, exitCode: code ?? 1 });
    });
  });
}

function recordProcessError({ task, store, agent, error }) {
  store.appendEvent({
    taskId: task.id,
    agent,
    stream: "stderr",
    content: error.message
  });
  store.finishTask(task.id, { status: "failed", exitCode: 1 });
  publish("event", { taskId: task.id });
  publish("task", { ...task, status: "failed", exitCode: 1 });
}

function firstLine(value) {
  return String(value || "Untitled task").split("\n")[0].slice(0, 120);
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}
