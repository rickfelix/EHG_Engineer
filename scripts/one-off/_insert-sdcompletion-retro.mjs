#!/usr/bin/env node
/**
 * One-off: INSERT the SD_COMPLETION retrospective row for
 * SD-ACTIVATE-SURFACEAWARE-WIREFRAME-PIPELINE-ORCH-001.
 *
 * CRITICAL constraints (per LEO gate semantics + task brief):
 *  - retro_type           = 'SD_COMPLETION'
 *  - retrospective_type   = NULL  (NOT 'SD_COMPLETION' — the LEAD-FINAL gate filter
 *    looks for retro_type='SD_COMPLETION' AND retrospective_type IS NULL; the canonical
 *    writer already emitted the LEAD_TO_PLAN retro with retrospective_type set)
 *  - created_at           = now()  (must be AFTER the LEAD-TO-PLAN handoff @ 2026-05-20T18:10:01Z)
 *
 * Note: an auto_validate_retrospective_quality trigger may recompute quality_score on
 * insert; we set an honest value and re-read the stored row to report the final score.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

(function loadEnvFromAncestors() {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    const envFile = path.join(dir, '.env');
    if (fs.existsSync(envFile)) { dotenv.config({ path: envFile }); return; }
    dir = path.dirname(dir);
  }
})();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_UUID = '00d9049a-a0f8-42d8-b222-22979d56f2e0';
const SD_KEY = 'SD-ACTIVATE-SURFACEAWARE-WIREFRAME-PIPELINE-ORCH-001';
const nowIso = new Date().toISOString();

const what_went_well = [
  'VALIDATE-FIRST methodology caught a real activation gap that 82 passing unit tests missed: live Cron Canary validation showed 0 marketing surfaces (everything classified as app) BEFORE the fix and 1 marketing surface (Landing Page) AFTER — proving the activation actually flows end-to-end against stored data.',
  'The producer-side writer-consumer gap was closed cleanly at the universal seam: FR-3 threaded the surface-tagged Stage 15 wireframe_screens JSONB (venture_artifacts.artifact_data.screens[]) into analyzeStage18MarketingCopy via stage-18 onBeforeAnalysis, flag-gated and fail-safe.',
  'Dormant-safe activation: all three commits merge with EVA_SURFACE_AWARE_ENABLED off and produce a byte-identical baseline — flag-off parity verified, so the merge carries zero production risk and go-live is a single runtime flag flip.',
  'RCA correctly classified the scoped migration as DEAD_SCOPE (confidence 0.98) rather than letting a mis-targeted ALTER TABLE ship: the migration + backfill targeted a public.wireframe_screens table that never existed, while surface actually lives in venture_artifacts JSONB.',
  'target_application was pinned to EHG_Engineer and re-verified before every handoff via a guard script, preventing the recurring auto-misclassification of marketing-vocabulary SDs to EHG that breaks GATE2/GATE5/GATE6.',
  'EXEC sub-agent evidence was strong and fresh: TESTING PASS@94 with activation_invariant_verified=true (26e15ea8) and SECURITY PASS@96 (5c4d0e69); 82/82 unit tests green.'
];

const what_needs_improvement = [
  'Unit fixtures used the `name` key while persisted venture_artifacts screens use `screen_name` (S15 post-hook normalization). classifySurface read only screen.name, so 82 unit tests passed against fixtures that did not match the real stored shape — the activation was inert in production despite a green suite.',
  'The SD was authored with a scoped migration against a public.wireframe_screens TABLE that never existed; an ALTER TABLE x with no CREATE TABLE x and no live relation should have been a pre-EXEC red flag, especially when `wireframe_screens` already exists as a venture_artifacts artifact_type.',
  'A parallel session emptied the shared main checkout node_modules mid-session (shared-working-tree hazard), forcing an npm ci recovery — a costly interruption that the worktree isolation model is supposed to prevent.',
  'Several harness defects surfaced during the work but had to be deferred (product mode): a CONDITIONAL_PASS-forbidden-in-prospective DB constraint, the rca-agent missing its Task tool, and a search-prior-issues.js crash — each added friction to an otherwise clean SD.'
];

const key_learnings = [
  'Validate flag-gated activations against REAL stored data shapes, not just unit fixtures. The screen.name vs screen_name mismatch is the canonical example: a green unit suite proved nothing about production because the fixtures diverged from the persisted JSONB contract written by the S15 post-hook.',
  'classifySurface name resolution must read the full fallback chain name ?? screen_name ?? title to be robust to producer-side normalization differences across the pipeline.',
  'onBeforeAnalysis is the universal stage-context seam: both stage-execution-engine.js and eva-orchestrator.js spread its result into the analysisStep params, so threading new cross-stage context there reaches every execution path with one change.',
  'DEAD_SCOPE / "built but mis-targeted" is a distinct subclass of PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001: the artifact was built (migration authored) but pointed at a relation no consumer reads. When an artifact name already exists as a venture_artifacts artifact_type, ALTER migrations against a same-named physical table are a strong mis-targeting signal.',
  'target_application auto-classification mislabels marketing-vocabulary SDs to EHG even when the code lives in EHG_Engineer; pin and re-verify it before every handoff or GATE2/GATE5/GATE6 will fail on the wrong repo.',
  'Activation can be made dormant-safe by gating producer-side wiring behind a runtime flag and proving byte-identical flag-off parity — this decouples the merge (low risk) from the go-live decision (a single operator flag flip in the prod EVA runtime).'
];

const action_items = [
  'GO-LIVE (handed off): set EVA_SURFACE_AWARE_ENABLED=true in the production EVA runtime to activate the surface-aware pipeline; code is already merged dormant-safe on origin/main (bff5312a79).',
  'CAPA (deferred to harness backlog): add a migration-readiness control that rejects an ALTER TABLE x when there is no CREATE TABLE x in scope and no live relation x — and flags the case where x already exists as a venture_artifacts artifact_type.',
  'TESTING: add an integration/contract fixture for classifySurface that uses the REAL persisted venture_artifacts screens shape (screen_name), so the next surface change cannot pass against name-only fixtures.',
  'HARNESS (deferred, logged): triage the 5 harness-backlog items captured this session — node_modules wipe in shared tree, CONDITIONAL_PASS-forbidden-in-prospective DB constraint, rca-agent missing Task tool, search-prior-issues.js crash, and the mis-targeted-migration cleanup + control.',
  'CLEANUP: dispose of the dead-scope migration 20260520_add_surface_columns_to_wireframe_screens.sql and its backfill so they do not get re-applied against a non-existent table.'
];

const success_patterns = [
  'VALIDATE-FIRST against live data before declaring an activation done.',
  'Flag-gated, fail-safe producer-side wiring with byte-identical flag-off parity.',
  'RCA-driven dead-scope detection before a mis-targeted migration ships.',
  'Pin-and-verify target_application at every handoff for marketing-vocabulary SDs.'
];

const failure_patterns = [
  'Green unit suite over fixtures that diverge from the real persisted data contract (screen.name vs screen_name).',
  'ALTER TABLE migration authored against a relation that never existed (built-but-mis-targeted asymmetry).',
  'Shared-working-tree node_modules wipe by a parallel session.'
];

const detailed_summary =
  'SD-ACTIVATE-SURFACEAWARE-WIREFRAME-PIPELINE-ORCH-001 activated the dormant surface-aware wireframe pipeline ' +
  '(surface enum {marketing,auth,app} flowing S15->S17->S18 behind EVA_SURFACE_AWARE_ENABLED). Three commits on ' +
  'origin/main (bff5312a79): FR-3 stage-18 onBeforeAnalysis threads the surface-tagged S15 wireframe_screens JSONB ' +
  'into analyzeStage18MarketingCopy (closing the producer-side writer-consumer gap that left the feature inert); ' +
  'a classifySurface name-fallback fix (name ?? screen_name ?? title); and a dead-scope disposition + PRD ' +
  'activation_test_id/smoke_test_cmd. 82/82 unit tests, flag-off byte-identical parity. The standout learning: ' +
  'VALIDATE-FIRST against live Cron Canary data caught an activation gap (0 marketing -> 1 marketing after the fix) ' +
  'that 82 passing unit tests missed because fixtures used `name` while persisted data uses `screen_name`. RCA ' +
  'verdict DEAD_SCOPE (0.98) on a migration mis-targeted at a non-existent public.wireframe_screens table; surface ' +
  'actually lives in venture_artifacts JSONB. Activation is dormant-safe; go-live is the operator setting the flag true.';

const row = {
  sd_id: SD_UUID,
  project_name: SD_KEY,
  retro_type: 'SD_COMPLETION',
  retrospective_type: null, // CRITICAL: NULL so the LEAD-FINAL gate filter recognizes this as the completion retro
  title: 'SD Completion Retrospective: Activate Surface-Aware Wireframe pipeline (S15->S17->S18 surface enum)',
  description: detailed_summary,
  conducted_date: nowIso,
  agents_involved: ['LEAD', 'PLAN', 'EXEC'],
  sub_agents_involved: ['TESTING', 'SECURITY', 'RCA', 'RETRO'],
  human_participants: [],
  what_went_well,
  what_needs_improvement,
  action_items,
  key_learnings,
  success_patterns,
  failure_patterns,
  improvement_areas: [
    'Contract/integration fixtures must mirror persisted JSONB shapes.',
    'Migration-readiness control for ALTER-without-CREATE / artifact-name collisions.',
    'Shared-working-tree node_modules protection.'
  ],
  quality_score: 92,
  technical_debt_addressed: true,
  technical_debt_created: false,
  bugs_found: 1,        // classifySurface name vs screen_name activation gap
  bugs_resolved: 1,
  tests_added: 0,       // no NEW tests added in these commits (existing 82 retained); CAPA action item tracks the integration fixture
  objectives_met: true,
  on_schedule: true,
  within_scope: true,   // dead-scope migration was correctly removed, not shipped
  generated_by: 'MANUAL',
  auto_generated: false,
  status: 'PUBLISHED',
  quality_validated_by: 'RETRO',
  target_application: 'EHG_Engineer',
  learning_category: 'PROCESS_IMPROVEMENT',
  applies_to_all_apps: true,
  related_commits: ['7eb43ab8', '46471c35', '9a248cc6', 'bff5312a79'],
  affected_components: [
    'lib/eva/stage-execution-engine.js',
    'lib/eva/eva-orchestrator.js',
    'analyzeStage18MarketingCopy',
    'classifySurface',
    'venture_artifacts.artifact_data.screens'
  ],
  test_total_count: 82,
  test_passed_count: 82,
  test_failed_count: 0,
  test_skipped_count: 0,
  tags: ['surface-aware', 'wireframe-pipeline', 'activation', 'writer-consumer-asymmetry', 'dead-scope', 'validate-first'],
  protocol_improvements: [
    'Add migration-readiness control: reject ALTER TABLE x with no CREATE TABLE x and no live relation; flag artifact_type name collisions.'
  ],
  unnecessary_work_identified: [
    'Scoped migration 20260520_add_surface_columns_to_wireframe_screens.sql + backfill targeted a non-existent public.wireframe_screens table (DEAD_SCOPE @ 0.98); removed rather than shipped.'
  ],
  future_enhancements: [
    'Surface-aware copy could extend to auth surfaces once marketing path is validated in prod.'
  ],
  metadata: {
    sd_key: SD_KEY,
    written_by: 'continuous-improvement-coach-sub-agent',
    activation_flag: 'EVA_SURFACE_AWARE_ENABLED',
    go_live_owner: 'user (prod EVA runtime flag flip)',
    origin_main_sha: 'bff5312a79',
    rca_verdict: 'DEAD_SCOPE',
    rca_confidence: 0.98,
    exec_evidence: { testing: '26e15ea8 PASS@94 activation_invariant_verified=true', security: '5c4d0e69 PASS@96' },
    harness_backlog_logged: 5,
    pattern: 'PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 (built-but-mis-targeted subclass)'
  },
  created_at: nowIso,
  updated_at: nowIso
};

const { data, error } = await supabase
  .from('retrospectives')
  .insert(row)
  .select('id, retro_type, retrospective_type, status, quality_score, created_at')
  .single();

if (error) {
  console.error('INSERT_ERROR', JSON.stringify(error, null, 2));
  process.exit(1);
}

// Re-read to capture any trigger-recomputed quality_score / status
const { data: stored } = await supabase
  .from('retrospectives')
  .select('id, retro_type, retrospective_type, status, quality_score, created_at')
  .eq('id', data.id)
  .single();

console.log('RETROSPECTIVE_ROW ' + data.id);
console.log('STORED_AFTER_TRIGGERS ' + JSON.stringify(stored));
