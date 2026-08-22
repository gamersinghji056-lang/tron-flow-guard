const SECRET_PATTERNS = [
  /sb_[a-z0-9_=-]{20,}/gi,
  /eyJ[a-zA-Z0-9_.=-]{20,}/g,
  /[A-Za-z0-9_-]{32,}:[A-Za-z0-9_-]{20,}/g,
  /(private[_ -]?key|mnemonic|password|token|service[_ -]?role|api[_ -]?key)\s*[:=]\s*\S+/gi,
];

export function safeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "Unknown error");
  return SECRET_PATTERNS.reduce((message, pattern) => message.replace(pattern, "[redacted]"), raw)
    .slice(0, 1000)
    .trim();
}
