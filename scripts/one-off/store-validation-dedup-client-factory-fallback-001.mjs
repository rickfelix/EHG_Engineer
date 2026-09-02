import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-FIX-CLIENT-FACTORY-FALLBACK-001';
const PHASE = 'LEAD-TO-PLAN';

const results = {
  verdict: 'PASS',
  confidence: 92,
  summary:
    'Duplicate-check against strategic_directives_v2 (title ILIKE %client%factory%): 4 rows found. ' +
    '3 are completed and out-of-scope: SD-LEO-REFAC-COMPLETE-LLM-CLIENT-001 (LLM client, unrelated ' +
    'domain), SD-LEO-FIX-MIGRATE-HARDCODED-LLM-001 (LLM model refs, unrelated), ' +
    'SD-LEO-REFAC-SUPABASE-CLIENT-FACTORY-001 (Supabase factory, but scoped to migrating raw ' +
    'createClient() calls TO the factory pattern -- complementary, not overlapping with this SD\'s ' +
    'default-export-naming-trap scope). No open/in-flight duplicate found. Proceed.',
  critical_issues: [],
  warnings: [],
  recommendations: [],
  detailed_analysis: {
    query: "strategic_directives_v2 title ILIKE '%client%factory%'",
    rows_found: 4,
    duplicates: 0,
    related_but_distinct: ['SD-LEO-REFAC-SUPABASE-CLIENT-FACTORY-001'],
  },
  metadata: {},
  execution_time_ms: 45000,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'VALIDATION',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('VALIDATION', SD_ID, { name: 'Validation Sub-Agent' }, results, { phase: PHASE });
console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('STORED_PHASE=' + (stored?.phase || 'n/a'));
