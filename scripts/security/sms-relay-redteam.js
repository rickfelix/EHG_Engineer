#!/usr/bin/env node
/**
 * SD-LEO-FEAT-SMS-INBOUND-RELAY-001 FR-5 — red-team acceptance gate.
 *
 * Two-tier per the PRD's TR-8:
 *   --target=local (default): runs the LOCAL/CI scenario suite — fast, no live DB/
 *     deployment, safe to re-run on every change to this surface. This IS this tier;
 *     it is not a placeholder for one.
 *   --target=deployed: prints the manual real-deploy checklist (TS-1 end-to-end and
 *     TS-8 grants verification cannot run without the actual hooks.execholdings.ai
 *     deployment + a live restricted-role Postgres connection — see
 *     sms-relay/README.md in the ehg repo for the deployment steps this fleet session
 *     cannot perform).
 *
 * Scenario table (matches product_requirements_v2.test_scenarios TS-1..TS-8 for this SD):
 *   TS-1/TS-2  valid signed reply -> staging -> trusted-consumer drain
 *   TS-3       spoofed signature -> rejected, no staging row, uniform response
 *   TS-4       replay idempotency
 *   TS-5       expired/used token -> fail-closed
 *   TS-6       ambiguous (2+ eligible candidates) -> rejected
 *   TS-7       spoofed-number flood -> persistent auto-suspend
 *   TS-8       relay-credential grants check (DEFERRED to the deployed tier — needs a
 *              live restricted-role Postgres connection, not JS-unit-testable)
 *
 * Usage:
 *   node scripts/security/sms-relay-redteam.js [--target=local|deployed]
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// This script's OWN checkout (worktree or main) — used to run the EHG_Engineer-side
// suites, since that's where node_modules/vitest.config for the CURRENT copy live.
const ENGINEER_ROOT = path.resolve(__dirname, '../..');
// The sibling "ehg" repo is NOT duplicated per-worktree — only one checkout exists at
// the top level. Strip a ".worktrees/<sd>" suffix (if present) to find the TRUE
// EHG_Engineer root before looking for its "ehg" sibling.
const worktreesIdx = ENGINEER_ROOT.indexOf(`${path.sep}.worktrees${path.sep}`);
const TRUE_ENGINEER_ROOT = worktreesIdx >= 0 ? ENGINEER_ROOT.slice(0, worktreesIdx) : ENGINEER_ROOT;
const EHG_ROOT = path.resolve(TRUE_ENGINEER_ROOT, '..', 'ehg');

const LOCAL_SUITES = [
  { label: 'TS-1/TS-2/TS-4/TS-5/TS-6/TS-7 (trusted consumer + staging drain)', cwd: ENGINEER_ROOT, args: ['run', 'tests/unit/chairman/sms-bridge.test.js'] },
  { label: 'FR-4 decommission cutover flag', cwd: ENGINEER_ROOT, args: ['run', 'tests/unit/webhooks/twilio-sms.test.js'] },
  { label: 'TS-1/TS-3/TS-4 (relay: signature verification + uniform response + RPC call gating)', cwd: EHG_ROOT, args: ['run', 'tests/unit/sms-relay'] },
];

function runSuite(suite) {
  // Single command string (not an args array) with shell:true avoids Node's
  // DEP0190 warning about unescaped array args under a shell.
  const command = ['npx', 'vitest', ...suite.args].join(' ');
  const result = spawnSync(command, { cwd: suite.cwd, stdio: 'inherit', shell: true });
  return { ...suite, exitCode: result.status };
}

function printDeployedTierChecklist() {
  console.log('\n=== SMS RELAY RED-TEAM — DEPLOYED TIER (manual, pre-pilot) ===\n');
  console.log('This tier cannot run from this repo/session — it requires:');
  console.log('  1. The isolated hooks.execholdings.ai Vercel project deployed (sms-relay/README.md)');
  console.log('  2. RELAY_SHARED_SECRET set on both the Vercel project and sms_relay_secret (EHG_Engineer DB)');
  console.log('  3. A live restricted-role Postgres connection for TS-8\n');
  console.log('Checklist:');
  console.log('  [ ] TS-1 end-to-end: real Twilio SMS -> relay -> staging row -> trusted consumer resolves chairman_decisions');
  console.log('  [ ] TS-3: a request signed against a URL other than the deployed hooks.execholdings.ai URL is rejected (proxy/rewrite mismatch, FR-1 AC-3)');
  console.log('  [ ] TS-8: connect AS the relay role (or replay its exact anon-key + RELAY_SHARED_SECRET pair) — direct INSERT/SELECT/UPDATE/DELETE on sms_relay_staging fails; only the RPC call (with the correct secret) succeeds; without the secret the RPC call ALSO fails (SEC-1)');
  console.log('  [ ] Grep the deployed Vercel project\'s env vars for SUPABASE_SERVICE_ROLE_KEY or equivalent — must be absent');
  console.log('\nOnly after ALL of the above are checked does TWO-WAY-CHAIRMAN-001\'s held live-SMS-activation flag get un-held.\n');
}

function main() {
  const target = (process.argv.find((a) => a.startsWith('--target=')) || '--target=local').split('=')[1];

  if (target === 'deployed') {
    printDeployedTierChecklist();
    process.exit(0);
  }

  console.log('\n=== SMS RELAY RED-TEAM — LOCAL/CI TIER ===\n');
  const results = LOCAL_SUITES.map(runSuite);

  console.log('\n=== SCORECARD ===');
  let allPassed = true;
  for (const r of results) {
    const ok = r.exitCode === 0;
    allPassed = allPassed && ok;
    console.log(`  ${ok ? '✅' : '❌'} ${r.label}`);
  }
  console.log('  ⏭️  TS-8 (grants check) — DEFERRED to --target=deployed (needs live restricted-role Postgres connection)\n');

  if (!allPassed) {
    console.error('RED-TEAM LOCAL/CI TIER: FAILED');
    process.exit(1);
  }
  console.log('RED-TEAM LOCAL/CI TIER: PASSED — run --target=deployed once the relay is live, before pilot.');
}

main();
