/**
 * Synthetic-actor fence activation-invariant test.
 * SD-LEO-INFRA-ALTIFYAI-TEST-IDENTITY-001
 *
 * Proves the real schema -> guard chain this SD ships works end-to-end
 * against the REAL, migration-applied database (GATE_ACTIVATION_INVARIANT,
 * SD-LEO-INFRA-REQUIRE-END-END-001 FR-2):
 *
 *   ventures.metadata.{uat_probe_required, synthetic_actor} + venture_resources
 *   (independent github_repo cross-check source)
 *     -> lib/eva/synthetic-actor-guard.js (checkSyntheticActorFencing, the
 *        real exported choke-point stage-execution-worker.js calls)
 *
 * Scoped to the guard function itself, not the full daemon/_advanceStage
 * walk or LEO_SYNTHETIC_ACTOR_FENCE_ENFORCE binding-vs-observe branch --
 * calling checkSyntheticActorFencing directly proves the DB-driven config
 * chain (opt-in flag, synthetic_actor block, independent-source repo
 * cross-check) reaches the real function and returns the correct
 * applies/satisfied verdict, without needing to fixture a full stage walk.
 * The GitHub Actions API call inside the guard is stubbed via opts.fetchImpl
 * -- that surface (run/job/step parsing, staleness, head_sha-vs-tip) is
 * already exhaustively covered by tests/unit/eva/synthetic-actor-guard.test.js
 * (30 tests); re-proving it here against live GitHub would just add network
 * flakiness for zero incremental coverage.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { checkSyntheticActorFencing } from '../../lib/eva/synthetic-actor-guard.js';
import { insertGuarded, CLASSIFICATION } from '../../lib/governance/fixture-producer-guard.mjs';

dotenv.config();

const SOURCE = 'tests/integration/synthetic-actor-fence-activation.test.js';
const supabase = createSupabaseServiceClient();

let testCompanyId;
let notOptedInVentureId;
let optedInVentureId;

// Gate on a real database (SD-LEO-INFRA-COVERAGE-CI-TRIAGE-001 CAPA CA-1 pattern).
const HAS_REAL_DB = process.env.SUPABASE_URL
  && !process.env.SUPABASE_URL.includes('test.invalid.local')
  && process.env.SUPABASE_SERVICE_ROLE_KEY
  && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('test-service-role-key-not-real');

const FIXTURE_REPO = 'rickfelix/fixture-fence-activation-not-real';
const FIXTURE_WORKFLOW = 'deploy.yml';
const FIXTURE_STEP = 'post-deploy-signed-in-uat'; // must be in the guard's own ALLOWED_UAT_STEP_NAMES allowlist

/** Throws if called -- proves the not-opted-in path makes zero GitHub calls. */
async function refusingFetch() {
  throw new Error('refusingFetch: should never be called for a venture that has not opted in');
}

/** Two-call sequence: workflow runs list, then jobs list with the named step failing. */
function unsatisfiedFetchSequence() {
  let call = 0;
  return async () => {
    call += 1;
    if (call === 1) {
      return {
        ok: true,
        json: async () => ({ workflow_runs: [{ id: 999001, head_sha: 'fixturesha0001' }] }),
      };
    }
    if (call === 2) {
      return {
        ok: true,
        json: async () => ({
          jobs: [
            {
              name: 'deploy',
              steps: [{ name: FIXTURE_STEP, conclusion: 'failure', completed_at: new Date().toISOString() }],
            },
          ],
        }),
      };
    }
    throw new Error(`unsatisfiedFetchSequence: unexpected call #${call} -- step conclusion!=='success' must short-circuit before any further request`);
  };
}

describe.skipIf(!HAS_REAL_DB)('Synthetic-actor fence activation invariant (SD-LEO-INFRA-ALTIFYAI-TEST-IDENTITY-001)', () => {
  beforeAll(async () => {
    testCompanyId = uuidv4();
    notOptedInVentureId = uuidv4();
    optedInVentureId = uuidv4();

    const { error: companyError } = await supabase.from('companies').insert({
      id: testCompanyId,
      name: 'Fence Activation Invariant Test Co',
      website: 'https://fence-activation-invariant-test.example.com/about',
      created_at: new Date().toISOString(),
    });
    if (companyError) throw new Error(`Fixture company insert failed: ${companyError.message}`);

    const baseVenture = {
      company_id: testCompanyId,
      problem_statement: 'synthetic-actor-fence activation invariant integration test',
      value_proposition: 'Proves the metadata+venture_resources -> checkSyntheticActorFencing chain end to end',
      current_lifecycle_stage: 1,
      status: 'active',
      created_at: new Date().toISOString(),
    };

    const { error: notOptedInError } = await insertGuarded(supabase, 'ventures', {
      ...baseVenture,
      id: notOptedInVentureId,
      name: 'Fence Activation Test Venture (not opted in)',
      is_demo: true,
      metadata: {},
    }, { classification: CLASSIFICATION.FIXTURE, source: SOURCE });
    if (notOptedInError) throw new Error(`Fixture not-opted-in venture insert failed: ${notOptedInError.message}`);

    const { error: optedInError } = await insertGuarded(supabase, 'ventures', {
      ...baseVenture,
      id: optedInVentureId,
      name: 'Fence Activation Test Venture (opted in, unsatisfied)',
      is_demo: true,
      metadata: {
        uat_probe_required: true,
        synthetic_actor: {
          exclusion_predicate_ref: 'venture_synthetic_actor_exclusion_v1',
          github_repo: FIXTURE_REPO,
          workflow_file: FIXTURE_WORKFLOW,
          uat_step_name: FIXTURE_STEP,
        },
      },
    }, { classification: CLASSIFICATION.FIXTURE, source: SOURCE });
    if (optedInError) throw new Error(`Fixture opted-in venture insert failed: ${optedInError.message}`);

    // Independent source the guard cross-checks synthetic_actor.github_repo against
    // (round-8 SECURITY finding -- see synthetic-actor-guard.js header).
    const { error: resourceError } = await supabase.from('venture_resources').insert({
      id: uuidv4(),
      venture_id: optedInVentureId,
      resource_type: 'github_repo',
      resource_identifier: FIXTURE_REPO,
      provider: 'github',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (resourceError) throw new Error(`Fixture venture_resources insert failed: ${resourceError.message}`);
  });

  afterAll(async () => {
    if (optedInVentureId) {
      await supabase.from('venture_resources').delete().eq('venture_id', optedInVentureId);
      await supabase.from('ventures').delete().eq('id', optedInVentureId);
    }
    if (notOptedInVentureId) {
      await supabase.from('ventures').delete().eq('id', notOptedInVentureId);
    }
    if (testCompanyId) {
      await supabase.from('companies').delete().eq('id', testCompanyId);
    }
  });

  it('a venture that has not opted in is unaffected -- applies:false, satisfied:true, zero GitHub calls', async () => {
    const result = await checkSyntheticActorFencing(supabase, notOptedInVentureId, { fetchImpl: refusingFetch });
    expect(result.applies).toBe(false);
    expect(result.satisfied).toBe(true);
  });

  it('an opted-in venture with an unsatisfied live UAT check is blocked -- applies:true, satisfied:false (end-to-end chain proven)', async () => {
    const result = await checkSyntheticActorFencing(supabase, optedInVentureId, {
      githubToken: 'fixture-token-not-real',
      fetchImpl: unsatisfiedFetchSequence(),
    });
    expect(result.applies).toBe(true);
    expect(result.satisfied).toBe(false);
    expect(result.reason).toContain(FIXTURE_STEP);
    expect(result.reason).toContain('failure');
  });
});
