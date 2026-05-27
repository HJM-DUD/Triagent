export function buildAuditPacket({ taskId, report, auditor }) {
  return [
    "Shadow audit",
    `Original task ID: ${taskId}`,
    `Auditor: ${auditor}`,
    "",
    "Use the structured report below. Do not request or rely on the full Raw Log unless Codex explicitly provides it.",
    "Write a concise review with: findings, evidence IDs, likely root causes, and concrete improvement suggestions.",
    "",
    "Structured report:",
    report
  ].join("\n");
}
