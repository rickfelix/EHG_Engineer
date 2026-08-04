/**
 * Withheld-promotion registry — SD-LEO-INFRA-WITHHELD-PROMOTIONS-GET-001.
 *
 * WHAT WAS MISSING. The QF demand gate withholds promotion whenever the belt gauge sits at or
 * above its floor, which is correct. But the withheld set existed durably NOWHERE: stdout inside
 * one GHA run, plus an integer the caller destructured away one line after the gate computed it.
 * Meanwhile the source rows age out of a rolling 14-day candidate window. A withheld group that
 * never sees a below-floor run before its window closes is lost, silently, and the cron re-runs
 * every six hours.
 *
 * The gate's own source already said so — "a withheld group does not queue, IT EXPIRES". The
 * problem was named and understood; only the sink was absent.
 *
 * ── WHY feedback.metadata AND NOT A TABLE OR A STATUS VALUE ───────────────────────────────────
 * The SD offered "table or feedback-status representation". Both are chairman-gated DDL:
 * feedback_status_check admits nine values and none is a pending state (verified against live
 * pg_constraint, not the migration snapshot), so the status option is ALTER TABLE DROP/ADD
 * CONSTRAINT. feedback.metadata is live jsonb, nullable, DEFAULT '{}', with NO check constraint,
 * and it already carries promotion state for this exact promoter (the promoted_to_qf stamp).
 * It also delivers "the record outlives the window" for free, because feedback rows are never
 * purged — rows from 2026-04-26 are still present.
 *
 * ── REGISTRY, NOT LEDGER ──────────────────────────────────────────────────────────────────────
 * The SD was internally inconsistent here: one requirement stamps a RUN IDENTIFIER (implying an
 * append-per-run log) while another presumes a mutable SET that entries leave by a named event.
 * Append-per-run over a 6-hourly cron is ~144 rows/day and ~2,000 per window for 36 groups — a
 * record less legible than the stdout it replaces, which would defeat the point. So: ONE marker
 * per group, mutated in place, with run provenance preserved as counters (first/last/count).
 *
 * ── THE KEY IS THE FEEDBACK ROW ID, NOT THE FINGERPRINT ───────────────────────────────────────
 * A fingerprint is derived from title+description and MOVES if a title is ever edited, orphaning
 * its record and silently creating a second one. The two coincide today only because every
 * current group is a singleton — a fact about today's data, not a property of the design.
 */

/** The metadata key. One namespace, no parallel copies. */
export const MARKER_KEY = 'withheld_pending';

/** Admission paths, mirroring the two branches of shouldPromote. */
export const ADMISSION_SEVERITY_BYPASS = 'severity_bypass';
export const ADMISSION_COUNT_THRESHOLD = 'count_threshold';

/**
 * Which branch of shouldPromote admitted this group?
 *
 * shouldPromote returns a bare boolean and does not report its reason, so this re-derives it —
 * a two-readers hazard, and the reason the derivation lives in exactly one place.
 *
 * ORDER IS LOAD-BEARING. A group that is BOTH critical AND at/over the key threshold reports
 * severity_bypass, because the severity branch returns first in shouldPromote. Reporting
 * count_threshold for that group would be a lie about which rule was actually consulted.
 *
 * @param {{max_severity?: string, groupKeys?: Set<any>}} group
 * @param {(s: string) => number} severityRank injected from content-fingerprint
 * @param {number} threshold
 * @returns {string}
 */
export function deriveAdmissionPath(group, severityRank, threshold) {
  if (severityRank(group?.max_severity) >= severityRank('critical')) return ADMISSION_SEVERITY_BYPASS;
  return ADMISSION_COUNT_THRESHOLD;
}

/**
 * PURE: build the marker for one suppressed group. No I/O, no clock — `nowIso` and `runId` are
 * passed in so the shape is testable and the timestamps are not invented here.
 *
 * @param {object} group      a group from groupByFingerprint: {fingerprint, rows, max_severity, groupKeys}
 * @param {object} demand     the demand decision: {engine, gauge_value, floor, decision}
 * @param {object} ctx        {runId, nowIso, severityRank, threshold, prior}
 * @returns {object} the marker
 */
export function buildMarker(group, demand, { runId = null, nowIso, severityRank, threshold, prior = null } = {}) {
  if (!nowIso) throw new Error('buildMarker: nowIso is required — a marker without a timestamp cannot be aged or ordered');
  if (typeof severityRank !== 'function') throw new Error('buildMarker: severityRank must be injected');

  const memberIds = Array.isArray(group?.rows) ? group.rows.map((r) => r.id).filter(Boolean) : [];

  return {
    fingerprint: group?.fingerprint ?? null,
    member_feedback_ids: memberIds,
    max_severity: group?.max_severity ?? null,
    admission_path: deriveAdmissionPath(group, severityRank, threshold),

    // GAUGE VALUE IS PASSED THROUGH, NEVER COERCED. An unmeasurable reading carries null, and a
    // null that becomes 0 is indistinguishable from a real below-floor reading — the exact false-
    // zero this subsystem documents elsewhere in its own source.
    gauge_value: demand?.gauge_value ?? null,
    floor: demand?.floor ?? null,
    engine: demand?.engine ?? null,
    decision: demand?.decision ?? null,

    // Run provenance WITHOUT appending a row per run. This is what lets one mutable marker
    // satisfy the run-identifier requirement.
    first_withheld_at: prior?.first_withheld_at ?? nowIso,
    last_withheld_at: nowIso,
    first_withheld_run: prior?.first_withheld_run ?? runId,
    last_withheld_run: runId,
    withheld_run_count: (prior?.withheld_run_count ?? 0) + 1,

    // Exit state. Present and null while pending, so a reader never has to distinguish
    // "absent key" from "not yet promoted".
    //
    // promoted_at is the AUTHORITATIVE promotion stamp; promoted_qf_id is best-effort and stays
    // null on the promoter's inline path, because create-quick-fix.js runs with stdio:'inherit'
    // and its minted id is never captured by that process. Keeping them separate means the id
    // field never has to hold something that is not an id.
    promoted_at: prior?.promoted_at ?? null,
    promoted_qf_id: prior?.promoted_qf_id ?? null,
    promoted_fingerprint: prior?.promoted_fingerprint ?? null,
    disposed_by: prior?.disposed_by ?? null,
    disposed_reason: prior?.disposed_reason ?? null,
    disposed_at: prior?.disposed_at ?? null,
  };
}

/**
 * A marker is pending while it has neither been promoted nor dispositioned.
 *
 * PROMOTION IS DETECTED BY promoted_at, NOT BY promoted_qf_id. The id is genuinely unavailable on
 * the promoter's inline path, so keying pending-ness on it would leave every inline-promoted
 * marker permanently "pending" — a record that says a thing is outstanding when it has already
 * been dealt with, which is the same illegibility this module exists to remove, inverted.
 */
export function isPending(marker) {
  return !!marker && !marker.promoted_at && !marker.promoted_qf_id && !marker.disposed_at;
}

/**
 * Write one marker per suppressed group, keyed by MEMBER FEEDBACK ID.
 *
 * Idempotent by construction: re-running over an unchanged population updates the same rows and
 * advances the counters rather than creating competing records.
 *
 * CARRIES THE EXISTING METADATA THROUGH. The promoter's success path rewrites metadata as a
 * full-object spread from a snapshot read, so anything not carried is silently clobbered; this
 * writer re-reads immediately before writing rather than trusting a snapshot it was handed.
 *
 * @param {object} supabase service-role client — a PARAMETER, so this module is unit-testable
 * @param {Array<object>} groups suppressed groups
 * @param {object} demand the demand decision
 * @param {object} ctx {runId, nowIso, severityRank, threshold}
 * @returns {Promise<{written: number, rows: string[]}>}
 */
export async function writeMarkers(supabase, groups, demand, ctx = {}) {
  if (!supabase || typeof supabase.from !== 'function') {
    throw new Error('writeMarkers: a supabase client is required');
  }
  if (!Array.isArray(groups) || groups.length === 0) return { written: 0, rows: [] };

  const touched = [];
  const failed = [];
  let attempted = 0;

  for (const group of groups) {
    const ids = Array.isArray(group?.rows) ? group.rows.map((r) => r.id).filter(Boolean) : [];
    for (const id of ids) {
      attempted++;
      const { data: row, error: readErr } = await supabase
        .from('feedback').select('id, metadata').eq('id', id).maybeSingle();
      if (readErr || !row) { failed.push({ id, stage: 'read', error: readErr?.message ?? 'row not found' }); continue; }

      const prior = row.metadata?.[MARKER_KEY] ?? null;
      // A marker that already left pending state is NOT resurrected by a later withheld run —
      // exits are by recorded event only, in both directions. Counted as skipped, not failed.
      if (prior && !isPending(prior)) { attempted--; continue; }

      const marker = buildMarker(group, demand, { ...ctx, prior });
      const { error: writeErr } = await supabase
        .from('feedback')
        .update({ metadata: { ...(row.metadata || {}), [MARKER_KEY]: marker } })
        .eq('id', id);
      if (writeErr) failed.push({ id, stage: 'write', error: writeErr.message });
      else touched.push(id);
    }
  }

  // FAILURES ARE REPORTED, NOT SWALLOWED. The first version returned {written: 0} on a run where
  // every single write was rejected, and the caller then printed "0 source row(s) marked pending
  // ... these now survive their 14-day window" — false, and with nothing raised to contradict it.
  // That is a green reading that means nothing, which is the exact defect class this whole module
  // was written to abolish, reproduced one level up inside the fix for it. Found at review.
  //
  // A TOTAL failure throws: if nothing could be recorded, the run has NOT protected anything and
  // must not report as though it had. A PARTIAL failure returns the detail so the caller can say
  // so precisely — a partial record is still worth keeping.
  if (attempted > 0 && touched.length === 0 && failed.length > 0) {
    throw new Error(`writeMarkers: all ${failed.length} durable write(s) failed — nothing was recorded (first: ${failed[0].error})`);
  }
  return { written: touched.length, rows: touched, failed, attempted };
}

/**
 * Read pending markers.
 *
 * PAGINATED, AND THE DOCSTRING NOW MATCHES THE CODE. The first version claimed "server-side
 * filtered — a capped fetch grouped in memory measures the CAP, not the population" while doing
 * exactly the thing it warned against: a plain select, truncated by PostgREST at 1000 rows against
 * a 5,477-row table, then filtered in memory. A comment asserting a property the code does not
 * have is worse than no comment, because it stops the next reader from checking. Found at review.
 *
 * The MARKER-PRESENCE filter is genuinely server-side. The PENDING filter is applied in memory
 * and that is stated rather than implied: pending-ness lives in a nested jsonb field, and the
 * presence filter already narrows the set to rows that carry a marker at all — a population
 * bounded by the number of groups ever withheld, not by the table.
 *
 * @param {object} supabase
 * @param {{engine?: string, pageSize?: number}} [opts]
 */
export async function readPendingMarkers(supabase, { engine = null, pageSize = 1000 } = {}) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('feedback').select('id, metadata')
      .not(`metadata->>${MARKER_KEY}`, 'is', null)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) return { markers: [], error: error.message };
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  const markers = rows
    .map((r) => ({ feedback_id: r.id, marker: r.metadata?.[MARKER_KEY] }))
    .filter((m) => isPending(m.marker))
    .filter((m) => (engine ? m.marker?.engine === engine : true));
  return { markers, error: null, scanned: rows.length };
}

/**
 * Consume a marker on promotion: stamp the minted QF id. This is one of exactly two ways an entry
 * may leave pending state.
 */
export async function consumeMarker(supabase, feedbackId, qfId, { nowIso } = {}) {
  if (!qfId) throw new Error('consumeMarker: a minted QF id is required — a consumption with no id is a silent exit');
  const { data: row } = await supabase.from('feedback').select('id, metadata').eq('id', feedbackId).maybeSingle();
  if (!row?.metadata?.[MARKER_KEY]) return { consumed: false };
  const marker = { ...row.metadata[MARKER_KEY], promoted_qf_id: qfId, promoted_at: nowIso ?? null };
  const { error } = await supabase.from('feedback')
    .update({ metadata: { ...(row.metadata || {}), [MARKER_KEY]: marker } }).eq('id', feedbackId);
  return { consumed: !error };
}

/**
 * Dispose a marker explicitly. The other of exactly two exits — and it requires BOTH an actor and
 * a reason, because a disposition with neither is indistinguishable from the silent expiry this
 * whole module exists to abolish.
 */
export async function disposeMarker(supabase, feedbackId, { actor, reason, nowIso } = {}) {
  if (!actor || !reason) {
    throw new Error('disposeMarker: actor and reason are both required — an unattributed disposition is a silent exit wearing a verb');
  }
  // V-3, found at PLAN_VERIFICATION: without nowIso this returned {disposed:true} while leaving
  // disposed_at null — and isPending() keys on disposed_at, so the marker stayed PENDING while the
  // caller was told it had been disposed. A silent non-exit wearing a verb, in the very function
  // whose error message above rails against that. The guard was one argument short of its own rule.
  if (!nowIso) {
    throw new Error('disposeMarker: nowIso is required — disposed_at is what ends pending state, so a disposition without it reports success and changes nothing');
  }
  const { data: row } = await supabase.from('feedback').select('id, metadata').eq('id', feedbackId).maybeSingle();
  if (!row?.metadata?.[MARKER_KEY]) return { disposed: false };
  const marker = { ...row.metadata[MARKER_KEY], disposed_by: actor, disposed_reason: reason, disposed_at: nowIso };
  const { error } = await supabase.from('feedback')
    .update({ metadata: { ...(row.metadata || {}), [MARKER_KEY]: marker } }).eq('id', feedbackId);
  return { disposed: !error };
}
