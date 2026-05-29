/**
 * Regression: the orchestrator must thread `nonInteractive` into the git-operations calls,
 * otherwise QF-888's commit/push/merge guards are dead code.
 *
 * QF-20260529-168 (found dogfooding QF-888): git-operations.js gained nonInteractive guards
 * in QF-888, but orchestrator.js called commitAndPushChanges / mergeToMain with only
 * { forceComplete, reason } — so a --non-interactive completion still hit the "Merge to main
 * now?" prompt. QF-888's static test only checked the guards EXIST, not that they're wired,
 * so it passed while the behavior was broken. This pins the wiring.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const orchPath = fileURLToPath(
  new URL('../../scripts/modules/complete-quick-fix/orchestrator.js', import.meta.url)
);
const orch = readFileSync(orchPath, 'utf8');

describe('orchestrator threads nonInteractive into git-ops calls (QF-20260529-168)', () => {
  it('commitAndPushChanges receives nonInteractive: options.nonInteractive', () => {
    expect(orch).toMatch(/commitAndPushChanges\([^\n]*nonInteractive:\s*options\.nonInteractive/);
  });

  it('mergeToMain receives nonInteractive: options.nonInteractive', () => {
    expect(orch).toMatch(/mergeToMain\([^\n]*nonInteractive:\s*options\.nonInteractive/);
  });
});
