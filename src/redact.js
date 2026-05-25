const SECRET_ASSIGNMENT =
  /\b((?:[\w.-]*(?:api[_-]?key|token|secret|password|credential|auth)[\w.-]*)\s*[:=]\s*)([^\s'"`]+)/gi;

const KNOWN_SECRET_VALUES = /\b(?:sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{12,})\b/g;

export function redactSecrets(value) {
  if (value == null) {
    return "";
  }

  return String(value)
    .replace(SECRET_ASSIGNMENT, "$1[REDACTED]")
    .replace(KNOWN_SECRET_VALUES, "[REDACTED]");
}
