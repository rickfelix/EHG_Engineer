#!/usr/bin/env node
// SD-LEO-INFRA-COORDINATOR-CRON-TEARDOWN-001 — thin CLI for the unified teardown contract.
// Wired entry point (package.json "coordinator:teardown") for lib/coordinator/teardown-coordinator.cjs.
//
// Prints the canonical coordinator cron inventory the harness must CronDelete FIRST (CronList ->
// CronDelete are Claude Code harness tools, NOT Node-callable — this CLI never deletes crons),
// then clears the coordinator pointer (session-scoped, fail-open) when COORD_TEARDOWN_SAFETY_V2=on.
// With the flag off, the pointer clear is a no-op and the legacy /coordinator stop path applies.
//
// Usage: node scripts/coordinator-teardown.cjs [--force]
//   --force  clear the pointer even if this session does not own it (use only when intentionally
//            taking over a dead coordinator; default refuses to protect the LIVE coordinator).

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const {
  clearCoordinatorPointer,
  listCoordinatorCrons,
  isEnabled,
  FLAG
} = require('../lib/coordinator/teardown-coordinator.cjs');

(async () => {
  const force = process.argv.includes('--force');
  const sessionId = process.env.CLAUDE_SESSION_ID || null;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sb = url ? createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY) : null;

  console.log('Coordinator crons to CronDelete FIRST (run CronList -> CronDelete for each, BEFORE the pointer clear):');
  for (const c of listCoordinatorCrons()) {
    console.log('  - ' + c.key.padEnd(10) + ' [' + c.cadence + '] ' + (c.command || '(command pending coordinator confirm)') +
      (c.re_asserts_pointer ? '  <-- re-asserts the pointer; MUST delete' : ''));
  }

  if (!isEnabled()) {
    console.log('\n' + FLAG + ' is OFF — pointer clear is a no-op (legacy /coordinator stop path applies; behavior unchanged).');
    return;
  }
  const r = await clearCoordinatorPointer(sb, { sessionId, force });
  console.log('\nPointer clear result:\n' + JSON.stringify(r, null, 2));
})().catch((e) => {
  // Fail-open even at the CLI boundary: never hard-fail a teardown.
  console.error('coordinator-teardown (fail-open):', e && e.message ? e.message : String(e));
  process.exit(0);
});
