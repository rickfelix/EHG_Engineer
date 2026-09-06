import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-E-D';

const description = `Child of SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-E's 17-object disposition audit. Adds venture_exit_profiles.readiness_assessment and .updated_at, both read by server/routes/eva-exit.js from 2 mounted, authenticated routes (GET /api/eva/exit/portfolio-readiness and GET /api/eva/exit/:ventureId/rehearsal/latest), never existing live.

CONFIRMED CRASH RISK: /portfolio-readiness runs a Promise.all across 4 queries including a .select('venture_id, exit_model, readiness_assessment, updated_at') against venture_exit_profiles (eva-exit.js:277). A 42703 on any query in that Promise.all rejects the whole batch; the route is wrapped in asyncHandler, which forwards to Express's error handler -- meaning this dashboard endpoint has been fully broken (500) since these columns never existed. /rehearsal/latest (eva-exit.js:372-377) similarly selects readiness_assessment, updated_at and returns 404 "No exit profile found for this venture" on ANY query error including a schema error -- misreporting even when the profile genuinely exists (the same false-statement-of-fact defect class the parent workstream exists to abolish).

NO WRITE PATH EXISTS for readiness_assessment anywhere in the repo (confirmed: lib/eva/exit/separation-rehearsal.js computes a rehearsal result but never persists it to this column -- the "Separation Rehearsal (Phase 3)" comment above these routes, referencing SD-VENTURE-ACQUISITIONREADINESS-ARCHITECTURE-ORCH-001-C, indicates this is unfinished, not abandoned, work). Adding the column stops the confirmed crash and restores the code's own designed null-fallback behavior (data.readiness_assessment || null); it does NOT complete the missing persist step, which is a separate, larger feature gap filed as a completion-flag finding, not built in this SD.

updated_at is a simple standard-pattern omission: the table's own CREATE (database/migrations/20260305_venture_exit_readiness_foundation.sql) has created_at but no updated_at/trigger, unlike sibling table venture_exit_readiness in the same migration file which already has one. Low-risk additive fix matching the existing sibling convention.

DISPOSITION: MIGRATE, pure schema change -- no application code requires modification. Both routes already correctly handle the fields once the columns exist (the null-fallback and the 404-on-error paths are both already-correct designs that were simply starved of real data).`;

const success_criteria = [
  { criterion: 'readiness_assessment and updated_at exist live on venture_exit_profiles', measure: 'A direct query against venture_exit_profiles selecting both columns returns without a 42703 error' },
  { criterion: 'GET /api/eva/exit/portfolio-readiness no longer crashes', measure: 'A manual GET against a locally-running server returns 200 with an array (possibly empty), not a 500' },
  { criterion: 'updated_at auto-maintains on row update, matching sibling table venture_exit_readiness', measure: 'A manual UPDATE on a venture_exit_profiles row shows updated_at change to the current time via the new trigger' },
];

const smoke_test_steps = [
  { step_number: 1, instruction: 'node scripts/apply-migration.js database/migrations/20260906_add_venture_exit_profiles_missing_columns.sql', expected_outcome: 'Migration applies successfully' },
  { step_number: 2, instruction: 'node -e "require(\'dotenv\').config(); const {createClient}=require(\'@supabase/supabase-js\'); const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY); s.from(\'venture_exit_profiles\').select(\'readiness_assessment, updated_at\').limit(1).then(({data,error})=>console.log(error||data))"', expected_outcome: 'Returns rows or an empty array without a 42703 error' },
  { step_number: 3, instruction: 'GET /api/eva/exit/portfolio-readiness on a locally-running server', expected_outcome: '200 with a JSON array, not a 500' },
];

const mechanism_verifications = [
  { verified_at: 'server/routes/eva-exit.js:277', verified_by: 'lead-audit-investigation' },
  { verified_at: 'server/routes/eva-exit.js:372', verified_by: 'lead-audit-investigation' },
  { verified_at: 'lib/eva/exit/separation-rehearsal.js:73', verified_by: 'lead-audit-investigation (confirmed no write path exists)' },
  { verified_at: 'database/migrations/20260906_add_venture_exit_profiles_missing_columns.sql:1', verified_by: 'lead-audit-investigation' },
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
console.log('E-D enriched: description, success_criteria, smoke_test_steps, mechanism_verifications.');
