import test from "node:test";
import assert from "node:assert/strict";

import { buildClarificationPacket, parseClarificationRequest, shouldBlockClarification } from "../src/clarify.js";

test("parses NEED_CLARIFY requests from agent output", () => {
  const request = parseClarificationRequest("working\n[NEED_CLARIFY]: Should I install package X?\nmore");

  assert.equal(request, "Should I install package X?");
});

test("blocks clarification after three replies", () => {
  assert.equal(shouldBlockClarification(2), false);
  assert.equal(shouldBlockClarification(3), true);
});

test("builds a bounded clarification continuation packet", () => {
  const packet = buildClarificationPacket({
    originalPacket: "Goal: inspect project",
    recentEvents: [
      { agent: "hermes", stream: "stdout", content: "first output" },
      { agent: "codex", stream: "clarify", content: "Use local dependency only." }
    ],
    answer: "Use local dependency only.",
    count: 1
  });

  assert.match(packet, /Clarification reply 1\/3/);
  assert.match(packet, /Goal: inspect project/);
  assert.match(packet, /Use local dependency only\./);
});
