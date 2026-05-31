const DEFAULT_PREFIXES = {
  "/her": "hermes",
  "/ant": "ant",
  "/all": "all",
  "/co": "codex"
};

const HERMES_TERMS = [
  "inspect",
  "search",
  "summarize",
  "test output",
  "logs",
  "files",
  "dependency",
  "config inventory",
  "文档",
  "日志",
  "测试输出",
  "搜索",
  "梳理"
];

const ANT_TERMS = [
  "ui",
  "ux",
  "product",
  "frontend",
  "visual",
  "alternative",
  "google",
  "multimodal",
  "长上下文",
  "产品",
  "前端",
  "视觉",
  "替代方案"
];

const ALL_TERMS = [
  "architecture",
  "migration",
  "security",
  "production",
  "credential",
  "delete",
  "remove",
  "跨模块",
  "架构",
  "迁移",
  "安全",
  "生产",
  "凭据",
  "删除"
];

export function normalizeTaskText(taskText, config = {}) {
  const text = String(taskText || "").trim();
  const prefixes = config.routing?.prefixes || DEFAULT_PREFIXES;
  for (const [prefix, agent] of Object.entries(prefixes)) {
    if (text === prefix || text.startsWith(`${prefix} `)) {
      return {
        prefix,
        agent,
        text: text.slice(prefix.length).trim()
      };
    }
  }
  return { prefix: undefined, agent: undefined, text };
}

export function routeTask(taskText, config = {}) {
  const normalized = normalizeTaskText(taskText, config);
  if (normalized.agent) {
    return {
      agent: normalized.agent,
      task: normalized.text,
      reason: `prefix ${normalized.prefix}`
    };
  }

  const custom = matchCustomRule(normalized.text, config.routing?.rules || []);
  if (custom) {
    return { agent: custom.agent, task: normalized.text, reason: `rule ${custom.match.join(",")}` };
  }

  const lower = normalized.text.toLowerCase();
  if (containsAny(lower, ALL_TERMS)) {
    return { agent: "all", task: normalized.text, reason: "automatic high-risk or architecture route" };
  }
  if (containsAny(lower, ANT_TERMS)) {
    return { agent: "ant", task: normalized.text, reason: "automatic product/frontend route" };
  }
  if (containsAny(lower, HERMES_TERMS)) {
    return { agent: "hermes", task: normalized.text, reason: "automatic local-analysis route" };
  }
  return { agent: "codex", task: normalized.text, reason: "default codex route" };
}

function matchCustomRule(text, rules) {
  const lower = text.toLowerCase();
  return [...rules]
    .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))
    .find((rule) => Array.isArray(rule.match) && containsAny(lower, rule.match));
}

function containsAny(value, terms) {
  return terms.some((term) => value.includes(String(term).toLowerCase()));
}
