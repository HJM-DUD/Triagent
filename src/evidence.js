const EVIDENCE_ID_PATTERN = /\[E\d+\]/g;

export function collectEvidenceIds(text) {
  return [...new Set(String(text).match(EVIDENCE_ID_PATTERN) || [])].sort();
}

export function evaluateEvidenceStatus({ agent, exitCode, output, hasClarification }) {
  if (exitCode !== 0) {
    return { status: "failed", evidenceIds: collectEvidenceIds(output) };
  }
  if (hasClarification) {
    return { status: "needs_clarification", evidenceIds: collectEvidenceIds(output) };
  }
  const evidenceIds = collectEvidenceIds(output);
  if (requiresEvidence(agent) && evidenceIds.length === 0) {
    return { status: "needs_evidence", evidenceIds };
  }
  return { status: "succeeded", evidenceIds };
}

export function requiresEvidence(agent) {
  return agent === "hermes" || agent === "ant";
}
