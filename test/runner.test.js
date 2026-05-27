import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rmdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runAllDiscussion, runSingleAgent } from "../src/runner.js";
import { TriagentStore } from "../src/store.js";

test("blocks dangerous /all goals before creating task records", async () => {
  const dir = await mkdtemp(join(tmpdir(), "triagent-runner-"));
  const dbPath = join(dir, "triagent.sqlite");
  try {
    const store = new TriagentStore(dbPath);

    await assert.rejects(
      () => runAllDiscussion({ goal: "Please run rm -rf temp", store }),
      /Blocked dangerous task packet/
    );
    assert.equal(store.listTasks().length, 0);
    store.close();
  } finally {
    await unlink(dbPath).catch(() => {});
    await rmdir(dir).catch(() => {});
  }
});

test("marks task as needs_clarification when agent emits marker", async () => {
  const dir = await mkdtemp(join(tmpdir(), "triagent-runner-"));
  const dbPath = join(dir, "triagent.sqlite");
  try {
    const store = new TriagentStore(dbPath);

    const result = await runSingleAgent({
      agent: "ant",
      goal: "[NEED_CLARIFY]: Which dependency should I use?",
      store,
      antCommand: "/bin/echo"
    });

    const verifyStore = new TriagentStore(dbPath);
    const task = verifyStore.getTask(result.taskId);
    const events = verifyStore.listEvents(result.taskId);

    assert.equal(result.status, "needs_clarification");
    assert.equal(task.status, "needs_clarification");
    assert.equal(events.some((event) => event.stream === "clarify"), true);
    verifyStore.close();
  } finally {
    await unlink(dbPath).catch(() => {});
    await rmdir(dir).catch(() => {});
  }
});
