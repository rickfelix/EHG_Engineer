// REAL_CALLEE_ATTESTATION for SD-LEO-INFRA-FR-DELIVERY-SECOND-SIGNAL-001 (gate is presence-only,
// non-blocking this increment -- see scripts/modules/handoff/executors/exec-to-plan/gates/real-callee-attestation.js).
// Names, for each cross-module/cross-resource call this SD's implementation introduced, the test that
// exercises the REAL (unmocked) callee -- verified by reading the actual test files, not asserted from memory.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-FR-DELIVERY-SECOND-SIGNAL-001'; // metadata lives on sd_key, id is a separate uuid PK

const { data: current, error: fetchErr } = await supabase.from('strategic_directives_v2')
  .select('metadata').eq('sd_key', SD_KEY).maybeSingle();
if (fetchErr) throw fetchErr;
if (!current) throw new Error(`No SD found for sd_key=${SD_KEY}`);

const real_callee_attestation = {
  'fr-delivery-classifier.js -> specFileExists() from lib/stories/e2e-path-guard.js':
    'tests/unit/handoff/gates/fr-delivery-classifier-testref-realfs.test.js does NOT mock e2e-path-guard.js (confirmed: no vi.mock call in the file, stated explicitly in its header comment) -- it calls the real specFileExists() against genuine mkdtempSync-created temp directories and files, including the S7 traversal-rejection case. fr-delivery-classifier.test.js and fr-delivery-traceability-gate.test.js DO mock this module (permissive / always-true respectively) -- they test classification logic and gate wiring, not the existence-check boundary itself; the realfs file is the one that proves the real callee is genuinely reachable, not shadowed. Independently mutation-tested by the TESTING sub-agent (row cad84d76-f82d-4ac3-a103-96c938595e4d): the S1-S6 existence-arm mutants were all killed against this real-callee suite.',
  'fr-delivery-classifier.js -> supabase.from(\'v_sub_agent_repo_compliance\') (new query this SD added)':
    'NOT exercised by a committed automated test -- all three test files (fr-delivery-classifier.test.js, fr-delivery-classifier-testref-realfs.test.js, fr-delivery-traceability-gate.test.js) stub this query. It WAS exercised against the real view and real production data, but only via one-off scripts, not CI-gating regression tests: scripts/one-off/pin-fr-delivery-baseline.mjs runs classifyFrDelivery() with a real (non-stub) Supabase client against 30 real completed SDs, which internally issues this exact query; and the SECURITY sub-agent independently ran a real-data population measurement (400 most recent TESTING rows, all 400 matched the view, 397 non-empty expected_repo_path, 3 unknown_application) as part of its review, not as a committed test. This is a genuine gap relative to the specFileExists() coverage above -- flagged honestly rather than glossed over, consistent with this gate\'s stated purpose.',
};

const metadata = { ...(current.metadata || {}), real_callee_attestation };

const { data: updated, error: updateErr } = await supabase.from('strategic_directives_v2')
  .update({ metadata })
  .eq('sd_key', SD_KEY)
  .select('sd_key, metadata').maybeSingle();
if (updateErr) throw updateErr;
console.log('real_callee_attestation set, keys:', Object.keys(updated.metadata.real_callee_attestation));
