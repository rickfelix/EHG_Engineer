import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-E-B';

const description = `Child of SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-E's 17-object disposition audit. Applies the 2 missing story-gate views (v_story_verification_status, v_sd_release_gate) that src/api/stories.js queries from 2 mounted, live routes (GET /api/stories and GET /api/stories/gate, server/index.js:286/288).

Both views have 2-3 mutually incompatible historical definitions across migration files, none live today (confirmed absent from database/schema-reference-snapshot.json). Only ONE historical version -- supabase/ehg_engineer/migrations/20250922112148_schema_user-stories.sql (2025-09-22) -- actually matches what src/api/stories.js's queries expect: sd_key, sequence_no, status, total_stories, passing_count, failing_count, not_run_count, passing_pct, ready. A LATER migration (20260124_update_views_remove_legacy_id.sql) replaced these names with incompatible schemas built on a different base (v_sd_keys / user_stories) that would break the live code if applied instead.

The Sept 22 migration's other change -- adding item_type, parent_id, sequence_no, verification_status, verification_source, acceptance_criteria, priority to sd_backlog_map -- is ALREADY LIVE (confirmed via a direct read of database/schema-reference-snapshot.json's sd_backlog_map column list), so this child needs only a CREATE OR REPLACE VIEW migration for the 2 views, reproducing the Sept 22 definitions verbatim; no ALTER TABLE is needed.

DISPOSITION: MIGRATE. A new migration (database/migrations/20260906_restore_story_gate_views.sql) creates both views using the Sept 22, code-matching definitions. Prior to this fix, GET /api/stories/gate degrades to a hardcoded fallback object (no real gate status), and GET /api/stories returns a hard 400 to callers (no fallback) -- both routes become fully functional once the views exist.`;

const success_criteria = [
  { criterion: 'v_story_verification_status and v_sd_release_gate both exist live and return real data (not error, not a fallback object)', measure: 'A direct query against both views (via node -e using the service-role client) returns rows without a Postgres error' },
  { criterion: 'GET /api/stories and GET /api/stories/gate both return real data from the views instead of a 400 or a hardcoded fallback', measure: 'A local server smoke test against both routes returns 200 with view-backed data' },
  { criterion: 'The migration is additive-only -- no ALTER TABLE, no data loss', measure: 'The migration file contains only CREATE OR REPLACE VIEW statements' },
];

const smoke_test_steps = [
  { step_number: 1, instruction: 'node scripts/apply-migration.js database/migrations/20260906_restore_story_gate_views.sql', expected_outcome: 'Migration applies successfully against the live database' },
  { step_number: 2, instruction: 'node -e "require(\'dotenv\').config(); const {createClient}=require(\'@supabase/supabase-js\'); const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY); s.from(\'v_sd_release_gate\').select(\'*\').limit(1).then(({data,error})=>console.log(error||data))"', expected_outcome: 'Returns rows or an empty array, not a 42P01 relation-does-not-exist error' },
  { step_number: 3, instruction: 'Repeat step 2 for v_story_verification_status', expected_outcome: 'Same -- no relation-does-not-exist error' },
];

const mechanism_verifications = [
  { verified_at: 'src/api/stories.js:97', verified_by: 'lead-audit-investigation' },
  { verified_at: 'src/api/stories.js:216', verified_by: 'lead-audit-investigation' },
  { verified_at: 'server/index.js:286', verified_by: 'lead-audit-investigation' },
  { verified_at: 'database/migrations/20260906_restore_story_gate_views.sql:1', verified_by: 'lead-audit-investigation' },
  { verified_at: 'supabase/ehg_engineer/migrations/20250922112148_schema_user-stories.sql:63', verified_by: 'lead-audit-investigation (source definition reproduced)' },
];

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, metadata')
  .eq('sd_key', SD_KEY)
  .maybeSingle();
if (readErr) { console.error(readErr); process.exit(1); }

const metadata = { ...(sd.metadata || {}), mechanism_verifications };

const { error: writeErr } = await supabase
  .from('strategic_directives_v2')
  .update({ description, scope: description, success_criteria, smoke_test_steps, metadata })
  .eq('id', sd.id);
if (writeErr) { console.error('WRITE ERROR', writeErr); process.exit(1); }
console.log('E-B enriched: description, success_criteria, smoke_test_steps, mechanism_verifications.');
