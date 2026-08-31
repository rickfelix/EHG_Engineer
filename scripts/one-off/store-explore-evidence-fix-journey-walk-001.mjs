import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-FIX-JOURNEY-WALK-001';

async function main() {
  const { data: sd, error } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (error) throw error;

  const results = {
    verdict: 'PASS',
    confidence_score: 92,
    summary: 'RCA-driven exploration (rca-agent, 2026-08-31) located all three defects with exact file:line citations, live DB evidence, and disproved the initial hypothesis (cross-venture vision contamination) with measured data before landing on the real mechanisms.',
    detailed_analysis: {
      files_read: [
        'lib/apa/journey-walk-orchestrator.js',
        'lib/sub-agents/vision-fidelity/index.js',
        'lib/sub-agents/vision-fidelity/severity-policy.js',
        'scripts/modules/handoff/executors/plan-to-lead/gates/prerequisite-check.js',
        'scripts/modules/handoff/validation/ValidationOrchestrator.js',
        'lib/handoff/wait-verdict.js',
        'scripts/modules/handoff/executors/plan-to-lead/index.js',
        'lib/eva/bridge/venture-build-consumer.js',
        'scripts/one-off/_run-altifyai-uat-walk-20260830.mjs'
      ],
      key_findings: [
        'FR-1 mechanism confirmed: lib/apa/journey-walk-orchestrator.js:72-144 try/finally with NO catch -- a throw after startSession() (line 86) propagates uncaught, so completeSession/stampJourneyWalkResult (lines 129, 140) never run. Live evidence: uat_test_runs row 8e54bfc7-edc9-4954-ade0-50729116ab2d stuck status=running since 2026-08-30T22:15:08Z, 0 rows in uat_test_results (now marked failed/abandoned as operational cleanup).',
        'FR-2 mechanism confirmed: vision-fidelity/index.js loadPRD() (:238-245) reads the PARENT orchestrator PRD (delegated-completion-only ACs) not the children\'s real PRDs; readGitDiff() (:56,:247-258) always returns \'[no branch_name in SD metadata]\' for orchestrator SDs; severity-policy.js SD_TYPE_POLICIES (:9-19) has no orchestrator entry so it falls to DEFAULT_POLICY {mode:block, critical_threshold:2}, fabricating a FAIL from zero real evidence.',
        'FR-3 mechanism confirmed: ValidationOrchestrator.js WAIT_MAX_WALL_CLOCK_MS=24h ceiling (lib/handoff/wait-verdict.js:212-234, hasExceededMaxWait) trips on wall-clock alone regardless of wait_attempts; exemptFromWaitCeiling flag exists (ValidationOrchestrator.js:384) but prerequisite-check.js never sets it for the journey-walk WAIT case.',
        'Disproved hypothesis, with data: the "alt text SaaS" vision content cited in the parent SD rejection is genuinely AltifyAI\'s own product (ventures.id=50763b6a-1fad-4e1e-b2fc-296a1d66ebf9, eva_vision_documents.venture_id matches, 1 row for vision_key -- no duplicate/cross-venture bleed). AltifyAI = Alt-text-ify + AI.',
        'Duplicate-SD check: no existing open SD targets these three specific mechanisms; PAT-AUTO-ae6293c7 is a prior single-occurrence pattern for the same VISION_FIDELITY_GATE class, not a duplicate SD.'
      ]
    },
    metadata: {
      repo_path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer',
      executed_from_cwd: process.cwd()
    }
  };

  await storeSubAgentResults('Explore', sd.id, { code: 'Explore', name: 'Explore' }, results, { source: 'manual', phase: 'LEAD' });
  console.log('OK stored Explore evidence for', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
