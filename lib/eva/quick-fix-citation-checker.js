// SD-LEO-INFRA-STALE-QF-DISPOSITION-SWEEP-001 (FR-4): a deliberately narrow, two-signal,
// no-LLM citation checker for quick_fixes premises. NOT a general "is this defect real"
// classifier -- reuse of lib/eva/premise-liveness.js checkPremiseLiveness() was tried first
// and found structurally incapable (measured against 15 real rows: only ever STALE@0.95 or
// LIVE@0.3, never a high-confidence "confirmed still present" verdict, and no file:line-absence
// check at all).
//
// Measured against all 170 live past-fence quick_fixes rows during PLAN-phase prospective
// review: only 46 (27%) carry ANY file:line citation, 20 of those cite a RANGE (unaddressable),
// 80 (47%) carry no citation at all, and only 1 names a runnable test. Of 147 distinct cited
// paths, 134 still exist -- file-existence alone resolves almost nothing. There is no "cited
// literal" field to compare against (premises are prose), so deriving a comparable literal from
// that prose would BE the LLM-interpretation step this design exists to avoid.
//
// THE TWO SIGNALS, tried in this order, everything else falls to INCONCLUSIVE (fail-closed on
// BOTH resolving directions -- never ABSENT or STILL_PRESENT on ambiguity or error):
//   1. PRIMARY -- a named, actually-runnable test is extracted via a path-pattern regex
//      (*.test.js / *.spec.js -- not prose interpretation). If the file exists, run it:
//      PASS -> ABSENT, FAIL -> STILL_PRESENT.
//   2. SECONDARY, narrower -- exactly one DISTINCT non-range file citation, and that file is
//      COMPLETELY absent (fs.existsSync false) -> ABSENT. File-exists is NOT evidence of
//      STILL_PRESENT (only absence is a usable deterministic signal here).
//
// EXPECTED, DELIBERATE DISTRIBUTION: on the live corpus this design is expected to positively
// resolve (ABSENT or STILL_PRESENT) only a SMALL minority of rows -- the large majority
// correctly falls to INCONCLUSIVE (premise_unverified_stale). This is the conservative intent
// working as designed, not a checker defect.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const OUTCOMES = Object.freeze({
  ABSENT: 'ABSENT',
  STILL_PRESENT: 'STILL_PRESENT',
  INCONCLUSIVE: 'INCONCLUSIVE',
});

// Validated during PLAN-phase prospective review against the live 170-row corpus
// (.artifacts/tqa-citation.mjs, .artifacts/tqa-yield.mjs) -- the PRD's stated citation-shape
// percentages are grounded in running exactly this pattern, so it is reused verbatim rather
// than re-derived. group 1 = path, group 2 = line number, group 3 = "-NN" range suffix (only a
// genuine range when group 2 ALSO matched -- a bare "-63" with no preceding line is not one).
// SECURITY: the first path segment must START with a word character (never `-` or `.`), so an
// extracted path can never look like a CLI flag (e.g. a crafted "--foo/bar.test.js" in prose).
// This is belt; runNamedTestReal's `--` argv separator below is suspenders -- execFileSync's
// argv-array form is already immune to shell injection, but a leading-hyphen ARGUMENT can still
// be parsed as a FLAG by the invoked program itself, which is the actual (bounded, server-side,
// coordinator/cron-triggered) risk this closes.
const PATH_RE = /(?:^|[\s`'"(\[])([\w][\w.\-]*(?:\/[\w.\-]+)+\.(?:js|cjs|mjs|ts|tsx|jsx|json|sql|md|yml|yaml|sh|py))(?::(\d+))?(-\d+)?/g;
const TESTFILE_RE = /([\w][\w.\-]*(?:\/[\w.\-]+)*\.(?:test|spec)\.(?:js|ts|tsx|mjs|cjs))/;

/**
 * Deterministic, regex-only extraction -- no prose interpretation. Exported so the sweep's
 * dedupe/reporting can reuse the same extracted-path-count FR-5 needs for its re_verified vs
 * promoted threshold, without re-parsing the blob a second time.
 */
export function extractCitations(blob) {
  const hits = [];
  PATH_RE.lastIndex = 0;
  let m;
  while ((m = PATH_RE.exec(blob))) {
    hits.push({ path: m[1], line: m[2] ? Number(m[2]) : null, isRange: Boolean(m[2] && m[3]) });
  }
  const uniq = [...new Map(hits.map((h) => [`${h.path}:${h.line}:${h.isRange}`, h])).values()];
  const testMatch = TESTFILE_RE.exec(blob);
  return { paths: uniq, namedTest: testMatch ? testMatch[1] : null };
}

/**
 * Real (non-test) test runner: PASS iff `npx vitest run <testPath>` exits 0. Any non-zero exit
 * (assertion failure, file error, timeout) reads as FAIL -- fail-closed toward STILL_PRESENT,
 * never silently ABSENT because the runner itself broke. Overridden via opts.runTest in every
 * unit test (TR-4 DI discipline) -- never actually spawned by the test suite.
 */
function runNamedTestReal(testPath, repoRoot) {
  try {
    // `--` is the POSIX argv separator: everything after it is a positional argument, never a
    // flag, regardless of what testPath's own leading characters happen to be. Defense-in-depth
    // alongside PATH_RE/TESTFILE_RE's own leading-word-char requirement above.
    execFileSync('npx', ['vitest', 'run', '--', testPath], {
      cwd: repoRoot,
      stdio: 'ignore',
      timeout: 60000,
    });
    return 'PASS';
  } catch {
    return 'FAIL';
  }
}

/**
 * Check one quick_fixes row's premise against the two deterministic signals above.
 *
 * @param {object} qf - a quick_fixes row (title, description, steps_to_reproduce,
 *   expected_behavior, actual_behavior, target_application).
 * @param {object} [opts]
 * @param {string} [opts.repoRoot] - repo root file citations are resolved against.
 * @param {string} [opts.currentRepoApplication] - this checker can only evaluate rows whose
 *   target_application matches the repo it is running in; a cross-repo row is not checkable
 *   from here and is always INCONCLUSIVE (measured live: 2/170 rows target a different repo).
 * @param {(testPath: string, repoRoot: string) => ('PASS'|'FAIL')} [opts.runTest] - injected
 *   test runner, defaults to a real `npx vitest run` subprocess call.
 * @returns {{outcome: 'ABSENT'|'STILL_PRESENT'|'INCONCLUSIVE', reasonCode: string, extractedPathCount: number}}
 *   extractedPathCount is the distinct-path count FR-5 thresholds re_verified vs promoted on --
 *   computed from the SAME blob/extraction this checker used internally, so callers never
 *   re-derive it from a second, potentially-drifted blob composition.
 */
export function checkQuickFixCitation(qf, opts = {}) {
  const {
    repoRoot = process.cwd(),
    currentRepoApplication = 'EHG_Engineer',
    runTest = runNamedTestReal,
  } = opts;
  try {
    if (qf?.target_application && qf.target_application !== currentRepoApplication) {
      return { outcome: OUTCOMES.INCONCLUSIVE, reasonCode: 'cross_repo_target', extractedPathCount: 0 };
    }

    const blob = [qf?.title, qf?.description, qf?.steps_to_reproduce, qf?.expected_behavior, qf?.actual_behavior]
      .filter(Boolean)
      .join('\n');
    if (!blob) {
      return { outcome: OUTCOMES.INCONCLUSIVE, reasonCode: 'no_citation', extractedPathCount: 0 };
    }

    const { paths, namedTest } = extractCitations(blob);
    const extractedPathCount = new Set(paths.map((p) => p.path)).size;

    // PRIMARY signal: a named, actually-runnable test.
    if (namedTest) {
      const testAbsPath = path.join(repoRoot, namedTest);
      if (fs.existsSync(testAbsPath)) {
        const result = runTest(namedTest, repoRoot);
        if (result === 'PASS') {
          return { outcome: OUTCOMES.ABSENT, reasonCode: `test_passing:${namedTest}`, extractedPathCount };
        }
        if (result === 'FAIL') {
          return { outcome: OUTCOMES.STILL_PRESENT, reasonCode: `test_failing:${namedTest}`, extractedPathCount };
        }
      }
      // Named test cited but the file itself doesn't exist -- no return here. Falls through to
      // the secondary signal, which (since the same path is also captured in `paths` below)
      // naturally resolves it as a file_absent ABSENT rather than needing special-casing.
    }

    // SECONDARY signal: exactly one DISTINCT non-range file citation, completely absent.
    // Deliberately narrow: a mix of citations, or more than one distinct non-range file, is
    // ambiguous and stays INCONCLUSIVE rather than guessing which one is authoritative.
    const nonRangePaths = [...new Set(paths.filter((p) => !p.isRange).map((p) => p.path))];
    if (nonRangePaths.length === 1) {
      const only = nonRangePaths[0];
      if (!fs.existsSync(path.join(repoRoot, only))) {
        return { outcome: OUTCOMES.ABSENT, reasonCode: `file_absent:${only}`, extractedPathCount };
      }
    }

    return { outcome: OUTCOMES.INCONCLUSIVE, reasonCode: 'no_deterministic_signal', extractedPathCount };
  } catch (e) {
    // Fail-closed: any thrown error (bad input, fs failure, injected-throw in a test) is
    // INCONCLUSIVE, never ABSENT or STILL_PRESENT.
    return { outcome: OUTCOMES.INCONCLUSIVE, reasonCode: `checker_error:${e?.message || String(e)}`, extractedPathCount: 0 };
  }
}
