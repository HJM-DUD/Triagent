import test from "node:test";
import assert from "node:assert/strict";

import { normalizeTaskText, routeTask } from "../src/router.js";

test("routes explicit prefixes before automatic rules", () => {
  assert.deepEqual(routeTask("/her inspect logs").agent, "hermes");
  assert.deepEqual(routeTask("/ant review the product flow").agent, "ant");
  assert.deepEqual(routeTask("/all plan a risky migration").agent, "all");
  assert.deepEqual(routeTask("/co I will handle this").agent, "codex");
});

test("strips route prefixes from task text", () => {
  assert.equal(normalizeTaskText("/her inspect logs").text, "inspect logs");
  assert.equal(normalizeTaskText("inspect logs").text, "inspect logs");
});

test("chooses local agents from task type when no prefix is present", () => {
  assert.equal(routeTask("summarize test output and inspect files").agent, "hermes");
  assert.equal(routeTask("review UI product flow and alternatives").agent, "ant");
  assert.equal(routeTask("design a safe production migration").agent, "all");
});

test("keeps ordinary unprefixed tasks on Codex by default", () => {
  const route = routeTask("rename a local variable in one file");

  assert.equal(route.agent, "codex");
  assert.match(route.reason, /default/i);
});
