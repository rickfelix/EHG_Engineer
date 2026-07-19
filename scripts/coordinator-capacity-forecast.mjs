#!/usr/bin/env node
/**
 * coordinator-capacity-forecast.mjs — proactive worker-utilization + belt-depth forecaster.
 *
 * WHY (operator directive 2026-06-10): "track the productivity of each worker and always have a
 * sense of how busy they are, and gauge at what point they will be ready for more work, so the belt
 * always has additional work to distribute. If you see a point where workers are going to run out of
 * work, that's when you reach out to Adam — that should be part of your protocol as coordinator."
 *
 * This closes the gap the coordinator kept hitting: REACTING to an already-idle worker instead of
 * FORECASTING the dry-out and refilling the belt ahead of need. It is the 5th SRE gauge made active.
 *
 * What it does each run:
 *   1. Per-worker productivity — for every live builder: current claim(s), phase, progress, and an
 *      ETA-to-free estimate (phase-median model). Idle workers are classified building/idle/STALLED.
 *   2. Belt depth — counts TRULY-claimable SDs (unmet_deps=0, unclaimed, non-parent, non-terminal).
 *   3. Demand forecast — idle-now + workers-freeing-soon (ETA-to-free <= HORIZON or progress>=65%).
 *   4. Verdict — SURPLUS / TIGHT / DEFICIT. On a predicted DEFICIT it reaches out to Adam for a
 *      sourcing shortlist (with --dispatch), respecting a cooldown so it never spams.
 *
 * Read-only by default. Pass --dispatch to actually send the Adam source_work request when a deficit
 * is forecast (cooldown via .coord-capacity-source-last.json, default 30m, override --cooldown-min N).
 * Pure-ish: all side effects are the optional Adam dispatch + the cooldown stamp file.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'module';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
// SD-FDBK-INFRA-BACKLOG-RANK-EXCLUSION-001: shared belt-exclusion predicate so test/UAT
// fixtures AND bare-shell stubs (neither can pass LEAD-TO-PLAN) never inflate belt depth —
// counting them as claimable over-reports capacity and suppresses the deficit/Adam alert.
import { isExcludedFromBelt } from '../lib/coordinator/sd-exclusion.mjs';
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';
import { stampLastFired } from '../lib/periodic-liveness/stamp-last-fired.js';
// SD-LEO-INFRA-BACKLOG-RANK-CLAIMABLE-ELIGIBILITY-ALIGN-001: the forecaster builds its OWN claimable
// belt (it does not read the ranker's dispatch_rank), so it must apply the SAME shared claim-eligibility
// predicate the worker resolver uses — else RHA-held / co_author_pending SDs inflate belt depth and the
// forecaster emits false belt-low DEFICITs (the exact masked-starvation symptom this SD targets).
import { classifyDispatchIneligibility } from '../lib/fleet/claim-eligibility.cjs';
// SD-LEO-INFRA-BELT-TIER-AWARE-CLAIMABILITY-001 (FR-3): per-tier claimable depth (not a single aggregate).
import { tierClaimableBreakdown } from '../lib/fleet/tier-claimable.cjs';
import { isTieringActive } from '../lib/fleet/tier-ladder.cjs';
// SD-LEO-INFRA-FORECASTER-FIXTURE-WORKER-EXCLUSION-001: the pure live-worker predicate. It wraps the
// canonical isDispatchableFleetMember SSOT the dashboard uses (so the forecaster AGREES with
// fleet-dashboard.cjs on coordinator/adam/non_fleet/fixture exclusion) and ADDS a released-status
// guard (FR-2; the forecaster is deliberately stricter than the dashboard on status).
import { isLiveCountableWorker } from './lib/live-countable-worker.mjs';
// SD-LEO-INFRA-COORDINATOR-SOURCING-ENGINE-AWARENESS-001 (FR-2): surface the sourcing-engine
// flag state + unpromoted roadmap depth so a belt-low/DEFICIT ping says "engine OFF, N unpromoted
// -> activate/distill" instead of only "source N candidates" (manual backfill is the anti-pattern).
import { readSourcingEngineFlagsFromDb, formatSourcingAwareness, classifyCorpusGatedDeficit } from './lib/sourcing-engine-awareness.mjs';
// SD-LEO-INFRA-COORDINATOR-MATERIALIZE-QUEUE-BEFORE-SOURCE-001: prefer draining the un-materialized
// adam-prop proposal queue (proposed_sd_key NOT IN strategic_directives_v2) over pinging Adam for more.
import { scanPendingProposals, drainPendingProposals, shouldMaterializeBeforeSource, formatPendingSummary } from '../lib/coordinator/pending-proposals-gauge.mjs';
// SD-LEO-FEAT-COORDINATOR-CAPACITY-FORECAST-001: stall detection is DELEGATED to the canonical
// detectStalledLoop SSOT (lib/coordinator/detectors.cjs), the same detector coordinator-audit.mjs uses.
// The forecast previously ran its own heartbeat-AGE rule (classifyIdleWorker, ttl 180s), but the worker
// fetch only admits sessions with a heartbeat within HEARTBEAT_LIVE_MS (5min), so an age-vs-low-ttl rule
// could only ever fire inside the 180–300s window — where a worker is still healthy (it re-polls every
// 600–1200s) — making it a pure false-positive generator that could never see a genuinely dead loop
// (those age past the live window). detectStalledLoop uses the correct model: loop_state==='active' +
// no claim + fresh heartbeat + claimable work waiting, while EXCLUDING legitimately-parked workers
// (loop_state 'awaiting_tick' or a future expected_silence_until) — so a healthy idle worker between
// ticks is never flagged. (Belt-empty FP from SD-LEO-INFRA-CAPACITY-FORECAST-STALLED-BELT-EMPTY-FP-001
// is preserved: detectStalledLoop returns no_unclaimed_work when the belt is empty.)

const require = createRequire(import.meta.url);
const { insertCoordinationRow } = require('../lib/coordinator/dispatch.cjs');
const { stalledLoopSessionIds, maskedStallSessionIds } = require('../lib/coordinator/detectors.cjs');
const { getActiveAdamId } = require('../lib/coordinator/adam-identity.cjs');

// SD-FDBK-INFRA-STALL-AFTER-COMPLETION-001 — DORMANT BY DEFAULT. Adversarial validation
// (sub_agent_execution_results b71d405b) empirically found process_alive_at is currently
// "fleet-broken": the detached session-tick is not running for most workers, so a STALE
// process_alive_at is the NORMAL state of a HEALTHY worker, not proof of a dead loop. Keying the
// masked-stall detector on it today would mostly emit FALSE POSITIVES (a healthy just-completed
// worker: active + no claim + fresh hb + stale tick). The detector + surface are shipped and
// tested, but gated OFF until session-tick reliability is restored (or a second liveness witness
// is added). Flip LEO_MASKED_STALL_DETECT=on once process_alive_at is trustworthy.
const MASKED_STALL_DETECT_ON = process.env.LEO_MASKED_STALL_DETECT === 'on';
// SD-LEO-INFRA-FORECASTER-FIXTURE-WORKER-EXCLUSION-001: resolve the active coordinator id so the
// shared isDispatchableFleetMember excludes the coordinator by id exactly like the dashboard does.
const { getActiveCoordinatorId } = require('../lib/coordinator/resolve.cjs');
// SD-LEO-INFRA-FORECASTER-DEP-SENTINEL-BELTDEPTH-001: resolve dependency keys via the canonical
// blocker rule (lib/utils/parse-sd-dependencies.cjs, same SSOT coordinator-audit.mjs uses) instead of
// a hand-rolled resolver. parseSdDependencies counts ONLY /^SD-/ entries as real blockers, so the
// documented 'no dependencies' sentinel ({sd_key:'none'} / bare 'none') and free-text placeholders
// resolve to zero blockers — a freshly-sourced SD is no longer mis-counted out of belt depth.
const { parseSdDependencies } = require('../lib/utils/parse-sd-dependencies.cjs');

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const COOLDOWN_FILE = join(REPO_ROOT, '.coord-capacity-source-last.json');
// SD-FDBK-INFRA-STALL-AFTER-COMPLETION-001: separate cooldown stamp for the masked-stall escalation
// so it does not conflate with the Adam belt-low source_work cooldown.
const MASKED_STALL_COOLDOWN_FILE = join(REPO_ROOT, '.coord-masked-stall-last.json');

// ── tunables ──
const HEARTBEAT_LIVE_MS = 5 * 60 * 1000;   // a session is "live" if it heartbeat within 5 min
const HORIZON_MIN = 20;                      // "freeing soon" = ETA-to-free within this window
const PROGRESS_SOON = 65;                    // ...or overall progress >= this
const BELT_BUFFER = 1;                       // keep at least this many claimable SDs beyond demand
// phase-median minutes (infrastructure-weighted; from coordinator.md fleet-eta reference table)
// SD-LEO-INFRA-FLEET-DIAL-TOKEN-EFFORT-BUILD-001: static fallback (renamed _STATIC). The dial now
// prefers a rolling per-phase actuals feed (computePhaseMinsFromActuals) and falls back to these
// when actuals are insufficient — it never silently degrades.
export const PHASE_MIN_STATIC = { LEAD: 3, PLAN: 12, EXEC: 30, FINAL: 5 };
const TOTAL_MIN_STATIC = PHASE_MIN_STATIC.LEAD + PHASE_MIN_STATIC.PLAN + PHASE_MIN_STATIC.EXEC; // ~45m fresh SD

const argv = process.argv.slice(2);
const DISPATCH = argv.includes('--dispatch');
const cooldownMin = (() => {
  const i = argv.indexOf('--cooldown-min');
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : 30;
})();

const sb = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function normPhase(p) {
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
    const { data: rows, error } = await supabase
      .from('sub_agent_execution_results')
      .select('sd_id, phase, execution_time, created_at')
      .gte('created_at', sinceIso)
      .not('execution_time', 'is', null)
      .order('created_at', { ascending: false })
      .limit(ACTUALS_ROW_CAP);
    if (error || !Array.isArray(rows) || !rows.length) return null;
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

async function main() {
  const liveCutoff = new Date(Date.now() - HEARTBEAT_LIVE_MS).toISOString();
  const [{ data: sessions }, { data: sds }, { data: openQfRows }] = await Promise.all([
    sb.from('claude_sessions')
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
      .gte('heartbeat_at', liveCutoff),
    sb.from('strategic_directives_v2')
      // SD-FDBK-INFRA-BACKLOG-RANK-EXCLUSION-001: + metadata (is_fixture marker) and
      // title/description (bare-shell detection) so excluded rows do not inflate belt depth.
      // SD-REFILL-00306WTS: + target_application so un-actionable auto-filed venture remediation
      // SDs (target_application != EHG_Engineer) are excluded from belt depth (false-SURPLUS fix).
      .select('sd_key, title, description, status, sd_type, current_phase, progress_percentage, claiming_session_id, dependencies, metadata, target_application')
      .not('status', 'in', '("completed","cancelled","deferred")'),
    // Open QFs are claimable belt too (a worker can claim a QF) — counting only SDs
    // under-reports belt depth and over-reports deficit (workers self-claim QFs).
    sb.from('quick_fixes').select('id').eq('status', 'open'),
  ]);
  const openQfCount = Array.isArray(openQfRows) ? openQfRows.length : 0;

  // ── resolve dependency statuses → claimable belt ──
  // parseSdDependencies handles the live shape mix ([{sd_id}], [{sd_key}], raw strings) AND drops the
  // 'none' sentinel + free-text non-SD placeholders, returning only real /^SD-/ blocker keys.
  const depKeys = new Set();
  (sds || []).forEach(d => parseSdDependencies(d.dependencies).forEach(k => depKeys.add(k)));
  let depStatus = {};
  if (depKeys.size) {
    const { data: deps } = await sb.from('strategic_directives_v2').select('sd_key,status').in('sd_key', Array.from(depKeys));
    (deps || []).forEach(d => { depStatus[d.sd_key] = d.status; });
  }
  const claimable = [];
  const claimsBySession = {};
  let beltExcludes = 0;
  let ineligibleExcludes = 0;
  for (const d of (sds || [])) {
    if (d.claiming_session_id) {
      (claimsBySession[d.claiming_session_id] ||= []).push(d);
      continue;
    }
    // SD-FDBK-INFRA-BACKLOG-RANK-EXCLUSION-001: fixtures and bare-shell stubs are not real
    // belt — neither can pass LEAD-TO-PLAN. Excluding them keeps beltDepth honest so a
    // forecast deficit (and the proactive Adam reach-out) is not masked by non-distributable rows.
    if (isExcludedFromBelt(d)) { beltExcludes++; continue; }
    // SD-LEO-INFRA-BACKLOG-RANK-CLAIMABLE-ELIGIBILITY-ALIGN-001: apply the SHARED claim-eligibility
    // predicate (the SSOT the worker resolver uses) so belt depth == actually-claimable depth. Catches
    // orchestrator_parent, human_action_required (the previously-missing axis), co_author_pending,
    // sd_deferred, sd_terminal, test_fixture_key. Without this the forecaster over-counted RHA-held +
    // co-author-pending SDs and fired false belt-low DEFICITs that masked genuine starvation.
    const ineligible = classifyDispatchIneligibility(d);
    if (ineligible) {
      ineligibleExcludes++;
      console.log(`  [belt-skip] ${ineligible} (not worker-claimable): ${d.sd_key}`);
      continue;
    }
    const unmet = parseSdDependencies(d.dependencies).filter(k => depStatus[k] !== 'completed');
    if (unmet.length === 0) claimable.push(d);
  }
  if (beltExcludes) console.log(`[CAPACITY-FORECAST] ${beltExcludes} non-distributable SD(s) (fixture/bare-shell/un-actionable-venture-remediation) excluded from belt depth`);
  if (ineligibleExcludes) console.log(`[CAPACITY-FORECAST] ${ineligibleExcludes} dispatch-ineligible SD(s) (human-action/orchestrator/co-author-pending/deferred/terminal) excluded from belt depth (claim-eligibility SSOT)`);

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
  const now = Date.now();
  const stalledIds = stalledLoopSessionIds({
    sessions: workers, unclaimedItems: claimable.length + openQfCount, now,
  });
  // SD-FDBK-INFRA-STALL-AFTER-COMPLETION-001: the CONFIRMED (dead-tick) subset — a fresh heartbeat
  // masking a dead loop. DORMANT until process_alive_at is trustworthy (see MASKED_STALL_DETECT_ON):
  // an empty Set when the flag is off → no MASKED-STALL rendering, no escalation, zero false-positive
  // noise. The detector remains exported + unit-tested for activation.
  const maskedIds = MASKED_STALL_DETECT_ON
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

  const demandSoon = idleNow + freeingSoon;
  const beltDepth = claimable.length + openQfCount; // claimable SDs + open QFs (both worker-claimable)
  const deficit = (demandSoon + BELT_BUFFER) - beltDepth;
  let verdict;
  if (beltDepth === 0 && idleNow > 0) verdict = 'DEFICIT-URGENT';
  else if (deficit > 0) verdict = 'DEFICIT';
  else if (deficit === 0) verdict = 'TIGHT';
  else verdict = 'SURPLUS';

  // ── render ──
  const ts = new Date().toISOString();
  console.log(`[CAPACITY-FORECAST] ${ts}`);
  console.log(`  workers: ${workers.length} live  |  building ${building}  |  idle ${idleNow}${stalled ? ` (${stalled} STALLED)` : ''}  |  freeing-soon ${freeingSoon}`);
  for (const r of rows) {
    console.log(`    ${r.sess} ${String(r.callsign).padEnd(8)} ${r.state.padEnd(13)} ${r.eta.padEnd(18)} ${r.detail}`);
  }
  console.log(`  BELT: ${beltDepth} claimable (${claimable.length} SD + ${openQfCount} QF)  |  DEMAND(soon): ${demandSoon} (idle ${idleNow} + freeing-soon ${freeingSoon})  |  buffer ${BELT_BUFFER}`);
  if (claimable.length) console.log(`        claimable SDs: ${claimable.map(d => d.sd_key.replace('SD-LEO-INFRA-', '')).join(', ')}`);

  // SD-LEO-INFRA-BELT-TIER-AWARE-CLAIMABILITY-001 (FR-3): TRUE per-tier claimable depth so a tier-specific
  // deficit (e.g. "tier-3 claimable: 0") is explicit, not masked by the aggregate above. `claimable` is
  // already base-eligible => preFiltered. The exact-rank partition (incl. unscored / above-top) sums to the
  // aggregate as a self-check; the cumulative is what a worker AT that rung can actually claim. Fail-open
  // (non-blocking) so a tier-rollup fault never breaks the forecast. Counts SDs only (QFs are tier-agnostic).
  try {
    const tieringActive = await isTieringActive(sb);
    const bd = tierClaimableBreakdown(claimable, { tieringActive, preFiltered: true });
    const exactStr = Object.keys(bd.exact).map((r) => `T${r}:${bd.exact[r]}`).join(' ');
    const cumStr = Object.keys(bd.cumulative).map((r) => `≤T${r}:${bd.cumulative[r]}`).join(' ');
    console.log(`  BELT-BY-TIER: ${tieringActive ? 'tiering ON' : 'tiering OFF (degrade-to-1: every rung sees the full aggregate)'}`);
    console.log(`        exact-rank partition: ${exactStr}${bd.unscored ? ` unscored:${bd.unscored}` : ''}${bd.aboveTop ? ` above-top:${bd.aboveTop}` : ''}  (sum=${bd.aggregate}${bd.partitionSumsToAggregate ? ' ✓' : ' ✗DRIFT'})`);
    console.log(`        claimable-to-tier (cumulative): ${cumStr}`);
    if (tieringActive) {
      const zeroTiers = Object.keys(bd.cumulative).filter((r) => bd.cumulative[r] === 0);
      if (zeroTiers.length && bd.aggregate > 0) {
        console.log(`        ⚠ tier deficit: rung(s) ${zeroTiers.map((r) => `T${r}`).join(', ')} have 0 claimable — a worker at that rung idles while belt shows ${bd.aggregate}`);
      }
    }
  } catch (e) {
    console.log(`  BELT-BY-TIER: unavailable (non-blocking): ${e?.message || e}`);
  }

  // SD-LEO-INFRA-COORDINATOR-SOURCING-ENGINE-AWARENESS-001 (FR-2): sourcing-engine awareness — flag
  // state + unpromoted roadmap depth so belt-low is read as "activate/distill" before "hand-ask Adam".
  // SD-LEO-INFRA-SOURCING-FLAG-STATE-FROM-DEPLOYMENT-001 (FR-1): derive arm state from the DB
  // source-of-truth (the actual deployment), not the coordinator's local process.env — which is
  // blind to the GitHub-Actions job-scoped sourcing flags. The reader fails open to env on error.
  const sourcingFlags = await readSourcingEngineFlagsFromDb(sb, process.env);
  const unpromotedCount = await countUnpromotedRoadmapItems(sb);
  const awareness = formatSourcingAwareness({ flags: sourcingFlags, unpromotedCount });
  console.log(`  SOURCING: ${awareness.line}`);

  // SD-LEO-INFRA-FORECASTER-DISTILL-GATE-AWARENESS-001 (FR-1/FR-2): when the auto-refill arm is
  // intentionally OFF, a corpus-thin belt-low is the CORRECT state — NOT a fillable deficit. Reframe the
  // recommendation (advise NEITHER distill NOR activate) and downgrade the verdict so the deficit-driven
  // Adam reach-out below (gated on verdict.startsWith('DEFICIT')) does not stale-re-fire every tick. A
  // genuine non-corpus shortfall (no unpromoted corpus, or auto-refill ON) is left as a real DEFICIT.
  const autoRefillOn = sourcingFlags.find((f) => f.label === 'auto-refill')?.enabled === true;
  const corpusGate = classifyCorpusGatedDeficit({ verdict, autoRefillOn, unpromotedCount, baseRecommendation: awareness.recommendation });
  if (corpusGate.corpusGated) {
    console.log(`  CORPUS-GATED: ${corpusGate.recommendation}`);
  }
  verdict = corpusGate.verdict;
  const recommendation = corpusGate.recommendation;

  // SD-LEO-INFRA-COORDINATOR-MATERIALIZE-QUEUE-BEFORE-SOURCE-001 (FR-1): gauge the un-materialized
  // Adam proposal queue at the same awareness seam. If belt-low supply already exists un-materialized,
  // prefer MATERIALIZE over a fresh source_request (closes the false-DEFICIT ping loop).
  let pendingScan = { pendingCount: 0, freshKeys: [], staleKeys: [], scanned: 0, freshProposals: [] };
  try {
    pendingScan = await scanPendingProposals({ supabase: sb });
  } catch (e) {
    console.log(`  PENDING: scan failed (non-blocking): ${e?.message || e}`);
  }
  console.log(`  PENDING: ${formatPendingSummary(pendingScan)}`);

  console.log(`  VERDICT: ${verdict}` + (deficit > 0 ? `  → belt short by ${deficit} — ${recommendation}` : ''));

  // ── proactive Adam reach-out on a forecast deficit ──
  if (verdict.startsWith('DEFICIT')) {
    // SD-LEO-INFRA-COORDINATOR-MATERIALIZE-QUEUE-BEFORE-SOURCE-001 (FR-1/FR-2): drain BEFORE source.
    // When un-materialized FRESH proposals already exist, materialize them via the canonical
    // idempotent --from-proposal path and SUPPRESS the Adam ping (Adam already produced the supply;
    // asking for more is the false-DEFICIT loop). Stale proposals are skipped, not mass-materialized.
    if (shouldMaterializeBeforeSource(pendingScan)) {
      if (!DISPATCH) {
        console.log(`  ACTION: deficit, but ${pendingScan.freshKeys.length} FRESH un-materialized proposal(s) exist — run with --dispatch to MATERIALIZE the queue instead of pinging Adam (stale ${pendingScan.staleKeys.length} skipped).`);
      } else {
        const drain = await drainPendingProposals({ freshProposals: pendingScan.freshProposals });
        console.log(`  ACTION: ✅ MATERIALIZE-before-source — drained pending queue: materialized ${drain.materialized}, skipped-existing ${drain.skippedExisting}, skipped-stale ${pendingScan.staleKeys.length}, failed ${drain.failed}. Adam ping SUPPRESSED; re-assess next tick.`);
      }
    } else {
    const cd = readCooldown();
    const since = cd ? (Date.now() - cd.at) / 60000 : Infinity;
    // SD-REFILL-00G39SZT: fingerprint the belt-dry state so an UNCHANGED deficit self-suppresses
    // (saturation-ack) until a supply-change signal, instead of re-pinging Adam every cooldown.
    const currentFp = deficitFingerprint({ verdict, beltDepth, deficit, claimable });
    const decision = shouldPingAdam({ cd, sinceMin: since, cooldownMin, currentFp });
    if (!DISPATCH) {
      console.log(`  ACTION: deficit forecast — run with --dispatch to auto-request a sourcing shortlist from Adam (cooldown ${cooldownMin}m; last ${cd ? since.toFixed(0) + 'm ago' : 'never'}).`);
    } else if (decision.reason === 'cooldown') {
      console.log(`  ACTION: deficit, but Adam was pinged ${since.toFixed(0)}m ago (< ${cooldownMin}m cooldown) — holding.`);
    } else if (decision.reason === 'saturation-unchanged') {
      console.log(`  ACTION: deficit unchanged since last ping (same belt-dry state, no supply change) — suppressing duplicate Adam ping until supply changes.`);
    } else {
      const sent = await reachAdam({ verdict, beltDepth, demandSoon, idleNow, freeingSoon, deficit, claimable, rows, awareness });
      if (sent) { writeCooldown(currentFp); console.log('  ACTION: ✅ sourcing request dispatched to Adam (cooldown started).'); }
      else console.log('  ACTION: ⚠ no live Adam session found to reach — surface to operator.');
    }
    } // end else (no fresh pending proposals → normal Adam-ping path)
  }

  // ── SD-FDBK-INFRA-STALL-AFTER-COMPLETION-001: masked-stall escalation ──
  // A CONFIRMED dead loop (fresh parent, dead tick) holding no claim while ranked work waits cannot
  // self-revive, and the coordinator cannot re-arm a worker's /loop — only the operator can re-paste.
  // Turn the previously stdout-only advisory into a DURABLE, cooldowned escalation so the operator is
  // actually alerted. Read-only by default; emit gated behind --dispatch (mirrors the Adam reach-out).
  if (maskedIds.size > 0 && beltDepth > 0) {
    const maskedRows = rows.filter(r => r.state.startsWith('MASKED-STALL'));
    const who = maskedRows.map(r => `${r.callsign}/${r.sess}`).join(', ');
    const cd = readMaskedCooldown();
    const since = cd ? (Date.now() - cd.at) / 60000 : Infinity;
    if (!DISPATCH) {
      console.log(`  ACTION: ${maskedIds.size} MASKED-STALL worker(s) [${who}] — confirmed dead loop holding no claim while ${beltDepth} ranked item(s) wait. Run with --dispatch to emit a durable operator re-paste escalation (cooldown ${cooldownMin}m; last ${cd ? since.toFixed(0) + 'm ago' : 'never'}).`);
    } else if (since < cooldownMin) {
      console.log(`  ACTION: ${maskedIds.size} MASKED-STALL worker(s), but escalation was emitted ${since.toFixed(0)}m ago (< ${cooldownMin}m cooldown) — holding.`);
    } else {
      const emitted = await emitMaskedStallEscalation({ who, count: maskedIds.size, beltDepth, claimable });
      if (emitted) { writeMaskedCooldown(); console.log('  ACTION: ✅ masked-stall operator escalation emitted (cooldown started).'); }
      else console.log('  ACTION: ⚠ masked-stall escalation emit failed — surface to operator.');
    }
  }

  // machine-readable last line for the cron/log (+ sourcing-engine awareness fields, FR-2)
  console.log(`  GAUGE belt=${beltDepth} idle=${idleNow} freeing_soon=${freeingSoon} demand=${demandSoon} deficit=${Math.max(0, deficit)} verdict=${verdict} masked_stall=${maskedIds.size} engine_on=${awareness.anyOn} unpromoted=${awareness.countStr}`);

  try {
    await stampLastFired(sb, 'standard_loop:capacity-forecast');
  } catch (err) {
    console.error(`[capacity-forecast] stampLastFired failed (non-fatal): ${err.message}`);
  }
}

function readMaskedCooldown() {
  try { return existsSync(MASKED_STALL_COOLDOWN_FILE) ? JSON.parse(readFileSync(MASKED_STALL_COOLDOWN_FILE, 'utf8')) : null; }
  catch { return null; }
}
function writeMaskedCooldown() {
  try { writeFileSync(MASKED_STALL_COOLDOWN_FILE, JSON.stringify({ at: Date.now(), iso: new Date().toISOString() })); } catch {}
}

// Emit ONE durable escalation row for confirmed masked-stalled workers, TARGETED AT ADAM — the
// escalation aggregation point + designated HITL who triages what reaches the chairman/operator (a
// worker cannot self-revive and the coordinator cannot re-arm a /loop, so a human must re-paste).
// insertCoordinationRow requires a valid full-UUID target, so we resolve the live Adam session.
// Fail-soft: no Adam session / any error returns false (the forecast never throws on this path).
async function emitMaskedStallEscalation(f) {
  try {
    // Canonical fresh-Adam election (freshness floor included) — never target a stale/dead Adam inbox.
    const adamId = await getActiveAdamId(sb);
    if (!adamId) return false; // no live Adam → caller logs "surface to operator"
    const correlation_id = `masked-stall-${Date.now()}`;
    const body = [
      `[COORD->ADAM] MASKED-STALL: ${f.count} worker(s) [${f.who}] have a CONFIRMED dead /loop — fresh heartbeat (parent alive) but a dead session-tick (process_alive_at stale), holding NO claim while ${f.beltDepth} ranked item(s) wait.`,
      `These workers cannot self-revive and the coordinator cannot re-arm a /loop. ACTION: surface to the operator to re-paste the /loop (or /checkin) wake prompt into those windows, or let the staleness sweep recycle them.`,
      `Claimable now: ${f.claimable.map(d => d.sd_key.replace('SD-LEO-INFRA-', '')).join(', ') || 'NONE'}.`,
    ].join('\n');
    const res = await insertCoordinationRow(sb, {
      message_type: 'INFO',
      sender_session: process.env.CLAUDE_SESSION_ID,
      target_session: adamId,
      subject: `[COORD->ADAM] MASKED-STALL — ${f.count} dead loop(s) blocking ${f.beltDepth} ranked item(s)`,
      payload: { kind: 'coordinator_alert', topic: 'masked_stall', correlation_id, body, masked_count: f.count, belt_depth: f.beltDepth },
    });
    return !res.error;
  } catch {
    return false;
  }
}

// SD-LEO-INFRA-COORDINATOR-SOURCING-ENGINE-AWARENESS-001 (FR-2): unpromoted roadmap depth.
// SD-LEO-INFRA-PLAN-OF-RECORD-REMAINDER-VIEW-001: repointed from an unscoped
// roadmap_wave_items count (which aggregated ALL wave generations, including dead
// proposed/archived ones) to v_plan_of_record_remainder (approved-wave-only, stamped
// remainder_state). "Unpromoted" here now means the true remainder — promotable_now |
// gated_on_chairman | in_flight_or_sequence_blocked — excluding satisfied_elsewhere/void.
// A column-select (not count/head) is used deliberately: PostgREST HEAD/count queries
// return error=null even for a nonexistent view, which would have silently reported 0
// instead of failing loud. fetchAllPaginated range-pages the read so the count itself
// never silently truncates at PostgREST's 1000-row cap either -- the exact live incident
// this SD exists to fix (a gauge read "1000" while the true count was 1495).
// Fail-soft: any error (view absent/unreadable) → null ("unknown"), never throws or blocks the forecast.
async function countUnpromotedRoadmapItems(client) {
  try {
    const rows = await fetchAllPaginated(() =>
      client
        .from('v_plan_of_record_remainder')
        .select('id, remainder_state')
        .in('remainder_state', ['promotable_now', 'gated_on_chairman', 'in_flight_or_sequence_blocked']));
    return rows.length;
  } catch {
    return null;
  }
}

function readCooldown() {
  try { return existsSync(COOLDOWN_FILE) ? JSON.parse(readFileSync(COOLDOWN_FILE, 'utf8')) : null; }
  catch { return null; }
}
function writeCooldown(fingerprint) {
  try { writeFileSync(COOLDOWN_FILE, JSON.stringify({ at: Date.now(), iso: new Date().toISOString(), fingerprint: fingerprint ?? null })); } catch {}
}

// SD-REFILL-00G39SZT: saturation-ack suppression. The time cooldown alone re-pings Adam with the
// SAME deficit on an unchanged belt-dry state once it lapses (6+ pings in ~2h after Adam reports
// saturation). A deficit fingerprint identifies the belt-dry STATE — verdict + belt depth + deficit
// magnitude + the (sorted) claimable sd_key set — so the forecaster can self-suppress re-pinging an
// identical deficit until the fingerprint changes (a supply-change signal). Pure (no IO).
export function deficitFingerprint({ verdict, beltDepth, deficit, claimable }) {
  const keys = Array.isArray(claimable)
    ? claimable.map((c) => (c && (c.sd_key || c.sd_id || c.key)) || '').filter(Boolean).sort()
    : [];
  return `${verdict}|belt=${beltDepth}|deficit=${Math.max(0, deficit)}|items=${keys.join(',')}`;
}

// Pure decision for the proactive Adam reach-out. Order: (a) inside the time cooldown -> hold;
// (b) cooldown lapsed but the fingerprint is unchanged from the last ping -> SUPPRESS (saturation:
// same deficit, no supply change); (c) otherwise -> ping. A legacy stamp without a fingerprint is
// treated as changed (one ping re-stamps it). Returns { ping, reason }.
export function shouldPingAdam({ cd, sinceMin, cooldownMin, currentFp }) {
  if (sinceMin < cooldownMin) return { ping: false, reason: 'cooldown' };
  if (cd && cd.fingerprint != null && cd.fingerprint === currentFp) {
    return { ping: false, reason: 'saturation-unchanged' };
  }
  return { ping: true, reason: 'state-changed-or-first' };
}

async function reachAdam(f) {
  const { data: adam } = await sb.from('claude_sessions')
    .select('session_id')
    .filter('metadata->>role', 'eq', 'adam')
    .order('heartbeat_at', { ascending: false })
    .limit(1);
  const adamId = adam && adam[0] && adam[0].session_id;
  if (!adamId) return false;
  const correlation_id = `cap-${Date.now()}`;
  const idleList = f.rows.filter(r => r.state.startsWith('IDLE')).map(r => r.callsign + '/' + r.sess).join(', ') || 'none';
  // SD-LEO-INFRA-PROGRESS-ROLLUP-NEEDLE-PRIORITIZATION-001-C (FR-3): feed rung progress into the Adam
  // sourcing rank — name the active build rung so Adam ranks candidates active-rung-first / highest-
  // impact-on-rung-completion-first. Best-effort: omit the line if the active rung can't be resolved.
  let activeRungKey = null;
  try {
    const r = await sb.from('vision_ladder_rungs').select('rung_key').eq('is_active', true).maybeSingle();
    activeRungKey = r && r.data ? r.data.rung_key : null;
  } catch { activeRungKey = null; }
  const body = [
    `[COORD->ADAM] PREDICTIVE belt-low (capacity forecaster). Verdict=${f.verdict}.`,
    `Belt=${f.beltDepth} claimable vs demand(soon)=${f.demandSoon} (idle ${f.idleNow} + freeing-soon ${f.freeingSoon}) → short by ${f.deficit}.`,
    `Claimable now: ${f.claimable.map(d => d.sd_key.replace('SD-LEO-INFRA-', '')).join(', ') || 'NONE'}. Idle/at-risk workers: ${idleList}.`,
    // SD-LEO-INFRA-COORDINATOR-SOURCING-ENGINE-AWARENESS-001 (FR-2): surface the engine state FIRST so
    // the ask is "activate/distill the engine/roadmap" when it's dormant-with-backlog, NOT perpetual
    // manual sourcing (the anti-pattern). The engine (10/10 children) + roadmap_wave_items are the SSOT.
    f.awareness ? `SOURCING ENGINE FIRST-CHECK: ${f.awareness.line}` : '',
    // SD-LEO-INFRA-ADAM-DURABLE-SOURCE-TRIGGER-001 (FR-3): retarget the belt-low ask at the
    // VISION-ALIGNED weakest capabilities (read the per-capability gauge + mine the dispositioned
    // estate) instead of generic harness-backlog grooming.
    `If the engine is dormant while the roadmap is rich, the remediation is to PROPOSE/co-sponsor ACTIVATION (flip the SOURCING_* flags + apply dormant migrations) and/or Wave-0 distillation, escalating to the chairman — before any manual backfill. Otherwise: READ the per-capability vision gauge + MINE the dispositioned estate for the WEAKEST capabilities, then propose a shortlist of CONFLICT-FREE, non-gated, draft-ready SD candidates that move those weakest capabilities forward (NOT generic harness-backlog grooming), propose-only; I'll dispatch. Dedup vs in-flight + SD-LEO-INFRA-SWEEP-CLAIM-SAFETY-001.`,
    // FR-3 needle-movement: rank the sourcing shortlist by which rung it moves.
    `NEEDLE-MOVEMENT RANK: order the shortlist ACTIVE-RUNG-FIRST${activeRungKey ? ` (active build rung = ${activeRungKey})` : ''}, then highest-impact-on-rung-completion-first — candidates that advance the active rung's weakest capabilities top the list; future-rung work ranks below.`,
    `Reply via adam-advisory (correlation ${correlation_id}).`,
  ].filter(Boolean).join('\n');
  const res = await insertCoordinationRow(sb, {
    message_type: 'INFO',
    sender_session: process.env.CLAUDE_SESSION_ID,
    target_session: adamId,
    subject: `[COORD->ADAM] PREDICTIVE source_work — belt short by ${f.deficit} (${f.verdict})`,
    payload: { kind: 'coordinator_request', topic: 'source_work', expects_reply: true, correlation_id, body, forecast: { belt: f.beltDepth, demand: f.demandSoon, deficit: f.deficit, verdict: f.verdict, sourcing_engine_on: f.awareness ? f.awareness.anyOn : null, unpromoted_roadmap_items: f.awareness ? f.awareness.countStr : null } },
  });
  return !res.error;
}

// SD-REFILL-00G39SZT: guard the entrypoint so importing this module (e.g. unit tests of the pure
// helpers) does not run the DB-touching main(). Only run when invoked directly as the CLI.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(() => { /* natural drain; no process.exit (Windows undici abort) */ })
    .catch(e => { console.error('[CAPACITY-FORECAST] error:', e.message); });
}
