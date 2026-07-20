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
import { isFixtureSd, isBareShell, bareShellLastCompare, isStartedSd, stripDispatchRank, isUnactionableRemediationSd } from '../lib/coordinator/sd-exclusion.mjs';
// SD-LEO-INFRA-FORECASTER-DEP-SENTINEL-BELTDEPTH-001: resolve dependency keys via the canonical
// blocker rule (the same SSOT coordinator-audit.mjs imports) so the ranker and the capacity
// forecaster AGREE on the 'no dependencies' sentinel ({sd_key:'none'} / bare 'none') and on
// free-text non-SD placeholders. parseSdDependencies returns ONLY real /^SD-/ blocker keys —
// handling both the [{sd_id}]/[{sd_key}] object and raw-string shapes the old hand-rolled
// resolver coerced, while correctly dropping the sentinel the hand-rolled one mis-counted.
import { parseSdDependencies } from '../lib/utils/parse-sd-dependencies.cjs';
// SD-REFILL-00MFWEGZ: reuse the canonical parent-LEAD-pass dispatch gate so the ranking surface
// mirrors what claim-eligibility actually blocks (no drift between rank-vs-claim).
import { parentLeadPending, classifyDispatchIneligibility, resolveHoldProvenance, formatHoldProvenance } from '../lib/fleet/claim-eligibility.cjs';
// SD-REFILL-00AH2L4Q: honor the SAME canonical metadata blocker key (metadata.blocked_by_sd_key)
// that dependency-resolver + worker-checkin enforce, so the dispatch ranker does not keep a
// metadata-blocked SD on the claimable belt (the convention was inconsistently enforced fleet-wide).
import { checkMetadataDependency } from './modules/sd-next/dependency-resolver.js';

// Collect every blocker sd_key for an SD: the `dependencies` column PLUS the canonical
// metadata.blocked_by_sd_key. ONE predicate, shared by depKeys collection and the unmet check.
export function blockerKeysFor(d) {
  const keys = parseSdDependencies(d.dependencies);
  const { blockerSdKey } = checkMetadataDependency(d.metadata);
  if (blockerSdKey) keys.push(blockerSdKey);
  return keys;
}

/**
 * SD-LEO-INFRA-BACKLOG-RANK-CLAIMABLE-ELIGIBILITY-ALIGN-001: the DB-FREE claimable gate for the ranker,
 * composed so the ranked belt matches the actually-claimable set the worker resolver enforces. Returns
 * null when the SD passes every DB-free claimable axis, or a reason string when it must be excluded:
 *   - 'claimed'  — a live session already holds it (claiming_session_id set)
 *   - 'in_flight' — started/mid-build past LEAD draft (resumed via resume_orphan, never fresh-ranked)
 *   - 'fixture'  — backlog-rank's BROADER fixture detection (epoch TEST-E2E keys / metadata.is_fixture)
 *   - else the SHARED claim-eligibility reason: 'orchestrator_parent' | 'human_action_required' |
 *     'co_author_pending' | 'sd_deferred' | 'sd_terminal' | 'test_fixture_key'.
 * The shared predicate (classifyDispatchIneligibility) is the SSOT — re-implementing it is exactly how
 * the requires_human_action skip drifted out of the ranker. Pure; the DB-backed axes (dependency/metadata
 * blockers, parent-LEAD-pending) remain in the async claim loop. Exported for unit testing.
 * @param {object} d - an SD row (sd_key, sd_type, status, current_phase, claiming_session_id, metadata)
 * @returns {null|string}
 */
export function claimableDbFreeReason(d) {
  if (!d) return 'missing';
  if (d.claiming_session_id) return 'claimed';
  if (isStartedSd(d)) return 'in_flight';
  if (isFixtureSd(d.sd_key, d.metadata)) return 'fixture';
  // SD-FDBK-INFRA-RANKER-FORECAST-EXCLUSION-PARITY-001: an un-actionable auto-filed venture-remediation
  // SD (SD-LEO-FIX-REMEDIATION-* targeting a venture repo, not EHG_Engineer) cannot be actioned by any
  // fleet worker, so it must not earn a real dispatch_rank. The capacity-forecaster already excludes
  // these from belt depth via isExcludedFromBelt -> isUnactionableRemediationSd; the ranker previously
  // demoted ONLY bare-shell stubs (isBareShell), so a ~345-char remediation stub slipped through and
  // even outranked a real walk-blocker. Calling the SAME shared predicate here makes the two belts agree
  // by construction (SSOT, can't diverge). NOTE: FR-1 described a 'generated_by fr-c' criterion, but the
  // forecaster's actual detector is this key-prefix+target predicate — parity (FR-4) requires the SAME
  // predicate in both paths, so we reuse the existing SSOT rather than introduce a divergent new one
  // (spec-conflict signaled 2cde0ce8).
  if (isUnactionableRemediationSd(d)) return 'unactionable_venture_remediation';
  return classifyDispatchIneligibility(d); // null => eligible on the DB-free axes
}
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
export function buildRankPatch(rank, nowIso, sessionId, reasonBand = null) {
  const patch = { dispatch_rank: rank, dispatch_rank_at: nowIso, dispatch_rank_by: sessionId };
  // QF-20260719-365: stamp the dispatch reason-band AT RANK TIME so worker SELF-claims
  // inherit it (KPI-2 plan-adherence read 3.4% dishonestly because ~95% of claims are
  // self-claims where the coordinator's dispatch decision IS the rank — there was no
  // per-claim dispatch row to carry a band). Deliberately NOT removed by
  // buildRankClearQuery: the band records why the SD was put on the belt and must
  // SURVIVE the claim (rank fields clear on claim; the band persists for the probe).
  if (reasonBand) patch.dispatch_reason_band = reasonBand;
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
  return 'now-wave-remainder';
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
          SET metadata = COALESCE(metadata, '{}'::jsonb) - 'dispatch_rank' - 'dispatch_rank_at' - 'dispatch_rank_by'
          WHERE sd_key = $1`,
    params: [sdKey],
  };
}
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

const DRY = process.argv.includes('--dry-run');
const PRIORITY_W = { critical: 3, high: 2, medium: 1, med: 1, low: 0 };

const sb = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

/**
 * SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-D (FR-4): the claimable-leaf computation, extracted
 * out of main() so the eligible-but-unranked-leaf-count gauge (scripts/gauge-unranked-claimable-leaves.mjs)
 * reuses the SAME claimable set the ranker itself acts on — never a second re-derivation that could drift
 * from what the ranker (and therefore worker-checkin) actually considers claimable. main() below is
 * byte-identical in behavior; it now calls this function instead of inlining the fetch+filter.
 * @param {object} sb - supabase service-role client
 * @param {{ quiet?: boolean }} [opts] - QF-20260704-051: quiet=true silences the per-skip
 *   console.log lines below (still counts them) — for callers like fleet-dashboard.cjs that
 *   poll this on every render and must not spam stdout with ranker skip-reason logging.
 * @returns {Promise<{ error?: object, sds: object[], byKey: Map, depStatus: object, claimable: object[], humanActionHolds: Array<{sd_key: string, provenance: object|null}> }>}
 */
export async function computeClaimableLeaves(sb, opts = {}) {
  const log = opts.quiet ? () => {} : console.log;
  const { data: sds, error } = await sb.from('strategic_directives_v2')
    // SD-FDBK-INFRA-BACKLOG-RANK-EXCLUSION-001: + title, description to classify bare-shell stubs.
    // SD-FDBK-INFRA-SHARED-FLEET-WORKER-001: + current_phase for the in-flight (started) guard.
    // SD-REFILL-00MFWEGZ: + parent_sd_id so parentLeadPending can exclude an orchestrator child
    // whose parent has not yet passed LEAD (else the field is undefined → the gate silently no-ops).
    .select('sd_key, title, description, status, sd_type, priority, created_at, current_phase, claiming_session_id, dependencies, metadata, parent_sd_id')
    .not('status', 'in', '("completed","cancelled","deferred")');
  if (error) { console.error('[BACKLOG-RANK] load failed:', error.message); return { error, sds: [], byKey: new Map(), depStatus: {}, claimable: [], humanActionHolds: [] }; }

  // ── dependency graph: edges dep -> dependents (over non-terminal set + completed deps resolved) ──
  const byKey = new Map((sds || []).map(d => [d.sd_key, d]));
  const depKeys = new Set();
  (sds || []).forEach(d => blockerKeysFor(d).forEach(k => depKeys.add(k)));
  let depStatus = {};
  if (depKeys.size) {
    const { data: deps } = await sb.from('strategic_directives_v2').select('sd_key,status').in('sd_key', Array.from(depKeys));
    (deps || []).forEach(d => { depStatus[d.sd_key] = d.status; });
  }

  // ── claimable leaves ──
  const claimable = [];
  // QF-20260704-193: held SDs with their coalesced provenance, returned so consumers
  // (fleet-dashboard) can SURFACE hold reasons instead of rendering nothing.
  const humanActionHolds = [];
  let fixtureSkips = 0;
  let inFlightSkips = 0;
  let awaitingConvergenceSkips = 0;
  let humanActionSkips = 0;
  let ineligibleSkips = 0;
  let depBlockedSkips = 0;
  for (const d of (sds || [])) {
    // SD-LEO-INFRA-BACKLOG-RANK-CLAIMABLE-ELIGIBILITY-ALIGN-001: the DB-free claimable axes (claimed /
    // in-flight / fixture / the SHARED claim-eligibility predicate) are computed by one pure helper so
    // the ranked belt matches the actually-claimable set the worker resolver enforces. The shared
    // predicate (classifyDispatchIneligibility) closes the drift that was missing the requires_human_action
    // skip — RHA-held SDs were leaking onto 'claimable', inflating belt depth and masking genuine
    // starvation behind a deliberate all-held state.
    const dbFreeSkip = claimableDbFreeReason(d);
    if (dbFreeSkip) {
      switch (dbFreeSkip) {
        case 'claimed': break;                              // claimed by a live session — silent (not a skip-log)
        case 'in_flight':
          inFlightSkips++;
          log(`  [skip] in-flight (${d.current_phase}) excluded from fresh ranking: ${d.sd_key}`);
          break;
        case 'fixture':
          fixtureSkips++;
          log(`  [skip] fixture excluded from ranking: ${d.sd_key}`);
          break;
        case 'co_author_pending':
          // NOT idle-belt depth: a co-authored SD awaiting convergence would let a parked worker write
          // the PRD before the co-author input lands (SD-LEO-INFRA-CO-AUTHOR-CONVERGE-BEFORE-CLAIMABLE-001).
          awaitingConvergenceSkips++;
          log(`  [skip] awaiting co-author convergence (not idle-belt depth): ${d.sd_key}`);
          break;
        case 'human_action_required': {
          humanActionSkips++;
          // QF-20260704-193: the hold reasons already EXIST under ad-hoc metadata keys —
          // print them so a 3 AM operator can tell deliberate parking from an accidental
          // freeze without hand-querying metadata (live: 47 rha-frozen sprint children).
          const prov = resolveHoldProvenance(d.metadata);
          humanActionHolds.push({ sd_key: d.sd_key, provenance: prov });
          log(`  [skip] requires human action — not worker-claimable (not idle-belt depth): ${d.sd_key} [${formatHoldProvenance(prov)}]`);
          break;
        }
        default:
          ineligibleSkips++;
          log(`  [skip] dispatch-ineligible (${dbFreeSkip}): ${d.sd_key}`);
      }
      continue;
    }
    // SD-REFILL-00AH2L4Q: include metadata.blocked_by_sd_key (via blockerKeysFor) so a metadata-blocked
    // SD whose blocker is not yet completed is NOT ranked/dispatched — matching worker-checkin's claim guard.
    const unmet = blockerKeysFor(d)
      .filter(k => (byKey.has(k) ? byKey.get(k).status !== 'completed' : depStatus[k] !== 'completed'));
    if (unmet.length) {
      // QF-20260703-999: this exclusion previously had NO skip-log (unlike every other exclusion
      // reason above), so a dep-blocked SD vanished from both ranked and skip output with zero trace.
      depBlockedSkips++;
      log(`  [skip] dependency-blocked (${unmet.join(', ')}): ${d.sd_key}`);
      continue;
    }
    // SD-REFILL-00MFWEGZ: an orchestrator child whose PARENT has not passed LEAD is not yet
    // dispatchable (claim-eligibility blocks it via the same gate, and it would hit the hard
    // parent-LEAD EXEC-transition block) — exclude it from fresh ranking so the ranked belt
    // matches the actually-claimable set. parentLeadPending early-returns false for parentless
    // SDs (no fetch) and fail-opens on error (never strands a child).
    if (await parentLeadPending(sb, d)) {
      log(`  [skip] parent not past LEAD — child not yet dispatchable: ${d.sd_key}`);
      continue;
    }
    claimable.push(d);
  }
  if (fixtureSkips) log(`[BACKLOG-RANK] ${fixtureSkips} fixture SD(s) excluded from ranking`);
  if (inFlightSkips) log(`[BACKLOG-RANK] ${inFlightSkips} in-flight SD(s) excluded from fresh ranking`);
  if (awaitingConvergenceSkips) log(`[BACKLOG-RANK] ${awaitingConvergenceSkips} SD(s) awaiting co-author convergence (excluded from claimable depth)`);
  if (humanActionSkips) log(`[BACKLOG-RANK] ${humanActionSkips} SD(s) requiring human action excluded from claimable depth (not worker-claimable)`);
  if (ineligibleSkips) log(`[BACKLOG-RANK] ${ineligibleSkips} SD(s) dispatch-ineligible (orchestrator-parent / deferred / terminal) excluded from claimable depth`);
  if (depBlockedSkips) log(`[BACKLOG-RANK] ${depBlockedSkips} SD(s) dependency-blocked excluded from claimable depth`);
  // Deterministic order (adversarial-review I4): the select has no .order(), so without
  // this sort the dashboard's grouped render could reorder between ticks and defeat the
  // steady-state suppress hash.
  humanActionHolds.sort((a, b) => a.sd_key.localeCompare(b.sd_key));
  return { sds, byKey, depStatus, claimable, humanActionHolds };
}

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
    const [{ data: waveItems }, { data: waves }] = await Promise.all([
      sb.from('roadmap_wave_items').select('promoted_to_sd_key, wave_id').not('promoted_to_sd_key', 'is', null),
      sb.from('roadmap_waves').select('id, time_horizon, metadata'),
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
  const eventTriggered = process.env.RANK_EVENT_TRIGGER === '1';
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

  let writes = 0, clears = 0;
  for (let i = 0; i < claimable.length; i++) {
    const d = claimable[i];
    const rank = i + 1;
    console.log(`  #${String(rank).padStart(2)}  unlocks=${String(unlockScore(d.sd_key)).padStart(2)}  ${String(d.priority || '-').padEnd(8)} ${d.sd_key}`);
    if (DRY) continue;
    const rankPatch = buildRankPatch(rank, now, process.env.CLAUDE_SESSION_ID || 'coordinator', deriveReasonBand(d));
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
      const { data: terminalRanked } = await sb.from('strategic_directives_v2')
        .select('sd_key, metadata')
        .in('status', ['completed', 'cancelled', 'deferred'])
        .not('metadata->>dispatch_rank', 'is', null);
      for (const d of (terminalRanked || [])) {
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
