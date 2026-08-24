// REAL_CALLEE_ATTESTATION for SD-LEO-INFRA-EXECUTOR-120S-1800S-001 (gate is presence-only,
// non-blocking this increment -- see
// scripts/modules/handoff/executors/exec-to-plan/gates/real-callee-attestation.js).
// Names, for each cross-module/DB call this SD's implementation introduced or changed, the test
// that exercises the REAL (unmocked) callee -- verified by reading the actual test files and by
// the live production remediation runs during EXEC, not asserted from memory.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-EXECUTOR-120S-1800S-001';

const real_callee_attestation = {
  'executor.js:await import(modulePathSpecifier) -- dynamic import of a sub-agent module':
    'tests/unit/sub-agent-executor/executor-failure-discrimination.test.js writes REAL throwaway fixture .js files directly into lib/sub-agents/ at test-run time (afterEach cleanup) and lets Node\'s real dynamic import() resolve and execute them -- explicitly not mocked, because mocking fs/import would hide the exact cwd-relative-vs-URL-relative resolution trap this SD exists to fix. Covers: timeout via a real sentinel-delay module (TS-1), genuine thrown error (TS-2), M1 null/string-throw normalization (TS-2b/TS-2c), catch-path timer clearing (TS-2d), success-path timer clearing (TS-5), truly-missing module with cwd-independence proven via a real process.chdir() call (TS-3), and a transitively-missing dependency inside an existing module (TS-4).',
  'executor.js:fs.existsSync(fileURLToPath(new URL(modulePathSpecifier, import.meta.url))) -- real filesystem check, not mocked':
    'Same test file/tests as above (TS-3 in particular) -- the whole point of TS-3\'s process.chdir() call is to prove this resolves correctly regardless of the process\'s current working directory, which only a real (unmocked) fs.existsSync call against a real resolved path can demonstrate.',
  'remediate-executor-manual-required-corruption-001.mjs:supabase.from(sub_agent_execution_results).select()/.update() (batch fetch + per-row read-merge-write)':
    'tests/unit/one-off/remediate-executor-manual-required-corruption-001.test.js exercises remediate() against a hand-rolled in-memory fake table (makeFakeTable), not the real Supabase client -- so the unit suite alone does not prove the real query shapes are accepted by PostgREST. The REAL callee was verified live during EXEC: `node scripts/one-off/remediate-executor-manual-required-corruption-001.mjs` was run twice against production. First run: 81 rows matched the pre-fix fingerprint and were marked (DOCMON 39, STORIES 32, TESTING 10 -- matching TESTING sub-agent\'s independently-measured counts exactly). Second run: 0 newly marked, 81 already marked (idempotency confirmed against live data). Spot-checked via readback that pre-existing metadata keys (repo_path, session_id, idempotency_key) were preserved by the read-merge-write. Session-run verification, not a repeatable CI-gated regression test against a real Postgres instance.',
  'remediate-executor-manual-required-corruption-001.mjs:createSupabaseServiceClient() (module entry point, run() function, isMainModule-guarded)':
    'none -- the unit tests call remediate(fake, ...) directly and never invoke run() or createSupabaseServiceClient(), by design (isMainModule guard keeps it inert on import). The client construction itself has no logic to exercise; its actual credentials/connectivity were exercised implicitly by the two live production runs described above, which only succeed if createSupabaseServiceClient() returns a working client.',
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
