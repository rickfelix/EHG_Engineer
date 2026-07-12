#!/usr/bin/env node
/**
 * auto-exec-engine-demo — rollback-rehearsal harness for the SYNTHETIC engine loop.
 * SD-LEO-INFRA-POLICY-GATED-AUTO-001C.
 *
 * QF-20260712-716: the `auto_exec_engine_v1` pending-enablement flag was killed as a
 * disabled-aging flag never turned on in practice — no real op was ever wired behind
 * it (001D, which would have attached one, never happened). This script's flag
 * self-registration and always-`skipped` "plain run" path (the flag's only live
 * behavior) are removed with it. The rehearsal harness below never depended on the
 * flag (`rehearseRollback` hardcodes `flagEnabled: true`), so it is unaffected.
 *
 * Usage:
 *   node --env-file=.env scripts/auto-exec-engine-demo.mjs --rehearse
 */
import 'dotenv/config';
import { rehearseRollback } from '../lib/auto-exec-engine.js';

if (!process.argv.includes('--rehearse')) {
  console.log('Usage: node scripts/auto-exec-engine-demo.mjs --rehearse');
  process.exit(0);
}

console.log('=== rollback rehearsal (every intermediate phase must restore state) ===');
let allRestored = true;
for (const failAt of ['apply', 'observe', 'revalidate', 'commit']) {
  const r = await rehearseRollback(failAt);
  allRestored = allRestored && r.restored;
  console.log(`  failAt=${failAt.padEnd(11)} status=${String(r.status).padEnd(14)} restored=${r.restored}`);
}
console.log(`\nrehearsal: ${allRestored ? 'ALL phases restored ✓' : 'A PHASE DID NOT RESTORE ✗'}`);
process.exit(allRestored ? 0 : 1);
