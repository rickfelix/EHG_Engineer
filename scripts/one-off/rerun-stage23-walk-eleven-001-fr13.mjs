#!/usr/bin/env node
/**
 * SD-LEO-INFRA-STAGE23-WALKER-ELEVEN-OVERRIDES-001 FR-13.
 *
 * No "canonical stage-23 walk runner" CLI exists (scripts/eva/run-venture-journey-walk.mjs is
 * absent; the only other caller of runVentureJourneyWalk is a Stage-20 flow) -- this is a small,
 * purpose-built one-off invocation script, following this repo's scripts/one-off/*.mjs
 * convention with an isMainModule guard, calling the real library function directly.
 *
 * Writes the run id to metadata.stage23_walk_run_id on SD-ALTIFYAI-LEO-FEAT-STAGE-BUILD-
 * ELEVEN-001 (already status=completed -- this is a disclosed, POST-HOC validation exercise,
 * not a completion gate for that SD or any other). ELEVEN-001 carries no journey_steps key
 * (confirmed during PLAN review), so this write cannot trip prerequisite-check.js's WAIT
 * ceiling on it or on any other SD -- the real journey_steps owner is a THIRD SD,
 * SD-ALTIFYAI-LEO-ORCH-SPRINT-2026-002, which this script never touches.
 *
 * This SD's own acceptance is the overrides registered + FR-12 green -- NOT this walk passing.
 * The walk is EXPECTED to still fail (stp-e3e6, walk position 3, the pre-existing out-of-scope
 * generation-flow defect) -- a failing run id is an accepted, disclosed outcome.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { runVentureJourneyWalk } from '../../lib/apa/journey-walk-orchestrator.js';
import { fetchCurrentJourneyArtifact } from '../../lib/eva/lifecycle-sd-bridge.js';
import { deriveJourneySteps } from '../../lib/eva/bridge/orchestrator-journey-steps.js';
import { ALTIFYAI_VENTURE_ID } from '../altifyai-registry-completeness-check.mjs';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const ELEVEN_001_KEY = 'SD-ALTIFYAI-LEO-FEAT-STAGE-BUILD-ELEVEN-001';
const BASE_URL = 'https://altifyai.rickfelix2000.workers.dev';
const OVERALL_TIMEOUT_MS = 5 * 60 * 1000; // safety net; the walk stops at first failure and every
// step executor already carries its own internal timeout (max observed ~35s for the current
// stp-e3e6 defect), so this should never actually trip -- but FR-13 requires an explicit ceiling
// given the known cluster-zero hang class.

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}: exceeded ${ms}ms overall timeout`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: eleven001, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, metadata')
    .eq('sd_key', ELEVEN_001_KEY)
    .single();
  if (fetchErr || !eleven001) {
    console.error('::error::could not fetch SD-ALTIFYAI-LEO-FEAT-STAGE-BUILD-ELEVEN-001:', fetchErr?.message);
    process.exitCode = 1;
    return;
  }
  if (Object.prototype.hasOwnProperty.call(eleven001.metadata || {}, 'journey_steps')) {
    console.error('::error::SAFETY ABORT: SD-ALTIFYAI-LEO-FEAT-STAGE-BUILD-ELEVEN-001 unexpectedly carries a journey_steps key -- this write would risk tripping prerequisite-check.js. Refusing to proceed.');
    process.exitCode = 1;
    return;
  }

  const journeyArtifactContent = await fetchCurrentJourneyArtifact(supabase, ALTIFYAI_VENTURE_ID);
  const journeySteps = deriveJourneySteps(journeyArtifactContent);
  if (!journeySteps) {
    console.error('::error::could not derive journey steps from the live AltifyAI blueprint_user_journey artifact.');
    process.exitCode = 1;
    return;
  }
  console.log(`Derived ${journeySteps.length} journey steps for the walk.`);

  let result;
  try {
    result = await withTimeout(
      runVentureJourneyWalk({
        sdId: eleven001.id,
        ventureId: ALTIFYAI_VENTURE_ID,
        ventureKey: 'ALTIFYAI',
        baseUrl: BASE_URL,
        journeySteps,
        persona: { type: 'existing' },
      }),
      OVERALL_TIMEOUT_MS,
      'runVentureJourneyWalk'
    );
  } catch (e) {
    console.error('::error::walk invocation failed or timed out:', e.message);
    process.exitCode = 1;
    return;
  }

  console.log('Walk result:', JSON.stringify(result, null, 2));

  const { data: reread, error: rereadErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('id', eleven001.id)
    .single();
  const stampedRunId = reread?.metadata?.journey_walk_result?.testRunId ?? result.testRunId ?? null;

  const { error: updErr } = await supabase
    .from('strategic_directives_v2')
    .update({
      metadata: {
        ...(reread?.metadata || eleven001.metadata),
        stage23_walk_run_id: stampedRunId,
        stage23_walk_rerun_note: {
          recorded_by: 'scripts/one-off/rerun-stage23-walk-eleven-001-fr13.mjs',
          recorded_at: new Date().toISOString(),
          status: result.status,
          pass_rate: result.passRate,
          broken_at_step: result.brokenAtStep,
          disclosure: 'Post-hoc validation exercise (SD-LEO-INFRA-STAGE23-WALKER-ELEVEN-OVERRIDES-001 FR-13). SD-ALTIFYAI-LEO-FEAT-STAGE-BUILD-ELEVEN-001 was already status=completed before this run -- this PASS/FAIL verdict belongs to this walk record, not to that SD\'s completion.',
        },
      },
    })
    .eq('id', eleven001.id);
  if (updErr) {
    console.error('::error::failed to write stage23_walk_run_id:', updErr.message);
    process.exitCode = 1;
    return;
  }

  console.log(`✅ Recorded run id ${stampedRunId} (status=${result.status}, passRate=${result.passRate}, brokenAtStep=${result.brokenAtStep}) on ${ELEVEN_001_KEY}.metadata.stage23_walk_run_id`);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
