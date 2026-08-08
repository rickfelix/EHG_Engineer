/**
 * SD-LEO-INFRA-SWEEP-REPO-SCANNERS-001 (FR-1 / AC-1) — the shared strip-and-exclude helper.
 *
 * These reproduce the TWO HISTORICAL FALSE POSITIVES the helper exists to defeat, plus the
 * two-sided control that stops it becoming a blanket suppressor.
 *
 * Typed UNIT deliberately: tests/integration/** resolves to ZERO FILES in this repo, so an
 * integration-typed test would SKIP AND REPORT GREEN — the same false assurance this SD is about.
 */

import { describe, it, expect } from 'vitest';
import { stripComments, isFixturePath, scannableText } from '../../../lib/lint/added-line-text.mjs';

/** The shape both observed false positives took: a real-looking call in non-code context. */
const CREATOR_CALL = "supabase.from('leo_feature_flags').insert({ flag_key: 'X' })";

describe('stripComments — the comment false positive', () => {
  it('removes a LINE comment containing creator-shaped text', () => {
    // The exact recorded failure: a comment written to EXPLAIN a previous false positive contained
    // both halves of the rule and re-triggered it. The file's own explanation of the bug was the bug.
    const added = `// we previously mis-read ${CREATOR_CALL} as a real creation\nconst x = 1;`;
    expect(stripComments(added)).not.toMatch(/\.insert\(/);
    expect(stripComments(added)).toMatch(/const x = 1;/);
  });

  it('removes a whole BLOCK comment', () => {
    const added = `/* example: ${CREATOR_CALL} */\nconst y = 2;`;
    expect(stripComments(added)).not.toMatch(/\.insert\(/);
  });

  it('[FRAGMENT] removes JSDoc CONTINUATION lines whose opener the diff slice cut off', () => {
    // THE ASSERTION THAT JUSTIFIES EXTRACTING RATHER THAN REWRITING. An added-lines slice is a
    // FRAGMENT: it can begin partway through a JSDoc block, so ` * ...` lines arrive with no `/**`.
    // A naive /\/\*[\s\S]*?\*\//g misses exactly these — and documentation-shaped false positives
    // concentrate here.
    const added = ` * worked example: ${CREATOR_CALL}\n * and more prose\nconst z = 3;`;
    expect(stripComments(added), 'orphaned JSDoc continuation lines must be stripped').not.toMatch(/\.insert\(/);
    expect(stripComments(added)).toMatch(/const z = 3;/);
  });

  it('[TRUE POSITIVE SURVIVES] a REAL call outside a comment is NOT suppressed', () => {
    // R-5, and the two-sided half of AC-1. Stripping is best-effort and could in principle swallow
    // too much; a helper that suppressed everything would pass every "no false positive" test while
    // silently disarming the scanner — a FALSE NEGATIVE, which is worse than the noise it replaced.
    // This is the control that keeps the helper honest.
    const added = `${CREATOR_CALL}\n// and a comment mentioning ${CREATOR_CALL}`;
    const out = stripComments(added);
    expect(out, 'a genuine occurrence must still be matchable').toMatch(/\.insert\(/);
    expect(out.match(/\.insert\(/g)).toHaveLength(1); // the commented one is gone, the real one remains
  });
});

describe('isFixturePath — the fixture false positive', () => {
  // EACH ALTERNATIVE IS ISOLATED ON PURPOSE. The first draft of this test used
  // 'lib/gates/__tests__/operator-contract.test.js' as the .test. case — but that path ALSO matches
  // via __tests__/, so breaking the .test. branch left the suite green. A mutation run caught it:
  // the predicate is a four-way alternation, and a case that satisfies two branches cannot tell you
  // which one fired. Every entry below exercises EXACTLY ONE branch.
  it.each([
    ['lib/foo.test.js', '.test. alone — no __tests__ dir, no tests/ dir'],
    ['lib/x/y.spec.js', '.spec. alone'],
    ['lib/gates/__tests__/helper.js', '__tests__/ alone — no .test. suffix'],
    ['tests/unit/foo.js', 'leading tests/ alone'],
    ['src/tests/bar.js', 'nested /tests/ alone'],
  ])('excludes %s (%s)', (p) => {
    expect(isFixturePath(p), `${p} should be treated as fixture material`).toBe(true);
  });

  it('[TWO-SIDED] does NOT exclude ordinary source paths', () => {
    // Without this, a predicate that returned true for everything would pass the test above and
    // silently exclude the entire repo from scanning.
    for (const p of ['lib/gates/operator-contract/index.js', 'scripts/lint/schema-reference-lint.mjs']) {
      expect(isFixturePath(p), `${p} must remain scannable`).toBe(false);
    }
  });

  it('tolerates junk input rather than throwing', () => {
    for (const p of [undefined, null, '', 123]) expect(isFixturePath(p)).toBe(false);
  });
});

describe('scannableText — the two decisions in one place', () => {
  it('returns null for a fixture path so callers can skip', () => {
    expect(scannableText({ path: 'lib/__tests__/x.test.js', added: CREATOR_CALL })).toBeNull();
  });

  it('returns comment-stripped text for a real source path', () => {
    const out = scannableText({ path: 'lib/real.js', added: `// ${CREATOR_CALL}\nconst a = 1;` });
    expect(out).not.toBeNull();
    expect(out).not.toMatch(/\.insert\(/);
  });

  it('preserves a real occurrence in a real source path', () => {
    const out = scannableText({ path: 'lib/real.js', added: CREATOR_CALL });
    expect(out).toMatch(/\.insert\(/);
  });
});
