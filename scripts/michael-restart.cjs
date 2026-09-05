#!/usr/bin/env node
/**
 * michael-restart.cjs — SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-A (FR-5)
 *
 * Copy of scripts/adam-restart.cjs (SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-C FR-5) for the
 * Michael seat. Orchestrates a clean restart/handoff and emits a structured PASS/FAIL JSON:
 *   1. FRESHNESS  — advisory checkout freshness vs origin/main.
 *   1.5 RELAUNCH  — OPTIONAL, only when deps.relaunch is provided (fresh-checkout relaunch).
 *   2. REGENERATE — node scripts/generate-claude-md-from-db.js --only CLAUDE_MICHAEL.md,CLAUDE_MICHAEL_MODEL_POSTURE.md
 *                   (HARD: the restarting Michael must read a current contract AND its BINDING posture).
 *   3. REGISTER   — re-register under the single-Michael guard. A 'refused' (a fresh prior Michael
 *                   holds the singleton) is a FAIL — the restart must not double-run.
 *   4. CANARY     — the fresh Michael can reach the active coordinator (advisory round-trip when
 *                   COORDINATOR_TWOWAY_V2=on). Michael never SENDS to the fleet; this only proves the
 *                   coordinator is resolvable so directed michael_handoff rows can reach the seat.
 *
 * runMichaelRestart(deps) is INJECTABLE (every side-effecting step is a dep) so it is unit-testable
 * with no git/DB/spawn. main() wires the real implementations. Fail-soft per step; never throws.
 */
require('dotenv').config();
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const CONTRACT_FILES = ['CLAUDE_MICHAEL.md', 'CLAUDE_MICHAEL_MODEL_POSTURE.md'];

/** Pure-ish orchestrator over injected steps. Returns { ok, verdict, summary, steps }. */
async function runMichaelRestart(deps) {
  const steps = [];
  const rec = (step, ok, detail) => { steps.push({ step, ok, detail }); };
  const fail = (summary) => ({ ok: false, verdict: 'FAIL', summary, steps });

  // 1. FRESHNESS (advisory)
  try {
    const f = await deps.checkFreshness();
    const stale = f && (f.verdict === 'STALE' || f.verdict === 'STALE-CRITICAL');
    rec('freshness', true, { verdict: (f && f.verdict) || 'UNKNOWN', advisory: stale ? 'checkout is stale vs origin/main — sync recommended (step 2 still regenerates the contract)' : 'fresh' });
  } catch (e) {
    rec('freshness', true, { warn: `fail-soft: ${e && e.message ? e.message : e}` });
  }

  // 1.5 RELAUNCH (optional, advisory)
  if (typeof deps.relaunch === 'function') {
    try {
      const r = await deps.relaunch();
      rec('relaunch', true, { worktreePath: r && r.worktreePath, branch: r && r.branch, freshness: r && r.freshness && r.freshness.verdict });
    } catch (e) {
      rec('relaunch', false, { warn: `fail-soft: ${e && e.message ? e.message : e}` });
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

  // 3. REGISTER + single-Michael guard (hard)
  let reg;
  try { reg = await deps.register(); }
  catch (e) { rec('register', false, { error: e && e.message ? e.message : String(e) }); return fail('register threw'); }
  if (!reg || reg.ok !== true) {
    rec('register', false, reg || {});
    return fail(reg && reg.action === 'refused' ? 'register refused — a fresh prior Michael holds the singleton' : 'register failed');
  }
  rec('register', true, { action: reg.action, retired: reg.retired || [], drained: reg.drained || 0, account_profile: reg.account_profile || null });

  // 4. CANARY (hard: must resolve a coordinator)
  try {
    const c = await deps.canary();
    rec('canary', c && c.ok === true, c || {});
    if (!c || c.ok !== true) return fail('canary failed — fresh Michael could not resolve the active coordinator');
  } catch (e) {
    rec('canary', false, { error: e && e.message ? e.message : String(e) });
    return fail('canary threw');
  }

  return { ok: true, verdict: 'PASS', summary: 'Michael restart complete (contract + posture regenerated, single-Michael registered, coordinator resolvable).', steps };
}

// ── Real-dep wiring ────────────────────────────────────────────────────────────────────────────
function realRegenerateContract() {
  const script = path.resolve(__dirname, 'generate-claude-md-from-db.js');
  const r = spawnSync('node', [script, '--only', CONTRACT_FILES.join(',')], { encoding: 'utf8', timeout: 120000 });
  if (r.status !== 0) return { ok: false, status: r.status, stderr: (r.stderr || '').slice(-500) };
  return { ok: true, files: CONTRACT_FILES };
}

async function realCanary(supabase) {
  const { getActiveCoordinatorId } = require('../lib/coordinator/resolve.cjs');
  const coordinatorId = await getActiveCoordinatorId(supabase).catch(() => null);
  const out = { ok: !!coordinatorId, coordinator_id: coordinatorId || null };
  if (!coordinatorId) { out.detail = 'no active coordinator resolved'; return out; }
  if (process.env.COORDINATOR_TWOWAY_V2 === 'on') out.round_trip = 'two-way enabled (Michael sends nothing; resolvability is the whole canary)';
  return out;
}

async function main() {
  const sessionId = process.env.CLAUDE_SESSION_ID;
  let supabase = null;
  try { supabase = require('../lib/supabase-client.cjs').createSupabaseServiceClient(); } catch { /* fail-soft below */ }

  const deps = {
    checkFreshness: async () => {
      const mod = await import('../lib/governance/checkout-freshness.js');
      const fn = mod.checkoutFreshness || (mod.default && mod.default.checkoutFreshness);
      return fn ? fn(process.cwd()) : { verdict: 'UNKNOWN' };
    },
    regenerateContract: async () => realRegenerateContract(),
    register: async () => {
      if (!supabase) return { ok: false, action: 'error', error: 'supabase unavailable' };
      const { registerMichael } = require('./michael-register.cjs');
      return registerMichael(supabase, sessionId);
    },
    canary: async () => realCanary(supabase),
  };

  const result = await runMichaelRestart(deps);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
}

module.exports = { runMichaelRestart, CONTRACT_FILES };

if (require.main === module) {
  main().catch((e) => { console.log(JSON.stringify({ ok: false, verdict: 'FAIL', summary: `unhandled: ${e && e.message ? e.message : e}`, steps: [] }, null, 2)); process.exitCode = 1; });
}
