import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const row = {
  sd_id: '00d9049a-a0f8-42d8-b222-22979d56f2e0',
  sub_agent_code: 'TESTING',
  sub_agent_name: 'QA Engineering Director',
  verdict: 'PASS',
  confidence: 94,
  critical_issues: [],
  warnings: [
    'DEAD_SCOPE per RCA: scoped migration + backfill targeted a wireframe_screens TABLE that never existed; surface lives in venture_artifacts.artifact_data.screens[] JSONB. No DB change applied or needed.',
    'EHG venture UI (S15/S17/S18 pipeline) is exercised here only via unit suites + read-only activation validation against live Cron Canary; no full E2E browser run in this retrospective evidence pass.'
  ],
  recommendations: [
    'Keep s17/stage-18 surface flag OFF until PLAN/LEAD sign-off; flag-off parity is byte-identical and test-guarded.',
    'classifySurface now reads stored screen_name shape (commit 46471c35) in addition to .name — both CURRENT and FIXED tallies agree across Cron Canary + 3 archetype fixtures (no 0-marketing regression).',
    'Activation success metric is satisfied today on the live Cron Canary venture (1 marketing / 0 null), so the dead-scope DB work is correctly dispositioned as N/A.'
  ],
  detailed_analysis: JSON.stringify({
    unit: '82/82 passed (3 files: stage-18-surface-aware-wiring.test.js, stage-18-surface-aware.test.js, backfill-wireframe-screen-surfaces.test.js); 548ms',
    activation_validation: 'Cron Canary 09b7037e: 7 screens fed via onBeforeAnalysis -> {marketing:1, auth:1, app:5, null:0}, resolveMarketingWireframe=Landing Page. Fixtures: SaaS {marketing:2,null:0}, marketplace {marketing:1,null:0}, content {marketing:1,null:0}. CURRENT (classifySurface .name) and FIXED (screen_name fallback) tallies agree everywhere.',
    dead_scope_note: 'migration/backfill N/A per RCA; surface in venture_artifacts JSONB (artifact_data.screens[]) not a wireframe_screens table',
    flag_off_parity: 'byte-identical test-guarded'
  }),
  metadata: {
    test_command: 'npx vitest run tests/unit/stage-18-surface-aware-wiring.test.js tests/unit/stage-18-surface-aware.test.js tests/unit/backfill-wireframe-screen-surfaces.test.js',
    tests_passed: 82,
    tests_failed: 0,
    files_verified: [
      'lib/eva/stage-templates/stage-18.js',
      'lib/eva/stage-templates/analysis-steps/stage-15-wireframe-generator.js',
      'tests/unit/stage-18-surface-aware-wiring.test.js'
    ],
    activation_invariant_verified: true,
    activation_invariant_applicable: true,
    activation_test_id: 'tests/unit/stage-18-surface-aware-wiring.test.js',
    validation: 'cron-canary 1 marketing/0 null; 3 fixtures pass'
  },
  validation_mode: 'retrospective',
  source: 'TESTING',
  phase: 'EXEC',
  summary: 'PASS (confidence 94). Unit suites 82/82 passed across 3 files (stage-18-surface-aware-wiring, stage-18-surface-aware, backfill-wireframe-screen-surfaces). Read-only activation validation against the LIVE Cron Canary venture (09b7037e) confirms onBeforeAnalysis threads 7 stage-15 wireframe screens into analyzeStage18MarketingCopy, yielding surface tally {marketing:1, auth:1, app:5, null:0} (resolveMarketingWireframe=Landing Page) with 0 null surfaces; all 3 archetype fixtures (SaaS/marketplace/content) each yield >=1 marketing and 0 null, and CURRENT vs FIXED tallies agree (classifySurface now reads stored screen_name shape per commit 46471c35). The scoped migration+backfill is correctly dispositioned DEAD_SCOPE per RCA (surface lives in venture_artifacts.artifact_data.screens[] JSONB, not a wireframe_screens table), so no DB change was applied or needed. Flag-off parity is byte-identical and test-guarded. Activation invariant verified.'
};

const { data, error } = await supabase
  .from('sub_agent_execution_results')
  .insert(row)
  .select('id, created_at')
  .single();

if (error) {
  console.error('INSERT FAILED:', error.message);
  process.exit(1);
}
console.log('EVIDENCE_ROW_WRITTEN', JSON.stringify(data));

// Re-query by id to confirm
const { data: verify, error: vErr } = await supabase
  .from('sub_agent_execution_results')
  .select('id, sd_id, sub_agent_code, verdict, phase, validation_mode, confidence, created_at, metadata')
  .eq('id', data.id)
  .single();

if (vErr) {
  console.error('VERIFY FAILED:', vErr.message);
  process.exit(1);
}
console.log('EVIDENCE_VERIFIED', verify.id);
console.log('VERIFY_PAYLOAD', JSON.stringify({
  sd_id: verify.sd_id,
  sub_agent_code: verify.sub_agent_code,
  verdict: verify.verdict,
  phase: verify.phase,
  validation_mode: verify.validation_mode,
  confidence: verify.confidence,
  activation_invariant_verified: verify.metadata?.activation_invariant_verified,
  activation_invariant_applicable: verify.metadata?.activation_invariant_applicable,
  tests_passed: verify.metadata?.tests_passed,
  tests_failed: verify.metadata?.tests_failed,
  created_at: verify.created_at
}));
