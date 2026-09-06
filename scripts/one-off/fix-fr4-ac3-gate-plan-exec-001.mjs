#!/usr/bin/env node
// Corrects FR-4 AC-3 in PRD-SD-LEO-FIX-GATE-PLAN-EXEC-001: an earlier inline `node -e` shell
// command had a backtick-quoted table/column name that bash silently command-substituted away
// before the string reached node, leaving "The  column..." (missing name) in the stored value.
// Also resolves the migration-vs-comment ambiguity the stories-agent flagged: no DB migration,
// a code comment only.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRD_ID = 'PRD-SD-LEO-FIX-GATE-PLAN-EXEC-001';

const { data, error } = await supabase
  .from('product_requirements_v2')
  .select('functional_requirements')
  .eq('id', PRD_ID)
  .single();

if (error) {
  console.error('❌ Fetch failed:', error.message);
  process.exit(1);
}

const frs = data.functional_requirements;
const fr4 = frs.find((f) => f.id === 'FR-4');
if (!fr4) {
  console.error('❌ FR-4 not found');
  process.exit(1);
}

fr4.acceptance_criteria[2] =
  "AC-3: The leo_validation_rules.validator_function column for the prdQualityValidation row is updated (still validatePRDQuality, since gate-1 still calls it) -- the row's criteria.min_score stale/inert value (confirmed non-authoritative per ValidationOrchestrator.js:1062) is annotated as non-authoritative via a CODE comment at the gate-1 call site, NOT a database migration -- no schema/DB change is needed for a JSONB field annotation, consistent with this PRD's runtime_config stating no migration is required.";

const { error: updateErr } = await supabase
  .from('product_requirements_v2')
  .update({ functional_requirements: frs })
  .eq('id', PRD_ID);

if (updateErr) {
  console.error('❌ Update failed:', updateErr.message);
  process.exit(1);
}

console.log('✅ FR-4 AC-3 corrected (backtick-swallowed table/column name restored; migration-vs-comment ambiguity resolved).');
console.log(fr4.acceptance_criteria[2]);
