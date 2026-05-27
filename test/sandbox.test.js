import test from "node:test";
import assert from "node:assert/strict";

import { assertApplyAllowed, buildDryRunTaskPacket } from "../src/sandbox.js";

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
