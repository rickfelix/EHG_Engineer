/**
 * QF-20260902-542 — ENF-18 Premature Handoff Execute Refusal.
 *
 * Pins the pure command-parsing seam behaviourally, imported from its own
 * side-effect-free module (scripts/hooks/lib/handoff-execute-precheck-guard.cjs).
 * NOT imported from pre-tool-enforce.cjs directly — that file's module-load-time
 * `fs.readFileSync(0)` stdin read blocks under a test runner whose stdin never
 * reaches EOF, which is exactly why ENF-17/ENF-12e's decision logic also lives
 * in its own lib module (shared-tree-guard.cjs / worktree-add-sibling-guard.cjs).
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseHandoffExecuteCall, evaluateHandoffExecutePrecheck } = require('../lib/handoff-execute-precheck-guard.cjs');

describe('ENF-18 parseHandoffExecuteCall', () => {
  it('extracts handoffType (uppercased) and sdId from a plain execute call', () => {
    expect(parseHandoffExecuteCall('node scripts/handoff.js execute EXEC-TO-PLAN SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-012'))
      .toEqual({ handoffType: 'EXEC-TO-PLAN', sdId: 'SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-012' });
  });

  it('extracts through an env-var prefix (CLAUDE_SESSION_ID=... node scripts/handoff.js execute ...)', () => {
    expect(parseHandoffExecuteCall('CLAUDE_SESSION_ID=abc123 node scripts/handoff.js execute lead-to-plan SD-FOO-001'))
      .toEqual({ handoffType: 'LEAD-TO-PLAN', sdId: 'SD-FOO-001' });
  });

  it('never matches the dry-run precheck command word (the guard\'s own remediation target)', () => {
    expect(parseHandoffExecuteCall('node scripts/handoff.js precheck EXEC-TO-PLAN SD-FOO-001')).toBeNull();
  });

  it('null for an unrelated command', () => {
    expect(parseHandoffExecuteCall('git status')).toBeNull();
    expect(parseHandoffExecuteCall('')).toBeNull();
    expect(parseHandoffExecuteCall(undefined)).toBeNull();
  });
});

// SD-LEO-FIX-KPI-COUNTS-CHEAP-001 (VALIDATION-agent LEAD-phase finding): the original inline
// version passed the raw CLI token straight into validateSubagentEvidence, silently matching
// zero evidence rows and refusing essentially every real execute call. These pin the fixed
// resolve-then-validate decision with injected mocks -- no live DB, no dynamic import.
describe('ENF-18 evaluateHandoffExecutePrecheck', () => {
  const supabase = { marker: 'fake-client' };
  const sd = { id: 'uuid-resolved-1234', sd_key: 'SD-FOO-001' };

  it('refuses when evidence is absent, and resolves the SD row FIRST (not the raw CLI token)', async () => {
    const resolveSdInputOrNull = vi.fn().mockResolvedValue({ sd });
    const validateSubagentEvidence = vi.fn().mockResolvedValue({ passed: false, details: { missing: ['VALIDATION'] } });
    const result = await evaluateHandoffExecutePrecheck(
      { handoffType: 'LEAD-TO-PLAN', rawSdId: 'SD-FOO-001', supabase },
      { resolveSdInputOrNull, validateSubagentEvidence }
    );
    expect(result).toEqual({ refuse: true, missing: ['VALIDATION'], resolvedSdId: 'uuid-resolved-1234' });
    expect(resolveSdInputOrNull).toHaveBeenCalledWith('SD-FOO-001', supabase);
    // The RESOLVED sd (with the potentially-different .id) must reach the evidence call, not the raw token.
    expect(validateSubagentEvidence.mock.calls[0][0]).toMatchObject({ sd, sdId: 'uuid-resolved-1234' });
  });

  it('never refuses on a WAIT verdict (evidence mid-write)', async () => {
    const resolveSdInputOrNull = vi.fn().mockResolvedValue({ sd });
    const validateSubagentEvidence = vi.fn().mockResolvedValue({ passed: false, wait: true, details: {} });
    const result = await evaluateHandoffExecutePrecheck(
      { handoffType: 'LEAD-TO-PLAN', rawSdId: 'SD-FOO-001', supabase },
      { resolveSdInputOrNull, validateSubagentEvidence }
    );
    expect(result).toEqual({ refuse: false });
  });

  it('fails open on an infra failure (MISSING_CONTEXT/DB_ERROR carry no wait field)', async () => {
    const resolveSdInputOrNull = vi.fn().mockResolvedValue({ sd });
    for (const reason of ['MISSING_CONTEXT', 'DB_ERROR']) {
      const validateSubagentEvidence = vi.fn().mockResolvedValue({ passed: false, details: { reason } });
      const result = await evaluateHandoffExecutePrecheck(
        { handoffType: 'LEAD-TO-PLAN', rawSdId: 'SD-FOO-001', supabase },
        { resolveSdInputOrNull, validateSubagentEvidence }
      );
      expect(result).toEqual({ refuse: false });
    }
  });

  it('fails open when the SD identifier cannot be resolved at all (never calls validateSubagentEvidence)', async () => {
    const resolveSdInputOrNull = vi.fn().mockResolvedValue({ sd: null });
    const validateSubagentEvidence = vi.fn();
    const result = await evaluateHandoffExecutePrecheck(
      { handoffType: 'LEAD-TO-PLAN', rawSdId: 'SD-DOES-NOT-EXIST-999', supabase },
      { resolveSdInputOrNull, validateSubagentEvidence }
    );
    expect(result).toEqual({ refuse: false });
    expect(validateSubagentEvidence).not.toHaveBeenCalled();
  });

  it('allows through when evidence passes', async () => {
    const resolveSdInputOrNull = vi.fn().mockResolvedValue({ sd });
    const validateSubagentEvidence = vi.fn().mockResolvedValue({ passed: true, details: {} });
    const result = await evaluateHandoffExecutePrecheck(
      { handoffType: 'LEAD-TO-PLAN', rawSdId: 'SD-FOO-001', supabase },
      { resolveSdInputOrNull, validateSubagentEvidence }
    );
    expect(result).toEqual({ refuse: false });
  });
});
