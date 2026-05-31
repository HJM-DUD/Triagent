import test from "node:test";
import assert from "node:assert/strict";

import { assertSafeTaskPacket, classifyRisk, isHighRiskTask } from "../src/safety.js";

test("blocks recursive and batch deletion commands before agents run", () => {
  assert.throws(
    () => assertSafeTaskPacket("Please run rm -rf node_modules"),
    /Blocked dangerous task packet/
  );
  assert.throws(
    () => assertSafeTaskPacket("Use Remove-Item -Recurse C:\\temp"),
    /Blocked dangerous task packet/
  );
});

test("detects high-risk task text without blocking ordinary work", () => {
  assert.equal(isHighRiskTask("update production config"), true);
  assert.equal(isHighRiskTask("inspect README and summarize"), false);
});

test("classifies blocked, high, medium, and low risk task text", () => {
  assert.equal(classifyRisk("Please run rm -rf temp").level, "blocked");
  assert.equal(classifyRisk("update production config").level, "high");
  assert.equal(classifyRisk("delete one generated file").level, "medium");
  assert.equal(classifyRisk("inspect README and summarize").level, "low");
});
