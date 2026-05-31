import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rmdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { TriagentStore } from "../src/store.js";

test("creates tasks, appends events, and lists recent tasks", async () => {
  const dir = await mkdtemp(join(tmpdir(), "triagent-store-"));
  const dbPath = join(dir, "triagent.sqlite");
  try {
    const store = new TriagentStore(dbPath);
    const task = store.createTask({
      mode: "single",
      agent: "hermes",
      cwd: "/tmp/project",
      title: "Inspect project",
      taskPacket: "Goal: inspect project"
    });

    store.appendEvent({
      taskId: task.id,
      agent: "hermes",
      stream: "stdout",
      content: "ready"
    });
    store.finishTask(task.id, { status: "succeeded", exitCode: 0 });

    const tasks = store.listTasks();
    const events = store.listEvents(task.id);

    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].status, "succeeded");
    assert.equal(events.length, 1);
    assert.equal(events[0].content, "ready");
    store.close();
  } finally {
    await unlink(dbPath).catch(() => {});
    await rmdir(dir).catch(() => {});
  }
});

test("prunes records older than the retention window", async () => {
  const dir = await mkdtemp(join(tmpdir(), "triagent-store-"));
  const dbPath = join(dir, "triagent.sqlite");
  try {
    const store = new TriagentStore(dbPath);
    const oldTask = store.createTask({
      mode: "single",
      agent: "hermes",
      cwd: "/tmp/project",
      title: "Old task",
      taskPacket: "Goal: old"
    });
    store.markTaskCreatedAt(oldTask.id, "2026-04-01T00:00:00.000Z");
    store.pruneOlderThan("2026-05-25T00:00:00.000Z", 30);

    assert.equal(store.listTasks().length, 0);
    store.close();
  } finally {
    await unlink(dbPath).catch(() => {});
    await rmdir(dir).catch(() => {});
  }
});

test("lists task and event changes since a timestamp", async () => {
  const dir = await mkdtemp(join(tmpdir(), "triagent-store-"));
  const dbPath = join(dir, "triagent.sqlite");
  try {
    const store = new TriagentStore(dbPath);
    const before = "2026-05-27T00:00:00.000Z";
    const task = store.createTask({
      mode: "single",
      agent: "hermes",
      cwd: "/tmp/project",
      title: "Live task",
      taskPacket: "Goal: live"
    });
    store.markTaskCreatedAt(task.id, "2026-05-27T00:00:01.000Z");
    store.appendEvent({
      taskId: task.id,
      agent: "hermes",
      stream: "stdout",
      content: "new output"
    });

    const changes = store.listChangesSince(before);

    assert.equal(changes.tasks.length, 1);
    assert.equal(changes.tasks[0].id, task.id);
    assert.equal(changes.events.length, 1);
    assert.equal(changes.events[0].content, "new output");
    store.close();
  } finally {
    await unlink(dbPath).catch(() => {});
    await rmdir(dir).catch(() => {});
  }
});

test("stores task metadata for 0.3 workflows", async () => {
  const dir = await mkdtemp(join(tmpdir(), "triagent-store-"));
  const dbPath = join(dir, "triagent.sqlite");
  try {
    const store = new TriagentStore(dbPath);
    const task = store.createTask({
      mode: "single",
      agent: "hermes",
      cwd: "/tmp/project",
      title: "Meta task",
      taskPacket: "Goal: meta"
    });

    store.setTaskMeta(task.id, "clarify_count", "2");
    store.setTaskMeta(task.id, "parent_task_id", "parent-1");

    assert.equal(store.getTaskMeta(task.id, "clarify_count"), "2");
    assert.deepEqual(store.listTaskMeta(task.id), {
      clarify_count: "2",
      parent_task_id: "parent-1"
    });
    store.close();
  } finally {
    await unlink(dbPath).catch(() => {});
    await rmdir(dir).catch(() => {});
  }
});

test("stores v0.4 routing and queue fields without breaking older task shape", async () => {
  const dir = await mkdtemp(join(tmpdir(), "triagent-store-"));
  const dbPath = join(dir, "triagent.sqlite");
  try {
    const store = new TriagentStore(dbPath);
    const task = store.createTask({
      mode: "queued",
      agent: "hermes",
      cwd: "/tmp/project",
      title: "Queued task",
      taskPacket: "Goal: queued",
      priority: 80,
      attempt: 2,
      maxAttempts: 3,
      routeAgent: "hermes",
      routeReason: "prefix /her",
      riskLevel: "low"
    });

    const listed = store.listTasks()[0];

    assert.equal(listed.id, task.id);
    assert.equal(listed.priority, 80);
    assert.equal(listed.attempt, 2);
    assert.equal(listed.maxAttempts, 3);
    assert.equal(listed.routeAgent, "hermes");
    assert.equal(listed.routeReason, "prefix /her");
    assert.equal(listed.riskLevel, "low");
    store.close();
  } finally {
    await unlink(dbPath).catch(() => {});
    await rmdir(dir).catch(() => {});
  }
});
