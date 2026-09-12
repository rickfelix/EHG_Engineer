// SD-LEO-INFRA-CHAIRMAN-ALL-DECISION-001 — chairman_all_decision_signals snoozed-feedback
// exclusion migration.
//
// WHAT THESE TESTS CAN AND CANNOT PROVE. This migration is TIER-2 (CREATE OR REPLACE VIEW) and
// is never applied by the builder, so no test here proves the view returns correct rows from an
// assertion alone — that requires the chairman's own apply ceremony against live data. What these
// tests DO pin: the ONLY behavioral change vs. the live view captured at claim time is the added
// snoozed_until exclusion on the flag_review (feedback) branch — every other branch, and every
// other clause of that same branch's WHERE, stays byte-identical, so a future edit cannot silently
// widen or narrow this migration's actual blast radius.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MIGRATION = path.join(root, 'database/chairman-gated/20260912_chairman_all_decision_signals_snoozed_exclusion.sql');
const DOWN = path.join(root, 'database/chairman-gated/20260912_chairman_all_decision_signals_snoozed_exclusion_DOWN.sql');

const sql = fs.readFileSync(MIGRATION, 'utf8');
const statement = sql.slice(sql.indexOf('CREATE OR REPLACE VIEW public.chairman_all_decision_signals'), sql.lastIndexOf('COMMIT;'));

/** The flag_review (feedback) branch only. */
const flagReviewBranch = (() => {
  const anchor = statement.indexOf('FROM feedback f');
  const start = statement.lastIndexOf('UNION ALL', anchor);
  const nextUnion = statement.indexOf('UNION ALL', anchor);
  return statement.slice(start, nextUnion === -1 ? statement.length : nextUnion);
})();

describe('SNOOZE-1: the one intended change — flag_review branch gains the snoozed_until exclusion', () => {
  it('WHERE clause adds snoozed_until IS NULL OR snoozed_until <= now()', () => {
    expect(flagReviewBranch).toMatch(/f\.snoozed_until IS NULL OR f\.snoozed_until <= now\(\)/);
  });

  it('the new clause is ANDed onto the existing predicate, not a replacement (severity/resolved_at/status conditions still present)', () => {
    expect(flagReviewBranch).toMatch(/f\.severity::text = ANY \(ARRAY\['critical'::text, 'high'::text\]\)/);
    expect(flagReviewBranch).toMatch(/f\.resolved_at IS NULL/);
    expect(flagReviewBranch).toMatch(/<> ALL \(ARRAY\['resolved'::text, 'wont_fix'::text, 'in_progress'::text, 'duplicate'::text, 'invalid'::text\]\)/);
  });

  it('the snoozed_until clause reads timestamp comparison (>= safety for NULL), not a boolean flag', () => {
    // Guards against a future "simplification" to a bare `snoozed_until IS NULL` (which would
    // wrongly keep excluding a row forever after its snooze genuinely expired, since the sweep
    // that clears the column to NULL is not guaranteed to have run yet).
    expect(flagReviewBranch).not.toMatch(/f\.snoozed_until IS NULL\)\s*$/m);
    expect(flagReviewBranch).toMatch(/snoozed_until <= now\(\)/);
  });
});

describe('SNOOZE-2: no collateral damage — every other branch unchanged', () => {
  it('keeps all seven source branches', () => {
    expect((statement.match(/UNION ALL/g) || []).length).toBe(6); // 6 joins => 7 branches
  });

  it('states security_invoker explicitly', () => {
    expect(statement).toMatch(/WITH \(security_invoker = on\) AS/);
  });

  it('targets chairman_all_decision_signals, not the wrapper', () => {
    expect(statement).toMatch(/CREATE OR REPLACE VIEW public\.chairman_all_decision_signals/);
    expect(statement).not.toMatch(/CREATE OR REPLACE VIEW public\.chairman_unified_decisions/);
  });

  it('the chairman_approval (branch 4) HELD/decided_at/decided_by logic from the prior merge survives untouched', () => {
    expect(statement).toMatch(/\(\(cd\.brief_data -> 'hold'::text\) ->> 'ratified'::text\) = 'true'::text/);
    expect(statement).toMatch(/cd\.decided_by_user_id AS decided_by/);
    expect(statement).toMatch(/'decided_by_label', cd\.decided_by/);
  });

  it('no other branch mentions snoozed_until', () => {
    const others = statement.replace(flagReviewBranch, '');
    expect(others).not.toMatch(/snoozed_until/);
  });
});

describe('SNOOZE-3: staging discipline', () => {
  it('lives outside every auto-scanned migration directory', () => {
    expect(MIGRATION).toContain('chairman-gated');
    for (const scanned of ['database/migrations', 'database/manual-updates', 'supabase/migrations']) {
      expect(fs.existsSync(path.join(root, scanned, path.basename(MIGRATION)))).toBe(false);
    }
  });

  it('carries the ceremony marker: the PENDING placeholder while staged, or the chairman @approved-by attestation once the apply ceremony scribed it', () => {
    // The header is the apply-ceremony marker, not apply state: pre-ceremony it reads
    // "@approved-by: <PENDING ...>"; the ceremony replaces it with the chairman's address
    // (2026-09-12 ceremony d, chairman SMS "A apply now"). Either form is the staged shape;
    // a file with NO @approved-by line at all is the defect this test guards.
    expect(sql).toMatch(/@approved-by: (<PENDING|[A-Za-z0-9._-]+@[A-Za-z0-9.-]+)/);
  });

  it('ships a DOWN file restoring the pre-change definition (no snoozed_until exclusion in the actual view body)', () => {
    const down = fs.readFileSync(DOWN, 'utf8');
    const downStatement = down.slice(down.indexOf('CREATE OR REPLACE VIEW public.chairman_all_decision_signals'), down.lastIndexOf('COMMIT;'));
    expect(downStatement).not.toMatch(/snoozed_until/);
    expect((downStatement.match(/UNION ALL/g) || []).length).toBe(6);
    expect(downStatement).toMatch(/WITH \(security_invoker = on\) AS/);
  });
});
