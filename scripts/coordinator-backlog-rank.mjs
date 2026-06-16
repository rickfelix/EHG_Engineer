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
import { createClient } from '@supabase/supabase-js';
// SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-B / FR-2: single-writer mutation guard.
import { guardMutation, resolveOwnSessionId } from '../lib/coordinator-mutation-guard.mjs';
// SD-FDBK-INFRA-BACKLOG-RANK-EXCLUSION-001: shared fail-open classifiers so the
// ranker and the capacity forecaster exclude the same fixtures, and the ranker
// demotes bare-shell stubs. FIXTURE_RE catches epoch-stamped TEST-E2E keys; the
// bare-shell demotion uses the shared bareShellLastCompare so the test suite
// exercises the real comparator, not a re-implementation.
import { isFixtureSd, isBareShell, bareShellLastCompare, isStartedSd } from '../lib/coordinator/sd-exclusion.mjs';

const DRY = process.argv.includes('--dry-run');
const PRIORITY_W = { critical: 3, high: 2, medium: 1, med: 1, low: 0 };

// Dependencies appear in TWO shapes in live data: [{sd_id:'SD-…'}] (add-prd convention) and
// raw string arrays ['SD-…'] (plan-keeper/Adam authoring). Reading only x.sd_id made this
// ranker blind to string deps — it ranked a BLOCKED child claimable and missed unlock edges
// (live catch 2026-06-10: PLAN-KEEPER-D ranked claimable while dep -C was draft). Coerce both.
const depId = (x) => (typeof x === 'string' ? x : (x && (x.sd_id || x.sd_key || x.id)) || null);

const sb = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function main() {
  const { data: sds, error } = await sb.from('strategic_directives_v2')
    // SD-FDBK-INFRA-BACKLOG-RANK-EXCLUSION-001: + title, description to classify bare-shell stubs.
    // SD-FDBK-INFRA-SHARED-FLEET-WORKER-001: + current_phase for the in-flight (started) guard.
    .select('sd_key, title, description, status, sd_type, priority, created_at, current_phase, claiming_session_id, dependencies, metadata')
    .not('status', 'in', '("completed","cancelled","deferred")');
  if (error) { console.error('[BACKLOG-RANK] load failed:', error.message); return; }

  // ── dependency graph: edges dep -> dependents (over non-terminal set + completed deps resolved) ──
  const byKey = new Map((sds || []).map(d => [d.sd_key, d]));
  const depKeys = new Set();
  (sds || []).forEach(d => (d.dependencies || []).forEach(x => { const k = depId(x); if (k) depKeys.add(k); }));
  let depStatus = {};
  if (depKeys.size) {
    const { data: deps } = await sb.from('strategic_directives_v2').select('sd_key,status').in('sd_key', Array.from(depKeys));
    (deps || []).forEach(d => { depStatus[d.sd_key] = d.status; });
  }
  // dependents[dep] = [sd_keys that list dep and are not terminal]
  const dependents = new Map();
  for (const d of (sds || [])) {
    for (const x of (d.dependencies || [])) {
      const k = depId(x);
      if (!k) continue;
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
    const unmet = (d.dependencies || []).map(depId)
      .filter(k => k && (byKey.has(k) ? byKey.get(k).status !== 'completed' : depStatus[k] !== 'completed'));
    if (unmet.length) continue;
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
  claimable.sort((a, b) => {
    // SD-FDBK-INFRA-BACKLOG-RANK-EXCLUSION-001: bare-shell stubs sort below EVERY
    // authored SD (rank-last), so a worker never self-claims a stub that cannot pass
    // LEAD-TO-PLAN. This precedes quarantine/unlock so it dominates the ordering.
    // Uses the shared comparator so the demotion is unit-tested against real code.
    const bs = bareShellLastCompare(a, b);
    if (bs !== 0) return bs;                                // authored (non-bare-shell) first
    const qa = quarantined(a) ? 1 : 0, qb = quarantined(b) ? 1 : 0;
    if (qa !== qb) return qa - qb;                          // human-authored first
    const ua = unlockScore(a.sd_key), ub = unlockScore(b.sd_key);
    if (ub !== ua) return ub - ua;
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
      if (d.metadata && d.metadata.dispatch_rank != null) {
        try {
          const meta = { ...d.metadata };
          delete meta.dispatch_rank; delete meta.dispatch_rank_at; delete meta.dispatch_rank_by;
          const { error: e } = await sb.from('strategic_directives_v2').update({ metadata: meta }).eq('sd_key', d.sd_key);
          if (!e) clears++;
        } catch { /* fail-soft */ }
      }
    }
  }
  console.log(`[BACKLOG-RANK] done — ${DRY ? 'no writes (dry-run)' : `${writes} rank(s) written, ${clears} stale rank(s) cleared`}`);
}

main().then(() => { /* natural drain; no process.exit (Windows undici abort) */ })
  .catch(e => { console.error('[BACKLOG-RANK] error:', e.message); });
