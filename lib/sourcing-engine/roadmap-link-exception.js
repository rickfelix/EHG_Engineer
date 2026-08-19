// SD-LEO-INFRA-ROADMAP-LINK-COUNTED-EXCEPTION-001 — the counted, reasoned roadmap-link exception.
//
// THE DEFECT: lib/sd-creation/pipeline.js warned when an SD was created without a preceding
// roadmap registration and did nothing else. A warn-only signal on a convention that matters IS
// fail-open: the warning lives only in the stdout of the creating process, so it is not merely
// unread, it is UNREADABLE AFTER THE FACT and nothing can count it.
//
// EXPLICITLY NOT A BLOCKING GATE. The SD's own first line forbids a refusal, and the measured
// reason is force-completion: 553 of 905 completed quick_fixes carry force_completed=true, and
// the GENUINE human-override share is 19.1% all-time / 13.1% over 30 days (the rest is machine
// reconcile). An escape hatch normalized at that rate is what a hard gate becomes when it meets
// real urgency, and a blocking gate would bind hardest on the most productive sourcing days.
// Nothing in this module may throw, exit, or refuse.
//
// WHY metadata.roadmap_link_exception AND NOT metadata.wave_disposition:
// lib/roadmap/wave-linkage-coverage.js:69 computes linkage as
//   promotedKeys.has(sd_key) || Boolean(s.metadata?.wave_disposition)
// Boolean of ANY disposition. Storing the exception there would put every recorded exception into
// the LINKED numerator and RAISE plan-adherence coverage — the exception would become invisible
// in, and would actively falsify, the exact gauge it must be surfaced beside. Verified: that
// module reads ONLY promoted_to_sd_key and wave_disposition, so this key cannot inflate coverage.
//
// WHY AN OPERATOR REASON IS KEPT DISTINCT FROM THE AUTO-DERIVED BUCKET:
// lib/sd-creation/plan-linkage-classifier.js already classifies every unlinked creation, but its
// reason is DERIVED FROM THE SD-KEY PREFIX (harness-upkeep / venture-ops / emergent-fix) — it
// restates the key rather than saying why THIS SD skipped registration. A field that is always
// populated is never informative. The cautionary precedent is quick_fixes.force_completed, which
// has five writers and zero production JS readers: a recorded exception that nothing reads is
// functionally identical to no exception at all. Hence `operator_reason` is separate, and
// `reason_supplied` makes the gap COUNTED rather than silent so it can be driven to zero.

/** Marker recorded when creation proceeded with no operator reason. Explicit, never null, so the
 *  no-reason case is countable rather than indistinguishable from "not applicable". */
export const NO_REASON_MARKER = 'no-reason-supplied';

/** Upper bound on the stored reason. Unbounded free text on a jsonb column written at EVERY
 *  unlinked creation is re-transferred by the health probe on every run (it selects full
 *  metadata), so one oversized reason is paid for forever. Bounded reason fields are established
 *  practice here (bypass_ledger CHECK length >= 20; venture_capability_scores.rationale <= 200;
 *  brand_variants.notes <= 1000). Truncation is silent BY DESIGN: refusing an over-long reason
 *  would be a refusal path, and FR-1 forbids those outright. */
export const REASON_MAX_CHARS = 1000;

/** Control characters that must never reach the stored reason. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/**
 * SECURITY (SEC-2): strip control characters before storing.
 *
 * THIS IS NOT COSMETIC — a NUL byte in the reason DEFEATS FR-1. The exception is spread into the
 * SD's metadata and rides the single INSERT, and Postgres rejects a NUL escape in jsonb
 * ("unsupported Unicode escape sequence"), so the insert fails, createSD returns
 * {ok:false, code:'INSERT_FAILED'} and the CLI exits 1. That is a REFUSAL PATH on the very seam
 * this SD's first line forbids — expressed by Postgres rather than by JavaScript, which is
 * exactly why the static no-throw / no-exit scan cannot see it.
 *
 * It also closes the log-forgery class: an embedded newline would otherwise let crafted text emit
 * a second stderr line shape-identical to a genuine warn for a different SD. Nothing
 * machine-parses that text today, so the damage there is to a human audit transcript rather than
 * to a machine decision — but one normalisation closes both, and ANSI escapes with them.
 */
function sanitizeReason(raw) {
  return raw.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
}

/** Stable shape stamped onto metadata.roadmap_link_exception. */
export function buildRoadmapLinkException(sdKey, operatorReason, nowIso) {
  const raw = typeof operatorReason === 'string'
    ? sanitizeReason(operatorReason).slice(0, REASON_MAX_CHARS)
    : '';
  const supplied = raw.length > 0;
  if (!supplied) {
    // QF-20260818-459: loud, NOT blocking -- this module's FR-1 (see header) forbids
    // throw/exit/refuse, on measured grounds (553/905 completed QFs use force_completed,
    // 19.1% genuine override rate; a blocking gate binds hardest on the most productive
    // sourcing days). "Impossible to miss" is delivered as visibility at the moment of
    // stamping -- the exact gap the header's own opening paragraph names for the OLDER
    // warn-only defect this file replaced ("UNREADABLE AFTER THE FACT"), applied here one
    // level down: the reason itself, not just the missing-registration warning, was still
    // silent until now. reason_supplied remains the durable, queryable record.
    console.warn(`⚠️  [ROADMAP_LINK_EXCEPTION] ${sdKey} created with no roadmap-link reason -- pass --roadmap-link-reason "<why>" next time. Recorded (reason_supplied:false, countable via countRoadmapLinkExceptions), not blocked.`);
  }
  return {
    sd_key: sdKey,
    // Kept DISTINCT from plan_linkage's auto-derived unlinked_reason (see header).
    operator_reason: supplied ? raw : NO_REASON_MARKER,
    reason_supplied: supplied,
    recorded_at: nowIso,
  };
}

/** Pure: count exceptions across a set of SD rows, split so the drive-to-zero target is readable.
 *  `without_reason` is the number to drive to zero — NOT the total, which is expected to stay
 *  non-zero indefinitely because the bypass remains legitimately available. */
export function countRoadmapLinkExceptions(rows) {
  let total = 0;
  let with_reason = 0;
  for (const row of rows || []) {
    const ex = row && row.metadata && row.metadata.roadmap_link_exception;
    if (!ex) continue;
    total += 1;
    if (ex.reason_supplied === true) with_reason += 1;
  }
  return { total, with_reason, without_reason: total - with_reason };
}

export default {
  buildRoadmapLinkException, countRoadmapLinkExceptions, NO_REASON_MARKER, REASON_MAX_CHARS,
};
