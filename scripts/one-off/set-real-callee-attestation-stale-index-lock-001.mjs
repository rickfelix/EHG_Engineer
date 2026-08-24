// REAL_CALLEE_ATTESTATION for SD-LEO-INFRA-STALE-INDEX-LOCK-001 (gate is presence-only,
// non-blocking this increment -- see
// scripts/modules/handoff/executors/exec-to-plan/gates/real-callee-attestation.js).
// Names, for each cross-module/subprocess call this SD's implementation introduced, the test
// that exercises the REAL (unmocked) callee.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-STALE-INDEX-LOCK-001';

const real_callee_attestation = {
  'append-fleet-commit-trailer.js:resolveSharedRoot() -- execFileSync(git rev-parse --git-common-dir)':
    'tests/unit/append-fleet-commit-trailer.test.js\'s "resolves the SHARED ROOT identity file when invoked from a worktree cwd" and "still stamps correctly when invoked from the shared checkout directly" tests exercise this via a REAL disposable git repo + REAL `git worktree add` + REAL execFileSync child_process spawn of the script itself (not mocked) -- both the git subprocess call and the worktree topology are genuine, not simulated.',
  'append-fleet-commit-trailer.js:readCallsign() -- fs.readFileSync + JSON.parse of the coordinator-maintained identity cache':
    'Same test file, all 7 tests in the "worktree-aware identity resolution" describe block use real fs.writeFileSync-created fixture files (valid, malformed, missing, no-callsign, role-seat) read by the real (unmocked) readCallsign function via a real child_process spawn -- not a mocked fs module.',
  'append-fleet-commit-trailer.js as a whole -- the .husky/commit-msg hook invocation contract':
    'This SD\'s own EXEC-phase commits (e.g. d150003f53e) ran the fixed script live, for real, as the actual git commit-msg hook during normal repo operation -- not a test harness. Zero libuv crash and correct trailer stamping observed directly, in addition to the dedicated unit test suite.',
};

async function run() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: current, error: fetchErr } = await supabase.from('strategic_directives_v2')
    .select('metadata').eq('sd_key', SD_KEY).maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!current) throw new Error(`No SD found for sd_key=${SD_KEY}`);

  const metadata = { ...(current.metadata || {}), real_callee_attestation };

  const { data: updated, error: updateErr } = await supabase.from('strategic_directives_v2')
    .update({ metadata })
    .eq('sd_key', SD_KEY)
    .select('sd_key, metadata').maybeSingle();
  if (updateErr) throw updateErr;
  console.log('real_callee_attestation set, keys:', Object.keys(updated.metadata.real_callee_attestation));
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
