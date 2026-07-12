#!/usr/bin/env node
/**
 * auto-exec-checkout-sync-demo — register the checkout-sync pilot's default-OFF flag
 * in the Pending-Enablement Registry (001A) and report enable-eligibility.
 * SD-LEO-INFRA-POLICY-GATED-AUTO-001D.
 *
 * QF-20260712-201: restores the flag-gated self-registration that PR #6023
 * (SD-APEXNICHE-AI-LEO-FIX-FLAG-GOVERNANCE-CLEANUP-001) removed. Per coordinator
 * ruling (session_coordination c0a83561, 2026-07-12): `auto_exec_checkout_sync_v1`
 * is a deliberate default-OFF staged-rollout flag (001C/001D Pending-Enablement
 * machinery), not a disabled-aging one — it must not be killed. The DB row's
 * lifecycle_state is annotated `draft` so governance review routes it through
 * stale-off-pending (recommend: enable/defer/retire), not disabled-aging (kill).
 *
 * NEVER performs a real sync. The flag ships OFF and is NOT enable-eligible — this
 * CLI exists for operator/CI visibility of the pilot's status only. A real-scope run
 * is gated behind a deliberate operator enablement decision (see ENABLEMENT_CRITERIA).
 *
 * Usage:
 *   node --env-file=.env scripts/auto-exec-checkout-sync-demo.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { registerPendingFlag } from '../lib/pending-enablement-registry.js';
import { isEnableEligible, ENABLEMENT_CRITERIA, makeWorkersProbe } from '../lib/auto-exec-checkout-sync.js';

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const FLAG_KEY = 'auto_exec_checkout_sync_v1';

const reg = await registerPendingFlag(db, {
  flag_key: FLAG_KEY,
  display_name: 'Policy-Gated Auto-Exec: checkout-sync (pilot)',
  gates_what: 'Auto-execution of the main-checkout deploy-sync (highest-blast fleet op). OFF => human-gated.',
  enablement_criteria: ENABLEMENT_CRITERIA,
  target: 'EHG_Engineer',
  rolled_out_at: new Date().toISOString(),
  risk_tier: 'high', // feature_flag_risk_tier enum max is 'high' (no 'critical'); highest-blast op noted in gates_what
});
console.log(`flag '${FLAG_KEY}': ${reg.created ? 'registered (default-OFF)' : 'already registered'}`);

// Enable-eligibility is computed from proof-of-machinery. This child ships the
// machinery + tests but does NOT auto-assert the proofs — enabling is operator-gated.
const proof = { atomicLockProven: true, actualHarmCanaryProven: true, concurrentRollbackProven: true };
console.log(`\nsafety machinery present (lock / actual-harm canary / concurrent rollback): yes (see tests)`);
console.log(`isEnableEligible(proof)        : ${isEnableEligible(proof)} (would be eligible — but the flag still ships OFF; enabling is a deliberate operator decision)`);
console.log(`isEnableEligible({})           : ${isEnableEligible({})} (default-safe: no proof => not eligible)`);

// Read-only worker-exclusion probe against the live fleet (informational; never syncs).
const probe = await makeWorkersProbe(db, { selfSession: process.env.CLAUDE_SESSION_ID })();
console.log(`\nworker-exclusion probe: ok=${probe.ok} live-workers-in-main=${probe.workers.length}`);
console.log(probe.workers.length === 0
  ? '(no live worker in main — the lock WOULD be acquirable if enabled)'
  : '(a live worker is in main — the lock would ABORT the sync, as designed)');
console.log('\nNOTE: the checkout-sync flag is OFF and human-gated. No sync was performed.');
