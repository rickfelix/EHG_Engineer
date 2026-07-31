import { describe, it, expect, vi } from 'vitest';
import { releaseRequestState } from '../../../lib/checkin/steps/release-request.cjs';
import releaseRequestStep from '../../../lib/checkin/steps/release-request.cjs';

const released = vi.hoisted(() => ({ value: true }));
vi.mock('../../../lib/fleet/best-effort-release.mjs', () => ({
  bestEffortReleaseSd: async () => ({ released: released.value, error: null }),
}));

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

// FR-1 (SD-LEO-INFRA-FULL-UTILISATION-RECOVERY-001). ctx.mySd is a one-shot snapshot taken in
// worker-checkin.cjs BEFORE the ladder runs, so honouring a release did NOT stop the very next
// step (resume) from re-attaching the SD just released — defeating the contract index.cjs states
// ("BEFORE resume, so a released SD is not re-attached this same tick").
describe('FR-1 release-request clears the stale ctx.mySd snapshot', () => {
  const SESSION = 'sess-1';
  const SD_KEY = 'SD-TEST-RELEASE-001';

  function fakeSb() {
    return {
      from(table) {
        if (table === 'system_events') return { insert: async () => ({}) };
        return {
          select: () => ({
            eq: () => ({
              limit: async () => ({
                data: [{
                  id: 'row-1',
                  sd_key: SD_KEY,
                  metadata: { release_request: { requested_at: new Date().toISOString(), reason: 'test' } },
                }],
              }),
            }),
          }),
          // conditional-clear chain: update().eq().eq().select('id')
          update: () => ({ eq: () => ({ eq: () => ({ select: async () => ({ data: [{ id: 'row-1' }], error: null }) }) }) }),
        };
      },
    };
  }

  const ctxFor = () => ({ sb: fakeSb(), sessionId: SESSION, mySd: SD_KEY, base: {} });

  it('nulls ctx.mySd after a confirmed release, so resume falls through instead of re-attaching', async () => {
    released.value = true;
    const ctx = ctxFor();
    await releaseRequestStep.run(ctx);
    expect(ctx.base.release_requests_honored?.[0]?.sd).toBe(SD_KEY);
    expect(ctx.mySd).toBeNull();
  });

  it('PRESERVES ctx.mySd when the release did not actually happen', async () => {
    released.value = false;
    const ctx = ctxFor();
    await releaseRequestStep.run(ctx);
    // The claim may still be held — resume must still see it. Clearing here would strand the SD.
    expect(ctx.mySd).toBe(SD_KEY);
  });
});
