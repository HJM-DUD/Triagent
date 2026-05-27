import test from "node:test";
import assert from "node:assert/strict";

import { collectEvidenceIds, evaluateEvidenceStatus } from "../src/evidence.js";

test("collects evidence IDs from agent output", () => {
  assert.deepEqual(collectEvidenceIds("Found config [E2]\nChecked package [E1]"), ["[E1]", "[E2]"]);
});

test("marks successful subagent output without evidence as needs_evidence", () => {
  const result = evaluateEvidenceStatus({
    agent: "ant",
    exitCode: 0,
    output: "I checked the project and it is fine.",
    hasClarification: false
  });

  assert.equal(result.status, "needs_evidence");
});

test("does not override clarification or failed process statuses", () => {
  assert.equal(
    evaluateEvidenceStatus({
      agent: "hermes",
      exitCode: 0,
      output: "[NEED_CLARIFY]: Which file?",
      hasClarification: true
    }).status,
    "needs_clarification"
  );
  assert.equal(
    evaluateEvidenceStatus({
      agent: "ant",
      exitCode: 1,
      output: "failed without evidence",
      hasClarification: false
    }).status,
    "failed"
  );
});
