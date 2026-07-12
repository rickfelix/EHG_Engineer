import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Migration-pin — SD-FDBK-FIX-FEEDBACK-SELECT-FEEDBACK-001.
 *
 * Pins the RLS fix for the live cross-venture read gap on public.feedback
 * (select_feedback_policy was {authenticated} SELECT USING (true)). The unit
 * lane has no DB, so this pins the migration FILE: the scoped predicate must
 * survive verbatim, no unpredicated authenticated SELECT may reappear, and the
 * file must stay isolated from the sibling SD's anon policies.
 */

const RAW = readFileSync(
  join(process.cwd(), 'database/migrations/20260712_feedback_authenticated_select_scope.sql'),
  'utf8'
);
// Executable statements only — the header narrates the gap (quoting qual=true and
// the sibling policy names), so negative pins must ignore `--` comment lines.
const SQL = RAW.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

describe('feedback authenticated-SELECT scope migration (SD-FDBK-FIX-FEEDBACK-SELECT-FEEDBACK-001)', () => {
  it('TS-1: drops and recreates select_feedback_policy FOR SELECT TO authenticated', () => {
    expect(SQL).toMatch(/DROP POLICY IF EXISTS select_feedback_policy ON public\.feedback/);
    expect(SQL).toMatch(/CREATE POLICY select_feedback_policy ON public\.feedback\s+FOR SELECT TO authenticated/);
  });

  it('TS-2: scoped USING predicate carries BOTH clauses; no USING (true) survives', () => {
    const using = SQL.match(/USING \(([\s\S]*?)\);/);
    expect(using).toBeTruthy();
    expect(using[1]).toContain("(feedback_type)::text LIKE 'user_%'");
    expect(using[1]).toContain('venture_id IS NOT NULL');
    expect(SQL).not.toMatch(/USING\s*\(\s*true\s*\)/i);
  });

  it('TS-3: sibling-scope isolation — anon and service_role policies never referenced', () => {
    for (const foreign of [
      'venture_user_select_feedback',
      'telegram_bot_select_feedback',
      'venture_user_insert_feedback',
      'telegram_bot_insert_feedback',
      'insert_feedback_policy',
      'update_feedback_policy',
      'delete_feedback_policy',
    ]) {
      expect(SQL, `${foreign} belongs to another owner`).not.toContain(foreign);
    }
    // No role broadening: only the authenticated SELECT is (re)created.
    expect(SQL).not.toMatch(/TO (anon|public)\b/);
    expect(SQL.match(/CREATE POLICY/g)).toHaveLength(1);
  });

  it('TS-4: tier-2 chairman-gate markers present; RLS never disabled; single transaction', () => {
    expect(RAW).toMatch(/TIER-2 \(NON-ADDITIVE: DROP POLICY\) — CHAIRMAN-GATED APPLY/);
    expect(RAW).toMatch(/@approved-by/); // ceremony documented; scribe fills the attestation at approval
    expect(SQL).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
    expect(SQL).toMatch(/^BEGIN;$/m);
    expect(SQL).toMatch(/^COMMIT;$/m);
  });

  it('TS-2b: no WITH CHECK added (SELECT policies carry none)', () => {
    expect(SQL).not.toMatch(/WITH CHECK/i);
  });
});
