#!/usr/bin/env node
/**
 * One-off: INSERT the RETRO sub-agent evidence row in sub_agent_execution_results
 * for SD-ACTIVATE-SURFACEAWARE-WIREFRAME-PIPELINE-ORCH-001 at PLAN_VERIFICATION,
 * linking to the SD_COMPLETION retrospective inserted previously.
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
const RETRO_ID = 'ec224325-3fc1-4d8a-b257-b4961f8539f2';
const RETRO_QUALITY = 90;

const recommendations = [
  'GO-LIVE: set EVA_SURFACE_AWARE_ENABLED=true in the production EVA runtime to activate the surface-aware pipeline (code already merged dormant-safe on origin/main bff5312a79).',
  'CAPA: add a migration-readiness control that rejects ALTER TABLE x with no CREATE TABLE x and no live relation, and flags the case where x already exists as a venture_artifacts artifact_type (root cause of the DEAD_SCOPE migration).',
  'TESTING: add a classifySurface integration fixture using the REAL persisted venture_artifacts screens shape (screen_name) so future surface changes cannot pass against name-only unit fixtures.',
  'CLEANUP: dispose of the dead-scope migration 20260520_add_surface_columns_to_wireframe_screens.sql + backfill so they are not re-applied against a non-existent table.',
  'HARNESS: triage the 5 deferred harness-backlog items (node_modules wipe in shared tree, CONDITIONAL_PASS-forbidden-in-prospective DB constraint, rca-agent missing Task tool, search-prior-issues.js crash, mis-targeted-migration cleanup+control).'
];

const detailed_analysis = {
  retrospective_id: RETRO_ID,
  retrospective_quality_score: RETRO_QUALITY,
  retro_type: 'SD_COMPLETION',
  retrospective_type: null,
  sd_key: SD_KEY,
  outcome: 'SD activated the dormant surface-aware wireframe pipeline (S15->S17->S18 surface enum) dormant-safe behind EVA_SURFACE_AWARE_ENABLED.',
  shipped: {
    origin_main_sha: 'bff5312a79',
    commits: {
      'FR-3 7eb43ab8': 'stage-18 onBeforeAnalysis threads surface-tagged S15 wireframe_screens JSONB (venture_artifacts.artifact_data.screens[]) into analyzeStage18MarketingCopy as stage15WireframeData; flag-gated, fail-safe; closes producer-side writer-consumer gap.',
      '46471c35': 'classifySurface name fallback now reads name ?? screen_name ?? title.',
      '9a248cc6': 'dead-scope disposition + PRD activation_test_id/smoke_test_cmd.'
    },
    tests: '82/82 unit tests; flag-off byte-identical parity.',
    exec_evidence: {
      testing: '26e15ea8 PASS@94 activation_invariant_verified=true',
      security: '5c4d0e69 PASS@96'
    }
  },
  top_lessons: [
    'VALIDATE-FIRST against live Cron Canary data caught an activation gap (0 marketing -> 1 marketing after fix) that 82 passing unit tests missed: fixtures used `name` but persisted venture_artifacts screens use `screen_name`.',
    'RCA DEAD_SCOPE @0.98: scoped migration + backfill targeted a public.wireframe_screens TABLE that never existed; surface lives in venture_artifacts JSONB. Built-but-mis-targeted subclass of PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001.',
    'target_application auto-misclassifies marketing-vocab SDs to EHG; pinned EHG_Engineer + re-verified before every handoff to keep GATE2/5/6 on the right repo.',
    'onBeforeAnalysis is the universal stage-context seam (stage-execution-engine.js AND eva-orchestrator.js spread its result into analysisStep params).',
    'Activation is dormant-safe (byte-identical flag-off); production go-live is the operator setting EVA_SURFACE_AWARE_ENABLED=true.'
  ],
  go_live: { owner: 'user', mechanism: 'set EVA_SURFACE_AWARE_ENABLED=true in prod EVA runtime', risk: 'low (byte-identical flag-off baseline already merged)' },
  harness_backlog_logged: 5,
  deferred_mode: 'product (harness items logged via log-harness-bug.js, not filed as SDs)'
};

const summary =
  'RETRO sub-agent verdict for ' + SD_KEY + ' SD-completion retrospective (PLAN_VERIFICATION, preparing PLAN-TO-LEAD then LEAD-FINAL). ' +
  'Inserted retrospectives row ' + RETRO_ID + ' (retro_type=SD_COMPLETION, retrospective_type=NULL, status=PUBLISHED, quality_score=' + RETRO_QUALITY + '). ' +
  'Captured the headline VALIDATE-FIRST lesson (live data caught an activation gap 82 unit tests missed: screen.name vs screen_name), the RCA DEAD_SCOPE migration mis-targeting (built-but-mis-targeted writer-consumer subclass), the target_application pin-and-verify discipline, the onBeforeAnalysis universal seam, and the dormant-safe go-live handoff. PASS.';

const row = {
  sd_id: SD_UUID,
  sub_agent_code: 'RETRO',
  sub_agent_name: 'Continuous Improvement Coach',
  verdict: 'PASS',
  confidence: 92,
  critical_issues: [],
  warnings: [],
  recommendations,
  detailed_analysis: JSON.stringify(detailed_analysis),
  metadata: { retrospective_id: RETRO_ID },
  validation_mode: 'retrospective',
  source: 'RETRO',
  phase: 'PLAN_VERIFICATION',
  summary
};

const { data, error } = await supabase
  .from('sub_agent_execution_results')
  .insert(row)
  .select('id, sub_agent_code, verdict, confidence, phase, validation_mode, source, created_at')
  .single();

if (error) {
  console.error('INSERT_ERROR', JSON.stringify(error, null, 2));
  process.exit(1);
}

console.log('RETRO_EVIDENCE ' + data.id);
console.log('RETROSPECTIVE_ROW ' + RETRO_ID);
console.log('EVIDENCE_DETAIL ' + JSON.stringify(data));
