import 'dotenv/config';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_KEY = 'SD-LEO-INFRA-REMOVE-EVERY-BINDING-001';

const supabase = await getSupabaseClient();
const { data: sd } = await supabase.from('strategic_directives_v2').select('target_application').eq('sd_key', SD_KEY).maybeSingle();
const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: sd?.target_application || null, subAgentCode: 'VALIDATION', supabase });

const results = {
  verdict: 'PASS',
  confidence: 90,
  summary: 'validation-agent independently validated all 8 FRs against the actual current code state (VERIFY phase, PLAN_VERIFICATION). All 8 FRs DELIVERED with file:line citations. Regression set (venture-ceo-factory.test.js + role-registry-equivalence.test.mjs): 2 files, 31 tests passed. Flagged 5 non-blocking observations, 2 of which were real and fixed in the same VERIFY pass (CI paths: filter missing tests/**, misleading "advisory" wording on a still-blocking fallback) -- both fixed and re-verified (commit 37f38aed3ed). Remaining 3 flags are informational/out-of-FR-scope (CEO capabilities still lists the string "stage_management", src/ out of lint scope, one-off/ dir permanently unlinted) -- none represent an unmet FR.',
  findings: [
    'FR-1..FR-8 all DELIVERED, independently verified against live code (not against a summary) -- see full citation table in the VERIFY-phase Task-tool transcript.',
    'FIXED (same pass): .github/workflows/venture-role-stage-binding-lint.yml paths: filter omitted tests/** despite the lint itself scanning tests/ -- added.',
    'FIXED (same pass): lint doc comment + fallback warning called the --all mode "advisory", which reads as soft-fail; it is not (still exitCode=1 on violation) -- reworded both.',
    'INFORMATIONAL, non-blocking: CEO capabilities array still lists the string "stage_management" (lib/agents/venture-ceo-factory.js:53) -- outside every FR\'s literal scope (the FRs name only the 3 object keys + 3 prose fields), and not a stage binding itself.',
  ],
  metadata: {
    recorded_by: 'scripts/one-off/record-validation-evidence-remove-every-binding-001.mjs',
    producer_note: 'Manual transcription of a validation-agent Task-tool run for the VERIFY phase (this repo\'s established pattern for Task-agent evidence).',
  },
};
applySubAgentRepoVerdict(results, resolution);
const stored = await storeSubAgentResults('VALIDATION', SD_KEY, null, results, { phase: 'PLAN_VERIFICATION' });
console.log('VALIDATION evidence stored:', stored?.id || stored);
