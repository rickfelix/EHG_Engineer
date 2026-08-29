/**
 * SD-LEO-INFRA-REJECT-PATH-VENTURE-001 -- migration-shape tests.
 *
 * The migration is chairman-gated (SECURITY-DEFINER-adjacent RPC touching a chairman-reserved
 * act) and cannot be self-applied by a worker session -- these tests prove the SQL TEXT satisfies
 * the coordinator's verbatim two-sided contract and the live-kill-gate-derivation requirement,
 * matching this session's established pattern for chairman-gated deliverables (see
 * tests/unit/phase-snapshot-window.test.js's migration-shape suite for precedent).
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const MIGRATION_PATH = 'database/chairman-gated/20260829_reject_path_type_aware_and_live_kill_gate.sql';

describe('reject-path-venture-kill migration -- shape and two-sided contract', () => {
  let sql;
  let sqlNoComments;
  test('setup: read the migration', () => {
    sql = readFileSync(path.join(ROOT, MIGRATION_PATH), 'utf8');
    expect(sql.length).toBeGreaterThan(0);
    sqlNoComments = sql
      .split('\n')
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n');
  });

  test('new fn_is_kill_gate_stage helper reads venture_stages.gate_type=\'kill\' live', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.fn_is_kill_gate_stage/);
    expect(sql).toMatch(/FROM public\.venture_stages/);
    expect(sql).toMatch(/gate_type = 'kill'/);
  });

  test('zero hardcoded kill-stage arrays remain in any executable SQL statement (comments excluded)', () => {
    expect(sqlNoComments).not.toMatch(/ARRAY\[\s*3\s*,\s*5\s*,\s*13\s*,\s*23\s*\]/);
  });

  test('fn_is_kill_gate_stage is called at exactly 3 sites (fn_chairman_decide, reject_chairman_decision, fn_write_kill_audit_trail)', () => {
    // 4 total occurrences: 1 is the CREATE OR REPLACE FUNCTION signature itself (the definition,
    // not a call), the other 3 are the actual call sites this test verifies.
    const totalOccurrences = (sqlNoComments.match(/public\.fn_is_kill_gate_stage\(/g) || []).length;
    const definitionCount = (sqlNoComments.match(/CREATE OR REPLACE FUNCTION public\.fn_is_kill_gate_stage\(/g) || []).length;
    expect(definitionCount).toBe(1);
    expect(totalOccurrences - definitionCount).toBe(3);
  });

  test('two-sided contract, side (b): fn_chairman_decide gates the venture block on v_decision_value = \'kill\', not on p_action alone', () => {
    const fnMatch = sqlNoComments.match(/CREATE OR REPLACE FUNCTION public\.fn_chairman_decide[\s\S]*?\$function\$;/);
    expect(fnMatch).not.toBeNull();
    const body = fnMatch[0];
    expect(body).toMatch(/IF p_action = 'rejected' AND v_has_venture AND v_decision_value = 'kill' THEN/);
  });

  test('two-sided contract, side (a): the kill-gate branch still writes the full kill record (workflow_status, killed_at, kill_reason)', () => {
    const fnMatch = sqlNoComments.match(/CREATE OR REPLACE FUNCTION public\.fn_chairman_decide[\s\S]*?\$function\$;/);
    const body = fnMatch[0];
    expect(body).toMatch(/workflow_status = 'killed'/);
    expect(body).toMatch(/killed_at = now\(\)/);
    expect(body).toMatch(/kill_reason = p_rationale/);
  });

  test('reject_chairman_decision gains the same type-aware guard fn_chairman_decide already had', () => {
    const fnMatch = sqlNoComments.match(/CREATE OR REPLACE FUNCTION public\.reject_chairman_decision[\s\S]*?\$function\$;/);
    expect(fnMatch).not.toBeNull();
    const body = fnMatch[0];
    expect(body).toMatch(/fn_chairman_decision_value\(v_decision_type, 'rejected'\)/);
    expect(body).toMatch(/IF v_venture_id IS NOT NULL AND v_decision_value = 'kill' THEN/);
  });

  test('reject_chairman_decision preserves its authorization guard verbatim', () => {
    const fnMatch = sqlNoComments.match(/CREATE OR REPLACE FUNCTION public\.reject_chairman_decision[\s\S]*?\$function\$;/);
    const body = fnMatch[0];
    expect(body).toMatch(/auth\.role\(\) = 'service_role' OR public\.fn_is_chairman\(\)/);
  });

  test('fn_write_kill_audit_trail still early-returns NULL when not a kill gate, now via the live helper', () => {
    const fnMatch = sqlNoComments.match(/CREATE OR REPLACE FUNCTION public\.fn_write_kill_audit_trail[\s\S]*?\$function\$;/);
    expect(fnMatch).not.toBeNull();
    const body = fnMatch[0];
    expect(body).toMatch(/v_is_kill_gate := public\.fn_is_kill_gate_stage\(p_lifecycle_stage\)/);
    expect(body).toMatch(/IF NOT v_is_kill_gate THEN\s*RETURN NULL;/);
  });

  test('kill_venture() is documented audited-clean, not silently omitted from this SD', () => {
    expect(sql).toContain('AUDITED, NOT MODIFIED');
    expect(sql).toContain('Neither Fault 1 nor Fault 2 applies');
  });

  test('chairman-gated ceremony header is present (staged, not applied, @approved-by placeholder)', () => {
    expect(sql).toContain('STAGED, NOT APPLIED');
    expect(sql).toContain('@approved-by: PENDING');
  });

  test('migration classifies TIER-2 (chairman-gated) via the shared classifier', async () => {
    const { classifyMigration } = await import('../../scripts/lib/migration-tier-classifier.mjs');
    const result = await classifyMigration(sql);
    expect(result.tier).toBe(2);
  });
});
