import { describe, it, expect } from 'vitest';
import { releaseRequestState } from '../../../lib/checkin/steps/release-request.cjs';

describe('TS-5 releaseRequestState (pure part of the release-request step)', () => {
  const now = Date.parse('2026-07-16T12:00:00Z');
  it('absent/malformed -> null', () => {
    expect(releaseRequestState({}, now)).toBeNull();
    expect(releaseRequestState(null, now)).toBeNull();
    expect(releaseRequestState({ release_request: { reason: 'x' } }, now)).toBeNull();
  });
  it('live within TTL; expired past TTL; no/invalid TTL = live forever', () => {
    const rr = (mins, ttl) => ({ release_request: { requested_at: new Date(now - mins * 60000).toISOString(), ttl_minutes: ttl } });
    expect(releaseRequestState(rr(5, 30), now)).toBe('live');
    expect(releaseRequestState(rr(31, 30), now)).toBe('expired');
    expect(releaseRequestState(rr(9999, undefined), now)).toBe('live');
    expect(releaseRequestState(rr(9999, -5), now)).toBe('live');
  });
});
