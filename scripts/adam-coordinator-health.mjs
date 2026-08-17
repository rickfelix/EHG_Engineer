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
// SD-LEO-INFRA-ROADMAP-LINK-COUNTED-EXCEPTION-001 (FR-5): surface the counted exception beside
// the adherence number. Shared pure tally — never re-derived here.
import { countRoadmapLinkExceptions } from '../lib/sourcing-engine/roadmap-link-exception.js';
import { computeClaimableLeaves } from './coordinator-backlog-rank.mjs';
import { getActiveCoordinatorId } from '../lib/coordinator/resolve.cjs';
// QF-20260725-089: the ONE belt-depth gauge, eligibility-gated. Never re-derive a depth count here.
import { countDispatchableBacklog } from '../lib/fleet/belt-depth.cjs';
import { isMainModule } from '../lib/utils/is-main-module.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: exact head-counts for the
// gauge sites below (never rows.length on a capped read) + pagination for the sharpenings
// SD-window read (strategic_directives_v2 is unbounded and iterated, not just counted).
// QF-20260725-089: renderCount dropped — both head-count gauges it guarded now route through
// countDispatchableBacklog, which returns a plain number.
import { fetchAllPaginated, POSTGREST_MAX_ROWS } from '../lib/db/fetch-all-paginated.mjs';
// SD-LEO-INFRA-COORDINATOR-HEALTH-KPI-001: the 5-sharpening delta (Solomon cold-review).
// KPI-0 outcome/flow is the PRIMARY axis; the base 3 KPIs stay untouched below.
import { execSync } from 'child_process';
import {
  computeOutcomeFlow, classifyFailureClasses, fetchStuckWithoutHold, fetchStaleUnreviewedHolds,
  deriveDispatchReasons, evaluateReasonBand, sampleFalseCompletions, selectCohort,
  FALSE_COMPLETION_SAMPLE, OUTCOME_WINDOW_DAYS,
} from '../lib/oversight/coordinator-health-sharpenings.mjs';
import { registerOversightLoop } from '../lib/oversight/coordinator-health-recompute.mjs';
// SD-FDBK-FIX-WORKER-ENGAGEMENT-RATIO-001: the engagement gauge's classifier — the SAME
// standalone module scripts/lib/capacity-inputs.mjs imports (TR-1: identical base population on
// both integration points). Computed as its own try/caught reading.engagement key in runProbe
// below, never inside computeUtilization itself — classifyBreach only ever receives
// {utilization, planAdherence, integrity}, so it structurally cannot see this new field.
import { classifyEngagementBuckets, engagementGaugeOn } from './lib/engagement-buckets.mjs';

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
  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: explicit .limit(POSTGREST_MAX_ROWS)
  // makes the reliance on the cap self-documenting rather than implicit on the server default.
  const { data: sessions, error } = await supabase
    .from('claude_sessions')
    .select('*')
    .order('heartbeat_at', { ascending: false })
    .limit(POSTGREST_MAX_ROWS);
  if (error) throw new Error(`utilization: claude_sessions query failed: ${error.message}`);
  const rows = sessions || [];
  const coordinatorId =
    rows.find((s) => s.metadata?.is_coordinator === true || String(s.metadata?.is_coordinator) === 'true')
      ?.session_id || null;
  const live = liveFleetWorkers(rows, coordinatorId, nowMs);
  const claimed = live.filter((s) => !!s.sd_key);
  const idle = live.filter((s) => !s.sd_key);

  // QF-20260725-089: this counted raw draft_unclaimed rows with NO eligibility gate, so HELD work
  // read as available and IDLE_WITH_BACKLOG fired against the coordinator for a dispatch gap that
  // did not exist (measured: 8 reported, 0 truly claimable, 7 human-action-held). Depth now comes
  // from the shared gauge, which applies the same claim gate the dispatcher uses. Cap protection
  // is preserved inside that helper via fetchAllPaginated.
  const { dispatchable: backlogSize, raw: rawUnclaimedDrafts } = await countDispatchableBacklog(supabase);

  return {
    live_workers: live.length,
    claimed: claimed.length,
    idle: idle.length,
    dispatchable_backlog_size: backlogSize,
    // QF-20260725-879: the UNFILTERED draft+unclaimed head-count, kept alongside the filtered
    // depth so the S4 raw-SQL cross-check can compare like with like (see its use below).
    raw_unclaimed_drafts: rawUnclaimedDrafts,
    // SD-FDBK-FIX-WORKER-ENGAGEMENT-RATIO-001: the RAW session rows + resolved coordinatorId this
    // query already computed, so runProbe's engagement-gauge step (TR-1: same base population as
    // the forecaster side) reuses this exact snapshot instead of issuing a second claude_sessions
    // read or re-deriving the coordinator. Not consumed by classifyBreach (which receives only
    // utilization/planAdherence/integrity) — additive, no existing field touched.
    _rows: rows,
    _coordinatorId: coordinatorId,
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
  // SD-LEO-INFRA-ROADMAP-LINK-COUNTED-EXCEPTION-001 (FR-5): a recorded exception that nothing
  // READS is no exception at all — the precedent is quick_fixes.force_completed, which has five
  // writers and zero production JS readers. So the count is surfaced HERE, beside the adherence
  // number, and it is fetched BEFORE the branch below because the unmeasurable branch returns
  // early: a field added only to the measured branch reads `undefined` whenever there are zero
  // claimable leaves. `without_reason` is the figure to drive to zero — NOT `total`, since the
  // bypass stays legitimately available and its total is expected to remain non-zero.
  const roadmap_link_exceptions = await countRoadmapLinkExceptionsLive(supabase);
  if (result.coverage === null) {
    return {
      status: 'unmeasurable_until_linkage', coverage: null, linked: result.linked, total: result.total,
      roadmap_link_exceptions,
    };
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
    roadmap_link_exceptions,
  };
}

/**
 * IO for FR-5's counter. Paginated (the 1000-row PostgREST cap would otherwise silently
 * under-count on a table of this size) and FAIL-SOFT — a fault returns zeros rather than
 * throwing, because this gauge is advisory and must never break the health probe.
 * The tally itself is the shared pure function, not a re-derivation.
 */
async function countRoadmapLinkExceptionsLive(supabase) {
  try {
    const { fetchAllPaginated } = await import('../lib/db/fetch-all-paginated.mjs');
    const rows = await fetchAllPaginated(() => supabase
      .from('strategic_directives_v2')
      .select('sd_key, metadata')
      .not('metadata->roadmap_link_exception', 'is', null)
      .order('sd_key', { ascending: true }));
    return countRoadmapLinkExceptions(rows || []);
  } catch {
    return { total: 0, with_reason: 0, without_reason: 0, unmeasured: true };
  }
}

/**
 * QF-20260805-181: coordinator LIVENESS. Every field above is worker- or backlog-scoped, so a
 * dead coordinator read identically to a healthy one (measured: 13h dark, five probe runs inside
 * the window all reported integrity_ok=true).
 *
 * Key on last_tool_at, NEVER heartbeat_at: a tick daemon stamps the heartbeat fresh while the
 * seat sits frozen at an interactive prompt, which is the exact class that went unseen.
 * Resolve via the narrow metadata.is_coordinator filter — not getActiveCoordinatorId (returns
 * the fixture 'sess-987', separate defect), and not the capped 1000-row page above.
 * Every unmeasurable outcome fails loud under its own reason: an unreadable instrument must not
 * look like a healthy coordinator, and a null age must never narrate as a fresh 0.
 */
export const COORDINATOR_LIVENESS_MAX_AGE_MINUTES = 30;

export async function computeCoordinatorLiveness(supabase, { nowMs = Date.now() } = {}) {
  const base = { coordinator_session_id: null, coordinator_last_tool_age_minutes: null, coordinator_liveness_ok: false };
  const { data, error } = await supabase
    .from('claude_sessions')
    .select('session_id, last_tool_at, heartbeat_at')
    .eq('metadata->>is_coordinator', 'true')
    .order('heartbeat_at', { ascending: false })
    .limit(1);
  if (error) return { ...base, reason: 'query_failed', error: error.message };
  const row = (data || [])[0];
  if (!row) return { ...base, reason: 'no_coordinator_row' };
  if (!row.last_tool_at) return { ...base, coordinator_session_id: row.session_id, reason: 'last_tool_at_missing' };
  const ageMinutes = (nowMs - new Date(row.last_tool_at).getTime()) / 60000;
  if (!Number.isFinite(ageMinutes)) {
    return { ...base, coordinator_session_id: row.session_id, reason: 'last_tool_at_unparseable' };
  }
  const ok = ageMinutes <= COORDINATOR_LIVENESS_MAX_AGE_MINUTES;
  return {
    coordinator_liveness_ok: ok,
    coordinator_session_id: row.session_id,
    coordinator_last_tool_age_minutes: Math.round(ageMinutes * 10) / 10,
    ...(ok ? {} : { reason: 'last_tool_at_stale' }),
  };
}

/**
 * Pure merge (QF-20260805-181). Liveness rides ON the integrity verdict rather than becoming a
 * second breach axis, so classifyBreach's `integrity_ok === false` test and the advisory's
 * divergent_fields rendering both carry it with no further wiring. ALARM goes to stderr so it
 * never corrupts the JSON payload main() writes to stdout.
 */
export function applyCoordinatorLiveness(integrity, liveness) {
  const merged = {
    ...integrity,
    coordinator_session_id: liveness.coordinator_session_id,
    coordinator_last_tool_age_minutes: liveness.coordinator_last_tool_age_minutes,
  };
  if (liveness.coordinator_liveness_ok !== false) return merged;
  console.error(`[adam-coordinator-health] ALARM coordinator_liveness: ${liveness.reason} (coordinator=${liveness.coordinator_session_id ?? 'none'}, last_tool_age_minutes=${liveness.coordinator_last_tool_age_minutes ?? 'null'}, threshold=${COORDINATOR_LIVENESS_MAX_AGE_MINUTES}m)`);
  return {
    ...merged,
    integrity_ok: false,
    coordinator_liveness_reason: liveness.reason,
    divergent_fields: [...(integrity.divergent_fields || []), 'coordinator_liveness'],
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
  // FR-6 batch 9: GAUGE — exact head-count, never rows.length on an unbounded read (this
  // query previously had no .limit() at all, so it silently truncated at the PostgREST
  // 1000-row cap on a growing table; a truncated "recomputed" count here would corrupt the
  // exact invariant this KPI is built on). count===null (measurement failure, possibly with
  // error===null on a missing-relation edge case) is surfaced as integrity_ok=false too, per
  // this function's own "MUST NEVER be null-coalesced into a silent 0" contract above.
  // QF-20260725-089: recomputed now runs through the SAME eligibility gate as self_reported
  // (previously a raw draft_unclaimed head-count), so the two sides finally measure the same thing.
  let dispatchableCount;
  try {
    ({ dispatchable: dispatchableCount } = await countDispatchableBacklog(supabase));
  } catch (error) {
    return { integrity_ok: false, error: error.message, divergent_fields: ['dispatchable_count'] };
  }
  const recomputed = { dispatchable_count: dispatchableCount };

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

  // QF-20260725-089: ANY inequality is now a divergence.
  //
  // The prior rule flagged only self_reported > recomputed, justified (QF-20260720-161) by the
  // "healthy narrowing invariant": recomputed was the RAW draft_unclaimed count and self_reported
  // was the narrowed one, so self_reported <= recomputed was expected and a wide gap was tolerated
  // if roughly explained by known holds. That asymmetry is obsolete now that recomputed runs
  // through the SAME eligibility gate — both sides measure the identical quantity, so any
  // disagreement is a real instrument fault, not expected narrowing.
  //
  // It also had to go: the tolerated direction is exactly how 8-vs-0 passed. recomputed=8,
  // self_reported=0 never tripped `selfReported > recomputed`, and the unexplained-gap heuristic
  // computed 8-0-7=1 (12.5%, under its 50% threshold), so the audit returned integrity_ok=true
  // with divergent_fields=[] while staring at an 8-vs-0 disagreement. Exact equality subsumes that
  // heuristic and is strictly stronger, so instrument_suspect retires with it.
  const divergentFields = Object.keys(recomputed).filter((k) => (selfReported[k] ?? 0) !== recomputed[k]);

  return {
    integrity_ok: divergentFields.length === 0,
    recomputed,
    self_reported: selfReported,
    divergent_fields: divergentFields,
    // Retained for observability — it explains WHY depth is low, and is no longer arithmetic input.
    ...(humanActionHeld !== null ? { human_action_held: humanActionHeld } : {}),
  };
}

/** Pure: a breach requires idle workers AND a non-empty backlog together (never idle alone).
 *
 * SD-LEO-INFRA-COORDINATOR-HEALTH-BREACH-001: planBreach is COMPUTED AND REPORTED but no
 * longer breach arithmetic — the retired-axis rule. READER: the breach flag's consumers
 * (advisory subject, persistReading score, the coordinator-performance drive-state axis) —
 * every breach:true must be actionable on a CANONICAL axis. CLAUDE_ADAM.md 2a retired raw
 * stamped-% as the KPI-2 target ("unstamped != off-plan"); the dispatch reason-code BAND is
 * the scoring and band_breach is its axis in the assembled breach. Witnessed 2026-08-10
 * 05:5xZ: coverage 3/27=11% fired breach:true alone every 6h in a feedback-band-heavy
 * window — the ack-and-skip alarm-fatigue class. Plan starvation still alarms canonically
 * via the plan-drift-coverage gauge trip (gauge-registry.js, pinned two-sided) — this flag
 * was a DUPLICATE alarm on the retired axis. Mirrors the human_action_held precedent above:
 * retained for observability, no longer arithmetic input.
 */
export function classifyBreach({ utilization, planAdherence, integrity }) {
  const idleWithBacklog = utilization.idle > 0 && utilization.dispatchable_backlog_size > 0;
  const integrityBreach = integrity.integrity_ok === false;
  const planBreach = planAdherence.status === 'measured' && planAdherence.starved === true;
  return { breach: idleWithBacklog || integrityBreach, idleWithBacklog, integrityBreach, planBreach };
}

/**
 * Pure row-builder for the propose-only advisory (mirrors gauge-runner.mjs's
 * buildPlanDriftAdvisoryRows shape — a testable pure function, DB write kept separate).
 * NEVER calls a claim/dispatch function (CONST-002). Targets the coordinator only — per the
 * established convention (gauge-runner.mjs's pushPlanDriftAdvisory), the coordinator IS the
 * chairman-facing surface (single pane of glass); there is no separate resolvable "chairman
 * session".
 */
export function buildCoordinatorHealthAdvisoryRows(
  reading,
  {
    coordinatorId,
    // QF-20260726-536: sender_session was OMITTED, so every advisory arrived
    // UNATTRIBUTED and therefore PERMANENTLY UN-ACKABLE — resolveAdvisorySingleton
    // (lib/coordinator/adam-advisory-store.cjs:110) returns early when
    // sender_session is absent, so the row can never be grouped or retired and
    // sits in the resurface pool forever. Against a lane with per-row manual
    // acking that is not noise, it is noise that CANNOT be cleared, and it
    // accumulates monotonically — one permanent resident per health probe.
    //
    // Same default-parameter shape as the sibling Adam writer
    // (adam-adherence-staleness-check.mjs:90): the env session when present, a
    // stable named fallback otherwise, so cron-driven runs are attributed and
    // ackable too rather than falling back to null.
    senderSession = process.env.CLAUDE_SESSION_ID || 'adam-coordinator-health-cron',
  }
) {
  const which = [
    reading.breach.idleWithBacklog && 'idle workers + non-empty dispatchable backlog',
    reading.breach.integrityBreach && `fail-loud integrity divergence (${(reading.integrity.divergent_fields || []).join(', ')})`,
    // SD-LEO-INFRA-COORDINATOR-HEALTH-BREACH-001: context, never the breach cause — this
    // line only renders when a CANONICAL axis fired the advisory, and its wording must not
    // read as the reason (the retired-axis rule; the plan-drift-coverage gauge is where
    // plan starvation alarms canonically).
    reading.breach.planBreach && `context: plan-adherence starved (coverage ${(reading.plan_adherence.coverage * 100).toFixed(1)}%) — observability, not a breach axis`,
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
    // QF-20260726-536: THE FIX — without this the row is un-ackable and immortal.
    sender_session: senderSession,
    // Top-level column too, so readers querying .body (the ack path selects it —
    // lib/coordinator/adam-action-ack.cjs:247) see the diagnostic instead of null.
    // This is a COPY of the string already in payload.body, not new content: the
    // bodies were never empty, only the column was unset, and reading .body while
    // the report sits in payload.body is a wrong-field read, not a missing body.
    body,
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
  let stuckRows = []; let staleHoldRows = []; let staleHoldError = null; let falseCompletionSample = null;
  try { outcomeFlow = await computeOutcomeFlow(supabase, { nowMs }); } catch (e) { outcomeFlow = { status: 'error', error: e.message }; }
  try {
    // S3 classifies the SAME first-claim-in-window cohort KPI-0 measures —
    // currently-claimed rows are the wrong source (claiming_session_id clears on
    // completion/release, live-verified as an all-zeros distribution).
    const sinceIso = new Date(nowMs - (OUTCOME_WINDOW_DAYS + 21) * 24 * 60 * 60 * 1000).toISOString();
    // NOTE: provenance_source is a feedback-table column, NOT an SD column — selecting
    // it here 400s the whole query (live-verified; the fail-soft catch masked it).
    // FR-6 batch 9: strategic_directives_v2 grows past the PostgREST 1000-row cap; the dead
    // .limit(2000) never bounded it (server clamps to 1000) — same class as coordinator-
    // health-sharpenings.mjs's computeOutcomeFlow (fixed FR-6 batch 8). Paginate; the
    // enclosing try/catch already mirrors the prior fail-open policy (band_ok:true on error).
    const data = await fetchAllPaginated(() => supabase
      .from('strategic_directives_v2')
      .select('sd_key, metadata, created_at')
      .gte('created_at', sinceIso)
      .order('id', { ascending: true })); // unique tiebreaker (FR-6)
    dispatchReasons = deriveDispatchReasons(selectCohort(data, nowMs));
    bandVerdict = evaluateReasonBand(dispatchReasons);
  } catch (e) { bandVerdict = { band_ok: true, error: e.message }; }
  // SD-LEO-INFRA-AGE-GAUGE-NON-001 FR-3b: preserve the error like the two sibling fetches in
  // this function already do — a query failure collapsing to [] was indistinguishable from a
  // genuinely clean result and nearly mis-diagnosed the RCA specimen as a detector bug.
  let stuckRowsError = null;
  try { stuckRows = await fetchStuckWithoutHold(supabase, { nowMs }); } catch (e) { stuckRows = []; stuckRowsError = e.message; }
  try { staleHoldRows = await fetchStaleUnreviewedHolds(supabase, { nowMs }); } catch (e) { staleHoldRows = []; staleHoldError = e.message; }
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
  const failureClasses = classifyFailureClasses({ outcomeFlow, utilization, integrity, stuckRows, staleHoldRows, falseCompletionSample });
  return {
    outcomeFlow, dispatchReasons, bandVerdict, failureClasses,
    // FR-3b: distinguishable from a genuinely clean run — null on success, the fetch error otherwise.
    stuck_fetch_error: stuckRowsError, stale_hold_fetch_error: staleHoldError,
  };
}

export async function runProbe(supabase, opts = {}) {
  const utilization = await computeUtilization(supabase, opts);
  // SD-FDBK-FIX-WORKER-ENGAGEMENT-RATIO-001 (FR-5): own try/catch, mirroring computeFailLoudIntegrity's
  // pattern rather than the unguarded computeUtilization call above — a defect here must never blank
  // KPI-0/1/2/3 persistence for the whole probe run. Reuses utilization._rows (TR-1: same base
  // population as the forecaster side) rather than a second claude_sessions read. isClaimed mirrors
  // this KPI's own documented current-claim signal (!!s.sd_key, see computeUtilization's docblock) —
  // classifyBreach below is unaffected: it destructures {utilization, planAdherence, integrity} only.
  let engagement;
  try {
    engagement = engagementGaugeOn()
      ? classifyEngagementBuckets(utilization._rows || [], {
          coordinatorId: utilization._coordinatorId ?? null,
          now: opts.nowMs ?? Date.now(),
          isClaimed: (s) => !!s.sd_key,
        })
      : { unmeasured: true, reason: 'ENGAGEMENT_GAUGE_ENABLED=false' };
  } catch (error) {
    engagement = { unmeasured: true, error: error?.message || String(error) };
  }
  const planAdherence = await computePlanAdherence(supabase);
  // QF-20260805-181: injectable seam mirrors claimableLeavesFn/gitGrep/makePgClient in this file.
  const livenessFn = opts.coordinatorLivenessFn || computeCoordinatorLiveness;
  const integrity = applyCoordinatorLiveness(
    await computeFailLoudIntegrity(supabase, opts),
    await livenessFn(supabase, opts),
  );
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
      // QF-20260725-879: compare LIKE WITH LIKE. This passed dispatchable_backlog_size — the
      // ELIGIBILITY-FILTERED depth — against a raw `status='draft' AND claiming_session_id IS
      // NULL` SQL count, so the two sides measured different quantities BY DEFINITION and their
      // difference was reported as an integrity breach (measured: probe=1 vs raw=9, both sides
      // individually correct). The raw-SQL side is the unfiltered head-count, so the probe side
      // must be the unfiltered head-count too; filtered depth is still emitted separately as
      // utilization.dispatchable_backlog_size. A breach that fires on a definitional artifact
      // trains everyone to discount recompute_ok=false, so the one time it means something it
      // gets ignored.
      const probeCounts = { in_flight: inFlightCount, draft_unclaimed: utilization.raw_unclaimed_drafts };
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
    // SD-FDBK-FIX-WORKER-ENGAGEMENT-RATIO-001 (FR-5): top-level, namespaced, additive. classifyBreach
    // (above) was already called with only {utilization, planAdherence, integrity} — it cannot see
    // this key even in a future refactor unless someone explicitly widens that call.
    engagement,
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
    // QF-20260805-181: --dry-run must not read healthier than the real run — it is the mode a
    // human invokes when asking "is the coordinator alive?", so it carries the same verdict.
    const integrity = applyCoordinatorLiveness(
      await computeFailLoudIntegrity(supabase),
      await computeCoordinatorLiveness(supabase),
    );
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
