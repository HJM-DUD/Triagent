import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_CONFIG = {
  version: 1,
  tokenSaveMode: true,
  prefilterMaxChars: 800,
  complianceMode: "block",
  defaults: {
    route: "auto",
    priority: 50,
    maxAttempts: 2,
    retryBackoffMs: [1000, 5000],
    tokenSaveMode: true,
    prefilterMaxChars: 800,
    complianceMode: "block"
  },
  agents: {
    codex_subagent: {
      enabled: true,
      command: "codex",
      sandbox: "read-only",
      dryRunSandbox: "workspace-write"
    },
    hermes: { enabled: true, command: "hermes", model: "deepseek-v4-pro" },
    ant: { enabled: true, command: "agy" }
  },
  routing: {
    prefixes: { "/her": "hermes", "/ant": "ant", "/all": "all", "/so": "codex_subagent", "/co": "codex" },
    rules: []
  },
  safety: {
    confirmHighRisk: true,
    blockDangerousCommands: true
  }
};

export function loadTriagentConfig({ cwd = process.cwd(), overrides = {} } = {}) {
  const fileConfig = readConfigFile(join(cwd, "triagent.config.json"));
  const config = {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    defaults: {
      ...DEFAULT_CONFIG.defaults,
      ...fileConfig.defaults
    },
    agents: mergeNested(DEFAULT_CONFIG.agents, fileConfig.agents),
    routing: {
      ...DEFAULT_CONFIG.routing,
      ...fileConfig.routing,
      prefixes: {
        ...DEFAULT_CONFIG.routing.prefixes,
        ...fileConfig.routing?.prefixes
      },
      rules: fileConfig.routing?.rules || DEFAULT_CONFIG.routing.rules
    },
    safety: {
      ...DEFAULT_CONFIG.safety,
      ...fileConfig.safety
    },
    ...removeUndefined(overrides)
  };

  config.tokenSaveMode = overrideAlias(config, "tokenSaveMode", overrides);
  config.prefilterMaxChars = overrideAlias(config, "prefilterMaxChars", overrides);
  config.complianceMode = overrideAlias(config, "complianceMode", overrides);
  return config;
}

export function saveTriagentConfig(config, { cwd = process.cwd() } = {}) {
  const path = join(cwd, "triagent.config.json");
  writeFileSync(path, `${JSON.stringify(toFileConfig(config), null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return path;
}

export function validateTriagentConfig(config) {
  const errors = [];
  if (config.version !== 1) {
    errors.push("version must be 1");
  }
  if (!["block", "warn"].includes(config.complianceMode)) {
    errors.push("compliance_mode must be block or warn");
  }
  if (!Number.isInteger(config.defaults.priority) || config.defaults.priority < 0 || config.defaults.priority > 100) {
    errors.push("defaults.priority must be an integer from 0 to 100");
  }
  if (!Number.isInteger(config.defaults.maxAttempts) || config.defaults.maxAttempts < 1) {
    errors.push("defaults.max_attempts must be at least 1");
  }
  return {
    ok: errors.length === 0,
    errors
  };
}

function readConfigFile(path) {
  if (!existsSync(path)) {
    return {};
  }
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  return normalizeConfig(parsed);
}

function normalizeConfig(parsed) {
  const defaults = normalizeDefaults(parsed.defaults || parsed);
  return removeUndefined({
    version: parsed.version,
    defaults,
    agents: parsed.agents,
    routing: parsed.routing,
    safety: normalizeSafety(parsed.safety),
    tokenSaveMode: defaults.tokenSaveMode,
    prefilterMaxChars: defaults.prefilterMaxChars,
    complianceMode: defaults.complianceMode
  });
}

function normalizeDefaults(defaults) {
  return removeUndefined({
    route: defaults.route,
    priority: defaults.priority,
    maxAttempts: defaults.max_attempts ?? defaults.maxAttempts,
    retryBackoffMs: defaults.retry_backoff_ms ?? defaults.retryBackoffMs,
    tokenSaveMode: defaults.token_save_mode ?? defaults.tokenSaveMode,
    prefilterMaxChars: defaults.prefilter_max_chars ?? defaults.prefilterMaxChars,
    complianceMode: defaults.compliance_mode ?? defaults.complianceMode
  });
}

function normalizeSafety(safety = {}) {
  return removeUndefined({
    confirmHighRisk: safety.confirm_high_risk ?? safety.confirmHighRisk,
    blockDangerousCommands: safety.block_dangerous_commands ?? safety.blockDangerousCommands
  });
}

function toFileConfig(config) {
  return {
    version: 1,
    defaults: {
      route: config.defaults.route,
      priority: config.defaults.priority,
      max_attempts: config.defaults.maxAttempts,
      retry_backoff_ms: config.defaults.retryBackoffMs,
      token_save_mode: config.tokenSaveMode,
      prefilter_max_chars: config.prefilterMaxChars,
      compliance_mode: config.complianceMode
    },
    agents: config.agents,
    routing: config.routing,
    safety: {
      confirm_high_risk: config.safety.confirmHighRisk,
      block_dangerous_commands: config.safety.blockDangerousCommands
    }
  };
}

function overrideAlias(config, key, overrides) {
  if (overrides[key] !== undefined) {
    return overrides[key];
  }
  if (config[key] !== undefined) {
    return config[key];
  }
  return DEFAULT_CONFIG[key];
}

function mergeNested(base, value = {}) {
  return Object.fromEntries(
    Object.entries({ ...base, ...value }).map(([key, entry]) => [
      key,
      typeof entry === "object" && entry && !Array.isArray(entry) ? { ...(base[key] || {}), ...entry } : entry
    ])
  );
}

function removeUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}
