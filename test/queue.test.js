import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rmdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { enqueueTask, nextRunnableTask, shouldRetryTask } from "../src/queue.js";
import { TriagentStore } from "../src/store.js";

test("queue returns higher priority tasks before older lower priority tasks", async () => {
  const dir = await mkdtemp(join(tmpdir(), "triagent-queue-"));
  const dbPath = join(dir, "triagent.sqlite");
  try {
    const store = new TriagentStore(dbPath);
    enqueueTask(store, {
      agent: "hermes",
      cwd: dir,
      title: "Low",
      taskPacket: "Goal: low",
      priority: 10
    });
    const high = enqueueTask(store, {
      agent: "ant",
      cwd: dir,
      title: "High",
      taskPacket: "Goal: high",
      priority: 90
    });

    assert.equal(nextRunnableTask(store).id, high.id);
    store.close();
  } finally {
    await unlink(dbPath).catch(() => {});
    await rmdir(dir).catch(() => {});
  }
});

test("retry policy retries failed process attempts only below max attempts", () => {
  assert.equal(shouldRetryTask({ status: "failed", attempt: 1, maxAttempts: 2 }), true);
  assert.equal(shouldRetryTask({ status: "failed", attempt: 2, maxAttempts: 2 }), false);
  assert.equal(shouldRetryTask({ status: "needs_evidence", attempt: 1, maxAttempts: 2 }), false);
  assert.equal(shouldRetryTask({ status: "needs_clarification", attempt: 1, maxAttempts: 2 }), false);
});
