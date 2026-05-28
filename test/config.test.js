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
