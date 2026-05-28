import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_CONFIG = {
  tokenSaveMode: true,
  prefilterMaxChars: 800,
  complianceMode: "block"
};

export function loadTriagentConfig({ cwd = process.cwd(), overrides = {} } = {}) {
  const fileConfig = readConfigFile(join(cwd, "triagent.config.json"));
  return {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    ...removeUndefined(overrides)
  };
}

function readConfigFile(path) {
  if (!existsSync(path)) {
    return {};
  }
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  return removeUndefined({
    tokenSaveMode: parsed.token_save_mode,
    prefilterMaxChars: parsed.prefilter_max_chars,
    complianceMode: parsed.compliance_mode
  });
}

function removeUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}
