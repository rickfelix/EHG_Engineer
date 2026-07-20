#!/usr/bin/env node
/**
 * Adam coordinator-health audit — standing 3-KPI oversight loop.
 * SD-LEO-INFRA-ADAM-COORDINATOR-HEALTH-001 (chairman mandate 2026-07-16).
 *
 * Formalizes Adam's ad-hoc coordinator audits (which already caught real defects — a
 * masked-error dispatch-rank query under-counting claimable work; a legitimate-vs-stale
 * fence audit) into a durable, cadence-run probe. Composes existing SSOT surfaces rather
 * than re-deriving them: lib/fleet/genuine-worker.mjs for utilization, computeWaveLinkageCoverage
 * for plan-adherence, gauge-runner.mjs's buildXAdvisoryRows pattern for propose-only escalation.
 *
 * CONST-002: this probe NEVER claims, dispatches, or otherwise mutates SD/claim state — it only
 * reads, persists a reading, and (on breach) writes a propose-only advisory row.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { liveFleetWorkers } from '../lib/fleet/genuine-worker.mjs';
import { computeWaveLinkageCoverage } from '../lib/roadmap/wave-linkage-coverage.js';
import { computeClaimableLeaves } from './coordinator-backlog-rank.mjs';
import { getActiveCoordinatorId } from '../lib/coordinator/resolve.cjs';
import { isMainModule } from '../lib/utils/is-main-module.js';
// SD-LEO-INFRA-COORDINATOR-HEALTH-KPI-001: the 5-sharpening delta (Solomon cold-review).
// KPI-0 outcome/flow is the PRIMARY axis; the base 3 KPIs stay untouched below.
import { execSync } from 'child_process';
import {
  computeOutcomeFlow, classifyFailureClasses, fetchStuckWithoutHold,
  deriveDispatchReasons, evaluateReasonBand, sampleFalseCompletions, selectCohort,
  FALSE_COMPLETION_SAMPLE, OUTCOME_WINDOW_DAYS,
} from '../lib/oversight/coordinator-health-sharpenings.mjs';
import { registerOversightLoop } from '../lib/oversight/coordinator-health-recompute.mjs';

export const DIMENSION = 'adam_coordinator_health';
export const IN_FLIGHT_STATUSES = ['in_progress', 'active', 'pending_approval'];

/**
 * KPI-1: utilization. Uses liveFleetWorkers/isFleetWorker (SSOT) so this probe can never
 * disagree with fleet-dashboard.cjs/worker-checkin.cjs on who counts as a genuine worker.
 * Current-claim signal is `!!s.sd_key` (not commits_since_claim) — a cross-repo claimant
 * (SD.target_application != EHG_Engineer) legitimately shows commits_since_claim=0 here but
 * still has sd_key set, so it is correctly counted as claimed, never idle.
 */
export async function computeUtilization(supabase, { nowMs = Date.now() } = {}) {
  // QF-20260720-161: claude_sessions accumulates historical rows (12,973 live-verified,
  // well past PostgREST's 1000-row default page cap). An unordered select('*') silently
  // returned an arbitrary/oldest-leaning 1000-row slice containing ZERO status='active'
  // rows, so every live session was excluded and this KPI reported live_workers=0 with
  // full confidence. Ordering by heartbeat_at descending guarantees the freshest rows —
  // the only ones liveFleetWorkers' window filter can ever keep — land inside the cap.
  const { data: sessions, error } = await supabase
    .from('claude_sessions')
    .select('*')
    .order('heartbeat_at', { ascending: false });
  if (error) throw new Error(`utilization: claude_sessions query failed: ${error.message}`);
  const rows = sessions || [];
  const coordinatorId =
    rows.find((s) => s.metadata?.is_coordinator === true || String(s.metadata?.is_coordinator) === 'true')
      ?.session_id || null;
  const live = liveFleetWorkers(rows, coordinatorId, nowMs);
  const claimed = live.filter((s) => !!s.sd_key);
  const idle = live.filter((s) => !s.sd_key);

  const { data: backlog, error: bErr } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('status', 'draft')
    .is('claiming_session_id', null)
    .limit(1000);
  if (bErr) throw new Error(`utilization: backlog query failed: ${bErr.message}`);

  return {
    live_workers: live.length,
    claimed: claimed.length,
    idle: idle.length,
    dispatchable_backlog_size: (backlog || []).length,
  };
}

/**
 * KPI-2: plan-adherence. Reuses computeWaveLinkageCoverage directly — NEVER re-derives the
 * linkage/starvation logic (avoids a second, divergent gauge for the same signal). When
 * coverage is null (zero claimable leaves), reports 'unmeasurable_until_linkage' — never a
 * numeric 0% and never 'off-plan'. When measured, narrows the starved/unlinkedKeys output to
 * the in-flight subset (in_progress/active/pending_approval) via a thin post-filter, without
 * touching the reused function's own denominator/logic.
 */
export async function computePlanAdherence(supabase) {
  const result = await computeWaveLinkageCoverage(supabase);
  if (result.coverage === null) {
    return { status: 'unmeasurable_until_linkage', coverage: null, linked: result.linked, total: result.total };
  }

  const candidateKeys = result.unlinkedKeys.length ? result.unlinkedKeys : ['__none__'];
  const { data: inFlightRows, error } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key')
    .in('status', IN_FLIGHT_STATUSES)
    .in('sd_key', candidateKeys);
  if (error) throw new Error(`plan-adherence: in-flight filter query failed: ${error.message}`);

  return {
    status: 'measured',
    coverage: result.coverage,
    linked: result.linked,
    total: result.total,
    starved: result.starved,
    in_flight_unlinked: (inFlightRows || []).map((r) => r.sd_key),
  };
}

/**
 * KPI-3: fail-loud integrity guard. Independently recomputes a raw dispatchable-count signal
 * (draft + unclaimed) and cross-checks it against the coordinator's OWN self-reported count —
 * computeClaimableLeaves (scripts/coordinator-backlog-rank.mjs), the same dependency/hold-aware
 * claimable-leaf computation the ranker and worker-checkin.cjs act on. This is a genuinely
 * independent second code path (not a diff against itself) — the exact class of gap the masked
 * dispatch_rank column bug exploited.
 *
 * Invariant, not exact equality: computeClaimableLeaves only ever NARROWS the raw draft+unclaimed
 * set (dependency blocks, human-action holds, fixture skips all REMOVE candidates, never add) —
 * so self_reported <= recomputed is the healthy state, verified live (11 raw drafts, 8 in-flight
 * excluded, 10 held for human-action, 3 truly claimable). A violation (self_reported > recomputed)
 * is the genuine integrity failure this KPI targets — the ranker reporting MORE claimable work
 * than the raw eligible set contains is a logical impossibility under correct operation. A query
 * failure in EITHER path is surfaced as integrity_ok=false with the error attached — it MUST NEVER
 * be null-coalesced into a silent 0/"no work" result. selfReportedCounts (test seam) overrides the
 * real computeClaimableLeaves call so unit tests can inject a divergence without a live DB.
 *
 * QF-20260720-161: additionally surfaces human_action_held (from the same computeClaimableLeaves
 * call, no extra query) and flags instrument_suspect when the recomputed-vs-self_reported gap is
 * NOT substantially explained by that known hold count — see the inline comment below.
 */
export async function computeFailLoudIntegrity(supabase, { selfReportedCounts, claimableLeavesFn = computeClaimableLeaves } = {}) {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('status', 'draft')
    .is('claiming_session_id', null);
  if (error) {
    return { integrity_ok: false, error: error.message, divergent_fields: ['dispatchable_count'] };
  }
  const recomputed = { dispatchable_count: (data || []).length };

  let selfReported = selfReportedCounts;
  let humanActionHeld = null;
  if (!selfReported) {
    const leaves = await claimableLeavesFn(supabase, { quiet: true });
    if (leaves?.error) {
      return { integrity_ok: false, error: leaves.error.message || String(leaves.error), divergent_fields: ['dispatchable_count'] };
    }
    selfReported = { dispatchable_count: (leaves?.claimable || []).filter((sd) => sd.status === 'draft').length };
    humanActionHeld = (leaves?.humanActionHolds || []).length;
  }

  const divergentFields = Object.keys(recomputed).filter((k) => (selfReported[k] ?? 0) > recomputed[k]);
  // QF-20260720-161: self_reported <= recomputed is the healthy narrowing invariant (deps/
  // holds/fixtures only ever REMOVE candidates), so a wide gap alone is not evidence of a
  // stale read — 3 vs 20 with 11 held for human-action is real, verified fleet state. But a
  // gap NOT explained by known holds is exactly the "confident but wrong" shape that hid
  // live_workers=0 — flag the instrument as suspect instead of printing two opaque numbers.
  const dc = recomputed.dispatchable_count;
  const unexplained = humanActionHeld === null ? null : dc - selfReported.dispatchable_count - humanActionHeld;
  const instrumentSuspect = unexplained !== null && dc > 0 && unexplained / dc > 0.5;
  if (instrumentSuspect) divergentFields.push('dispatchable_count_unexplained_gap');

  return {
    integrity_ok: divergentFields.length === 0,
    recomputed,
    self_reported: selfReported,
    divergent_fields: divergentFields,
    ...(humanActionHeld !== null ? { human_action_held: humanActionHeld, instrument_suspect: instrumentSuspect } : {}),
  };
}

/** Pure: a breach requires idle workers AND a non-empty backlog together (never idle alone). */
export function classifyBreach({ utilization, planAdherence, integrity }) {
  const idleWithBacklog = utilization.idle > 0 && utilization.dispatchable_backlog_size > 0;
  const integrityBreach = integrity.integrity_ok === false;
  const planBreach = planAdherence.status === 'measured' && planAdherence.starved === true;
  return { breach: idleWithBacklog || integrityBreach || planBreach, idleWithBacklog, integrityBreach, planBreach };
}

/**
 * Pure row-builder for the propose-only advisory (mirrors gauge-runner.mjs's
 * buildPlanDriftAdvisoryRows shape — a testable pure function, DB write kept separate).
 * NEVER calls a claim/dispatch function (CONST-002). Targets the coordinator only — per the
 * established convention (gauge-runner.mjs's pushPlanDriftAdvisory), the coordinator IS the
 * chairman-facing surface (single pane of glass); there is no separate resolvable "chairman
 * session".
 */
export function buildCoordinatorHealthAdvisoryRows(reading, { coordinatorId }) {
  const which = [
    reading.breach.idleWithBacklog && 'idle workers + non-empty dispatchable backlog',
    reading.breach.integrityBreach && `fail-loud integrity divergence (${(reading.integrity.divergent_fields || []).join(', ')})`,
    reading.breach.planBreach && `plan-adherence starved (coverage ${(reading.plan_adherence.coverage * 100).toFixed(1)}%)`,
    // SD-LEO-INFRA-COORDINATOR-HEALTH-KPI-001: the coordinator sees WHICH of the
    // six classes fired, not just 'breach'.
    ...(reading.breach.firing_failure_classes || []).map((c) => `failure class ${c}`),
    reading.breach.band_breach && 'dispatch reason-code distribution outside band',
    reading.breach.recomputeBreach && 'raw-SQL recompute divergence (S4)',
  ].filter(Boolean);
  const subject = `[ADAM-COORDINATOR-HEALTH] KPI breach: ${which.join('; ')}`;
  const body = `Coordinator-health probe reading at ${reading.timestamp}: utilization=${JSON.stringify(reading.utilization)}, plan_adherence=${JSON.stringify(reading.plan_adherence)}, integrity=${JSON.stringify(reading.integrity)}. Propose-only advisory — no dispatch action taken.`;
  const payload = { kind: 'adam_advisory', gauge_id: DIMENSION, body, reading };
  const coordinatorRow = {
    message_type: 'INFO',
    target_session: coordinatorId || 'broadcast-coordinator',
    subject,
    sender_type: 'adam-coordinator-health',
    payload,
  };
  return { coordinatorRow };
}

export async function pushCoordinatorHealthAdvisory(supabase, reading, recipients = {}) {
  const { coordinatorRow } = buildCoordinatorHealthAdvisoryRows(reading, recipients);
  const { error: cErr } = await supabase.from('session_coordination').insert(coordinatorRow);
  if (cErr) console.error(`[adam-coordinator-health] advisory (coordinator) failed (non-fatal): ${cErr.message}`);
}

/** FR-4: persist a reading via the existing codebase_health_snapshots surface (no new table). */
export async function persistReading(supabase, reading) {
  const score = reading.breach.breach ? 50 : 100;
  const { data: prior } = await supabase
    .from('codebase_health_snapshots')
    .select('score')
    .eq('dimension', DIMENSION)
    .order('scanned_at', { ascending: false })
    .limit(1);
  const priorScore = prior?.[0]?.score;
  const trend =
    priorScore === undefined ? 'stable' : score > priorScore ? 'improving' : score < priorScore ? 'declining' : 'stable';
  const { error } = await supabase.from('codebase_health_snapshots').insert({
    dimension: DIMENSION,
    target_application: 'EHG_Engineer',
    score,
    findings: [reading],
    trend_direction: trend,
    metadata: { source: 'adam-coordinator-health.mjs' },
  });
  if (error) console.error(`[adam-coordinator-health] persist failed (non-fatal): ${error.message}`);
}

/**
 * SD-LEO-INFRA-COORDINATOR-HEALTH-KPI-001: FALSE_COMPLETION git verifier — a
 * DB-completed SD must leave a trace on origin/main. 'unverifiable' (git/remote
 * unavailable) is a DISTINCT status, never a silent pass and never a crash.
 */
export function gitGrepMainForSd(sdKey) {
  try {
    const out = execSync(`git log origin/main --grep="${String(sdKey).replace(/["\\$`]/g, '')}" -1 --format=%h`, {
      encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim().length > 0;
  } catch {
    return 'unverifiable';
  }
}

/**
 * SD-LEO-INFRA-COORDINATOR-HEALTH-KPI-001 (S1-S3, S5 wire-through): the
 * sharpened signals computed alongside — never instead of — the base 3 KPIs.
 * Fail-soft per signal: a sharpening fault degrades that signal to an error
 * marker, it never takes down the base probe.
 */
export async function computeSharpenings(supabase, { utilization, integrity, nowMs = Date.now(), gitGrep = gitGrepMainForSd } = {}) {
  let outcomeFlow = null; let dispatchReasons = null; let bandVerdict = null;
  let stuckRows = []; let falseCompletionSample = null;
  try { outcomeFlow = await computeOutcomeFlow(supabase, { nowMs }); } catch (e) { outcomeFlow = { status: 'error', error: e.message }; }
  try {
    // S3 classifies the SAME first-claim-in-window cohort KPI-0 measures —
    // currently-claimed rows are the wrong source (claiming_session_id clears on
    // completion/release, live-verified as an all-zeros distribution).
    const sinceIso = new Date(nowMs - (OUTCOME_WINDOW_DAYS + 21) * 24 * 60 * 60 * 1000).toISOString();
    // NOTE: provenance_source is a feedback-table column, NOT an SD column — selecting
    // it here 400s the whole query (live-verified; the fail-soft catch masked it).
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key, metadata, created_at')
      .gte('created_at', sinceIso)
      .limit(2000);
    if (error) throw new Error(error.message);
    dispatchReasons = deriveDispatchReasons(selectCohort(data || [], nowMs));
    bandVerdict = evaluateReasonBand(dispatchReasons);
  } catch (e) { bandVerdict = { band_ok: true, error: e.message }; }
  try { stuckRows = await fetchStuckWithoutHold(supabase, { nowMs }); } catch { stuckRows = []; }
  try {
    // Sample RECENT completions only (non-null completion_date within ~4 windows):
    // ancient/null-dated rows predate merge-trace conventions and would make the
    // FALSE_COMPLETION class permanently noisy (live-verified on first dry-run).
    const recentIso = new Date(nowMs - OUTCOME_WINDOW_DAYS * 4 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentCompleted } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key, metadata, target_application')
      .eq('status', 'completed')
      .gte('completion_date', recentIso)
      .order('completion_date', { ascending: false })
      .limit(FALSE_COMPLETION_SAMPLE);
    falseCompletionSample = sampleFalseCompletions(recentCompleted || [], gitGrep);
  } catch (e) { falseCompletionSample = { samples: [], false_completions: [], error: e.message }; }
  const failureClasses = classifyFailureClasses({ outcomeFlow, utilization, integrity, stuckRows, falseCompletionSample });
  return { outcomeFlow, dispatchReasons, bandVerdict, failureClasses };
}

export async function runProbe(supabase, opts = {}) {
  const utilization = await computeUtilization(supabase, opts);
  const planAdherence = await computePlanAdherence(supabase);
  const integrity = await computeFailLoudIntegrity(supabase, opts);
  const baseBreach = classifyBreach({ utilization, planAdherence, integrity });
  // KPI-0 delta: outcome/flow leads the reading (S1); the six classes + band
  // extend the breach signal (S2/S3) without altering the base classifier.
  const sharp = await computeSharpenings(supabase, { ...opts, utilization, integrity });
  // S4: verify the countable core via the pg RAW-SQL path (a genuinely different
  // code path from the supabase-js the metrics flow through). pg-unavailable is
  // surfaced loudly every run but does not breach; a CONNECTED recompute that
  // diverges (or can't produce a field) does — never null-coalesced.
  let recompute = { status: 'unavailable', recompute_ok: null };
  try {
    // Injectable pg-client factory (SD-LEO-FIX-ADAM-COORDINATOR-HEALTH-001): the
    // default reproduces prior behavior EXACTLY, but a caller (the unit tests) can
    // inject a stub so no live Postgres connection is opened and the recompute is
    // deterministic — the raw-SQL client is created OUTSIDE the injected supabase,
    // so without this seam the unit test's outcome flipped on ambient DB
    // reachability. Mirrors the claimableLeavesFn / gitGrep injectable-default
    // precedent used elsewhere in this file.
    const makePgClient = opts.makePgClient || (async () => {
      const { createDatabaseClient } = await import('../lib/supabase-connection.js');
      return createDatabaseClient('engineer', { verify: false });
    });
    const pg = await makePgClient();
    try {
      const { recomputeViaRawSql, compareReadings } = await import('../lib/oversight/coordinator-health-recompute.mjs');
      const raw = await recomputeViaRawSql(pg);
      const { count: inFlightCount } = await supabase
        .from('strategic_directives_v2')
        .select('id', { count: 'exact', head: true })
        .in('status', ['in_progress', 'pending_approval', 'active']);
      const probeCounts = { in_flight: inFlightCount, draft_unclaimed: utilization.dispatchable_backlog_size };
      const cmp = compareReadings(probeCounts, raw);
      recompute = { status: 'compared', ...cmp, probe: probeCounts, raw };
    } finally { await pg.end().catch(() => {}); }
  } catch (e) { recompute = { status: 'unavailable', recompute_ok: null, error: e.message }; }
  const firingClasses = sharp.failureClasses.filter((c) => c.firing);
  const breach = {
    ...baseBreach,
    breach: baseBreach.breach || firingClasses.length > 0 || sharp.bandVerdict?.band_ok === false || recompute.recompute_ok === false,
    firing_failure_classes: firingClasses.map((c) => c.cls),
    band_breach: sharp.bandVerdict?.band_ok === false,
    recomputeBreach: recompute.recompute_ok === false,
  };
  const reading = {
    timestamp: new Date().toISOString(),
    outcome_flow: sharp.outcomeFlow,
    utilization,
    plan_adherence: planAdherence,
    integrity,
    failure_classes: sharp.failureClasses,
    dispatch_reasons: { ...(sharp.dispatchReasons || {}), band: sharp.bandVerdict },
    recompute,
    breach,
  };
  await persistReading(supabase, reading);
  // S5: idempotent registration keeps the oversight loop's registry row (and
  // its ITEM-2 predicate) self-healing; non-fatal by contract.
  try {
    const reg = await registerOversightLoop(supabase);
    if (!reg.registered) console.error(`[adam-coordinator-health] loop_registry registration failed (non-fatal): ${reg.error}`);
  } catch (e) { console.error(`[adam-coordinator-health] loop_registry registration threw (non-fatal): ${e.message}`); }
  if (breach.breach) {
    const recipients = opts.recipients || { coordinatorId: await getActiveCoordinatorId(supabase).catch(() => null) };
    await pushCoordinatorHealthAdvisory(supabase, reading, recipients);
  }
  return reading;
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('[adam-coordinator-health] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }
  const supabase = createClient(url, key);
  const dryRun = process.argv.includes('--dry-run');
  let reading;
  if (dryRun) {
    const utilization = await computeUtilization(supabase);
    const integrity = await computeFailLoudIntegrity(supabase);
    const sharp = await computeSharpenings(supabase, { utilization, integrity });
    reading = {
      timestamp: new Date().toISOString(),
      outcome_flow: sharp.outcomeFlow,
      utilization,
      plan_adherence: await computePlanAdherence(supabase),
      integrity,
      failure_classes: sharp.failureClasses,
      dispatch_reasons: { ...(sharp.dispatchReasons || {}), band: sharp.bandVerdict },
    };
  } else {
    reading = await runProbe(supabase);
  }
  console.log(JSON.stringify(reading, null, 2));
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error(`[adam-coordinator-health] FATAL: ${e.message}`);
    process.exit(1);
  });
}
