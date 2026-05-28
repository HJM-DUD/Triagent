export const MAX_CLARIFICATIONS = 3;

const NEED_CLARIFY_PATTERN = /\[NEED_CLARIFY\]\s*:\s*([^\r\n]+)/i;

export function parseClarificationRequest(output) {
  const match = String(output || "").match(NEED_CLARIFY_PATTERN);
  return match ? match[1].trim() : null;
}

export function shouldBlockClarification(count) {
  return Number(count || 0) >= MAX_CLARIFICATIONS;
}

export function buildClarificationPacket({ originalPacket, recentEvents = [], answer, count }) {
  const history = recentEvents
    .slice(-12)
    .map((event) => `${event.agent}:${event.stream}\n${event.content}`)
    .join("\n\n");

  return [
    `Clarification reply ${count}/${MAX_CLARIFICATIONS}`,
    "",
    "Original task packet:",
    originalPacket,
    "",
    "Recent task history:",
    history || "(no prior events)",
    "",
    "Codex/GuGU clarification answer:",
    answer,
    "",
    "Continue the task using the clarification above. Keep the same deletion and evidence ID rules."
  ].join("\n");
}

export function buildIncrementalClarificationPacket({ taskId, summaryRef, recentEvents = [], answer, count }) {
  const history = recentEvents
    .slice(-4)
    .map((event) => `${event.agent}:${event.stream}\n${String(event.content || "").slice(0, 500)}`)
    .join("\n\n");

  return [
    `Incremental clarification reply ${count}/${MAX_CLARIFICATIONS}`,
    `Parent task: ${taskId}`,
    `Saved summary reference: ${summaryRef}`,
    "Prior full context is persisted locally in Triagent. Use only this delta unless full context is explicitly requested.",
    "",
    "Recent delta events:",
    history || "(no recent delta events)",
    "",
    "Codex/GuGU clarification answer:",
    answer,
    "",
    "Continue the task using the clarification above. Keep the same deletion and evidence ID rules."
  ].join("\n");
}
