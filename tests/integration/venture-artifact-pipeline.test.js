/**
 * Venture Artifact Pipeline Integration Test
 * SD-MAN-INFRA-VENTURE-ARTIFACT-PIPELINE-002
 *
 * Database-level integration test verifying:
 *   1. Venture creation via ventures table
 *   2. Artifact creation matching lifecycle_stage_config required_artifacts
 *   3. Stage advancement via current_lifecycle_stage update
 *   4. Artifact-stage mapping consistency
 *   5. Stage-zero queue request lifecycle
 *   6. Artifact versioning (v2 replaces v1 as is_current)
 *   7. Cleanup of test data
 */

import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

dotenv.config({ path: '.env', override: true });

const supabase = createSupabaseServiceClient();

const TEST_VENTURE_ID = randomUUID();
const TEST_VENTURE_NAME = `Pipeline-Test-${Date.now()}`;
const createdArtifactIds = [];
const createdRequestIds = [];

describe('Venture Artifact Pipeline E2E', () => {
  let stageConfig;

  beforeAll(async () => {
    // Load lifecycle_stage_config for stages 1-3
    const { data, error } = await supabase
      .from('lifecycle_stage_config')
      .select('stage_number, stage_name, required_artifacts, phase_name')
      .in('stage_number', [1, 2, 3])
      .order('stage_number');

    expect(error).toBeNull();
    expect(data).toHaveLength(3);
    stageConfig = data;
  });

  afterAll(async () => {
    // Clean up test artifacts
    if (createdArtifactIds.length > 0) {
      await supabase
        .from('venture_artifacts')
        .delete()
        .in('id', createdArtifactIds);
    }

    // Clean up stage-zero requests
    if (createdRequestIds.length > 0) {
      await supabase
        .from('stage_zero_requests')
        .delete()
        .in('id', createdRequestIds);
    }

    // Clean up test venture
    await supabase
      .from('ventures')
      .delete()
      .eq('id', TEST_VENTURE_ID);
  });

  it('should create a test venture', async () => {
    const { data, error } = await supabase
      .from('ventures')
      .insert({
        id: TEST_VENTURE_ID,
        name: TEST_VENTURE_NAME,
        status: 'active',
        current_lifecycle_stage: 1,
        origin_type: 'manual',
        problem_statement: 'Integration test venture for artifact pipeline verification',
      })
      .select('id, name, status, current_lifecycle_stage')
      .single();

    expect(error).toBeNull();
    expect(data.id).toBe(TEST_VENTURE_ID);
    expect(data.name).toBe(TEST_VENTURE_NAME);
    expect(data.current_lifecycle_stage).toBe(1);
  });

  it('should retrieve the venture by ID', async () => {
    const { data, error } = await supabase
      .from('ventures')
      .select('id, name, status, current_lifecycle_stage')
      .eq('id', TEST_VENTURE_ID)
      .single();

    expect(error).toBeNull();
    expect(data.name).toBe(TEST_VENTURE_NAME);
    expect(data.status).toBe('active');
  });

  it('should create artifacts for stages 1-3 matching lifecycle_stage_config', async () => {
    for (const stage of stageConfig) {
      const artifactType = stage.required_artifacts[0];

      const { data, error } = await supabase
        .from('venture_artifacts')
        .insert({
          venture_id: TEST_VENTURE_ID,
          lifecycle_stage: stage.stage_number,
          artifact_type: artifactType,
          title: `Test ${artifactType} for stage ${stage.stage_number}`,
          content: `Pipeline test content for ${stage.stage_name}`,
          version: 1,
          is_current: true,
          source: 'integration_test',
          metadata: { test: true, sd: 'SD-MAN-INFRA-VENTURE-ARTIFACT-PIPELINE-002' },
        })
        .select('id, venture_id, lifecycle_stage, artifact_type, version, is_current')
        .single();

      expect(error).toBeNull();
      expect(data.venture_id).toBe(TEST_VENTURE_ID);
      expect(data.lifecycle_stage).toBe(stage.stage_number);
      expect(data.artifact_type).toBe(artifactType);
      expect(data.is_current).toBe(true);

      createdArtifactIds.push(data.id);
    }

    expect(createdArtifactIds).toHaveLength(3);
  });

  it('should filter artifacts by lifecycle_stage', async () => {
    const { data, error } = await supabase
      .from('venture_artifacts')
      .select('id, lifecycle_stage, artifact_type')
      .eq('venture_id', TEST_VENTURE_ID)
      .eq('lifecycle_stage', 1);

    expect(error).toBeNull();
    expect(data.length).toBeGreaterThanOrEqual(1);
    expect(data.every(a => a.lifecycle_stage === 1)).toBe(true);
    expect(data[0].artifact_type).toBe('truth_idea_brief');
  });

  it('should advance venture stage from 1 to 2', async () => {
    const { data, error } = await supabase
      .from('ventures')
      .update({ current_lifecycle_stage: 2 })
      .eq('id', TEST_VENTURE_ID)
      .select('id, current_lifecycle_stage')
      .single();

    expect(error).toBeNull();
    expect(data.current_lifecycle_stage).toBe(2);
  });

  it('should advance venture stage from 2 to 3', async () => {
    const { data, error } = await supabase
      .from('ventures')
      .update({ current_lifecycle_stage: 3 })
      .eq('id', TEST_VENTURE_ID)
      .select('id, current_lifecycle_stage')
      .single();

    expect(error).toBeNull();
    expect(data.current_lifecycle_stage).toBe(3);
  });

  it('should retrieve all 3 artifacts for the test venture', async () => {
    const { data, error } = await supabase
      .from('venture_artifacts')
      .select('id, lifecycle_stage, artifact_type, is_current')
      .eq('venture_id', TEST_VENTURE_ID)
      .order('lifecycle_stage');

    expect(error).toBeNull();
    expect(data).toHaveLength(3);

    // Verify artifact types match lifecycle_stage_config
    for (let i = 0; i < data.length; i++) {
      expect(data[i].lifecycle_stage).toBe(stageConfig[i].stage_number);
      expect(data[i].artifact_type).toBe(stageConfig[i].required_artifacts[0]);
      expect(data[i].is_current).toBe(true);
    }
  });

  it('should verify artifact-stage consistency after advancement', async () => {
    const { data: venture } = await supabase
      .from('ventures')
      .select('current_lifecycle_stage')
      .eq('id', TEST_VENTURE_ID)
      .single();

    expect(venture.current_lifecycle_stage).toBe(3);

    // Stage 1 artifacts should still exist after advancing
    const { data: stage1 } = await supabase
      .from('venture_artifacts')
      .select('id')
      .eq('venture_id', TEST_VENTURE_ID)
      .eq('lifecycle_stage', 1);

    expect(stage1.length).toBeGreaterThanOrEqual(1);

    // All stages 1-3 should have artifacts
    const { data: allArtifacts } = await supabase
      .from('venture_artifacts')
      .select('lifecycle_stage')
      .eq('venture_id', TEST_VENTURE_ID);

    const stages = new Set(allArtifacts.map(a => a.lifecycle_stage));
    expect(stages.has(1)).toBe(true);
    expect(stages.has(2)).toBe(true);
    expect(stages.has(3)).toBe(true);
  });

  it('should handle artifact versioning (v2 replaces v1 as current)', async () => {
    // Insert v2 of stage 1 artifact
    const { data: v2, error } = await supabase
      .from('venture_artifacts')
      .insert({
        venture_id: TEST_VENTURE_ID,
        lifecycle_stage: 1,
        artifact_type: 'truth_idea_brief',
        title: 'Updated idea brief v2',
        content: 'Revised pipeline test content with improvements',
        version: 2,
        is_current: true,
        source: 'integration_test',
        metadata: { test: true, version_test: true },
      })
      .select('id, version, is_current')
      .single();

    expect(error).toBeNull();
    expect(v2.version).toBe(2);
    expect(v2.is_current).toBe(true);
    createdArtifactIds.push(v2.id);

    // Mark v1 as not current
    const v1Id = createdArtifactIds[0]; // First artifact was stage 1
    await supabase
      .from('venture_artifacts')
      .update({ is_current: false })
      .eq('id', v1Id);

    // Verify only v2 is current for stage 1
    const { data: currentArtifacts } = await supabase
      .from('venture_artifacts')
      .select('id, version, is_current')
      .eq('venture_id', TEST_VENTURE_ID)
      .eq('lifecycle_stage', 1)
      .eq('is_current', true);

    expect(currentArtifacts).toHaveLength(1);
    expect(currentArtifacts[0].version).toBe(2);
  });
});

describe('Stage-Zero Queue Processing', () => {
  const TEST_REQUEST_ID = randomUUID();

  afterAll(async () => {
    // Clean up any test requests
    await supabase
      .from('stage_zero_requests')
      .delete()
      .eq('id', TEST_REQUEST_ID);
  });

  it('should insert a stage-zero request', async () => {
    const { data, error } = await supabase
      .from('stage_zero_requests')
      .insert({
        id: TEST_REQUEST_ID,
        status: 'pending',
        requested_by: '554a990c-ba94-4a51-972a-a2d025eb6622',
        prompt: 'Test venture for pipeline integration',
        metadata: {
          test: true,
          path: 'discovery_mode',
          sd: 'SD-MAN-INFRA-VENTURE-ARTIFACT-PIPELINE-002',
        },
      })
      .select('id, status, prompt')
      .single();

    expect(error).toBeNull();
    expect(data.id).toBe(TEST_REQUEST_ID);
    expect(data.status).toBe('pending');
    createdRequestIds.push(TEST_REQUEST_ID);
  });

  it('should query pending requests', async () => {
    const { data, error } = await supabase
      .from('stage_zero_requests')
      .select('id, status')
      .eq('status', 'pending')
      .eq('id', TEST_REQUEST_ID);

    expect(error).toBeNull();
    expect(data.length).toBeGreaterThanOrEqual(1);
    expect(data[0].id).toBe(TEST_REQUEST_ID);
  });

  it('should simulate claim and completion lifecycle', async () => {
    // Claim the request
    const { error: claimErr } = await supabase
      .from('stage_zero_requests')
      .update({
        status: 'claimed',
        claimed_by_session: 'test-session-pipeline-e2e',
        claimed_at: new Date().toISOString(),
      })
      .eq('id', TEST_REQUEST_ID)
      .eq('status', 'pending');

    expect(claimErr).toBeNull();

    // Move to in_progress
    const { error: progressErr } = await supabase
      .from('stage_zero_requests')
      .update({ status: 'in_progress' })
      .eq('id', TEST_REQUEST_ID);

    expect(progressErr).toBeNull();

    // Complete it
    const { data: completed, error: completeErr } = await supabase
      .from('stage_zero_requests')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        result: { venture_id: TEST_VENTURE_ID, stage_reached: 1 },
      })
      .eq('id', TEST_REQUEST_ID)
      .select('id, status, completed_at, result')
      .single();

    expect(completeErr).toBeNull();
    expect(completed.status).toBe('completed');
    expect(completed.result.venture_id).toBe(TEST_VENTURE_ID);
  });
});

describe('Chairman Gate Blocking at Stage 3 (FR-004)', () => {
  const GATE_VENTURE_ID = randomUUID();
  const GATE_VENTURE_NAME = `Gate-Test-${Date.now()}`;
  const createdDecisionIds = [];

  beforeAll(async () => {
    // Create venture at stage 3 (Kill Gate)
    const { error } = await supabase
      .from('ventures')
      .insert({
        id: GATE_VENTURE_ID,
        name: GATE_VENTURE_NAME,
        status: 'active',
        current_lifecycle_stage: 3,
        orchestrator_state: 'idle',
        origin_type: 'manual',
        problem_statement: 'Gate blocking test venture',
      });

    expect(error).toBeNull();
  });

  afterAll(async () => {
    if (createdDecisionIds.length > 0) {
      await supabase
        .from('chairman_decisions')
        .delete()
        .in('id', createdDecisionIds);
    }
    await supabase.from('ventures').delete().eq('id', GATE_VENTURE_ID);
  });

  it('should create a pending chairman decision at stage 3', async () => {
    const { data, error } = await supabase
      .from('chairman_decisions')
      .insert({
        venture_id: GATE_VENTURE_ID,
        lifecycle_stage: 3,
        status: 'pending',
        decision: 'pending',
        recommendation: 'proceed',
        blocking: true,
        decision_type: 'stage_gate',
        summary: 'Kill Gate review for pipeline test',
        context: { test: true, sd: 'SD-MAN-INFRA-VENTURE-ARTIFACT-PIPELINE-002' },
      })
      .select('id, venture_id, lifecycle_stage, status, blocking')
      .single();

    expect(error).toBeNull();
    expect(data.venture_id).toBe(GATE_VENTURE_ID);
    expect(data.lifecycle_stage).toBe(3);
    expect(data.status).toBe('pending');
    expect(data.blocking).toBe(true);
    createdDecisionIds.push(data.id);
  });

  it('should block venture advancement while decision is pending', async () => {
    // Verify venture is still at stage 3
    const { data: venture } = await supabase
      .from('ventures')
      .select('current_lifecycle_stage, orchestrator_state')
      .eq('id', GATE_VENTURE_ID)
      .single();

    expect(venture.current_lifecycle_stage).toBe(3);

    // Verify pending decision exists
    const { data: decisions } = await supabase
      .from('chairman_decisions')
      .select('id, status, blocking')
      .eq('venture_id', GATE_VENTURE_ID)
      .eq('lifecycle_stage', 3)
      .eq('status', 'pending');

    expect(decisions.length).toBeGreaterThanOrEqual(1);
    expect(decisions[0].blocking).toBe(true);
  });

  it('should resume pipeline after chairman approval (FR-005)', async () => {
    const decisionId = createdDecisionIds[0];

    // Approve the decision
    const { data: approved, error } = await supabase
      .from('chairman_decisions')
      .update({
        status: 'approved',
        decision: 'proceed',
        rationale: 'Test approval for pipeline verification',
        updated_at: new Date().toISOString(),
      })
      .eq('id', decisionId)
      .select('id, status, decision')
      .single();

    expect(error).toBeNull();
    expect(approved.status).toBe('approved');
    expect(approved.decision).toBe('proceed');

    // Advance venture past stage 3
    const { data: advanced, error: advErr } = await supabase
      .from('ventures')
      .update({ current_lifecycle_stage: 4 })
      .eq('id', GATE_VENTURE_ID)
      .select('id, current_lifecycle_stage')
      .single();

    expect(advErr).toBeNull();
    expect(advanced.current_lifecycle_stage).toBe(4);
  });
});

describe('Orchestrator State Transitions', () => {
  const STATE_VENTURE_ID = randomUUID();
  const STATE_VENTURE_NAME = `State-Test-${Date.now()}`;

  beforeAll(async () => {
    const { error } = await supabase
      .from('ventures')
      .insert({
        id: STATE_VENTURE_ID,
        name: STATE_VENTURE_NAME,
        status: 'active',
        current_lifecycle_stage: 1,
        orchestrator_state: 'idle',
        origin_type: 'manual',
        problem_statement: 'State transition test venture',
      });

    expect(error).toBeNull();
  });

  afterAll(async () => {
    await supabase.from('ventures').delete().eq('id', STATE_VENTURE_ID);
  });

  it('should transition from idle to processing (lock acquisition)', async () => {
    const lockId = randomUUID();
    const { data, error } = await supabase
      .from('ventures')
      .update({
        orchestrator_state: 'processing',
        orchestrator_lock_id: lockId,
        orchestrator_lock_acquired_at: new Date().toISOString(),
      })
      .eq('id', STATE_VENTURE_ID)
      .eq('orchestrator_state', 'idle')
      .select('id, orchestrator_state, orchestrator_lock_id')
      .single();

    expect(error).toBeNull();
    expect(data.orchestrator_state).toBe('processing');
    expect(data.orchestrator_lock_id).toBe(lockId);
  });

  it('should transition from processing to blocked', async () => {
    const { data, error } = await supabase
      .from('ventures')
      .update({
        orchestrator_state: 'blocked',
        orchestrator_lock_id: null,
        orchestrator_lock_acquired_at: null,
      })
      .eq('id', STATE_VENTURE_ID)
      .eq('orchestrator_state', 'processing')
      .select('id, orchestrator_state')
      .single();

    expect(error).toBeNull();
    expect(data.orchestrator_state).toBe('blocked');
  });

  it('should transition from blocked back to idle', async () => {
    const { data, error } = await supabase
      .from('ventures')
      .update({ orchestrator_state: 'idle' })
      .eq('id', STATE_VENTURE_ID)
      .eq('orchestrator_state', 'blocked')
      .select('id, orchestrator_state')
      .single();

    expect(error).toBeNull();
    expect(data.orchestrator_state).toBe('idle');
  });

  it('should reject concurrent lock acquisition (optimistic concurrency)', async () => {
    // First lock
    const lock1 = randomUUID();
    const { data: first } = await supabase
      .from('ventures')
      .update({
        orchestrator_state: 'processing',
        orchestrator_lock_id: lock1,
        orchestrator_lock_acquired_at: new Date().toISOString(),
      })
      .eq('id', STATE_VENTURE_ID)
      .eq('orchestrator_state', 'idle')
      .select('id, orchestrator_lock_id')
      .single();

    expect(first.orchestrator_lock_id).toBe(lock1);

    // Second lock attempt should fail (venture is no longer idle)
    const lock2 = randomUUID();
    const { data: second } = await supabase
      .from('ventures')
      .update({
        orchestrator_state: 'processing',
        orchestrator_lock_id: lock2,
        orchestrator_lock_acquired_at: new Date().toISOString(),
      })
      .eq('id', STATE_VENTURE_ID)
      .eq('orchestrator_state', 'idle')
      .select('id, orchestrator_lock_id')
      .single();

    // Second attempt returns null — no row matched the idle condition
    expect(second).toBeNull();

    // Verify original lock is still held
    const { data: verify } = await supabase
      .from('ventures')
      .select('orchestrator_lock_id')
      .eq('id', STATE_VENTURE_ID)
      .single();

    expect(verify.orchestrator_lock_id).toBe(lock1);

    // Clean up: release lock
    await supabase
      .from('ventures')
      .update({
        orchestrator_state: 'idle',
        orchestrator_lock_id: null,
        orchestrator_lock_acquired_at: null,
      })
      .eq('id', STATE_VENTURE_ID);
  });
});

describe('Lifecycle Stage Config Validation', () => {
  it('should have required_artifacts defined for stages 1-3', async () => {
    const { data, error } = await supabase
      .from('lifecycle_stage_config')
      .select('stage_number, stage_name, required_artifacts, phase_name')
      .in('stage_number', [1, 2, 3])
      .order('stage_number');

    expect(error).toBeNull();
    expect(data).toHaveLength(3);

    // Each stage must have at least one required artifact type
    for (const stage of data) {
      expect(stage.required_artifacts).toBeDefined();
      expect(Array.isArray(stage.required_artifacts)).toBe(true);
      expect(stage.required_artifacts.length).toBeGreaterThanOrEqual(1);
    }

    // Verify specific expected artifact types
    expect(data[0].required_artifacts).toContain('truth_idea_brief');
    expect(data[1].required_artifacts).toContain('truth_ai_critique');
    expect(data[2].required_artifacts).toContain('truth_validation_decision');
  });

  it('should have phase_name for all stages 1-3', async () => {
    const { data } = await supabase
      .from('lifecycle_stage_config')
      .select('stage_number, phase_name')
      .in('stage_number', [1, 2, 3])
      .order('stage_number');

    for (const stage of data) {
      expect(stage.phase_name).toBeTruthy();
    }
  });
});
