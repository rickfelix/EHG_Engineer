/**
 * SD-REFILL-00XK256L: the 2-hypothesis-bar guard for Adam urgent operational broadcasts.
 * Adam's research sweep twice fabricated a fleet-wide "model cutoff" alarm (a non-existent model +
 * invented citations) and broadcast it BEFORE running the cheap discriminating observable.
 * sanityCheckUrgentAdvisory(body) trips on the ALARM SHAPE — an urgent model-availability claim —
 * so the send path can block it unless the sender attests the bar was cleared (--alarm-verified).
 * It must trip on the fabrication class WITHOUT flagging ordinary advisories that mention a model.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { sanityCheckUrgentAdvisory } = require('../../scripts/adam-advisory.cjs');

describe('SD-REFILL-00XK256L: sanityCheckUrgentAdvisory', () => {
  it('TRIPS on the witnessed fabrication (fleet-wide model cutoff naming a non-existent model)', () => {
    const r = sanityCheckUrgentAdvisory('LIKELY FLEET-WIDE MODEL CUTOFF: US export-control disabled Fable 5 and Mythos 5 for all customers at 5:21 PM ET');
    expect(r.tripped).toBe(true);
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it('TRIPS on cutoff/disabled/deprecated/revoked/sunset language paired with a model token', () => {
    for (const body of [
      'the opus model was disabled',
      'claude is unavailable fleet-wide',
      'sonnet 4.6 deprecated effective immediately',
      'all LLM access revoked',
      'haiku model sunset announced',
      'export-controlled: claude shut down',
    ]) {
      expect(sanityCheckUrgentAdvisory(body).tripped, body).toBe(true);
    }
  });

  it('does NOT trip on ordinary advisories that merely mention a model (no alarm shape)', () => {
    for (const body of [
      'switched the sub-agent to Opus 4.8 for the review',
      'the gauge SD needs a Sonnet pass for the design doc',
      'fleet completed 21 SDs tonight',
      'claude code session arming a wakeup',
      'recommend using Haiku for the cheap classification step',
    ]) {
      expect(sanityCheckUrgentAdvisory(body).tripped, body).toBe(false);
    }
  });

  it('does NOT trip on cutoff/availability language with NO model token (different domain)', () => {
    expect(sanityCheckUrgentAdvisory('the Supabase pooler was unavailable for 5 minutes').tripped).toBe(false);
    expect(sanityCheckUrgentAdvisory('the worktree archive prune was disabled overnight').tripped).toBe(false);
  });

  it('handles empty / non-string input safely', () => {
    expect(sanityCheckUrgentAdvisory('').tripped).toBe(false);
    expect(sanityCheckUrgentAdvisory(null).tripped).toBe(false);
    expect(sanityCheckUrgentAdvisory(undefined).tripped).toBe(false);
  });
});
