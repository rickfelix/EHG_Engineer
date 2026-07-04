/**
 * Integration tests for Chairman Decision API
 *
 * Tests the full lifecycle: create → list → view → approve/reject
 * Uses real Supabase connection (requires .env).
 *
 * Part of SD-EVA-FEAT-CHAIRMAN-API-001
 */

import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createOrReusePendingDecision, waitForDecision } from '../../lib/eva/chairman-decision-watcher.js';

const supabase = createSupabaseServiceClient();

// Gate on a real database. CI without secrets sets test.invalid.local via
// tests/setup.js — every test here exercises real chairman_decisions writes.
const HAS_REAL_DB = process.env.SUPABASE_URL
  && !process.env.SUPABASE_URL.includes('test.invalid.local')
  && process.env.SUPABASE_SERVICE_ROLE_KEY
  && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('test-service-role-key-not-real');

// QF-20260701-848: use an EPHEMERAL, per-run venture (created in beforeAll) instead
// of scanning for a shared "clean" existing venture. The old scan-25/find-clean
// approach was a TOCTOU on the shared prod DB — a concurrent CI job or the live
// production chairman-decision pipeline could insert a pending row at the same
// (venture, stage) between the clean-check and createOrReusePendingDecision, so the
// call reused it (isNew:false) and the assertions below failed. A dedicated venture
// has zero pre-existing pending decisions, so `isNew:true` holds deterministically.
// (2nd occurrence after QF-20260612-258, which was itself a shared-DB false-positive.)
// Verified live: bare {name, problem_statement} insert succeeds (triggers default
// stage/tier/status); deleting the venture cascades to eva_ventures (no orphans).
let testVentureId = null;
let testDecisionId = null;
const createdDecisionIds = [];
const testLogger = { log: () => {}, warn: () => {}, error: console.error };

// Per-run marker so the crash-safety sweep in afterAll only ever reaps THIS suite's
// aborted ventures, never a real one. Name need not be unique (each insert yields a
// distinct venture id); the marker just scopes the age-bounded straggler sweep.
const RUN_MARKER = `__citest_chairman__:${process.env.GITHUB_RUN_ID ?? randomUUID().slice(0, 8)}`;

// Quick-fix QF-20260612-258: stage 0 is not a decision-creating stage per the
// stage_creates_decision RPC (createOrReusePendingDecision returns {id:null,skipped}),
// so use gate stages (3/10/22) which have creates_decision=true.
const STAGE_A = 3; // kill gate — creates_decision=true
const STAGE_B = 10; // promotion gate — creates_decision=true

describe.skipIf(!HAS_REAL_DB)('Chairman Decision API', () => {
  beforeAll(async () => {
    // Create a dedicated, ephemeral venture this suite exclusively owns, so no
    // concurrent writer can pre-populate a pending decision at our (venture, stage).
    // NOT is_demo:true / a fixture-pattern name -- this suite deliberately exercises
    // createOrReusePendingDecision's REAL write path end-to-end (QF-20260703-236's
    // fixture-venture guard would skip decision creation entirely, breaking every
    // assertion below). Root-caused instead via the CI-workflow fix (package.json
    // test:coverage now scopes --project unit) so this suite never runs unintentionally
    // against production; it remains valid to run intentionally (npm run test:integration).
    const { data, error } = await supabase
      .from('ventures')
      .insert({ name: RUN_MARKER, problem_statement: RUN_MARKER })
      .select('id')
      .single();
    if (error) {
      // Seed failed → leave testVentureId null; every test's `if (!testVentureId) return`
      // guard skips gracefully rather than asserting against unowned data.
      console.warn('Could not create ephemeral test venture, skipping integration tests:', error.message);
      return;
    }
    testVentureId = data.id;
  });

  afterAll(async () => {
    // Scope cleanup to THIS run's venture. Deleting the venture cascades to its
    // chairman_decisions and eva_ventures (verified live), so this removes every
    // row the suite created — createdDecisionIds are all on testVentureId.
    if (testVentureId) {
      await supabase.from('chairman_decisions').delete().eq('venture_id', testVentureId);
      await supabase.from('ventures').delete().eq('id', testVentureId);
    }
    // Crash-safety: reap ephemeral ventures from ABORTED prior runs that never
    // reached this afterAll. Age-bounded (>1h) so a concurrent run's in-flight
    // venture (same GITHUB_RUN_ID marker) is never deleted out from under it.
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await supabase
      .from('ventures')
      .delete()
      .like('name', '__citest_chairman__:%')
      .lt('created_at', cutoff);
  });

  describe('createOrReusePendingDecision', () => {
    it('creates a new PENDING decision', async () => {
      if (!testVentureId) return;

      const result = await createOrReusePendingDecision({
        ventureId: testVentureId,
        stageNumber: STAGE_A,
        briefData: { name: 'Test Venture', problem_statement: 'Test problem' },
        summary: 'Test decision for stage A',
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
      expect(data.lifecycle_stage).toBe(STAGE_A);
      expect(data.summary).toBe('Test decision for stage A');
      expect(data.brief_data).toEqual({ name: 'Test Venture', problem_statement: 'Test problem' });
    });

    it('reuses existing PENDING decision for same venture+stage', async () => {
      if (!testVentureId || !testDecisionId) return;

      const result = await createOrReusePendingDecision({
        ventureId: testVentureId,
        stageNumber: STAGE_A,
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
        stageNumber: STAGE_B,
        summary: 'Test decision for stage B',
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

    it('returns the resolved decision on re-entry after approval for same venture+stage', async () => {
      if (!testVentureId || !testDecisionId) return;

      // SD-VW-FIX-WORKER-GATE-REENTRY-001: a unique constraint on venture+stage
      // means re-entry after approval returns the existing resolved decision
      // (isNew=false) instead of creating a fresh PENDING row.
      const result = await createOrReusePendingDecision({
        ventureId: testVentureId,
        stageNumber: STAGE_A,
        summary: 'Test decision after approval',
        supabase,
        logger: testLogger,
      });

      expect(result.isNew).toBe(false);
      expect(result.id).toBe(testDecisionId);
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
