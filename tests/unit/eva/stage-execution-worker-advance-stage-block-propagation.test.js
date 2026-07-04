/**
 * SD-LEO-INFRA-STAGE-ADVANCEMENT-ARTIFACT-001 — regression guard for an adversarial-review
 * finding on this SD's own PR (#5557): _advanceStage() communicates an artifact-gate block by
 * RETURNING {blocked:true} rather than throwing (same convention as the pre-existing S19/
 * product-review choke-points), but every one of the 7 call sites inside the daemon-walk loop
 * (_processVenture) originally discarded that return value and proceeded to the next stage
 * in-memory regardless — the gate correctly froze the DB write, but the walk itself did not
 * stop, so a venture could still reach markCompleted() with a stage the gate had just refused.
 *
 * A live-loop test would need to mock the entire _processVenture harness (locking,
 * _executeWithRetry, S20 pause controller, governance overrides, etc.) for marginal benefit
 * over what stage-execution-worker-product-review-gate.test.js already covers at the
 * _advanceStage level. Instead this asserts the structural invariant directly against the
 * source: every `await this._advanceStage(` call site must have a `.blocked` check on its
 * result before the loop is allowed to continue — catching a future edit that reintroduces a
 * discarded return value, which is exactly how this regressed the first time.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE_PATH = resolve(process.cwd(), 'lib/eva/stage-execution-worker.js');

describe('_advanceStage call sites propagate a blocked result (adversarial-review finding, PR #5557)', () => {
  it('every call site captures the return value and checks .blocked before the loop proceeds', () => {
    const source = readFileSync(SOURCE_PATH, 'utf8');
    const lines = source.split('\n');

    const callSiteLines = [];
    lines.forEach((line, idx) => {
      if (/await this\._advanceStage\(/.test(line)) {
        callSiteLines.push({ idx, line });
      }
    });

    // Sanity: fail loudly if the call sites are refactored away entirely (would silently
    // pass an empty assertion loop otherwise).
    expect(callSiteLines.length).toBeGreaterThanOrEqual(7);

    for (const { idx, line } of callSiteLines) {
      // The call must assign its result to a variable (not a bare `await this._advanceStage(...)`
      // with the return value discarded).
      expect(line).toMatch(/=\s*await this\._advanceStage\(/);

      // Within the next 6 lines, there must be a `.blocked` check on that captured result,
      // and a `break` in the blocked branch (not just a log) so the loop actually halts.
      const windowText = lines.slice(idx, idx + 7).join('\n');
      expect(windowText).toMatch(/\.blocked\)/);
      expect(windowText).toMatch(/\bbreak;/);
    }
  });
});
