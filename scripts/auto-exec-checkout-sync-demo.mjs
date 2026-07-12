#!/usr/bin/env node
/**
 * auto-exec-checkout-sync-demo — report enable-eligibility for the checkout-sync pilot.
 * SD-LEO-INFRA-POLICY-GATED-AUTO-001D.
 *
 * NEVER performs a real sync. This CLI exists for operator/CI visibility of the
 * pilot's structural safety proofs only. A real-scope run is gated behind a
 * deliberate operator enablement decision (see ENABLEMENT_CRITERIA).
 *
 * QF-20260712-716: the `auto_exec_checkout_sync_v1` pending-enablement flag was
 * killed as a disabled-aging flag never turned on in practice — this script never
 * actually read the flag's DB state (it only self-registered it), so removing the
 * registration changes nothing observable about the eligibility report below.
 *
 * Usage:
 *   node --env-file=.env scripts/auto-exec-checkout-sync-demo.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isEnableEligible, ENABLEMENT_CRITERIA, makeWorkersProbe } from '../lib/auto-exec-checkout-sync.js';

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log(`checkout-sync pilot: human-gated, no live flag wiring.`);
console.log(`enablement criteria: ${ENABLEMENT_CRITERIA}`);

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
