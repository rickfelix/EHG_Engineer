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

const DRY = process.argv.includes('--dry-run');
const PRIORITY_W = { critical: 3, high: 2, medium: 1, med: 1, low: 0 };
const FIXTURE_RE = /^SD-(TEST|DEMO|SWITCH-OLD)\b|^SD-LEO-FEAT-TEST-E2E-/;

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
    .select('sd_key, status, sd_type, priority, created_at, claiming_session_id, dependencies, metadata')
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
  for (const d of (sds || [])) {
    if (d.claiming_session_id) continue;
    if (d.sd_type === 'orchestrator') continue;          // parents are never dispatched
    if (FIXTURE_RE.test(d.sd_key)) continue;             // test fixtures are never ranked
    const unmet = (d.dependencies || []).map(depId)
      .filter(k => k && (byKey.has(k) ? byKey.get(k).status !== 'completed' : depStatus[k] !== 'completed'));
    if (unmet.length) continue;
    claimable.push(d);
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
  claimable.sort((a, b) => {
    const qa = quarantined(a) ? 1 : 0, qb = quarantined(b) ? 1 : 0;
    if (qa !== qb) return qa - qb;                          // human-authored first
    const ua = unlockScore(a.sd_key), ub = unlockScore(b.sd_key);
    if (ub !== ua) return ub - ua;
    const pa = PRIORITY_W[String(a.priority || '').toLowerCase()] ?? 0;
    const pb = PRIORITY_W[String(b.priority || '').toLowerCase()] ?? 0;
    if (pb !== pa) return pb - pa;
    return new Date(a.created_at) - new Date(b.created_at); // older first
  });

  const now = new Date().toISOString();
  console.log(`[BACKLOG-RANK] ${now}${DRY ? ' (dry-run)' : ''} — ${claimable.length} claimable leaf SD(s) ranked`);
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
