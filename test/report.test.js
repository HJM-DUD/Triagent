import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rmdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildMarkdownReport } from "../src/report.js";
import { TriagentStore } from "../src/store.js";

test("builds a markdown report with task packet, output, exit code, and codex note", async () => {
  const dir = await mkdtemp(join(tmpdir(), "triagent-report-"));
  const dbPath = join(dir, "triagent.sqlite");
  try {
    const store = new TriagentStore(dbPath);
    const task = store.createTask({
      mode: "all",
      agent: "all",
      cwd: "/tmp/project",
      title: "Plan upgrade",
      taskPacket: "Goal: plan upgrade"
    });
    store.appendEvent({
      taskId: task.id,
      agent: "hermes",
      stream: "stdout",
      content: "[E1] found current command layout"
    });
    store.addCodexNote(task.id, "Final decision: ship dashboard first.");
    store.finishTask(task.id, { status: "codex_reviewed", exitCode: 0 });

    const report = buildMarkdownReport({ store, taskId: task.id });

    assert.match(report, /# Triagent Report: Plan upgrade/);
    assert.match(report, /Status: codex_reviewed/);
    assert.match(report, /Goal: plan upgrade/);
    assert.match(report, /\[E1\] found current command layout/);
    assert.match(report, /Final decision: ship dashboard first\./);
    store.close();
  } finally {
    await unlink(dbPath).catch(() => {});
    await rmdir(dir).catch(() => {});
  }
});
