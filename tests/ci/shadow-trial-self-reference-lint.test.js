/**
 * SD-LEO-INFRA-SHADOW-TRIAL-RATIFICATION-001-C (TS-5) — self-reference CI lint:
 * the shadow-trial sandbox's own governed artifacts (the eval-set corpus and the
 * shadow-trial policy modules) must carry the @governed-by marker binding their
 * mutations to the ratification contract. A direct edit that strips or forgets
 * the marker fails this lint in the unit tier on every PR (content-scan pattern
 * per tests/ci/sibling-a-recursive-failure-lint.test.js — commit trailers are not
 * unit-tier testable). The marker convention is the pre-ceremony enforcement
 * level; the hard proposal-row check lives in seal-eval-set.mjs's writer guard
 * and activates when the chairman ceremony applies governed_change_proposals.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const MARKER = /@governed-by:\s*SD-LEO-INFRA-SHADOW-TRIAL-RATIFICATION-001/;

/** The sandbox's own governed artifacts — extend when new policy modules land. */
const GOVERNED_FILES = [
  'lib/eval/eval-set-fixtures.mjs',
];

/** Pure lint core (exported shape for reuse): marker present? */
export function hasGovernanceMarker(content) {
  return MARKER.test(content);
}

describe('shadow-trial self-reference lint (TS-5)', () => {
  for (const rel of GOVERNED_FILES) {
    it(`${rel} carries the @governed-by marker`, () => {
      const p = resolve(process.cwd(), rel);
      expect(existsSync(p), `${rel} missing`).toBe(true);
      expect(hasGovernanceMarker(readFileSync(p, 'utf-8'))).toBe(true);
    });
  }

  it('NEGATIVE: a fixtures copy with the marker stripped fails the lint', () => {
    const content = readFileSync(resolve(process.cwd(), 'lib/eval/eval-set-fixtures.mjs'), 'utf-8');
    const stripped = content.replace(MARKER, 'governance marker removed by a direct edit');
    expect(hasGovernanceMarker(stripped)).toBe(false);
  });
});
