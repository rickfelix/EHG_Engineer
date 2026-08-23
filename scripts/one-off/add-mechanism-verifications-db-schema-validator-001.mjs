#!/usr/bin/env node
/**
 * GATE_MECHANISM_CLAIM_VERIFIER requires metadata.mechanism_verifications for
 * SD-LEO-FIX-DATABASE-SCHEMA-VALIDATOR-001's spine, which names a file+function
 * mechanism (staticFileValidation's glob call). The Explore agent's own genuine
 * investigation (evidence row 8d5f09dc, independently reproduced by the LEAD
 * session at lib/sub-agents/database/schema-validator.js) is the verifier.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-FIX-DATABASE-SCHEMA-VALIDATOR-001';

const { data: existing, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('sd_key', SD_KEY)
  .single();

if (fetchErr) {
  console.error('❌ Fetch failed:', fetchErr.message);
  process.exit(1);
}

const metadata = {
  ...existing.metadata,
  mechanism_verifications: [
    {
      verified_by: 'sub_agent_execution_results:8d5f09dc-dad6-4945-aaf7-8ee3f13909ad (EXPLORE, phase=LEAD)',
      verified_at: 'lib/sub-agents/database/schema-validator.js:98-114',
      claim: "staticFileValidation()'s migrationPaths glob loop never populated allFiles because `await glob(pattern)` (glob@7.2.3, callback/EventEmitter API) resolves to the Glob instance, not the match array",
      reproduction: 'Live control experiment: staticFileValidation(\"SD-KNOWLEDGE-001\", {}) returned verdict=NOT_REQUIRED/0 files on unmodified main, despite database/migrations/20251015_add_retrospective_quality_score_constraint.sql (grep-confirmed) containing that exact SD ID; fix (promisify(glob) + cwd:getRepoRoot()+absolute:true) verified live to return verdict=INVALID with 5 real files found for the same call.'
    }
  ]
};

const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata })
  .eq('sd_key', SD_KEY);

if (updateErr) {
  console.error('❌ Update failed:', updateErr.message);
  process.exit(1);
}

console.log('✅ mechanism_verifications recorded for', SD_KEY);
