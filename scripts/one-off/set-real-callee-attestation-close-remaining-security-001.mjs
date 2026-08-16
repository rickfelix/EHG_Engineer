// REAL_CALLEE_ATTESTATION for SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001 (gate is presence-only,
// non-blocking this increment -- see scripts/modules/handoff/executors/exec-to-plan/gates/real-callee-attestation.js).
// Names, for each cross-module call this SD's implementation introduced, the test that exercises the
// REAL (unmocked) callee -- verified by reading the actual test files, not asserted from memory.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001'; // metadata lives on sd_key, id is a separate uuid PK

const { data: current, error: fetchErr } = await supabase.from('strategic_directives_v2')
  .select('metadata').eq('sd_key', SD_KEY).maybeSingle();
if (fetchErr) throw fetchErr;
if (!current) throw new Error(`No SD found for sd_key=${SD_KEY}`);

const real_callee_attestation = {
  'tests/ddl/close-remaining-secdef-execute-exposure-ddl.db.test.js -> pg.Client (real Postgres, GitHub Actions test-container)':
    'The DDL suite itself IS the real-callee test: it connects with node-postgres, applies the forward migration and rollback SQL verbatim against a live Postgres instance, and asserts on has_function_privilege() results read back from that same server -- nothing in this path is mocked or stubbed. 184/184 passing in CI, independently confirmed by the TESTING sub-agent (sub_agent_execution_results row ba4d24a4-d236-47e8-959f-6fa70e84432d).',
  'scripts/lint/secdef-execute-revoke-lint.mjs (fs + SQL text parsing only)':
    'No foreign-module I/O boundary exists to attest -- the lint operates purely on migration file text via node:fs, with no DB connection, network call, or injectable dependency. tests/unit/lint/secdef-execute-revoke-lint.test.js (23/23 passing) exercises the real parser directly.',
  'FR-4 (ALTER DEFAULT PRIVILEGES recurrence control) -- descoped, not delivered':
    'No callee to attest: three independent fix attempts were made against the real CI Postgres environment (not mocked) and all failed identically; the mechanism was removed from the migration pair entirely rather than shipped behind a passing-but-untested assertion. See the forward migration header for the full descope rationale.',
};

const metadata = { ...(current.metadata || {}), real_callee_attestation };

const { data: updated, error: updateErr } = await supabase.from('strategic_directives_v2')
  .update({ metadata })
  .eq('sd_key', SD_KEY)
  .select('sd_key, metadata').maybeSingle();
if (updateErr) throw updateErr;
console.log('real_callee_attestation set, keys:', Object.keys(updated.metadata.real_callee_attestation));
