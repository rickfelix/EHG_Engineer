#!/usr/bin/env node
/**
 * auto-exec-engine-demo — register the engine's default-OFF flag in the
 * Pending-Enablement Registry (001A) and run the SYNTHETIC engine once for
 * operator/CI inspection. SD-LEO-INFRA-POLICY-GATED-AUTO-001C.
 *
 * QF-20260712-201: restores the flag-gated self-registration + plain-run path that
 * PR #6023 (SD-APEXNICHE-AI-LEO-FIX-FLAG-GOVERNANCE-CLEANUP-001) removed. Per
 * coordinator ruling (session_coordination c0a83561, 2026-07-12): `auto_exec_engine_v1`
 * is a deliberate default-OFF staged-rollout flag (001C/001D Pending-Enablement
 * machinery), not a disabled-aging one — it must not be killed. The DB row's
 * lifecycle_state is annotated `draft` so governance review routes it through
 * stale-off-pending (recommend: enable/defer/retire), not disabled-aging (kill).
 *
 * Read-only against real infra: the only thing that touches the DB is the flag
 * self-registration (idempotent) and append-only audit rows for the synthetic run.
 * The engine flag defaults OFF, so a plain run is a no-op (status=skipped) until an
 * operator enables it.
 *
 * Usage:
 *   node --env-file=.env scripts/auto-exec-engine-demo.mjs            # register flag + run (skipped if OFF)
 *   node --env-file=.env scripts/auto-exec-engine-demo.mjs --rehearse # rollback-rehearsal for every phase
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { registerPendingFlag } from '../lib/pending-enablement-registry.js';
import {
  runAutoExec, makeSyntheticAction, makeFlagReader, makeKillSwitchReader, makeDbAudit,
  rehearseRollback, completeSyntheticPolicy,
} from '../lib/auto-exec-engine.js';

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const FLAG_KEY = 'auto_exec_engine_v1';

// Self-register the engine flag (default-OFF) so it surfaces in the pending-enablement registry.
const reg = await registerPendingFlag(db, {
  flag_key: FLAG_KEY,
  display_name: 'Policy-Gated Auto-Exec Engine (synthetic)',
  gates_what: 'The auto-execution control loop. While OFF the engine is a no-op; while ON it runs ONLY the synthetic action (no real op until 001D).',
  enablement_criteria: 'Operator confirms golden/rollback-rehearsal/TOCTOU/kill-switch all green; a real op is only attached in 001D behind its own flag.',
  target: 'EHG_Engineer',
  rolled_out_at: new Date().toISOString(),
  risk_tier: 'high',
});
console.log(`flag '${FLAG_KEY}': ${reg.created ? 'registered (default-OFF)' : 'already registered'}`);

if (process.argv.includes('--rehearse')) {
  console.log('\n=== rollback rehearsal (every intermediate phase must restore state) ===');
  let allRestored = true;
  for (const failAt of ['apply', 'observe', 'revalidate', 'commit']) {
    const r = await rehearseRollback(failAt);
    allRestored = allRestored && r.restored;
    console.log(`  failAt=${failAt.padEnd(11)} status=${String(r.status).padEnd(14)} restored=${r.restored}`);
  }
  console.log(`\nrehearsal: ${allRestored ? 'ALL phases restored ✓' : 'A PHASE DID NOT RESTORE ✗'}`);
  process.exitCode = allRestored ? 0 : 1;
  setTimeout(() => process.exit(process.exitCode), 1000).unref();
} else {
  // Plain run: real flag/kill-switch readers + DB audit, synthetic action.
  const runId = (globalThis.crypto?.randomUUID && globalThis.crypto.randomUUID()) || `demo-${process.pid}`;
  const action = makeSyntheticAction({});
  const result = await runAutoExec(action, {
    flagEnabled: makeFlagReader(db, FLAG_KEY),
    killSwitchActive: makeKillSwitchReader(db),
    policy: completeSyntheticPolicy(),
    forbiddenClasses: [],
    audit: makeDbAudit(db, runId),
    observeWindowMs: 0,
    runId,
  });
  console.log('\n=== synthetic engine run ===');
  console.log(`run_id  : ${runId}`);
  console.log(`result  : ${JSON.stringify(result)}`);
  console.log(result.status === 'skipped'
    ? '(flag is OFF — engine is a no-op, as designed. Enable the flag to exercise the loop.)'
    : `(synthetic value now: ${action.read()})`);
}
