// QF-20260526-738: compliance rubric stops penalizing legitimate fix+test+doc QFs.
//
// Three false-positives (witnessed QF-20260526-913 → 89 WARN, all benign):
//   - linting_clean ran the whole-repo `npm run lint` → baseline-poisoned 0/5.
//   - targeted_fix counted raw files ≤2 → penalized the source+test+doc trio.
//   - scope_appropriate required every changed file (incl. tests + .md docs,
//     which its regex didn't even match) to be name-dropped in the description.
//
// Test strategy mirrors compliance-rubric-source-loc.test.js: import
// QUICKFIX_RUBRIC and invoke the individual rule.check() functions directly.
// The linting_clean execSync branch is out of scope (would shell out); we test
// its new no-lintable-files short-circuit, which is pure.

import { describe, it, expect } from 'vitest';
import { QUICKFIX_RUBRIC } from '../../../lib/quickfix-compliance-rubric.js';

function findRule(id) {
  for (const cat of Object.values(QUICKFIX_RUBRIC)) {
    const found = cat.criteria?.find(c => c.id === id);
    if (found) return found;
  }
  throw new Error(`Rule not found: ${id}`);
}

describe('QF-20260526-738: targeted_fix counts only SOURCE files', () => {
  const rule = findRule('targeted_fix');

  it('passes a fix+test+doc trio (1 source file)', async () => {
    const r = await rule.check({ filesChanged: [
      'scripts/modules/x/foo.js',
      'scripts/modules/x/foo.test.js',
      'docs/reference/foo.md',
    ] });
    expect(r.passed).toBe(true);
    expect(r.score).toBe(5);
    expect(r.evidence).toMatch(/Source files changed:\s*1/);
    expect(r.evidence).toMatch(/2 test\/doc file\(s\) excluded/);
  });

  it('passes two source files (boundary)', async () => {
    const r = await rule.check({ filesChanged: ['lib/a.js', 'lib/b.js'] });
    expect(r.passed).toBe(true);
    expect(r.score).toBe(5);
  });

  it('penalizes three+ SOURCE files (genuine over-spread)', async () => {
    const r = await rule.check({ filesChanged: ['lib/a.js', 'lib/b.js', 'lib/c.js'] });
    expect(r.passed).toBe(false);
    expect(r.score).toBe(4); // 5 - (3 - 2)
  });

  it('handles missing filesChanged without throwing', async () => {
    const r = await rule.check({});
    expect(r.passed).toBe(true);
  });
});

describe('QF-20260526-738: scope_appropriate excludes test/doc files', () => {
  const rule = findRule('scope_appropriate');

  it('passes when the source file matches the description (test+doc excluded)', async () => {
    const r = await rule.check({
      issueDescription: 'Fix scripts/modules/x/foo.js negation handling',
      filesChanged: [
        'scripts/modules/x/foo.js',
        'scripts/modules/x/foo.test.js',
        'docs/reference/foo.md',
      ],
    });
    expect(r.passed).toBe(true);
    expect(r.score).toBe(5);
  });

  it('passes a test/doc-only change (no source file to match)', async () => {
    const r = await rule.check({
      issueDescription: 'Update foo.js docs',
      filesChanged: ['docs/reference/foo.md', 'scripts/x/foo.test.js'],
    });
    expect(r.passed).toBe(true);
    expect(r.score).toBe(5);
    expect(r.evidence).toMatch(/Only test\/doc files/);
  });

  it('still flags a genuinely unrelated source file', async () => {
    const r = await rule.check({
      issueDescription: 'Fix foo.js',
      filesChanged: ['scripts/x/foo.js', 'scripts/x/unrelated.js'],
    });
    expect(r.passed).toBe(false);
    expect(r.evidence).toMatch(/1\/2 source files/);
  });

  it('passes when no files are mentioned in the description', async () => {
    const r = await rule.check({ issueDescription: 'general cleanup', filesChanged: ['lib/a.js'] });
    expect(r.passed).toBe(true);
  });
});

describe('QF-20260526-738: linting_clean is change-scoped', () => {
  const rule = findRule('linting_clean');

  it('passes without shelling out when no lintable source files changed (docs-only)', async () => {
    const r = await rule.check({ filesChanged: ['docs/reference/foo.md'] });
    expect(r.passed).toBe(true);
    expect(r.score).toBe(5);
    expect(r.evidence).toMatch(/No lintable source files/);
  });

  it('skips files outside scripts|lib|tools (matches npm run lint scope)', async () => {
    const r = await rule.check({ filesChanged: ['README.md', 'some/other/path.js'] });
    expect(r.passed).toBe(true);
    expect(r.score).toBe(5);
  });
});
