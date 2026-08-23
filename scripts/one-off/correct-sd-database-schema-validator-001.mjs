#!/usr/bin/env node
/**
 * Replace the auto-escalated boilerplate ([UNPOPULATED] placeholders) on
 * SD-LEO-FIX-DATABASE-SCHEMA-VALIDATOR-001 with content specific to the
 * actual defect: lib/sub-agents/database/schema-validator.js's migrationPaths
 * glob array never scans database/chairman-gated/*.sql.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-FIX-DATABASE-SCHEMA-VALIDATOR-001';

const patch = {
  success_criteria: [
    {
      criterion: 'migrationPaths in lib/sub-agents/database/schema-validator.js includes database/chairman-gated/*.sql',
      measure: 'Code review confirms the glob array lists the pattern'
    },
    {
      criterion: 'staticFileValidation() detects a chairman-gated migration mentioning the SD ID',
      measure: 'New regression test: a fixture chairman-gated *.sql referencing a test SD ID yields verdict=VALID with the file in migration_files (was previously verdict=NOT_REQUIRED, 0 files)'
    },
    {
      criterion: 'No regression to the existing three glob patterns',
      measure: 'Existing schema-validator tests still pass unchanged'
    }
  ],
  success_metrics: [
    { metric: 'Fixture-blind gap closed', target: 'chairman-gated migrations are scanned (was: 0 of the 56 live files ever scanned)' },
    { metric: 'Test coverage', target: 'New regression test proves the previously-blind path now detects a match' },
    { metric: 'Zero regressions', target: '0 existing schema-validator tests broken' }
  ],
  key_changes: [
    {
      change: "Add 'database/chairman-gated/*.sql' as a fourth entry in the migrationPaths array (lib/sub-agents/database/schema-validator.js:98-102)",
      type: 'fix'
    },
    {
      change: 'Add a regression test proving staticFileValidation() now finds a matching chairman-gated migration by SD ID',
      type: 'test'
    }
  ],
  risks: [
    {
      risk: 'None material — purely additive glob pattern, no removal or behavior change to existing paths',
      impact: 'low',
      likelihood: 'low',
      mitigation: 'Regression test asserts the three pre-existing patterns are unaffected'
    }
  ],
  smoke_test_steps: [
    {
      step_number: 1,
      instruction: 'Create a throwaway *.sql file under database/chairman-gated/ whose content mentions a test SD ID',
      expected_outcome: 'File exists on disk'
    },
    {
      step_number: 2,
      instruction: 'Run staticFileValidation(testSdId, {}) from lib/sub-agents/database/schema-validator.js',
      expected_outcome: "verdict='VALID', migration_files includes the chairman-gated fixture path"
    },
    {
      step_number: 3,
      instruction: 'Delete the throwaway fixture file',
      expected_outcome: 'No residue left in database/chairman-gated/'
    }
  ]
};

const { data, error } = await supabase
  .from('strategic_directives_v2')
  .update(patch)
  .eq('sd_key', SD_KEY)
  .select('sd_key, success_criteria, key_changes')
  .single();

if (error) {
  console.error('❌ Update failed:', error.message);
  process.exit(1);
}

console.log('✅ Corrected SD content for', data.sd_key);
console.log(JSON.stringify(data, null, 2));
