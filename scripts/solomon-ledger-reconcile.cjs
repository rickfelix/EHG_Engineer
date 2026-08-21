#!/usr/bin/env node
/**
 * solomon-ledger-reconcile.cjs — outcome reconciliation for solomon_advice_outcome_ledger.
 * SD-LEO-INFRA-SOLOMON-ADVICE-OUTCOME-LEDGER-001 (FR-4).
 *
 * For every ledger row with a populated outcome_sd_key and outcome still 'unknown', reads the
 * ACTUAL terminal status of that downstream SD (strategic_directives_v2.status) and sets outcome
 * accordingly — NEVER from Solomon's own advisory text (CONST-002 proposer!=approver). Rides the
 * existing cron cadence; this file adds no new scheduler, it is invoked manually or from an
 * existing periodic tick.
 *
 * Mapping (conservative — only the unambiguous, positively-confirmed case is auto-set):
 *   strategic_directives_v2.status = 'completed' -> outcome = 'shipped_clean'
 *   strategic_directives_v2.status = 'cancelled' -> outcome = 'reverted'
 *   anything else (in_progress, draft, not found, etc.) -> left 'unknown' (not yet decidable)
 *
 * 'caused_rework' is intentionally NOT auto-detected here (requires human judgment on whether a
 * downstream fix constitutes "rework caused by the original proposal") — it is set manually via a
 * direct ledger update when that judgment is made, not inferred by this script.
 *
 * Closer-of-record (SD-LEO-INFRA-REWARD-SPINE-ONE-001-B): every auto-close stamps closed_by/
 * closed_at so the closure is durably attributable to this mechanism, never a self-report —
 * the anti-Goodhart mechanic named in docs/architecture/reward-spine-ssot.md. This guarantee
 * covers ONLY the auto-close path in this file; the manual caused_rework update path (line 18
 * above) is NOT enforced at the DB level (no CHECK constraint) and can leave closed_by/closed_at
 * NULL if whoever performs that manual update doesn't also set them — a known, accepted scope
 * boundary (a hard CHECK would break pre-existing closed rows that predate this column).
 *
 * Usage:
 *   node scripts/solomon-ledger-reconcile.cjs [--dry-run]
 */
require('dotenv').config();
const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — negative-refs collection and
// back-propagation matching scan audit_log / strategic_directives_v2 / the outcome ledger with
// .limit(2000)/.limit(5000), all above the PostgREST 1000-row cap: the server silently clamps to
// 1000 regardless, so a real negative signal past row 1000 would never back-propagate. Paginate.
let _fapModule = null;
async function fapPaginate(queryFactory, opts) {
  _fapModule ||= await import('../lib/db/fetch-all-paginated.mjs');
  return _fapModule.fetchAllPaginated(queryFactory, opts);
}

const CLOSER_OF_RECORD = 'solomon-ledger-reconcile.cjs';

// SD-LEO-INFRA-SOLOMON-ADVICE-LEDGER-001 (FR-1/TR-2): correlation-only rows (no outcome_sd_key --
// a conversational Solomon proposal never tied to a downstream SD) that are decision='rejected'
// had NO path to outcome resolution at all: mapSdStatusToOutcome only reads outcome_sd_key, so
// these rows sat at outcome='unknown' forever even though "rejected, nothing built" is a fully
// determined, honest state (TR-1's migration adds 'not_applicable' for exactly this).
//
// EXEC-PHASE FINDING: decision resolution and human-disposition surfacing (the two other pieces
// this SD's original design assumed were missing) ALREADY EXIST and work correctly --
// scripts/coordinator-ack-adam.cjs's --disposition path and scripts/solomon-ledger-pending-
// resurface.cjs's digest ("Disposition individually by correlation_id"). No classifier is built;
// an automatic classifier over real reply payloads would also be unsafe (dense multi-topic free
// prose, not a structured signal -- a wrong auto-classification is worse than an honest pending).
let _refShapeModule = null;
async function refShapePaginate() {
  _refShapeModule ||= await import('../lib/ledger/ref-shape.js');
  return _refShapeModule;
}

// TESTING sub-agent (EXEC phase, F8): literal fallback for direct/unit-test invocation only
// (selectNotApplicableOutcomes is a sync pure function; lib/ledger/ref-shape.js's SHAPE object
// lives behind an async dynamic import, so a sync default can't source from it directly). The
// REAL production path (resolveNotApplicableOutcomes below) always passes the live SHAPE-derived
// list explicitly -- see there -- so a shape-name rename in ref-shape.js fails loudly in
// production, not just silently in this literal fallback.
const NOT_APPLICABLE_ELIGIBLE_SHAPES = Object.freeze(['empty', 'narrative-prose', 'commit-sha', 'qf-excluded-by-design']);

/**
 * Pure: given ledger rows and a classifyRef function, return the rows eligible for
 * outcome='not_applicable' -- decision='rejected', no outcome_sd_key, and a ref shape with no
 * traceable artifact. Exported for tests (classifyRef injected so tests stay dependency-free).
 * `eligibleShapes` defaults to the literal fallback above; resolveNotApplicableOutcomes always
 * passes the live SHAPE-derived list instead.
 */
function selectNotApplicableOutcomes(rows, classifyRef, eligibleShapes = NOT_APPLICABLE_ELIGIBLE_SHAPES) {
  const out = [];
  for (const r of (rows || [])) {
    if (r.decision !== 'rejected') continue;
    if (r.outcome_sd_key) continue; // has an SD key -- belongs to the existing SD-status path
    const shape = classifyRef(r.outcome_ref);
    if (!eligibleShapes.includes(shape)) continue; // ELIGIBLE/CASE_DRIFT -- resolvable, leave alone
    out.push({ id: r.id, shape });
  }
  return out;
}

/**
 * Resolve outcome='not_applicable' for correlation-only rejected rows with no traceable artifact.
 * Fail-open per row (a write failure -- e.g. the TR-1 migration not yet applied -- is logged and
 * skipped, never aborts the batch; this is the documented degrade-safe behavior). dryRun returns
 * the matches without writing. Exported for tests.
 */
async function resolveNotApplicableOutcomes(supabase, rows, { dryRun = false, nowIso = new Date().toISOString() } = {}) {
  const { classifyRef, SHAPE } = await refShapePaginate();
  // Live SHAPE-derived list (not the literal fallback). A silent `undefined` entry (from a rename
  // in ref-shape.js's SHAPE object) would otherwise just match nothing and quietly stop resolving
  // any row -- assert explicitly so that renders as a loud, immediate throw instead.
  const liveEligibleShapes = [SHAPE.EMPTY, SHAPE.NARRATIVE, SHAPE.COMMIT_SHA, SHAPE.EXCLUDED_QF];
  if (liveEligibleShapes.some((s) => s === undefined)) {
    throw new Error('resolveNotApplicableOutcomes: lib/ledger/ref-shape.js SHAPE object is missing an expected key — check for a rename');
  }
  const matched = selectNotApplicableOutcomes(rows, classifyRef, liveEligibleShapes);
  if (dryRun || matched.length === 0) return { matched, updated: [], failures: [] };
  const updated = [];
  const failures = [];
  for (const m of matched) {
    try {
      // FR-4: same closer-of-record discipline as the SD-keyed auto-close path (mapSdStatusToOutcome
      // above) — this resolver IS the reward-spine closer's correlation-leg linkage now.
      //
      // SECURITY sub-agent (EXEC phase, S1): the select-then-update sequence spans a loop of up to
      // 500 rows (minutes wide in production). Without re-asserting the SAME predicates the row was
      // selected under, an explicit human disposition (coordinator-ack-adam.cjs), a negative
      // back-propagation (backPropagateNegativeOutcomes below), or a manual caused_rework update
      // landing in that window would be silently clobbered back to 'not_applicable' -- an
      // authoritative outcome overwritten by a non-authoritative one, the same integrity failure
      // CONST-002 guards against, just from the opposite direction. Compare-and-set: only writes
      // if the row is STILL exactly the state it was selected under.
      const { error, count } = await supabase
        .from('solomon_advice_outcome_ledger') // schema-lint-disable-line — chairman-apply-gated table, not yet in the live snapshot
        .update({ outcome: 'not_applicable', closed_by: CLOSER_OF_RECORD, closed_at: nowIso }, { count: 'exact' })
        .eq('id', m.id)
        .eq('outcome', 'unknown')
        .eq('decision', 'rejected')
        .is('outcome_sd_key', null);
      if (!error && count === 0) { console.error(`  WARN: not_applicable write skipped for ${m.id} — row changed since selection (lost-update guard, not an error)`); continue; }
      if (error) { console.error(`  WARN: not_applicable write failed for ${m.id} (migration may not be applied yet): ${error.message}`); failures.push({ id: m.id, code: error.code, message: error.message }); continue; }
      updated.push(m.id);
    } catch (e) {
      console.error(`  WARN: not_applicable write threw for ${m.id}: ${(e && e.message) || e}`);
      failures.push({ id: m.id, code: (e && e.code) || null, message: (e && e.message) || String(e) });
    }
  }
  return { matched, updated, failures };
}

// SECURITY sub-agent (EXEC phase, S5): distinguishes the EXPECTED pre-migration state (every
// failure is Postgres 23514, "check constraint violation" -- the TR-1 migration hasn't been
// applied yet, a known temporary condition, not worth failing the daily cron over) from a REAL
// anomaly (connectivity, permissions, an unrelated schema problem) that deserves the loud signal.
// Exported for tests.
function isExpectedPreMigrationFailure(failures) {
  return (failures || []).length > 0 && failures.every((f) => f.code === '23514');
}

/**
 * Pure: classify a zero-write not_applicable resolution run (matched.length > 0, updated.length
 * === 0) into one of three states, extracted from main() for testability (REGRESSION sub-agent,
 * VERIFY phase, REG-M1). `failures.length === 0` means every matched row hit the lost-update guard
 * (row changed since selection — benign, per S1's compare-and-set fix) rather than a real write
 * error; this must NOT be conflated with "not the expected pre-migration CHECK violation", which
 * the original inline logic did, tripping process.exitCode=1 for a non-anomaly. Exported for tests.
 */
function classifyZeroWriteOutcome(naResult) {
  const n = naResult.matched.length;
  if (naResult.failures.length === 0) {
    return { status: 'skipped_lost_update', isError: false, message: `0/${n} row(s) written — all skipped by the lost-update guard (row(s) changed since selection; benign, not treated as a failure).` };
  }
  if (isExpectedPreMigrationFailure(naResult.failures)) {
    return { status: 'expected_pre_migration', isError: false, message: `0/${n} row(s) written — TR-1 migration not yet applied (expected, chairman-apply-gated; not treated as a failure).` };
  }
  return { status: 'anomaly', isError: true, message: `0/${n} row(s) written — failures are NOT the expected pre-migration CHECK violation. Treating as a real anomaly.` };
}

// FR-2/TS-4: catches the ledger going structurally silent on a leg (near-zero resolution
// progress), not a target to optimize toward. TESTING sub-agent (EXEC phase, F6) correctly flagged
// the original comment here as citing the wrong baseline: FR-4's acceptance criteria describes
// outcome_sd_key LINKAGE coverage (a different numerator/denominator), not outcome RESOLUTION
// coverage, which is what this floor actually measures. Corrected: live-measured (2026-08-19,
// this session) SD-leg resolution is 64% and correlation-leg is ~4.9% -- 1% is comfortably below
// both live-healthy figures. Known, accepted limitation (not "never trips" as originally
// overclaimed): a genuinely small, early-days leg with a handful of rows and zero resolved yet
// WILL trip this floor at any size -- there is no minimum-total exemption. That is an intentional
// trade-off (silence on a small leg is exactly as worth surfacing as silence on a large one), not
// an oversight.
const COVERAGE_FLOOR_PCT = 1;

/**
 * Pure: per-leg resolution coverage (rows with outcome != 'unknown' / total) for the SD-keyed leg
 * (outcome_sd_key populated) and the correlation-keyed leg (outcome_sd_key null) separately.
 * Also runs lib/ledger/ref-shape.js's summarise() over each leg (TR-4) for ref-shape-hygiene
 * context alongside the resolution-progress numbers. Exported for tests.
 */
function computeLegCoverage(rows, summarise) {
  const legStats = (legRows) => {
    const total = legRows.length;
    const resolved = legRows.filter((r) => r.outcome && r.outcome !== 'unknown').length;
    const pct = total > 0 ? +(100 * resolved / total).toFixed(1) : null;
    return { total, resolved, pct, belowFloor: total > 0 && pct < COVERAGE_FLOOR_PCT, refShape: summarise(legRows) };
  };
  const sdLeg = legStats((rows || []).filter((r) => r.outcome_sd_key));
  const correlationLeg = legStats((rows || []).filter((r) => !r.outcome_sd_key));
  return { sdLeg, correlationLeg, anyBelowFloor: sdLeg.belowFloor || correlationLeg.belowFloor };
}

/**
 * Pure: map a downstream SD's terminal status to a ledger outcome value.
 * Returns null when the status is not yet a confident terminal signal (leave 'unknown'). Exported for tests.
 */
function mapSdStatusToOutcome(sdStatus) {
  if (sdStatus === 'completed') return 'shipped_clean';
  if (sdStatus === 'cancelled') return 'reverted';
  return null;
}

/**
 * Reconcile one batch of ledger rows against live SD status. Fail-open per row: a single lookup
 * failure is logged and skipped, never aborts the batch. Exported for tests.
 */
async function reconcileBatch(supabase, rows) {
  const results = [];
  for (const row of rows) {
    if (!row.outcome_sd_key) { results.push({ id: row.id, updated: false, reason: 'no outcome_sd_key' }); continue; }
    let sd;
    try {
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .select('status')
        .eq('sd_key', row.outcome_sd_key)
        .maybeSingle();
      if (error) { results.push({ id: row.id, updated: false, reason: error.message }); continue; }
      sd = data;
    } catch (e) {
      results.push({ id: row.id, updated: false, reason: (e && e.message) || String(e) });
      continue;
    }
    if (!sd) { results.push({ id: row.id, updated: false, reason: `SD ${row.outcome_sd_key} not found` }); continue; }
    const outcome = mapSdStatusToOutcome(sd.status);
    if (!outcome) { results.push({ id: row.id, updated: false, reason: `SD status '${sd.status}' not yet terminal` }); continue; }
    results.push({ id: row.id, updated: true, outcome, sdStatus: sd.status, sdKey: row.outcome_sd_key });
  }
  return results;
}

// ── FR-4 (SD-LEO-INFRA-ROLE-MEASUREMENT-INTEGRITY-001, W2): negative-outcome back-propagation ────────
// The ledger had ZERO negative outcomes ever recorded, so "accuracy" was unfalsifiable. When a
// revert / red-merge / RCA attribution names a tracked artifact, the linked ledger row's outcome
// flips to 'reverted'. Attribution flows ONLY through EXACT outcome_ref equality — never a heuristic —
// so a real accept that named that artifact (FR-3) is the only thing a negative signal can touch.
const NEGATIVE_OUTCOME = 'reverted';
const NEGATIVE_BACKPROP_SOURCE = 'solomon-ledger-negative-backprop.cjs';
// audit_log events that constitute a durable negative signal. RED_MERGE_DETECTED is written by
// scripts/ci/red-merge-detector.mjs; the revert/RCA events are matched defensively if present.
const NEGATIVE_AUDIT_EVENTS = Object.freeze(['RED_MERGE_DETECTED', 'RED_MERGE', 'SD_REVERTED', 'REVERT', 'RCA_ATTRIBUTED_REGRESSION']);
// Metadata keys a negative signal may carry a reference under (raw value used verbatim — the match
// is still exact outcome_ref equality, so extra candidate keys never create mis-attribution).
const NEGATIVE_REF_KEYS = Object.freeze(['sha', 'commit_sha', 'sd_key', 'sd_id', 'ref', 'outcome_ref', 'pr', 'pr_url', 'pr_number', 'signature']);

/** Pure: add every non-empty candidate reference from a signal's metadata object into `set`. */
function addRefsFromMetadata(set, metadata) {
  if (!metadata || typeof metadata !== 'object') return;
  for (const k of NEGATIVE_REF_KEYS) {
    const v = metadata[k];
    if (v != null && String(v).trim()) set.add(String(v).trim());
  }
}

/**
 * Pure: given ledger rows and a set of negative reference strings, return the rows to flip to
 * 'reverted'. EXACT outcome_ref equality only. A NO_ARTIFACT sentinel ref (FR-3 no-artifact marker)
 * is never linkable. Rows already terminal-negative (reverted/caused_rework) are skipped (idempotent).
 * SD-LEO-INFRA-SOLOMON-ADVICE-LEDGER-001 (SECURITY sub-agent S2): not_applicable rows are ALSO
 * skipped -- that outcome means "rejected, nothing was ever built" (decision='rejected'), so its
 * outcome_ref can legitimately be a bare commit-sha-shaped or narrative string with no real
 * artifact behind it; a LATER unrelated red-merge/revert event that happens to name the same
 * string must never flip a never-built proposal to "reverted" (there is nothing to revert).
 * unknown/shipped_clean flip (a later revert means it was not actually clean). Exported for tests.
 */
const NEGATIVE_BACKPROP_TERMINAL_SKIP = Object.freeze([NEGATIVE_OUTCOME, 'caused_rework', 'not_applicable']);
function selectNegativeBackprop(ledgerRows, negativeRefs) {
  const refSet = negativeRefs instanceof Set ? negativeRefs : new Set((negativeRefs || []).filter(Boolean).map(String));
  const out = [];
  for (const r of (ledgerRows || [])) {
    const ref = r && r.outcome_ref;
    if (!ref || typeof ref !== 'string') continue;
    if (ref === 'NO_ARTIFACT' || ref.startsWith('NO_ARTIFACT:')) continue; // explicit no-artifact — nothing to track
    if (!refSet.has(ref)) continue;                                        // EXACT linkage only, never heuristic
    if (NEGATIVE_BACKPROP_TERMINAL_SKIP.includes(r.outcome)) continue;     // already negative or never-built — idempotent
    out.push({ id: r.id, outcome_ref: ref, priorOutcome: r.outcome });
  }
  return out;
}

/**
 * Read DURABLE negative signals and return the set of reference strings they name. Fail-open per
 * source (a query error yields no refs from that source, never throws). Exported for tests.
 *   1. audit_log rows with a negative event (metadata refs)
 *   2. strategic_directives_v2 rows with metadata.reverted_at set (a real SD revert -> its sd_key + id)
 */
async function collectNegativeRefs(supabase, { sinceMs = null } = {}) {
  const refs = new Set();
  try {
    // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: was .limit(2000), above the
    // PostgREST 1000-row cap (silently clamped anyway) — paginate to actually see every row.
    const data = await fapPaginate(() => {
      // SD-LEO-INFRA-ADVICE-OUTCOME-LEDGER-001 FR-0 — THE COLUMN IS `event_type`, NOT `event`.
      // This read had never returned a row. `select('event')` errors with PostgREST 42703
      // ("column audit_log.event does not exist"), and the surrounding catch is fail-open, so the
      // failure presented as an empty result — indistinguishable from "no red merges happened".
      // The PRODUCER had the identical bug (red-merge-detector.mjs, inserting `event:`), so the two
      // sides agreed with each other about a column the database does not have and no test
      // comparing them could have caught it. Measured before the fix: zero RED_MERGE_DETECTED rows
      // have ever existed. This is the reason the ledger has never recorded a negative outcome —
      // sparse join keys were only the second reason.
      let q = supabase.from('audit_log').select('event_type, metadata, created_at').in('event_type', NEGATIVE_AUDIT_EVENTS);
      if (sinceMs) q = q.gte('created_at', new Date(sinceMs).toISOString());
      return q.order('created_at', { ascending: true }).order('id', { ascending: true });
    });
    for (const row of data) addRefsFromMetadata(refs, row.metadata);
  } catch { /* fail-open */ }
  try {
    const data = await fapPaginate(() => supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, metadata')
      .not('metadata->>reverted_at', 'is', null)
      .order('id', { ascending: true }));
    for (const sd of data) { if (sd.sd_key) refs.add(String(sd.sd_key)); if (sd.id) refs.add(String(sd.id)); }
  } catch { /* fail-open */ }
  return refs;
}

/**
 * Back-propagate a NEGATIVE outcome onto every ledger row whose outcome_ref EXACTLY matches a negative
 * reference. Stamps outcome='reverted' + closer-of-record (closed_by/closed_at). Fail-open per row.
 * dryRun returns the matches without writing. Exported for tests.
 */
async function backPropagateNegativeOutcomes(supabase, { negativeRefs, source = NEGATIVE_BACKPROP_SOURCE, nowIso = new Date().toISOString(), dryRun = false } = {}) {
  const refSet = negativeRefs instanceof Set ? negativeRefs : new Set((negativeRefs || []).filter(Boolean).map(String));
  if (refSet.size === 0) return { matched: [], updated: [] };
  let rows = [];
  try {
    // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: was .limit(5000), above the
    // PostgREST 1000-row cap (silently clamped anyway) — paginate to actually see every row.
    rows = await fapPaginate(() => supabase
      .from('solomon_advice_outcome_ledger') // schema-lint-disable-line — chairman-apply-gated table, not yet in the live snapshot
      .select('id, outcome, outcome_ref')
      .not('outcome_ref', 'is', null)
      .order('id', { ascending: true }));
  } catch (e) {
    return { matched: [], updated: [], reason: (e && e.message) || String(e) };
  }
  const matched = selectNegativeBackprop(rows, refSet);
  if (dryRun) return { matched, updated: [] };
  const updated = [];
  for (const m of matched) {
    try {
      const { error } = await supabase
        .from('solomon_advice_outcome_ledger') // schema-lint-disable-line — chairman-apply-gated table, not yet in the live snapshot
        .update({ outcome: NEGATIVE_OUTCOME, closed_by: source, closed_at: nowIso })
        .eq('id', m.id);
      if (error) { console.error(`  WARN: negative back-prop failed for ${m.id}: ${error.message}`); continue; }
      updated.push(m.id);
    } catch (e) {
      console.error(`  WARN: negative back-prop threw for ${m.id}: ${(e && e.message) || e}`);
    }
  }
  return { matched, updated };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  let supabase;
  try { supabase = createSupabaseServiceClient(); }
  catch (e) { console.error('ERROR: supabase client unavailable:', e.message); process.exit(1); }

  const { count: unknownBefore } = await supabase
    .from('solomon_advice_outcome_ledger') // schema-lint-disable-line — new table (this PR's migration), chairman-apply-gated, not yet in the live snapshot
    .select('*', { count: 'exact', head: true })
    .eq('outcome', 'unknown');

  // FR-1/TR-2: correlation-only rows (no outcome_sd_key) that are decision='rejected' -- resolve
  // outcome='not_applicable' when there is no traceable artifact. Runs independently of the
  // SD-keyed leg below (queried and reported before that leg's early-returns).
  const { data: rejectedNoKey, error: rejectedErr } = await supabase
    .from('solomon_advice_outcome_ledger') // schema-lint-disable-line — new table (this PR's migration), chairman-apply-gated, not yet in the live snapshot
    .select('id, outcome_sd_key, outcome_ref, decision')
    .eq('outcome', 'unknown')
    .eq('decision', 'rejected')
    .is('outcome_sd_key', null)
    .limit(500);
  if (rejectedErr) {
    console.error('WARN: correlation-only rejected-row query failed (skipping not_applicable resolution):', rejectedErr.message);
  } else {
    const naResult = await resolveNotApplicableOutcomes(supabase, rejectedNoKey || [], { dryRun });
    console.log(`Correlation-only leg: ${(rejectedNoKey || []).length} decision='rejected' row(s) with no outcome_sd_key checked, ${naResult.matched.length} have no traceable artifact.`);
    if (dryRun) {
      for (const m of naResult.matched) console.log(`  [dry-run] ${m.id}: would set outcome='not_applicable' (ref shape=${m.shape})`);
    } else if (naResult.matched.length > 0 && naResult.updated.length === 0) {
      const { message, isError } = classifyZeroWriteOutcome(naResult);
      (isError ? console.error : console.log)('  ' + message);
      if (isError) process.exitCode = 1;
    } else {
      console.log(`  ${naResult.updated.length}/${naResult.matched.length} row(s) written outcome='not_applicable'.`);
    }
  }

  // FR-2/TR-4: per-leg (SD-keyed vs correlation-keyed) resolution coverage, reported to both CLI
  // stdout and (via the GHA step's `tee reconcile.log` + step-summary cat) the job summary. Exits
  // non-zero when either leg's coverage falls below COVERAGE_FLOOR_PCT — a silent-regression
  // signal, not a target.
  try {
    const { summarise } = await refShapePaginate();
    const allRows = await fapPaginate(() => supabase
      .from('solomon_advice_outcome_ledger') // schema-lint-disable-line — new table (this PR's migration), chairman-apply-gated, not yet in the live snapshot
      .select('id, outcome_sd_key, outcome, outcome_ref')
      .order('id', { ascending: true }));
    const coverage = computeLegCoverage(allRows, summarise);
    console.log('Leg coverage (resolved outcome / total):');
    console.log(`  SD-keyed:          ${coverage.sdLeg.resolved}/${coverage.sdLeg.total} (${coverage.sdLeg.pct ?? 'n/a'}%)${coverage.sdLeg.belowFloor ? `  *** BELOW FLOOR (${COVERAGE_FLOOR_PCT}%) ***` : ''}`);
    console.log(`  correlation-keyed: ${coverage.correlationLeg.resolved}/${coverage.correlationLeg.total} (${coverage.correlationLeg.pct ?? 'n/a'}%)${coverage.correlationLeg.belowFloor ? `  *** BELOW FLOOR (${COVERAGE_FLOOR_PCT}%) ***` : ''}`);
    if (coverage.anyBelowFloor) {
      console.error(`WARN: leg coverage below the ${COVERAGE_FLOOR_PCT}% floor — resolution has gone silent on at least one leg.`);
      process.exitCode = 1;
    }
  } catch (e) {
    console.error('WARN: leg coverage computation failed (non-fatal):', (e && e.message) || e);
  }

  const { data: pending, error } = await supabase
    .from('solomon_advice_outcome_ledger') // schema-lint-disable-line — new table (this PR's migration), chairman-apply-gated, not yet in the live snapshot
    .select('id, outcome_sd_key')
    .eq('outcome', 'unknown')
    .not('outcome_sd_key', 'is', null)
    .limit(500);
  if (error) { console.error('ERROR: ledger query failed:', error.message); process.exit(1); }
  console.log(`Ledger state before this run: ${unknownBefore ?? '?'} row(s) outcome='unknown'; ${pending ? pending.length : 0} eligible (have an outcome_sd_key).`);
  if (!pending || pending.length === 0) { console.log('(no ledger rows pending reconciliation)'); return; }

  const results = await reconcileBatch(supabase, pending);
  const toUpdate = results.filter((r) => r.updated);

  console.log(`Reconcile: ${pending.length} row(s) checked, ${toUpdate.length} resolved to a terminal outcome.`);
  for (const r of results) {
    console.log(`  ${r.id}: ${r.updated ? `outcome=${r.outcome} (SD status=${r.sdStatus})` : `skipped (${r.reason})`}`);
  }

  if (dryRun || toUpdate.length === 0) return;

  for (const r of toUpdate) {
    // outcome_ref is NOT stamped here — it is documented (20260701_solomon_advice_outcome_ledger.sql)
    // as "e.g. PR URL or CI run reference", and r.sdKey duplicates outcome_sd_key already on the same
    // row, adding no information. closed_by/closed_at are the closer-of-record for this auto-close path.
    const { error: uErr } = await supabase
      .from('solomon_advice_outcome_ledger') // schema-lint-disable-line — new table (this PR's migration), chairman-apply-gated, not yet in the live snapshot
      .update({
        outcome: r.outcome,
        closed_by: CLOSER_OF_RECORD,
        closed_at: new Date().toISOString(),
      })
      .eq('id', r.id);
    if (uErr) console.error(`  WARN: failed to write outcome for ${r.id}: ${uErr.message}`);
  }
  console.log(`✓ ${toUpdate.length} row(s) updated.`);

  const { count: unknownAfter } = await supabase
    .from('solomon_advice_outcome_ledger') // schema-lint-disable-line — new table (this PR's migration), chairman-apply-gated, not yet in the live snapshot
    .select('*', { count: 'exact', head: true })
    .eq('outcome', 'unknown');
  console.log(`Ledger state after this run: ${unknownAfter ?? '?'} row(s) outcome='unknown' (was ${unknownBefore ?? '?'}).`);

  // FR-4: negative-outcome back-propagation. Collect durable revert/red-merge/RCA signals and flip any
  // ledger row whose outcome_ref EXACTLY matches to 'reverted' (closes the "zero negatives ever" gap).
  const negRefs = await collectNegativeRefs(supabase, {});
  console.log(`Negative-signal refs collected (revert/red-merge/RCA): ${negRefs.size}.`);
  const backprop = await backPropagateNegativeOutcomes(supabase, { negativeRefs: negRefs, dryRun });
  if (dryRun) {
    console.log(`  [dry-run] ${backprop.matched.length} ledger row(s) would flip to outcome='reverted' via exact outcome_ref linkage:`);
    for (const m of backprop.matched) console.log(`    ${m.id}: ${m.priorOutcome} -> reverted (ref=${m.outcome_ref})`);
  } else {
    console.log(`  Negative back-prop: ${backprop.updated.length}/${backprop.matched.length} row(s) stamped outcome='reverted' via outcome_ref linkage.`);
  }
}

module.exports = {
  mapSdStatusToOutcome, reconcileBatch,
  selectNegativeBackprop, collectNegativeRefs, backPropagateNegativeOutcomes, addRefsFromMetadata,
  NEGATIVE_OUTCOME, NEGATIVE_BACKPROP_SOURCE, NEGATIVE_AUDIT_EVENTS, NEGATIVE_BACKPROP_TERMINAL_SKIP,
  selectNotApplicableOutcomes, resolveNotApplicableOutcomes, NOT_APPLICABLE_ELIGIBLE_SHAPES,
  computeLegCoverage, COVERAGE_FLOOR_PCT, isExpectedPreMigrationFailure, classifyZeroWriteOutcome,
};

if (require.main === module) {
  main().catch((err) => { console.error('UNHANDLED:', err.message || err); process.exit(1); });
}
