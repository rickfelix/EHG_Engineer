/**
 * Sweep classifier tests — SD-LEO-INFRA-CHAIRMAN-GAUGE-RLS-REPAIR-001 (FR-3 / TS-1).
 * Pure parts only (regex + classifier); the DB walk is exercised by running the script.
 */
import { describe, it, expect } from 'vitest';
import {
  LITERAL_EMAIL_RE,
  findLiteralEmailPolicies,
  GAUGE_TABLES,
} from '../../../scripts/rls/literal-email-policy-sweep.mjs';

const B2_QUAL = "((auth.jwt() ->> 'email'::text) = 'rick@emeraldholdingsgroup.com'::text)";
const ROLE_QUAL =
  "(EXISTS ( SELECT 1 FROM auth.users WHERE ((auth.uid() = users.id) AND ((users.raw_user_meta_data ->> 'role'::text) = ANY (ARRAY['admin'::text, 'chairman'::text])))))";

describe('literal-email policy sweep classifier', () => {
  it('flags the live B2 predicate shape (literal email in qual)', () => {
    const rows = [{ tablename: 'objectives', policyname: 'Chairman full access on objectives', qual: B2_QUAL, with_check: null }];
    expect(findLiteralEmailPolicies(rows)).toHaveLength(1);
  });

  it('flags a literal email hiding only in WITH CHECK', () => {
    const rows = [{ tablename: 't', policyname: 'p', qual: 'true', with_check: B2_QUAL }];
    expect(findLiteralEmailPolicies(rows)).toHaveLength(1);
  });

  it('does NOT flag the role-based replacement predicate', () => {
    const rows = [{ tablename: 'objectives', policyname: 'Chairman role access on objectives', qual: ROLE_QUAL, with_check: ROLE_QUAL }];
    expect(findLiteralEmailPolicies(rows)).toHaveLength(0);
  });

  it('does NOT flag policies that merely READ the jwt email claim (no hardcoded address)', () => {
    // Comparing the claim to a column or another expression is fine — only a literal
    // address on either side is the defect class.
    const rows = [
      { tablename: 't', policyname: 'p', qual: "((auth.jwt() ->> 'email'::text) = owner_email)", with_check: null },
      { tablename: 't2', policyname: 'p2', qual: "(auth.role() = 'service_role'::text)", with_check: 'true' },
    ];
    expect(findLiteralEmailPolicies(rows)).toHaveLength(0);
  });

  it('handles null/absent qual and with_check without throwing', () => {
    expect(findLiteralEmailPolicies([{ qual: null, with_check: null }, {}])).toHaveLength(0);
    expect(findLiteralEmailPolicies(null)).toHaveLength(0);
  });

  it('regex matches common literal-address shapes', () => {
    for (const s of [
      "'rick@emeraldholdingsgroup.com'",
      'x = someone.else+tag@sub.domain.co',
      '"quoted@example.io"',
    ]) {
      expect(LITERAL_EMAIL_RE.test(s)).toBe(true);
    }
    expect(LITERAL_EMAIL_RE.test("auth.jwt() ->> 'email'")).toBe(false);
  });

  it('gauge-table list covers the seven tables in the SD scope', () => {
    expect(GAUGE_TABLES).toEqual([
      'stage_executions',
      'objectives',
      'key_results',
      'kr_progress_snapshots',
      'monthly_ceo_reports',
      'sd_key_result_alignment',
      'strategic_vision',
    ]);
  });
});
