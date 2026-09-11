#!/usr/bin/env node
/**
 * SD-LEO-INFRA-INSERTCOORDINATIONROW-NOT-SIGNAL-001: closes the last two LEAD-TO-PLAN
 * precheck gaps.
 *
 * 1) GATE_PLACEHOLDER_CONTENT_DETECTION: success_criteria was 100% generic template text.
 *    Replaced with measurable, SD-specific exit conditions reflecting the LEAD-phase
 *    VALIDATION/Explore findings (both landed=true throw sites, additive-only return
 *    contract, CLI exit-code mapping).
 *
 * 2) GATE_MECHANISM_CLAIM_VERIFIER: every file+line mechanism claim in the SD spine needs
 *    metadata.mechanism_verifications=[{verified_by, verified_at:"path:line"}]. All of these
 *    were independently confirmed either by direct Read (this session, dee1e665) or by the
 *    two LEAD-phase sub-agents (evidence a4dbb32b Explore, ede9ddad VALIDATION).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-INSERTCOORDINATIONROW-NOT-SIGNAL-001';

const SUCCESS_CRITERIA = [
  {
    measure: 'Read dispatch.cjs:1321 and 1565 post-fix; both throw sites for DISPATCH_BACKPRESSURE and DISPATCH_ALREADY_DELIVERED are replaced by an additive field on the existing {data,error} return (never a restructure).',
    criterion: 'Both landed=true throw sites in insertCoordinationRow return a discriminated result instead of throwing, while every other throw path in the same function (the ~8 non-landed error codes and fail-closed assert* guards) is UNCHANGED and still throws.',
  },
  {
    measure: 'Run the 3 already-correct caller files (scripts/adam-advisory.cjs, scripts/solomon-advisory.cjs, scripts/worker-signal.cjs) post-fix and confirm each reads result.landed on the returned object, not e.landed on a caught exception.',
    criterion: 'The 3 durable callers that already branch correctly are migrated to the new return-based signal without changing their delivered/not-delivered outcome.',
  },
  {
    measure: 'For each of the 11 CLI-entrypoint durable callers, run it against a synthetic delivered/parked outcome and assert process exit code is 0, not 1.',
    criterion: 'All 11 CLI entrypoints exit 0 on a delivered/parked outcome, closing the exact shell-level resend-on-exit-status mechanism that produced the original measured production duplicates (6 duplicate bodies / 13 rows in 24h).',
  },
  {
    measure: 'Run tests/unit/coordinator/dispatch-send-backpressure.test.js and dispatch-correlation-dedupe.test.js (existing coverage for both throw paths) plus new regression tests for the additive return shape and the 11 CLI exit-code sites.',
    criterion: 'All existing and new tests pass; a mutation test reverting the additive-field fix (restoring the throw) is caught by at least one test in each of the 3 FR areas.',
  },
];

const MECHANISM_VERIFICATIONS = [
  { verified_by: 'dee1e665-8f4d-49e7-aef6-1cdcc81d00fa (direct Read)', verified_at: 'lib/coordinator/dispatch.cjs:1560-1568' },
  { verified_by: 'dee1e665-8f4d-49e7-aef6-1cdcc81d00fa (direct Read)', verified_at: 'lib/coordinator/dispatch.cjs:1730' },
  { verified_by: 'sub_agent_execution_results ede9ddad-ecc2-4239-adef-908000ed0e0b (VALIDATION, LEAD-TO-PLAN)', verified_at: 'lib/coordinator/dispatch.cjs:1318-1324' },
  { verified_by: 'sub_agent_execution_results a4dbb32b-e5b6-4161-b7da-5e3be37d0482 (Explore, LEAD)', verified_at: 'lib/coordinator/dispatch.cjs:1373-1730 (full exit-path inventory)' },
  { verified_by: 'sub_agent_execution_results a4dbb32b-e5b6-4161-b7da-5e3be37d0482 (Explore, LEAD)', verified_at: 'scripts/adam-advisory.cjs:1386-1408' },
  { verified_by: 'sub_agent_execution_results ede9ddad-ecc2-4239-adef-908000ed0e0b (VALIDATION, LEAD-TO-PLAN)', verified_at: 'scripts/adam-advisory.cjs:1401' },
  { verified_by: 'sub_agent_execution_results a4dbb32b-e5b6-4161-b7da-5e3be37d0482 (Explore, LEAD)', verified_at: 'scripts/solomon-advisory.cjs:1419-1442' },
  { verified_by: 'sub_agent_execution_results ede9ddad-ecc2-4239-adef-908000ed0e0b (VALIDATION, LEAD-TO-PLAN)', verified_at: 'scripts/solomon-advisory.cjs:1435' },
  { verified_by: 'sub_agent_execution_results a4dbb32b-e5b6-4161-b7da-5e3be37d0482 (Explore, LEAD)', verified_at: 'scripts/worker-signal.cjs:34-45 (shared reportDispatchError helper, 4 call sites)' },
  { verified_by: 'sub_agent_execution_results ede9ddad-ecc2-4239-adef-908000ed0e0b (VALIDATION, LEAD-TO-PLAN)', verified_at: 'scripts/worker-signal.cjs:38' },
  { verified_by: 'sub_agent_execution_results a4dbb32b-e5b6-4161-b7da-5e3be37d0482 (Explore, LEAD)', verified_at: 'coordinator-capacity-forecast.mjs (catch -> return false / process.exitCode=1 on any throw)' },
  { verified_by: 'sub_agent_execution_results a4dbb32b-e5b6-4161-b7da-5e3be37d0482 (Explore, LEAD)', verified_at: 'coordination-events.cjs (emitInertWorkerAlert collapses to {ok:false,error})' },
  { verified_by: 'sub_agent_execution_results a4dbb32b-e5b6-4161-b7da-5e3be37d0482 (Explore, LEAD)', verified_at: 'sweep-findings-sink.cjs (collapses to {ok:false,error})' },
  { verified_by: 'sub_agent_execution_results a4dbb32b-e5b6-4161-b7da-5e3be37d0482 (Explore, LEAD)', verified_at: 'kill-switch-writer.cjs (no catch, propagates uncaught)' },
  { verified_by: 'sub_agent_execution_results a4dbb32b-e5b6-4161-b7da-5e3be37d0482 (Explore, LEAD)', verified_at: 'lib/eva/stage-execution-worker.js (VENTURE_PARKED, positive precedent -- returned result.errors[].code, not a defect instance)' },
  { verified_by: 'sub_agent_execution_results ede9ddad-ecc2-4239-adef-908000ed0e0b (VALIDATION, LEAD-TO-PLAN)', verified_at: 'tests/unit/coordinator/dispatch-send-backpressure.test.js (existing coverage confirmed present)' },
  { verified_by: 'sub_agent_execution_results ede9ddad-ecc2-4239-adef-908000ed0e0b (VALIDATION, LEAD-TO-PLAN)', verified_at: 'tests/unit/coordinator/dispatch-correlation-dedupe.test.js (existing coverage confirmed present)' },
];

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: sd, error: readError } = await supabase
    .from('strategic_directives_v2')
    .select('id, metadata')
    .eq('sd_key', SD_KEY)
    .maybeSingle();
  if (readError) throw readError;
  if (!sd) throw new Error(`SD ${SD_KEY} not found`);

  const newMetadata = {
    ...sd.metadata,
    mechanism_verifications: MECHANISM_VERIFICATIONS,
  };

  const { data, error: updateError } = await supabase
    .from('strategic_directives_v2')
    .update({ success_criteria: SUCCESS_CRITERIA, metadata: newMetadata })
    .eq('id', sd.id)
    .select('sd_key');
  if (updateError) throw updateError;

  console.log('Updated:', JSON.stringify(data, null, 2));
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
