import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-E-E';

const description = `Child of SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-E's 17-object disposition audit. Repoints 2 mis-referenced columns in live, mounted route handlers -- both clear naming mix-ups, fixed with pure code changes and no schema migration.

REPOINT 1 -- strategic_directives_v2.legacy_id (server/routes/feedback.js). POST /:id/promote-to-sd (mounted at app.use('/api/feedback', requireAuth, feedbackRoutes)) inserted { legacy_id: sdId, ... } into strategic_directives_v2, but legacy_id was deliberately DROPPED by database/migrations/20260124_remove_legacy_id.sql ("legacy_id was a numeric ID from before UUID migration. It's no longer used and should be removed."). This is a CONFIRMED LIVE BUG: the insert throws Postgres 42703, uncaught, returning HTTP 500 to every caller -- this endpoint has been fully broken since 2026-01-24. Fixed by setting sd_key instead (the documented live replacement, already present on the table and used everywhere else as the human-readable SD identifier); feedback.js's insert previously never set sd_key at all.

REPOINT 2 -- venture_artifacts.stage_number (server/routes/stage24.js). POST /:ventureId/go-live (mounted at app.use('/api/stage24', requireAuth, stage24Routes)) upserts { stage_number: 24, ... } into venture_artifacts, but that table's actual column (per its original CREATE, database/migrations/20251206_factory_architecture.sql, and ~20 other tables' shared naming convention) is lifecycle_stage, not stage_number -- a clear naming mix-up, not aspirational functionality. This upsert IS error-checked (unlike the legacy_id case, the route already returns a proper 500 rather than silently swallowing), but it has been failing on every call. Fixed by writing lifecycle_stage instead.

OPEN ITEM, NOT RESOLVED IN THIS SD: database/migrations/20260108_auto_set_legacy_id_from_sd_key.sql defines a trigger (trg_auto_set_legacy_id) that sets NEW.legacy_id := NEW.sd_key on every strategic_directives_v2 insert/update. No later migration in the repo drops this trigger. Given thousands of SDs have been created since 2026-01-24 without a reported fleet-wide insert failure, the trigger is very likely already gone from the live database (dropped by an unlogged/manual operation, or the column-drop cascaded it) -- but this was NOT directly confirmed via a live catalog query in this investigation (no generic SQL-execution RPC was available to check pg_trigger directly). Flagged as a completion-flag finding for a follow-up live-catalog check, not blocking this SD's own fix.`;

const success_criteria = [
  { criterion: 'POST /api/feedback/:id/promote-to-sd succeeds instead of returning a 500', measure: 'server/routes/feedback.js inserts sd_key, not legacy_id; a manual POST against a locally-running server with a real feedback id returns 200 with a real sd_id in the response' },
  { criterion: 'POST /api/stage24/:ventureId/go-live succeeds instead of returning a 500', measure: 'server/routes/stage24.js upserts lifecycle_stage, not stage_number; a manual POST against a locally-running server with a real venture id returns 200' },
  { criterion: 'No new schema migration -- pure code repoint', measure: 'git diff shows only server/routes/feedback.js, server/routes/stage24.js, and their tests changed; no database/migrations/*.sql file added' },
];

const smoke_test_steps = [
  { step_number: 1, instruction: 'grep -n "legacy_id" server/routes/feedback.js', expected_outcome: 'Zero matches' },
  { step_number: 2, instruction: 'grep -n "stage_number" server/routes/stage24.js', expected_outcome: 'Zero matches' },
  { step_number: 3, instruction: 'npx vitest run tests/integration/api-routes/feedback-routes.test.js', expected_outcome: 'Test file resolves and passes (or DB-tier-skips) with the updated sd_key mock shape' },
];

const mechanism_verifications = [
  { verified_at: 'server/routes/feedback.js:85', verified_by: 'lead-audit-investigation' },
  { verified_at: 'server/routes/stage24.js:68', verified_by: 'lead-audit-investigation' },
  { verified_at: 'database/migrations/20260124_remove_legacy_id.sql:19', verified_by: 'lead-audit-investigation' },
  { verified_at: 'database/migrations/20251206_factory_architecture.sql:272', verified_by: 'lead-audit-investigation' },
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
console.log('E-E enriched: description, success_criteria, smoke_test_steps, mechanism_verifications.');
