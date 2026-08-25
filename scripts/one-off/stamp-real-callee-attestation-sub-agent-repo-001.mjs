import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-SUB-AGENT-REPO-001';

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (readErr) { console.error(readErr); process.exit(1); }

const real_callee_attestation = {
  'applySubAgentRepoVerdict conditions/justification synthesis (pure function)':
    'tests/unit/resolve-sub-agent-repo.test.js -- direct calls, real callee, real assertions on the mutated object',
  'resolveTargetApplicationForRegression precedence (pure function)':
    'tests/unit/sub-agents/regression-target-application-precedence.test.js -- direct calls, real callee',
  'regression.js getSDDetails -> normalizeSDId -> supabase.from(strategic_directives_v2) real DB round-trip':
    'none -- not integration-tested; only the extracted pure precedence helper is unit-tested. Verified by code review (Explore + VALIDATION + TESTING sub-agent passes) and manual node --check, not by an executed integration test against a real/fake DB.',
  'regression.js storeResults() actual supabase.from(sub_agent_execution_results).insert() call':
    'none -- not integration-tested; the insert payload shape was verified by code review only. execute()\'s heavy internal helpers (handleBaseline, compareTestResults, compareAPISignatures, analyzeImports, compareCoverage) make full end-to-end mocking disproportionate to this fix\'s scope.',
};

const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata: { ...(sd.metadata || {}), real_callee_attestation } })
  .eq('id', sd.id);
if (updateErr) { console.error(updateErr); process.exit(1); }

console.log('real_callee_attestation stamped.');
