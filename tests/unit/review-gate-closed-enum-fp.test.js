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

  // CRIT-002 sql_injection pattern 1 -- QF-20260816-154. The keyword match is
  // case-insensitive ('gi' flags), so the bare word DELETE collides with the ubiquitous
  // `--delete-branch` CLI flag -- any `${...}` interpolation followed later on the line by
  // `--delete-branch` false-positived (witnessed 18x in PR #7146, zero genuine matches).
  it('does NOT flag an interpolated gh CLI invocation using --delete-branch', () => {
    expect(names(
      '+ console.log(`node scripts/gh-merge-safe.mjs ${prNumber} --merge --delete-branch`);'
    )).not.toContain('sql_injection');
  });
  it('does NOT flag --delete-branch chained after multiple interpolations', () => {
    expect(names(
      '+ const cmd = `gh pr merge ${pr.number} --repo ${pr.repo} --merge --delete-branch`;'
    )).not.toContain('sql_injection');
  });
  it('STILL flags a genuine interpolated DELETE immediately preceded by a hyphen-free context', () => {
    expect(names('+ const sql = `${userId} + "DELETE FROM users"`;')).toContain('sql_injection');
  });
  it('STILL flags the original UPDATE/DROP/ALTER shapes this pattern targets', () => {
    expect(names('+ const sql = `${prefix} UPDATE accounts SET x=1`;')).toContain('sql_injection');
    expect(names('+ const sql = `${prefix} DROP TABLE sessions`;')).toContain('sql_injection');
  });

  // QF-20260818-651 -- diff-polarity awareness. Every CRIT pattern is a presence
  // detector; scanning REMOVED or unchanged CONTEXT lines is a category error (a
  // line being deleted, or left untouched, cannot introduce a NEW vulnerability).
  // 5th+ confirmed occurrence: PR #7030 (CRIT-003 on a CONTEXT line), PR #7155
  // (CRIT-004 on a REMOVED line), PR #7244 (CRIT-006 on a REMOVED line, the
  // triggering instance -- a deleted comment mentioning SUPABASE_SERVICE_ROLE_KEY
  // incidentally contained the identifier createSupabaseServiceClient, matching
  // CRIT-006's `service_role_key.*(?:client|browser|frontend)` pattern).
  it('does NOT flag a REMOVED line matching a CRIT pattern (the PR #7244 shape)', () => {
    expect(names(
      "- 'SUPABASE_SERVICE_ROLE_KEY, used via createSupabaseServiceClient helper.',"
    )).not.toContain('permission_escalation');
  });
  it('does NOT flag an unchanged CONTEXT line matching a CRIT pattern (the PR #7030 shape)', () => {
    expect(names(
      '  const disableAuthForTesting = true; // disable rls checks locally'
    )).not.toContain('auth_bypass');
  });
  it('STILL flags the identical construct when it is an ADDED line', () => {
    expect(names(
      '+ const disableAuthForTesting = true; // disable rls checks locally'
    )).toContain('auth_bypass');
  });
  it('STILL flags a genuine ADDED CRIT-006 permission-escalation shape', () => {
    expect(names('+ await sb.rpc(\'exec_sql\', { sql: "GRANT ALL ON feedback TO anon" });'))
      .toContain('permission_escalation');
  });

  // QF-20260818-024 -- combined-diff (--cc) polarity-column width. QF-20260818-651's
  // width-1 rule (`startsWith('+')`) FAILED OPEN on combined-diff format (git's
  // default for `git show <merge-sha>` on a 2+-parent merge): a line added relative
  // to only ONE parent renders with a leading SPACE before the '+' (e.g. ' +code'
  // for a 2-parent merge), so `startsWith('+')` was false and a genuine finding was
  // silently dropped -- worse in kind than the false positives QF-651 fixed (a false
  // positive is noisy; a fail-open says PASS on a real hit). Confirmed by rca-agent
  // independently re-diagnosing QF-651's own fix. Coordinator ruling 9933a4cb:
  // "combined-diff polarity-column semantics + --cc fixture + consumer audit".
  //
  // Real combined-diff file headers are `diff --cc <path>` (a SINGLE path, no
  // a/ b/ pair) -- NOT `diff --git a/... b/...` (VALIDATION finding, evidence
  // aca26942, confirmed against real `git show --cc` output on a real 2-parent
  // merge fixture). Using the wrong header shape here would test a diff format
  // git never actually emits.
  const ccDiffFor = (path, hunkLines) =>
    `diff --cc ${path}\nindex 1111111,2222222..3333333\n--- a/${path}\n+++ b/${path}\n@@@ -1,3 -1,3 +1,4 @@@\n${hunkLines}`;

  it('FLAGS a line added relative to only ONE merge parent (the fail-open shape, 2-parent width)', () => {
    // Column 1 (parent 1): ' ' unchanged. Column 2 (parent 2): '+' new relative to
    // parent 2. Pre-fix: startsWith('+') is false (leading char is a space) -> dropped.
    expect(names(ccDiffFor('config.js', ' +await sb.rpc(\'exec_sql\', { sql: "GRANT ALL ON feedback TO anon" });')))
      .toContain('permission_escalation');
  });

  it('FLAGS a line added relative to BOTH merge parents (brand-new, width-2 "++")', () => {
    expect(names(ccDiffFor('config.js', '++await sb.rpc(\'exec_sql\', { sql: "GRANT ALL ON feedback TO anon" });')))
      .toContain('permission_escalation');
  });

  it('does NOT flag a combined-diff line that is pure CONTEXT in both parents ("  ")', () => {
    expect(names(ccDiffFor('config.js', '  const disableAuthForTesting = true; // disable rls checks locally')))
      .not.toContain('auth_bypass');
  });

  it('does NOT flag a combined-diff line REMOVED relative to a parent ("- ")', () => {
    expect(names(ccDiffFor('config.js', "- 'SUPABASE_SERVICE_ROLE_KEY, used via createSupabaseServiceClient helper.',")))
      .not.toContain('permission_escalation');
  });

  // CRIT-003 auth_bypass -- SD-LEO-INFRA-CHRONIC-RED-GUARD-001. 'disable' matched inside
  // the compound noun-phrase 'rls_disabled_in_public' / 'RLS-disabled' (the Supabase
  // database-linter's own official finding-type name), with 'security'/'rls' reappearing
  // later on the same long prose line to satisfy the '.*' suffix. State-descriptor compound
  // (term BEFORE 'disable[d]', hyphen/underscore-joined), not the imperative-verb danger
  // shape ('disable RLS'), which must still fire.
  it('does NOT flag prose naming the rls_disabled_in_public linter finding by its official name', () => {
    expect(names(
      "+ summary: 'The sentinel's live finding breakdown: 12 rls_disabled_in_public tables, 2 function_search_path_mutable SECURITY DEFINER functions'"
    )).not.toContain('auth_bypass');
  });
  it('does NOT flag prose describing "RLS-disabled tables" as a finding', () => {
    expect(names(
      '+  *    RLS-disabled tables, 1 sensitive-column exposure, 2 mutable-search-path SECURITY DEFINER'
    )).not.toContain('auth_bypass');
  });
  it('STILL flags the imperative "disable RLS" shape (term AFTER disable, not compound)', () => {
    expect(names('+ ALTER TABLE feedback DISABLE ROW LEVEL SECURITY;')).toContain('auth_bypass');
  });
  it('STILL flags "// disable rls checks locally" (disable not preceded by a term-hyphen compound)', () => {
    expect(names(
      '+ const disableAuthForTesting = true; // disable rls checks locally'
    )).toContain('auth_bypass');
  });

  // CRIT-006 permission_escalation -- SD-LEO-INFRA-CHRONIC-RED-GUARD-001. 'service_role_key.*client'
  // matched the safe, common backend idiom '<...>_SERVICE_ROLE_KEY client' ('client' as a noun
  // meaning "an SDK client object built with the key"), not the key being sent TO a
  // browser/frontend client.
  it('does NOT flag "the explicit SUPABASE_SERVICE_ROLE_KEY client" (safe backend-client noun phrase)', () => {
    expect(names(
      '+    "reason": "Service-role-only consumer via scripts/foo.mjs\'s explicit SUPABASE_SERVICE_ROLE_KEY client. Service_role bypasses RLS unconditionally"'
    )).not.toContain('permission_escalation');
  });
  it('STILL flags the service role key handed to a browser-facing sendToClient call', () => {
    expect(names(
      '+ const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY; sendToClient(serviceRoleKey);'
    )).toContain('permission_escalation');
  });
  it('STILL flags the service role key assigned onto window with a browser comment', () => {
    expect(names(
      '+ window.serviceRoleClient = createClient(url, service_role_key); // expose to browser'
    )).toContain('permission_escalation');
  });
  it('STILL flags the service role key returned straight to the frontend', () => {
    expect(names(
      '+ return { service_role_key: key }; // sent straight to the frontend'
    )).toContain('permission_escalation');
  });

  it('sets inHunk on a combined-diff header, closing the sibling +++-spoof gap for the whole file', () => {
    // Without inHunk recognizing '@@@', a subsequent in-hunk raw line that reads
    // '+++ b/tests/x' (2-wide polarity '++' immediately followed by content starting
    // '+ b/tests/x') would be honored as a real path header (leaking the test-fixture
    // exemption onto the rest of a genuinely non-test file). The REAL header above
    // sets the path to src/query.js (not a test path); confirm CRIT-002 still fires
    // on the genuine payload line that follows the spoof attempt.
    const spoofed = [
      'diff --cc src/query.js',
      'index 1111111,2222222..3333333',
      '--- a/src/query.js',
      '+++ b/src/query.js',
      '@@@ -1,2 -1,2 +1,3 @@@',
      '+++ b/tests/spoof.test.js',
      '++const q = base + "SELECT * FROM users";',
    ].join('\n');
    expect(names(spoofed)).toContain('sql_injection');
  });

  // FIX-2 regression tests (VALIDATION finding, evidence aca26942, real-git-fixture-
  // proven): the SD's own first pass introduced a genuine multi-file segment-collapse
  // regression, and left the width>=2 "+++"-prefixed-content case fail-open.

  it('REGRESSION GUARD: a multi-file combined diff keeps each file in its own segment (test-exemption does not leak across files)', () => {
    // File 1 (test-exempt path) comes FIRST; file 2 (non-test, carries a genuine
    // CRIT-004 payload) comes SECOND. Pre-FIX-2: unrecognized 'diff --cc' boundaries
    // meant inHunk never reset after file 1's hunk, so file 2's own '+++ b/' header
    // was suppressed (still "in a hunk") and the whole diff collapsed onto file 1's
    // test-exempt path -- silently exempting file 2's real payload.
    const multiFile = [
      'diff --cc a.test.js',
      'index 1111111,2222222..3333333',
      '--- a/a.test.js',
      '+++ b/a.test.js',
      '@@@ -1,1 -1,1 +1,2 @@@',
      '++const ok = true;',
      'diff --cc src/danger.js',
      'index 4444444,5555555..6666666',
      '--- a/src/danger.js',
      '+++ b/src/danger.js',
      '@@@ -1,1 -1,1 +1,2 @@@',
      '++await run("DROP TABLE users");',
    ].join('\n');
    expect(names(multiFile)).toContain('schema_corruption');
  });

  it('REGRESSION GUARD: FLAGS a line added relative to ALL parents (width-3, polarity "+++"), was fail-open', () => {
    // 3-parent (octopus) merge, width 3. Polarity '+++' (added relative to every
    // parent), content 'await run(...)'. Pre-FIX-2: the blanket `startsWith('+++')`
    // guard in addedLinesOnly matched the first 3 characters of ANY qualifying line
    // and dropped it outright, regardless of width, silently discarding a genuine
    // width-3 finding. (TESTING finding F-5, evidence 4ef59b24: this fixture's raw
    // text is '+++await...' -- polarity '+++' + content starting 'a', NOT content
    // starting '+' as an earlier version of this comment described. Still validly
    // source-pins the width-3 '+++'-guard regression; see the next test for the
    // genuine content-starts-with-'+' case.)
    const octopus = 'diff --cc db.js\nindex 1,2,3..4\n--- a/db.js\n+++ b/db.js\n@@@@ -1,1 -1,1 -1,1 +1,2 @@@@\n+++await run("DROP TABLE users");';
    expect(names(octopus)).toContain('schema_corruption');
  });

  it('REGRESSION GUARD: FLAGS a line added relative to ALL parents whose CONTENT ALSO starts with "+" (width-3, raw line "++++...")', () => {
    // Genuine content-starts-with-'+' case: polarity '+++' immediately followed by
    // content that itself begins with '+', so the raw line reads '++++ "DROP TABLE
    // users"' (4 literal '+' characters). This is the shape the guard removal in
    // FIX-2 was actually about -- content, not the polarity prefix, starting '+'.
    const octopus = 'diff --cc db.js\nindex 1,2,3..4\n--- a/db.js\n+++ b/db.js\n@@@@ -1,1 -1,1 -1,1 +1,2 @@@@\n++++ "DROP TABLE users"';
    expect(names(octopus)).toContain('schema_corruption');
  });

  it('REGRESSION GUARD (TESTING finding F-2, evidence 4ef59b24): CRLF-terminated combined-diff headers do not corrupt a later-hunk\'s width bleeding onto an earlier width-1 payload', () => {
    // A CRLF trailing '\r' on 'diff --cc'/'+++ b/'/'diff --git' header lines defeated
    // the original '(.+)$' capture (JS '.' excludes '\r', unflagged '$' requires true
    // end-of-string). A missed boundary collapsed both files into ONE segment; since a
    // segment's width is read once at flush time (the LAST hunk header seen), file 2's
    // '@@@' (width 2) retroactively applied to file 1's already-pushed width-1 payload,
    // slicing 2 chars off its front instead of 1 -- 'DROP TABLE users;' (width 1: 'D'
    // is the first content char) becomes 'ROP TABLE users;' (width 2 wrongly applied),
    // and the substring 'DROP' -- required by the CRIT-004 pattern -- is gone entirely.
    // Non-test paths used deliberately (an earlier draft of this test accidentally used
    // a '*.test.js' filename, which is genuinely CRIT-004-exempt regardless of this bug
    // and would have passed for the wrong reason). Fixed via '[^\\r\\n]+' (no trailing
    // '$') in all three boundary-header regexes, which correctly separates the two
    // files into their own segments so no cross-file width bleed can occur.
    const crlf = [
      'diff --cc lib/a.js\r',
      'index 1111111,2222222..3333333\r',
      '--- a/lib/a.js\r',
      '+++ b/lib/a.js\r',
      '@@ -1,1 +1,2 @@\r',
      '+DROP TABLE users;\r',
      'diff --cc lib/b.js\r',
      'index 4444444,5555555..6666666\r',
      '--- a/lib/b.js\r',
      '+++ b/lib/b.js\r',
      '@@@ -1,1 -1,1 +1,2 @@@\r',
      '++const ok = true;\r',
    ].join('\n');
    expect(names(crlf)).toContain('schema_corruption');
  });
});
