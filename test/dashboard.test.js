import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rmdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { startDashboard } from "../src/dashboard.js";
import { TriagentStore } from "../src/store.js";

test("dashboard exports a readonly markdown report for a task", async () => {
  const dir = await mkdtemp(join(tmpdir(), "triagent-dashboard-"));
  const dbPath = join(dir, "triagent.sqlite");
  let server;

  try {
    const store = new TriagentStore(dbPath);
    const task = store.createTask({
      mode: "all",
      agent: "all",
      cwd: "/tmp/project",
      title: "Observer note",
      taskPacket: "Goal: show the final decision"
    });
    store.appendEvent({
      taskId: task.id,
      agent: "hermes",
      stream: "stdout",
      content: "[E1] raw context"
    });
    store.addCodexNote(task.id, "Final decision: show this in the observer.");
    store.close();

    const dashboard = await startDashboard({ port: 0, dbPath });
    server = dashboard.server;

    const response = await fetch(`${dashboard.url}/api/tasks/${task.id}/report`);
    const markdown = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/markdown/);
    assert.match(response.headers.get("content-disposition"), /attachment/);
    assert.match(markdown, /# Triagent Report: Observer note/);
    assert.match(markdown, /Final decision: show this in the observer\./);
    assert.match(markdown, /\[E1\] raw context/);
  } finally {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
    await unlink(dbPath).catch(() => {});
    await rmdir(dir).catch(() => {});
  }
});
