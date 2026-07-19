#!/usr/bin/env node
/**
 * gauge-runner.mjs — SD-LEO-INFRA-INVARIANT-GAUGES-FRAMEWORK-001 FR-2/FR-3/FR-4.
 *
 * Executes every ENABLED entry in lib/governance/gauge-registry.js, prints a uniform GAUGE line
 * per entry (matching the pre-existing `GAUGE <name>=<value>` convention), and routes a finding to
 * the entry's ownerRole when its threshold trips. Idempotent (safe to re-run — findings are
 * observations, not state mutations) and budget-bounded (MAX_DETECTORS_PER_RUN hard cap).
 * Advisory-only: a single detector throwing is caught, logged, and does NOT fail the run or the
 * exit code — mirrors scripts/gauge-unranked-claimable-leaves.mjs's own exitCode=0-on-transient-
 * error contract.
 *
 * Invariant #0 (who-watches-the-watchmen, FR-4): writes a heartbeat snapshot to
 * codebase_health_snapshots on every successful pass. scripts/coordinator-hourly-review.cjs reads
 * this heartbeat from a SEPARATE, independently-cron'd process and alarms if it goes stale — so a
 * dead runner is externally observable, not a silent false-all-clear.
 *
 * Usage: node scripts/gauge-runner.mjs [--json]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { GAUGE_REGISTRY } from '../lib/governance/gauge-registry.js';
import { computeClaimableLeaves } from './coordinator-backlog-rank.mjs';
import { countUnrankedClaimableLeaves } from './gauge-unranked-claimable-leaves.mjs';
import { checkoutFreshness } from '../lib/governance/checkout-freshness.js';
import {
  PLATFORM_REPOS,
  WITNESS_CUTOVER_ISO,
  defaultFetchMergedPlatformPRs,
  detectUnwitnessedMerges,
  fetchAllWitnessRows,
} from '../lib/ship/witness-adoption.mjs';
import { reconcileUnwitnessedMerges } from './ship-witness-reconcile.mjs';
import { spawnSync } from 'node:child_process';
import {
  detectCoordinatorSourced,
  detectRoleClaimed,
  detectRoleDispatched,
  fetchSdBoundaryRows,
} from '../lib/governance/work-boundary-gauges.js';
import {
  computeRecursionRatio,
  isBandBreach,
  detectSustainedBreach,
  fetchThroughputItems,
  fetchRecentSnapshots,
  writeThroughputSnapshot,
} from '../lib/governance/recursion-governor.js';
import {
  LOOP_IDS as PER_LOOP_HEALTH_LOOP_IDS,
  computeLoopHealth,
  fetchLoopStageRows,
} from '../lib/governance/per-loop-health-gauges.js';
import { getCaptureCompleteness } from '../lib/eva/venture-capture-forward.js';
import { resolveMinExtractStage } from '../lib/eva/template-extractor.js';
import { detectExpiredPremises } from '../lib/governance/revisit-tags.js';
import { readSubstrateRow, computeRunway, periodMonthOf, cashAttestationMissingResult } from '../lib/operator/cash-burn-substrate.js';
import { runRollup } from '../lib/vision/rung-progress-rollup.mjs';
import { computeBuildGauge } from '../lib/vision/vdr-registry.js';
import { makeDefaultGrepSeam } from '../lib/vision/vdr-grep-seam.js';
import { buildSdRungMap } from '../lib/vision/needle-priority.mjs';
import {
  computeStampCoverage,
  computeDispatchMix,
  isDriftBreach,
  fetchLastNDispatchedKeys,
  hasOpenFinding,
} from '../lib/governance/plan-drift-detectors.js';
import { stampLastFired } from '../lib/periodic-liveness/stamp-last-fired.js';
import { checkGhostCeos } from '../lib/agents/ghost-ceo-gauge.js';
import { findOverdueHolds } from '../lib/governance/hold-state-sweep.js';
import { readHoldStateMode } from '../lib/governance/hold-state-contract.js';

const RECURSION_GOVERNOR_DIMENSION = 'recursion-governor-ratio';
const PLAN_DRIFT_MIX_DIMENSION = 'plan-drift-mix';

// relay-drop-gauge.cjs, adam-identity.cjs, solomon-identity.cjs are CommonJS -- createRequire is
// this codebase's established ESM-import-CJS seam (mirrors gauge-unranked-claimable-leaves.mjs's
// own worker-checkin.cjs import).
const require = createRequire(import.meta.url);
const { planRelayDrops } = require('../lib/coordinator/relay-drop-gauge.cjs');
const { fetchAllAdams } = require('../lib/coordinator/adam-identity.cjs');
const { fetchAllSolomons } = require('../lib/coordinator/solomon-identity.cjs');

const JSON_MODE = process.argv.includes('--json');
const MAX_DETECTORS_PER_RUN = 50; // budget-bound: far above the current 3-entry registry, a backstop against runaway growth

const HEARTBEAT_DIMENSION = 'gauge_runner_heartbeat';

/**
 * Pure: shapes a relay-drop-gauge result into the runner's generic {count,...} convention,
 * respecting the module's own RELAY_DROP_GAUGE_V1 kill-switch (result.enabled) — a disabled
 * gauge always reports count:0 rather than routing findings the module itself says are off.
 * @param {{enabled?: boolean, flagged?: number}} result
 * @returns {{count: number}}
 */
export function shapeRelayDropResult(result) {
  return { ...result, count: result?.enabled ? (result.flagged || 0) : 0 };
}

/**
 * Pure: shapes a checkout-freshness verdict into the runner's generic {count,...} convention.
 * count:0 only for VERDICT.FRESH; STALE and STALE-CRITICAL both count as 1 (a single tree is
 * either fresh or it isn't — the verdict field, not count, carries the severity distinction).
 * @param {{verdict?: string}} result
 * @returns {{count: number}}
 */
export function shapeStaleTreeResult(result) {
  return { ...result, count: result?.verdict === 'FRESH' ? 0 : 1 };
}

// SD-LEO-INFRA-ROLE-RUBRIC-SCORE-001 FR-4: default staleness threshold shared by all three
// self-score gauges (adam/coordinator/solomon) — a coarse wall-clock proxy independent of each
// writer's own turn-based firing cadence. Exported for unit testing.
export const DEFAULT_SELF_SCORE_STALE_HOURS = 48;

/**
 * Pure-ish factory: returns an async detector that reports whether the most recent `feedback`
 * row in `category` is older than `cadenceHours` (or missing entirely). Shared by all three
 * self-score gauge entries (adam_self_score_age / coordinator_self_score_age /
 * solomon_self_score_age) in lib/governance/gauge-registry.js — one factory, three registry
 * entries, per the STUB-ROW ADOPTION CONTRACT's "two additive edits" adoption story.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} category
 * @param {number} [cadenceHours]
 */
export function staleSelfScoreDetector(supabase, category, cadenceHours = DEFAULT_SELF_SCORE_STALE_HOURS) {
  return async () => {
    const { data, error } = await supabase.from('feedback').select('created_at').eq('category', category).order('created_at', { ascending: false }).limit(1);
    if (error) throw new Error(`staleSelfScoreDetector(${category}) query failed: ` + error.message);
    if (!data || !data.length) return { count: 1, category, reason: 'no self-score row found for this category' };
    const ageHours = (Date.now() - new Date(data[0].created_at).getTime()) / 3600000;
    return { count: ageHours > cadenceHours ? 1 : 0, category, ageHours: Math.round(ageHours * 10) / 10, cadenceHours };
  };
}

/**
 * Maps a registry entry's string detectorFn key to an actual callable. Keeps gauge-registry.js
 * (CommonJS) free of ESM imports — this runner (ESM) does the resolution instead.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
function buildDetectorResolvers(supabase) {
  // SD-LEO-INFRA-009-LEAF-WORK-001: memoized within one run so the 3 work-boundary detectors
  // below share a single strategic_directives_v2 read instead of each re-fetching it.
  let boundaryRowsPromise = null;
  const boundaryRows = () => boundaryRowsPromise || (boundaryRowsPromise = fetchSdBoundaryRows(supabase));

  // SD-LEO-INFRA-009-LEAF-PER-001: 6 per-loop resolvers, generated rather than hand-written --
  // each fetches its own loop's rows (fetchLoopStageRows is already loop-scoped, so there is no
  // shared-fetch to memoize here, unlike the boundary detectors above).
  const perLoopHealthResolvers = {};
  for (const loopId of PER_LOOP_HEALTH_LOOP_IDS) {
    perLoopHealthResolvers[`loop-health-${loopId}`] = async () => {
      const { rows, truncated } = await fetchLoopStageRows(supabase, loopId);
      return { ...computeLoopHealth(loopId, rows), truncated };
    };
  }

  return {
    ...perLoopHealthResolvers,
    'adam-self-score-age': staleSelfScoreDetector(supabase, 'adam_self_assessment'),
    'coordinator-self-score-age': staleSelfScoreDetector(supabase, 'coordinator_self_assessment'),
    'solomon-self-score-age': staleSelfScoreDetector(supabase, 'solomon_self_assessment'),
    'unranked-claimable-leaves': async () => {
      const { error, claimable } = await computeClaimableLeaves(supabase);
      if (error) throw new Error('computeClaimableLeaves failed: ' + error.message);
      return countUnrankedClaimableLeaves(claimable, Date.now());
    },
    'relay-drop': async () => shapeRelayDropResult(await planRelayDrops(supabase)),
    // SD-LEO-INFRA-HOLD-STATE-CONTRACT-001 (FR-6). Filters server-side to rows carrying at
    // least one of the 3 review_at keys -- NOT a bare `.limit(N)` over "any non-null metadata"
    // row, which on a table with thousands of SDs (5000+ live) can silently truncate before an
    // actual candidate row, producing false negatives regardless of N. SECURITY Q1: `mode` on
    // the result surfaces the currently-active HOLD_STATE_CONTRACT_MODE on every sweep line, so
    // observe-mode is never mistaken for enforce-mode by a reader of the gauge output.
    'hold-state-overdue': async () => {
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .select('sd_key, status, metadata')
        .or('metadata->>park_review_at.not.is.null,metadata->>exec_boundary_hold_review_at.not.is.null,metadata->>min_tier_rank_review_at.not.is.null')
        .limit(5000);
      if (error) throw new Error('hold-state-overdue query failed: ' + error.message);

      // Real CONSUMER of hold_state_contract_violations (OPERATOR_CONTRACT gate, FR-8): the
      // migration's own comment names this table "the calibration signal reviewed before
      // promoting any surface to enforce mode" -- surface a recent-window count here so a
      // coordinator reviewing this gauge sees both signals (overdue holds + observe-mode
      // violation volume) in one place, rather than the violations table being write-only.
      const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const { count: recentViolationCount, error: violationsErr } = await supabase
        .from('hold_state_contract_violations')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', sevenDaysAgoIso);
      if (violationsErr) throw new Error('hold-state-overdue violations query failed: ' + violationsErr.message);

      return {
        ...findOverdueHolds(data, Date.now()),
        mode: readHoldStateMode(),
        recentViolationCount: recentViolationCount || 0,
      };
    },
    // Filesystem detector (stale-tree precedent): parses REVISIT-IF tags from live
    // source, so moved tags stay visible; tests/fixtures excluded by default so the
    // planted miss-direction fixture never trips the live gauge.
    'expired-premise-tags': async () => detectExpiredPremises(process.cwd(), { now: new Date() }),
    'stale-tree': async () => shapeStaleTreeResult(checkoutFreshness(process.cwd(), { role: 'fleet-gauge-runner' })),
    // SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-D: fake-separation detector (design fw3 §3/§7.3).
    // Env read at THIS boundary and injected into the pure core (DESIGN A2); zero-sample
    // pre-Child-A worlds return count=0 cleanly with the sample visible.
    'fw3-cmv-rejecter-fake-separation': async () => {
      const { detectFakeSeparation } = await import('../lib/governance/fw3-cmv-rejecter.cjs');
      return detectFakeSeparation(supabase, {
        minSample: Number(process.env.FW3_REJECTER_MIN_SAMPLE) || 10,
        epsilon: Number(process.env.FW3_REJECTER_EPSILON) || 0.05,
      });
    },
    'ship-witness-unwitnessed-merge': async () => {
      const ghRunner = (args) => {
        const r = spawnSync('gh', args, { encoding: 'utf8' });
        return { code: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '' };
      };
      const merges = PLATFORM_REPOS.flatMap((r) => defaultFetchMergedPlatformPRs(r.owner, r.name, WITNESS_CUTOVER_ISO, ghRunner));
      // QF-20260719-201: paginated read — the bare select truncated at PostgREST's 1000-row default.
      const telemetryRows = await fetchAllWitnessRows(supabase);
      const result = detectUnwitnessedMerges(merges, telemetryRows);
      // SD-LEO-INFRA-SHIP-WITNESS-COVERAGE-001 FR-1: best-effort backfill each gap this pass
      // finds, reusing the SAME merges/telemetryRows fetch above (no duplicate gh/DB round-trip).
      // Never affects this detector's own return value/trip decision -- the gauge still reports
      // the PRE-sweep gap count for THIS pass (DETECT direction stays intact, TS-7); the sweep
      // only reduces FUTURE passes' count.
      try {
        await reconcileUnwitnessedMerges(result.unwitnessed, { supabase });
      } catch (e) {
        console.error(`[gauge-runner] ship-witness reconcile sweep failed (non-fatal): ${e?.message || e}`);
      }
      return result;
    },
    'coordinator-sourced-sd': async () => detectCoordinatorSourced(await boundaryRows()),
    'adam-claimed-or-built-sd': async () => {
      const adams = await fetchAllAdams(supabase);
      return detectRoleClaimed(await boundaryRows(), adams.map((a) => a.session_id));
    },
    'solomon-dispatched-sd': async () => {
      const solomons = await fetchAllSolomons(supabase);
      return detectRoleDispatched(await boundaryRows(), solomons.map((s) => s.session_id));
    },
    'venture-capture-completeness': async () => {
      const minStage = resolveMinExtractStage();
      const { data: ventures, error } = await supabase
        .from('ventures')
        .select('id, name, current_lifecycle_stage')
        .eq('status', 'active')
        .gte('current_lifecycle_stage', minStage);
      if (error) throw new Error('ventures query failed: ' + error.message);

      const perVenture = [];
      let totalMissing = 0;
      for (const venture of ventures || []) {
        // eslint-disable-next-line no-await-in-loop -- small venture count, sequential is fine
        const reading = await getCaptureCompleteness(supabase, venture, { minStage });
        totalMissing += reading.missing;
        perVenture.push({ name: venture.name, ...reading });
      }
      return { count: totalMissing, perVenture };
    },
    'operator-cash-attestation-missing': async () => {
      const periodMonth = periodMonthOf(Date.now());
      const row = await readSubstrateRow(periodMonth, supabase);
      const verdict = computeRunway(row);
      return { ...cashAttestationMissingResult(verdict), period_month: periodMonth };
    },
    'recursion-governor-ratio': async () => {
      const items = await fetchThroughputItems(supabase);
      const ratioResult = computeRecursionRatio(items);
      const breach = isBandBreach(ratioResult);
      await writeThroughputSnapshot(supabase, { dimension: RECURSION_GOVERNOR_DIMENSION, ratioResult, breach });
      const recent = await fetchRecentSnapshots(supabase, { dimension: RECURSION_GOVERNOR_DIMENSION });
      const { sustained, streak } = detectSustainedBreach(recent);
      return { count: sustained ? 1 : 0, ...ratioResult, breach, streak };
    },
    // SD-LEO-INFRA-PLAN-DRIFT-GAUGE-001 Layer A: stamp-coverage (starvation detector).
    'plan-drift-coverage': async () => computeStampCoverage(supabase),
    // Layer B: dispatch-mix drift. Self-gates on LIVE coverage (re-reads Layer A) rather than
    // coupling to any sibling SD's completion status. Sustained-breach trip reuses the
    // recursion-governor.js cycle-tracking pattern (same codebase_health_snapshots table, a
    // dimension key ('plan-drift-mix') that does not collide with 'recursion-governor-ratio').
    // Re-surface-once dedup: skips the feedback-table insert (skipRoute) when an OPEN
    // invariant_gauge_finding already exists for this gauge_id -- routeFinding() always inserts
    // unconditionally otherwise, and 903 existing duplicate rows confirmed no gauge dedups today.
    'plan-drift-mix': async () => {
      const coverage = await computeStampCoverage(supabase);
      if (coverage.starved) {
        return { sustainedBreach: false, starved: true, coverage, skipRoute: true, value: 'STARVED (self-gated on Layer A coverage)' };
      }
      let activeRungKey = null;
      let sdRungMap = {};
      try {
        const grep = makeDefaultGrepSeam();
        const computeGaugeFn = () => computeBuildGauge({ io: { supabase, grep }, visionSource: true });
        const roll = await runRollup({ supabase, computeGaugeFn, apply: false, log: () => {} });
        if (roll && roll.ok) activeRungKey = roll.activeRungKey || null;
        const [{ data: waveItems }, { data: waves }] = await Promise.all([
          supabase.from('roadmap_wave_items').select('promoted_to_sd_key, wave_id').not('promoted_to_sd_key', 'is', null),
          supabase.from('roadmap_waves').select('id, time_horizon, metadata'),
        ]);
        const wavesById = Object.fromEntries((waves || []).map((w) => [w.id, w]));
        sdRungMap = buildSdRungMap(waveItems, wavesById);
      } catch (e) {
        console.error(`[gauge-runner] plan-drift-mix: active-rung context unavailable (fail-soft): ${e?.message || e}`);
      }
      const dispatchedKeys = await fetchLastNDispatchedKeys(supabase, { limit: 20 });
      const mixResult = computeDispatchMix(dispatchedKeys, sdRungMap, activeRungKey);
      const breach = isDriftBreach(mixResult);
      await writeThroughputSnapshot(supabase, { dimension: PLAN_DRIFT_MIX_DIMENSION, ratioResult: mixResult, breach });
      const recent = await fetchRecentSnapshots(supabase, { dimension: PLAN_DRIFT_MIX_DIMENSION, limit: 2 });
      const { sustained, streak } = detectSustainedBreach(recent, { requiredConsecutive: 2 });
      const skipRoute = sustained ? await hasOpenFinding(supabase, 'plan-drift-mix') : false;
      const mixPctStr = typeof mixResult.activeRungPct === 'number' ? `${mixResult.activeRungPct.toFixed(1)}%` : 'n/a';
      return {
        sustainedBreach: sustained,
        starved: false,
        coverage,
        mix: mixResult,
        activeRungKey,
        streak,
        skipRoute,
        value: `active-rung=${mixPctStr}${sustained ? ` (SUSTAINED BREACH x${streak})` : ''}`,
      };
    },
    // SD-LEO-GEN-SATELLITE-AGENT-LIFECYCLE-001: registry's tripWhen reads result.status
    // directly, so `count` here is purely the console GAUGE-line display convention (matches
    // every other count-based entry above) -- the full NO_DATA/OK/GHOSTS_FOUND distinction
    // is preserved in the raw result embedded in any routed finding.
    'ghost-ceo': async () => {
      const result = await checkGhostCeos(supabase);
      return { ...result, count: result.ghosts.length };
    },
  };
}

/**
 * Pure-ish: builds the two session_coordination insert rows (coordinator + Adam) for a
 * plan-drift-mix advisory. Extracted from pushPlanDriftAdvisory so the row SHAPE is unit-testable
 * without faking coordinator/Adam session resolution.
 * @param {object} result - the plan-drift-mix detector's result
 * @param {{ coordinatorId: (string|null), adamId: (string|null) }} recipients
 * @returns {{ coordinatorRow: object, adamRow: (object|null) }}
 */
export function buildPlanDriftAdvisoryRows(result, { coordinatorId, adamId }) {
  const mixPct = typeof result?.mix?.activeRungPct === 'number' ? result.mix.activeRungPct.toFixed(1) : 'n/a';
  const subject = `[PLAN-DRIFT] Dispatch mix drifted from active-wave demand (active-rung share ${mixPct}%)`;
  const body = `Sustained dispatch-mix drift detected across ${result?.streak ?? '?'} consecutive gauge-runner cycles. Active-rung share of last-N dispatched work: ${mixPct}% (mix: ${JSON.stringify(result?.mix?.mix || {})}). Coverage floor is currently clear (not starved), so this is a genuine mix drift, not a linkage-starvation false trip.`;
  const payload = { kind: 'coordinator_advisory', gauge_id: 'plan-drift-mix', body, mix: result?.mix, streak: result?.streak };
  const coordinatorRow = { message_type: 'INFO', target_session: coordinatorId || 'broadcast-coordinator', subject, sender_type: 'gauge-runner', payload };
  const adamRow = adamId ? { message_type: 'INFO', target_session: adamId, subject, sender_type: 'gauge-runner', payload } : null;
  return { coordinatorRow, adamRow };
}

/**
 * SD-LEO-INFRA-PLAN-DRIFT-GAUGE-001 FR-6: dual-recipient advisory (coordinator + Adam), fired only
 * on a genuine sustained-breach trip that passed the re-surface-once dedup (never an unconditional
 * per-run insert -- no existing gauge pushes to session_coordination today per design-agent's
 * finding, so this push is deliberately narrow and gauge-specific rather than a generalized
 * mechanism no other gauge has asked for yet). Session-id resolution is injected (not resolved
 * internally) so buildPlanDriftAdvisoryRows/the insert calls are testable without faking the
 * coordinator/Adam session-resolution machinery (those helpers have their own test suites).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} result - the plan-drift-mix detector's result
 * @param {{ coordinatorId: (string|null), adamId: (string|null) }} recipients
 */
export async function pushPlanDriftAdvisory(supabase, result, recipients) {
  const { coordinatorRow, adamRow } = buildPlanDriftAdvisoryRows(result, recipients);

  const { error: coordErr } = await supabase.from('session_coordination').insert(coordinatorRow);
  if (coordErr) console.error(`[gauge-runner] plan-drift advisory (coordinator) failed (non-fatal): ${coordErr.message}`);

  if (adamRow) {
    const { error: adamErr } = await supabase.from('session_coordination').insert(adamRow);
    if (adamErr) console.error(`[gauge-runner] plan-drift advisory (Adam) failed (non-fatal): ${adamErr.message}`);
  } else {
    console.error('[gauge-runner] plan-drift advisory: no live Adam session resolved -- coordinator leg still sent');
  }
}

/**
 * Pure: given the registry and a resolver map, decide which entries are runnable now.
 * Exported for unit testing without a DB round-trip.
 * @param {object[]} registry
 * @returns {object[]} enabled entries only
 */
export function selectEnabledEntries(registry) {
  return (registry || []).filter((entry) => entry && entry.enabled === true && entry.detectorFn);
}

/**
 * Pure: does this result trip the entry's threshold?
 * @param {object} entry
 * @param {object} result
 * @returns {boolean}
 */
export function tripsThreshold(entry, result) {
  const tripWhen = entry?.thresholdConfig?.tripWhen;
  if (typeof tripWhen !== 'function') return false;
  try { return !!tripWhen(result); } catch { return false; }
}

/**
 * Pure: builds the feedback-table insert row for a tripped gauge finding. Exported so the row
 * shape (critically, `type: 'issue'`) can be unit-tested against the feedback_type_check
 * constraint's known-valid values without a live DB round-trip.
 * @param {object} entry
 * @param {object} result
 * @returns {object}
 */
export function buildFindingRow(entry, result) {
  // feedback.type is constrained to ('issue', 'enhancement') by feedback_type_check
  // (database/migrations/391_quality_lifecycle_schema.sql) -- a tripped gauge is an issue; the
  // gauge-specific discriminator lives in category/metadata.gauge_id instead.
  return {
    type: 'issue',
    source_application: 'EHG_Engineer',
    source_type: 'auto_capture',
    category: 'invariant_gauge_finding',
    status: 'new',
    severity: 'medium',
    title: `[GAUGE] ${entry.name} tripped (owner: ${entry.ownerRole})`,
    description: `Detector "${entry.id}" tripped its threshold. Remediation: ${entry.remediation}`,
    metadata: { gauge_id: entry.id, owner_role: entry.ownerRole, result, prevent: entry.prevent, routed_at: new Date().toISOString() },
  };
}

async function routeFinding(supabase, entry, result) {
  // SD-LEO-INFRA-PLAN-DRIFT-GAUGE-001 FR-5 (re-surface-once dedup): a detector may set
  // result.skipRoute=true when an OPEN finding for its gauge_id already exists (or the trip is a
  // self-gated starved short-circuit that isn't a genuine drift finding) -- skip the duplicate
  // insert. Generic extension point: any future detector can opt in the same way.
  if (result?.skipRoute) {
    console.log(`[gauge-runner] ${entry.id}: routing skipped (skipRoute -- already-open finding or starved short-circuit)`);
    return;
  }
  const { error } = await supabase.from('feedback').insert(buildFindingRow(entry, result));
  if (error) console.error(`[gauge-runner] finding-route failed for ${entry.id} (non-fatal): ${error.message}`);
}

async function writeHeartbeat(supabase, ranCount) {
  const { error } = await supabase.from('codebase_health_snapshots').insert({
    dimension: HEARTBEAT_DIMENSION,
    target_application: 'EHG_Engineer',
    score: 100,
    findings: [{ ran_count: ranCount, ran_at: new Date().toISOString() }],
    trend_direction: 'stable',
    metadata: { source: 'gauge-runner.mjs' },
  });
  if (error) console.error(`[gauge-runner] heartbeat write failed (non-fatal — invariant #0 will alarm): ${error.message}`);
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('[gauge-runner] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required'); process.exit(1); }
  const supabase = createClient(url, key);
  const resolvers = buildDetectorResolvers(supabase);

  const enabled = selectEnabledEntries(GAUGE_REGISTRY).slice(0, MAX_DETECTORS_PER_RUN);
  const results = [];

  for (const entry of enabled) {
    const detect = resolvers[entry.detectorFn];
    if (typeof detect !== 'function') {
      console.error(`[gauge-runner] no resolver registered for detectorFn="${entry.detectorFn}" (entry "${entry.id}") — skipping`);
      continue;
    }
    try {
      const result = await detect();
      const tripped = tripsThreshold(entry, result);
      const value = typeof result?.count === 'number' ? result.count : (result?.value ?? 'n/a');
      console.log(`GAUGE ${entry.id}=${value}`);
      results.push({ id: entry.id, value, tripped, result });
      if (tripped) {
        await routeFinding(supabase, entry, result);
        // SD-LEO-INFRA-PLAN-DRIFT-GAUGE-001 FR-6: dual-recipient push, gauge-specific (narrow by
        // design -- no other gauge pushes to session_coordination yet) and dedup-gated (skipRoute
        // means either a starved short-circuit or an already-open finding -- never re-push).
        if (entry.id === 'plan-drift-mix' && !result.skipRoute) {
          const { getActiveCoordinatorId } = require('../lib/coordinator/resolve.cjs');
          const { resolveAdamSessionId } = require('./read-adam-directives.cjs');
          const [coordinatorId, adamId] = await Promise.all([
            getActiveCoordinatorId(supabase).catch(() => null),
            resolveAdamSessionId(supabase).catch(() => null),
          ]);
          await pushPlanDriftAdvisory(supabase, result, { coordinatorId, adamId });
        }
      }
    } catch (e) {
      console.error(`[gauge-runner] detector "${entry.id}" threw (non-fatal, advisory-only): ${e?.message || e}`);
      results.push({ id: entry.id, error: e?.message || String(e) });
    }
  }

  await writeHeartbeat(supabase, results.length);

  try {
    await stampLastFired(supabase, 'standard_loop:gauge-runner');
  } catch (err) {
    console.error(`[gauge-runner] stampLastFired failed (non-fatal): ${err.message}`);
  }

  if (JSON_MODE) console.log(JSON.stringify({ ran: results.length, results }));
  process.exit(0); // advisory: the runner itself never fails the tick
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((e) => { console.error('[gauge-runner] UNHANDLED: ' + (e?.message || e)); process.exit(0); });
}
