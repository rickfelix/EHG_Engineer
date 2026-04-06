/**
 * Integration tests for fn_advance_venture_stage artifact precondition gate
 * SD: SD-UNIFIED-STAGE-GATE-ARTIFACTPRECONDITION-ORCH-001-C
 *
 * Tests the artifact gate logic by calling the RPC with various artifact states.
 * Requires: stage_artifact_requirements table populated via seed script.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';
import { randomUUID } from 'crypto';

// Load main .env (not .env.test which may lack Supabase credentials)
dotenv.config({ path: resolve(process.cwd(), '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helper — always pass p_idempotency_key to disambiguate the overloads
async function advanceStage(ventureId, fromStage, toStage) {
  const { data, error } = await supabase.rpc('fn_advance_venture_stage', {
    p_venture_id: ventureId,
    p_from_stage: fromStage,
    p_to_stage: toStage,
    p_handoff_data: {},
    p_idempotency_key: randomUUID()
  });
  return { data, error };
}

let testVentureId;

describe('fn_advance_venture_stage artifact precondition gate', () => {
  beforeAll(async () => {
    // Create a test venture at stage 1
    const { data, error } = await supabase
      .from('ventures')
      .insert({
        name: `artifact-gate-test-${Date.now()}`,
        current_lifecycle_stage: 1,
        status: 'active',
        problem_statement: 'Test venture for artifact gate integration tests'
      })
      .select('id')
      .single();

    if (error) throw new Error(`Failed to create test venture: ${error.message}`);
    testVentureId = data.id;
  });

  afterAll(async () => {
    if (testVentureId) {
      await supabase.from('venture_artifacts').delete().eq('venture_id', testVentureId);
      await supabase.from('venture_stage_work').delete().eq('venture_id', testVentureId);
      await supabase.from('venture_stage_transitions').delete().eq('venture_id', testVentureId);
      await supabase.from('ventures').delete().eq('id', testVentureId);
    }
  });

  it('should block advancement when required artifact is missing', async () => {
    const { data, error } = await advanceStage(testVentureId, 1, 2);
    if (error) throw new Error(`RPC error: ${error.message}`);

    expect(data.success).toBe(false);
    expect(data.error).toBe('artifact_precondition_unmet');
    expect(data.missing).toBeDefined();
    expect(data.missing.length).toBeGreaterThan(0);
    expect(data.missing[0].artifact_type).toBe('truth_idea_brief');
  });

  it('should allow advancement when required artifact is present', async () => {
    await supabase.from('venture_artifacts').insert({
      venture_id: testVentureId,
      artifact_type: 'truth_idea_brief',
      lifecycle_stage: 1,
      title: 'Test idea brief',
      content: 'Test content'
    });

    const { data, error } = await advanceStage(testVentureId, 1, 2);
    if (error) throw new Error(`RPC error: ${error.message}`);

    expect(data.success).toBe(true);
    expect(data.from_stage).toBe(1);
    expect(data.to_stage).toBe(2);
  });

  it('should block stage 3 when required artifact is missing', async () => {
    // Set to stage 3 directly — truth_validation_decision not yet inserted
    await supabase.from('ventures').update({ current_lifecycle_stage: 3 }).eq('id', testVentureId);

    const { data, error } = await advanceStage(testVentureId, 3, 4);
    if (error) throw new Error(`RPC error: ${error.message}`);

    expect(data.success).toBe(false);
    expect(data.error).toBe('artifact_precondition_unmet');
    expect(data.missing[0].artifact_type).toBe('truth_validation_decision');
  });

  it('should allow advancement for stage with no requirements', async () => {
    // Stage 2 has no artifact requirements
    await supabase.from('ventures').update({ current_lifecycle_stage: 2 }).eq('id', testVentureId);

    const { data, error } = await advanceStage(testVentureId, 2, 3);
    if (error) throw new Error(`RPC error: ${error.message}`);

    expect(data.success).toBe(true);
  });

  it('should include structured error details with venture_id and stage', async () => {
    await supabase.from('ventures').update({ current_lifecycle_stage: 15 }).eq('id', testVentureId);

    const { data, error } = await advanceStage(testVentureId, 15, 16);
    if (error) throw new Error(`RPC error: ${error.message}`);

    expect(data.success).toBe(false);
    expect(data.error).toBe('artifact_precondition_unmet');
    expect(data.venture_id).toBe(testVentureId);
    expect(data.stage).toBe(15);
    expect(data.missing).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ artifact_type: 'blueprint_wireframes' })
      ])
    );
  });

  it('should allow Stage 15 advancement after wireframe artifact inserted', async () => {
    const { error: insertErr } = await supabase.from('venture_artifacts').insert({
      venture_id: testVentureId,
      artifact_type: 'blueprint_wireframes',
      lifecycle_stage: 15,
      title: 'Test wireframe screens',
      content: 'Test'
    });
    if (insertErr) throw new Error(`Artifact insert failed: ${insertErr.message}`);

    const { data, error } = await advanceStage(testVentureId, 15, 16);
    if (error) throw new Error(`RPC error: ${error.message}`);

    if (!data.success) {
      throw new Error(`Expected success but got: ${JSON.stringify(data)}`);
    }
    expect(data.success).toBe(true);
  });
});
