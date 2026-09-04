/**
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-D FR-2 AC#2/AC#3: the shared ctx-population mechanism for
 * seatIdleVerdict's authoritative-claim axes (qfHolderSessionIds, seatBusySessionIds,
 * sdHolderSessionIds). Extracted VERBATIM from scripts/coordinator-idle-qf-hint.mjs's
 * runIdleQfHintCore -- that consumer is the reference implementation (FR-2's own words: "it
 * becomes the reference ctx-population the other three consumers adopt"), so this module is a
 * pure lift, not a reimplementation: the 3 queries, their column lists, and their fail-open/
 * fail-closed postures are unchanged from what shipped there.
 *
 * Each of the 3 queries is independently try/caught so a single table's read failure degrades
 * only that axis (to an empty Set, or null for sdHolderSessionIds -- see the field-level comments
 * below) rather than aborting ctx-population for the other two axes or the caller's whole pass.
 */
export async function resolveIdleCtx(supabase, { nowMs = Date.now() } = {}) {
  const undeliveredReasons = [];

  // SD-LEO-INFRA-SILENT-HOLDER-AUDIT-001: enumerate QF holders from the AUTHORITATIVE column so
  // a session whose sd_key mirror is NULL but who holds a live QF is never counted idle.
  let qfHolderSessionIds = new Set();
  try {
    // count-truncation-diff-lint / SECURITY SEC-5: make the implicit PostgREST cap an explicit,
    // visible bound rather than an unbounded read. Live headroom is ample (measured 4 QF holders
    // vs this 500 limit; mirrors the sdHolderSessionIds query's own literal below).
    const { data: qfHolders, error } = await supabase
      .from('quick_fixes')
      .select('claiming_session_id')
      .not('claiming_session_id', 'is', null)
      .in('status', ['open', 'in_progress'])
      .limit(500);
    if (error) throw error;
    qfHolderSessionIds = new Set((qfHolders || []).map((r) => r.claiming_session_id).filter(Boolean));
  } catch (e) {
    undeliveredReasons.push('qf_holder_read_failed:' + (e?.message || 'unknown'));
  }

  // QF-20260830-454: seats currently fenced BUSY on a dispatched WORK_ASSIGNMENT via the same
  // seat_busy_reservation kind seat-busy-fence.cjs already reads worker-side.
  let seatBusySessionIds = new Set();
  try {
    const nowIso = new Date(nowMs).toISOString();
    const { data: busyRows, error } = await supabase
      .from('session_coordination')
      .select('target_session, expires_at')
      .eq('message_type', 'INFO')
      .is('target_sd', null)
      .eq('payload->>kind', 'seat_busy_reservation')
      .gt('expires_at', nowIso)
      .limit(200);
    if (error) throw error;
    seatBusySessionIds = new Set((busyRows || []).map((r) => r.target_session).filter(Boolean));
  } catch (e) {
    undeliveredReasons.push('seat_busy_read_failed:' + (e?.message || 'unknown'));
  }

  // QF-20260830-885: the authoritative SD-side twin of qfHolderSessionIds above. null (not [])
  // on a read failure so seatIdleVerdict's three-state sdHolderSessionIds axis fails OPEN to the
  // stale sd_key mirror rather than silently trusting nothing-is-held on a query fault.
  let sdHolderSessionIds = null;
  try {
    const { data: sdHolders, error } = await supabase
      .from('strategic_directives_v2')
      .select('claiming_session_id')
      .not('claiming_session_id', 'is', null)
      .limit(500);
    if (error) throw error;
    sdHolderSessionIds = new Set((sdHolders || []).map((r) => r.claiming_session_id).filter(Boolean));
  } catch (e) {
    undeliveredReasons.push('sd_holder_read_failed:' + (e?.message || 'unknown'));
  }

  return { qfHolderSessionIds, seatBusySessionIds, sdHolderSessionIds, undeliveredReasons };
}
