import test from "node:test";
import assert from "node:assert/strict";

import { chunkContent, runWithSqliteRetry } from "../src/sqlite-retry.js";

test("retries transient sqlite busy errors", () => {
  let attempts = 0;

  const result = runWithSqliteRetry(() => {
    attempts += 1;
    if (attempts < 3) {
      const error = new Error("database is locked");
      error.code = "SQLITE_BUSY";
      throw error;
    }
    return "ok";
  }, { maxAttempts: 4, sleep: () => {} });

  assert.equal(result, "ok");
  assert.equal(attempts, 3);
});

test("splits long log content into bounded chunks", () => {
  assert.deepEqual(chunkContent("abcdef", 2), ["ab", "cd", "ef"]);
  assert.deepEqual(chunkContent("", 2), [""]);
});
