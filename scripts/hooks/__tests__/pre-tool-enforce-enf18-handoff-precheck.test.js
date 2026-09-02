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
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseHandoffExecuteCall } = require('../lib/handoff-execute-precheck-guard.cjs');

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
