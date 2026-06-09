import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { replyToTask, runAllDiscussion, runSingleAgent } from "../src/runner.js";
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

test("ignores clarification markers that only appear in stderr logs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "triagent-runner-"));
  const dbPath = join(dir, "triagent.sqlite");
  try {
    const store = new TriagentStore(dbPath);
    const fakeAgent = join(dir, "fake-agent.sh");
    await writeFile(
      fakeAgent,
      "#!/bin/sh\necho '[NEED_CLARIFY]: <question>' >&2\necho '[E1] final answer is complete'\n",
      "utf8"
    );
    await chmod(fakeAgent, 0o755);

    const result = await runSingleAgent({
      agent: "ant",
      goal: "stderr contains documentation example",
      store,
      antCommand: fakeAgent
    });

    const verifyStore = new TriagentStore(dbPath);
    const events = verifyStore.listEvents(result.taskId);

    assert.equal(result.status, "succeeded");
    assert.equal(verifyStore.getTask(result.taskId).status, "succeeded");
    assert.equal(events.some((event) => event.stream === "clarify"), false);
    verifyStore.close();
  } finally {
    await unlink(dbPath).catch(() => {});
    await unlink(join(dir, "fake-agent.sh")).catch(() => {});
    await rmdir(dir).catch(() => {});
  }
});

test("marks successful subagent output without evidence IDs as needs_evidence", async () => {
  const dir = await mkdtemp(join(tmpdir(), "triagent-runner-"));
  const dbPath = join(dir, "triagent.sqlite");
  try {
    const store = new TriagentStore(dbPath);
    const fakeAgent = join(dir, "fake-agent.sh");
    await writeFile(fakeAgent, "#!/bin/sh\necho 'I checked the project and it is fine.'\n", "utf8");
    await chmod(fakeAgent, 0o755);

    const result = await runSingleAgent({
      agent: "ant",
      goal: "review without evidence",
      store,
      antCommand: fakeAgent
    });

    const verifyStore = new TriagentStore(dbPath);
    const task = verifyStore.getTask(result.taskId);
    const events = verifyStore.listEvents(result.taskId);

    assert.equal(result.status, "needs_evidence");
    assert.equal(task.status, "needs_evidence");
    assert.equal(events.some((event) => event.stream === "evidence"), true);
    verifyStore.close();
  } finally {
    await unlink(dbPath).catch(() => {});
    await rmdir(dir).catch(() => {});
  }
});

test("runs Codex subagent through the tracked process path", async () => {
  const dir = await mkdtemp(join(tmpdir(), "triagent-runner-"));
  const dbPath = join(dir, "triagent.sqlite");
  try {
    const store = new TriagentStore(dbPath);
    const fakeAgent = join(dir, "fake-codex.sh");
    await writeFile(fakeAgent, "#!/bin/sh\necho '[E1] Codex subagent checked the task'\n", "utf8");
    await chmod(fakeAgent, 0o755);

    const result = await runSingleAgent({
      agent: "codex_subagent",
      goal: "inspect with Codex subagent",
      store,
      codexCommand: fakeAgent
    });

    const verifyStore = new TriagentStore(dbPath);
    const task = verifyStore.getTask(result.taskId);
    const events = verifyStore.listEvents(result.taskId);

    assert.equal(result.status, "succeeded");
    assert.equal(task.agent, "codex_subagent");
    assert.equal(events.some((event) => event.content.includes("exec --cd")), true);
    verifyStore.close();
  } finally {
    await unlink(dbPath).catch(() => {});
    await unlink(join(dir, "fake-codex.sh")).catch(() => {});
    await rmdir(dir).catch(() => {});
  }
});

test("token-save /all stores compact summaries and waits for Codex review", async () => {
  const dir = await mkdtemp(join(tmpdir(), "triagent-runner-"));
  const dbPath = join(dir, "triagent.sqlite");
  try {
    const store = new TriagentStore(dbPath);
    const fakeAgent = join(dir, "fake-agent.sh");
    await writeFile(
      fakeAgent,
      [
        "#!/bin/sh",
        "text=\"$*\"",
        "case \"$text\" in",
        "  *Compliance*) echo 'PASS [E4] evidence maps to edits' ;;",
        "  *Joint*) echo '方案 A [E3] 推荐\\n方案 B [E2] 备选\\n潜在红线冲突: none [E1]\\n证据索引: [E1] [E2] [E3]' ;;",
        "  *Alternative*) echo '[E2] Antigravity alternative: keep UI stable' ;;",
        "  *) echo '[E1] Pre-filter summary: src/runner.js line 75 is affected' ;;",
        "esac"
      ].join("\n"),
      "utf8"
    );
    await chmod(fakeAgent, 0o755);

    const result = await runAllDiscussion({
      goal: "Refactor runner safely",
      store,
      hermesCommand: fakeAgent,
      antCommand: fakeAgent,
      codexCommand: fakeAgent,
      tokenSaveMode: true
    });

    const verifyStore = new TriagentStore(dbPath);
    const task = verifyStore.getTask(result.taskId);
    const events = verifyStore.listEvents(result.taskId);

    assert.equal(result.status, "needs_codex_review");
    assert.equal(task.status, "needs_codex_review");
    assert.equal(verifyStore.getTaskMeta(result.taskId, "token_save_mode"), "true");
    assert.match(verifyStore.getTaskMeta(result.taskId, "prefilter_summary"), /Pre-filter summary/);
    assert.match(verifyStore.getTaskMeta(result.taskId, "joint_proposal"), /方案 A/);
    assert.equal(events.filter((event) => event.stream === "phase").length, 5);
    verifyStore.close();
  } finally {
    await unlink(dbPath).catch(() => {});
    await unlink(join(dir, "fake-agent.sh")).catch(() => {});
    await rmdir(dir).catch(() => {});
  }
});

test("token-save /all blocks on compliance failure", async () => {
  const dir = await mkdtemp(join(tmpdir(), "triagent-runner-"));
  const dbPath = join(dir, "triagent.sqlite");
  try {
    const store = new TriagentStore(dbPath);
    const fakeAgent = join(dir, "fake-agent.sh");
    await writeFile(
      fakeAgent,
      [
        "#!/bin/sh",
        "text=\"$*\"",
        "case \"$text\" in",
        "  *Compliance*) echo 'FAIL [E4] proposal does not map evidence to edits' ;;",
        "  *Joint*) echo '方案 A [E3] 推荐\\n方案 B [E2] 备选\\n潜在红线冲突: none [E1]\\n证据索引: [E1] [E2] [E3]' ;;",
        "  *Alternative*) echo '[E2] Antigravity alternative: keep UI stable' ;;",
        "  *) echo '[E1] Pre-filter summary: src/runner.js line 75 is affected' ;;",
        "esac"
      ].join("\n"),
      "utf8"
    );
    await chmod(fakeAgent, 0o755);

    const result = await runAllDiscussion({
      goal: "Refactor runner safely",
      store,
      hermesCommand: fakeAgent,
      antCommand: fakeAgent,
      codexCommand: fakeAgent,
      tokenSaveMode: true
    });

    const verifyStore = new TriagentStore(dbPath);
    assert.equal(result.status, "needs_compliance");
    assert.equal(verifyStore.getTask(result.taskId).status, "needs_compliance");
    assert.match(verifyStore.getTaskMeta(result.taskId, "compliance_result"), /FAIL/);
    verifyStore.close();
  } finally {
    await unlink(dbPath).catch(() => {});
    await unlink(join(dir, "fake-agent.sh")).catch(() => {});
    await rmdir(dir).catch(() => {});
  }
});

test("token-save /all can warn instead of blocking compliance failure", async () => {
  const dir = await mkdtemp(join(tmpdir(), "triagent-runner-"));
  const dbPath = join(dir, "triagent.sqlite");
  try {
    const store = new TriagentStore(dbPath);
    const fakeAgent = join(dir, "fake-agent.sh");
    await writeFile(
      fakeAgent,
      [
        "#!/bin/sh",
        "text=\"$*\"",
        "case \"$text\" in",
        "  *Compliance*) echo 'FAIL [E4] proposal does not map evidence to edits' ;;",
        "  *Joint*) echo '方案 A [E3] 推荐\\n方案 B [E2] 备选\\n潜在红线冲突: none [E1]\\n证据索引: [E1] [E2] [E3]' ;;",
        "  *Alternative*) echo '[E2] Antigravity alternative: keep UI stable' ;;",
        "  *) echo '[E1] Pre-filter summary: src/runner.js line 75 is affected' ;;",
        "esac"
      ].join("\n"),
      "utf8"
    );
    await chmod(fakeAgent, 0o755);

    const result = await runAllDiscussion({
      goal: "Refactor runner safely",
      store,
      hermesCommand: fakeAgent,
      antCommand: fakeAgent,
      codexCommand: fakeAgent,
      tokenSaveMode: true,
      complianceMode: "warn"
    });

    const verifyStore = new TriagentStore(dbPath);
    assert.equal(result.status, "needs_codex_review");
    assert.equal(verifyStore.getTask(result.taskId).status, "needs_codex_review");
    assert.equal(verifyStore.getTaskMeta(result.taskId, "compliance_mode"), "warn");
    verifyStore.close();
  } finally {
    await unlink(dbPath).catch(() => {});
    await unlink(join(dir, "fake-agent.sh")).catch(() => {});
    await rmdir(dir).catch(() => {});
  }
});

test("legacy /all keeps the old seven-phase flow", async () => {
  const dir = await mkdtemp(join(tmpdir(), "triagent-runner-"));
  const dbPath = join(dir, "triagent.sqlite");
  try {
    const store = new TriagentStore(dbPath);
    const fakeAgent = join(dir, "fake-agent.sh");
    await writeFile(fakeAgent, "#!/bin/sh\necho '[E1] legacy ok'\n", "utf8");
    await chmod(fakeAgent, 0o755);

    const result = await runAllDiscussion({
      goal: "Plan safely",
      store,
      hermesCommand: fakeAgent,
      antCommand: fakeAgent,
      codexCommand: fakeAgent,
      tokenSaveMode: false
    });

    const verifyStore = new TriagentStore(dbPath);
    const phaseEvents = verifyStore.listEvents(result.taskId).filter((event) => event.stream === "phase");

    assert.equal(result.status, "needs_codex_review");
    assert.equal(phaseEvents.length, 7);
    assert.equal(verifyStore.getTaskMeta(result.taskId, "legacy_all"), "true");
    verifyStore.close();
  } finally {
    await unlink(dbPath).catch(() => {});
    await unlink(join(dir, "fake-agent.sh")).catch(() => {});
    await rmdir(dir).catch(() => {});
  }
});

test("reply uses incremental context by default when a summary exists", async () => {
  const dir = await mkdtemp(join(tmpdir(), "triagent-runner-"));
  const dbPath = join(dir, "triagent.sqlite");
  try {
    const store = new TriagentStore(dbPath);
    const task = store.createTask({
      mode: "single",
      agent: "ant",
      cwd: dir,
      title: "Needs clarification",
      taskPacket: "Original task packet with a large raw log"
    });
    store.setTaskMeta(task.id, "prefilter_summary", "[E1] compact summary");
    store.updateTaskStatus(task.id, "needs_clarification");
    store.close();

    const fakeAgent = join(dir, "fake-agent.sh");
    await writeFile(fakeAgent, "#!/bin/sh\nprintf '%s' \"$*\" | grep -q 'Original task packet' && exit 2\necho '[E1] continued'\n", "utf8");
    await chmod(fakeAgent, 0o755);

    const replyStore = new TriagentStore(dbPath);
    const result = await replyToTask({
      taskId: task.id,
      answer: "Use the compact summary only.",
      store: replyStore,
      antCommand: fakeAgent
    });

    const verifyStore = new TriagentStore(dbPath);
    const child = verifyStore.getTask(result.taskId);
    assert.equal(result.status, "succeeded");
    assert.match(child.taskPacket, /Incremental clarification/);
    assert.doesNotMatch(child.taskPacket, /Original task packet with a large raw log/);
    verifyStore.close();
  } finally {
    await unlink(dbPath).catch(() => {});
    await unlink(join(dir, "fake-agent.sh")).catch(() => {});
    await rmdir(dir).catch(() => {});
  }
});
