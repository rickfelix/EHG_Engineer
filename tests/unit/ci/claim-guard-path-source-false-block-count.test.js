// SD-LEO-INFRA-CLAIM-GUARD-BRANCH-DERIVED-001 FR-5a: the CI predicate script's re-derivation
// must use the SAME anchored rule the guard itself uses (deriveKeyFromBranch), or the predicate
// answers a different question than the one it claims to.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { deriveKeyFromBranch } from '../../../scripts/ci/claim-guard-path-source-false-block-count.mjs';

const require_ = createRequire(import.meta.url);
const { deriveKeyFromBranch: guardDerive } = require_('../../../scripts/hooks/worktree-claim-decision.cjs');

describe('claim-guard-path-source-false-block-count.mjs: deriveKeyFromBranch', () => {
  it('matches the guard\'s own derivation exactly for a range of branch shapes', () => {
    const cases = [
      'feat/SD-X-001-close-paths',
      'feat/SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B',
      'qf/QF-20260903-188',
      'main',
      'chore/cleanup',
      null,
    ];
    for (const branch of cases) {
      expect(deriveKeyFromBranch(branch)).toBe(guardDerive(branch));
    }
  });

  it('never throws on malformed input', () => {
    expect(() => deriveKeyFromBranch(undefined)).not.toThrow();
    expect(() => deriveKeyFromBranch(42)).not.toThrow();
  });
});
