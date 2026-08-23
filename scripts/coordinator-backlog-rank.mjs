#!/usr/bin/env node
/**
 * coordinator-backlog-rank.mjs — coordinator backlog-ordering pass (SRE duty 6).
 *
 * WHY (operator directive 2026-06-10): self-claiming workers pick by their OWN view of
 * "highest-priority workable", which does not always match critical-path order — workers grabbed
 * leaf fixes while INITIATIVE-BACKBONE (gating 5 SDs) sat orphaned. "What gets done first" must be
 * coordinator-driven by default, not correction-by-dispatch. This pass makes the coordinator's
 * ordering VISIBLE to the self-claim path.
 *
 * What it does each run:
 *   1. Loads all non-terminal SDs + dependency edges; resolves dep statuses.
 *   2. For each CLAIMABLE leaf SD (unclaimed, deps met, non-orchestrator-parent, non-test-fixture):
 *      computes an UNLOCK SCORE = how many downstream SDs are transitively blocked on it
 *      (critical-path weight — finishing it frees the most work).
 *   3. Ranks: unlock_score DESC → priority (critical>high>medium>low) → age (oldest first).
 *   4. Persists rank to strategic_directives_v2.metadata.dispatch_rank (+ dispatch_rank_at/_by)
 *      and CLEARS the rank fields on SDs that are no longer claimable (claimed/blocked/terminal)
 *      so stale ranks never steer a worker.
 *
 * CONSUMER: scripts/worker-checkin.cjs sorts v_sd_next_candidates by a FRESH dispatch_rank
 * (rank_at within RANK_TTL) before iterating — falling back to view order when absent/stale.
 *
 * Read-only with --dry-run. Fail-soft per item: a row that errors is skipped, never kills the pass.
 */
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
// SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-B / FR-2: single-writer mutation guard.
import { guardMutation, resolveOwnSessionId } from '../lib/coordinator-mutation-guard.mjs';
// SD-FDBK-INFRA-BACKLOG-RANK-EXCLUSION-001: shared fail-open classifiers so the
// ranker and the capacity forecaster exclude the same fixtures, and the ranker
// demotes bare-shell stubs. FIXTURE_RE catches epoch-stamped TEST-E2E keys; the
// bare-shell demotion uses the shared bareShellLastCompare so the test suite
// exercises the real comparator, not a re-implementation.
// SD-LEO-INFRA-CAPACITY-FORECASTER-BELT-001: isFixtureSd / isStartedSd / isUnactionableRemediationSd /
// parseSdDependencies / parentLeadPending / classifyDispatchIneligibility / resolveHoldProvenance /
// formatHoldProvenance / checkMetadataDependency moved with the leaf SSOT into claimable-leaves.mjs;
// only the ranker-specific classifiers remain imported here.
import { isBareShell, bareShellLastCompare, stripDispatchRank } from '../lib/coordinator/sd-exclusion.mjs';
import { resolveCanonicalWaveIds } from '../lib/roadmap/canonical-roadmap.js';
// SD-LEO-INFRA-ADAM-WORK-SELECTION-001 FR-2/FR-3: ONE roadmap-marker predicate, imported rather
// than re-declared. A hardcoded copy here had already drifted from the reader's list by 326 SDs.
import { isPlanLinked } from '../lib/adam/work-selection-gate.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — the terminal-ranked cleanup read below
// must not be capped; strategic_directives_v2 is the flagship growing table.
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

// SD-LEO-INFRA-CAPACITY-FORECASTER-BELT-001: the claimable-leaf SSOT moved to the client-free
// scripts/lib/claimable-leaves.mjs so the capacity forecaster can reuse the SAME predicates without
// importing this file's module-scope Supabase client. Imported locally (this file's body still calls
// blockerKeysFor + computeClaimableLeaves) AND re-exported so every existing importer of these three
// keeps resolving from this path unchanged (barrel — a bare `export … from` would not bind them here).
import { blockerKeysFor, claimableDbFreeReason, computeClaimableLeaves } from './lib/claimable-leaves.mjs';
export { blockerKeysFor, claimableDbFreeReason, computeClaimableLeaves };
// SD-LEO-INFRA-FLEET-CRITICAL-DISPATCH-LANE-001 (FR-1): the narrow, explicit fleet-critical predicate.
// metadata.fleet_critical===true marks work whose ABSENCE blocks ALL fleet progress. Exported pure so
// the band ordering is unit-testable. STRICT === true so a stray truthy value can't silently enrol.
export function isFleetCritical(d) { return (d && d.metadata || {}).fleet_critical === true; }
// SD-LEO-INFRA-CRITICAL-WALK-BLOCKER-OUTRANKS-PRODUCT-PIVOT-001 (FR-1/FR-3): the CRITICAL-WALK-BLOCKER
// band predicate — a SUPERSET of isFleetCritical that also honors two DURABLE SOURCING-TIME signals an
// Adam-sourced walk-blocker carries in its proposal metadata, so the coordinator no longer hand-sets
// fleet_critical at runtime for each one:
//   - fleet_critical          (legacy, coordinator-set; retained for the dispatch-lane audit/cap)
//   - convergence_caught      (Adam sets at sourcing when the clone-convergence loop caught a blocker)
//   - blocks_active_mission   (Adam sets at sourcing when the SD blocks the active fleet mission/walk)
// STRICT === true on every key so a stray truthy value cannot silently enrol (anti-gaming, mirrors
// isFleetCritical). Exported pure so the band ordering is unit-testable against real code.
export function isCriticalWalkBlocker(d) {
  const m = (d && d.metadata) || {};
  return m.fleet_critical === true || m.convergence_caught === true || m.blocks_active_mission === true;
}
// SD-LEO-INFRA-BELT-RANKER-PIVOT-AWARENESS-001 (FR-3): product-vs-harness class detection for the
// pivot-aware product-priority band. Pure + exported so the band ordering is unit-testable against
// real code (like isFleetCritical). Classification is by sd_key prefix; an SD that is neither is
// NEUTRAL and the band never reorders it relative to its own class.
const PRODUCT_CLASS_RE = /^SD-EHG-PRODUCT/i;
const HARNESS_CLASS_RE = /^(SD-LEO-INFRA|SD-MAN-INFRA|SD-LEARN-FIX|QF-)/i;
export function isProductClass(d) { return PRODUCT_CLASS_RE.test((d && d.sd_key) || ''); }
export function isHarnessClass(d) { return HARNESS_CLASS_RE.test((d && d.sd_key) || ''); }
// Band rank: product first (0), neutral middle (1), harness last (2). Lower sorts earlier.
export function productPivotRank(d) { return isProductClass(d) ? 0 : isHarnessClass(d) ? 2 : 1; }
// SD-LEO-INFRA-BELT-RANKER-PIVOT-AWARENESS-001 (FR-1): the band comparator.
// SD-APEXNICHE-AI-LEO-FIX-FLAG-GOVERNANCE-CLEANUP-001 (escalated from QF-20260712-716)
// graduated the product-pivot governance flag to the permanent path — the flag was
// enabled and never formally rolled back, so this is now unconditionally active.
export function productPivotCompare(a, b) {
  return productPivotRank(a) - productPivotRank(b);
}
// SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-C: pure helpers for the atomic JSONB merge
// write path. Extracted so the query shape is unit-testable without a live pg connection.
// QF-20260823-561: pure derivation of the rank-write identity, extracted so it is unit-testable
// without spawning main() end-to-end. trigger-rank-pass.mjs spawns this script with the TRIGGERING
// session's env inherited (env.CLAUDE_SESSION_ID = whichever Adam/Solomon/worker session minted an
// SD, cleared a review, or completed one), so an event-triggered pass must NEVER stamp that
// inherited id into dispatch_rank_by — downstream governance gauges (detectRoleDispatched,
// lib/governance/work-boundary-gauges.js) read a role session id there as "this role dispatched
// itself," producing belt-wide false positives (live-measured: SD-LEO-FEAT-EVA-VENTURE-IDEATION-001
// stamped dispatch_rank_by=<Adam session> at mint time). An event-triggered pass always writes
// 'coordinator'; the actual triggering session is recorded separately, never laundered into the
// writer-identity column.
export function resolveRankWriter(env = process.env) {
  const eventTriggered = env.RANK_EVENT_TRIGGER === '1';
  return {
    eventTriggered,
    writer: eventTriggered ? 'coordinator' : (env.CLAUDE_SESSION_ID || 'coordinator'),
    triggeredBy: eventTriggered ? (env.RANK_TRIGGERED_BY || null) : null,
  };
}
export function buildRankPatch(rank, nowIso, sessionId, reasonBand = null, selectionEval = null, triggeredBy = null) {
  const patch = { dispatch_rank: rank, dispatch_rank_at: nowIso, dispatch_rank_by: sessionId };
  // SD-LEO-INFRA-ADAM-WORK-SELECTION-001 FR-3: persist the roadmap evaluation ALONGSIDE the rank,
  // so the selection decision carries its own justification. A log line is not a record — it is
  // gone by the next tick, and "what displaced the plan" is exactly the question asked days later.
  // Shape kept deliberately small (the three facts a reader needs) rather than the whole verdict.
  if (selectionEval) {
    patch.work_selection = {
      plan_linked: selectionEval.plan_linked === true,
      injection_kind: selectionEval.injection_kind || null,
      displaces: selectionEval.displaces || 0,
      evaluated_at: nowIso,
    };
  }
  // QF-20260719-365: stamp the dispatch reason-band AT RANK TIME so worker SELF-claims
  // inherit it (KPI-2 plan-adherence read 3.4% dishonestly because ~95% of claims are
  // self-claims where the coordinator's dispatch decision IS the rank — there was no
  // per-claim dispatch row to carry a band). Deliberately NOT removed by
  // buildRankClearQuery: the band records why the SD was put on the belt and must
  // SURVIVE the claim (rank fields clear on claim; the band persists for the probe).
  if (reasonBand) patch.dispatch_reason_band = reasonBand;
  // QF-20260823-561: the triggering session (event-triggered passes only) — see resolveRankWriter.
  if (triggeredBy) patch.dispatch_rank_triggered_by = triggeredBy;
  return patch;
}
// QF-20260719-365: derive the dispatch reason-band from SD provenance. Pure; the vocabulary
// is the KPI-2 contract set: chairman-directed | feedback | incident | now-wave-remainder.
export function deriveReasonBand(d) {
  const m = (d && d.metadata) || {};
  const prov = [m.provenance, m.source, m.sourced_by, m.created_via, m.gold_origin, m.proposal_provenance]
    .filter(Boolean).join(' ').toLowerCase();
  if (prov.includes('chairman')) return 'chairman-directed';
  if (/^SD-FDBK-/.test((d && d.sd_key) || '') || m.source === 'feedback'
    || /\bfeedback\b|from-feedback|from-qf|qf-promoted|quick.?fix/.test(prov)) return 'feedback';
  if (/incident|\brca\b|corrective|postmortem/.test(prov)) return 'incident';
  // SD-LEO-INFRA-ADAM-WORK-SELECTION-001 FR-2: 'now-wave-remainder' now requires ROADMAP EVIDENCE
  // and can no longer be produced by falling off the end of this switch.
  //
  // It used to be the unconditional fallthrough, which inverted every reading of the gauge: a HIGH
  // now-wave-remainder share was what UNCLASSIFIABLE PROVENANCE produces — the null hypothesis —
  // not evidence of plan adherence. Measured 2026-07-28 over the real population of 134 stamped
  // SDs: 104 stamped now-wave-remainder, only 18 actually wave-linked, so 86 of 104 (82.7%) claimed
  // roadmap-remainder while linked to NO wave. A field that cannot falsify "we are working the
  // plan" was being reported as proof of it.
  //
  // This function is PURE and has no DB access, so it asserts roadmap provenance only from markers
  // already present on the row. Anything else is 'unclassified' — an honest residual that says we
  // do not know and cannot be mistaken for adherence.
  //
  // SECURITY review C4: I originally hardcoded the marker list here and claimed in a comment that
  // it matched classifyDispatchReason's — it did not (that one also admits 'lifecycle-sd-bridge'),
  // and the two had ALREADY drifted at ship time by 326 SDs. A "single source" with no importers
  // is not a single source, so this now imports the real one. isPlanLinked is a pure predicate
  // over the row, so importing it keeps this function pure and DB-free.
  //
  // KNOWN AND RECORDED (C2, for PLAN not for this commit): these markers are a WEAK proxy —
  // measured against roadmap_wave_items.promoted_to_sd_key (344 real keys) the marker test yields
  // 519 false positives and 309 false negatives, largely because 376 of 401 source∈{plan,
  // roadmap_item} rows carry created_via 'leo-create-sd' (a creation-tool default, not roadmap
  // provenance). The verifiable ground truth is one query away and the FR-3 call site already
  // holds a DB client. Keeping the writer pure is a deliberate choice here, not a constraint.
  if (isPlanLinked({ sd_key: d && d.sd_key, metadata: m })) return 'now-wave-remainder';
  return 'unclassified';
}
export function buildRankMergeQuery(rankPatch, sdKey) {
  // Adversarial review (ship gate): NULL::jsonb || '{...}'::jsonb evaluates to NULL in Postgres —
  // an unguarded merge on a row whose metadata is ever SQL NULL would silently WIPE the entire
  // blob while still reporting success. metadata is nullable (default '{}'::jsonb); COALESCE
  // makes the merge safe regardless of the column's current value.
  return {
    sql: 'UPDATE strategic_directives_v2 SET metadata = COALESCE(metadata, \'{}\'::jsonb) || $1::jsonb WHERE sd_key = $2',
    params: [JSON.stringify(rankPatch), sdKey],
  };
}
// SD-LEO-INFRA-DURABLE-PARK-EXPIRED-001 (FR-3): atomic counterpart to buildRankMergeQuery for the
// two clear-stale-rank branches below, which previously did stripDispatchRank() (a pure JS
// key-delete on an in-memory metadata snapshot) then a full-blob `.update({metadata: meta})` —
// a concurrent writer (e.g. a coordinator setting needs_coordinator_review between this
// function's initial row fetch and its clear-write) would be silently clobbered back. The `-`
// jsonb operator removes only the 3 dispatch_rank* keys server-side, so it can never depend on
// (or stomp) a stale JS-side snapshot of any other key.
export function buildRankClearQuery(sdKey) {
  return {
    sql: `UPDATE strategic_directives_v2
          SET metadata = COALESCE(metadata, '{}'::jsonb) - 'dispatch_rank' - 'dispatch_rank_at' - 'dispatch_rank_by' - 'dispatch_rank_triggered_by'
          WHERE sd_key = $1`,
    params: [sdKey],
  };
}
// SD-LEO-INFRA-DRIVE-SCORE-LEG2-001 (FR-1/TR-1/TR-2): the ranked-top-5 SNAPSHOT write, INSERT-only
// into a table separate from strategic_directives_v2.metadata (never touches the same row buildRankPatch/
// buildRankClearQuery mutate, so it structurally cannot clobber a concurrent metadata write — R5).
// sd_id is resolved server-side from sd_key via the JOIN, not passed from a JS-side id the caller does
// not have (this ranker only ever selects sd_key — claimable-leaves.mjs:73). `rank` comes from array
// position (1-based via WITH ORDINALITY), matching this loop's own `const rank = i + 1` below.
// ON CONFLICT DO NOTHING makes a retried/duplicate insert for the same (ranked_at, rank) a no-op rather
// than an error, without ever UPDATing an existing snapshot row (append-only is enforced at the DB level
// by the migration's guard trigger regardless).
export function buildRankSnapshotInsertQuery(top5SdKeys, rankedAtIso) {
  if (!Array.isArray(top5SdKeys) || top5SdKeys.length === 0) return null;
  return {
    sql: `INSERT INTO drive_rank_snapshots (ranked_at, rank, sd_id, sd_key)
          SELECT $1::timestamptz, t.ord::int, sd.id, sd.sd_key
          FROM unnest($2::text[]) WITH ORDINALITY AS t(sd_key, ord)
          JOIN strategic_directives_v2 sd ON sd.sd_key = t.sd_key
          ON CONFLICT (ranked_at, rank) DO NOTHING`,
    params: [rankedAtIso, top5SdKeys],
  };
}
// The cohort size: how many of the top-5 SD KEYS this run intended to snapshot. Exported so the
// EXEC-phase reader-side test (TS-10, TR-5) can assert a live refetch shortfall is measured against
// THIS number, not silently re-derived from whatever the refetch itself returns.
export const RANK_SNAPSHOT_TOP_N = 5;
// SD-LEO-INFRA-PROGRESS-ROLLUP-NEEDLE-PRIORITIZATION-001-C (FR-2): needle-movement prioritization.
// Reuse FR-1's rollup (active rung + per-rung progress) and the pure needle scorer to order remaining
// work active-rung-first among same-unlock candidates. Loaded fail-soft — any read error leaves the
// ranking unchanged (every SD scores 0).
import { runRollup } from '../lib/vision/rung-progress-rollup.mjs';
import { computeBuildGauge } from '../lib/vision/vdr-registry.js';
import { makeDefaultGrepSeam } from '../lib/vision/vdr-grep-seam.js';
import { needleScore, rungProgressByKey, buildSdRungMap } from '../lib/vision/needle-priority.mjs';
import { stampLastFired } from '../lib/periodic-liveness/stamp-last-fired.js';
import { planLinkageCompare } from '../lib/roadmap/plan-linkage-comparator.js';
import { committingItemBandCompare } from '../lib/roadmap/committing-item-band.js';

const DRY = process.argv.includes('--dry-run');
const PRIORITY_W = { critical: 3, high: 2, medium: 1, med: 1, low: 0 };

const sb = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);


async function main() {
  const { error, sds, byKey, depStatus, claimable } = await computeClaimableLeaves(sb);
  if (error) return;
  // dependents[dep] = [sd_keys that list dep and are not terminal]
  const dependents = new Map();
  for (const d of (sds || [])) {
    for (const k of blockerKeysFor(d)) {
      if (!dependents.has(k)) dependents.set(k, []);
      dependents.get(k).push(d.sd_key);
    }
  }
  // unlock score: transitive count of non-terminal SDs downstream of key (DFS, cycle-safe)
  function unlockScore(key) {
    const seen = new Set();
    const stack = [...(dependents.get(key) || [])];
    while (stack.length) {
      const k = stack.pop();
      if (seen.has(k) || k === key) continue;
      seen.add(k);
      stack.push(...(dependents.get(k) || []));
    }
    return seen.size;
  }

  // SD-FDBK-INFRA-BACKLOG-RANK-EXCLUSION-001: bare-shell stubs (empty/title-only description)
  // cannot pass LEAD-TO-PLAN; log them so the demote-to-last below is auditable. The sort
  // below (bareShellLastCompare as the dominant key) is what actually places them last.
  for (const d of claimable) {
    if (isBareShell(d)) console.log(`  [demote] BARE_SHELL will sort below all authored SDs (description empty or equal to title): ${d.sd_key}`);
  }

  // ── rank ──
  // INTERIM QUARANTINE (belt audit 2026-06-10): un-triaged machine-filed SDs rank BELOW all
  // human-authored work. pattern-alert-sd-creator bulk-filed 25 near-duplicate "criticals" in one
  // wave, flooding ranks #1-25 ahead of chairman program work; the generator is the known
  // false-positive-prone corrective pipeline. Sequencing is the coordinator's: priority FIELDS are
  // left untouched (Adam right-sizes them in triage), but the RANK demotes auto-generated rows
  // until a human/Adam review clears them (metadata.triaged_by set → quarantine lifts).
  const quarantined = (d) => {
    const m = d.metadata || {};
    return m.auto_generated === true && !m.triaged_by;
  };
  // SD-LEO-INFRA-ADAM-VISION-SD-FLOW-001 (FR-1): the LEAD-advancement nudge. An Adam-sourced vision-loop
  // draft (metadata.source==='proposal' AND on the vision roadmap, metadata.roadmap_phase set) is the
  // gauge-driven / weakest-capability work the chairman cares about; nudge it earlier among otherwise-
  // comparable claimable SDs so it reaches a worker for LEAD-TO-PLAN sooner. Applied AFTER unlock (never
  // overrides critical-path unlocking) and BEFORE priority/age — a tie-break boost, NOT a new ranker.
  const visionLoopDraft = (d) => {
    const m = d.metadata || {};
    return m.source === 'proposal' && !!m.roadmap_phase;
  };
  // SD-LEO-INFRA-FLEET-CRITICAL-DISPATCH-LANE-001 (FR-1/FR-2): the fleet-critical operational band.
  // metadata.fleet_critical===true is a NARROW, EXPLICIT signal — set ONLY for work whose ABSENCE
  // blocks ALL fleet progress (the worker-engagement cluster, the comms-guard, the env-fix class).
  // A fleet-health SD is correctly needle-0 (it is NOT a gauge cap — wave-stuffing it would POLLUTE
  // the VDR gauge), so under the gauge-needle sort it sinks below every MED wave-promoted REFILL and
  // gets buried, forcing manual coordinator hand-dispatch. This band is OPERATIONAL urgency —
  // ORTHOGONAL to gauge-needle (a separate axis, not a needle hack / fake rung) — and is applied
  // ABOVE unlock+needle so a fleet_critical SD reaches a worker WITHOUT polluting the gauge or
  // requiring a WORK_ASSIGNMENT. It stays BELOW the bare-shell/quarantine quality gates (a
  // fleet_critical stub still cannot pass LEAD). FR-3 anti-gaming: rationed + audited below.
  const fleetCritical = isFleetCritical;   // narrower subset — used ONLY by the FR-3 audit/cap below
  // SD-LEO-INFRA-CRITICAL-WALK-BLOCKER-OUTRANKS-PRODUCT-PIVOT-001 (FR-1): the comparator BAND uses the
  // generalized critical-walk-blocker predicate (fleet_critical | convergence_caught | blocks_active_mission)
  // so a sourcing-time walk-blocker outranks the product-pivot band WITHOUT a runtime fleet_critical hand-set.
  const criticalWalkBlocker = isCriticalWalkBlocker; // module-level exported predicate (unit-tested)

  // ── needle-movement context (FR-2) ── REUSE the FR-1 rollup for the active rung + per-rung progress,
  // and roadmap_wave_items→waves for each SD's rung. Best-effort: any failure leaves needle scores at 0
  // (ranking unchanged). The active-rung TIER does not need the build gauge; the gauge only sharpens the
  // small completion bonus, so a slow/unavailable gauge still yields correct active-rung-first ordering.
  let activeRungKey = null;
  let progByKey = {};
  let sdRungMap = {};
  try {
    const grep = makeDefaultGrepSeam();
    const computeGaugeFn = () => computeBuildGauge({ io: { supabase: sb, grep }, visionSource: true });
    const roll = await runRollup({ supabase: sb, computeGaugeFn, apply: false, log: () => {} });
    if (roll && roll.ok) {
      activeRungKey = roll.activeRungKey || null;
      progByKey = rungProgressByKey(roll.rows);
    }
    // SD-LEO-INFRA-ROADMAP-REGENERATION-DUPLICATES-001 FR-4 follow-up — same correction as
    // gauge-runner.mjs. runRollup() above is scoped; these two queries were a separate unscoped
    // read feeding buildSdRungMap, which drives needleScore and therefore backlog ORDER. I had
    // wrongly recorded this call site as fixed transitively.
    const canonicalWaveIds = await resolveCanonicalWaveIds(sb);
    const [{ data: waveItems }, { data: waves }] = canonicalWaveIds === null
      ? [{ data: [] }, { data: [] }]
      : await Promise.all([
        sb.from('roadmap_wave_items').select('promoted_to_sd_key, wave_id').in('wave_id', canonicalWaveIds).not('promoted_to_sd_key', 'is', null),
        sb.from('roadmap_waves').select('id, time_horizon, metadata').in('id', canonicalWaveIds),
      ]);
    const wavesById = Object.fromEntries((waves || []).map((w) => [w.id, w]));
    sdRungMap = buildSdRungMap(waveItems, wavesById);
    console.log(`[BACKLOG-RANK] needle context: activeRung=${activeRungKey} rungs=${Object.keys(progByKey).join(',') || 'none'} sd↦rung=${Object.keys(sdRungMap).length}`);
  } catch (e) {
    console.log(`[BACKLOG-RANK] needle context unavailable (fail-soft, ranking unchanged): ${e?.message || e}`);
  }
  const needleOf = (d) => needleScore(sdRungMap[d.sd_key], { activeRungKey, rungProgressByKey: progByKey });

  claimable.sort((a, b) => {
    // SD-FDBK-INFRA-BACKLOG-RANK-EXCLUSION-001: bare-shell stubs sort below EVERY
    // authored SD (rank-last), so a worker never self-claims a stub that cannot pass
    // LEAD-TO-PLAN. This precedes quarantine/unlock so it dominates the ordering.
    // Uses the shared comparator so the demotion is unit-tested against real code.
    const bs = bareShellLastCompare(a, b);
    if (bs !== 0) return bs;                                // authored (non-bare-shell) first
    const qa = quarantined(a) ? 1 : 0, qb = quarantined(b) ? 1 : 0;
    if (qa !== qb) return qa - qb;                          // human-authored first
    // SD-LEO-INFRA-FLEET-CRITICAL-DISPATCH-LANE-001 (FR-2) + SD-LEO-INFRA-CRITICAL-WALK-BLOCKER-OUTRANKS-
    // PRODUCT-PIVOT-001 (FR-1): the critical-walk-blocker operational band — ABOVE unlock+needle AND ABOVE
    // the product-pivot band (so a HIGH critical walk-blocker outranks a MED product note without a runtime
    // fleet_critical hand-set), BELOW the bare-shell/quarantine quality gates. The band predicate is the
    // generalized critical-walk-blocker (fleet_critical | convergence_caught | blocks_active_mission, all
    // sourcing-time). Routine (non-critical-walk-blocker) harness SDs are unaffected and keep the product-
    // pivot ordering below.
    const fa = criticalWalkBlocker(a) ? 1 : 0, fb = criticalWalkBlocker(b) ? 1 : 0;
    if (fa !== fb) return fb - fa;                          // critical-walk-blocker first
    const ua = unlockScore(a.sd_key), ub = unlockScore(b.sd_key);
    if (ub !== ua) return ub - ua;
    // SD-LEO-INFRA-PLAN-POSITION-READABLE-001 (FR-3): the committing-item BAND. The roadmap join
    // already existed below (needleOf), but it sits after productPivotCompare and so can only break
    // ties — it can never lift a committing-item child across the harness band, which is what the
    // chairman actually asked for. This band does that. Placed ABOVE productPivotCompare (the ask)
    // and BELOW unlockScore (so a committing item can never outrank its own unlocker and starve the
    // critical path — the same placement rule every other band here follows). needleOf remains below
    // as the finer-grained rung ordering WITHIN this band.
    const ci = committingItemBandCompare(a, b, sdRungMap);
    if (ci !== 0) return ci;
    // SD-LEO-INFRA-BELT-RANKER-PIVOT-AWARENESS-001 (FR-1): the pivot-aware product-priority band
    // (SD-APEXNICHE-AI-LEO-FIX-FLAG-GOVERNANCE-CLEANUP-001: graduated to always-active). Product-class SDs outrank harness-class SDs.
    // Placed AFTER unlock (never strands a critical-path unlocker) and the bare-shell/quarantine/
    // fleet_critical quality gates, and BEFORE needle/vision/priority/age.
    const pp = productPivotCompare(a, b);
    if (pp !== 0) return pp;
    // FR-2 needle-movement: among same-unlock candidates, order active-rung-first, then highest-impact-
    // on-rung-completion-first (the completion bonus). Applied AFTER unlock (never overrides critical-path
    // unlocking) and BEFORE the vision-loop nudge/priority/age. Unknown-rung SDs score 0 (neutral).
    const na = needleOf(a), nb = needleOf(b);
    if (nb !== na) return nb - na;
    // FR-1 LEAD-advancement nudge: vision-loop drafts ahead of other claimable SDs at the same unlock level.
    const va = visionLoopDraft(a) ? 1 : 0, vb = visionLoopDraft(b) ? 1 : 0;
    if (vb !== va) return vb - va;
    // SD-LEO-INFRA-PLAN-LINKAGE-BELT-001 (FR-4, chairman-ratified 2026-07-18): at equal
    // objectively-scored urgency (every comparator above tied), plan-linked work wins.
    // Additive tie-break only — never reached unless everything above is already 0.
    const pl = planLinkageCompare(a, b);
    if (pl !== 0) return pl;
    const pa = PRIORITY_W[String(a.priority || '').toLowerCase()] ?? 0;
    const pb = PRIORITY_W[String(b.priority || '').toLowerCase()] ?? 0;
    if (pb !== pa) return pb - pa;
    return new Date(a.created_at) - new Date(b.created_at); // older first
  });

  const now = new Date().toISOString();
  console.log(`[BACKLOG-RANK] ${now}${DRY ? ' (dry-run)' : ''} — ${claimable.length} claimable leaf SD(s) ranked`);

  // SD-LEO-INFRA-FLEET-CRITICAL-DISPATCH-LANE-001 (FR-3): anti-gaming audit. The fleet-critical band
  // is powerful (it jumps the whole gauge-needle backlog), so it MUST stay rationed or it becomes the
  // new "everything is HIGH" cry-wolf failure. We AUDIT every claimable member of the band (who set it
  // + why, from metadata.fleet_critical_by / _reason) and WARN past a small cap so over-stamping is
  // visible to the coordinator. Advisory-only — never alters the ranking (the band already applied).
  const FLEET_CRITICAL_CAP = 6;
  const fleetCriticalMembers = claimable.filter(fleetCritical);
  if (fleetCriticalMembers.length) {
    console.log(`[BACKLOG-RANK] fleet_critical band (${fleetCriticalMembers.length}): ` +
      fleetCriticalMembers.map(d => `${d.sd_key}[by=${(d.metadata||{}).fleet_critical_by || '?'}; why=${((d.metadata||{}).fleet_critical_reason || '?').slice(0, 40)}]`).join('; '));
    if (fleetCriticalMembers.length > FLEET_CRITICAL_CAP) {
      console.log(`[BACKLOG-RANK] ⚠️  fleet_critical OVER CAP (${fleetCriticalMembers.length} > ${FLEET_CRITICAL_CAP}) — priority-inflation / cry-wolf risk. The band is for work whose ABSENCE blocks ALL fleet progress; audit + demote over-stamped rows (clear metadata.fleet_critical).`);
    }
  }

  // SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-B / FR-2: guard rank WRITES only
  // (the SELECT/ranking reads above are always allowed). Skip the write if this session
  // is not the canonical coordinator. Fail-open on resolver error / no session_id.
  // Finding 1: env-first with disk-pointer fallback so an out-of-band run still resolves.
  //
  // SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-C: RANK_EVENT_TRIGGER=1 (set ONLY on the
  // spawned child's env by lib/coordinator/trigger-rank-pass.mjs, never on an interactive
  // process.env) bypasses this guard entirely. The guard exists to stop a rogue NON-canonical
  // coordinator daemon from double-acting on STATEFUL duties; this pass is a deterministic,
  // idempotent full re-rank, so redundant concurrent runs converge to the same output instead
  // of corrupting state. Without this bypass, an event-triggered run from a worker session is
  // blocked whenever ANY coordinator is live — the normal fleet state, not an edge case
  // (prospective testing-agent finding, PLAN phase).
  const me = resolveOwnSessionId();
  const { eventTriggered, writer: RANK_WRITER, triggeredBy: RANK_TRIGGERED_BY } = resolveRankWriter();
  if (!DRY) {
    if (eventTriggered) {
      console.log('[BACKLOG-RANK] event-triggered invocation (RANK_EVENT_TRIGGER=1) — bypassing coordinator mutation guard.');
    } else {
      const _rankGuard = await guardMutation(sb, me, 'coordinator-backlog-rank');
      if (!_rankGuard.allowed) {
        console.log('[BACKLOG-RANK] mutation blocked by coordinator guard — not the canonical coordinator; skipping writes.');
        return;
      }
    }
  }

  // SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-C: an atomic JSONB partial-merge pg Client,
  // used below instead of supabase-js's read-spread-write full-blob update. The prior pattern
  // (`{ ...(d.metadata||{}), dispatch_rank, ... }` then `.update({metadata: meta})`) read the
  // whole table once at the top of this function, then wrote a full metadata blob per row —
  // any OTHER writer (e.g. lib/coordinator/clear-coordinator-review.js) that changed a different
  // metadata key on the same row during that window was silently clobbered by this pass's stale
  // snapshot (database-agent finding, PLAN phase). A `metadata || '{...}'::jsonb` merge touches
  // only the 3 dispatch_rank* keys, so it can no longer clobber a concurrent unrelated write.
  // If the pg Client cannot connect, per-row writes are SKIPPED below (not degraded to the
  // legacy full-blob write — that would silently reintroduce the exact race this closes;
  // adversarial review, ship gate) — never lets a DB-connectivity issue hard-fail the whole pass.
  let pgClient = null;
  if (!DRY) {
    try {
      const { createDatabaseClient } = await import('./lib/supabase-connection.js');
      pgClient = await createDatabaseClient('engineer', { verify: false });
    } catch (connErr) {
      console.error(`[BACKLOG-RANK] ! atomic-merge DB client unavailable, writes will be skipped this pass: ${connErr.message}`);
    }
  }

  // QF-20260823-561: serialize the renumber against concurrent passes. Cron ticks (coordinator-
  // quiet-tick, coordinator-startup-check, backlog-rank-cron.yml) and event-triggered spawns all
  // race on this same script with no shared mutex — the per-worktree debounce lockfile in
  // trigger-rank-pass.mjs serializes nothing across worktrees or CI. Without this, two overlapping
  // passes can each write a PARTIAL, differently-numbered rank set before either finishes, leaving
  // a torn belt (live-measured: ranks {1,2,9} from two write cohorts 48s apart). Session-scoped —
  // releases automatically at pgClient.end() below. A pass that cannot acquire the lock skips
  // writes entirely (fail-soft, reuses the existing no-pgClient code paths below) rather than
  // racing; the next pass re-ranks cleanly (the algorithm is deterministic/idempotent).
  const RANK_RENUMBER_LOCK = 561082326; // stable advisory-lock key for this QF
  if (pgClient) {
    try {
      const { rows: [lockRow] } = await pgClient.query('SELECT pg_try_advisory_lock($1) AS ok', [RANK_RENUMBER_LOCK]);
      if (!lockRow?.ok) {
        console.log('[BACKLOG-RANK] another rank pass holds the renumber lock — skipping writes this pass (idempotent; next pass re-ranks).');
        try { await pgClient.end(); } catch { /* best-effort */ }
        pgClient = null;
      }
    } catch (lockErr) {
      console.error(`[BACKLOG-RANK] ! advisory lock check failed (non-blocking, proceeding without lock): ${lockErr.message}`);
    }
  }

  // SD-LEO-INFRA-ADAM-WORK-SELECTION-001 / FR-3 — THE WORK-SELECTION CHOKE.
  //
  // This is the seam, chosen over the two other candidates and recorded here so the choice is not
  // re-litigated: EVERY claimable leaf already passes through this loop every 15 minutes, the rank
  // IS the selection decision for self-claims (~95% of claims), and buildRankPatch already computes
  // a per-item band right here — so a roadmap evaluation is a sibling of work already being done,
  // not new plumbing. (worker-checkin.cjs:439 is the claim-time choke but sees one item at a time,
  // so it cannot measure DISPLACEMENT; adam-quiet-tick.mjs is genuinely empty of work-selection and
  // would have been net-new wiring.)
  //
  // It NAMES WHAT INJECTION DISPLACES and does not block or reorder — ranking authority is
  // unchanged. Injecting higher-priority work is legitimate; what was missing is that the trade was
  // invisible, so "we are working the plan" could not be falsified.
  //
  // FAIL OPEN, exactly as the outbound gate does (scripts/adam-advisory.cjs:1139-1141): a gate bug
  // must never stop the belt from being ranked.
  let selectionGate = null;
  try {
    const { evaluateWorkSelection } = await import('../lib/adam/work-selection-gate.js');
    selectionGate = evaluateWorkSelection(claimable);
    console.log(JSON.stringify({
      event: 'adam.work_selection.evaluated', verdict: selectionGate.verdict,
      checks: selectionGate.checks, reasons: selectionGate.reasons,
    }));
  } catch (gateErr) {
    // Recorded, not swallowed — a silently absent gate is the defect this SD exists to remove.
    console.error(`[BACKLOG-RANK] ! work-selection gate error (failing OPEN): ${gateErr.message}`);
  }
  const gateByKey = new Map((selectionGate?.evaluations || []).map((e) => [e.sd_key, e]));

  let writes = 0, clears = 0;
  for (let i = 0; i < claimable.length; i++) {
    const d = claimable[i];
    const rank = i + 1;
    console.log(`  #${String(rank).padStart(2)}  unlocks=${String(unlockScore(d.sd_key)).padStart(2)}  ${String(d.priority || '-').padEnd(8)} ${d.sd_key}`);
    if (DRY) continue;
    const rankPatch = buildRankPatch(rank, now, RANK_WRITER, deriveReasonBand(d), gateByKey.get(d.sd_key) || null, RANK_TRIGGERED_BY);
    try {
      if (pgClient) {
        const { sql, params } = buildRankMergeQuery(rankPatch, d.sd_key);
        await pgClient.query(sql, params);
        writes++;
      } else {
        // Adversarial review (ship gate): the previous fallback here was the original
        // read-spread-write full-blob update — it silently reintroduced the exact
        // stale-snapshot race this SD closes (a concurrent clearCoordinatorReview() write
        // landing in this window would be clobbered back). SKIPPING is the safe fail-soft
        // choice: this row simply misses a rank refresh this pass and is picked up by the
        // next cron tick or event trigger, rather than corrupting concurrent state.
        console.error(`  ! skipped ${d.sd_key}: no atomic-merge DB client available (would reintroduce a stale-write race)`);
      }
    } catch (e) { console.error(`  ! ${d.sd_key}: ${e.message}`); } // fail-soft per item
  }

  // ── SD-LEO-INFRA-DRIVE-SCORE-LEG2-001 (FR-1): snapshot the ranked top-5, INSERT-only ──
  // Placed AFTER the main write loop so the snapshot reflects the SAME rank order just written
  // (not a second, potentially-reordered pass), and reuses the SAME pgClient/`now` this run
  // already resolved — one cohort, one timestamp, one connection. Skipped identically to the
  // main loop when pgClient is unavailable (fail-soft, never a partial-write race) or when
  // claimable is empty (zero candidates → zero snapshot rows, consistent with zero rank writes —
  // R10). top-5 only: leg2_uptake's own spec is the ranked TOP-5, not the full claimable list
  // this loop ranks.
  if (!DRY && pgClient) {
    const top5SdKeys = claimable.slice(0, RANK_SNAPSHOT_TOP_N).map((d) => d.sd_key);
    const snapQuery = buildRankSnapshotInsertQuery(top5SdKeys, now);
    if (snapQuery) {
      try {
        await pgClient.query(snapQuery.sql, snapQuery.params);
        console.log(`[BACKLOG-RANK] snapshot: ${top5SdKeys.length} row(s) for cohort ranked_at=${now}`);
      } catch (e) {
        // Fail-soft: a snapshot-write failure must never abort the rank pass itself (the rank
        // writes above already succeeded and are more load-bearing than the snapshot).
        console.error(`[BACKLOG-RANK] ! snapshot insert failed (non-fatal): ${e.message}`);
      }
    }
  } else if (!DRY && !pgClient) {
    console.error('[BACKLOG-RANK] ! skipped snapshot insert: no atomic-merge DB client available');
  }

  // ── clear stale ranks on rows no longer claimable (claimed/blocked now) ──
  // FR-3: reuses the SAME pgClient (not yet closed) for an atomic key-removal, instead of the
  // former stripDispatchRank()+full-blob-update — see buildRankClearQuery for why.
  if (!DRY) {
    const rankedNow = new Set(claimable.map(d => d.sd_key));
    for (const d of (sds || [])) {
      if (rankedNow.has(d.sd_key)) continue;
      const { changed } = stripDispatchRank(d.metadata);
      if (!changed) continue;
      if (!pgClient) { console.error(`  ! skipped clear ${d.sd_key}: no atomic-merge DB client available`); continue; }
      try {
        const { sql, params } = buildRankClearQuery(d.sd_key);
        await pgClient.query(sql, params);
        clears++;
      } catch (e) { console.error(`  ! ${d.sd_key}: ${e.message}`); } // fail-soft
    }
    // SD-FDBK-INFRA-COORDINATOR-BACKLOG-RANK-001: the loop above only sees the NON-TERMINAL load (the
    // line-65 query excludes completed/cancelled/deferred), so a dispatch_rank set while an SD was
    // claimable then transitioned to terminal lingers forever (observed: cancelled
    // REMEDIATION-UNIT-TEST-003/-004 stuck at dispatch_rank=2). Sweep terminal SDs that still carry a
    // rank and clear them. Fail-soft per row; a query error skips the sweep entirely.
    try {
      // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — terminal SDs accumulate
      // without bound; a capped read here would silently leave stale dispatch_rank fields set
      // on terminal SDs past the PostgREST 1000-row boundary.
      const terminalRanked = await fetchAllPaginated(() => sb.from('strategic_directives_v2')
        .select('sd_key, metadata')
        .in('status', ['completed', 'cancelled', 'deferred'])
        .not('metadata->>dispatch_rank', 'is', null)
        .order('sd_key', { ascending: true }));
      for (const d of terminalRanked) {
        const { changed } = stripDispatchRank(d.metadata);
        if (!changed) continue;
        if (!pgClient) { console.error(`  ! skipped clear ${d.sd_key}: no atomic-merge DB client available`); continue; }
        try {
          const { sql, params } = buildRankClearQuery(d.sd_key);
          await pgClient.query(sql, params);
          clears++;
        } catch (e) { console.error(`  ! ${d.sd_key}: ${e.message}`); } // fail-soft per row
      }
    } catch { /* fail-soft: terminal-sweep query error never kills the pass */ }
  }
  if (pgClient) { try { await pgClient.end(); } catch { /* best-effort close */ } }
  console.log(`[BACKLOG-RANK] done — ${DRY ? 'no writes (dry-run)' : `${writes} rank(s) written, ${clears} stale rank(s) cleared`}`);

  // SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-C (FR-4d): event-triggered runs are spawned
  // detached with stdio:'ignore' (trigger-rank-pass.mjs), so child.on('error') only catches
  // spawn-level failures — an internal failure mid-pass would otherwise be silently invisible.
  // One fail-soft appended line closes that gap without changing the fire-and-forget contract.
  if (eventTriggered) {
    try {
      const fs = await import('node:fs');
      const logDir = new URL('../logs/', import.meta.url);
      fs.mkdirSync(logDir, { recursive: true });
      fs.appendFileSync(new URL('rank-pass-events.log', logDir),
        `${JSON.stringify({ at: now, writes, clears, dry: DRY })}\n`);
    } catch { /* observability line must never fail the pass */ }
  }

  try {
    await stampLastFired(sb, 'standard_loop:backlog-rank');
  } catch (err) {
    console.error(`[BACKLOG-RANK] stampLastFired failed (non-fatal): ${err.message}`);
  }
}

// SD-REFILL-00AH2L4Q: guard the entrypoint so the module is importable for unit tests
// (e.g. blockerKeysFor) without running the DB-touching pass. Direct `node ...mjs` still runs main().
// process.argv[1] is undefined under `node -e`/some loaders, so guard it before pathToFileURL.
const invokedDirectly = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().then(() => { /* natural drain; no process.exit (Windows undici abort) */ })
    .catch(e => { console.error('[BACKLOG-RANK] error:', e.message); });
}
