const DANGEROUS_PATTERNS = [
  /\brm\s+-[A-Za-z]*r[A-Za-z]*f[A-Za-z]*\b/i,
  /\brm\s+-[A-Za-z]*f[A-Za-z]*r[A-Za-z]*\b/i,
  /\brmdir\s+\/s\b/i,
  /\brd\s+\/s\b/i,
  /\bdel\s+\/s\b/i,
  /\bRemove-Item\s+-Recurse\b/i
];

const RISK_PATTERNS = [
  /\bdelete\b/i,
  /\bremove\b/i,
  /\bproduction\b/i,
  /\bcredential/i,
  /\bsecret\b/i,
  /\bconfig\b/i,
  /\bmigration\b/i,
  /删除/,
  /生产/,
  /凭据/,
  /迁移/,
  /配置/
];

export function assertSafeTaskPacket(taskPacket) {
  const dangerousLine = String(taskPacket)
    .split(/\r?\n/)
    .find((line) => !isInstructionalSafetyLine(line) && DANGEROUS_PATTERNS.some((pattern) => pattern.test(line)));

  if (dangerousLine) {
    throw new Error(`Blocked dangerous task packet: ${dangerousLine.trim()}`);
  }
}

export function isHighRiskTask(taskText) {
  const risk = classifyRisk(taskText);
  return risk.level === "high" || risk.level === "medium" || risk.level === "blocked";
}

export function classifyRisk(taskText) {
  const text = String(taskText || "");
  const dangerousLine = text
    .split(/\r?\n/)
    .find((line) => !isInstructionalSafetyLine(line) && DANGEROUS_PATTERNS.some((pattern) => pattern.test(line)));
  if (dangerousLine) {
    return {
      level: "blocked",
      reason: `dangerous recursive or batch deletion command: ${dangerousLine.trim()}`
    };
  }

  if (/\bproduction\b/i.test(text) || /生产/.test(text) || /\bcredential/i.test(text) || /\bsecret\b/i.test(text) || /凭据/.test(text) || /迁移/.test(text) || /\bmigration\b/i.test(text)) {
    return {
      level: "high",
      reason: "production, credential, secret, or migration-related task"
    };
  }

  if (/\bdelete\b/i.test(text) || /\bremove\b/i.test(text) || /删除/.test(text) || /配置/.test(text) || /\bconfig\b/i.test(text)) {
    return {
      level: "medium",
      reason: "delete, remove, or config-related task"
    };
  }

  return {
    level: "low",
    reason: "no risky local patterns detected"
  };
}

function isInstructionalSafetyLine(line) {
  return /\bdo not use\b/i.test(line) || /禁止/.test(line) || /Deletion rule/i.test(line);
}
