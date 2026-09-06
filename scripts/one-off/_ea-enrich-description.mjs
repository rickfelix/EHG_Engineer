import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-E-A';

const description = `Child of SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-E's 17-object disposition audit. This child retires 9 of those 17 objects across 3 unrelated dead/abandoned feature surfaces, closing 3 disposition groups with zero live functional loss.

GROUP 1 -- CI/CD webhook (6 objects: relations ci_cd_failure_resolutions, ci_cd_pipeline_status, ci_cd_monitoring_config; strategic_directives_v2 columns ci_cd_status, last_pipeline_run, pipeline_health_score). All 6 are referenced ONLY in api/webhooks/github-ci-status.js, which server/index.js:232-242 explicitly documents as deliberately NOT mounted (a prior SD, SD-FDBK-FIX-BLOCKING-STRIPE-LIVE-001, fixed a crash/auth-bypass in the same file but left it unmounted pending this exact migration gap). The migration that would create all 6 objects (database/migrations/leo-ci-cd-integration.sql) exists in the repo but was never applied. Zero live HTTP reachability, zero user-facing risk. DISPOSITION: delete api/webhooks/github-ci-status.js and archive/delete the never-applied migration file, removing the phantom-reference source entirely rather than resurrecting a stalled feature as a side effect of a schema-cleanup SD.

GROUP 2 -- product_requirements_v3 (1 relation). Referenced only in src/agents/story-bootstrap.js, gated behind FEATURE_STORY_AGENT=false (default off everywhere it's documented -- agents/story/index.js, runbooks, tests). A CREATE TABLE for it exists (database/schema/010_ehg_backlog_schema.sql:98-110, an abandoned "backlog importer" PRD-storage schema distinct in lineage from the live product_requirements_v2) but was never applied. This exact object was already flagged 3 months ago in a chairman-directed phantom-table sweep (docs/database/committed-unapplied-sweep-2026-06-10.md, SD-LEO-INFRA-APPLY-RETIRE-COMMITTED-001) as an open APPLY-vs-RETIRE decision, left unresolved since. No development activity signal on the flag. DISPOSITION: RETIRE -- remove/guard story-bootstrap.js's v3-dependent code path so a future flip of the (currently unused) flag fails gracefully rather than crashing on a phantom table, closing the 3-month-old open sweep item as RETIRE.

GROUP 3 -- pr_reviews (1 relation). Reachable via server/routes/dashboard.js, mounted at app.use('/api', optionalAuth, dashboardRoutes) in server/index.js:277 -- exposing GET /api/pr-reviews, GET /api/pr-reviews/metrics, and POST /api/github/pr-review-webhook. optionalAuth does not reject unauthenticated callers, so these are effectively PUBLIC routes. All 3 call sites in src/services/database-loader/pr-reviews.js wrap their query in try/catch and silently return []/null on any error -- no CREATE TABLE for pr_reviews has EVER existed anywhere in the repo's migration history (unlike the other groups, which all have some abandoned-but-real migration attempt). This is unambiguous evidence the feature was scaffolded in JS but its DB layer was never built, and it has been silently serving empty/false-clean responses to public callers for an unknown duration. DISPOSITION: REMOVE -- delete src/services/database-loader/pr-reviews.js, its wiring in src/services/database-loader/index.js, and the 3 mounted routes in server/routes/dashboard.js. No historical schema exists to migrate toward; building one from scratch would be new speculative feature work, out of scope for a disposition SD.

GROUP 4 -- directive_submissions.processing_history (1 column). getSubmissionProgress() (src/services/database-loader/submissions.js:223, with a pass-through wrapper at index.js:130-131) is never called from any mounted route (server/, api/) or any script anywhere in the repo -- confirmed via repo-wide search, zero callers found. No migration ever created this column. Fully dead code with zero live reachability. DISPOSITION: REMOVE the dead getSubmissionProgress() method and its pass-through wrapper.

ACCEPTANCE (inherited from parent E, this child's share): the schema-reference-lint no longer reports these 9 objects' violations after this PR, and the reason is genuine disposition (dead code deleted) rather than a lint suppression/exemption added around still-present phantom references. Removing the pr_reviews mounted, PUBLIC routes is a visible decision recorded here, not a silent deletion -- per the parent's "no live authenticated endpoint is removed without that removal being visible as a decision" acceptance criterion (pr_reviews' routes are technically public rather than authenticated, but the same transparency standard applies).`;

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id')
  .eq('sd_key', SD_KEY)
  .maybeSingle();
if (readErr) { console.error(readErr); process.exit(1); }

const { error: writeErr } = await supabase
  .from('strategic_directives_v2')
  .update({ description, scope: description })
  .eq('id', sd.id);
if (writeErr) { console.error('WRITE ERROR', writeErr); process.exit(1); }
console.log('E-A description/scope enriched.');
