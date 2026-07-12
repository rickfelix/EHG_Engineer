#!/usr/bin/env node
// SD-LEO-INFRA-COORDINATOR-CRON-TEARDOWN-001 — thin CLI for the coordinator cron inventory.
// Wired entry point (package.json "coordinator:teardown") for lib/coordinator/teardown-coordinator.cjs.
//
// Prints the canonical coordinator cron inventory the harness must CronDelete (CronList ->
// CronDelete are Claude Code harness tools, NOT Node-callable — this CLI never deletes crons).
// Pointer clearing is handled by the legacy /coordinator stop path (see coordinator.md) —
// SD-APEXNICHE-AI-LEO-FIX-FLAG-GOVERNANCE-CLEANUP-001 (escalated from QF-20260712-716) removed
// the governance-flag-gated clearCoordinatorPointer() helper,
// which was a disabled-aging flag never turned on in practice.
//
// Usage: node scripts/coordinator-teardown.cjs

const { listCoordinatorCrons } = require('../lib/coordinator/teardown-coordinator.cjs');

console.log('Coordinator crons to CronDelete (run CronList -> CronDelete for each):');
for (const c of listCoordinatorCrons()) {
  console.log('  - ' + c.key.padEnd(10) + ' [' + c.cadence + '] ' + (c.command || '(command pending coordinator confirm)') +
    (c.re_asserts_pointer ? '  <-- re-asserts the pointer; MUST delete' : ''));
}
