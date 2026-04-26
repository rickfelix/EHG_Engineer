/**
 * Vitest spec for bounded variant-retry helper.
 * SD-LEO-INFRA-STAGE-ARCHETYPE-GENERATION-001 ARM B
 */

import { describe, it, expect, vi } from 'vitest';
import { attemptVariantWithRetry, DEFAULT_MAX_RETRIES } from './variant-retry.js';

describe('attemptVariantWithRetry', () => {
  it('returns ok on first-attempt success without invoking onAttempt', async () => {
    const onAttempt = vi.fn();
    const result = await attemptVariantWithRetry(
      async () => 'html-payload',
      { onAttempt }
    );
    expect(result).toEqual({ ok: true, result: 'html-payload', attempts: 1 });
    expect(onAttempt).not.toHaveBeenCalled();
  });

  it('retries up to maxRetries and resolves ok if a later attempt succeeds', async () => {
    const onAttempt = vi.fn();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('blip'))
      .mockResolvedValueOnce('eventual-success');
    const result = await attemptVariantWithRetry(fn, { maxRetries: 2, onAttempt });

    expect(result).toEqual({ ok: true, result: 'eventual-success', attempts: 2 });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(onAttempt.mock.calls[0][0]).toMatchObject({
      attempt: 0,
      willRetry: true,
    });
    expect(onAttempt.mock.calls[0][0].error.message).toBe('blip');
  });

  it('returns ok=false with last error after all retries exhausted', async () => {
    const onAttempt = vi.fn();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('first'))
      .mockRejectedValueOnce(new Error('second'));
    const result = await attemptVariantWithRetry(fn, { maxRetries: 1, onAttempt });

    expect(result.ok).toBe(false);
    expect(result.error.message).toBe('second');
    expect(result.attempts).toBe(2);
    expect(onAttempt).toHaveBeenCalledTimes(2);
    expect(onAttempt.mock.calls[1][0]).toMatchObject({
      attempt: 1,
      willRetry: false,
    });
  });

  it('honors maxRetries=0 (single attempt, no retries)', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fatal'));
    const result = await attemptVariantWithRetry(fn, { maxRetries: 0 });

    expect(result.ok).toBe(false);
    expect(result.error.message).toBe('fatal');
    expect(result.attempts).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('uses DEFAULT_MAX_RETRIES when options.maxRetries omitted', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always-fails'));
    const result = await attemptVariantWithRetry(fn);

    expect(DEFAULT_MAX_RETRIES).toBe(1);
    expect(result.attempts).toBe(DEFAULT_MAX_RETRIES + 1); // 2
    expect(fn).toHaveBeenCalledTimes(DEFAULT_MAX_RETRIES + 1);
  });

  it('preserves err.name through the callback (LLMStreamStalled-aware)', async () => {
    class LLMStreamStalled extends Error {
      constructor() { super('stalled'); this.name = 'LLMStreamStalled'; }
    }
    const onAttempt = vi.fn();
    const fn = vi.fn().mockRejectedValueOnce(new LLMStreamStalled());

    await attemptVariantWithRetry(fn, { maxRetries: 0, onAttempt });

    expect(onAttempt.mock.calls[0][0].error.name).toBe('LLMStreamStalled');
  });

  it('attempt index passed to fn matches retry count', async () => {
    const seenAttempts = [];
    const fn = vi.fn(async (attempt) => {
      seenAttempts.push(attempt);
      if (attempt < 2) throw new Error(`attempt-${attempt}`);
      return 'ok';
    });
    const result = await attemptVariantWithRetry(fn, { maxRetries: 2 });

    expect(result.ok).toBe(true);
    expect(seenAttempts).toEqual([0, 1, 2]);
  });
});
