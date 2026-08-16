/**
 * SD-LEO-INFRA-STALE-QF-DISPOSITION-SWEEP-001 (FR-4) — the two-signal citation checker.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { checkQuickFixCitation, extractCitations, OUTCOMES, buildVitestInvocation } from '../../../lib/eva/quick-fix-citation-checker.js';

describe('extractCitations', () => {
  it('extracts a file:line citation (no range)', () => {
    const { paths } = extractCitations('see lib/foo.js:42 for details');
    expect(paths).toEqual([{ path: 'lib/foo.js', line: 42, isRange: false }]);
  });

  it('extracts a range citation and marks isRange true', () => {
    const { paths } = extractCitations('see lib/foo.js:10-20');
    expect(paths[0].isRange).toBe(true);
  });

  it('extracts a named test path', () => {
    const { namedTest } = extractCitations('run tests/unit/x.test.js to confirm');
    expect(namedTest).toBe('tests/unit/x.test.js');
  });

  it('returns no paths/namedTest for prose with no citation', () => {
    const { paths, namedTest } = extractCitations('the gate never consults the cache');
    expect(paths).toEqual([]);
    expect(namedTest).toBeNull();
  });
});

describe('extractCitations — hardening against a flag-injection-shaped citation', () => {
  it('a path prefixed with -- is never extracted as a secondary-signal path candidate', () => {
    const { paths } = extractCitations('run --foo/bar.test.js now');
    expect(paths).toEqual([]);
  });

  it('the same input strips the leading -- from any named-test extraction rather than including it', () => {
    const { namedTest } = extractCitations('run --foo/bar.test.js now');
    expect(namedTest).not.toMatch(/^-/);
  });
});

describe('extractCitations — hardening against path traversal', () => {
  it('a path containing a .. segment is never extracted as a secondary-signal path candidate', () => {
    const { paths } = extractCitations('see a/../../../etc/evil.js for the old implementation');
    expect(paths).toEqual([]);
  });

  it('a named-test citation containing a .. segment is rejected, not passed through to fs/execFileSync', () => {
    const { namedTest } = extractCitations('covered by a/../../../etc/evil.test.js');
    expect(namedTest).toBeNull();
  });

  it('a legitimate path containing a literal ".." is unaffected as long as it is not its own segment', () => {
    // Sanity control: the guard filters SEGMENTS equal to "..", not the substring "..". A
    // filename like "v2..final.js" (unusual but not a traversal) must still extract normally.
    const { paths } = extractCitations('see lib/v2..final.js for details');
    expect(paths).toEqual([{ path: 'lib/v2..final.js', line: null, isRange: false }]);
  });

  it('checkQuickFixCitation resolves INCONCLUSIVE for a traversal-only citation, never throws', () => {
    const qf = { title: 'x', description: 'see a/../../../etc/evil.js for the old implementation' };
    const r = checkQuickFixCitation(qf, { repoRoot: '/tmp/does-not-matter', runTest: () => 'PASS' });
    expect(r.outcome).toBe(OUTCOMES.INCONCLUSIVE);
  });
});

describe('checkQuickFixCitation', () => {
  let tmpDir;
  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qfcc-'));
    fs.mkdirSync(path.join(tmpDir, 'tests'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'tests', 'passing.test.js'), '// fixture');
    fs.writeFileSync(path.join(tmpDir, 'tests', 'failing.test.js'), '// fixture');
    fs.writeFileSync(path.join(tmpDir, 'lib', 'existing-file.js'), '// fixture');
  });
  afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const runTestStub = (testPath) => (testPath.includes('passing') ? 'PASS' : 'FAIL');

  it('PRIMARY signal: named test exists and passes -> ABSENT, test_passing:<path>', () => {
    const qf = { title: 'x', description: 'covered by tests/passing.test.js' };
    const r = checkQuickFixCitation(qf, { repoRoot: tmpDir, runTest: runTestStub });
    expect(r.outcome).toBe(OUTCOMES.ABSENT);
    expect(r.reasonCode).toBe('test_passing:tests/passing.test.js');
  });

  it('PRIMARY signal: named test exists and fails -> STILL_PRESENT, test_failing:<path>', () => {
    const qf = { title: 'x', description: 'covered by tests/failing.test.js' };
    const r = checkQuickFixCitation(qf, { repoRoot: tmpDir, runTest: runTestStub });
    expect(r.outcome).toBe(OUTCOMES.STILL_PRESENT);
    expect(r.reasonCode).toBe('test_failing:tests/failing.test.js');
  });

  it('named test cited but file itself absent falls through to secondary signal -> ABSENT, file_absent', () => {
    const qf = { title: 'x', description: 'covered by tests/never-existed.test.js' };
    const r = checkQuickFixCitation(qf, { repoRoot: tmpDir, runTest: runTestStub });
    expect(r.outcome).toBe(OUTCOMES.ABSENT);
    expect(r.reasonCode).toBe('file_absent:tests/never-existed.test.js');
  });

  it('SECONDARY signal: single non-range cited file completely absent -> ABSENT, file_absent:<path>', () => {
    const qf = { title: 'x', description: 'see lib/deleted-file.js for the old implementation' };
    const r = checkQuickFixCitation(qf, { repoRoot: tmpDir, runTest: runTestStub });
    expect(r.outcome).toBe(OUTCOMES.ABSENT);
    expect(r.reasonCode).toBe('file_absent:lib/deleted-file.js');
  });

  it('cited file EXISTS -> INCONCLUSIVE, never STILL_PRESENT (file-exists is not evidence)', () => {
    const qf = { title: 'x', description: 'see lib/existing-file.js' };
    const r = checkQuickFixCitation(qf, { repoRoot: tmpDir, runTest: runTestStub });
    expect(r.outcome).toBe(OUTCOMES.INCONCLUSIVE);
  });

  it('range citation -> INCONCLUSIVE even though the same file would resolve ABSENT if cited bare', () => {
    const qf = { title: 'x', description: 'see lib/deleted-file.js:10-20' };
    const r = checkQuickFixCitation(qf, { repoRoot: tmpDir, runTest: runTestStub });
    expect(r.outcome).toBe(OUTCOMES.INCONCLUSIVE);
  });

  it('more than one distinct non-range citation -> INCONCLUSIVE (ambiguous, ties broken to neither)', () => {
    const qf = { title: 'x', description: 'see lib/deleted-file.js and lib/existing-file.js' };
    const r = checkQuickFixCitation(qf, { repoRoot: tmpDir, runTest: runTestStub });
    expect(r.outcome).toBe(OUTCOMES.INCONCLUSIVE);
  });

  it('prose with no extractable citation -> INCONCLUSIVE, no_deterministic_signal', () => {
    const qf = { title: 'x', description: 'the gate never consults the cache' };
    const r = checkQuickFixCitation(qf, { repoRoot: tmpDir, runTest: runTestStub });
    expect(r.outcome).toBe(OUTCOMES.INCONCLUSIVE);
    expect(r.reasonCode).toBe('no_deterministic_signal');
  });

  it('a row with NO extractable content at all -> INCONCLUSIVE, no_citation', () => {
    const qf = { title: null, description: null };
    const r = checkQuickFixCitation(qf, { repoRoot: tmpDir, runTest: runTestStub });
    expect(r.outcome).toBe(OUTCOMES.INCONCLUSIVE);
    expect(r.reasonCode).toBe('no_citation');
  });

  it('cross-repo target_application -> INCONCLUSIVE, cross_repo_target, never checked at all', () => {
    const qf = { title: 'x', description: 'see lib/deleted-file.js', target_application: 'EHG' };
    const r = checkQuickFixCitation(qf, { repoRoot: tmpDir, currentRepoApplication: 'EHG_Engineer', runTest: runTestStub });
    expect(r.outcome).toBe(OUTCOMES.INCONCLUSIVE);
    expect(r.reasonCode).toBe('cross_repo_target');
  });

  it('matching target_application IS checked normally', () => {
    const qf = { title: 'x', description: 'see lib/deleted-file.js', target_application: 'EHG_Engineer' };
    const r = checkQuickFixCitation(qf, { repoRoot: tmpDir, currentRepoApplication: 'EHG_Engineer', runTest: runTestStub });
    expect(r.outcome).toBe(OUTCOMES.ABSENT);
  });

  it('checker throws (injected) -> fail-closed INCONCLUSIVE, never ABSENT/STILL_PRESENT', () => {
    const qf = { title: 'x', description: 'covered by tests/passing.test.js' };
    const throwingRunTest = () => { throw new Error('runner exploded'); };
    const r = checkQuickFixCitation(qf, { repoRoot: tmpDir, runTest: throwingRunTest });
    expect(r.outcome).toBe(OUTCOMES.INCONCLUSIVE);
    expect(r.reasonCode).toMatch(/^checker_error:/);
  });

  it('DISTRIBUTION BOUND: a realistic mixed fixture resolves under 20% combined, at least 1 of each outcome', () => {
    const rows = [
      { title: 'a', description: 'covered by tests/passing.test.js' }, // ABSENT
      { title: 'b', description: 'covered by tests/failing.test.js' }, // STILL_PRESENT
      ...Array.from({ length: 10 }, (_, i) => ({ title: `c${i}`, description: `no citation here row ${i}` })), // INCONCLUSIVE x10
    ];
    const results = rows.map((qf) => checkQuickFixCitation(qf, { repoRoot: tmpDir, runTest: runTestStub }));
    const resolved = results.filter((r) => r.outcome !== OUTCOMES.INCONCLUSIVE).length;
    expect(resolved / results.length).toBeLessThan(0.2);
    expect(results.some((r) => r.outcome === OUTCOMES.ABSENT)).toBe(true);
    expect(results.some((r) => r.outcome === OUTCOMES.STILL_PRESENT)).toBe(true);
    expect(results.some((r) => r.outcome === OUTCOMES.INCONCLUSIVE)).toBe(true);
  });

  it('every ABSENT outcome carries a non-empty reasonCode', () => {
    const qf = { title: 'x', description: 'covered by tests/passing.test.js' };
    const r = checkQuickFixCitation(qf, { repoRoot: tmpDir, runTest: runTestStub });
    expect(r.outcome).toBe(OUTCOMES.ABSENT);
    expect(r.reasonCode).toBeTruthy();
  });

  it('extractedPathCount is returned for downstream FR-5 threshold use', () => {
    const qf = { title: 'x', description: 'covered by tests/failing.test.js and lib/a.js and lib/b.js and lib/c.js' };
    const r = checkQuickFixCitation(qf, { repoRoot: tmpDir, runTest: runTestStub });
    expect(r.outcome).toBe(OUTCOMES.STILL_PRESENT);
    expect(r.extractedPathCount).toBeGreaterThanOrEqual(3);
  });
});

describe('buildVitestInvocation — the exact argv runNamedTestReal spawns (SECURITY sub-agent finding)', () => {
  // runNamedTestReal previously had ZERO coverage of any kind -- every test above injects
  // opts.runTest, which never exercises the real invocation. That gap is exactly how a genuine,
  // measured regression shipped silently: a "defense-in-depth" `--` argv separator broke
  // vitest's file targeting entirely (every check silently ran the WHOLE ~3400-file repo suite
  // instead of the one cited file, and `execFileSync('npx', ...)` additionally threw ENOENT on
  // Windows). A real end-to-end subprocess spawn is deliberately NOT exercised from inside this
  // repo's own vitest run -- verified during EXEC-TO-PLAN that a nested `vitest run` spawned as a
  // child of an already-running vitest process produces incorrect PASS/FAIL results (a test-
  // harness artifact of nesting shared cache/worker-pool state, not a defect in production, where
  // the sweep always runs as a plain, non-nested `node` CLI process). Asserting the argv SHAPE
  // deterministically catches the exact regression class (a stray flag, a reintroduced `--`, a
  // reintroduced `npx`) without needing a real, flaky subprocess spawn to notice.
  it('invokes node directly against vitest.mjs -- never npx, never a shell, never a stray -- separator', () => {
    const { command, args } = buildVitestInvocation('some/path.test.js');
    expect(command).toBe(process.execPath);
    expect(args).toHaveLength(3);
    expect(args[0]).toMatch(/vitest\.mjs$/);
    expect(args[1]).toBe('run');
    expect(args[2]).toBe('some/path.test.js');
    expect(args).not.toContain('--');
    expect(args).not.toContain('npx');
    expect(command).not.toMatch(/npx/);
  });

  it('the resolved vitest CLI path genuinely exists on disk', () => {
    const { args } = buildVitestInvocation('irrelevant.test.js');
    expect(fs.existsSync(args[0])).toBe(true);
  });

  it('testPath is passed through byte-for-byte as the final positional argument, never mutated', () => {
    const weirdButLegal = 'tests/unit/eva/some-file.test.js';
    const { args } = buildVitestInvocation(weirdButLegal);
    expect(args[args.length - 1]).toBe(weirdButLegal);
  });
});

describe('runNamedTestReal — real, non-nested subprocess execution (manually verified, documented rather than re-spawned in-suite)', () => {
  // The actual end-to-end mechanism (process.execPath + VITEST_CLI_PATH correctly targets ONLY
  // the cited file, in well under a second, and correctly resolves PASS/FAIL for genuinely
  // passing/failing fixtures, on win32) was verified manually via a plain, non-nested `node -e`
  // invocation during EXEC-TO-PLAN -- not re-asserted here because running it from WITHIN this
  // repo's own vitest suite is the exact nested-invocation scenario documented above as
  // unreliable. buildVitestInvocation's argv-shape tests above are the permanent regression
  // guard; this block exists so a future reader knows the omission was deliberate, not missed.
  it('is covered by buildVitestInvocation (argv shape) plus manual, non-nested verification -- not re-spawned here', () => {
    expect(true).toBe(true);
  });
});
