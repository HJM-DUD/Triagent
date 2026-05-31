import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadTriagentConfig } from "../src/config.js";

test("loads token-save defaults when no config file exists", () => {
  const config = loadTriagentConfig({ cwd: "/path/that/does/not/exist" });

  assert.equal(config.tokenSaveMode, true);
  assert.equal(config.prefilterMaxChars, 800);
  assert.equal(config.complianceMode, "block");
});

test("loads triagent config and lets cli options override it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "triagent-config-"));
  try {
    await writeFile(
      join(dir, "triagent.config.json"),
      JSON.stringify({ token_save_mode: false, prefilter_max_chars: 600, compliance_mode: "warn" }),
      "utf8"
    );

    const config = loadTriagentConfig({
      cwd: dir,
      overrides: { tokenSaveMode: true }
    });

    assert.equal(config.tokenSaveMode, true);
    assert.equal(config.prefilterMaxChars, 600);
    assert.equal(config.complianceMode, "warn");
  } finally {
    await unlink(join(dir, "triagent.config.json")).catch(() => {});
    await rmdir(dir).catch(() => {});
  }
});

test("loads schema v1 config with agents, routing, safety, and legacy defaults", async () => {
  const dir = await mkdtemp(join(tmpdir(), "triagent-config-"));
  try {
    await writeFile(
      join(dir, "triagent.config.json"),
      JSON.stringify({
        version: 1,
        defaults: {
          token_save_mode: false,
          prefilter_max_chars: 600,
          compliance_mode: "warn",
          route: "auto",
          priority: 70,
          max_attempts: 3,
          retry_backoff_ms: [1000, 5000]
        },
        agents: {
          hermes: { enabled: true, command: "hermes", model: "deepseek-v4-pro" },
          ant: { enabled: false, command: "agy" }
        },
        routing: {
          prefixes: { "/her": "hermes", "/ant": "ant", "/all": "all", "/co": "codex" },
          rules: [{ match: ["ui"], agent: "ant", priority: 80 }]
        },
        safety: { confirm_high_risk: true, block_dangerous_commands: true }
      }),
      "utf8"
    );

    const config = loadTriagentConfig({ cwd: dir });

    assert.equal(config.version, 1);
    assert.equal(config.tokenSaveMode, false);
    assert.equal(config.prefilterMaxChars, 600);
    assert.equal(config.complianceMode, "warn");
    assert.equal(config.defaults.priority, 70);
    assert.equal(config.defaults.maxAttempts, 3);
    assert.equal(config.agents.ant.enabled, false);
    assert.equal(config.routing.rules[0].agent, "ant");
    assert.equal(config.safety.confirmHighRisk, true);
  } finally {
    await unlink(join(dir, "triagent.config.json")).catch(() => {});
    await rmdir(dir).catch(() => {});
  }
});
