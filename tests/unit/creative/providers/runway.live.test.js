/**
 * SD-LEO-FEAT-RUNWAY-CLIENT-IMPLEMENT-001 — TS-10, the ONE opt-in live smoke test.
 * Double-gated (RUN_LIVE_PROVIDER_TESTS=1 AND a real key) so CI never spends real RunwayML
 * API credits. Skipped entirely -- no network call attempted -- when either condition is false.
 */
import { describe, it, expect } from 'vitest';
import { generateWithRunway, isRunwayConfigured } from '../../../../lib/creative/providers/runway.js';

const liveEnabled = process.env.RUN_LIVE_PROVIDER_TESTS === '1' && isRunwayConfigured();

describe.skipIf(!liveEnabled)('generateWithRunway (TS-10, live RunwayML API)', () => {
  it('generates a real image and returns a fetchable output URL with runway provenance', async () => {
    const result = await generateWithRunway({
      capability: 'image',
      spec: { prompt: 'a red apple on a white background' },
    });

    expect(result.provenance.provider).toBe('runway');
    expect(result.provenance.request_id).toBeTruthy();
    expect(result.asset.url).toMatch(/^https:\/\//);
  }, 180_000);
});
