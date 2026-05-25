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
