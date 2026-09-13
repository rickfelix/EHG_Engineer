// REAL_CALLEE_ATTESTATION for SD-LEO-INFRA-CLOCK-SKEW-SWEEP-001 (gate is presence-only,
// non-blocking this increment -- see
// scripts/modules/handoff/executors/exec-to-plan/gates/real-callee-attestation.js).
// Names, for each cross-module/subprocess call this SD's implementation introduced or
// touched, the test that exercises the REAL (unmocked) callee -- or says plainly where the
// integration is stubbed instead.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-CLOCK-SKEW-SWEEP-001';

const real_callee_attestation = {
  'tests/setup.clock-skew.js beforeEach -- vi.setSystemTime()/Date.now() (pin mode) + fs.appendFileSync/writeFileSync ledger writes':
    'tests/unit/hygiene/clock-skew-reapplication.spawn.test.js spawns a REAL out-of-process `npx vitest run` child (spawnSync, not mocked) that loads the real setup.clock-skew.js hook against a real fixture test file, then reads the real ledger file the hook wrote to disk. Both the vitest fake-timer API and the fs ledger writes are exercised for real, not through a stubbed vi/fs.',
  'scripts/lint/wall-clock-test-lint.mjs runDiffMode() -- real git subprocess calls (merge-base/diff --name-status/show) via lib/git/hardened-runner.cjs':
    'none -- scripts/lint/wall-clock-test-lint.test.js injects a fake `run(args)` function for every git call (see fakeRun() in that file); no test in this SD exercises the real hardened-runner.cjs execFileSync call against an actual git repo. The pure classification logic (isViolation, parseRenameMap, and the new/pre-existing/renamed partitioning) is fully covered against real string/blob content, but the git subprocess boundary itself is UNTESTED for real. Lower risk here: the identical pattern (hardened runner + injected run) is already load-bearing in shell-injection-argv-lint.mjs, which this file deliberately mirrors.',
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
