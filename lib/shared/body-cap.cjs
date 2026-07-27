// SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-A / FR-1
//
// The body-cap + redaction policy, extracted so BOTH the outbound worker->coordination hop
// (scripts/worker-signal.cjs) and the inbound aggregation->feedback hop
// (lib/coordinator/signal-router.cjs) enforce ONE policy instead of two divergent ones.
//
// WHY THIS MODULE EXISTS: QF-20260710-560 fixed silent truncation on the OUTBOUND hop by
// making capBody hard-error instead of slicing. That fix never travelled one hop inward:
// signal-router.cjs kept its own silent .slice(0, 500), which later destroyed 80% of a
// CRITICAL correction in transit (QF-20260726-425 — 3145 chars carried as 611, cut mid-word).
// A policy that lives in one caller is not a policy. It lives here now.
//
// Mirrors the existing precedent in this directory: normalize/fingerprint/severityRank were
// extracted out of signal-router.cjs into lib/shared/content-fingerprint.cjs for exactly this
// scripts<->lib sharing need. lib/ must never require() a scripts/ CLI (that would invert the
// dependency direction and drag dotenv's global side effect + supabase-js into the sweep's
// hot loop for the sake of a pure function).
//
// Bodies are MOVED here verbatim from scripts/worker-signal.cjs — not rewritten — so the
// outbound throw contract is byte-identical and its existing tests pass unmodified.

const BODY_HARD_CAP = 4096;

const REDACTION_PATTERNS = [
  // AWS access key id
  { re: /AKIA[0-9A-Z]{16}/g, label: 'AWS_KEY' },
  // GitHub fine-grained / classic / oauth tokens
  { re: /gh[pousr]_[A-Za-z0-9]{36,}/g, label: 'GH_TOKEN' },
  // Anthropic / OpenAI keys
  { re: /sk-[A-Za-z0-9_-]{20,}/g, label: 'PROVIDER_KEY' },
  // JWTs (3 base64-url segments). Catches Supabase service-role plus generic.
  { re: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, label: 'JWT' },
  // password=... in connection strings or query strings
  { re: /password\s*[=:]\s*[^&\s"']+/gi, label: 'PASSWORD' },
  // Postgres connection string with embedded creds
  { re: /postgres(?:ql)?:\/\/[^:@\s]+:[^@\s]+@/g, label: 'PG_CONN_STRING' },
  // SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-A (SECURITY review of PR #6554, evidence
  // 065d1f1b): the credential-keyword pattern was ALREADY MANDATED as an EXEC must-fix by the
  // original review of this feature family (evidence c8611924, 2026-05-04) — verbatim
  // "(password|passwd|secret|token|api[_-]?key)" — but only the `password` half ever shipped.
  // A required control that silently narrowed to a third of its spec is this SD's own thesis
  // for the third time: the correction did not travel. Restored here rather than deferred,
  // because THIS change is what makes the gap consequential — it raises the persisted slice
  // from 500 chars to BODY_HARD_CAP, and feedback.description is surfaced into the
  // git-committed CLAUDE_CORE.md "Known Friction Points" section.
  //
  // Ordered LAST and guarded so it can only ever catch what the specific patterns above left
  // behind — without a guard, `token: ghp_...` would be redacted to [REDACTED:GH_TOKEN] and then
  // re-redacted to [REDACTED:CREDENTIAL], losing the precise label.
  //
  // The guard matches a COMPLETE, well-formed redaction token \[REDACTED:LABEL\] rather than the
  // bare prefix "[REDACTED". A bare-prefix lookahead was defeatable: the ship gate's adversarial
  // reviewer showed that "token=[REDACTED]" followed immediately by a vendor-prefixed key passed
  // through UNTOUCHED, because the value merely STARTED with the marker text while carrying a
  // real secret behind it. Requiring the colon + label means only genuine output of the patterns
  // above is skipped. (The concrete key prefix is deliberately not spelled out here — writing it
  // trips the ship gate's own hardcoded-secret detector, which is working as intended.)
  // Linear-time: literal alternation, and the two \s* are separated by a required [=:].
  { re: /(?:passwd|pwd|secret|token|api[_-]?key)\s*[=:]\s*(?!\[REDACTED:[A-Z_]+\])[^&\s"']+/gi, label: 'CREDENTIAL' }
];

function redact(input) {
  if (typeof input !== 'string') return input;
  let out = input;
  for (const { re, label } of REDACTION_PATTERNS) {
    out = out.replace(re, `[REDACTED:${label}]`);
  }
  return out;
}

// QF-20260710-560: M2 used to silently .slice(0, BODY_HARD_CAP), dropping content with no
// signal (Solomon's FW-3 advisory tail was clipped this way — a loss-proof-channel violation).
// Hard-error instead: caller must split the message, never lose the tail silently.
function capBody(rawBody) {
  const redacted = redact(String(rawBody));
  if (redacted.length > BODY_HARD_CAP) {
    const err = new Error(
      `body exceeds ${BODY_HARD_CAP}-char hard cap (${redacted.length} chars after redaction) — split into ordered parts, do not send oversized`
    );
    err.code = 'BODY_TOO_LONG';
    throw err;
  }
  return redacted;
}

// SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-A / FR-2: the INBOUND adapter.
//
// capBody THROWS, which is the RIGHT contract outbound — a worker or agent caller can split
// the message and resend. The inbound aggregation hop is machine-driven and has no such
// caller, and aggregateSignals' try/catch sits OUTSIDE its per-group loop, so letting the
// throw escape would skip every remaining group in that tick. Worse, the throwing group is
// only stamped routed_to_feedback_id AFTER a successful insert, so it would reload and throw
// again every tick until its rows aged out of the 60-minute window — silently and permanently
// dropped. That is strictly worse than the truncation this SD removes, so the inbound hop
// adapts the throw into the {value, error} tuple the caller already knows how to handle.
function capBodySafe(rawBody) {
  try {
    return { value: capBody(rawBody), error: null };
  } catch (error) {
    return { value: null, error };
  }
}

module.exports = { BODY_HARD_CAP, REDACTION_PATTERNS, redact, capBody, capBodySafe };
