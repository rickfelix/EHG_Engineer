/**
 * Unit tests for the claim-holding status set + computeClaimedSdKeys helper.
 * SD-LEO-INFRA-EXPOSE-CLAIM-OWNER-001 (FR-3) — absorbs QF-20260526-577.
 *
 * Invariant: a session classified as a claim-holding status must NEVER appear
 * available-to-claim. The same set drives the worker-render filter, so if this
 * test passes, the two stale-session-sweep call sites cannot disagree.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { CLAIM_HOLDING_STATUSES, computeClaimedSdKeys } = require('./holding-statuses.cjs');

describe('CLAIM_HOLDING_STATUSES (FR-3 invariant)', () => {
  it('contains exactly the three classified statuses that mean "session is holding its claim"', () => {
    // Pinning the set guards against silent drift if classifySessions() adds a
    // new alive-status without updating this definition.
    expect([...CLAIM_HOLDING_STATUSES].sort()).toEqual(
      ['ACTIVE', 'ALIVE_NO_HEARTBEAT', 'ALIVE_SOURCE_SIDE']
    );
  });

  it('does NOT include STALE_UNKNOWN or DEAD (those statuses release the claim)', () => {
    expect(CLAIM_HOLDING_STATUSES.has('STALE_UNKNOWN')).toBe(false);
    expect(CLAIM_HOLDING_STATUSES.has('DEAD')).toBe(false);
  });
});

describe('computeClaimedSdKeys (FR-3 — the consistency helper)', () => {
  it('treats all three live statuses as claim-holding', () => {
    const result = computeClaimedSdKeys([
      { sd_key: 'SD-A', status: 'ACTIVE' },
      { sd_key: 'SD-B', status: 'ALIVE_NO_HEARTBEAT' },
      { sd_key: 'SD-C', status: 'ALIVE_SOURCE_SIDE' },
    ]);
    expect(result).toBeInstanceOf(Set);
    expect([...result].sort()).toEqual(['SD-A', 'SD-B', 'SD-C']);
  });

  // The original RCA 269e55cc symptom: a lone ALIVE_NO_HEARTBEAT holder was
  // advertised available-to-claim while still rendered as a worker. This test
  // is the regression pin.
  it('keeps a lone ALIVE_NO_HEARTBEAT holder out of the available-to-claim pool', () => {
    const claimed = computeClaimedSdKeys([
      { sd_key: 'SD-X', status: 'ALIVE_NO_HEARTBEAT' },
    ]);
    expect(claimed.has('SD-X')).toBe(true);
  });

  it('keeps a lone ALIVE_SOURCE_SIDE holder out of the available-to-claim pool', () => {
    const claimed = computeClaimedSdKeys([
      { sd_key: 'SD-Y', status: 'ALIVE_SOURCE_SIDE' },
    ]);
    expect(claimed.has('SD-Y')).toBe(true);
  });

  it('excludes STALE_UNKNOWN and DEAD holders (claim-guard subsystem reclaims those)', () => {
    const claimed = computeClaimedSdKeys([
      { sd_key: 'SD-STALE', status: 'STALE_UNKNOWN' },
      { sd_key: 'SD-DEAD', status: 'DEAD' },
    ]);
    expect(claimed.size).toBe(0);
  });

  it('ignores idle sessions (no sd_key)', () => {
    const claimed = computeClaimedSdKeys([
      { sd_key: null, status: 'ACTIVE' },
      { sd_key: '', status: 'ACTIVE' },
      { status: 'ACTIVE' }, // no sd_key field at all
    ]);
    expect(claimed.size).toBe(0);
  });

  it('returns an empty set for malformed input rather than throwing', () => {
    expect(computeClaimedSdKeys(null).size).toBe(0);
    expect(computeClaimedSdKeys(undefined).size).toBe(0);
    expect(computeClaimedSdKeys('not an array').size).toBe(0);
  });

  it('deduplicates when two sessions hold the same sd_key (rare race)', () => {
    const claimed = computeClaimedSdKeys([
      { sd_key: 'SD-DUP', status: 'ACTIVE' },
      { sd_key: 'SD-DUP', status: 'ALIVE_NO_HEARTBEAT' },
    ]);
    expect(claimed.size).toBe(1);
    expect(claimed.has('SD-DUP')).toBe(true);
  });
});
