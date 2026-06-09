import { MAX_CLARIFICATIONS } from "./clarify.js";

export function buildPrefilterPacket({ goal, cwd = process.cwd(), maxChars = 800 }) {
  return [
    "Token-save Pre-Filter",
    `Goal: ${goal}`,
    `Current working directory: ${cwd}`,
    `Maximum summary length: ${maxChars} Chinese characters`,
    "Extract only the context Codex needs for final architecture/safety judgment.",
    "Output a structured brief with: 受影响的文件路径, 关键出错行/日志, 核心依赖版本, 风险, Evidence ID list.",
    "Evidence ID rule: Every factual claim must cite [E1], [E2], etc.",
    "Do not edit files. Do not include full raw logs."
  ].join("\n");
}

export function buildAlternativePacket({ goal, prefilterSummary }) {
  return [
    "Token-save Alternative Review",
    `Goal: ${goal}`,
    "Use only the structured pre-filter summary below. Do not request or restate Raw Log.",
    "Give a compact alternative/product/UX/long-context view with evidence IDs.",
    "",
    "Structured pre-filter summary:",
    truncateSummary(prefilterSummary, 1600)
  ].join("\n");
}

export function buildCodexEngineeringPacket({ goal, prefilterSummary }) {
  return [
    "Token-save Codex Subagent Engineering Review",
    `Goal: ${goal}`,
    "Use only the structured pre-filter summary below. Do not request or restate Raw Log.",
    "Give a compact implementation/architecture/safety review with evidence IDs.",
    "",
    "Structured pre-filter summary:",
    truncateSummary(prefilterSummary, 1600)
  ].join("\n");
}

export function buildJointProposalPacket({ goal, prefilterSummary, codexSummary = "", alternativeSummary }) {
  return [
    "Token-save Joint Proposal",
    `Goal: ${goal}`,
    "Hermes is the drafter. Use the pre-filter summary, Codex subagent engineering review, and Antigravity alternative only.",
    "Return extremely compact Markdown with exactly these sections:",
    "## 方案 A",
    "## 方案 B",
    "## 潜在红线冲突",
    "## 证据索引",
    "Every factual claim must include an evidence ID.",
    "",
    "Pre-filter summary:",
    truncateSummary(prefilterSummary, 1600),
    "",
    "Codex subagent engineering review:",
    truncateSummary(codexSummary, 1200),
    "",
    "Antigravity alternative:",
    truncateSummary(alternativeSummary, 1200)
  ].join("\n");
}

export function buildCompliancePacket({ proposal }) {
  return [
    "Token-save Compliance Check",
    "Check whether the proposal has evidence IDs for concrete claims, maps evidence to proposed edits, and avoids red-line conflicts.",
    "Return PASS or FAIL as the first word, followed by concise reasons with evidence IDs.",
    "",
    "Proposal:",
    truncateSummary(proposal, 1600)
  ].join("\n");
}

export function buildIncrementalClarificationPacket({ taskId, summaryRef, recentEvents = [], answer, count }) {
  const history = recentEvents
    .slice(-4)
    .map((event) => `${event.agent}:${event.stream}\n${truncateSummary(event.content, 500)}`)
    .join("\n\n");

  return [
    `Incremental clarification reply ${count}/${MAX_CLARIFICATIONS}`,
    `Parent task: ${taskId}`,
    `Saved summary reference: ${summaryRef}`,
    "Prior full context is persisted locally in Triagent. Use only this delta unless the task explicitly asks for full context.",
    "",
    "Recent delta events:",
    history || "(no recent delta events)",
    "",
    "Codex/GuGU clarification answer:",
    answer,
    "",
    "Continue using the same deletion, evidence ID, and compliance rules."
  ].join("\n");
}

export function evaluateComplianceOutput(output) {
  const text = String(output || "").trim();
  return {
    ok: /^PASS\b/i.test(text),
    failed: /^FAIL\b/i.test(text),
    text
  };
}

export function truncateSummary(value, maxChars) {
  return String(value || "").slice(0, maxChars);
}
