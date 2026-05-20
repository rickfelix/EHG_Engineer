// Record EXEC dispositions for SD-ACTIVATE-SURFACEAWARE-WIREFRAME-PIPELINE-ORCH-001:
//  - RCA DEAD_SCOPE verdict: migration 5a + backfill 5b target a non-existent
//    public.wireframe_screens table; surface lives in venture_artifacts JSONB.
//  - Set activation-invariant fields (COND-3) to the real JSONB test gate.
//  - Revise smoke_test_steps to the real activation (flag + JSONB validation).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const KEY = 'SD-ACTIVATE-SURFACEAWARE-WIREFRAME-PIPELINE-ORCH-001';

const ACTIVATION_TEST_ID = 'tests/unit/stage-18-surface-aware-wiring.test.js';
const SMOKE_CMD = 'npx vitest run tests/unit/stage-18-surface-aware-wiring.test.js tests/unit/stage-18-surface-aware.test.js tests/unit/backfill-wireframe-screen-surfaces.test.js';

const deadScope = {
  rca_verdict: 'DEAD_SCOPE',
  rca_confidence: 0.98,
  finding: 'EXEC 5a (migration 20260520_add_surface_columns_to_wireframe_screens.sql) and 5b (backfill-wireframe-screen-surfaces.mjs) target public.wireframe_screens, a TABLE that never existed. wireframe_screens is an artifact_type value in venture_artifacts; the surface signal lives in venture_artifacts.artifact_data.screens[].surface (JSONB). Every consumer (S15 generator, wireframe-surface-normalizer, S17, S18) reads JSONB/in-memory; the only .from(\'wireframe_screens\') table access is the backfill script itself (untested, no producer/consumer). Authored mis-targeted by children -B/-C. Witness of PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 (built-but-mis-targeted subclass).',
  resolution: 'Migration 5a + backfill 5b marked NOT-APPLICABLE (not applied; DB left unchanged by database-agent). Real activation = runtime wiring (FR-3 commit 7eb43ab8) + EVA_SURFACE_AWARE_ENABLED flag flip + JSONB validation. Trap-file cleanup (delete mis-targeted migration/rollback/backfill) + a table-existence precheck CI control deferred to harness backlog.',
  recorded_at: new Date().toISOString(),
};

const newSmokeSteps = [
  { step_number: 1, instruction: 'Run the JSONB surface-aware unit suites (activation gate): ' + SMOKE_CMD, expected_outcome: 'All pass. The stage-18 onBeforeAnalysis wiring threads venture_artifacts wireframe_screens (JSONB artifact_data.screens) into analyzeStage18MarketingCopy as stage15WireframeData; flag-off byte-identical parity holds.' },
  { step_number: 2, instruction: 'Set EVA_SURFACE_AWARE_ENABLED=true in the EVA runtime env and run the Cron Canary venture (09b7037e) through Stage 15 then Stage 18.', expected_outcome: 'S15 stores surface-tagged screens in the venture_artifacts wireframe_screens artifact (>=1 marketing); S18 prompt context includes the marketing wireframe key_components + ascii_layout (runner wiring confirmed live).' },
  { step_number: 3, instruction: 'Validate the 3 archetype fixtures (SaaS, marketplace, content) via the surface-invariant tests with the flag on.', expected_outcome: 'All 3 pass; >=1 marketing surface and 0 null surface each (classifySurface read-fallback covers untagged screens).' },
  { step_number: 4, instruction: 'Set EVA_SURFACE_AWARE_ENABLED=false and re-run; confirm flag-off parity.', expected_outcome: 'Output matches the pre-activation baseline (no regression). NOTE: no schema migration/backfill is needed — surface lives in venture_artifacts JSONB (RCA DEAD_SCOPE verdict; see metadata.exec_disposition).' },
];

// --- SD update ---
const { data: sdRow } = await supabase.from('strategic_directives_v2').select('metadata').eq('sd_key', KEY).single();
const sdMeta = { ...(sdRow?.metadata || {}), exec_disposition: deadScope };
// activation_test_id + smoke_test_cmd live on product_requirements_v2 (not the SD).
const { error: sdErr } = await supabase.from('strategic_directives_v2').update({
  smoke_test_steps: newSmokeSteps,
  metadata: sdMeta,
}).eq('sd_key', KEY);
console.log(sdErr ? ('SD update ERROR: ' + sdErr.message) : 'SD updated: smoke_test_steps + metadata.exec_disposition');

// --- PRD update (best-effort; columns may not exist on PRD) ---
const PRD_ID = 'PRD-' + KEY;
const { data: prdRow } = await supabase.from('product_requirements_v2').select('id, metadata').eq('id', PRD_ID).maybeSingle();
if (prdRow) {
  const prdMeta = { ...(prdRow.metadata || {}), exec_disposition: deadScope };
  const tryUpdate = async (fields) => {
    const { error } = await supabase.from('product_requirements_v2').update(fields).eq('id', PRD_ID);
    return error;
  };
  let e = await tryUpdate({ activation_test_id: ACTIVATION_TEST_ID, smoke_test_cmd: SMOKE_CMD, metadata: prdMeta });
  if (e && /column .* does not exist|activation_test_id|smoke_test_cmd/i.test(e.message)) {
    // Columns absent on PRD — store in metadata + update metadata only.
    e = await tryUpdate({ metadata: { ...prdMeta, activation_test_id: ACTIVATION_TEST_ID, smoke_test_cmd: SMOKE_CMD } });
    console.log(e ? ('PRD metadata update ERROR: ' + e.message) : 'PRD updated: metadata.exec_disposition + metadata.activation_test_id/smoke_test_cmd (columns absent, stored in metadata)');
  } else {
    console.log(e ? ('PRD update ERROR: ' + e.message) : 'PRD updated: activation_test_id + smoke_test_cmd + metadata.exec_disposition');
  }
} else {
  console.log('PRD row not found for ' + PRD_ID);
}
