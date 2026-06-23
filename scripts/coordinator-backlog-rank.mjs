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
import { isFixtureSd, isBareShell, bareShellLastCompare, isStartedSd, stripDispatchRank } from '../lib/coordinator/sd-exclusion.mjs';
// SD-LEO-INFRA-FORECASTER-DEP-SENTINEL-BELTDEPTH-001: resolve dependency keys via the canonical
// blocker rule (the same SSOT coordinator-audit.mjs imports) so the ranker and the capacity
// forecaster AGREE on the 'no dependencies' sentinel ({sd_key:'none'} / bare 'none') and on
// free-text non-SD placeholders. parseSdDependencies returns ONLY real /^SD-/ blocker keys —
// handling both the [{sd_id}]/[{sd_key}] object and raw-string shapes the old hand-rolled
// resolver coerced, while correctly dropping the sentinel the hand-rolled one mis-counted.
import { parseSdDependencies } from '../lib/utils/parse-sd-dependencies.cjs';
// SD-REFILL-00MFWEGZ: reuse the canonical parent-LEAD-pass dispatch gate so the ranking surface
// mirrors what claim-eligibility actually blocks (no drift between rank-vs-claim).
import { parentLeadPending } from '../lib/fleet/claim-eligibility.cjs';
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
// SD-LEO-INFRA-FLEET-CRITICAL-DISPATCH-LANE-001 (FR-1): the narrow, explicit fleet-critical predicate.
// metadata.fleet_critical===true marks work whose ABSENCE blocks ALL fleet progress. Exported pure so
// the band ordering is unit-testable. STRICT === true so a stray truthy value can't silently enrol.
export function isFleetCritical(d) { return (d && d.metadata || {}).fleet_critical === true; }
// SD-LEO-INFRA-PROGRESS-ROLLUP-NEEDLE-PRIORITIZATION-001-C (FR-2): needle-movement prioritization.
// Reuse FR-1's rollup (active rung + per-rung progress) and the pure needle scorer to order remaining
// work active-rung-first among same-unlock candidates. Loaded fail-soft — any read error leaves the
// ranking unchanged (every SD scores 0).
import { runRollup } from '../lib/vision/rung-progress-rollup.mjs';
import { computeBuildGauge } from '../lib/vision/vdr-registry.js';
import { makeDefaultGrepSeam } from '../lib/vision/vdr-grep-seam.js';
import { needleScore, rungProgressByKey, buildSdRungMap } from '../lib/vision/needle-priority.mjs';

const DRY = process.argv.includes('--dry-run');
const PRIORITY_W = { critical: 3, high: 2, medium: 1, med: 1, low: 0 };

const sb = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function main() {
  const { data: sds, error } = await sb.from('strategic_directives_v2')
    // SD-FDBK-INFRA-BACKLOG-RANK-EXCLUSION-001: + title, description to classify bare-shell stubs.
    // SD-FDBK-INFRA-SHARED-FLEET-WORKER-001: + current_phase for the in-flight (started) guard.
    // SD-REFILL-00MFWEGZ: + parent_sd_id so parentLeadPending can exclude an orchestrator child
    // whose parent has not yet passed LEAD (else the field is undefined → the gate silently no-ops).
    .select('sd_key, title, description, status, sd_type, priority, created_at, current_phase, claiming_session_id, dependencies, metadata, parent_sd_id')
    .not('status', 'in', '("completed","cancelled","deferred")');
  if (error) { console.error('[BACKLOG-RANK] load failed:', error.message); return; }

  // ── dependency graph: edges dep -> dependents (over non-terminal set + completed deps resolved) ──
  const byKey = new Map((sds || []).map(d => [d.sd_key, d]));
  const depKeys = new Set();
  (sds || []).forEach(d => blockerKeysFor(d).forEach(k => depKeys.add(k)));
  let depStatus = {};
  if (depKeys.size) {
    const { data: deps } = await sb.from('strategic_directives_v2').select('sd_key,status').in('sd_key', Array.from(depKeys));
    (deps || []).forEach(d => { depStatus[d.sd_key] = d.status; });
  }
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

  // ── claimable leaves ──
  const claimable = [];
  let fixtureSkips = 0;
  let inFlightSkips = 0;
  for (const d of (sds || [])) {
    if (d.claiming_session_id) continue;
    if (d.sd_type === 'orchestrator') continue;          // parents are never dispatched
    // SD-FDBK-INFRA-SHARED-FLEET-WORKER-001 (bug d5e59236): a started/mid-build SD past the
    // initial LEAD draft (current_phase != 'LEAD') must NOT be ranked for FRESH dispatch even
    // when momentarily unclaimed (e.g. reaped mid-build) — it is resumed via worker-checkin's
    // resume_orphan path, not re-claimed from the backlog. Mirrors isSdInFlight's (a) branch.
    if (isStartedSd(d)) {                                 // in-flight SD is resumed, never fresh-ranked
      inFlightSkips++;
      console.log(`  [skip] in-flight (${d.current_phase}) excluded from fresh ranking: ${d.sd_key}`);
      continue;
    }
    // SD-FDBK-INFRA-BACKLOG-RANK-EXCLUSION-001: fixtures (epoch-stamped TEST-E2E keys or
    // metadata.is_fixture) are never ranked — they get no dispatch_rank at all.
    if (isFixtureSd(d.sd_key, d.metadata)) {             // test fixtures are never ranked
      fixtureSkips++;
      console.log(`  [skip] fixture excluded from ranking: ${d.sd_key}`);
      continue;
    }
    // SD-REFILL-00AH2L4Q: include metadata.blocked_by_sd_key (via blockerKeysFor) so a metadata-blocked
    // SD whose blocker is not yet completed is NOT ranked/dispatched — matching worker-checkin's claim guard.
    const unmet = blockerKeysFor(d)
      .filter(k => (byKey.has(k) ? byKey.get(k).status !== 'completed' : depStatus[k] !== 'completed'));
    if (unmet.length) continue;
    // SD-REFILL-00MFWEGZ: an orchestrator child whose PARENT has not passed LEAD is not yet
    // dispatchable (claim-eligibility blocks it via the same gate, and it would hit the hard
    // parent-LEAD EXEC-transition block) — exclude it from fresh ranking so the ranked belt
    // matches the actually-claimable set. parentLeadPending early-returns false for parentless
    // SDs (no fetch) and fail-opens on error (never strands a child).
    if (await parentLeadPending(sb, d)) {
      console.log(`  [skip] parent not past LEAD — child not yet dispatchable: ${d.sd_key}`);
      continue;
    }
    claimable.push(d);
  }
  if (fixtureSkips) console.log(`[BACKLOG-RANK] ${fixtureSkips} fixture SD(s) excluded from ranking`);
  if (inFlightSkips) console.log(`[BACKLOG-RANK] ${inFlightSkips} in-flight SD(s) excluded from fresh ranking`);
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
  const fleetCritical = isFleetCritical;   // module-level exported predicate (unit-tested)

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
    // SD-LEO-INFRA-FLEET-CRITICAL-DISPATCH-LANE-001 (FR-2): the fleet-critical operational band —
    // ABOVE unlock+needle (so a needle-0 fleet-health SD outranks MED wave backlog without a fake
    // rung or manual dispatch), BELOW the bare-shell/quarantine quality gates.
    const fa = fleetCritical(a) ? 1 : 0, fb = fleetCritical(b) ? 1 : 0;
    if (fa !== fb) return fb - fa;                          // fleet-critical first
    const ua = unlockScore(a.sd_key), ub = unlockScore(b.sd_key);
    if (ub !== ua) return ub - ua;
    // FR-2 needle-movement: among same-unlock candidates, order active-rung-first, then highest-impact-
    // on-rung-completion-first (the completion bonus). Applied AFTER unlock (never overrides critical-path
    // unlocking) and BEFORE the vision-loop nudge/priority/age. Unknown-rung SDs score 0 (neutral).
    const na = needleOf(a), nb = needleOf(b);
    if (nb !== na) return nb - na;
    // FR-1 LEAD-advancement nudge: vision-loop drafts ahead of other claimable SDs at the same unlock level.
    const va = visionLoopDraft(a) ? 1 : 0, vb = visionLoopDraft(b) ? 1 : 0;
    if (vb !== va) return vb - va;
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
  const me = resolveOwnSessionId();
  if (!DRY) {
    const _rankGuard = await guardMutation(sb, me, 'coordinator-backlog-rank');
    if (!_rankGuard.allowed) {
      console.log('[BACKLOG-RANK] mutation blocked by coordinator guard — not the canonical coordinator; skipping writes.');
      return;
    }
  }

  let writes = 0, clears = 0;
  for (let i = 0; i < claimable.length; i++) {
    const d = claimable[i];
    const rank = i + 1;
    console.log(`  #${String(rank).padStart(2)}  unlocks=${String(unlockScore(d.sd_key)).padStart(2)}  ${String(d.priority || '-').padEnd(8)} ${d.sd_key}`);
    if (DRY) continue;
    try {
      const meta = { ...(d.metadata || {}), dispatch_rank: rank, dispatch_rank_at: now, dispatch_rank_by: process.env.CLAUDE_SESSION_ID || 'coordinator' };
      const { error: e } = await sb.from('strategic_directives_v2').update({ metadata: meta }).eq('sd_key', d.sd_key);
      if (e) console.error(`  ! write failed for ${d.sd_key}: ${e.message}`);
      else writes++;
    } catch (e) { console.error(`  ! ${d.sd_key}: ${e.message}`); } // fail-soft per item
  }

  // ── clear stale ranks on rows no longer claimable (claimed/blocked now) ──
  if (!DRY) {
    const rankedNow = new Set(claimable.map(d => d.sd_key));
    for (const d of (sds || [])) {
      if (rankedNow.has(d.sd_key)) continue;
      const { changed, meta } = stripDispatchRank(d.metadata);
      if (!changed) continue;
      try {
        const { error: e } = await sb.from('strategic_directives_v2').update({ metadata: meta }).eq('sd_key', d.sd_key);
        if (!e) clears++;
      } catch { /* fail-soft */ }
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
        const { changed, meta } = stripDispatchRank(d.metadata);
        if (!changed) continue;
        try {
          const { error: e } = await sb.from('strategic_directives_v2').update({ metadata: meta }).eq('sd_key', d.sd_key);
          if (!e) clears++;
        } catch { /* fail-soft per row */ }
      }
    } catch { /* fail-soft: terminal-sweep query error never kills the pass */ }
  }
  console.log(`[BACKLOG-RANK] done — ${DRY ? 'no writes (dry-run)' : `${writes} rank(s) written, ${clears} stale rank(s) cleared`}`);
}

// SD-REFILL-00AH2L4Q: guard the entrypoint so the module is importable for unit tests
// (e.g. blockerKeysFor) without running the DB-touching pass. Direct `node ...mjs` still runs main().
// process.argv[1] is undefined under `node -e`/some loaders, so guard it before pathToFileURL.
const invokedDirectly = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().then(() => { /* natural drain; no process.exit (Windows undici abort) */ })
    .catch(e => { console.error('[BACKLOG-RANK] error:', e.message); });
}
