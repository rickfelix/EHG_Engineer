/**
 * Unit test — QF-20260816-457
 *
 * isIdle previously read sessionData?.sd_id, a column never selected from claude_sessions
 * (the real column is sd_key), so isIdle was ~always true regardless of an actual claim.
 * resolveIsIdle is pure — no DB.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { resolveIsIdle } = require('../../scripts/hooks/coordination-inbox.cjs');

describe('resolveIsIdle (QF-20260816-457)', () => {
  it('a session row with sd_key set is NOT idle', () => {
    expect(resolveIsIdle({ sd_key: 'SD-LEO-INFRA-EXAMPLE-001', metadata: {} })).toBe(false);
  });

  it('a session row with sd_key null IS idle', () => {
    expect(resolveIsIdle({ sd_key: null, metadata: {} })).toBe(true);
  });

  it('a missing session row (query failure upstream) IS idle', () => {
    expect(resolveIsIdle(undefined)).toBe(true);
  });

  it('sd_id being set does NOT affect the result — sd_id is not the claim column', () => {
    expect(resolveIsIdle({ sd_id: 'some-uuid', sd_key: null })).toBe(true);
  });
});
