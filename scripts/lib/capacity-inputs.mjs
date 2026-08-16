/**
 * SHARED CAPACITY INPUTS — SD-LEO-INFRA-PERSIST-BELT-CAPACITY-001, FR-3.
 *
 * The four numbers the belt verdict ladder consumes — idleNow, freeingSoon, claimable SDs and open
 * QFs — plus the per-worker rows the forecast renders. EXTRACTED from
 * scripts/coordinator-capacity-forecast.mjs main(). No arithmetic, no predicate and no query
 * changed. The move is the deliverable.
 *
 * ── "VERBATIM" WITH THE THREE EXCEPTIONS NAMED, BECAUSE AN UNQUALIFIED CLAIM INVITES NO CHECK ──
 * Both the REGRESSION and VALIDATION sub-agents diffed this against the pre-extraction original and
 * found the belt derivation byte-identical — the claimable loop, every exclusion predicate, both
 * SELECT column lists, the pagination and its fail-opens, the QF term, the live-worker filter and
 * the ETA/rows loop. Three things did change, none touching belt depth:
 *   1. the signature (`sb` was a module-scope const; it is now injected);
 *   2. `now` moved from a const sampled AFTER the DB round-trips to a parameter sampled before
 *      them. It feeds only the stall detectors, whose thresholds are minute-scale, and it is not
 *      an input to belt depth at all. (`liveCutoff` still calls Date.now() directly, so the
 *      injection is partial — faithful to the original, and worth knowing before relying on it.)
 *   3. MASKED_STALL_DETECT_ON was a module-load const and is now a call-time read. Same value in
 *      production; a PREDICATE'S EVALUATION TIME changed, which is why this file no longer claims
 *      "no predicate changed" flatly. The earlier wording was true of what the predicates DO and
 *      false about when one of them is decided, and that is the kind of overstatement that gets a
 *      reader to stop looking.
 *
 * ── WHY IT MOVED, WHICH IS THE ONLY REASON THIS FILE EXISTS ───────────────────────────────────
 * FR-3 requires scripts/cron/drive-report-sweep.mjs to inject a computeVerdict for leg4, and
 * computeBeltVerdict is pure — it takes counts. So the sweep needs the counts, and there were only
 * ever two ways to get them: re-derive them there, or share the one derivation. Re-deriving would
 * have produced a SECOND belt depth feeding the SAME verdict ladder on a different schedule, and
 * the two would have disagreed the first time either side's exclusion rules changed — which is the
 * precise failure lib/fleet/belt-depth.cjs was written to abolish (read its header: two consumers,
 * two copies of one query, wrong in OPPOSITE directions on the same day).
 *
 * lib/fleet/belt-depth.cjs is NOT the instrument for this, and that was checked rather than assumed:
 * its countDispatchableBacklog filters status='draft', while the forecaster's claimable set is every
 * NON-TERMINAL unclaimed dep-satisfied SD. Those are two different questions with the same name.
 * Using it here would have been a name match standing in for a domain match.
 *
 * ── WHY NOT JUST IMPORT THE FORECAST SCRIPT ───────────────────────────────────────────────────
 * It builds a Supabase client at module scope (coordinator-capacity-forecast.mjs:121). Importing it
 * from the sweep would construct a client as an import side effect — and throw at import time
 * wherever SUPABASE_URL is absent, taking every sweep unit test with it. main() is guarded; the
 * client is not. This module holds no client and reads no argv: the caller passes both.
 */

'use strict';

import { fetchAllPaginated, renderCount } from '../../lib/db/fetch-all-paginated.mjs';
import { isBareShell } from '../../lib/coordinator/sd-exclusion.mjs';
import { parentLeadPendingVerdict } from '../../lib/fleet/claim-eligibility.cjs';
// SD-LEO-INFRA-QF-SUPPLY-PREDICATE-AUTO-START-001 (FR-4): was countClaimableQuickFixes. This
// forecaster answers "how much belt is there for a worker to pick up" — countAutoStartableQuickFixes
// is the reading that matches what a worker's /checkin self-claim loop would actually take (same
// isAutoStartableQF predicate), so the forecast no longer counts stale/factory-lane/chairman-gated/
// risk-flagged QFs no worker could reach. lib/governance/qf-mint-gate.mjs's demand gauge still calls
// countClaimableQuickFixes directly — a different contract (mint-floor supply, not forecast belt) —
// and is untouched by this SD.
import { countAutoStartableQuickFixes } from '../../lib/fleet/belt-depth.cjs';
// SD-LEO-INFRA-CAPACITY-FORECASTER-BELT-001: reuse the ranker's PURE leaf predicates from the
// client-free SSOT so the forecaster belt spans the DISPATCHABLE-leaf extent (what the ranker
// counts as "1 claimable leaf"), not the raw-unclaimed extent. Applied IN-MEMORY on the rows this
// module already fetches — never a second SD-table read or per-child parent fetch.
import { claimableDbFreeReason, blockerKeysFor } from './claimable-leaves.mjs';
import { isLiveCountableWorker } from './live-countable-worker.mjs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { stalledLoopSessionIds, maskedStallSessionIds } = require('../../lib/coordinator/detectors.cjs');
const { getActiveCoordinatorId } = require('../../lib/coordinator/resolve.cjs');
// SD-LEO-INFRA-CAPACITY-FORECASTER-BELT-001: dependency keys now come from the shared blockerKeysFor
// (which folds in metadata.blocked_by_sd_key too) — the bare parseSdDependencies require was dropped.

// SD-FDBK-INFRA-STALL-AFTER-COMPLETION-001 — DORMANT BY DEFAULT. See the forecast script header for
// the full reasoning: process_alive_at is currently fleet-broken, so keying the masked-stall detector
// on it would mostly emit false positives. Read at call time, not at import, so a test can flip it.
const maskedStallDetectOn = () => process.env.LEO_MASKED_STALL_DETECT === 'on';

// ── tunables ──
export const HEARTBEAT_LIVE_MS = 5 * 60 * 1000;   // a session is "live" if it heartbeat within 5 min
export const HORIZON_MIN = 20;                      // "freeing soon" = ETA-to-free within this window
export const PROGRESS_SOON = 65;                    // ...or overall progress >= this
export const BELT_BUFFER = 1;                       // keep at least this many claimable SDs beyond demand
// phase-median minutes (infrastructure-weighted; from coordinator.md fleet-eta reference table)
// SD-LEO-INFRA-FLEET-DIAL-TOKEN-EFFORT-BUILD-001: static fallback (renamed _STATIC). The dial now
// prefers a rolling per-phase actuals feed (computePhaseMinsFromActuals) and falls back to these
// when actuals are insufficient — it never silently degrades.
export const PHASE_MIN_STATIC = { LEAD: 3, PLAN: 12, EXEC: 30, FINAL: 5 };
const TOTAL_MIN_STATIC = PHASE_MIN_STATIC.LEAD + PHASE_MIN_STATIC.PLAN + PHASE_MIN_STATIC.EXEC; // ~45m fresh SD
export function normPhase(p) {
  const u = String(p || '').toUpperCase();
  if (u.includes('EXEC')) return 'EXEC';
  if (u.includes('PLAN')) return 'PLAN';
  if (u.includes('FINAL') || u.includes('VERIF') || u.includes('APPROV')) return 'FINAL';
  return 'LEAD';
}
// ETA-to-free for a single claim: overall-progress-driven remaining of a ~TOTAL_MIN SD, floored.
// SD-LEO-INFRA-FLEET-DIAL-TOKEN-EFFORT-BUILD-001: phaseMinOverride (a { LEAD, PLAN, EXEC, FINAL }
// rolling-actuals object) replaces the static table when provided; null → byte-identical static
// behavior. tMin is derived from the override when present. FINAL branch + Math.max(2,…) floor
// preserved exactly.
export function etaMinForClaim(progress, phase, phaseMinOverride = null) {
  const ph = normPhase(phase);
  const pm = phaseMinOverride || PHASE_MIN_STATIC;
  const tMin = phaseMinOverride ? (pm.LEAD + pm.PLAN + pm.EXEC) : TOTAL_MIN_STATIC;
  if (ph === 'FINAL') return Math.max(2, pm.FINAL * (1 - (progress || 0) / 100));
  const remaining = tMin * (1 - Math.min(99, progress || 0) / 100);
  return Math.max(2, Math.round(remaining));
}

// SD-LEO-INFRA-FLEET-DIAL-TOKEN-EFFORT-BUILD-001: rolling per-phase actuals feed. Aggregates recent
// sub_agent_execution_results (bounded lookback — NOT a full scan of the ~31K-row table) into a
// per-phase median elapsed-minutes for the fleet's dominant sd_type (infrastructure, matching the
// static table's weighting). Returns a { LEAD, PLAN, EXEC, FINAL } object or null when any phase has
// insufficient data → caller falls back to PHASE_MIN_STATIC. Fail-open: any error → null.
const ACTUALS_LOOKBACK_DAYS = 30;
const ACTUALS_ROW_CAP = 4000;          // bounded scan
const ACTUALS_MIN_SAMPLES = 5;         // per-phase minimum SD-phase samples to trust a median
const ACTUALS_SD_TYPE = 'infrastructure';
function _median(nums) {
  if (!nums.length) return null;
  const a = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}
export async function computePhaseMinsFromActuals(supabase) {
  try {
    const sinceIso = new Date(Date.now() - ACTUALS_LOOKBACK_DAYS * 24 * 3600 * 1000).toISOString();
    // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — ACTUALS_ROW_CAP (4000) exceeds
    // the PostgREST max-rows clamp (1000), so the prior `.limit(ACTUALS_ROW_CAP)` never actually
    // returned more than 1000 rows regardless of the declared "up to 4000" sample size. maxRows
    // honors the declared cap for real via genuine pagination.
    const rows = await fetchAllPaginated(() => supabase
      .from('sub_agent_execution_results')
      .select('sd_id, phase, execution_time, created_at')
      .gte('created_at', sinceIso)
      .not('execution_time', 'is', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false }), { maxRows: ACTUALS_ROW_CAP });
    if (!rows.length) return null;
    // Restrict to the dominant sd_type (infrastructure) so the median is apples-to-apples with the
    // static table; resolve sd_type for the distinct sd_ids in the window.
    const sdIds = [...new Set(rows.map((r) => r.sd_id).filter(Boolean))];
    if (!sdIds.length) return null;
    const typeById = new Map();
    for (let i = 0; i < sdIds.length; i += 200) {
      const { data: sds } = await supabase
        .from('strategic_directives_v2')
        .select('id, sd_type')
        .in('id', sdIds.slice(i, i + 200));
      for (const s of (sds || [])) typeById.set(s.id, s.sd_type);
    }
    // Sum execution_time (seconds) per (sd_id, phase) → that SD-phase's elapsed minutes; collect per phase.
    const sumBy = new Map(); // key `${sd_id}|${PHASE}` → seconds
    for (const r of rows) {
      if (typeById.get(r.sd_id) !== ACTUALS_SD_TYPE) continue;
      const ph = normPhase(r.phase);
      const key = `${r.sd_id}|${ph}`;
      sumBy.set(key, (sumBy.get(key) || 0) + (Number(r.execution_time) || 0));
    }
    const perPhase = { LEAD: [], PLAN: [], EXEC: [], FINAL: [] };
    for (const [key, secs] of sumBy) {
      const ph = key.split('|')[1];
      if (perPhase[ph]) perPhase[ph].push(secs / 60);
    }
    const out = {};
    for (const ph of ['LEAD', 'PLAN', 'EXEC', 'FINAL']) {
      if (perPhase[ph].length < ACTUALS_MIN_SAMPLES) return null; // insufficient → fall back to static
      out[ph] = Math.max(1, Math.round(_median(perPhase[ph])));
    }
    return out;
  } catch {
    return null; // fail-open → static
  }
}

/**
 * Gather everything the verdict ladder and the forecast render need, in ONE derivation.
 *
 * @param {object} sb  a Supabase client (never constructed here — see the header)
 * @param {object} [o]
 * @param {number} [o.now] injected clock; the idle-age render and the stall detectors both read it
 * @returns {Promise<object>} counts + the per-worker render rows + the diagnostics the CLI prints
 */
export async function gatherCapacityInputs(sb, { now = Date.now() } = {}) {
  const liveCutoff = new Date(Date.now() - HEARTBEAT_LIVE_MS).toISOString();
  const [sessions, sds, openQfCountRaw] = await Promise.all([
    // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: claude_sessions is a growing
    // table and this read feeds worker-count/capacity math directly (filtered + iterated
    // below) — paginate to completion.
    // QF-20260816-435: the prior `.catch(() => [])` here silently turned a read FAILURE into a
    // read of ZERO live sessions — indistinguishable from "genuinely no workers online" — which
    // fed a manufactured DEFICIT verdict into scoreLeg4, persisted and scored 0/2 (the exact
    // unavailable-vs-zero collapse report-posture.js's header exists to forbid). This read now
    // propagates its throw; scoreCapacityLeg (scripts/cron/drive-report-sweep.mjs) already
    // catches it and reports leg4 unavailable() rather than scoring or persisting anything.
    fetchAllPaginated(() => sb.from('claude_sessions')
      // SD-LEO-INFRA-FORECASTER-FIXTURE-WORKER-EXCLUSION-001: + status so released/terminal sessions
      // are not counted as available workers even with a recent heartbeat (FR-2).
      // SD-LEO-FEAT-COORDINATOR-CAPACITY-FORECAST-001: + expected_silence_until — detectStalledLoop
      // reads it (top-level column) to EXCLUDE legitimately-parked workers. Omitting it makes
      // toMs(undefined)=0 → the parked guard silently fails open → a parked worker is mis-flagged
      // STALLED. Reusing a detector requires replicating its full input-column contract (mirrors the
      // canonical coordinator-audit.mjs select).
      // SD-FDBK-INFRA-STALL-AFTER-COMPLETION-001: + process_alive_at — the authoritative tick-liveness
      // signal (written every 30s by the detached session-tick). detectMaskedStall uses it to tell a
      // CONFIRMED dead loop (live parent / fresh heartbeat but dead tick) from a momentarily-idle one.
      // SD-LEO-INFRA-STALLED-POSTCOMPLETION-TAIL-FP-001: + released_reason,released_at so detectStalledLoop
      // excludes a worker running its post-completion tail (else the per-session stalled mark over-escalates
      // a fleet-down false alarm to the operator). Replicate the detector input-column contract.
      .select('session_id, terminal_id, sd_key, heartbeat_at, process_alive_at, loop_state, expected_silence_until, metadata, status, released_reason, released_at')
      .gte('heartbeat_at', liveCutoff)
      .order('session_id', { ascending: true })), // unique tiebreaker: stable page boundaries (FR-6)
    // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: strategic_directives_v2 is a
    // growing table and this read feeds belt-depth/dependency resolution directly (iterated +
    // acted on below) — paginate to completion.
    // QF-20260816-435: same fix as the sessions read above — a read failure previously became a
    // silent read of ZERO open SDs (indistinguishable from "genuinely no belt"), manufacturing a
    // DEFICIT verdict instead of surfacing as unavailable. Now propagates.
    // SD-FDBK-INFRA-BACKLOG-RANK-EXCLUSION-001: + metadata (is_fixture marker) and
    // title/description (bare-shell detection) so excluded rows do not inflate belt depth.
    // SD-REFILL-00306WTS: + target_application so un-actionable auto-filed venture remediation
    // SDs (target_application != EHG_Engineer) are excluded from belt depth (false-SURPLUS fix).
    fetchAllPaginated(() => sb.from('strategic_directives_v2')
      // SD-LEO-INFRA-CAPACITY-FORECASTER-BELT-001: + id + parent_sd_id so the shared leaf predicates
      // can resolve an orchestrator child's parent IN-MEMORY (parent_sd_id references the parent id or
      // sd_key) without a per-child DB round-trip.
      .select('id, sd_key, title, description, status, sd_type, current_phase, progress_percentage, claiming_session_id, dependencies, metadata, target_application, parent_sd_id')
      .not('status', 'in', '("completed","cancelled","deferred")')
      .order('sd_key', { ascending: true })),
    // Open QFs are claimable belt too (a worker can claim a QF) — counting only SDs
    // under-reports belt depth and over-reports deficit (workers self-claim QFs).
    //
    // SD-LEO-INFRA-GATE-SIDE-BELT-001: this was a local head-count on `status='open'` that IGNORED
    // claiming_session_id, while the SD term ~20 lines below skips claimed rows — one surface, two
    // claimability rules, over-reporting by 3 (148 counted, 145 actually claimable). It then shared
    // the coordinator's QF supply predicate through lib/fleet/belt-depth.cjs.
    //
    // SD-LEO-INFRA-QF-SUPPLY-PREDICATE-AUTO-START-001 (FR-4): now countAutoStartableQuickFixes, the
    // worker-auto-start reading (isAutoStartableQF) rather than the looser coordinator-supply reading
    // — a QF held by staleness/factory-lane/chairman-gate/risk-keyword was still counted as forecast
    // belt before this, over-reporting capacity a worker could never actually claim.
    //
    // FAIL-OPEN IS PRESERVED DELIBERATELY, AND SAID OUT LOUD. countAutoStartableQuickFixes is
    // fail-LOUD by contract, same as countClaimableQuickFixes was, because a gauge that reports 0
    // when it cannot read is indistinguishable from an empty belt. THIS surface has always fallen
    // back to a 0 QF contribution rather than aborting the whole forecast, so the catch keeps that
    // behaviour at the call site where a reader can see it, instead of weakening the shared gauge for
    // every other consumer.
    countAutoStartableQuickFixes(sb).catch(() => null),
  ]);
  const openQfCountRendered = renderCount(openQfCountRaw);
  const openQfCount = typeof openQfCountRendered === 'number' ? openQfCountRendered : 0; // fail-open: unreadable → 0 belt contribution, unchanged from the prior fallback

  // ── resolve dependency statuses → DISPATCHABLE-LEAF belt (SD-LEO-INFRA-CAPACITY-FORECASTER-BELT-001) ──
  // blockerKeysFor is the SAME shared predicate the ranker uses: `dependencies` column PLUS the
  // canonical metadata.blocked_by_sd_key (the forecaster previously read only the top-level column,
  // so metadata-blocked rows leaked onto the belt).
  const byKey = new Map((sds || []).map(d => [d.sd_key, d]));
  const byId = new Map((sds || []).filter(d => d.id != null).map(d => [d.id, d]));
  const depKeys = new Set();
  (sds || []).forEach(d => blockerKeysFor(d).forEach(k => depKeys.add(k)));
  let depStatus = {};
  if (depKeys.size) {
    // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: bounded by design — depKeys is
    // the set of distinct /^SD-/ dependency references parsed from the active-SD set above, an
    // operationally small cardinality (dependency graphs stay in the tens/hundreds, not 1000s).
    const { data: deps } = await sb.from('strategic_directives_v2').select('sd_key,status').in('sd_key', Array.from(depKeys));
    (deps || []).forEach(d => { depStatus[d.sd_key] = d.status; });
  }
  const claimable = [];
  const claimsBySession = {};
  let rawUnclaimed = 0;      // every unclaimed non-terminal row, pre-exclusion — the extent the bug measured
  let beltExcludes = 0;
  let ineligibleExcludes = 0;
  for (const d of (sds || [])) {
    if (d.claiming_session_id) {
      (claimsBySession[d.claiming_session_id] ||= []).push(d);
      continue;
    }
    rawUnclaimed++;
    // ── the DISPATCHABLE-LEAF predicate, shared with the ranker (never a parallel re-count) ──
    // claimableDbFreeReason folds in-flight/started + fixture + un-actionable-venture-remediation +
    // the full classifyDispatchIneligibility axis table (human-action/orchestrator/co-author/deferred/
    // terminal/clone-tree). The forecaster PREVIOUSLY missed the in-flight axis, so started-but-unclaimed
    // SDs read as fresh supply.
    const reason = claimableDbFreeReason(d);
    if (reason && reason !== 'claimed') {
      // Non-distributable stubs vs dispatch-ineligible holds — kept separate for the emitted breakdown.
      if (reason === 'in_flight' || reason === 'fixture' || reason === 'unactionable_venture_remediation') beltExcludes++;
      else ineligibleExcludes++;
      console.log(`  [belt-skip] ${reason} (not dispatchable-leaf): ${d.sd_key}`);
      continue;
    }
    // isBareShell on top: computeClaimableLeaves DEMOTES bare-shell but does not DROP it — the
    // forecaster keeps dropping it (a bare-shell cannot pass LEAD-TO-PLAN), so the forecaster count is
    // a SUBSET of the ranker leaf set. Under-count is the SAFE deficit direction (never masks starvation).
    if (isBareShell(d)) { beltExcludes++; continue; }
    // blockerKeysFor: `dependencies` + metadata.blocked_by_sd_key, resolved against the in-memory
    // non-terminal set (a completed/absent blocker is satisfied).
    const unmet = blockerKeysFor(d).filter(k => (byKey.has(k) ? byKey.get(k).status !== 'completed' : depStatus[k] !== 'completed'));
    if (unmet.length) { ineligibleExcludes++; continue; }
    // Parent-LEAD IN-MEMORY: an orchestrator child whose parent has not passed LEAD is not yet
    // dispatchable. Resolve the parent from the already-fetched non-terminal set (by id or sd_key) and
    // apply the shared pure verdict — no per-child DB round-trip. An absent/terminal parent => not pending.
    if (d.parent_sd_id != null) {
      const parent = byId.get(d.parent_sd_id) || byKey.get(d.parent_sd_id);
      if (parentLeadPendingVerdict(parent)) { ineligibleExcludes++; continue; }
    }
    claimable.push(d);
  }
  if (beltExcludes) console.log(`[CAPACITY-FORECAST] ${beltExcludes} non-distributable SD(s) (in-flight/fixture/bare-shell/un-actionable-venture-remediation) excluded from dispatchable-leaf belt`);
  if (ineligibleExcludes) console.log(`[CAPACITY-FORECAST] ${ineligibleExcludes} dispatch-ineligible SD(s) (human-action/orchestrator/co-author/deferred/terminal/dep-blocked/parent-LEAD) excluded from dispatchable-leaf belt (shared leaf SSOT)`);
  console.log(`[CAPACITY-FORECAST] belt extent=dispatchable-leaf: ${claimable.length} dispatchable of ${rawUnclaimed} raw-unclaimed`);

  // ── classify live workers (exclude coordinator + adam + non_fleet + fixtures + released) ──
  // SD-LEO-INFRA-FORECASTER-FIXTURE-WORKER-EXCLUSION-001: use the canonical isDispatchableFleetMember
  // SSOT (the dashboard's predicate) so a fixture/test session (FR-1) never counts as live idle/at-risk
  // demand; ALSO drop released/terminal sessions (FR-2) which are not available workers even with a
  // recent heartbeat. Keep the metadata.is_coordinator guard so a stale coordinator-marked session is
  // excluded even when it is not the CURRENTLY-active coordinator id.
  let coordinatorId = null;
  try { coordinatorId = await getActiveCoordinatorId(sb); } catch { coordinatorId = null; }
  const workers = (sessions || []).filter(s => isLiveCountableWorker(s, coordinatorId));

  // SD-LEO-FEAT-COORDINATOR-CAPACITY-FORECAST-001: compute the genuinely-stalled idle workers via the
  // canonical detector (loop alive + no claim + claimable work waiting, parked workers excluded). The
  // belt-depth (claimable SDs + open QFs) is the "unclaimed work" input; an empty belt → no stalls.
  const stalledIds = stalledLoopSessionIds({
    sessions: workers, unclaimedItems: claimable.length + openQfCount, now,
  });
  // SD-FDBK-INFRA-STALL-AFTER-COMPLETION-001: the CONFIRMED (dead-tick) subset — a fresh heartbeat
  // masking a dead loop. DORMANT until process_alive_at is trustworthy (see maskedStallDetectOn()):
  // an empty Set when the flag is off → no MASKED-STALL rendering, no escalation, zero false-positive
  // noise. The detector remains exported + unit-tested for activation.
  const maskedIds = maskedStallDetectOn()
    ? maskedStallSessionIds({ sessions: workers, unclaimedItems: claimable.length + openQfCount, now })
    : new Set();

  // SD-LEO-INFRA-FLEET-DIAL-TOKEN-EFFORT-BUILD-001: compute the rolling actuals ONCE per run; null →
  // etaMinForClaim falls back to the static table (no silent degradation).
  // PROBE-REPOINT NOTE (do NOT edit vdr-registry.js in this build): once actuals accrue, the VDR
  // fleet-dial probe in lib/vision/vdr-registry.js should repoint from a code_grep signal to a
  // count_ratio signal measuring how often phaseMinActuals is non-null (the dial is actually fed).
  const phaseMinActuals = await computePhaseMinsFromActuals(sb);

  const rows = [];
  let idleNow = 0, freeingSoon = 0, building = 0, stalled = 0;
  for (const w of workers) {
    const mine = claimsBySession[w.session_id] || [];
    const callsign = (w.metadata && w.metadata.callsign) || '—';
    if (mine.length) {
      building++;
      // multi-claim worker frees only after ALL its claims finish → sum remaining
      const eta = mine.reduce((sum, d) => sum + etaMinForClaim(d.progress_percentage, d.current_phase, phaseMinActuals), 0);
      const soon = eta <= HORIZON_MIN || mine.some(d => (d.progress_percentage || 0) >= PROGRESS_SOON);
      if (soon) freeingSoon++;
      rows.push({
        sess: w.session_id.slice(0, 8), callsign, state: 'BUILDING',
        detail: mine.map(d => `${d.sd_key.replace('SD-LEO-INFRA-', '')}(${normPhase(d.current_phase)} ${d.progress_percentage || 0}%)`).join(' + '),
        eta: `~${eta}m to free${soon ? ' ⏰SOON' : ''}`,
      });
    } else {
      // idle: a healthy idle worker (re-polling on its /loop wake) vs a genuinely stalled loop, per the
      // canonical detectStalledLoop verdict computed above (NOT a raw heartbeat-age threshold).
      idleNow++;
      const hbAgeS = Math.round((now - new Date(w.heartbeat_at).getTime()) / 1000);
      const maskedFlag = maskedIds.has(w.session_id);
      const stalledFlag = stalledIds.has(w.session_id);
      if (stalledFlag) stalled++;
      // MASKED-STALL is the higher-confidence (dead-tick) subset and takes display priority over the
      // generic IDLE⚠STALLED advisory: the loop is CONFIRMED dead (fresh parent, stale tick).
      rows.push({
        sess: w.session_id.slice(0, 8), callsign,
        state: maskedFlag ? 'MASKED-STALL⚠' : stalledFlag ? 'IDLE⚠STALLED' : 'IDLE',
        detail: maskedFlag ? 'tick dead + no claim while ranked work waits — needs /loop re-arm'
          : stalledFlag ? 'alive but loop not claiming (needs /loop re-arm)' : 'available',
        eta: `idle ${hbAgeS}s`,
      });
    }
  }
  return {
    idleNow, freeingSoon, building, stalled,
    claimableCount: claimable.length, openQfCount,
    claimable, rows, workers, claimsBySession,
    maskedIds, stalledIds, phaseMinActuals,
    beltExcludes, ineligibleExcludes,
    // SD-LEO-INFRA-CAPACITY-FORECASTER-BELT-001 (FR-3): NAME the extent + the raw-vs-dispatchable
    // breakdown so a reader (and the persisted verdict detail) can never mistake raw-unclaimed for
    // the dispatchable-leaf belt again. beltExtent labels which extent claimableCount spans.
    beltExtent: 'dispatchable-leaf',
    rawUnclaimed,
    dispatchableCount: claimable.length,
    now,
  };
}
