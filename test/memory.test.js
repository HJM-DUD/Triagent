import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rmdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildMemorySyncDryRun } from "../src/memory.js";

test("sync-memory dry-run reports conflicts without changing files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "triagent-memory-"));
  const codex = join(dir, "AGENTS.md");
  const hermes = join(dir, "MEMORY.md");
  try {
    await writeFile(codex, "Use API v2\nDeletion rule: strict\n", "utf8");
    await writeFile(hermes, "Use API v1\nDeletion rule: strict\n", "utf8");

    const report = await buildMemorySyncDryRun([
      { agent: "codex", path: codex },
      { agent: "hermes", path: hermes }
    ]);

    assert.match(report, /Memory Sync Dry Run/);
    assert.match(report, /Potential version mismatch/);
    assert.equal(await readFile(codex, "utf8"), "Use API v2\nDeletion rule: strict\n");
    assert.equal(await readFile(hermes, "utf8"), "Use API v1\nDeletion rule: strict\n");
  } finally {
    await unlink(codex).catch(() => {});
    await unlink(hermes).catch(() => {});
    await rmdir(dir).catch(() => {});
  }
});
