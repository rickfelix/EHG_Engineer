import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-E';

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, metadata')
  .eq('sd_key', SD_KEY)
  .maybeSingle();
if (readErr) { console.error(readErr); process.exit(1); }

const disposition_table = [
  { object: 'ci_cd_failure_resolutions', kind: 'relation', disposition: 'REMOVE', reason: 'Part of api/webhooks/github-ci-status.js, deliberately unmounted per server/index.js:232-242 explicit comment. Migration database/migrations/leo-ci-cd-integration.sql exists but was never applied. Zero live risk.' },
  { object: 'ci_cd_pipeline_status', kind: 'relation', disposition: 'REMOVE', reason: 'Same feature/file as ci_cd_failure_resolutions.' },
  { object: 'ci_cd_monitoring_config', kind: 'relation', disposition: 'REMOVE', reason: 'Same feature/file.' },
  { object: 'strategic_directives_v2.ci_cd_status', kind: 'column', disposition: 'REMOVE', reason: 'Same dead unmounted webhook feature.' },
  { object: 'strategic_directives_v2.last_pipeline_run', kind: 'column', disposition: 'REMOVE', reason: 'Same.' },
  { object: 'strategic_directives_v2.pipeline_health_score', kind: 'column', disposition: 'REMOVE', reason: 'Same.' },
  { object: 'product_requirements_v3', kind: 'relation', disposition: 'REMOVE', reason: 'Referenced only in src/agents/story-bootstrap.js, gated behind FEATURE_STORY_AGENT=false (default off everywhere). CREATE TABLE exists (database/schema/010_ehg_backlog_schema.sql:98) but never applied; already flagged unresolved in a 2026-06-10 phantom-table sweep (docs/database/committed-unapplied-sweep-2026-06-10.md) as an open APPLY-vs-RETIRE decision. No development activity signal; retiring closes that 3-month-old open item.' },
  { object: 'pr_reviews', kind: 'relation', disposition: 'REMOVE', reason: 'No CREATE TABLE ever existed anywhere in repo history. Reachable via server/routes/dashboard.js mounted at app.use(\'/api\', optionalAuth, ...) -- optionalAuth does not reject unauthenticated callers, so effectively public. All 3 call sites in src/services/database-loader/pr-reviews.js swallow errors to []/null. No evidence this feature ever worked.' },
  { object: 'v_sd_release_gate', kind: 'view', disposition: 'MIGRATE', reason: 'Reachable via GET /api/stories/gate (server/index.js:288, optionalAuth). THREE historical competing definitions exist; only the Sept 22 2025 sd_backlog_map-based one (supabase/ehg_engineer/migrations/20250922112148_schema_user-stories.sql) matches live code\'s expected column shape (ready, total_stories, passing_count, failing_count, not_run_count, passing_pct). Apply that specific definition.' },
  { object: 'v_story_verification_status', kind: 'view', disposition: 'MIGRATE', reason: 'Reachable via GET /api/stories (server/index.js:286, no fallback -- currently a hard 400 to callers). Same Sept 22 migration file defines a matching version (sd_key, story_key, story_title, item_type, sequence_no, status, ...); the Jan 24 2026 version is schema-incompatible with current code. Apply the Sept 22 definition.' },
  { object: 'strategic_directives_v2.backlog_summary', kind: 'column', disposition: 'MIGRATE', reason: 'Confirmed real, designed LLM-summary caching pattern with an existing WRITE path (server/routes/backlog.js:299-306, storing an LLM-generated summary to avoid recomputation). This is the SD\'s own measured severity finding: the READ side silently swallows the 42703 and serves a false "no backlog items found" instead of the true "could not check" -- ADD the column to restore intended caching AND fix the swallow guard at backlog.js:150-165 to surface/log a genuine query error distinct from a legitimate cache-miss.' },
  { object: 'strategic_directives_v2.backlog_summary_generated_at', kind: 'column', disposition: 'MIGRATE', reason: 'Paired with backlog_summary -- same write path, same fix.' },
  { object: 'strategic_directives_v2.legacy_id', kind: 'column', disposition: 'REPOINT', reason: 'Deliberately DROPPED by database/migrations/20260124_remove_legacy_id.sql (comment: "no longer used, should be removed"). server/routes/feedback.js POST /:id/promote-to-sd (mounted, requireAuth) still inserts legacy_id, throwing an UNCAUGHT 500 on every call -- a confirmed live bug. Fix: set sd_key (the documented live replacement, already present on the table) instead. Also verify whether trigger trg_auto_set_legacy_id (database/migrations/20260108_auto_set_legacy_id_from_sd_key.sql) is still live and referencing the dropped column; drop it if so.' },
  { object: 'venture_exit_profiles.readiness_assessment', kind: 'column', disposition: 'MIGRATE', reason: 'Read at server/routes/eva-exit.js:277 (inside a Promise.all on the mounted, authenticated GET /api/eva/exit/portfolio-readiness -- a 42703 here rejects the whole Promise.all, likely crashing the entire dashboard endpoint) and :374 (GET /:ventureId/rehearsal/latest, where the existing error handler already misreports "No exit profile found" on ANY error including a schema error). No write path exists anywhere in the repo (confirmed: lib/eva/exit/separation-rehearsal.js computes a rehearsal result but never persists it to this column) -- this is unfinished Phase-3 work per the code\'s own comment ("Separation Rehearsal (Phase 3)", SD-VENTURE-ACQUISITIONREADINESS-ARCHITECTURE-ORCH-001-C). ADD the column as JSONB (additive, matches the code\'s own intended null-fallback design) to fix the confirmed crash risk and the misleading 404; the missing persist-write-path is a SEPARATE, larger feature gap flagged as a completion-flag finding, not built in this SD.' },
  { object: 'venture_exit_profiles.updated_at', kind: 'column', disposition: 'MIGRATE', reason: 'Simple standard-pattern omission: original CREATE (database/migrations/20260305_venture_exit_readiness_foundation.sql:36-51) has created_at but no updated_at/trigger, unlike sibling table venture_exit_readiness in the same migration file which does have it. Low-risk additive fix matching the existing sibling pattern.' },
  { object: 'venture_artifacts.stage_number', kind: 'column', disposition: 'REPOINT', reason: 'Single write site: server/routes/stage24.js:68 upserts stage_number:24, but the table\'s actual column (per its CREATE, database/migrations/20251206_factory_architecture.sql:267-308, and ~20 other tables\' shared naming convention) is lifecycle_stage. Clear naming mix-up -- fix stage24.js to write lifecycle_stage instead.' },
  { object: 'directive_submissions.processing_history', kind: 'column', disposition: 'REMOVE', reason: 'getSubmissionProgress() (src/services/database-loader/submissions.js:223, pass-through at index.js:130-131) is never called from any route (server/, api/) or any script anywhere in the repo -- fully dead code. No migration ever created this column. Delete the dead method.' },
];

const summary = {
  total_objects: 17,
  by_disposition: {
    REMOVE: disposition_table.filter(d => d.disposition === 'REMOVE').length,
    MIGRATE: disposition_table.filter(d => d.disposition === 'MIGRATE').length,
    REPOINT: disposition_table.filter(d => d.disposition === 'REPOINT').length,
  },
  decomposition_rationale: 'Disposition spans ~10 unrelated files across genuinely distinct systems (dead CI/CD webhook, abandoned PRD-v3 importer, never-built pr_reviews feature, 2 view-migrations, backlog-summary caching+swallow-fix, venture-exit-profiles columns, 2 unrelated repoint fixes) with different risk profiles (pure deletion vs additive migration vs live-code repoint). Decomposed into 5 children per CLAUDE.md PR-size guidance and the orchestrator-decompose-rather-than-release directive, so each disposition group ships as its own small, independently-revertible, gate-validated PR.',
};

const mergedMetadata = {
  ...(sd.metadata || {}),
  disposition_table,
  disposition_summary: summary,
  disposition_recorded_at: new Date().toISOString(),
  decomposed_into_children: [
    'SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-E-1',
    'SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-E-2',
    'SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-E-3',
    'SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-E-4',
    'SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-E-5',
  ],
};

const { error: writeErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata: mergedMetadata })
  .eq('id', sd.id);
if (writeErr) { console.error('WRITE ERROR', writeErr); process.exit(1); }
console.log('Disposition table recorded for', SD_KEY, '-- 9 REMOVE, 6 MIGRATE, 2 REPOINT.');
