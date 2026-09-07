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

  // QF-20260905-755: a seat with an open, CI-pending tail PR (the docs(<SD>)/CHANGELOG follow-up
  // /document writes post-completion) on its just-completed SD is still finishing that SD, not
  // idle. completed_by_session/completed_stamp_at are stamped atomically at the completion flip
  // by lib/fleet/claim-stamp.cjs's stampCompletion() -- the durable link claiming_session_id
  // itself cannot provide, since completion clears that column. Bounded to a 45min window (the
  // observed specimen's nudges fired at 12/20min, so this comfortably covers a slow CI run
  // without staying "busy" forever once a seat has genuinely gone idle) and to SDs only (QFs do
  // not get a /document changelog tail), so this never scans more than a handful of recent rows.
  const TAIL_WINDOW_MS = 45 * 60 * 1000;
  let tailInFlightSessionIds = new Set();
  try {
    const cutoffIso = new Date(nowMs - TAIL_WINDOW_MS).toISOString();
    const { data: recentlyCompleted, error } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key, metadata')
      .eq('status', 'completed')
      .gte('completion_date', cutoffIso)
      .limit(50);
    if (error) throw error;
    const candidates = (recentlyCompleted || [])
      .map((r) => ({ sdKey: r.sd_key, sessionId: r.metadata?.completed_by_session }))
      .filter((c) => c.sdKey && c.sessionId);
    if (candidates.length) {
      const { execFileSync } = await import('node:child_process');
      for (const { sdKey, sessionId } of candidates) {
        try {
          const out = execFileSync(
            'gh',
            ['pr', 'list', '--state', 'open', '--search', `${sdKey} in:title`, '--json', 'title,statusCheckRollup', '--limit', '10'],
            { encoding: 'utf8', timeout: 15000 }
          );
          const prs = JSON.parse(out || '[]');
          // Tail pattern: /document's own CHANGELOG PRs are titled `docs(<SD-KEY>): ...` -- only
          // that convention counts, so an unrelated open PR merely mentioning the key in its title
          // (a cross-reference, a follow-on SD) never masks a genuinely-idle seat.
          const tailPr = prs.find((p) => p.title && p.title.startsWith(`docs(${sdKey})`));
          if (!tailPr) continue;
          const rollup = tailPr.statusCheckRollup || [];
          const stillPending = rollup.length === 0 || rollup.some((c) => {
            const state = (c.conclusion || c.status || '').toUpperCase();
            return state === 'IN_PROGRESS' || state === 'QUEUED' || state === 'PENDING' || state === '';
          });
          if (stillPending) tailInFlightSessionIds.add(sessionId);
        } catch (e) {
          // One SD's gh lookup failing never blocks the others, but IS recorded -- a silent
          // continue here would hide exactly the kind of gap this axis exists to close.
          undeliveredReasons.push(`tail_in_flight_gh_failed:${sdKey}:${e?.message || 'unknown'}`);
        }
      }
    }
  } catch (e) {
    undeliveredReasons.push('tail_in_flight_read_failed:' + (e?.message || 'unknown'));
  }

  return { qfHolderSessionIds, seatBusySessionIds, sdHolderSessionIds, tailInFlightSessionIds, undeliveredReasons };
}
