/**
 * Vision-score async-trigger tests — SD-LEO-INFRA-SILENT-STALL-PREVENTION-001.
 * Proves the trigger is fire-and-forget + FAIL-OPEN: already-scored / no-key → no-op; happy path calls the
 * injected scoreSD exactly once and returns SYNCHRONOUSLY; an injected scoreSD that REJECTS (or throws
 * synchronously) never produces an unhandled rejection and never blocks the caller. Fakes only — zero DB / LLM.
 */
import { describe, it, expect, vi } from 'vitest';
import { triggerAsyncVisionScore } from '../../scripts/modules/handoff/executors/lead-to-plan/gates/vision-score-async-trigger.js';

const fakeSupabase = { __fake: true };
const flush = () => new Promise((r) => setTimeout(r, 0)); // let detached promises settle

describe('triggerAsyncVisionScore — no-op guards', () => {
  it('does nothing when the SD already has a vision_score', () => {
    const scoreSD = vi.fn();
    const r = triggerAsyncVisionScore({ sd_key: 'SD-X', vision_score: 80 }, fakeSupabase, { scoreSD });
    expect(r.triggered).toBe(false);
    expect(scoreSD).not.toHaveBeenCalled();
  });

  it('does nothing when no SD is supplied', () => {
    const scoreSD = vi.fn();
    expect(triggerAsyncVisionScore(null, fakeSupabase, { scoreSD }).triggered).toBe(false);
    expect(scoreSD).not.toHaveBeenCalled();
  });

  it('does nothing when the SD has no sd_key/id', () => {
    const scoreSD = vi.fn();
    const r = triggerAsyncVisionScore({ vision_score: null }, fakeSupabase, { scoreSD });
    expect(r.triggered).toBe(false);
    expect(scoreSD).not.toHaveBeenCalled();
  });
});

describe('triggerAsyncVisionScore — happy path (fire-and-forget)', () => {
  it('launches the injected scoreSD once with {sdKey,supabase} and returns synchronously', async () => {
    const scoreSD = vi.fn().mockResolvedValue({ ok: true });
    const r = triggerAsyncVisionScore({ sd_key: 'SD-NULL', vision_score: null }, fakeSupabase, { scoreSD });
    // Returns synchronously BEFORE the async score resolves (fire-and-forget).
    expect(r.triggered).toBe(true);
    await flush();
    expect(scoreSD).toHaveBeenCalledTimes(1);
    expect(scoreSD).toHaveBeenCalledWith(expect.objectContaining({ sdKey: 'SD-NULL', supabase: fakeSupabase }));
  });

  it('uses sd.id when sd_key is absent', async () => {
    const scoreSD = vi.fn().mockResolvedValue({});
    triggerAsyncVisionScore({ id: 'SD-BY-ID', vision_score: undefined }, fakeSupabase, { scoreSD });
    await flush();
    expect(scoreSD).toHaveBeenCalledWith(expect.objectContaining({ sdKey: 'SD-BY-ID' }));
  });
});

describe('triggerAsyncVisionScore — fail-open', () => {
  it('a REJECTING scoreSD never blocks the caller and never produces an unhandled rejection', async () => {
    const onError = vi.fn();
    const scoreSD = vi.fn().mockRejectedValue(new Error('LLM timeout'));
    // The call itself must not throw...
    const r = triggerAsyncVisionScore({ sd_key: 'SD-REJ', vision_score: null }, fakeSupabase, { scoreSD, onError });
    expect(r.triggered).toBe(true);
    await flush();
    // ...and the rejection must be swallowed into the error sink (no unhandled rejection).
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatch(/SD-REJ.*non-blocking/i);
  });

  it('a scoreSD that THROWS synchronously is caught (fail-open, returns gracefully)', () => {
    const onError = vi.fn();
    const scoreSD = vi.fn(() => { throw new Error('sync boom'); });
    // Promise.resolve().then(() => scorer(...)) defers the throw into a rejection, so .triggered is still true
    // and the throw is routed to onError — never propagated to the caller.
    const r = triggerAsyncVisionScore({ sd_key: 'SD-THROW', vision_score: null }, fakeSupabase, { scoreSD, onError });
    expect(r.triggered).toBe(true);
  });

  it('default error sink (console.debug) does not throw when scoreSD rejects', async () => {
    const scoreSD = vi.fn().mockRejectedValue(new Error('boom'));
    expect(() => triggerAsyncVisionScore({ sd_key: 'SD-D', vision_score: null }, fakeSupabase, { scoreSD })).not.toThrow();
    await flush(); // no unhandled rejection surfaces
  });
});
