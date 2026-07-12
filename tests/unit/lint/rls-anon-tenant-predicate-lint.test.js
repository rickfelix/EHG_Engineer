/**
 * SD-APEXNICHE-AI-MAN-FIX-FIX-CROSS-TENANT-001 FR-4 — RLS anon-role
 * tenant-predicate-sufficiency lint.
 * Extended to the authenticated role by SD-LEO-FIX-FINGERPRINT-CRITICAL-SECURITY-001 FR-3.
 *
 * Pins detection of all real historical instances of this bug class:
 *   - companies table (SD-LEO-GEN-SCOPE-ANON-KEY-001): USING (true), a
 *     blanket unconditional anon SELECT.
 *   - feedback table anon policy (SD-APEXNICHE-AI-MAN-FIX-FIX-CROSS-TENANT-001):
 *     USING references venture_id but never binds it to the caller's identity.
 *   - feedback table authenticated policy, pre-fix shape
 *     (SD-FDBK-FIX-FEEDBACK-SELECT-FEEDBACK-001): USING (true), unconditional
 *     for any logged-in user -- the lint's anon-only scope originally missed
 *     this class entirely.
 *   - feedback table authenticated policy, post-first-fix shape
 *     (SD-LEO-FIX-FINGERPRINT-CRITICAL-SECURITY-001): venture_id referenced
 *     but not caller-bound -- same unbound_tenant_predicate shape as the anon
 *     instance, just on the authenticated role.
 * And confirms properly-scoped policies (auth.uid(), auth.jwt(), and the
 * fn_user_has_venture_access/fn_user_has_company_access SECURITY DEFINER
 * helper idiom) pass clean.
 */
import { describe, it, expect } from 'vitest';
import { extractPolicies, classifyViolation, lintSql } from '../../../scripts/lint/rls-anon-tenant-predicate-lint.mjs';

describe('extractPolicies — parses CREATE POLICY statements', () => {
  it('parses a bare-identifier policy name', () => {
    const sql = 'CREATE POLICY my_policy ON public.foo FOR SELECT TO anon USING (true);';
    const [p] = extractPolicies(sql);
    expect(p.name).toBe('my_policy');
    expect(p.table).toBe('foo');
    expect(p.cmd).toBe('SELECT');
    expect(p.roles).toEqual(['anon']);
    expect(p.using).toBe('true');
  });

  it('parses a double-quoted policy name with spaces (the real companies-table incident shape)', () => {
    const sql = 'CREATE POLICY "Anon read companies" ON public.companies FOR SELECT TO anon USING (true);';
    const [p] = extractPolicies(sql);
    expect(p.name).toBe('Anon read companies');
    expect(p.table).toBe('companies');
  });

  it('parses a multi-line, multi-condition USING clause with nested parens', () => {
    const sql = `
CREATE POLICY venture_user_select_feedback
  ON public.feedback
  FOR SELECT
  TO anon
  USING (
    feedback_type LIKE 'user_%'
    AND venture_id IS NOT NULL
  );`;
    const [p] = extractPolicies(sql);
    expect(p.using).toContain('venture_id IS NOT NULL');
  });

  it('does not confuse an INSERT policy WITH CHECK for USING', () => {
    const sql = `
CREATE POLICY venture_user_insert_feedback
  ON public.feedback
  FOR INSERT
  TO anon
  WITH CHECK (
    feedback_type LIKE 'user_%'
    AND venture_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.ventures v WHERE v.id = venture_id)
    AND NOT public.check_feedback_rate_limit(venture_id)
  );`;
    const [p] = extractPolicies(sql);
    expect(p.cmd).toBe('INSERT');
    expect(p.using).toBeNull();
    expect(p.withCheck).toContain('venture_id');
  });

  it('extracts multiple CREATE POLICY statements from one file', () => {
    const sql = `
CREATE POLICY a ON public.t1 FOR SELECT TO anon USING (true);
CREATE POLICY b ON public.t2 FOR SELECT TO authenticated USING (owner_id = auth.uid());
`;
    const policies = extractPolicies(sql);
    expect(policies).toHaveLength(2);
    expect(policies.map((p) => p.name)).toEqual(['a', 'b']);
  });
});

describe('classifyViolation — the two real historical instance shapes', () => {
  it('AC: flags the companies-table shape (unconditional USING (true))', () => {
    const [p] = extractPolicies(
      'CREATE POLICY "Anon read companies" ON public.companies FOR SELECT TO anon USING (true);'
    );
    expect(classifyViolation(p)).toBe('unconditional_anon_select');
  });

  it('AC: flags the feedback-table shape (tenant column referenced, not identity-bound)', () => {
    const [p] = extractPolicies(
      'CREATE POLICY venture_user_select_feedback ON public.feedback FOR SELECT TO anon USING (feedback_type LIKE \'user_%\' AND venture_id IS NOT NULL);'
    );
    expect(classifyViolation(p)).toBe('unbound_tenant_predicate');
  });

  it('AC: a properly-scoped, auth.uid()-bound policy passes clean', () => {
    const [p] = extractPolicies(
      'CREATE POLICY good ON public.orders FOR SELECT TO anon USING (venture_id = auth.uid());'
    );
    expect(classifyViolation(p)).toBeNull();
  });

  it('AC (FR-3): flags an authenticated-role unconditional USING (true) (the feedback-table pre-fix shape, SD-FDBK-FIX-FEEDBACK-SELECT-FEEDBACK-001)', () => {
    const [p] = extractPolicies(
      'CREATE POLICY select_feedback_policy ON public.feedback FOR SELECT TO authenticated USING (true);'
    );
    expect(classifyViolation(p)).toBe('unconditional_anon_select');
  });

  it('AC (FR-3): flags an authenticated-role policy referencing a tenant column without caller-binding (this SD\'s own finding)', () => {
    const [p] = extractPolicies(
      'CREATE POLICY select_feedback_policy ON public.feedback FOR SELECT TO authenticated USING (feedback_type LIKE \'user_%\' AND venture_id IS NOT NULL);'
    );
    expect(classifyViolation(p)).toBe('unbound_tenant_predicate');
  });

  it('AC (FR-3): does NOT flag an authenticated-role policy bound via fn_user_has_venture_access (this SD\'s own fix)', () => {
    const [p] = extractPolicies(
      "CREATE POLICY select_feedback_policy ON public.feedback FOR SELECT TO authenticated USING (feedback_type LIKE 'user_%' AND venture_id IS NOT NULL AND fn_user_has_venture_access(venture_id));"
    );
    expect(classifyViolation(p)).toBeNull();
  });

  it('AC (FR-3): does NOT flag a policy bound via a user_company_access join subquery referencing auth.uid()', () => {
    const [p] = extractPolicies(
      'CREATE POLICY good ON public.modeling_requests FOR SELECT TO authenticated USING (company_id IN (SELECT company_id FROM user_company_access WHERE user_id = auth.uid() AND is_active));'
    );
    expect(classifyViolation(p)).toBeNull();
  });

  it('AC (FR-3): does NOT flag a policy bound via the JWT venture_id claim idiom', () => {
    const [p] = extractPolicies(
      "CREATE POLICY good ON public.ops_table FOR SELECT TO authenticated USING (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid);"
    );
    expect(classifyViolation(p)).toBeNull();
  });

  it('does not flag a role not in the scoped set (e.g. service_role)', () => {
    const [p] = extractPolicies(
      'CREATE POLICY svc ON public.feedback FOR SELECT TO service_role USING (true);'
    );
    expect(classifyViolation(p)).toBeNull();
  });

  it('does not flag an INSERT/UPDATE/DELETE policy referencing a tenant column (different risk class)', () => {
    const [p] = extractPolicies(
      'CREATE POLICY venture_user_insert_feedback ON public.feedback FOR INSERT TO anon WITH CHECK (venture_id IS NOT NULL);'
    );
    expect(classifyViolation(p)).toBeNull();
  });

  it('does not flag a policy with no USING clause at all', () => {
    const [p] = extractPolicies('CREATE POLICY x ON public.t FOR SELECT TO anon;');
    expect(p.using).toBeNull();
    expect(classifyViolation(p)).toBeNull();
  });
});

describe('lintSql — end-to-end scan with reporting', () => {
  it('AC: reports zero violations for a clean window (a well-scoped migration file)', () => {
    const sql = 'CREATE POLICY good ON public.orders FOR SELECT TO anon USING (venture_id = auth.uid());';
    expect(lintSql(sql, 'clean.sql')).toEqual([]);
  });

  it('reports the correct violationClass and message for each of the two known shapes', () => {
    const sql = `
CREATE POLICY "Anon read companies" ON public.companies FOR SELECT TO anon USING (true);
CREATE POLICY venture_user_select_feedback ON public.feedback FOR SELECT TO anon USING (feedback_type LIKE 'user_%' AND venture_id IS NOT NULL);
`;
    const violations = lintSql(sql, 'two-violations.sql');
    expect(violations).toHaveLength(2);
    expect(violations[0].violationClass).toBe('unconditional_anon_select');
    expect(violations[0].tenantColumn).toBeNull();
    expect(violations[1].violationClass).toBe('unbound_tenant_predicate');
    expect(violations[1].tenantColumn).toBe('venture_id');
  });

  it('the real 20260401_venture_user_feedback_channel.sql migration flags ONLY the SELECT policy, not the sibling INSERT policy', () => {
    const sql = `
CREATE POLICY venture_user_insert_feedback
  ON public.feedback
  FOR INSERT
  TO anon
  WITH CHECK (
    feedback_type LIKE 'user_%'
    AND venture_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.ventures v WHERE v.id = venture_id AND v.deleted_at IS NULL)
    AND NOT public.check_feedback_rate_limit(venture_id)
  );

CREATE POLICY venture_user_select_feedback
  ON public.feedback
  FOR SELECT
  TO anon
  USING (
    feedback_type LIKE 'user_%'
    AND venture_id IS NOT NULL
  );`;
    const violations = lintSql(sql, 'feedback-migration.sql');
    expect(violations).toHaveLength(1);
    expect(violations[0].policyName).toBe('venture_user_select_feedback');
  });
});
