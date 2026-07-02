#!/usr/bin/env node
/**
 * adam-restart.cjs — SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-C (FR-5)
 *
 * Orchestrates a clean Adam restart/handoff and emits a structured PASS/FAIL JSON:
 *   1. FRESHNESS  — sync/freshness vs origin/main (REUSE lib/governance/checkout-freshness.js).
 *                   Advisory: a stale checkout is recorded + warned, never a hard fail (step 2
 *                   regenerates the contract, which is the Adam-relevant staleness).
 *   1.5 RELAUNCH  — OPTIONAL (SD-LEO-INFRA-COORDINATOR-ORCHESTRATED-SINGLETON-REFRESH-001-B FR-4):
 *                   only runs if deps.relaunch is provided. Produces a brand-new worktree checked
 *                   out from origin/main (lib/singleton-relaunch.js relaunchOntoFreshCheckout) —
 *                   for callers that want a FRESH-CHECKOUT relaunch rather than an in-place
 *                   restart against the current cwd. Advisory-recorded, never blocks: the
 *                   remaining steps still run against process.cwd() as before (the caller/scheduler
 *                   decides whether/when to boot a new process at the returned worktreePath).
 *                   Absent by default (backward-compatible; zero behavior change for existing
 *                   callers that don't pass deps.relaunch).
 *   2. REGENERATE — node scripts/generate-claude-md-from-db.js --only CLAUDE_ADAM.md (HARD: the
 *                   restarting Adam must read a current contract).
 *   3. REGISTER   — re-register + the single-Adam guard (FR-3). A 'refused' (a fresh prior Adam
 *                   already holds the singleton) is a FAIL — the restart should not double-run.
 *   4. CANARY     — the fresh Adam can reach the active coordinator (getActiveCoordinatorId); a
 *                   round-trip advisory ack is attempted when COORDINATOR_TWOWAY_V2=on (advisory).
 *
 * runAdamRestart(deps, opts) is INJECTABLE (every side-effecting step is a dep) so it is unit-testable
 * with no git/DB/spawn. main() wires the real implementations. Fail-soft per step; never throws.
 */
require('dotenv').config();
const { spawnSync } = require('node:child_process');
const path = require('node:path');

/** Pure-ish orchestrator over injected steps. Returns { ok, verdict, summary, steps }. */
async function runAdamRestart(deps) {
  const steps = [];
  const rec = (step, ok, detail) => { steps.push({ step, ok, detail }); };
  const fail = (summary) => ({ ok: false, verdict: 'FAIL', summary, steps });

  // 1. FRESHNESS (advisory)
  try {
    const f = await deps.checkFreshness();
    const stale = f && (f.verdict === 'STALE' || f.verdict === 'STALE-CRITICAL');
    rec('freshness', true, { verdict: (f && f.verdict) || 'UNKNOWN', advisory: stale ? 'checkout is stale vs origin/main — sync recommended (step 2 still regenerates the contract)' : 'fresh' });
  } catch (e) {
    rec('freshness', true, { warn: `fail-soft: ${e && e.message ? e.message : e}` }); // never blocks
  }

  // 1.5 RELAUNCH (optional, advisory — no behavior change unless deps.relaunch is provided)
  if (typeof deps.relaunch === 'function') {
    try {
      const r = await deps.relaunch();
      rec('relaunch', true, { worktreePath: r && r.worktreePath, branch: r && r.branch, freshness: r && r.freshness && r.freshness.verdict });
    } catch (e) {
      rec('relaunch', false, { warn: `fail-soft: ${e && e.message ? e.message : e}` }); // never blocks
    }
  }

  // 2. REGENERATE (hard)
  try {
    const g = await deps.regenerateContract();
    if (!g || g.ok === false) { rec('regenerate_contract', false, g || {}); return fail('regenerate_contract failed'); }
    rec('regenerate_contract', true, g);
  } catch (e) {
    rec('regenerate_contract', false, { error: e && e.message ? e.message : String(e) });
    return fail('regenerate_contract threw');
  }

  // 3. REGISTER + single-Adam guard (hard)
  let reg;
  try { reg = await deps.register(); }
  catch (e) { rec('register', false, { error: e && e.message ? e.message : String(e) }); return fail('register threw'); }
  if (!reg || reg.ok !== true) {
    rec('register', false, reg || {});
    return fail(reg && reg.action === 'refused' ? 'register refused — a fresh prior Adam holds the singleton' : 'register failed');
  }
  rec('register', true, { action: reg.action, retired: reg.retired || [], drained: reg.drained || 0 });

  // 4. CANARY (hard: must reach a coordinator)
  try {
    const c = await deps.canary();
    rec('canary', c && c.ok === true, c || {});
    if (!c || c.ok !== true) return fail('canary failed — fresh Adam could not reach the active coordinator');
  } catch (e) {
    rec('canary', false, { error: e && e.message ? e.message : String(e) });
    return fail('canary threw');
  }

  return { ok: true, verdict: 'PASS', summary: 'Adam restart complete (contract regenerated, single-Adam registered, coordinator reachable).', steps };
}

// ── Real-dep wiring ────────────────────────────────────────────────────────────────────────────
function realRegenerateContract() {
  const script = path.resolve(__dirname, 'generate-claude-md-from-db.js');
  const r = spawnSync('node', [script, '--only', 'CLAUDE_ADAM.md'], { encoding: 'utf8', timeout: 120000 });
  if (r.status !== 0) return { ok: false, status: r.status, stderr: (r.stderr || '').slice(-500) };
  return { ok: true, file: 'CLAUDE_ADAM.md' };
}

async function realCanary(supabase, sessionId) {
  const { getActiveCoordinatorId } = require('../lib/coordinator/resolve.cjs');
  const coordinatorId = await getActiveCoordinatorId(supabase).catch(() => null);
  const out = { ok: !!coordinatorId, coordinator_id: coordinatorId || null };
  if (!coordinatorId) { out.detail = 'no active coordinator resolved'; return out; }
  // Round-trip ack is a BONUS when two-way is enabled; never downgrades ok (coordinator reachable).
  if (process.env.COORDINATOR_TWOWAY_V2 === 'on') out.round_trip = 'two-way enabled (ack attempt deferred to adam-advisory request)';
  return out;
}

async function main() {
  const sessionId = process.env.CLAUDE_SESSION_ID;
  let supabase = null;
  try { supabase = require('../lib/supabase-client.cjs').createSupabaseServiceClient(); } catch { /* fail-soft below */ }

  const deps = {
    checkFreshness: async () => {
      const mod = await import('../lib/governance/checkout-freshness.js'); // ESM dep
      const fn = mod.checkoutFreshness || (mod.default && mod.default.checkoutFreshness);
      return fn ? fn(process.cwd()) : { verdict: 'UNKNOWN' };
    },
    regenerateContract: async () => realRegenerateContract(),
    register: async () => {
      if (!supabase) return { ok: false, action: 'error', error: 'supabase unavailable' };
      const { registerAdam } = require('./adam-register.cjs');
      return registerAdam(supabase, sessionId);
    },
    canary: async () => realCanary(supabase, sessionId),
  };

  const result = await runAdamRestart(deps);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
}

module.exports = { runAdamRestart };

if (require.main === module) {
  main().catch((e) => { console.log(JSON.stringify({ ok: false, verdict: 'FAIL', summary: `unhandled: ${e && e.message ? e.message : e}`, steps: [] }, null, 2)); process.exitCode = 1; });
}
