/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-D (FR-2, FR-4) — consumption receipts.
 *
 * ONE WRITER FOR EVERY LANE. The adam lane (FR-2) and the chairman_brief lane (FR-4) are two
 * callers of this function, not two implementations. A second copy is how the two lanes would
 * drift apart on the one property that matters below.
 *
 * ── THE PROPERTY THIS MODULE EXISTS TO GUARANTEE ──────────────────────────────────────────────
 * A REFUSED WRITE MUST NEVER BE REPORTABLE AS A WRITTEN RECEIPT.
 *
 * The CHECK constraint on `lane` makes a wrong key LOUD AT THE DATABASE — but a fail-soft consumer
 * catches that rejection, logs a no-op, exits 0, and its runner records ok and drops the detail.
 * Loud at the database, SILENT AT THE OBSERVER. The receipt then reads as "this lane never
 * consumed anything", which is indistinguishable from the producer never having published — and
 * this SD exists precisely to make consumption observable.
 *
 * So this function NEVER THROWS and NEVER RETURNS A BARE TRUTHY VALUE. It returns an explicit
 * {written: boolean, reason} verdict. Fail-open belongs on the CALLER'S control flow (a receipt
 * failure must not break session start); it does NOT belong on the REPORTED OUTCOME. Those are
 * different things and collapsing them is the defect.
 *
 * ── WHY UPSERT AND NOT read-merge-write ───────────────────────────────────────────────────────
 * Receipts are per-lane ROWS with UNIQUE(report_id, lane), chosen over a jsonb per-lane map by
 * coordinator ruling 2026-08-04. PostgREST cannot express jsonb_set, so a map would force
 * read-merge-write plus a conditional guard on every writer forever, and one forgetful commit
 * would silently clobber a sibling lane — with the damage surfacing in THEIR leg. On the unique
 * key there is no merge window and no sibling is reachable: a second receipt for the same lane is
 * an update of that lane alone.
 *
 * ── LIVE STATUS AT TIME OF WRITING ────────────────────────────────────────────────────────────
 * The DDL is on main but the migration is CHAIRMAN-GATED and UNAPPLIED, so drive_report_receipts
 * does not exist live. This module is therefore built against the schema and unit-tested against a
 * stub; it is NOT integration-verified. Note also that probing those tables now proves nothing
 * about RLS: an anon probe against an ABSENT table returns absence, not denial, and the two are
 * indistinguishable from the probe side. Production RLS posture here is UNASSESSED, not clean.
 */
import { isDriveReportLane } from '../drive-loop/lanes.js';

/** Verdict reasons. Distinct values because collapsing two of them is how a cause gets lost. */
export const RECEIPT_OUTCOME = Object.freeze({
  WRITTEN: 'written',
  INVALID_LANE: 'invalid_lane',
  MISSING_REPORT_ID: 'missing_report_id',
  NO_CLIENT: 'no_client',
  WRITE_REFUSED: 'write_refused',
  UNCONFIRMED: 'unconfirmed',
});

/**
 * Did this fail because the caller stopped waiting? Both spellings, because the shape depends on
 * who threw: an AbortController rejects with a DOMException named AbortError, while supabase-js
 * surfaces some cancellations as a plain Error whose message names the abort.
 */
function isAbort(e) {
  return e?.name === 'AbortError' || /abort/i.test(e?.message || '');
}

/**
 * Stamp this consumer's receipt for one report.
 *
 * @param {object} client   supabase-js client
 * @param {{reportId: string, lane: string, metadata?: object}} args
 * @returns {Promise<{written: boolean, reason: string, lane: string|null, id?: string|null, error?: string}>}
 *          NEVER throws. `written` is the only field a caller may treat as success.
 */
export async function writeConsumptionReceipt(client, { reportId, lane, metadata = {}, signal = null } = {}) {
  // Lane is validated HERE rather than left to the CHECK constraint. The constraint would also
  // catch it, but only after a round trip and only as a generic write failure — and it is the
  // constraint's rejection, swallowed by a fail-soft caller, that this module exists to prevent.
  // Naming the cause locally means the verdict says invalid_lane instead of write_refused.
  if (!isDriveReportLane(lane)) {
    return { written: false, reason: RECEIPT_OUTCOME.INVALID_LANE, lane: lane ?? null };
  }
  if (!reportId) return { written: false, reason: RECEIPT_OUTCOME.MISSING_REPORT_ID, lane };
  if (!client || typeof client.from !== 'function') {
    return { written: false, reason: RECEIPT_OUTCOME.NO_CLIENT, lane };
  }

  try {
    let q = client
      .from('drive_report_receipts')
      .upsert({ report_id: reportId, lane, metadata }, { onConflict: 'report_id,lane' })
      .select('id');
    // Optional, and feature-detected: the caller supplies a deadline (the SessionStart hook runs on
    // a strict budget), but the stub clients in the unit tier do not implement abortSignal and a
    // hard call would make this module untestable without a live PostgREST.
    if (signal && typeof q.abortSignal === 'function') q = q.abortSignal(signal);
    const { data, error } = await q.maybeSingle();
    // A refusal is REPORTED, not absorbed. This is the branch a fail-soft consumer would turn into
    // a no-op — the table being absent (chairman-gated migration) lands here today, and that must
    // read as "no receipt" rather than as success.
    if (error) {
      return { written: false, reason: RECEIPT_OUTCOME.WRITE_REFUSED, lane, error: error.message };
    }
    // NO ROW BACK MEANS NOT CONFIRMED, NOT SUCCESS. An upsert with ignoreDuplicates off always
    // returns its row, so `data === null` with no error means something answered the returning
    // SELECT with nothing — an RLS posture that permits the INSERT but denies reading it back would
    // do exactly that. Unreachable under the shipped DDL (service_role FOR ALL), but this module's
    // invariant is absolute rather than situational, and the id is the only proof available here.
    // Under-claiming is the safe direction: the upsert is idempotent, so a caller that retries on
    // `unconfirmed` costs nothing, whereas a false `written` is the exact lie the module forbids.
    if (!data?.id) return { written: false, reason: RECEIPT_OUTCOME.UNCONFIRMED, lane, id: null };
    return { written: true, reason: RECEIPT_OUTCOME.WRITTEN, lane, id: data.id };
  } catch (e) {
    // AN ABORT IS NOT A REFUSAL. Measured on the adam lane: with the deadline at 2s and the server
    // 1.9s slow, the POST REACHES THE SERVER and the row may well be written — the client simply
    // stopped waiting for the answer. Reporting that as write_refused asserts the database said no,
    // which nobody observed. It is the same distinction as the null-row branch above, arriving by a
    // different route, so it lands in the same bucket rather than a fourth one.
    if (isAbort(e)) {
      return { written: false, reason: RECEIPT_OUTCOME.UNCONFIRMED, lane, error: e?.message || String(e) };
    }
    // Any other throw is still a refusal, never a success. Callers get one shape regardless of how
    // the write failed, so no caller needs its own try/catch to decide what happened.
    return { written: false, reason: RECEIPT_OUTCOME.WRITE_REFUSED, lane, error: e?.message || String(e) };
  }
}

/**
 * One-line rendering of a verdict, for callers that log rather than throw.
 *
 * Exists so a fail-open caller has something honest to emit. The failure mode is a caller that
 * logs nothing on failure because it has nothing convenient to say; giving it a ready sentence
 * removes the excuse. Deliberately states the lane on BOTH paths — a success line that omits the
 * lane cannot be told apart from a different lane's success.
 */
export function describeReceiptOutcome(verdict) {
  if (!verdict || typeof verdict !== 'object') return 'receipt: no verdict returned (treat as NOT written)';
  if (verdict.written) return `receipt: written for lane ${verdict.lane}`;
  const detail = verdict.error ? ` (${verdict.error})` : '';
  return `receipt: NOT WRITTEN for lane ${verdict.lane ?? '(none)'} — ${verdict.reason}${detail}`;
}
