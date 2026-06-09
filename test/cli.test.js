import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("check command prints json route and risk preview without running agents", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    "./bin/triagent.js",
    "check",
    "--json",
    "--task",
    "/her inspect logs"
  ]);

  const parsed = JSON.parse(stdout);
  assert.equal(parsed.route.agent, "hermes");
  assert.equal(parsed.risk.level, "low");
  assert.equal(parsed.task, "inspect logs");
});

test("check command routes /so to the Codex subagent", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    "./bin/triagent.js",
    "check",
    "--json",
    "--task",
    "/so inspect with Codex subagent"
  ]);

  const parsed = JSON.parse(stdout);
  assert.equal(parsed.route.agent, "codex_subagent");
  assert.equal(parsed.task, "inspect with Codex subagent");
});

test("config show prints normalized json config", async () => {
  const dir = await mkdtemp(join(tmpdir(), "triagent-cli-"));
  try {
    await writeFile(
      join(dir, "triagent.config.json"),
      JSON.stringify({ version: 1, defaults: { priority: 77 } }),
      "utf8"
    );
    const { stdout } = await execFileAsync(process.execPath, [
      join(process.cwd(), "bin/triagent.js"),
      "config",
      "show",
      "--json"
    ], { cwd: dir });

    const parsed = JSON.parse(stdout);
    assert.equal(parsed.defaults.priority, 77);
    assert.equal(parsed.tokenSaveMode, true);
  } finally {
    await unlink(join(dir, "triagent.config.json")).catch(() => {});
    await rmdir(dir).catch(() => {});
  }
});
