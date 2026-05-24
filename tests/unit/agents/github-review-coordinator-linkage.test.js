/**
 * QF-20260524-320 — regression tests for classifyLinkage() in the agentic-review
 * coordinator. Locks the SD/PRD/Backlog linkage check against the key-convention
 * fragility class (PAT-CI-REGEX-LINKAGE-FRAGILITY-001): the prior regexes could
 * not match digit-leading SD domains (SD-S19-...) or alpha-prefixed backlog ids
 * (BL-S19A-001), hard-FAILing properly-linked PRs.
 */
import { describe, it, expect } from 'vitest';
import { classifyLinkage } from '../../../lib/agents/github-review-coordinator.js';

describe('classifyLinkage', () => {
  // --- The bug this fixes: digit-leading SD domain + child suffix ---
  it('recognizes an SD key with a digit-leading domain (SD-S19-...) and child suffix', () => {
    const r = classifyLinkage('feat(SD-S19-SEEDS-A-CLAUDECODEREADY-ORCH-001-A): writers');
    // Must NOT hard-FAIL — the SD is referenced (linkage lives in the DB).
    expect(r.status).not.toBe('FAIL');
    expect(r.status).toBe('WARN');
    expect(r.message).toContain('SD-S19-SEEDS-A-CLAUDECODEREADY-ORCH-001');
  });

  it('matches an alpha-prefixed backlog id (BL-S19A-001) as backlog linkage', () => {
    const r = classifyLinkage('SD-S19-SEEDS-A-CLAUDECODEREADY-ORCH-001-A and BL-S19A-001');
    expect(r.status).toBe('PASS');
  });

  // --- Existing conventions must still work (no regression) ---
  it('PASSes a conventional SD + PRD reference', () => {
    const r = classifyLinkage('SD-LEO-INFRA-001 PRD-SD-LEO-INFRA-001');
    expect(r.status).toBe('PASS');
  });

  it('PASSes a numeric backlog id (BL-001) with a bug-fix SD', () => {
    const r = classifyLinkage('SD-FOO-BAR-001 fixes BL-001 bug');
    expect(r.status).toBe('PASS');
  });

  it('PASSes a quick-fix PR (QF token, no SD/PRD required)', () => {
    const r = classifyLinkage('chore(QF-20260524-320): re-trigger');
    expect(r.status).toBe('PASS');
    expect(r.message).toContain('QF-20260524-320');
  });

  it('PASSes an internal SD (INFRA) without an external PRD', () => {
    const r = classifyLinkage('SD-LEO-INFRA-FOO-001 backend-only');
    expect(r.status).toBe('PASS');
  });

  // --- Genuinely untracked PRs still FAIL (the gate still works) ---
  it('FAILs a PR with no SD/QF reference at all', () => {
    const r = classifyLinkage('random PR with no linkage tokens');
    expect(r.status).toBe('FAIL');
  });

  it('handles empty/undefined input without throwing', () => {
    expect(classifyLinkage('').status).toBe('FAIL');
    expect(classifyLinkage(undefined).status).toBe('FAIL');
  });
});
