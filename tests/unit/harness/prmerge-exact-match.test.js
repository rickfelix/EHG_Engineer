// QF-20260509-PRMERGE-EXACT: PR_MERGE_VERIFICATION + PR_PRECHECK gates must
// use exact-match regex (anchored at ^ and $) instead of .includes(pattern)
// for branch-name matching. Closes feedback 9d55499d.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const gatesFile = path.join(repoRoot, 'scripts/modules/handoff/executors/lead-final-approval/gates.js');

describe('QF-20260509-PRMERGE-EXACT: branch-name matching anchors prefix and SD-key', () => {
  let src;
  beforeAll(() => {
    src = fs.readFileSync(gatesFile, 'utf-8');
  });

  it('builds exactBranchRegex with ^ and $ anchors (anchored)', () => {
    expect(src).toMatch(/exactBranchRegex\s*=\s*new RegExp\(`\^\(feat\|fix\|docs\|test\)\/\$\{sdIdEscaped\}\$`/);
  });

  it('escapes regex metacharacters in sdId before building the regex', () => {
    expect(src).toMatch(/sdIdEscaped\s*=\s*sdId\.replace/);
  });

  it('PR_MERGE_VERIFICATION gate filters PRs via exactBranchRegex.test (not includes)', () => {
    const idx = src.indexOf("name: 'PR_MERGE_VERIFICATION'");
    expect(idx).toBeGreaterThan(0);
    const block = src.slice(idx, idx + 4000);
    expect(block).toMatch(/prs\.filter\(pr => exactBranchRegex\.test\(pr\.headRefName\)\)/);
  });

  it('PR_PRECHECK gate filters PRs via exactBranchRegex.test (not includes)', () => {
    const idx = src.indexOf("name: 'PR_PRECHECK'");
    expect(idx).toBeGreaterThan(0);
    const block = src.slice(idx, idx + 2500);
    expect(block).toMatch(/prs\.filter\(pr => exactBranchRegex\.test\(pr\.headRefName\)\)/);
  });

  it('unmerged-branch-list scan strips origin/ prefix before regex test', () => {
    const idx = src.indexOf("git branch -r");
    expect(idx).toBeGreaterThan(0);
    const block = src.slice(idx, idx + 1500);
    expect(block).toMatch(/branchName\s*=\s*b\.replace/);
    expect(block).toMatch(/exactBranchRegex\.test\(branchName\)/);
  });

  it('regression-pin: pre-fix bare `branchPatterns.some(p => ...includes(p)` removed from PR-filtering paths', () => {
    expect(src).not.toMatch(/prs\.filter\(pr =>\s*branchPatterns\.some\(/);
  });

  it('exactBranchRegex distinguishes exact vs extended-suffix names (behavioral simulation)', () => {
    const sdId = 'SD-LEO-FEAT-STAGE-POST-LAUNCH-002';
    const sdIdEscaped = sdId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`^(feat|fix|docs|test)/${sdIdEscaped}$`, 'i');
    expect(re.test('feat/SD-LEO-FEAT-STAGE-POST-LAUNCH-002')).toBe(true);
    expect(re.test('fix/SD-LEO-FEAT-STAGE-POST-LAUNCH-002')).toBe(true);
    expect(re.test('feat/SD-LEO-FEAT-STAGE-POST-LAUNCH-002-stage-25-post-launch-review-ehg-frontend')).toBe(false);
    expect(re.test('feat/SD-LEO-FEAT-STAGE-POST-LAUNCH-003')).toBe(false);
    expect(re.test('chore/SD-LEO-FEAT-STAGE-POST-LAUNCH-002')).toBe(false);
  });
});
