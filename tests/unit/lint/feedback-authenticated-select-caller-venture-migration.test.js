/**
 * SD-LEO-FIX-FINGERPRINT-CRITICAL-SECURITY-001 US-004/US-005 — regression
 * tests for the staged migration's policy definition. The migration is
 * deliberately STAGED (not auto-applied -- chairman-gated, same risk class
 * as the sibling anon-role DROP), so these are structural/SQL-text tests of
 * the committed policy definition, not live-DB behavioral tests. Live
 * behavioral verification (chairman sees all ventures; a scoped user sees
 * only their own) is deferred to the migration's own Apply Runbook step 4,
 * executed at apply time -- see the migration file's header comment.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { extractPolicies, classifyViolation } from '../../../scripts/lint/rls-anon-tenant-predicate-lint.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = path.resolve(
  __dirname,
  '../../../database/migrations/20260712_feedback_authenticated_select_caller_venture_STAGED.sql'
);

function loadPolicy() {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  const policies = extractPolicies(sql);
  const policy = policies.find((p) => p.name === 'select_feedback_policy');
  if (!policy) throw new Error('select_feedback_policy not found in migration SQL');
  return policy;
}

describe('US-001/US-002: migration ships the caller-venture predicate, staged', () => {
  it('the migration is explicitly marked STAGED / NOT APPLIED in its header', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8');
    expect(sql).toMatch(/STAGED\s*--\s*NOT APPLIED/i);
    expect(sql).toMatch(/CHAIRMAN-GATED APPLY/i);
    expect(sql).toMatch(/APPLY RUNBOOK/i);
  });

  it('the policy targets the authenticated role for SELECT on public.feedback', () => {
    const p = loadPolicy();
    expect(p.table).toBe('feedback');
    expect(p.cmd).toBe('SELECT');
    expect(p.roles).toEqual(['authenticated']);
  });

  it('the existing feedback_type/venture_id guard is preserved (no widening)', () => {
    const p = loadPolicy();
    expect(p.using).toMatch(/feedback_type.*LIKE.*'user_%'/i);
    expect(p.using).toMatch(/venture_id IS NOT NULL/i);
  });
});

describe('US-004: chairman/oversight bypass is preserved', () => {
  it('the predicate calls fn_user_has_venture_access(venture_id), which returns true unconditionally for chairman/admin/owner', () => {
    const p = loadPolicy();
    expect(p.using).toMatch(/fn_user_has_venture_access\s*\(\s*venture_id\s*\)/i);
  });
});

describe('US-005: cross-venture read is blocked for scoped (non-chairman) users', () => {
  it('the policy no longer classifies as an unbound_tenant_predicate violation under the (now authenticated-aware) lint', () => {
    const p = loadPolicy();
    expect(classifyViolation(p)).toBeNull();
  });

  it('control: the migration this SD supersedes (pre-caller-venture-binding shape) WOULD have been flagged', () => {
    const [p] = extractPolicies(
      "CREATE POLICY select_feedback_policy ON public.feedback FOR SELECT TO authenticated USING (((feedback_type)::text LIKE 'user_%') AND (venture_id IS NOT NULL));"
    );
    expect(classifyViolation(p)).toBe('unbound_tenant_predicate');
  });
});
