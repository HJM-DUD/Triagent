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
  return RISK_PATTERNS.some((pattern) => pattern.test(String(taskText)));
}

function isInstructionalSafetyLine(line) {
  return /\bdo not use\b/i.test(line) || /禁止/.test(line) || /Deletion rule/i.test(line);
}
