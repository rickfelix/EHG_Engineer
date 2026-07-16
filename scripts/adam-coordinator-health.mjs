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
  const { data: sessions, error } = await supabase.from('claude_sessions').select('*');
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
  if (!selfReported) {
    const leaves = await claimableLeavesFn(supabase, { quiet: true });
    if (leaves?.error) {
      return { integrity_ok: false, error: leaves.error.message || String(leaves.error), divergent_fields: ['dispatchable_count'] };
    }
    selfReported = { dispatchable_count: (leaves?.claimable || []).filter((sd) => sd.status === 'draft').length };
  }

  const divergentFields = Object.keys(recomputed).filter((k) => (selfReported[k] ?? 0) > recomputed[k]);
  return {
    integrity_ok: divergentFields.length === 0,
    recomputed,
    self_reported: selfReported,
    divergent_fields: divergentFields,
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

export async function runProbe(supabase, opts = {}) {
  const utilization = await computeUtilization(supabase, opts);
  const planAdherence = await computePlanAdherence(supabase);
  const integrity = await computeFailLoudIntegrity(supabase, opts);
  const breach = classifyBreach({ utilization, planAdherence, integrity });
  const reading = {
    timestamp: new Date().toISOString(),
    utilization,
    plan_adherence: planAdherence,
    integrity,
    breach,
  };
  await persistReading(supabase, reading);
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
  const reading = dryRun
    ? {
        timestamp: new Date().toISOString(),
        utilization: await computeUtilization(supabase),
        plan_adherence: await computePlanAdherence(supabase),
        integrity: await computeFailLoudIntegrity(supabase),
      }
    : await runProbe(supabase);
  console.log(JSON.stringify(reading, null, 2));
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error(`[adam-coordinator-health] FATAL: ${e.message}`);
    process.exit(1);
  });
}
