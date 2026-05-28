import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAlternativePacket,
  buildCompliancePacket,
  buildIncrementalClarificationPacket,
  buildJointProposalPacket,
  buildPrefilterPacket,
  evaluateComplianceOutput,
  truncateSummary
} from "../src/token-save.js";

test("builds a Hermes pre-filter packet with a strict summary budget", () => {
  const packet = buildPrefilterPacket({
    goal: "Fix a failing dashboard flow",
    cwd: "/project",
    maxChars: 800
  });

  assert.match(packet, /Token-save Pre-Filter/);
  assert.match(packet, /800/);
  assert.match(packet, /受影响的文件路径/);
  assert.match(packet, /Evidence ID/);
});

test("builds compact alternative and joint proposal packets without raw log instructions", () => {
  const alternative = buildAlternativePacket({
    goal: "Refactor runner",
    prefilterSummary: "[E1] src/runner.js is too broad"
  });
  const proposal = buildJointProposalPacket({
    goal: "Refactor runner",
    prefilterSummary: "[E1] src/runner.js is too broad",
    alternativeSummary: "[E2] keep dashboard stable"
  });

  assert.match(alternative, /Use only the structured pre-filter summary/);
  assert.match(proposal, /方案 A/);
  assert.match(proposal, /方案 B/);
  assert.match(proposal, /潜在红线冲突/);
  assert.doesNotMatch(proposal, /Raw Log/);
});

test("detects compliance FAIL and builds a compliance packet", () => {
  const packet = buildCompliancePacket({
    proposal: "方案 A\n- [E1] change runner"
  });

  assert.match(packet, /Return PASS or FAIL/);
  assert.equal(evaluateComplianceOutput("FAIL [E1] proposal lacks verification").ok, false);
  assert.equal(evaluateComplianceOutput("PASS [E1] evidence maps to edits").ok, true);
});

test("builds incremental clarification packets without full original context", () => {
  const packet = buildIncrementalClarificationPacket({
    taskId: "task-1024",
    summaryRef: "prefilter_summary",
    answer: "Only inspect src/runner.js.",
    count: 2,
    recentEvents: [{ agent: "hermes", stream: "clarify", content: "Which file?" }]
  });

  assert.match(packet, /Incremental clarification reply 2\/3/);
  assert.match(packet, /task-1024/);
  assert.match(packet, /Only inspect src\/runner.js/);
  assert.doesNotMatch(packet, /Original task packet/);
});

test("truncates summaries at the configured budget", () => {
  assert.equal(truncateSummary("abcdef", 4), "abcd");
});
