import test from "node:test";
import assert from "node:assert/strict";

import { buildAuditPacket } from "../src/audit.js";

test("builds a shadow audit packet from a report without requesting raw logs", () => {
  const packet = buildAuditPacket({
    taskId: "task-1",
    report: "# Triagent Report\n\n## Events\n[E1] useful output",
    auditor: "ant"
  });

  assert.match(packet, /Shadow audit/);
  assert.match(packet, /task-1/);
  assert.match(packet, /structured report/i);
  assert.doesNotMatch(packet, /完整.*raw/i);
});
