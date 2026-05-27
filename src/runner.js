import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";

import { buildAuditPacket } from "./audit.js";
import { buildClarificationPacket, parseClarificationRequest, shouldBlockClarification } from "./clarify.js";
import { buildAgentCommand, buildAllDiscussionPlan, buildTaskPacket, resolveAntigravityCommand } from "./commands.js";
import { defaultDbPath } from "./paths.js";
import { evaluateEvidenceStatus } from "./evidence.js";
import { buildMarkdownReport } from "./report.js";
import { buildDryRunTaskPacket, createGitSandbox } from "./sandbox.js";
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
  antCommand,
  mode = "single",
  parentTaskId,
  meta = {}
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
    mode,
    agent: normalizedAgent,
    cwd,
    title: title || firstLine(goal || packet),
    taskPacket: packet
  });
  if (parentTaskId) {
    store.setTaskMeta(task.id, "parent_task_id", parentTaskId);
  }
  for (const [key, value] of Object.entries(meta)) {
    store.setTaskMeta(task.id, key, value);
  }

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

export async function runAllDiscussion({ goal, cwd = process.cwd(), store = openStore(), mode = "all", meta = {} }) {
  const phases = buildAllDiscussionPlan(goal, cwd);
  for (const phase of phases) {
    assertSafeTaskPacket(phase.taskPacket);
  }
  const task = store.createTask({
    mode,
    agent: "all",
    cwd,
    title: firstLine(goal),
    taskPacket: phases.map((phase, index) => `# ${index + 1}. ${phase.title}\n${phase.taskPacket}`).join("\n\n")
  });
  for (const [key, value] of Object.entries(meta)) {
    store.setTaskMeta(task.id, key, value);
  }
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
    if (result.status === "needs_clarification") {
      store.finishTask(task.id, { status: "needs_clarification", exitCode: 0 });
      publish("task", { ...task, status: "needs_clarification", exitCode: 0 });
      store.close();
      return { taskId: task.id, status: "needs_clarification" };
    }
    if (result.status === "needs_evidence") {
      store.finishTask(task.id, { status: "needs_evidence", exitCode: 0 });
      publish("task", { ...task, status: "needs_evidence", exitCode: 0 });
      store.close();
      return { taskId: task.id, status: "needs_evidence" };
    }
    failed ||= result.exitCode !== 0;
  }

  const status = failed ? "failed" : "needs_codex_review";
  store.finishTask(task.id, { status, exitCode: failed ? 1 : 0 });
  publish("task", { ...task, status });
  store.close();
  return { taskId: task.id, status };
}

export async function replyToTask({ taskId, answer, store = openStore(), antCommand }) {
  const task = store.getTask(taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }
  const count = Number(store.getTaskMeta(taskId, "clarify_count") || 0);
  if (shouldBlockClarification(count)) {
    store.updateTaskStatus(taskId, "blocked");
    store.appendEvent({
      taskId,
      agent: "codex",
      stream: "clarify",
      content: "Clarification limit reached. Task is blocked for Codex review."
    });
    store.close();
    return { taskId, status: "blocked" };
  }

  const nextCount = count + 1;
  store.setTaskMeta(taskId, "clarify_count", String(nextCount));
  store.appendEvent({ taskId, agent: "codex", stream: "clarify", content: answer });
  const packet = buildClarificationPacket({
    originalPacket: task.taskPacket,
    recentEvents: store.listEvents(taskId),
    answer,
    count: nextCount
  });

  return runSingleAgent({
    agent: task.agent,
    goal: task.title,
    taskPacket: packet,
    cwd: task.cwd,
    title: `Clarification ${nextCount}: ${task.title}`,
    store,
    antCommand,
    mode: "clarification",
    parentTaskId: taskId,
    meta: { clarify_count: String(nextCount) }
  });
}

export async function runAudit({ taskId, auditor, store = openStore(), antCommand }) {
  const task = store.getTask(taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }
  const agent = auditor === "antigravity" ? "ant" : auditor;
  if (agent !== "ant" && agent !== "hermes") {
    throw new Error("Audit agent must be ant or hermes.");
  }
  const report = buildMarkdownReport({ store, taskId });
  const packet = buildAuditPacket({ taskId, report, auditor: agent });
  return runSingleAgent({
    agent,
    goal: `Shadow audit for ${task.title}`,
    taskPacket: packet,
    cwd: task.cwd,
    title: `Shadow audit: ${task.title}`,
    store,
    antCommand,
    mode: "audit",
    parentTaskId: taskId
  });
}

export async function runDryRunAgent({ agent, goal, cwd = process.cwd(), sandboxCwd, store = openStore(), antCommand }) {
  assertSafeTaskPacket(goal);
  const resolvedSandboxCwd = sandboxCwd || (await createGitSandbox({ cwd }));
  if (agent === "all") {
    return runAllDiscussion({
      goal: `Dry-run sandbox: ${goal}`,
      cwd: resolvedSandboxCwd,
      store,
      mode: "dry-run",
      meta: {
        real_cwd: cwd,
        sandbox_cwd: resolvedSandboxCwd
      }
    });
  }
  const packet = buildDryRunTaskPacket({ goal, realCwd: cwd, sandboxCwd: resolvedSandboxCwd });
  return runSingleAgent({
    agent,
    goal,
    taskPacket: packet,
    cwd: resolvedSandboxCwd,
    title: `Dry-run: ${firstLine(goal)}`,
    store,
    antCommand,
    mode: "dry-run",
    meta: {
      real_cwd: cwd,
      sandbox_cwd: resolvedSandboxCwd
    }
  });
}

async function spawnTrackedProcess({ task, command, cwd, store, agent }) {
  return new Promise((resolve) => {
    let combinedOutput = "";
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
      const content = chunk.toString();
      combinedOutput += content;
      store.appendEvent({ taskId: task.id, agent, stream: "stdout", content });
      publish("event", { taskId: task.id });
    });

    child.stderr.on("data", (chunk) => {
      const content = chunk.toString();
      combinedOutput += content;
      store.appendEvent({ taskId: task.id, agent, stream: "stderr", content });
      publish("event", { taskId: task.id });
    });

    child.on("error", (error) => {
      recordProcessError({ task, store, agent, error });
      resolve({ taskId: task.id, status: "failed", exitCode: 1 });
    });

    child.on("close", (code) => {
      const clarification = parseClarificationRequest(combinedOutput);
      const evaluation = evaluateEvidenceStatus({
        agent,
        exitCode: code ?? 1,
        output: combinedOutput,
        hasClarification: Boolean(clarification)
      });
      const status = evaluation.status;
      if (clarification) {
        store.appendEvent({
          taskId: task.id,
          agent,
          stream: "clarify",
          content: clarification
        });
        store.setTaskMeta(task.id, "clarify_count", store.getTaskMeta(task.id, "clarify_count") || "0");
      }
      if (status === "needs_evidence") {
        store.appendEvent({
          taskId: task.id,
          agent: "triagent",
          stream: "evidence",
          content: "Missing evidence IDs in successful subagent output. Codex review is required before accepting this result."
        });
      }
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
