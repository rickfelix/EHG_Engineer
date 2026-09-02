import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-FIX-CLIENT-FACTORY-FALLBACK-001';
const PHASE = 'LEAD-TO-PLAN';

const results = {
  verdict: 'PASS',
  confidence: 90,
  summary:
    'Census complete (measured against current main). The QF-described defect ("wrong-name import ' +
    'FALLS BACK to a non-service client") does not exist as a named-import fallback -- git grep found ' +
    'zero call sites importing { createServiceClient } from lib/supabase-client.js. The REAL, ' +
    'currently-present mechanism is a default-export landmine: lib/supabase-client.js:186 ' +
    '`export default createSupabaseClient` (the anon client). A caller who default-imports the module ' +
    'and names the local binding createServiceClient (a plausible mistake) would silently receive the ' +
    'anon client -- the exact "RLS-filtered empty, no error" shape. Zero current call sites exploit ' +
    'this (774 import lines checked, all named imports of correct exports). lib/supabase-client.cjs ' +
    'has no default export (module.exports is a named object) -- unaffected. Fix is preventative: ' +
    'close the landmine + add a regression test, not repair a live call site.',
  critical_issues: [],
  warnings: [
    'Premise as originally worded (named-import fallback) does not hold on current main; the real mechanism is a default-export landmine, a related but distinct shape. success_criteria re-keyed to reflect the measured mechanism.',
  ],
  recommendations: [
    'Remove the default export (zero callers depend on it) rather than re-point it to the service client -- removal makes a future wrong-import fail LOUD (ReferenceError/undefined-is-not-a-function) instead of silently succeeding with either client, which is the stronger closure per the QF\'s own acceptance shape.',
  ],
  detailed_analysis: {
    census_method: 'git grep across all tracked *.js/*.cjs/*.mjs for two shapes: (1) named import of createServiceClient from a supabase-client module, (2) bare default import from lib/supabase-client.js under any local name',
    named_wrong_import_matches: 0,
    default_import_matches: 0,
    total_named_import_lines_checked: 774,
    real_mechanism_file: 'lib/supabase-client.js',
    real_mechanism_line: 186,
    cjs_sibling_affected: false,
    dedup_check: 'SD-LEO-REFAC-SUPABASE-CLIENT-FACTORY-001 (completed) is a different, complementary scope (migrating raw createClient() calls TO the factory) -- not a duplicate of this default-export naming trap.',
  },
  metadata: {
    census_files_checked: 774,
    exploiting_call_sites_found: 0,
  },
  execution_time_ms: 210000,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'EXPLORE',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('EXPLORE', SD_ID, { name: 'Explore Sub-Agent' }, results, { phase: PHASE });
console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('STORED_PHASE=' + (stored?.phase || 'n/a'));
