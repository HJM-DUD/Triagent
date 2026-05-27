import test from "node:test";
import assert from "node:assert/strict";

import { assertApplyAllowed, buildDryRunTaskPacket, applySandboxGcPlan, buildSandboxGcPlan } from "../src/sandbox.js";

test("dry-run task packet makes sandbox boundaries explicit", () => {
  const packet = buildDryRunTaskPacket({
    goal: "refactor runner",
    realCwd: "/project",
    sandboxCwd: "/tmp/triagent-sandbox"
  });

  assert.match(packet, /Dry-run sandbox/);
  assert.match(packet, /\/tmp\/triagent-sandbox/);
  assert.match(packet, /Do not modify the real working directory/);
});

test("apply refuses dirty, failed, or dangerous sandbox state", () => {
  assert.throws(
    () => assertApplyAllowed({ realWorktreeClean: false, sandboxStatus: "succeeded", diffText: "diff --git a/a b/a" }),
    /real working tree is not clean/
  );
  assert.throws(
    () => assertApplyAllowed({ realWorktreeClean: true, sandboxStatus: "failed", diffText: "diff --git a/a b/a" }),
    /sandbox task did not succeed/
  );
  assert.throws(
    () => assertApplyAllowed({ realWorktreeClean: true, sandboxStatus: "succeeded", diffText: "diff --git a/a b/a\ndeleted file mode 100644" }),
    /dangerous diff/
  );
});

test("sandbox gc defaults to a preview plan for applied and old clean sandboxes", async () => {
  const tasks = [
    {
      id: "applied-task",
      mode: "dry-run",
      status: "applied",
      updatedAt: "2026-05-27T00:00:00.000Z"
    },
    {
      id: "old-clean-task",
      mode: "dry-run",
      status: "succeeded",
      updatedAt: "2026-05-10T00:00:00.000Z"
    },
    {
      id: "new-task",
      mode: "dry-run",
      status: "succeeded",
      updatedAt: "2026-05-26T00:00:00.000Z"
    }
  ];
  const store = {
    listTasks: () => tasks,
    getTaskMeta: (taskId, key) => (key === "sandbox_cwd" ? `/tmp/${taskId}` : undefined)
  };

  const plan = await buildSandboxGcPlan({
    store,
    nowIso: "2026-05-27T00:00:00.000Z",
    inspectSandbox: async () => ({ exists: true, clean: true })
  });

  assert.deepEqual(
    plan.candidates.map((item) => item.taskId),
    ["applied-task", "old-clean-task"]
  );
  assert.equal(plan.preview, true);
});

test("sandbox gc apply uses git worktree removal only for planned candidates", async () => {
  const removed = [];

  const result = await applySandboxGcPlan({
    candidates: [
      {
        taskId: "task-1",
        path: "/tmp/triagent-sandbox-1",
        reason: "applied",
        force: true
      }
    ],
    removeWorktree: async (path, options) => {
      removed.push({ path, options });
    }
  });

  assert.deepEqual(removed, [{ path: "/tmp/triagent-sandbox-1", options: { force: true } }]);
  assert.deepEqual(result.removed, ["task-1"]);
});
