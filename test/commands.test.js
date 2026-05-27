import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAgentCommand,
  buildAllDiscussionPlan,
  buildTaskPacket,
  resolveAntigravityCommand
} from "../src/commands.js";

test("builds Hermes command with required provider, model, and task packet", () => {
  const command = buildAgentCommand({
    agent: "hermes",
    taskPacket: "Goal: inspect project",
    edit: false
  });

  assert.equal(command.cmd, "hermes");
  assert.deepEqual(command.args, [
    "-z",
    "Goal: inspect project",
    "--provider",
    "deepseek",
    "--model",
    "deepseek-v4-pro"
  ]);
});

test("builds Antigravity command using detected command name", () => {
  const command = buildAgentCommand({
    agent: "ant",
    taskPacket: "Goal: review design",
    antCommand: "agy"
  });

  assert.equal(command.cmd, "agy");
  assert.deepEqual(command.args, ["--print", "Goal: review design"]);
});

test("prefers agy over antigravity when both command names are available", () => {
  const found = resolveAntigravityCommand((name) => name === "agy" || name === "antigravity");
  assert.equal(found, "agy");
});

test("/all discussion plan has deterministic phases", () => {
  const phases = buildAllDiscussionPlan("Design a safe migration");

  assert.deepEqual(phases.map((phase) => phase.agent), [
    "codex",
    "hermes",
    "ant",
    "codex",
    "hermes",
    "ant",
    "codex"
  ]);
  assert.match(phases[0].taskPacket, /Problem definition/);
  assert.match(phases.at(-1).taskPacket, /Final裁决/);
  assert.match(phases[1].taskPacket, /500/);
  assert.match(phases[4].taskPacket, /summary/i);
  assert.doesNotMatch(phases[4].taskPacket, /完整.*Raw Log/);
});

test("task packets require evidence IDs in subagent output", () => {
  const packet = buildTaskPacket({
    goal: "Inspect project",
    cwd: "/tmp/project"
  });

  assert.match(packet, /Evidence ID/);
  assert.match(packet, /\[E1\]/);
});
