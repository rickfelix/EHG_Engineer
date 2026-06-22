/**
 * SD-LEO-INFRA-WORKER-ANTI-PREMATURE-WINDDOWN-001 (FR-1): the enforceable lever.
 * The check-in payload must carry an anti-wind-down directive when a worker holds/just-claimed
 * RANKED claimable work, encoding CLAUDE.md's forbidden non-pause-triggers (FR-2 no-release-while-
 * claimable), the decompose-don't-release norm (FR-3), and the legitimate-defer guardrail (FR-4).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { antiWinddownDirective } = require('../../scripts/worker-checkin.cjs');

describe('SD-LEO-INFRA-WORKER-ANTI-PREMATURE-WINDDOWN-001 FR-1: antiWinddownDirective', () => {
  it('renders the ranked belt depth when N > 0 (kills the "drained" vibe with data)', () => {
    const d = antiWinddownDirective(7);
    expect(d).toMatch(/belt has 7 ranked claimable/i);
  });

  it('falls back to a generic "you hold ranked claimable work" when the count is unknown/zero', () => {
    for (const v of [0, null, undefined, NaN]) {
      const d = antiWinddownDirective(v);
      expect(d).toMatch(/you hold ranked claimable work/i);
      expect(d).not.toMatch(/belt has 0/i);
    }
  });

  it('FR-2: names the forbidden non-pause-triggers and forbids releasing claimable ranked work', () => {
    const d = antiWinddownDirective(3);
    expect(d).toMatch(/FORBIDDEN/);
    expect(d).toMatch(/scope size/i);
    expect(d).toMatch(/context length/i);
    expect(d).toMatch(/session-tail/i);
    expect(d).toMatch(/drained/i);
    expect(d).toMatch(/releasing claimable ranked work/i);
  });

  it('FR-3: surfaces decompose-don\'t-release for a too-large/design-heavy SD', () => {
    const d = antiWinddownDirective(3);
    expect(d).toMatch(/DECOMPOSE/);
    expect(d).toMatch(/do not release/i);
  });

  it('FR-4: preserves legitimate defer — only a genuinely-blocked SD, with a logged reason', () => {
    const d = antiWinddownDirective(3);
    expect(d).toMatch(/genuinely-blocked/i);
    expect(d).toMatch(/logged blocker reason/i);
  });

  it('module is import-safe (require.main guard) — requiring it for this test did not run the check-in', () => {
    expect(typeof antiWinddownDirective).toBe('function');
  });
});
