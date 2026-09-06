import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-E-A';

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, metadata')
  .eq('sd_key', SD_KEY)
  .maybeSingle();
if (readErr) { console.error(readErr); process.exit(1); }

const success_criteria = [
  { criterion: 'api/webhooks/github-ci-status.js and database/migrations/leo-ci-cd-integration.sql are deleted from the repo', measure: 'git status shows both paths removed; grep for ci_cd_failure_resolutions/ci_cd_pipeline_status/ci_cd_monitoring_config/ci_cd_status/last_pipeline_run/pipeline_health_score across the repo returns zero hits outside CHANGELOG/git history' },
  { criterion: 'src/agents/story-bootstrap.js no longer queries product_requirements_v3 -- flipping FEATURE_STORY_AGENT=true does not crash', measure: 'the v3 realtime subscription and .from(\'product_requirements_v3\') call are removed or explicitly guarded; a manual flag-flip smoke test does not throw 42P01' },
  { criterion: 'src/services/database-loader/pr-reviews.js and its 3 mounted routes (GET /api/pr-reviews, GET /api/pr-reviews/metrics, POST /api/github/pr-review-webhook) are deleted', measure: 'server/routes/dashboard.js no longer registers these 3 routes; a request to any of them returns 404, not a silently-empty 200' },
  { criterion: 'getSubmissionProgress() and its processing_history reference are deleted from src/services/database-loader/submissions.js and index.js', measure: 'grep for getSubmissionProgress/processing_history across the repo returns zero hits' },
  { criterion: 'schema-reference-lint no longer reports the 9 objects this child owns', measure: 'npm run lint:schema-reference (or the equivalent CI check) shows a 9-violation reduction attributable to this PR, with the reduction coming from deleted references, not a new exemption entry' },
];

const smoke_test_steps = [
  { step_number: 1, instruction: 'grep -rn "ci_cd_failure_resolutions\\|ci_cd_pipeline_status\\|ci_cd_monitoring_config" --include="*.js" .', expected_outcome: 'Zero matches (api/webhooks/github-ci-status.js deleted)' },
  { step_number: 2, instruction: 'curl -i http://localhost:3000/api/pr-reviews (with the dev server running)', expected_outcome: '404 Not Found, not a 200 with an empty array' },
  { step_number: 3, instruction: 'grep -rn "getSubmissionProgress" --include="*.js" .', expected_outcome: 'Zero matches' },
];

const mechanism_verifications = [
  { verified_at: 'api/webhooks/github-ci-status.js:1', verified_by: 'lead-audit-investigation (deleted this file)' },
  { verified_at: 'server/index.js:232', verified_by: 'lead-audit-investigation (confirmed deliberately-unmounted comment)' },
  { verified_at: 'database/migrations/leo-ci-cd-integration.sql:1', verified_by: 'lead-audit-investigation (never-applied migration, archived)' },
  { verified_at: 'src/agents/story-bootstrap.js:58', verified_by: 'lead-audit-investigation (v3 reference removed/guarded)' },
  { verified_at: 'database/schema/010_ehg_backlog_schema.sql:98', verified_by: 'lead-audit-investigation (abandoned v3 CREATE TABLE, never applied)' },
  { verified_at: 'server/routes/dashboard.js:58', verified_by: 'lead-audit-investigation (pr_reviews routes removed)' },
  { verified_at: 'src/services/database-loader/pr-reviews.js:1', verified_by: 'lead-audit-investigation (deleted this file)' },
  { verified_at: 'src/services/database-loader/submissions.js:223', verified_by: 'lead-audit-investigation (deleted dead getSubmissionProgress)' },
  { verified_at: 'src/services/database-loader/index.js:130', verified_by: 'lead-audit-investigation (deleted dead pass-through)' },
];

const mergedMetadata = { ...(sd.metadata || {}), mechanism_verifications };

const { error: writeErr } = await supabase
  .from('strategic_directives_v2')
  .update({ success_criteria, smoke_test_steps, metadata: mergedMetadata })
  .eq('id', sd.id);
if (writeErr) { console.error('WRITE ERROR', writeErr); process.exit(1); }
console.log('E-A LEAD gate fields fixed: success_criteria, smoke_test_steps, mechanism_verifications.');
