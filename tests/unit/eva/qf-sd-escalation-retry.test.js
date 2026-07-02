// SD-LEO-INFRA-QF-SD-ESCALATION-LINK-CANONICAL-TRACK-001 (FR-2)
// createFromQF() in scripts/leo-create-sd.js is unexported, so its retry wiring
// is verified via source-text assertions in
// tests/unit/harness/leo-create-flags-parity.test.js. This file behaviorally
// verifies the underlying withRetry() primitive it composes: a transient
// failure recovers, and an exhausted retry budget propagates the last error
// (the exact two behaviors FR-2 depends on).

import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../../../lib/eva/stage-zero/data-pollers/retry.js';

describe('withRetry — QF retirement hardening primitive (FR-2)', () => {
  it('recovers when the wrapped fn fails on the first attempts and succeeds later', async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts += 1;
      if (attempts < 3) throw new Error(`transient failure #${attempts}`);
      return { ok: true };
    });

    const result = await withRetry(fn, { maxRetries: 2, baseDelayMs: 1, timeoutMs: 1000, logger: { log: () => {} } });

    expect(result).toEqual({ ok: true });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws the last error once the retry budget is exhausted, without retrying a 4th time', async () => {
    const fn = vi.fn(async () => {
      throw new Error('permanent failure');
    });

    await expect(
      withRetry(fn, { maxRetries: 2, baseDelayMs: 1, timeoutMs: 1000, logger: { log: () => {} } })
    ).rejects.toThrow('permanent failure');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('a Supabase-style {error} response must be thrown explicitly to be retried (supabase-js does not throw on its own)', async () => {
    let attempts = 0;
    const fakeSupabaseUpdate = async () => {
      attempts += 1;
      if (attempts < 2) return { error: { message: 'connection reset' } };
      return { error: null };
    };

    const wrapped = async () => {
      const { error } = await fakeSupabaseUpdate();
      if (error) throw new Error(error.message);
    };

    await expect(
      withRetry(wrapped, { maxRetries: 2, baseDelayMs: 1, timeoutMs: 1000, logger: { log: () => {} } })
    ).resolves.toBeUndefined();
    expect(attempts).toBe(2);
  });
});
