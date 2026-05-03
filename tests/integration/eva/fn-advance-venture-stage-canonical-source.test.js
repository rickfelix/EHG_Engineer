/**
 * Integration tests for fn_advance_venture_stage canonical artifact source (FR-2)
 * SD: SD-LEO-FEAT-STAGE-DISTRIBUTION-SETUP-001
 *
 * Tests:
 *   T1. fn_advance_venture_stage reads canonical lifecycle_stage_config.required_artifacts
 *       (5-param signature works without PGRST203 — sentinel test)
 *   T2. Returns artifact_precondition_unmet when canonical artifact missing
 *   T3. Includes 'source' field identifying canonical vs legacy_fallback
 *   T4. Per-venture bypass: ventures.metadata.s22_legacy_skipped=true skips gate at S22
 *
 * Requires: 5 migrations applied, real DB.
 *
 * @module tests/integration/eva/fn-advance-venture-stage-canonical-source.test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';
import { randomUUID } from 'crypto';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const HAS_REAL_DB = process.env.SUPABASE_URL
  && !process.env.SUPABASE_URL.includes('test.invalid.local')
  && process.env.SUPABASE_SERVICE_ROLE_KEY
  && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('test-service-role-key-not-real');

let testVentureId;

async function callAdvance(ventureId, fromStage, toStage, handoffData = {}) {
  return await supabase.rpc('fn_advance_venture_stage', {
    p_venture_id: ventureId,
    p_from_stage: fromStage,
    p_to_stage: toStage,
    p_handoff_data: handoffData,
    p_idempotency_key: randomUUID(),
  });
}

describe.skipIf(!HAS_REAL_DB)('fn_advance_venture_stage canonical artifact source (FR-2)', () => {
  beforeAll(async () => {
    const { data, error } = await supabase
      .from('ventures')
      .insert({
        name: `canonical-source-test-${Date.now()}`,
        current_lifecycle_stage: 22,
        status: 'active',
        problem_statement: 'Integration test for FR-2 canonical artifact source migration',
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

  it('T1 — RPC accepts 5-param signature without PGRST203 (sentinel)', async () => {
    const { error } = await callAdvance(testVentureId, 22, 23);
    // Either succeeds OR returns a structured business error — but NEVER a PGRST203
    // ("Could not choose best candidate function") which would mean overload ambiguity.
    if (error) {
      expect(error.code).not.toBe('PGRST203');
      expect(error.message).not.toMatch(/best candidate function/i);
    }
  });

  it('T2 — refuses S22→S23 with artifact_precondition_unmet when canonical artifacts missing', async () => {
    // Test venture starts with no S22 venture_artifacts → should fail.
    const { data, error } = await callAdvance(testVentureId, 22, 23);
    expect(error).toBeNull();
    expect(data.success).toBe(false);
    expect(data.error).toBe('artifact_precondition_unmet');
    expect(data.missing).toBeDefined();
    // Source field added by FR-2 migration
    expect(data.source).toBeDefined();
    expect(['canonical', 'canonical_with_fallback_available', 'legacy_fallback']).toContain(data.source);
  });

  it('T3 — includes flag_enabled boolean in error response', async () => {
    const { data } = await callAdvance(testVentureId, 22, 23);
    expect(data.flag_enabled).toBeDefined();
    expect(typeof data.flag_enabled).toBe('boolean');
  });

  it('T4 — per-venture bypass: ventures.metadata.s22_legacy_skipped=true skips gate', async () => {
    // Tag the test venture as legacy-skipped.
    const { error: tagErr } = await supabase
      .from('ventures')
      .update({ metadata: { s22_legacy_skipped: true } })
      .eq('id', testVentureId);
    expect(tagErr).toBeNull();

    // Now attempt advance — gate should bypass.
    const { data, error } = await callAdvance(testVentureId, 22, 23);
    expect(error).toBeNull();

    // The gate is bypassed. Other gates (review-mode, kill/promotion) may still
    // block, but it should NOT be artifact_precondition_unmet.
    if (!data.success) {
      expect(data.error).not.toBe('artifact_precondition_unmet');
    }

    // Reset the metadata.
    await supabase.from('ventures').update({ metadata: {} }).eq('id', testVentureId);
  });
});
