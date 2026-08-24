#!/usr/bin/env node
// SD-LEO-INFRA-STALE-INDEX-LOCK-001 -- smoke_test_steps must be {instruction, expected_outcome}
// objects (SMOKE_TEST_SPECIFICATION gate requirement), matching the corrected LEAD scope.
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = '9ea88629-4882-4392-b838-185dde3ed076';

const smoke_test_steps = [
  {
    instruction: 'Call armUnrefInterval-equivalent guard on append-fleet-commit-trailer.js\'s Promise.race timeout Promise and inspect the returned Timeout handle\'s hasRef().',
    expected_outcome: 'hasRef() returns false -- the timeout does not hold the Node event loop open and is not in the force-close path on process.exit(0).',
  },
  {
    instruction: 'Run the fixed script end-to-end with a fast-resolving mock Supabase query (winning side of the race) and confirm no dangling active handle remains before process.exit(0).',
    expected_outcome: 'process._getActiveHandles() (or an equivalent timer-count check) shows zero remaining ref\'d timers from this script at the moment of exit.',
  },
  {
    instruction: 'Point the extended clear-stale-index-lock.mjs at a worktree\'s .git/worktrees/<name>/index.lock fixture: a 0-byte file, aged past the safety threshold, with no live git process holding it.',
    expected_outcome: 'The stale lock is detected and cleared, using the same safety predicate (age + zero-byte + no live pid) as the existing shared-checkout behavior.',
  },
  {
    instruction: 'Point the same helper at a fresh or non-zero-byte lock (simulating a live git operation) in both a shared checkout and a worktree.',
    expected_outcome: 'The lock is left untouched in both topologies -- a live lock is never cleared.',
  },
];

async function run() {
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({ smoke_test_steps })
    .eq('id', SD_UUID);
  if (error) throw new Error(`update failed: ${error.message}`);
  console.log('smoke_test_steps set:', smoke_test_steps.length, 'steps');
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
