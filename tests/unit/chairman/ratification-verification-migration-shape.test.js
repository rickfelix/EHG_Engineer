// The new chairman_ratification_verifications sibling table must keep a SHAPE, not just exist.
//
// SD-LEO-INFRA-RATIFICATION-ENCODE-VERIFICATION-001 (FR-3).
//
// Three properties are load-bearing, mirroring tests/unit/chairman/ratification-migration-shape.test.js:
//
//  1. PLACEMENT. It must live in database/chairman-gated/, never database/migrations/ — that
//     directory is what opts a file OUT of BaseExecutor's auto-apply. This table's own triggers
//     (CREATE TRIGGER, GRANT/REVOKE, DO) mean it cannot land anywhere else.
//
//  2. INSERT-ONLY, ENFORCED BY TRIGGERS, NEVER GRANTS ALONE. service_role bypasses RLS
//     (rolbypassrls=true) and the migration-applying role owns the table, so privilege grants
//     cannot make it insert-only in this codebase — only triggers can (measured on the sibling
//     20260823_chairman_ratifications.sql, SECURITY finding M1).
//
//  3. NO TOP-LEVEL UPDATE/DELETE/TRUNCATE in the forward migration itself (a backfill UPDATE would
//     be FORBIDDEN_TOPLEVEL in the tier classifier and would also contradict this table's own
//     insert-only premise).

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyMigration } from '../../../scripts/lib/migration-tier-classifier.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SLUG = '20260911_chairman_ratification_verifications';
const GATED_DIR = path.join(REPO_ROOT, 'database', 'chairman-gated');
const FORWARD = path.join(GATED_DIR, `${SLUG}.sql`);
const DOWN = path.join(GATED_DIR, `${SLUG}_DOWN.sql`);

const forwardSql = existsSync(FORWARD) ? readFileSync(FORWARD, 'utf8') : null;
const downSql = existsSync(DOWN) ? readFileSync(DOWN, 'utf8') : null;

// STATEMENTS ONLY — comments stripped, same rationale as the sibling test: the header explains its
// own reasoning by quoting the very SQL being asserted, so asserting against raw text over-counts.
const stripComments = (sql) => (sql === null ? null : sql.replace(/^\s*--.*$/gm, ''));
const forwardStmts = stripComments(forwardSql);
const downStmts = stripComments(downSql);

describe('chairman_ratification_verifications migration placement', () => {
  it('the forward migration exists at the chairman-gated path (not merely somewhere)', () => {
    expect(forwardSql, `expected migration at ${FORWARD}`).not.toBeNull();
  });

  it('a rollback sibling exists', () => {
    expect(downSql, `expected rollback at ${DOWN}`).not.toBeNull();
  });

  it('is NOT in database/migrations/, the auto-applied directory', () => {
    const autoApplied = path.join(REPO_ROOT, 'database', 'migrations', `${SLUG}.sql`);
    expect(existsSync(autoApplied)).toBe(false);
  });

  it('carries the @chairman-gated marker the ceremony reads', () => {
    expect(forwardSql).toMatch(/@chairman-gated/);
  });
});

describe('chairman_ratification_verifications migration shape', () => {
  it('creates the table', () => {
    expect(forwardStmts).toMatch(/CREATE TABLE IF NOT EXISTS public\.chairman_ratification_verifications/i);
  });

  it('the FK to chairman_ratifications is ON DELETE RESTRICT ON UPDATE RESTRICT, not CASCADE', () => {
    expect(forwardStmts).toMatch(/REFERENCES public\.chairman_ratifications\(id\)\s+ON DELETE RESTRICT ON UPDATE RESTRICT/i);
    expect(forwardStmts).not.toMatch(/ON DELETE CASCADE/i);
  });

  it('outcome is constrained to the five documented values', () => {
    for (const v of ['verified', 'marker_absent', 'no_commit_pin', 'unverifiable_infrastructure', 'not_applicable']) {
      expect(forwardStmts, `outcome CHECK missing '${v}'`).toMatch(new RegExp(v));
    }
  });

  it('pin_tier is constrained to the literal TIER values from pinned-contract-read.mjs', () => {
    for (const v of ['exact_commit_pin', 'approximate_encoded_at_pin', 'db_section_content']) {
      expect(forwardStmts).toMatch(new RegExp(v));
    }
  });

  it('carries the idempotency key: one legacy_backfill_audit row per ratification', () => {
    expect(forwardStmts).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS crv_one_backfill_audit_per_ratification/i);
    expect(forwardStmts).toMatch(/WHERE attempt_kind = 'legacy_backfill_audit'/);
  });

  it('enforces the two refusal invariants as DB CHECK constraints, not just application logic', () => {
    expect(forwardStmts).toMatch(/crv_no_commit_pin_never_persisted/);
    expect(forwardStmts).toMatch(/crv_marker_absent_never_persisted/);
  });

  it('a NULL pin_tier is admitted for BOTH not_applicable and unverifiable_infrastructure — TESTING (evidence f3c383cf) measured the stricter not_applicable-only version rejects a real, reachable writer output (178 of 288 manifest sections carry target_file:null)', () => {
    expect(forwardStmts).toMatch(/crv_tier_null_only_for_uncheckable_outcomes/);
    expect(forwardStmts).not.toMatch(/crv_not_applicable_has_no_tier/);
  });

  it('carries all four insert-only guard triggers, all ENABLE ALWAYS', () => {
    for (const trg of [
      'chairman_ratification_verifications_no_update',
      'chairman_ratification_verifications_no_delete_trg',
      'chairman_ratification_verifications_no_truncate_trg',
      'crv_stamp_verified_at',
    ]) {
      expect(forwardStmts, `missing trigger ${trg}`).toMatch(new RegExp(`CREATE TRIGGER\\s+${trg}`));
      expect(forwardStmts, `${trg} must be ENABLE ALWAYS (SECURITY finding M1 precedent)`).toMatch(
        new RegExp(`ENABLE ALWAYS TRIGGER\\s+${trg}`)
      );
    }
  });

  it('revokes anon/authenticated/PUBLIC and grants only service_role', () => {
    expect(forwardStmts).toMatch(/REVOKE ALL ON public\.chairman_ratification_verifications FROM anon, authenticated, PUBLIC/i);
    expect(forwardStmts).toMatch(/GRANT ALL ON public\.chairman_ratification_verifications TO service_role/i);
  });

  it('contains no top-level UPDATE, DELETE, or TRUNCATE statement (insert-only, by construction)', () => {
    expect(forwardStmts).not.toMatch(/^\s*UPDATE\s+public\.chairman_ratification_verifications/im);
    expect(forwardStmts).not.toMatch(/^\s*DELETE FROM\s+public\.chairman_ratification_verifications/im);
    expect(forwardStmts).not.toMatch(/^\s*TRUNCATE\s+public\.chairman_ratification_verifications/im);
  });

  it('rollback drops all four triggers before their functions, and the table last', () => {
    const triggerAt = downStmts.search(/DROP TRIGGER/i);
    const functionAt = downStmts.search(/DROP FUNCTION/i);
    const policyAt = downStmts.search(/DROP POLICY/i);
    const tableAt = downStmts.search(/DROP TABLE/i);
    expect(triggerAt).toBeGreaterThan(-1);
    expect(functionAt).toBeGreaterThan(-1);
    expect(policyAt).toBeGreaterThan(-1);
    expect(tableAt).toBeGreaterThan(-1);
    expect(triggerAt).toBeLessThan(functionAt);
    expect(functionAt).toBeLessThan(policyAt);
    expect(policyAt).toBeLessThan(tableAt);
  });
});

describe('the tier classifier — the thing that actually decides auto-apply', () => {
  it('classifies the forward migration TIER-2, so it CANNOT auto-apply', () => {
    expect(classifyMigration(forwardSql).tier).toBe(2);
  });

  it('classifies the rollback TIER-2 as well', () => {
    expect(classifyMigration(downSql).tier).toBe(2);
  });
});
