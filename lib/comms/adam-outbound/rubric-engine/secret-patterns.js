/**
 * Secret-redaction patterns for the shared pre-send rubric engine's no-secrets lint.
 *
 * SD-LEO-INFRA-SMS-CHANNEL-HARDENING-001-A (rubric engine).
 *
 * Provenance: these are the SAME 6 patterns the worker-signal outbound path already
 * redacts with (scripts/worker-signal.cjs REDACTION_PATTERNS, ~line 119). They are
 * replicated here — rather than imported — because that definition lives inline in a
 * CommonJS CLI script, not an importable module. Keeping the sets identical is a
 * correctness invariant; a follow-up to extract ONE shared module (imported by both the
 * signal path and this engine) is captured as a completion flag on this SD so the two
 * copies cannot drift.
 *
 * The lint only needs to DETECT a secret (block the send); it does not redact-and-continue,
 * because a chairman/coordinator message that contains a live secret is a hard fail, not a
 * thing to silently scrub and ship.
 */

export const SECRET_PATTERNS = [
  { re: /AKIA[0-9A-Z]{16}/g, label: 'AWS_KEY' },
  { re: /gh[pousr]_[A-Za-z0-9]{36,}/g, label: 'GH_TOKEN' },
  { re: /sk-[A-Za-z0-9_-]{20,}/g, label: 'PROVIDER_KEY' },
  { re: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, label: 'JWT' },
  { re: /password\s*[=:]\s*[^&\s"']+/gi, label: 'PASSWORD' },
  { re: /postgres(?:ql)?:\/\/[^:@\s]+:[^@\s]+@/g, label: 'PG_CONN_STRING' },
];

/**
 * Return the labels of any secret patterns found in `text` (empty array = clean).
 * Fresh RegExp per call so the global-flag lastIndex is never shared across invocations.
 * @param {string} text
 * @returns {string[]}
 */
export function findSecrets(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const hits = [];
  for (const { re, label } of SECRET_PATTERNS) {
    if (new RegExp(re.source, re.flags).test(text)) hits.push(label);
  }
  return hits;
}
