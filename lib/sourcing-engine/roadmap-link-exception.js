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

/** Stable shape stamped onto metadata.roadmap_link_exception. */
export function buildRoadmapLinkException(sdKey, operatorReason, nowIso) {
  const raw = typeof operatorReason === 'string' ? operatorReason.trim() : '';
  const supplied = raw.length > 0;
  return {
    sd_key: sdKey,
    // Kept DISTINCT from plan_linkage's auto-derived unlinked_reason (see header).
    operator_reason: supplied ? raw : NO_REASON_MARKER,
    reason_supplied: supplied,
    recorded_at: nowIso,
  };
}

/** Pure: count exceptions across a set of SD rows, split so the drive-to-zero target is readable.
 *  `without_reason` is the number to drive to zero — NOT the total, which is expected to be
 *  non-zero indefinitely because the bypass stays legitimately available. */
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

export default { buildRoadmapLinkException, countRoadmapLinkExceptions, NO_REASON_MARKER };
