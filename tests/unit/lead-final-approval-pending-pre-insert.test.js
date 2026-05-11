/**
 * Static-pin regression tests for SD-FDBK-INFRA-REFACTOR-LEADFINALAPPROVALEXECUTOR-LHE-001 (PR-A).
 *
 * Pattern: fs.readFileSync + dual-anchor regex (whole-file + scoped slice via src.slice).
 * Pattern source: SD-FDBK-INFRA-ORCHESTRATOR-ROUTING-PHASE-001 dual-anchor.
 * Mocking-independent — catches code drift without runtime imports.
 *
 * Three pin sets:
 *   1. Executor (lead-final-approval/index.js) flag branches + graceful-degrade marker
 *      — function-body-scoped via src.slice(preInsertStart, firstRejectedEnd) per testing-agent W2
 *   2. Guardian (orchestrator-completion-guardian.js) does NOT import LeadFinalApprovalExecutor
 *      — actual path scripts/modules/handoff/orchestrator-completion-guardian.js per testing-agent W1
 *   3. FR-3 migration content (UNION ALL + status IN literal + UNIQUE INDEX + NOTIFY pgrst)
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test, expect } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');

const EXECUTOR_PATH = path.join(ROOT, 'scripts/modules/handoff/executors/lead-final-approval/index.js');
const GUARDIAN_PATH = path.join(ROOT, 'scripts/modules/handoff/orchestrator-completion-guardian.js');
const MIGRATION_PATH = path.join(ROOT, 'database/migrations/20260511_progress_breakdown_lhe_pending_aware.sql');
const PRE_CHECK_PATH = path.join(ROOT, 'scripts/modules/handoff/pre-checks/pending-migrations-check.js');
const RECORDER_PATH = path.join(ROOT, 'scripts/modules/handoff/recording/HandoffRecorder.js');

describe('Pin Set 1: LeadFinalApprovalExecutor flag-gated pre-insert (FR-1 + FR-4)', () => {
  test('executor file exists at canonical path', () => {
    expect(existsSync(EXECUTOR_PATH)).toBe(true);
  });

  test('imports checkProgressBreakdownLheReady helper from pending-migrations-check (FR-1 deploy-lag)', () => {
    const src = readFileSync(EXECUTOR_PATH, 'utf8');
    expect(src).toMatch(/import\s*\{\s*checkProgressBreakdownLheReady\s*\}\s*from\s*['"]\.\.\/\.\.\/pre-checks\/pending-migrations-check\.js['"]/);
  });

  test('flag-gated branch — body-scoped slice contains LEO_LHE_PENDING_STATUS check + both status values + graceful-degrade marker', () => {
    const src = readFileSync(EXECUTOR_PATH, 'utf8');
    // Body-scope: from the normalizedScore declaration (start of FR-1 region) to the first
    // ResultBuilder.rejected after it. Without this scoping, FR-4 DELETE filter literal
    // 'pending_acceptance' inside the cleanup helper would false-positive the FR-1 pin.
    const fr1Anchor = src.indexOf('const normalizedScore = gateResults.normalizedScore');
    expect(fr1Anchor).toBeGreaterThan(0);
    const tail = src.slice(fr1Anchor);
    const rejMatch = tail.match(/ResultBuilder\.rejected\(\s*['"]UNAPPLIED_MIGRATIONS['"]/);
    expect(rejMatch).not.toBeNull();
    const firstRejectedFromFr1 = fr1Anchor + rejMatch.index;
    expect(firstRejectedFromFr1).toBeGreaterThan(fr1Anchor);
    const helperRegion = src.slice(fr1Anchor, firstRejectedFromFr1);
    expect(helperRegion).toMatch(/process\.env\.LEO_LHE_PENDING_STATUS\s*===\s*['"]true['"]/);
    expect(helperRegion).toMatch(/'pending_acceptance'/);
    expect(helperRegion).toMatch(/'accepted'/);
    expect(helperRegion).toMatch(/checkProgressBreakdownLheReady/);
    expect(helperRegion).toMatch(/LFA_GRACEFUL_DEGRADE_TO_ACCEPTED/);
    // NR-2: graceful-degrade audit marker
    expect(helperRegion).toMatch(/degraded_to_accepted/);
  });

  test('FR-4 cleanup helper exists with correct DELETE filter', () => {
    const src = readFileSync(EXECUTOR_PATH, 'utf8');
    // _cleanupPendingPreInsert method exists
    expect(src).toMatch(/async\s+_cleanupPendingPreInsert\s*\(\s*sdId\s*,\s*usePendingPath\s*\)/);
    // DELETE chain with the 4 required filters scoped to the helper body.
    // Anchor end at the next method declaration (_runHealCheck) — robust to line endings + indentation.
    const helperStart = src.indexOf('async _cleanupPendingPreInsert');
    const nextMethodStart = src.indexOf('async _runHealCheck', helperStart);
    expect(nextMethodStart).toBeGreaterThan(helperStart);
    const helperBody = src.slice(helperStart, nextMethodStart);
    expect(helperBody).toMatch(/\.delete\(\)/);
    expect(helperBody).toMatch(/\.eq\(['"]handoff_type['"]\s*,\s*['"]LEAD-FINAL-APPROVAL['"]\)/);
    expect(helperBody).toMatch(/\.eq\(['"]status['"]\s*,\s*['"]pending_acceptance['"]\)/);
    expect(helperBody).toMatch(/\.eq\(['"]created_by['"]\s*,\s*['"]UNIFIED-HANDOFF-SYSTEM['"]\)/);
    // Fail-soft logging marker
    expect(helperBody).toMatch(/LFA_PENDING_CLEANUP_FAILED/);
  });

  test('FR-4 cleanup wired at BOTH post-pre-insert rejection sites (UNAPPLIED_MIGRATIONS + SD_UPDATE_FAILED)', () => {
    const src = readFileSync(EXECUTOR_PATH, 'utf8');
    // Two cleanup-call sites: enumerate count parity with the count of rejected returns between pre-insert and HandoffRecorder
    const cleanupCalls = src.match(/await this\._cleanupPendingPreInsert\(sd\.id,\s*usePendingPath\)/g) || [];
    expect(cleanupCalls.length).toBe(2);
  });
});

describe('Pin Set 2: OrchestratorCompletionGuardian isolation (FR-5a)', () => {
  test('Guardian file exists at scripts/modules/handoff/orchestrator-completion-guardian.js (NOT lib/orchestrator/)', () => {
    expect(existsSync(GUARDIAN_PATH)).toBe(true);
  });

  test('Guardian source does NOT import LeadFinalApprovalExecutor (regression prevention)', () => {
    const src = readFileSync(GUARDIAN_PATH, 'utf8');
    expect(src).not.toMatch(/import\s+[^;]*LeadFinalApprovalExecutor/);
    expect(src).not.toMatch(/require\([^)]*lead-final-approval[^)]*\)/);
  });
});

describe('Pin Set 3: FR-3 migration content', () => {
  test('migration file exists at canonical 20260511 path', () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);
  });

  test('migration is wrapped in BEGIN/COMMIT envelope', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8');
    expect(sql).toMatch(/^BEGIN;/m);
    expect(sql).toMatch(/^COMMIT;/m);
  });

  test('both function overloads (UUID and TEXT) updated', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8');
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION get_progress_breakdown\(sd_id_param UUID\)/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION get_progress_breakdown\(sd_id_param TEXT\)/);
  });

  test('LHE branch extended to status IN (pending_acceptance, accepted) — present in BOTH overloads', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8');
    const matches = sql.match(/status IN \('pending_acceptance', 'accepted'\)/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  test('SECURITY DEFINER + search_path=public preserved on both overloads', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8');
    const securityDefiners = sql.match(/SECURITY DEFINER/g) || [];
    expect(securityDefiners.length).toBeGreaterThanOrEqual(2);
    const searchPaths = sql.match(/SET search_path = public/g) || [];
    expect(searchPaths.length).toBeGreaterThanOrEqual(2);
  });

  test('partial UNIQUE INDEX (FR-2b) scoped to pending_acceptance + LFA only', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8');
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_lhe_lfa_pending_unique/);
    expect(sql).toMatch(/WHERE status = 'pending_acceptance' AND handoff_type = 'LEAD-FINAL-APPROVAL'/);
  });

  test('FR-9 RPC lhe_pending_migration_applied present', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8');
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION lhe_pending_migration_applied\(\)/);
    expect(sql).toMatch(/pg_get_functiondef\('get_progress_breakdown\(text\)'::regprocedure\)/);
  });

  test('NOTIFY pgrst schema reload appended (database-agent W2)', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8');
    expect(sql).toMatch(/NOTIFY pgrst, 'reload schema';/);
  });
});

describe('Pin Set 4: FR-9 helper in pending-migrations-check.js + FR-2 upsert in HandoffRecorder', () => {
  test('checkProgressBreakdownLheReady exported from pending-migrations-check.js (PA-2 routing)', () => {
    const src = readFileSync(PRE_CHECK_PATH, 'utf8');
    expect(src).toMatch(/export async function checkProgressBreakdownLheReady\s*\(/);
    expect(src).toMatch(/handoffType\s*!==\s*['"]LEAD-FINAL-APPROVAL['"]/);
    expect(src).toMatch(/check_skipped_non_lfa/);
    expect(src).toMatch(/lhe_pending_migration_applied/);
  });

  test('HandoffRecorder includes FR-2 LFA-pending upsert path with FR-2a created_by filter', () => {
    const src = readFileSync(RECORDER_PATH, 'utf8');
    expect(src).toMatch(/LEO_LHE_PENDING_STATUS/);
    expect(src).toMatch(/LFA-PENDING-UPSERT/);
    // Lookup query must include all 4 filters scoped to the upsert region
    const upsertAnchor = src.indexOf('isLfaFlagOn');
    expect(upsertAnchor).toBeGreaterThan(0);
    const upsertEnd = src.indexOf('let insertError = null;', upsertAnchor);
    expect(upsertEnd).toBeGreaterThan(upsertAnchor);
    const upsertRegion = src.slice(upsertAnchor, upsertEnd);
    expect(upsertRegion).toMatch(/\.eq\(['"]handoff_type['"]\s*,\s*['"]LEAD-FINAL-APPROVAL['"]\)/);
    expect(upsertRegion).toMatch(/\.eq\(['"]status['"]\s*,\s*['"]pending_acceptance['"]\)/);
    expect(upsertRegion).toMatch(/\.eq\(['"]created_by['"]\s*,\s*['"]UNIFIED-HANDOFF-SYSTEM['"]\)/);
    expect(upsertRegion).toMatch(/upserted_by_recorder/);
  });
});
