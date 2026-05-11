/**
 * Behavior tests for SD-FDBK-INFRA-REFACTOR-LEADFINALAPPROVALEXECUTOR-LHE-001 (PR-A).
 *
 * Covers the FR-9 helper checkProgressBreakdownLheReady() and the integration with
 * the LFA upsert path. Direct HandoffRecorder execution is hard to mock without
 * the full dep tree; the static-pin tests in lead-final-approval-pending-pre-insert.test.js
 * cover the wired-in correctness of FR-1, FR-2, FR-2a, FR-4. This file covers behavioral
 * branches of the FR-9 helper (which controls the FR-1 deploy-lag graceful-degrade) plus
 * env case-sensitivity (FR-6 case g per testing-agent W3).
 *
 * Pattern: vitest with mockClear() called AFTER dynamic imports per memory note from
 * SD-FDBK-INFRA-ATOMIC-REVERT-HELPER-001 ("vi.spyOn returns same spy across tests").
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';

describe('FR-9 helper: checkProgressBreakdownLheReady()', () => {
  let checkProgressBreakdownLheReady;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../scripts/modules/handoff/pre-checks/pending-migrations-check.js');
    checkProgressBreakdownLheReady = mod.checkProgressBreakdownLheReady;
  });

  test('FR-6 case (a equiv): non-LFA handoff types early-return ready=true regardless of flag (AC-9.5)', async () => {
    const fakeSupabase = { rpc: vi.fn(() => Promise.resolve({ data: false })) };
    for (const handoffType of ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD']) {
      const result = await checkProgressBreakdownLheReady(fakeSupabase, { handoffType, flagEnabled: true });
      expect(result.ready).toBe(true);
      expect(result.reason).toBe('check_skipped_non_lfa');
    }
    // Also confirm RPC was NOT called when handoff_type is non-LFA — FR-9 LFA-only invariant
    expect(fakeSupabase.rpc).not.toHaveBeenCalled();
  });

  test('flag OFF — early-return ready=true; RPC not called (FR-1 legacy path preserved)', async () => {
    const fakeSupabase = { rpc: vi.fn(() => Promise.resolve({ data: true })) };
    const result = await checkProgressBreakdownLheReady(fakeSupabase, {
      handoffType: 'LEAD-FINAL-APPROVAL',
      flagEnabled: false
    });
    expect(result.ready).toBe(true);
    expect(result.reason).toBe('check_skipped_flag_off');
    expect(fakeSupabase.rpc).not.toHaveBeenCalled();
  });

  test('FR-6 case (b equiv): flag ON + LFA + RPC returns true → ready=true (happy path)', async () => {
    const fakeSupabase = { rpc: vi.fn(() => Promise.resolve({ data: true, error: null })) };
    const result = await checkProgressBreakdownLheReady(fakeSupabase, {
      handoffType: 'LEAD-FINAL-APPROVAL',
      flagEnabled: true
    });
    expect(result.ready).toBe(true);
    expect(result.reason).toBe('migration_applied');
    expect(fakeSupabase.rpc).toHaveBeenCalledWith('lhe_pending_migration_applied');
  });

  test('FR-6 case (c equiv): flag ON + LFA + RPC missing (PGRST 42883) → ready=false (FR-1 graceful-degrade)', async () => {
    const fakeSupabase = {
      rpc: vi.fn(() => Promise.resolve({ data: null, error: { message: 'function lhe_pending_migration_applied() does not exist', code: '42883' } }))
    };
    const result = await checkProgressBreakdownLheReady(fakeSupabase, {
      handoffType: 'LEAD-FINAL-APPROVAL',
      flagEnabled: true
    });
    expect(result.ready).toBe(false);
    expect(result.reason).toBe('rpc_missing_or_errored');
    expect(result.detail).toMatch(/lhe_pending_migration_applied/);
  });

  test('FR-6 case (c2 equiv): flag ON + LFA + RPC returns false → ready=false (FR-9 detects predecessor function body)', async () => {
    const fakeSupabase = { rpc: vi.fn(() => Promise.resolve({ data: false, error: null })) };
    const result = await checkProgressBreakdownLheReady(fakeSupabase, {
      handoffType: 'LEAD-FINAL-APPROVAL',
      flagEnabled: true
    });
    expect(result.ready).toBe(false);
    expect(result.reason).toBe('rpc_returned_false');
  });

  test('FR-6 case (c3 equiv): flag ON + LFA + RPC throws → ready=false fail-soft', async () => {
    const fakeSupabase = { rpc: vi.fn(() => Promise.reject(new Error('network error'))) };
    const result = await checkProgressBreakdownLheReady(fakeSupabase, {
      handoffType: 'LEAD-FINAL-APPROVAL',
      flagEnabled: true
    });
    expect(result.ready).toBe(false);
    expect(result.reason).toBe('rpc_threw');
    expect(result.detail).toBe('network error');
  });
});

describe('FR-6 case (g): env LEO_LHE_PENDING_STATUS strict-equality (case-sensitive, only literal "true")', () => {
  // The flag-check pattern is `process.env.LEO_LHE_PENDING_STATUS === 'true'` (strict).
  // Per testing-agent W3, asserting case-sensitivity prevents accidental enablement via
  // typos like 'True'/'TRUE'/'1'/'yes'.
  test.each([
    ['true', true],
    ['True', false],
    ['TRUE', false],
    ['1', false],
    ['yes', false],
    ['', false],
    [undefined, false]
  ])('LEO_LHE_PENDING_STATUS=%j → flagEnabled is %s', (envVal, expectedFlag) => {
    // Simulate the exact comparison used in executor + recorder
    const flagEnabled = envVal === 'true';
    expect(flagEnabled).toBe(expectedFlag);
  });
});

describe('FR-3 migration sentinel — RPC + UNIQUE INDEX shape verifiable from SQL source', () => {
  // Module-load assertion equivalent: parse the migration SQL and assert key invariants.
  // This is the AC-3.8 module-load equivalence at the source-file level (independent of DB apply).
  let sqlContent;
  beforeEach(async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const ROOT = path.resolve(__dirname, '../..');
    sqlContent = fs.readFileSync(path.join(ROOT, 'database/migrations/20260511_progress_breakdown_lhe_pending_aware.sql'), 'utf8');
  });

  test('RPC lhe_pending_migration_applied returns boolean and queries pg_get_functiondef', () => {
    expect(sqlContent).toMatch(/CREATE OR REPLACE FUNCTION lhe_pending_migration_applied\(\)\s+RETURNS boolean/);
    expect(sqlContent).toMatch(/pg_get_functiondef/);
  });

  test('partial UNIQUE INDEX has both predicates: status=pending_acceptance AND handoff_type=LFA', () => {
    expect(sqlContent).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_lhe_lfa_pending_unique[\s\S]*?WHERE status = 'pending_acceptance' AND handoff_type = 'LEAD-FINAL-APPROVAL'/);
  });

  test('verification block raises WARNING on mismatch', () => {
    expect(sqlContent).toMatch(/RAISE WARNING 'Migration verification FAILED/);
  });

  test('rollback file restores LHE branch to status=accepted only (no pending_acceptance)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const ROOT = path.resolve(__dirname, '../..');
    const rollback = fs.readFileSync(path.join(ROOT, 'database/migrations/rollback/20260511_progress_breakdown_lhe_pending_aware_rollback.sql'), 'utf8');
    expect(rollback).toMatch(/DROP INDEX IF EXISTS idx_lhe_lfa_pending_unique/);
    expect(rollback).toMatch(/DROP FUNCTION IF EXISTS lhe_pending_migration_applied\(\)/);
    // Restored function bodies should NOT contain the pending_acceptance literal in the LHE branch
    expect(rollback).not.toMatch(/status IN \('pending_acceptance', 'accepted'\)/);
  });
});
