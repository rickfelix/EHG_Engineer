/**
 * SD-LEO-FIX-PRE-COMMIT-SECRET-001
 *
 * .husky/pre-commit's Stage 1 secret scan diffed the index against HEAD only. On a merge
 * commit every line the OTHER parent brings in reads as newly ADDED, so main's own
 * pre-existing content gets rescanned as if entering the tree (witnessed blocking PR #8490).
 * This pins the merge-aware SHELL LOGIC in isolation via bash (mirroring
 * pre-commit-nonempty-index-guard.test.js's approach for the same file, rather than running
 * the whole 900+ line hook), plus one structural check that the real .husky/pre-commit
 * actually carries the fix.
 *
 * Three LEAD-phase sub-agent passes (validation-agent 3a0213a7, risk-agent 63e379f0,
 * testing-agent prospective 7f3f5cdf) found: (1) a literal `.git/MERGE_HEAD` path test is
 * ALWAYS FALSE inside a git worktree (`.git` is a file there) -- T1; (2) `comm -12` fails
 * OPEN on unsorted input under this hook's `2>/dev/null || true` style -- T6; (3) an empty
 * MERGE_HEAD-basis result must fall back to the HEAD-only basis, never scan nothing -- T7.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

function bashAvailable() {
  const r = spawnSync('bash', ['-c', 'true'], { stdio: 'ignore' });
  return !r.error && r.status === 0;
}

function runBash(script, cwd) {
  const r = spawnSync('bash', ['-c', script], { encoding: 'utf8', cwd });
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status ?? 1 };
}

const d = bashAvailable() ? describe : describe.skip;

// The correct merge-aware basis logic, isolated from the surrounding 900+ line hook. Scans a
// single pathspec ('*.txt') for a single SECRET pattern, to keep the fixture small; the real
// hook applies the identical shape to STAGED_CONTENT and, separately, FIXTURE_CONTENT (T8
// covers that duplication structurally, against the real file).
const CORRECT_SNIPPET = `
IS_MERGE_COMMIT=0
if git rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1; then
  IS_MERGE_COMMIT=1
fi

HEAD_DIFF_RAW=$(git diff --cached HEAD --diff-filter=ACM -U0 -- '*.txt' 2>/dev/null)
STAGED_CONTENT_HEAD=$(printf '%s\\n' "$HEAD_DIFF_RAW" | grep -E '^\\+' | grep -vE '^\\+\\+\\+' || true)

if [ "$IS_MERGE_COMMIT" -eq 1 ]; then
  MERGE_DIFF_RAW=$(git diff --cached MERGE_HEAD --diff-filter=ACM -U0 -- '*.txt' 2>/dev/null)
  MERGE_DIFF_STATUS=$?
  STAGED_CONTENT_MERGE=$(printf '%s\\n' "$MERGE_DIFF_RAW" | grep -E '^\\+' | grep -vE '^\\+\\+\\+' || true)

  # FR-3: only fall back to the HEAD-only basis on a REAL git failure (nonzero exit), never
  # merely because the MERGE_HEAD-basis result happens to be empty -- an empty result is the
  # NORMAL, correct outcome of a clean non-conflicting merge (nothing the other parent brought
  # in is genuinely new relative to itself), and treating emptiness alone as a failure signal
  # would silently reintroduce the exact false-positive bug this SD fixes.
  if [ "$MERGE_DIFF_STATUS" -ne 0 ]; then
    STAGED_CONTENT="$STAGED_CONTENT_HEAD"
  else
    STAGED_CONTENT=$(printf '%s\\n' "$STAGED_CONTENT_HEAD" | grep -Fxf <(printf '%s\\n' "$STAGED_CONTENT_MERGE") 2>/dev/null || true)
  fi
else
  STAGED_CONTENT="$STAGED_CONTENT_HEAD"
fi

if echo "$STAGED_CONTENT" | grep -oiE 'FAKEMARKER[A-Za-z0-9]{20,}' >/dev/null 2>&1; then
  echo "BLOCKED"
else
  echo "PASS"
fi
`;

// T1 negative control: the literal path test this SD replaces. Proves it is inert in a
// worktree, which is exactly why TR-1 requires \`git rev-parse\` instead.
const LITERAL_PATH_SNIPPET = `
if [ -f ".git/MERGE_HEAD" ]; then
  echo "MERGE_DETECTED"
else
  echo "MERGE_NOT_DETECTED"
fi
`;

// T5 mutation: merge/non-merge branches swapped. Must fail T2 (false positive not fixed) and/or
// T4 (non-merge basis wrongly using the merge-only path).
const INVERTED_GUARD_SNIPPET = CORRECT_SNIPPET.replace(
  'if [ "$IS_MERGE_COMMIT" -eq 1 ]; then',
  'if [ "$IS_MERGE_COMMIT" -eq 0 ]; then'
);

// T6 mutation: comm -12 in place of grep -Fxf. comm requires SORTED input; unsorted lines make
// it warn on stderr and emit empty stdout with a non-zero exit -- silently swallowed by the
// hook's own `2>/dev/null || true` house style, fail-OPEN.
const UNSORTED_COMM_SNIPPET = CORRECT_SNIPPET.replace(
  'STAGED_CONTENT=$(printf \'%s\\n\' "$STAGED_CONTENT_HEAD" | grep -Fxf <(printf \'%s\\n\' "$STAGED_CONTENT_MERGE") 2>/dev/null || true)',
  'STAGED_CONTENT=$(comm -12 <(printf \'%s\\n\' "$STAGED_CONTENT_HEAD") <(printf \'%s\\n\' "$STAGED_CONTENT_MERGE") 2>/dev/null || true)'
);

// T7 mutation: no exit-status fallback -- if the MERGE_HEAD-basis diff command itself fails
// (a real git error, e.g. an invalid ref), the resulting empty/garbage output is used AS-IS
// rather than falling back to the HEAD-only basis (fail OPEN on a genuine command failure).
// Forced here by diffing against a deliberately-invalid ref instead of MERGE_HEAD, to exercise
// the failure path structurally (an organic git-diff failure against a ref that was just
// confirmed to resolve is not practically reproducible in a test).
const NO_FALLBACK_SNIPPET = CORRECT_SNIPPET
  .replace(/git diff --cached MERGE_HEAD/, 'git diff --cached MERGE_HEAD_DOES_NOT_EXIST_BOGUS_REF')
  .replace(
    `  if [ "$MERGE_DIFF_STATUS" -ne 0 ]; then
    STAGED_CONTENT="$STAGED_CONTENT_HEAD"
  else
    STAGED_CONTENT=$(printf '%s\\n' "$STAGED_CONTENT_HEAD" | grep -Fxf <(printf '%s\\n' "$STAGED_CONTENT_MERGE") 2>/dev/null || true)
  fi`,
    '  STAGED_CONTENT=$(printf \'%s\\n\' "$STAGED_CONTENT_HEAD" | grep -Fxf <(printf \'%s\\n\' "$STAGED_CONTENT_MERGE") 2>/dev/null || true)'
  );

// The CORRECT_SNIPPET with only the bogus ref (no other change) -- proves the fallback branch
// itself, on a real diff failure, correctly falls back to the HEAD-only basis.
const FORCED_DIFF_FAILURE_SNIPPET = CORRECT_SNIPPET.replace(
  /git diff --cached MERGE_HEAD/,
  'git diff --cached MERGE_HEAD_DOES_NOT_EXIST_BOGUS_REF'
);

// T9 mutation: intersect the RAW (unfiltered) diffs first, then filter -- hunk headers differ
// between the HEAD-basis and MERGE_HEAD-basis diffs even for textually-identical content lines,
// so a filter-after-intersect ordering can miss the match the filter-before-intersect ordering
// catches.
const FILTER_AFTER_SNIPPET = `
IS_MERGE_COMMIT=0
if git rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1; then
  IS_MERGE_COMMIT=1
fi

STAGED_CONTENT_HEAD_RAW=$(git diff --cached HEAD --diff-filter=ACM -U0 -- '*.txt' 2>/dev/null || true)

if [ "$IS_MERGE_COMMIT" -eq 1 ]; then
  STAGED_CONTENT_MERGE_RAW=$(git diff --cached MERGE_HEAD --diff-filter=ACM -U0 -- '*.txt' 2>/dev/null || true)
  STAGED_CONTENT_BOTH_RAW=$(printf '%s\\n' "$STAGED_CONTENT_HEAD_RAW" | grep -Fxf <(printf '%s\\n' "$STAGED_CONTENT_MERGE_RAW") 2>/dev/null || true)
  STAGED_CONTENT=$(printf '%s\\n' "$STAGED_CONTENT_BOTH_RAW" | grep -E '^\\+' | grep -vE '^\\+\\+\\+' || true)
else
  STAGED_CONTENT=$(printf '%s\\n' "$STAGED_CONTENT_HEAD_RAW" | grep -E '^\\+' | grep -vE '^\\+\\+\\+' || true)
fi

if echo "$STAGED_CONTENT" | grep -oiE 'FAKEMARKER[A-Za-z0-9]{20,}' >/dev/null 2>&1; then
  echo "BLOCKED"
else
  echo "PASS"
fi
`;

function initRepo(dir) {
  runBash('git init -q -b main && git config user.email t@t.com && git config user.name t', dir);
}

/**
 * Builds the exact scenario this SD fixes: main carries a pre-existing "redacted" fixture
 * line (secret-shaped) BEFORE a feature branch diverges from it. Merging main into the
 * feature branch then brings that line in as newly ADDED relative to the feature branch's
 * own history -- the false positive.
 */
function makeMergeFalsePositiveRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-commit-merge-basis-'));
  initRepo(dir);
  fs.writeFileSync(path.join(dir, 'base.txt'), 'hello\n');
  runBash('git add base.txt && git commit -q -m init', dir);

  runBash('git checkout -q -b feature', dir);
  fs.writeFileSync(path.join(dir, 'feature.txt'), 'feature work\n');
  runBash('git add feature.txt && git commit -q -m feature-commit', dir);

  runBash('git checkout -q main', dir);
  // A pre-existing, already-redacted fixture line lands on main AFTER the feature branch
  // diverged -- exactly what T2 must NOT flag when later merged into feature.
  fs.writeFileSync(path.join(dir, 'fixture.txt'), 'FAKEMARKERTESTFAKE1234567890ABCDEFGHIJ\n');
  runBash('git add fixture.txt && git commit -q -m "main-fixture-line"', dir);

  runBash('git checkout -q feature', dir);
  const merge = runBash('git merge --no-commit --no-ff main', dir);
  return { dir, merge };
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* noop */ }
}

d('husky pre-commit merge-basis secret scan (Stage 1)', () => {
  it('T2: a merge bringing in a pre-existing redacted fixture line is NOT blocked', () => {
    const { dir, merge } = makeMergeFalsePositiveRepo();
    expect(merge.status).toBe(0);
    const r = runBash(CORRECT_SNIPPET, dir);
    cleanup(dir);
    expect(r.stdout.trim()).toBe('PASS');
  });

  it('T3 (negative control): a genuinely NEW secret introduced by the same merge IS still blocked', () => {
    const { dir, merge } = makeMergeFalsePositiveRepo();
    expect(merge.status).toBe(0);
    fs.writeFileSync(path.join(dir, 'new-secret.txt'), 'FAKEMARKERBRANDNEW9876543210ZYXWVUTSRQPON\n');
    runBash('git add new-secret.txt', dir);
    const r = runBash(CORRECT_SNIPPET, dir);
    cleanup(dir);
    expect(r.stdout.trim()).toBe('BLOCKED');
  });

  it('T4: a non-merge commit is unaffected -- a genuinely new secret still blocks, no fixture noise', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-commit-merge-basis-'));
    initRepo(dir);
    fs.writeFileSync(path.join(dir, 'base.txt'), 'hello\n');
    runBash('git add base.txt && git commit -q -m init', dir);
    fs.writeFileSync(path.join(dir, 'new-secret.txt'), 'FAKEMARKERBRANDNEW9876543210ZYXWVUTSRQPON\n');
    runBash('git add new-secret.txt', dir);
    const r = runBash(CORRECT_SNIPPET, dir);
    cleanup(dir);
    expect(r.stdout.trim()).toBe('BLOCKED');
  });

  it('T5 (MUST-FAIL-IF-BROKEN): an inverted merge-detection guard lets the T2 false positive back in', () => {
    const { dir, merge } = makeMergeFalsePositiveRepo();
    expect(merge.status).toBe(0);
    const r = runBash(INVERTED_GUARD_SNIPPET, dir);
    cleanup(dir);
    // With the guard inverted, the merge case takes the non-merge (HEAD-only) path, which
    // re-introduces the exact false positive this SD fixes.
    expect(r.stdout.trim()).toBe('BLOCKED');
  });

  it('T6 (MUST-FAIL-IF-BROKEN): comm -12 on unsorted input fails open (a genuinely new secret is missed)', () => {
    const { dir, merge } = makeMergeFalsePositiveRepo();
    expect(merge.status).toBe(0);
    fs.writeFileSync(path.join(dir, 'new-secret.txt'), 'FAKEMARKERBRANDNEW9876543210ZYXWVUTSRQPON\n');
    runBash('git add new-secret.txt', dir);
    const r = runBash(UNSORTED_COMM_SNIPPET, dir);
    cleanup(dir);
    // comm -12 on unsorted input silently empties under 2>/dev/null || true -- the genuinely
    // new secret this run stages is missed (PASS), proving the fail-open this SD avoids.
    expect(r.stdout.trim()).toBe('PASS');
  });

  it('T7 (MUST-FAIL-IF-BROKEN): no exit-status fallback means a real MERGE_HEAD-diff failure silently scans garbage/nothing', () => {
    const { dir, merge } = makeMergeFalsePositiveRepo();
    expect(merge.status).toBe(0);
    const r = runBash(NO_FALLBACK_SNIPPET, dir);
    cleanup(dir);
    // The MERGE_HEAD-basis diff command is forced to fail (bogus ref). Without the
    // exit-status-gated fallback, the failed command's (empty) output is used as-is for the
    // intersection, which reads PASS -- silently missing the T2 fixture-line scan entirely
    // rather than falling back to the still-correct HEAD-only basis.
    expect(r.stdout.trim()).toBe('PASS');
  });

  it('T7 (fallback correctness): the real CORRECT_SNIPPET falls back to the HEAD-only basis when the MERGE_HEAD diff genuinely fails', () => {
    const { dir, merge } = makeMergeFalsePositiveRepo();
    expect(merge.status).toBe(0);
    fs.writeFileSync(path.join(dir, 'new-secret.txt'), 'FAKEMARKERBRANDNEW9876543210ZYXWVUTSRQPON\n');
    runBash('git add new-secret.txt', dir);
    const r = runBash(FORCED_DIFF_FAILURE_SNIPPET, dir);
    cleanup(dir);
    // MERGE_HEAD diff fails (bogus ref) -> MERGE_DIFF_STATUS != 0 -> falls back to
    // STAGED_CONTENT_HEAD, which contains the new-secret line (added relative to feature HEAD
    // regardless of the merge) -- correctly still BLOCKED via the fallback.
    expect(r.stdout.trim()).toBe('BLOCKED');
  });

  it('T9: filter-then-intersect (the chosen implementation) agrees with intersect-then-filter on this fixture, and both correctly PASS', () => {
    // Empirically verified (not merely asserted): a raw-diff intersection followed by the
    // ^+/^+++ filter can retain accidental matches among non-content lines that happen to be
    // byte-identical across unrelated files (e.g. two single-line-added files both producing
    // the hunk header "@@ -0,0 +1 @@", or both showing "--- /dev/null" for a new file) -- but
    // since those lines do not start with "+", the trailing filter step removes them either
    // way, so for line-based grep -Fxf matching the two orderings converge on this fixture
    // shape. filter-then-intersect (TR-3) is still the implementation choice: it keeps the
    // working sets smaller/noise-free going into the intersection and avoids relying on this
    // convergence holding for every future diff shape.
    const { dir, merge } = makeMergeFalsePositiveRepo();
    expect(merge.status).toBe(0);
    const correct = runBash(CORRECT_SNIPPET, dir);
    const filterAfter = runBash(FILTER_AFTER_SNIPPET, dir);
    cleanup(dir);
    expect(correct.stdout.trim()).toBe('PASS');
    expect(filterAfter.stdout.trim()).toBe('PASS');
  });

  it('T1: git rev-parse -q --verify MERGE_HEAD detects an in-progress merge in a plain repo', () => {
    const { dir, merge } = makeMergeFalsePositiveRepo();
    expect(merge.status).toBe(0);
    const r = runBash('git rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1 && echo DETECTED || echo NOT_DETECTED', dir);
    cleanup(dir);
    expect(r.stdout.trim()).toBe('DETECTED');
  });

  it('T1 (worktree): git rev-parse -q --verify MERGE_HEAD detects an in-progress merge in a LINKED WORKTREE, where the literal .git/MERGE_HEAD path test does not', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-commit-merge-basis-repo-'));
    initRepo(dir);
    fs.writeFileSync(path.join(dir, 'base.txt'), 'hello\n');
    runBash('git add base.txt && git commit -q -m init', dir);

    runBash('git branch feature', dir);
    fs.writeFileSync(path.join(dir, 'main-only.txt'), 'FAKEMARKERTESTFAKE1234567890ABCDEFGHIJ\n');
    runBash('git add main-only.txt && git commit -q -m main-fixture-line', dir);

    const wtDir = path.join(dir, 'wt-feature');
    const wtAdd = runBash(`git worktree add "${wtDir}" feature`, dir);
    expect(wtAdd.status).toBe(0);

    const merge = runBash('git merge --no-commit --no-ff main', wtDir);
    expect(merge.status).toBe(0);

    const rp = runBash('git rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1 && echo DETECTED || echo NOT_DETECTED', wtDir);
    const literal = runBash(LITERAL_PATH_SNIPPET, wtDir);
    cleanup(dir);

    expect(rp.stdout.trim()).toBe('DETECTED');
    // The bug this SD replaces: a literal filesystem path test against .git/MERGE_HEAD is
    // inert inside a worktree, because .git there is a FILE (a gitdir pointer), not a
    // directory containing MERGE_HEAD directly.
    expect(literal.stdout.trim()).toBe('MERGE_NOT_DETECTED');
  });

  it('T10: the correct snippet preserves scanning behaviour identically on repeat runs (pathspec/exclusion symmetry proxy)', () => {
    const { dir, merge } = makeMergeFalsePositiveRepo();
    expect(merge.status).toBe(0);
    const first = runBash(CORRECT_SNIPPET, dir);
    const second = runBash(CORRECT_SNIPPET, dir);
    cleanup(dir);
    expect(first.stdout.trim()).toBe(second.stdout.trim());
  });

  it('T8 (structural): the real .husky/pre-commit applies the merge-aware basis to BOTH STAGED_CONTENT and FIXTURE_CONTENT', () => {
    const hook = fs.readFileSync(path.resolve(process.cwd(), '.husky/pre-commit'), 'utf8');
    expect(hook).toMatch(/git rev-parse -q --verify MERGE_HEAD/);
    // `comm -12` is allowed to appear in a COMMENT explaining why it must not be used; it must
    // never appear as an actual invocation (a non-comment line calling it).
    const commInvocation = hook.split('\n').some((line) => !line.trim().startsWith('#') && /comm -12/.test(line));
    expect(commInvocation).toBe(false);
    // Both streams: the primary staged-content diff and the apa-calibration-fixtures allowlist
    // diff must each be re-diffed against MERGE_HEAD on a merge commit, not just one of the two.
    const mergeHeadDiffCount = (hook.match(/git diff --cached MERGE_HEAD/g) || []).length;
    expect(mergeHeadDiffCount).toBeGreaterThanOrEqual(2);
  });
});
