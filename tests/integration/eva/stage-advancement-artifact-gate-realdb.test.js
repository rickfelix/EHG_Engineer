/**
 * REAL, DB-backed integration test for SD-LEO-INFRA-STAGE-ADVANCEMENT-ARTIFACT-001, FR-2/FR-6.
 *
 * Confirms lib/eva/stage-execution-worker.js::_advanceStage() -- the daemon-walk's single
 * side-effecting advance for ALL stages, previously the most consequential bypass of the
 * required-artifact gate -- now blocks a fixture venture missing a required artifact, advances
 * one with complete artifacts, and honors a documented deviation-ledger skip. Non-mocked, against
 * the live Postgres schema. Uses disposable ventures with names that do NOT match
 * isFixtureVenture's regex and are is_demo=false, so the real (non-fixture) code path is
 * exercised -- mirroring the established pattern in
 * tests/integration/eva/chairman-product-review-gate-realdb.test.js. All rows cleaned up in
 * afterAll, zero residue.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';

import { StageExecutionWorker } from '../../../lib/eva/stage-execution-worker.js';
import { recordDeviation } from '../../../lib/eva/deviation-ledger.js';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const HAS_REAL_DB = process.env.SUPABASE_URL
  && !process.env.SUPABASE_URL.includes('test.invalid.local')
  && process.env.SUPABASE_SERVICE_ROLE_KEY
  && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('test-service-role-key-not-real');

const ts = Date.now();
const ventureIds = [];
const FIXTURE_STAGE = 15; // an arbitrary stage with no chairman-review gate, isolating the artifact check

async function createVenture(tag) {
  const { data, error } = await supabase
    .from('ventures')
    .insert({
      // SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-002: *-RealDB-* convention — misses the write-guard
      // regex (real path preserved), matches the extended surface patterns (residue protected).
      name: `StageArtifactGate-RealDB-${tag}-${ts}`,
      problem_statement: 'Disposable venture for SD-LEO-INFRA-STAGE-ADVANCEMENT-ARTIFACT-001 real-DB gate test',
      current_lifecycle_stage: FIXTURE_STAGE,
      is_demo: false,
      status: 'active',
    })
    .select('id, name, is_demo')
    .single();
  if (error) throw new Error(`Failed to create ${tag} venture: ${error.message}`);
  ventureIds.push(data.id);
  return data;
}

async function currentStage(ventureId) {
  const { data } = await supabase.from('ventures').select('current_lifecycle_stage').eq('id', ventureId).single();
  return data?.current_lifecycle_stage;
}

describe.skipIf(!HAS_REAL_DB)('Stage-advancement artifact gate (_advanceStage) — REAL DB', () => {
  let ventureBlocked;
  let ventureComplete;
  let ventureDeviated;
  let requiredArtifacts;

  beforeAll(async () => {
    ventureBlocked = await createVenture('blocked');
    ventureComplete = await createVenture('complete');
    ventureDeviated = await createVenture('deviated');

    const { data: stageConfig } = await supabase
      .from('venture_stages')
      .select('required_artifacts')
      .eq('stage_number', FIXTURE_STAGE)
      .maybeSingle();
    requiredArtifacts = stageConfig?.required_artifacts || [];
    if (requiredArtifacts.length === 0) {
      throw new Error(`Test fixture assumption violated: stage ${FIXTURE_STAGE} has no required_artifacts to test against`);
    }

    // ventureComplete gets every required artifact marked current.
    for (const artifactType of requiredArtifacts) {
      await supabase.from('venture_artifacts').insert({
        venture_id: ventureComplete.id,
        lifecycle_stage: FIXTURE_STAGE,
        artifact_type: artifactType,
        title: `fixture ${artifactType}`,
        content: 'fixture content',
        is_current: true,
      });
    }

    // ventureDeviated gets NO artifacts, but a documented deviation record for each required one.
    for (const artifactType of requiredArtifacts) {
      await recordDeviation(supabase, {
        ventureId: ventureDeviated.id,
        artifactRef: artifactType,
        why: 'Test-documented skip for SD-LEO-INFRA-STAGE-ADVANCEMENT-ARTIFACT-001 realdb test',
        decidedBy: 'test-fixture',
        weight: 'declared-descope',
      });
    }
    // ventureBlocked gets nothing -- genuinely missing, undocumented.
  });

  afterAll(async () => {
    for (const id of ventureIds) {
      await supabase.from('venture_artifacts').delete().eq('venture_id', id);
      await supabase.from('venture_stage_work').delete().eq('venture_id', id);
      await supabase.from('venture_stage_transitions').delete().eq('venture_id', id);
      await supabase.from('ventures').delete().eq('id', id);
    }
  });

  it('blocks a fixture venture missing required artifacts, naming them (FR-2 core)', async () => {
    const worker = new StageExecutionWorker({ supabase, logger: console });
    const result = await worker._advanceStage(ventureBlocked.id, FIXTURE_STAGE, FIXTURE_STAGE + 1, {});

    expect(result.blocked).toBe(true);
    expect(result.reason).toBe('artifact_precondition_unmet');
    expect(result.missingArtifacts.length).toBeGreaterThan(0);
    expect(await currentStage(ventureBlocked.id)).toBe(FIXTURE_STAGE); // did NOT advance
  });

  it('advances a fixture venture with all required artifacts present (no false block)', async () => {
    const worker = new StageExecutionWorker({ supabase, logger: console });
    const result = await worker._advanceStage(ventureComplete.id, FIXTURE_STAGE, FIXTURE_STAGE + 1, {});

    // _advanceStage's success path returns undefined (bare `return;`) -- only its blocked paths
    // return a {advanced:false, blocked:true, ...} object. currentStage() is the load-bearing
    // assertion that the advance actually happened.
    expect(result?.blocked).toBeFalsy();
    expect(await currentStage(ventureComplete.id)).toBe(FIXTURE_STAGE + 1);
  });

  it('advances a fixture venture whose missing artifacts each have a documented deviation record (FR-6)', async () => {
    const worker = new StageExecutionWorker({ supabase, logger: console });
    const result = await worker._advanceStage(ventureDeviated.id, FIXTURE_STAGE, FIXTURE_STAGE + 1, {});

    expect(result?.blocked).toBeFalsy();
    expect(await currentStage(ventureDeviated.id)).toBe(FIXTURE_STAGE + 1);
  });
});
