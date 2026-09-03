/**
 * Belt CENSUS — row-level bucket enumeration. SD-LEO-INFRA-ONE-BELT-CENSUS-001.
 *
 * THE INCIDENT THIS CLOSES (2026-09-02): four fleet seats independently read the belt as empty
 * from a status='open'/'draft' filter while 17 quick_fixes rows sat status=escalated with no SD,
 * no resolution, no release condition — each seat honestly measured the wrong set. This module
 * returns EVERY lifecycle-non-terminal strategic_directives_v2 and quick_fixes row tagged with
 * exactly one bucket from {claimable, directed_only, gated, stranded, deferred, in_flight},
 * computed from the SAME shared eligibility predicate (classifyAllDispatchIneligibility) the
 * dispatch choke already uses.
 *
 * SIBLING TO lib/fleet/belt-depth.cjs, NOT A REPLACEMENT. belt-depth.cjs is COUNT-only and its
 * ~10 existing consumers are untouched by this module. belt-census.cjs is ROW-level bucket
 * detail belt-depth's count-only API cannot provide.
 *
 * LIFECYCLE-TERMINAL PREDICATE (this module's own, deliberately DISTINCT from dispatch.cjs's
 * dispatch-terminal TERMINAL_SD_STATUSES/TERMINAL_QF_STATUSES — escalated QF and deferred SD are
 * BUCKETS here, never exclusions):
 *   SD  lifecycle-terminal (excluded) = {completed, cancelled}
 *   SD  non-terminal (bucketed)       = {draft, active, in_progress, planning, review,
 *                                        pending_approval, deferred}
 *   QF  lifecycle-terminal (excluded) = {completed, cancelled, closed}
 *   QF  non-terminal (bucketed)       = {open, in_progress, escalated}
 * Verified 2026-09-03 against the live strategic_directives_v2_status_check /
 * quick_fixes_status_check CHECK constraints via pg_constraint (not hand-guessed). A row whose
 * status is not in either valid-statuses set throws (fail-closed), never silently in/excluded.
 *
 * BUCKET PRECEDENCE (NORMATIVE — when multiple conditions match the same row):
 *   in_flight > gated > stranded > deferred > directed_only > claimable
 * Rationale: in_flight (an open PR/branch already exists) is the strongest signal real work is
 * underway. gated (an active hold, incl. a dependency-gate block) must suppress stranded/deferred
 * bucketing since the hold is the actionable reason. stranded (escalated QF) and deferred
 * (deferred SD) are status-derived and mutually exclusive by status value. directed_only (a
 * coordinator reservation naming another session/tier) sits below deferred/stranded because a
 * directed assignment on an escalated/deferred row still needs that lifecycle state resolved
 * first. claimable is the bottom fallback.
 */
const {
  classifyAllDispatchIneligibility,
  draftDepsSatisfied,
  parentLeadPending,
  resolveHoldProvenance,
} = require('./claim-eligibility.cjs');
const { normalizeLane, requireResolvableLane, assertLaneUnambiguous } = require('./lane-scope.cjs');
const { getInflightSnapshot } = require('./inflight-git-state.cjs');
const { fetchActiveReservationsMap } = require('../checkin/steps/drain-reservations.cjs');
const { getActiveCoordinatorId } = require('../coordinator/resolve.cjs');

const SD_ELIGIBILITY_COLUMNS = 'id, sd_key, sd_type, status, metadata, target_application, dependencies, parent_sd_id';
const QF_ELIGIBILITY_COLUMNS = 'id, status, target_application, not_before, claiming_session_id';

/** Single normative status matrix — see module docblock. */
const SD_TERMINAL_STATUSES = new Set(['completed', 'cancelled']);
const SD_VALID_STATUSES = new Set(['draft', 'active', 'in_progress', 'planning', 'review', 'pending_approval', 'completed', 'deferred', 'cancelled']);
const QF_TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'closed']);
const QF_VALID_STATUSES = new Set(['open', 'in_progress', 'completed', 'escalated', 'cancelled', 'closed']);

const BUCKETS = Object.freeze(['claimable', 'directed_only', 'gated', 'stranded', 'deferred', 'in_flight']);

const INFLIGHT_AXES = new Set(['inflight_open_pr', 'inflight_remote_branch']);
const DIRECTED_AXES = new Set(['reserved_for_other_session', 'reserved_for_other_tier']);

/**
 * QF rows have no `metadata` column, so resolveHoldProvenance's SD-shaped reason set does not
 * apply. A QF's own hold analog is a future-dated `not_before`, mirroring the SD not_before_hold
 * axis. Returns the SAME { reason, set_by, set_at, source_key } shape as resolveHoldProvenance,
 * or null.
 */
function resolveQfHoldProvenance(row) {
  const notBeforeMs = row.not_before ? Date.parse(row.not_before) : NaN;
  if (Number.isFinite(notBeforeMs) && notBeforeMs > Date.now()) {
    return { reason: `not_before hold until ${row.not_before}`, set_by: null, set_at: null, source_key: 'not_before' };
  }
  return null;
}

/**
 * Pure, synchronous, DB-free classifier. ALL ctx-derived computation (classifyAllDispatchIneligibility's
 * axes, the dep-gate boolean, holdProvenance) happens in computeBeltCensus BEFORE this is called —
 * bucketFor itself never touches ctx/supabase/any async helper.
 *
 * @param {{kind:'sd'|'qf', status:string}} row
 * @param {string[]} axes - all matching classifyAllDispatchIneligibility axis names, plus
 *   'dep_blocked'/'parent_lead_pending' when the async dep-gate found a block
 * @param {{reason:string}|null} holdProvenance
 * @returns {'claimable'|'directed_only'|'gated'|'stranded'|'deferred'|'in_flight'}
 */
function bucketFor(row, axes, holdProvenance) {
  const axesSet = new Set(axes || []);
  const isInFlight = [...axesSet].some((a) => INFLIGHT_AXES.has(a));
  if (isInFlight) return 'in_flight';

  const isGated = holdProvenance != null || axesSet.has('dep_blocked') || axesSet.has('parent_lead_pending');
  if (isGated) return 'gated';

  if (row.kind === 'qf' && row.status === 'escalated') return 'stranded';
  if (row.kind === 'sd' && row.status === 'deferred') return 'deferred';

  const isDirected = [...axesSet].some((a) => DIRECTED_AXES.has(a));
  if (isDirected) return 'directed_only';

  return 'claimable';
}

/**
 * formatComplementProse — FR-6's shared formatter. Given a belt_census_result and the reader's
 * acted-on bucket name(s), returns the FR-6-compliant string segment: when the COMBINED count of
 * the acted-on buckets is 0, names the non-zero complement buckets alongside it; otherwise
 * returns the plain acted-on count.
 *
 * @param {{countsByBucket: Record<string, number>}} result
 * @param {string[]} actedOnBuckets
 * @returns {string}
 */
function formatComplementProse(result, actedOnBuckets) {
  const counts = result.countsByBucket || {};
  const actedOnTotal = actedOnBuckets.reduce((sum, b) => sum + (counts[b] || 0), 0);
  if (actedOnTotal > 0) return String(actedOnTotal);
  const complementBuckets = BUCKETS.filter((b) => !actedOnBuckets.includes(b) && (counts[b] || 0) > 0);
  if (complementBuckets.length === 0) return '0';
  const parts = complementBuckets.map((b) => `${counts[b]} ${b}`);
  return `0 (${parts.join(', ')})`;
}

async function resolveScopedRows(supabase, scope, table, rows) {
  if (scope === undefined || scope === null) return rows;
  requireResolvableLane(scope);
  if (table === 'quick_fixes') {
    await assertLaneUnambiguous(supabase, table, scope);
    const want = normalizeLane(scope);
    return rows.filter((r) => normalizeLane(r.target_application) === want);
  }
  const want = normalizeLane(scope);
  return rows.filter((r) => normalizeLane(r.target_application) === want);
}

/**
 * computeBeltCensus(supabase, scope) — see module docblock for the full contract.
 *
 * @param {object} supabase
 * @param {string} [scope] - optional bare lane string, reporting/diagnosis only (never consumed
 *   by a gate/dispatch decision); unresolvable scope throws.
 * @returns {Promise<{rows: object[], countsByBucket: Record<string, number>, scannedByKind: {sd:number, qf:number}, totalScanned: number, extentNote: string}>}
 */
async function computeBeltCensus(supabase, scope) {
  if (scope !== undefined && scope !== null) requireResolvableLane(scope);

  const { fetchAllPaginated } = await import('../db/fetch-all-paginated.mjs');

  const [sdRowsRaw, qfRowsRaw] = await Promise.all([
    fetchAllPaginated(() => supabase.from('strategic_directives_v2').select(SD_ELIGIBILITY_COLUMNS)),
    fetchAllPaginated(() => supabase.from('quick_fixes').select(QF_ELIGIBILITY_COLUMNS)),
  ]);

  const sdNonTerminal = (sdRowsRaw || []).filter((r) => {
    if (!SD_VALID_STATUSES.has(r.status)) {
      throw new Error(`computeBeltCensus: unrecognized SD status '${r.status}' on ${r.sd_key || r.id} — not in the normative status matrix, refusing to silently include/exclude it.`);
    }
    return !SD_TERMINAL_STATUSES.has(r.status);
  });
  const qfNonTerminal = (qfRowsRaw || []).filter((r) => {
    if (!QF_VALID_STATUSES.has(r.status)) {
      throw new Error(`computeBeltCensus: unrecognized QF status '${r.status}' on ${r.id} — not in the normative status matrix, refusing to silently include/exclude it.`);
    }
    return !QF_TERMINAL_STATUSES.has(r.status);
  });

  const sdScoped = await resolveScopedRows(supabase, scope, 'strategic_directives_v2', sdNonTerminal);
  const qfScoped = await resolveScopedRows(supabase, scope, 'quick_fixes', qfNonTerminal);

  // Build ctx ONCE per call — never per row.
  const inflightSnapshot = getInflightSnapshot();
  const coordinatorId = await getActiveCoordinatorId(supabase);
  const reservations = await fetchActiveReservationsMap(supabase, coordinatorId);
  const ctx = { inflight_git_state: inflightSnapshot, reservations };

  const rows = [];
  const countsByBucket = Object.fromEntries(BUCKETS.map((b) => [b, 0]));

  for (const sd of sdScoped) {
    const axes = classifyAllDispatchIneligibility(sd, ctx);
    // draftDepsSatisfied short-circuits before any query when a row carries no dependency refs
    // (belt-depth.cjs's own cost note) — mirrors belt-depth.cjs's SD dep-gate call exactly.
    const depsSatisfied = await draftDepsSatisfied(supabase, sd, { throwOnError: true });
    if (!depsSatisfied) axes.push('dep_blocked');
    if (await parentLeadPending(supabase, sd)) axes.push('parent_lead_pending');
    const holdProvenance = resolveHoldProvenance(sd.metadata);
    const row = {
      kind: 'sd',
      key: sd.sd_key,
      id: sd.id,
      status: sd.status,
      bucket: bucketFor({ kind: 'sd', status: sd.status }, axes, holdProvenance),
      gate_reason: null,
      axes,
    };
    if (row.bucket === 'gated') row.gate_reason = holdProvenance ? holdProvenance.reason : (axes.includes('dep_blocked') ? 'dep_blocked' : 'parent_lead_pending');
    rows.push(row);
    countsByBucket[row.bucket] += 1;
  }

  for (const qf of qfScoped) {
    const axes = classifyAllDispatchIneligibility(qf, ctx);
    const holdProvenance = resolveQfHoldProvenance(qf);
    const row = {
      kind: 'qf',
      key: qf.id,
      id: qf.id,
      status: qf.status,
      bucket: bucketFor({ kind: 'qf', status: qf.status }, axes, holdProvenance),
      gate_reason: null,
      axes,
    };
    if (row.bucket === 'gated') row.gate_reason = holdProvenance ? holdProvenance.reason : null;
    rows.push(row);
    countsByBucket[row.bucket] += 1;
  }

  const scannedByKind = { sd: sdScoped.length, qf: qfScoped.length };
  const totalScanned = scannedByKind.sd + scannedByKind.qf;
  const extentNote = `of ${scannedByKind.sd} non-terminal SDs and ${scannedByKind.qf} non-terminal QFs scanned`;

  return { rows, countsByBucket, scannedByKind, totalScanned, extentNote };
}

module.exports = {
  computeBeltCensus,
  bucketFor,
  formatComplementProse,
  BUCKETS,
  SD_TERMINAL_STATUSES,
  SD_VALID_STATUSES,
  QF_TERMINAL_STATUSES,
  QF_VALID_STATUSES,
};
