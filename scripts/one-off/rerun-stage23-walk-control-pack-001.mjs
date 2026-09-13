#!/usr/bin/env node
/**
 * SD-LEO-FIX-ALTIFYAI-STAGE-WALK-001.
 *
 * Successor to scripts/one-off/rerun-stage23-walk-eleven-001-fr13.mjs (left untouched as a
 * historical artifact of SD-LEO-INFRA-STAGE23-WALKER-ELEVEN-OVERRIDES-001 FR-13). That script
 * never supplied deps.controlPackEvidence, so lib/uat/result-recorder.js's completeSession()
 * only ever got the orchestrator's own partial default (1 of 4 REQUIRED controls) --
 * control_pack_evaluated could never be true regardless of pass rate. This runner assembles a
 * REAL, fully-evaluated control pack (all 4 REQUIRED controls: fence_two_sidedness +
 * live_deployment_binding derived live, canary_mutation_control run as an expected-FAIL
 * walker-mutation step, minimum_assertion_manifest from the walk's own outcomes) and passes
 * stageNumber:23 so
 * lib/eva/uat-robustness-gate.js's checkUatRobustnessGate -- the ACTUAL mechanism Solomon's
 * stage-23 acceptance fence reads -- can find and be satisfied by this run.
 *
 * FAILS LOUD (non-zero exit) if it cannot assemble a complete pack -- never falls through to
 * the orchestrator's partial default, which is exactly the defect this SD closes.
 *
 * canary_mutation_control: per coordinator ruling (relaying Solomon verdict 83de7b45,
 * 2026-09-13), built as an expected-FAIL runner-side step (lib/apa/altifyai-canary-step.mjs),
 * not waived -- superseded an earlier CANARY_WAIVER_REASON-based plan (removed).
 *
 * USAGE:
 *   node scripts/one-off/rerun-stage23-walk-control-pack-001.mjs
 */
import 'dotenv/config';
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { runVentureJourneyWalk } from '../../lib/apa/journey-walk-orchestrator.js';
import { mergeMetadataKeys } from '../../lib/coordinator/safe-metadata-merge.mjs';
import { fetchCurrentJourneyArtifact } from '../../lib/eva/lifecycle-sd-bridge.js';
import { deriveJourneySteps } from '../../lib/eva/bridge/orchestrator-journey-steps.js';
import { ALTIFYAI_VENTURE_ID } from '../altifyai-registry-completeness-check.mjs';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { CANARY_JOURNEY_ID, runCanaryStep } from '../../lib/apa/altifyai-canary-step.mjs';
import {
  buildFenceEvidence,
  buildLiveDeploymentBindingEvidence,
  resolveLiveDeploymentSha,
} from '../../lib/apa/stage23-control-pack-builder.mjs';

const ELEVEN_001_KEY = 'SD-ALTIFYAI-LEO-FEAT-STAGE-BUILD-ELEVEN-001';
const BASE_URL = 'https://altifyai.rickfelix2000.workers.dev';
const STAGE_NUMBER = 23;
const OVERALL_TIMEOUT_MS = 5 * 60 * 1000;

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}: exceeded ${ms}ms overall timeout`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Resolves a GitHub read token from the local `gh` CLI session -- LEO_ALTIFYAI_UAT_READ_TOKEN
 *  (the env var lib/eva/synthetic-actor-guard.js's default path reads) is not provisioned in
 *  this environment; checkSyntheticActorFencing's opts.githubToken seam lets us inject one. */
function resolveGithubToken() {
  if (process.env.LEO_ALTIFYAI_UAT_READ_TOKEN) return process.env.LEO_ALTIFYAI_UAT_READ_TOKEN;
  try {
    return execSync('gh auth token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (e) {
    throw new Error(`resolveGithubToken: no LEO_ALTIFYAI_UAT_READ_TOKEN and \`gh auth token\` failed: ${e.message}`);
  }
}

/** Reads CLERK_ISSUER from altifyai's live wrangler.toml via the GitHub Contents API, so this
 *  runner never duplicates/drifts from the value the live Worker's verifier actually trusts. */
async function resolveFapiOrigin(githubToken) {
  const res = await fetch('https://api.github.com/repos/rickfelix/altifyai/contents/wrangler.toml?ref=main', {
    headers: { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`resolveFapiOrigin: wrangler.toml fetch returned HTTP ${res.status}`);
  const body = await res.json();
  const contents = Buffer.from(body.content, 'base64').toString('utf8');
  const match = contents.match(/^CLERK_ISSUER\s*=\s*"([^"]+)"/m);
  if (!match) throw new Error('resolveFapiOrigin: no CLERK_ISSUER entry found in altifyai wrangler.toml');
  return match[1];
}

/** Assembles the full controlPackEvidence pack, or throws (fail-loud, FR-4) if any control
 *  cannot be genuinely derived. */
async function assembleControlPack(supabase) {
  const githubToken = resolveGithubToken();

  const secretKey = process.env.VENTURE_UAT_CLERK_SECRET_KEY_ALTIFYAI;
  if (!secretKey) {
    throw new Error('assembleControlPack: VENTURE_UAT_CLERK_SECRET_KEY_ALTIFYAI is not configured -- cannot mint a UAT session token.');
  }

  const fenceEvidence = await buildFenceEvidence({ supabase, ventureId: ALTIFYAI_VENTURE_ID, githubToken });

  const [deploymentSha, fapiOrigin] = await Promise.all([
    resolveLiveDeploymentSha({ githubToken }),
    resolveFapiOrigin(githubToken),
  ]);
  const bindingEvidence = await buildLiveDeploymentBindingEvidence({
    secretKey,
    deployedOrigin: BASE_URL,
    fapiOrigin,
    deploymentSha,
  });

  return {
    // manifest/executedJourneys/evidenceManifest (minimum-assertion-manifest control) and
    // canaryJourneyId/journeyResults (canary_mutation_control) are left unset here --
    // journey-walk-orchestrator.js's own default derivation (plus its deps.canaryStep seam,
    // wired below) builds these from the walk's real per-step outcomes once it sees this
    // object lacks them; only the 2 controls this function derives ahead of the walk are set.
    ...bindingEvidence, // {nonceWriteResult, expectedNonce, deploymentSha}
    fenceEvidence: {
      canExerciseApp: fenceEvidence.canExerciseApp,
      exclusionPredicateDeclared: fenceEvidence.exclusionPredicateDeclared,
      exclusionPredicateAssertedInVentureCi: fenceEvidence.exclusionPredicateAssertedInVentureCi,
    },
  };
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

  const journeyArtifactContent = await fetchCurrentJourneyArtifact(supabase, ALTIFYAI_VENTURE_ID);
  const journeySteps = deriveJourneySteps(journeyArtifactContent);
  if (!journeySteps) {
    console.error('::error::could not derive journey steps from the live AltifyAI blueprint_user_journey artifact.');
    process.exitCode = 1;
    return;
  }
  console.log(`Derived ${journeySteps.length} journey steps for the walk.`);

  let controlPack;
  try {
    controlPack = await assembleControlPack(supabase);
  } catch (e) {
    console.error('::error::FAIL-CLOSED: could not assemble a complete control pack -- refusing to run against the live deploy with partial/default evidence.', e.message);
    process.exitCode = 1;
    return;
  }
  console.log('Control pack assembled:', JSON.stringify({
    fenceEvidence: controlPack.fenceEvidence,
    liveDeploymentBinding: { outcome: controlPack.nonceWriteResult.outcome, deploymentSha: controlPack.deploymentSha },
    canaryStep: CANARY_JOURNEY_ID,
  }, null, 2));

  let result;
  try {
    result = await withTimeout(
      runVentureJourneyWalk({
        sdId: eleven001.id,
        ventureId: ALTIFYAI_VENTURE_ID,
        stageNumber: STAGE_NUMBER,
        ventureKey: 'ALTIFYAI',
        baseUrl: BASE_URL,
        journeySteps,
        persona: { type: 'existing' },
        deps: {
          controlPackEvidence: controlPack,
          canaryStep: { journeyId: CANARY_JOURNEY_ID, run: () => runCanaryStep({ baseUrl: BASE_URL }) },
        },
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

  const stampedRunId = result.testRunId ?? null;
  const { merged, error: mergeError } = await mergeMetadataKeys(ELEVEN_001_KEY, {
    stage23_walk_run_id: stampedRunId,
    stage23_walk_control_pack_note: {
      recorded_by: 'scripts/one-off/rerun-stage23-walk-control-pack-001.mjs',
      recorded_at: new Date().toISOString(),
      status: result.status,
      pass_rate: result.passRate,
      disclosure: 'First run to supply real evidence for all 4 REQUIRED control-pack controls, including a runner-side expected-FAIL canary_mutation_control step (see the run\'s own control_pack_status).',
    },
  }, { writer: 'rerun-stage23-walk-control-pack-001', reason: 'SD-LEO-FIX-ALTIFYAI-STAGE-WALK-001 walk re-run with real control-pack evidence' });
  if (!merged) {
    console.error('::error::failed to write stage23_walk_run_id:', mergeError);
    process.exitCode = 1;
    return;
  }

  console.log(`✅ Recorded run id ${stampedRunId} (status=${result.status}, passRate=${result.passRate}) on ${ELEVEN_001_KEY}.metadata.stage23_walk_run_id`);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FATAL', e); process.exit(1); });
}
