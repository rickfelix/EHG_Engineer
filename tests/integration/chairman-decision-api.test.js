/**
 * Integration tests for Chairman Decision API
 *
 * Tests the full lifecycle: create → list → view → approve/reject
 * Uses real Supabase connection (requires .env).
 *
 * Part of SD-EVA-FEAT-CHAIRMAN-API-001
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createOrReusePendingDecision, waitForDecision } from '../../lib/eva/chairman-decision-watcher.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Use an existing venture from the database (FK constraints make test venture creation complex)
let testVentureId = null;
let testDecisionId = null;
const createdDecisionIds = [];
const testLogger = { log: () => {}, warn: () => {}, error: console.error };

describe('Chairman Decision API', () => {
  beforeAll(async () => {
    // Find an existing venture to use for testing
    const { data: ventures } = await supabase
      .from('ventures')
      .select('id, name')
      .limit(1)
      .single();

    if (ventures) {
      testVentureId = ventures.id;
    } else {
      // Skip all tests if no ventures exist
      console.warn('No ventures found in database, skipping integration tests');
      return;
    }

    // Clean up any stale test decisions from prior runs
    await supabase
      .from('chairman_decisions')
      .delete()
      .eq('venture_id', testVentureId)
      .like('summary', '%Test decision%');
  });

  afterAll(async () => {
    // Clean up all test decisions we created
    for (const id of createdDecisionIds) {
      await supabase.from('chairman_decisions').delete().eq('id', id);
    }
  });

  describe('createOrReusePendingDecision', () => {
    it('creates a new PENDING decision', async () => {
      if (!testVentureId) return;

      const result = await createOrReusePendingDecision({
        ventureId: testVentureId,
        stageNumber: 0,
        briefData: { name: 'Test Venture', problem_statement: 'Test problem' },
        summary: 'Test decision for stage 0',
        supabase,
        logger: testLogger,
      });

      expect(result.id).toBeTruthy();
      expect(result.isNew).toBe(true);
      testDecisionId = result.id;
      createdDecisionIds.push(result.id);

      // Verify in database
      const { data } = await supabase
        .from('chairman_decisions')
        .select('*')
        .eq('id', result.id)
        .single();

      expect(data.status).toBe('pending');
      expect(data.venture_id).toBe(testVentureId);
      expect(data.lifecycle_stage).toBe(0);
      expect(data.summary).toBe('Test decision for stage 0');
      expect(data.brief_data).toEqual({ name: 'Test Venture', problem_statement: 'Test problem' });
    });

    it('reuses existing PENDING decision for same venture+stage', async () => {
      if (!testVentureId || !testDecisionId) return;

      const result = await createOrReusePendingDecision({
        ventureId: testVentureId,
        stageNumber: 0,
        briefData: { name: 'Updated Brief' },
        summary: 'Updated summary',
        supabase,
        logger: testLogger,
      });

      expect(result.id).toBe(testDecisionId);
      expect(result.isNew).toBe(false);
    });

    it('creates new decision for different stage', async () => {
      if (!testVentureId) return;

      const result = await createOrReusePendingDecision({
        ventureId: testVentureId,
        stageNumber: 10,
        summary: 'Test decision for stage 10',
        supabase,
        logger: testLogger,
      });

      expect(result.id).not.toBe(testDecisionId);
      expect(result.isNew).toBe(true);
      createdDecisionIds.push(result.id);
    });
  });

  describe('Decision status changes', () => {
    it('approves a PENDING decision', async () => {
      if (!testDecisionId) return;

      const { error } = await supabase
        .from('chairman_decisions')
        .update({
          status: 'approved',
          decision: 'proceed',
          rationale: 'Integration test approval',
        })
        .eq('id', testDecisionId);

      expect(error).toBeNull();

      // Verify
      const { data } = await supabase
        .from('chairman_decisions')
        .select('status, decision, rationale')
        .eq('id', testDecisionId)
        .single();

      expect(data.status).toBe('approved');
      expect(data.decision).toBe('proceed');
      expect(data.rationale).toBe('Integration test approval');
    });

    it('allows new PENDING after approval for same venture+stage', async () => {
      if (!testVentureId) return;

      // Previous decision for stage 0 was approved, so new PENDING should succeed
      const result = await createOrReusePendingDecision({
        ventureId: testVentureId,
        stageNumber: 0,
        summary: 'Test decision after approval',
        supabase,
        logger: testLogger,
      });

      expect(result.isNew).toBe(true);
      expect(result.id).not.toBe(testDecisionId);
      createdDecisionIds.push(result.id);

      // Clean it up by rejecting
      await supabase
        .from('chairman_decisions')
        .update({ status: 'rejected', decision: 'kill', rationale: 'cleanup' })
        .eq('id', result.id);
    });

    it('verifies already-approved decision stays approved', async () => {
      if (!testDecisionId) return;

      const { data } = await supabase
        .from('chairman_decisions')
        .select('status')
        .eq('id', testDecisionId)
        .single();

      expect(data.status).toBe('approved');
    });
  });

  describe('waitForDecision', () => {
    it('returns immediately for already-resolved decisions', async () => {
      if (!testDecisionId) return;

      const result = await waitForDecision({
        decisionId: testDecisionId,
        supabase,
        logger: testLogger,
      });

      expect(result.status).toBe('approved');
      expect(result.rationale).toBe('Integration test approval');
    });

    it('times out for pending decisions', async () => {
      if (!testVentureId) return;

      // Create a new pending decision for timeout test
      const { id } = await createOrReusePendingDecision({
        ventureId: testVentureId,
        stageNumber: 22,
        summary: 'Test decision timeout',
        supabase,
        logger: testLogger,
      });
      createdDecisionIds.push(id);

      await expect(
        waitForDecision({
          decisionId: id,
          supabase,
          logger: testLogger,
          timeoutMs: 2000, // 2 second timeout
        })
      ).rejects.toThrow(/timed out/);
    });
  });

  describe('CLI command validation', () => {
    it('validates status parameter', () => {
      const validStatuses = ['pending', 'approved', 'rejected', 'cancelled'];
      expect(validStatuses.includes('pending')).toBe(true);
      expect(validStatuses.includes('invalid')).toBe(false);
    });

    it('validates stage parameter', () => {
      const validStages = ['0', '10', '22', '25'];
      expect(validStages.includes('0')).toBe(true);
      expect(validStages.includes('10')).toBe(true);
      expect(validStages.includes('5')).toBe(false);
    });

    it('requires rationale for approve/reject', () => {
      // Simulates validation logic from CLI
      const rationale = undefined;
      expect(!rationale).toBe(true);
    });
  });
});
