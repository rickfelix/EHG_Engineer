/**
 * Regression test for QF-20260529-237 (feedback a78478f9 + 03ccc4d4).
 *
 * Two closed-enumeration patterns in config/review-critical-findings.json produced
 * false-positive CRITICAL merge-blocks:
 *   - CRIT-005 data_loss: the negative lookahead allow-listed only `.eq`, so a
 *     `.delete()` scoped by `.like()`/`.in()` (test teardown) was flagged.
 *   - CRIT-002 sql_injection: the keyword alternation had no word boundaries, so the
 *     substring INSERT inside the prose word "inserts" matched after an interpolation.
 * The fix broadens the delete allow-list to all supabase filter methods and
 * word-boundaries the SQL keyword alternation. These tests pin both directions:
 * the false positives no longer fire AND genuine signatures still fire.
 */
import { describe, it, expect } from 'vitest';
import { checkCriticalFindings } from '../../lib/ship/review-gate.js';

const names = (diff) => checkCriticalFindings(diff).findings.map((f) => f.name);

describe('review-gate closed-enum false-positive fixes (a78478f9 + 03ccc4d4)', () => {
  // CRIT-005 data_loss — scoped deletes must NOT be flagged; unscoped MUST be.
  it('does NOT flag a .delete() scoped by .like() (the witnessed test-teardown FP)', () => {
    expect(names("+ await sb.from('caps').delete().like('capability_key', 'TEST-%')")).not.toContain('data_loss');
  });
  it('does NOT flag a .delete() scoped by .in()', () => {
    expect(names("+ await sb.from('caps').delete().in('id', staleIds)")).not.toContain('data_loss');
  });
  it('preserves the original .eq() allow-list', () => {
    expect(names("+ await sb.from('caps').delete().eq('id', 1)")).not.toContain('data_loss');
  });
  it('STILL flags a truly unscoped .delete() (no filter)', () => {
    expect(names("+ await sb.from('caps').delete()")).toContain('data_loss');
  });

  // CRIT-002 sql_injection — prose must NOT match; interpolated SQL keyword MUST.
  it('does NOT flag the prose word "inserts" after an interpolation', () => {
    expect(names('+ console.log(`Backfilled ${count} inserts complete`)')).not.toContain('sql_injection');
  });
  it('STILL flags an interpolated SQL keyword (real injection shape)', () => {
    expect(names('+ const sql = `${prefix} DELETE FROM users`;')).toContain('sql_injection');
  });

  // CRIT-002 sql_injection — SD-LEO-INFRA-FIX-WINDOWS-SESSION-001 (PostgREST `select=`
  // query-string parameter false positive). A `?`/`&`-prefixed REST query param whose
  // name happens to spell a SQL keyword (e.g. `select=pid`) is a REST convention, not SQL.
  it('does NOT flag a PostgREST `&select=` query param after an interpolation', () => {
    expect(names(
      '+ const url = `${baseUrl}?session_id=eq.${encodeURIComponent(id)}&select=pid`;'
    )).not.toContain('sql_injection');
  });
  it('does NOT flag a PostgREST `?select=` query param (leading separator)', () => {
    expect(names('+ const url = `${base}?select=${cols}`;')).not.toContain('sql_injection');
  });
  it('STILL flags an interpolated SQL keyword immediately preceded by a non-separator character', () => {
    expect(names('+ const sql = `${schema}.DELETE FROM t`;')).toContain('sql_injection');
  });

  // CRIT-002 sql_injection pattern 2 (string-concat) — QF-20260711-047.
  // The unified-diff added-line '+' marker sits at column 0 immediately before the
  // quoted keyword on parameterized-SQL lines, so `\+\s*['"]\bSELECT` matched the diff
  // markup itself. A positive lookbehind now requires a non-newline char before the '+',
  // which the column-0 diff marker never has, while a genuine concat operator always does.
  it('does NOT flag a diff-added parameterized-SQL line whose content starts with a quoted keyword', () => {
    expect(names('+    "SELECT * FROM users WHERE id = %s",')).not.toContain('sql_injection');
  });
  it('does NOT flag a diff-added line with a leading-quote INSERT (parameterized)', () => {
    expect(names('+  "INSERT INTO t (a) VALUES (?)"')).not.toContain('sql_injection');
  });
  it('STILL flags a genuine mid-line string-concat SQL (real injection shape)', () => {
    expect(names('+ const q = base + "SELECT * FROM users WHERE id = " + id;')).toContain('sql_injection');
  });
  it('STILL flags concat SQL even when the concat operator is space-padded', () => {
    expect(names('+ query = prefix + "DELETE FROM sessions";')).toContain('sql_injection');
  });

  // CRIT-002 / CRIT-004 test-fixture path exemption — QF-20260711-047.
  // Hostile-input fixtures legitimately embed injection/destructive-schema strings as
  // test DATA; a per-file diff header under tests/ exempts those two enumerations only.
  const diffFor = (path, line) =>
    `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1,0 +1,1 @@\n${line}`;
  it('does NOT flag CRIT-002 on a genuine concat inside a tests/ fixture file', () => {
    expect(names(diffFor('tests/fixtures/hostile-sql.test.js', '+ const q = base + "SELECT * FROM users";')))
      .not.toContain('sql_injection');
  });
  it('does NOT flag CRIT-004 (DROP TABLE) inside a .test. fixture file', () => {
    expect(names(diffFor('apps/venture/src/db.test.ts', '+ await run("DROP TABLE users");')))
      .not.toContain('schema_corruption');
  });
  it('STILL flags CRIT-002 on the SAME concat when the file is NOT a test path', () => {
    expect(names(diffFor('src/db/query-builder.js', '+ const q = base + "SELECT * FROM users";')))
      .toContain('sql_injection');
  });
  it('STILL flags CRIT-001 (hardcoded secret) even inside a test file (not exempt)', () => {
    expect(names(diffFor('tests/setup.test.js', '+ const key = "sk-live-abc123def456ghi789jkl012mno345";')))
      .toContain('hardcoded_secret');
  });

  // CRIT-003 auth_bypass test-fixture exemption — QF-20260712-610.
  // Witnessed live on PR #6029: a migration-pin test's NEGATIVE guard assertion
  // (`not.toMatch(/DISABLE ROW LEVEL SECURITY/i)`) matched `disable.*(?:auth|rls|security)`
  // and CRITICAL-blocked the PR whose test FORBIDS disabling RLS.
  it('does NOT flag CRIT-003 on a guard assertion inside a tests/ file', () => {
    expect(names(diffFor('tests/unit/feedback-select-policy-migration.test.js',
      '+    expect(SQL).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);')))
      .not.toContain('auth_bypass');
  });
  it('STILL flags CRIT-003 on the SAME string when the file is NOT a test path', () => {
    expect(names(diffFor('database/migrations/20260712_bad.sql',
      '+ ALTER TABLE feedback DISABLE ROW LEVEL SECURITY;')))
      .toContain('auth_bypass');
  });

  // splitDiffByFile header-spoof hardening — QF-20260712-610 (adversarial-review finding).
  // In-hunk added content rendering as `+++ b/tests/...` must NOT reassign the segment
  // path (which would leak the test-fixture exemption to the rest of a non-test file).
  it('does NOT let in-hunk `+++ b/tests/...` content spoof a test path for later lines', () => {
    const spoof = [
      'diff --git a/lib/db/policy.js b/lib/db/policy.js',
      '--- a/lib/db/policy.js',
      '+++ b/lib/db/policy.js',
      '@@ -1,0 +1,2 @@',
      '+++ b/tests/evil.test.js', // added content line `++ b/tests/evil.test.js`
      '+ await run("ALTER TABLE t DISABLE ROW LEVEL SECURITY");',
    ].join('\n');
    expect(names(spoof)).toContain('auth_bypass');
  });

  // CRIT-007 service_role_exposure — QF-20260720-296. `NEXT_PUBLIC.*SERVICE_ROLE` used
  // .* which matched ACROSS two separate, unrelated env var references on the same line,
  // not a single NEXT_PUBLIC_-prefixed service-role variable.
  it('does NOT flag the pervasive createClient(SUPABASE_URL||NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) boilerplate', () => {
    expect(names(
      '+const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);'
    )).not.toContain('service_role_exposure');
  });
  it('does NOT flag NEXT_PUBLIC_SUPABASE_ANON_KEY co-occurring with an unrelated SERVICE_ROLE reference', () => {
    expect(names(
      '+ const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;'
    )).not.toContain('service_role_exposure');
  });
  it('STILL flags a genuine NEXT_PUBLIC_-prefixed service-role variable name', () => {
    expect(names('+ const key = process.env.NEXT_PUBLIC_SERVICE_ROLE_KEY;')).toContain('service_role_exposure');
  });
  it('STILL flags a genuine NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY-style variable name', () => {
    expect(names('+ const key = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;')).toContain('service_role_exposure');
  });
  it('STILL flags a genuine VITE_-prefixed service-role variable name', () => {
    expect(names('+ const key = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;')).toContain('service_role_exposure');
  });
  it('does NOT flag co-occurring VITE_SUPABASE_URL and an unrelated SERVICE_ROLE reference', () => {
    expect(names(
      '+ const sb = createClient(import.meta.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);'
    )).not.toContain('service_role_exposure');
  });
});
