// QF-20260830-156: a frozen seat's per-session identity file stops updating once its own hook
// stops firing, so the statusline must render staleness rather than trusting an arbitrarily old
// name. staleSuffix is the pure formatting decision, extracted so it's testable without spinning
// up the whole stdin-reading statusline.cjs script.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { staleSuffix, STALE_THRESHOLD_MS } = require('../../.claude/fleet-identity-staleness.cjs');

describe('QF-20260830-156: staleSuffix', () => {
  it('is empty for a fresh file (well under the threshold)', () => {
    const now = 1_000_000_000;
    expect(staleSuffix(now - 60_000, now)).toBe('');
  });

  it('is empty exactly at the threshold boundary (age <= threshold)', () => {
    const now = 1_000_000_000;
    expect(staleSuffix(now - STALE_THRESHOLD_MS, now)).toBe('');
  });

  it('renders " (stale Nh)" once past the threshold, floored to whole hours', () => {
    const now = 1_000_000_000;
    const twentyThreeHoursMs = 23 * 3600 * 1000;
    expect(staleSuffix(now - twentyThreeHoursMs, now)).toBe(' (stale 23h)');
  });

  it('is empty for a missing/invalid mtime (fail-open — never fabricate staleness)', () => {
    expect(staleSuffix(undefined)).toBe('');
    expect(staleSuffix(NaN)).toBe('');
  });
});
