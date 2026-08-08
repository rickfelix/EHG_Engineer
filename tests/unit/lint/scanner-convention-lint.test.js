/**
 * SD-LEO-INFRA-SWEEP-REPO-SCANNERS-001 (FR-3 / AC-3) — the lint-for-the-linters.
 *
 * A guard that has never failed is indistinguishable from an absent one, which is this SD's whole
 * subject. So the central test PLANTS a violating scanner and asserts the check catches it, rather
 * than asserting the repo is currently clean — a state that would also hold if the check did nothing.
 *
 * Typed UNIT deliberately: tests/integration/** resolves to ZERO FILES here, so an integration-typed
 * test would SKIP AND REPORT GREEN.
 */

import { describe, it, expect } from 'vitest';
import { readsAddedLineText, findViolations } from '../../../scripts/lint/scanner-convention-lint.mjs';

const PATCH_READER = 'const patch = run(`git diff ${baseRef}...HEAD -- "${path}"`);';
const NAME_ONLY = 'execSync(`git diff --name-only --diff-filter=ACMR ${base}...HEAD`)';

describe('readsAddedLineText — the shape-A discriminator', () => {
  it('flags a git diff that yields a PATCH', () => {
    expect(readsAddedLineText(PATCH_READER)).toBe(true);
  });

  it('[THE DISCRIMINATOR] does NOT flag --name-only, which yields PATHS', () => {
    // This single flag separates shape A from shape B. Too broad and every shape-B lint scanner is
    // flagged on a scope that has not been ruled; too narrow and nothing is caught.
    expect(readsAddedLineText(NAME_ONLY)).toBe(false);
  });

  it('[REGRESSION] ignores a git diff quoted inside an ERROR MESSAGE', () => {
    // Found on the check's FIRST LIVE RUN, and it is this SD's own defect class committed by the
    // enforcement tool: the first version flagged compute-changed-retro-migrations for the words
    // "git diff failed" inside a console.error. Stripping comments is not enough — STRING LITERALS
    // carry pattern-shaped text too, and a diagnostic is the likeliest place to quote a command.
    expect(readsAddedLineText('console.error(`[my-scanner] git diff failed (${e.message})`);')).toBe(false);
  });

  it('[KNOWN LIMIT] a string that OPENS with the command is treated as an invocation', () => {
    // Stated as a test rather than left as a surprise. `'git diff failed to run'` is a MESSAGE, but
    // it opens with the command and is therefore indistinguishable from one by this heuristic.
    // Discriminating further (demanding a following ref or flag) would trade a rare false positive
    // for a class of false NEGATIVES — a scanner that slipped past the guard entirely — and a false
    // negative here is strictly worse, because it is the silent direction.
    // The reasoned opt-out marker exists precisely for this case.
    expect(readsAddedLineText("throw new Error('git diff failed to run');")).toBe(true);
  });

  it('ignores a git diff mentioned only in a COMMENT', () => {
    // The check must not commit the defect it polices — a linter that flags its own prose is the
    // exact failure this SD exists to abolish.
    expect(readsAddedLineText('// we used to call git diff <ref> here\nconst x = 1;')).toBe(false);
    expect(readsAddedLineText(' * example: git diff <ref> -- path\nconst y = 2;')).toBe(false);
  });
});

describe('findViolations — planted violation, injected fs', () => {
  const fixtures = (files) => ({
    root: '/fake',
    roots: ['scripts/lint'],
    listFiles: () => Object.keys(files),
    readFile: (p) => {
      const key = Object.keys(files).find((k) => p.endsWith(k.replace(/\//g, require('node:path').sep)) || p.endsWith(k));
      if (key) return files[key];
      throw new Error('not found: ' + p);
    },
  });

  it('[PLANTED] CATCHES a shape-A scanner that skips the helper', () => {
    const v = findViolations(fixtures({ 'scripts/lint/bad-scanner.mjs': PATCH_READER }));
    expect(v).toHaveLength(1);
    expect(v[0].file).toBe('scripts/lint/bad-scanner.mjs');
  });

  it('PASSES a shape-A scanner that imports the helper', () => {
    const good = `import { stripComments } from '../../lib/lint/added-line-text.mjs';\n${PATCH_READER}`;
    expect(findViolations(fixtures({ 'scripts/lint/good-scanner.mjs': good }))).toHaveLength(0);
  });

  it('PASSES a shape-B scanner (--name-only) untouched', () => {
    // Shape B is deliberately out of this check's scope until the coordinator rules on it.
    expect(findViolations(fixtures({ 'scripts/lint/nameonly.mjs': NAME_ONLY }))).toHaveLength(0);
  });

  it('honours an opt-out that carries a REASON', () => {
    const opted = `// scanner-convention-lint-exempt: matches only SQL keywords, never identifiers\n${PATCH_READER}`;
    expect(findViolations(fixtures({ 'scripts/lint/opted.mjs': opted }))).toHaveLength(0);
  });

  it('does NOT honour a bare opt-out marker with no reason', () => {
    // An unexplained exemption is how a guard erodes into a formality.
    const bare = `// scanner-convention-lint-exempt:\n${PATCH_READER}`;
    expect(findViolations(fixtures({ 'scripts/lint/bare.mjs': bare }))).toHaveLength(1);
  });

  it('skips a scanner TEST file, which legitimately contains scanner-shaped strings', () => {
    const v = findViolations(fixtures({ 'scripts/lint/__tests__/x.test.js': PATCH_READER }));
    expect(v).toHaveLength(0);
  });
});
