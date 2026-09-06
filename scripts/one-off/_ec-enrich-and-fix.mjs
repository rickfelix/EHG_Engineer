import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-E-C';

const description = `Child of SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-E's 17-object disposition audit. Restores strategic_directives_v2.backlog_summary and backlog_summary_generated_at, and fixes the guard defect that is this whole parent workstream's OWN measured-severity finding: server/routes/backlog.js's GET /backlog-summary/:sd_id silently swallows a genuine query error into a false "no backlog items found" response instead of surfacing "could not check."

MEASURED (Alpha-4, 2026-09-03 16:24Z, cited in the parent SD's description): a live probe of GET /api/backlog/backlog-summary/SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-C returned HTTP 200 with "No backlog items found for this strategic directive" -- but the underlying cache-check query (backlog.js:156-160, selecting backlog_summary/backlog_summary_generated_at) fails with error 42703 (column does not exist). The guard \`if (!sdError && sdData?.backlog_summary)\` is false whenever sdError is truthy, so the route falls through to its generate-fresh path without ever logging or surfacing the real cause. This is a false statement of fact served to callers -- worse than an outage because it raises no alarm, per the parent SD's own severity re-ranking.

DISPOSITION: MIGRATE + fix the guard. The write path (backlog.js:299-306) is real, designed, working functionality -- it calls an LLM to generate a summary, then caches the result in these two columns to avoid repeated LLM calls. This confirms the caching design is intentional, not aspirational; adding the columns restores it. The guard fix (backlog.js:154-170) distinguishes a genuine query error (now logged as a warning) from a legitimate cache-miss (silently falls through, as before) -- the request still degrades gracefully to generating a fresh summary either way, but a real failure is no longer indistinguishable from "nothing cached yet."`;

const success_criteria = [
  { criterion: 'backlog_summary and backlog_summary_generated_at exist live on strategic_directives_v2', measure: 'A direct query against strategic_directives_v2 selecting both columns returns without a 42703 error' },
  { criterion: 'GET /backlog-summary/:sd_id returns a cached summary on a second call instead of always regenerating', measure: 'Two sequential calls to the same sd_id on a locally-running server: the second call returns from_database: true' },
  { criterion: 'A genuine query error on the cache-check is logged distinctly from a legitimate cache-miss', measure: 'server/routes/backlog.js contains an explicit console.warn branch for the sdError case, separate from the cache-miss fall-through' },
];

const smoke_test_steps = [
  { step_number: 1, instruction: 'node scripts/apply-migration.js database/migrations/20260906_restore_backlog_summary_caching.sql', expected_outcome: 'Migration applies successfully' },
  { step_number: 2, instruction: 'node -e "require(\'dotenv\').config(); const {createClient}=require(\'@supabase/supabase-js\'); const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY); s.from(\'strategic_directives_v2\').select(\'backlog_summary, backlog_summary_generated_at\').limit(1).then(({data,error})=>console.log(error||data))"', expected_outcome: 'Returns rows without a 42703 error' },
  { step_number: 3, instruction: 'GET /api/backlog/backlog-summary/:sd_id twice in a row on a locally-running server', expected_outcome: 'Second call returns from_database: true with the cached summary' },
];

const mechanism_verifications = [
  { verified_at: 'server/routes/backlog.js:154', verified_by: 'lead-audit-investigation' },
  { verified_at: 'server/routes/backlog.js:299', verified_by: 'lead-audit-investigation (confirmed write path)' },
  { verified_at: 'database/migrations/20260906_restore_backlog_summary_caching.sql:1', verified_by: 'lead-audit-investigation' },
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
console.log('E-C enriched: description, success_criteria, smoke_test_steps, mechanism_verifications.');
