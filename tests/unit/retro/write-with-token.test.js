/**
 * SD-LEO-FIX-WIRE-SEVEN-RETROSPECTIVE-001 FR-3 — updateRetrospectiveWithToken().
 *
 * retro_write_token (database/migrations/20260908_retrospectives_retro_write_token_column.sql)
 * and the enforcing trigger (database/chairman-gated/20260906_retrospectives_published_guard.sql)
 * ship on independently-gated apply paths, so a writer cannot assume the column exists yet.
 * This helper must try WITH the token first, then fall back to the same write WITHOUT it only
 * when PostgREST reports the column is missing -- and must NOT swallow any other error.
 */
import { describe, it, expect, vi } from 'vitest';
import { updateRetrospectiveWithToken } from '../../../lib/retro/write-with-token.js';

describe('updateRetrospectiveWithToken', () => {
  it('sets retro_write_token to the caller-provided identity in the same payload', async () => {
    const runUpdate = vi.fn(async (payload) => ({ data: { ...payload, id: 'r1' }, error: null }));
    const result = await updateRetrospectiveWithToken(runUpdate, { title: 'x' }, 'handoff_lead_to_plan_retrospective');

    expect(runUpdate).toHaveBeenCalledTimes(1);
    expect(runUpdate).toHaveBeenCalledWith({ title: 'x', retro_write_token: 'handoff_lead_to_plan_retrospective' });
    expect(result.error).toBeNull();
    expect(result.data.id).toBe('r1');
  });

  it('never mutates the caller-supplied payload object', async () => {
    const payload = { title: 'x' };
    const runUpdate = vi.fn(async (p) => ({ data: p, error: null }));
    await updateRetrospectiveWithToken(runUpdate, payload, 'writer_a');
    expect(payload).toEqual({ title: 'x' }); // no retro_write_token leaked onto the original object
  });

  it('retries WITHOUT the token when PostgREST reports the column missing (PGRST204)', async () => {
    const runUpdate = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { code: 'PGRST204', message: "column 'retro_write_token' does not exist" } })
      .mockResolvedValueOnce({ data: { id: 'r2' }, error: null });

    const result = await updateRetrospectiveWithToken(runUpdate, { title: 'x' }, 'writer_a');

    expect(runUpdate).toHaveBeenCalledTimes(2);
    expect(runUpdate).toHaveBeenNthCalledWith(1, { title: 'x', retro_write_token: 'writer_a' });
    expect(runUpdate).toHaveBeenNthCalledWith(2, { title: 'x' }); // retry payload has NO token key at all
    expect(result.error).toBeNull();
    expect(result.data.id).toBe('r2');
  });

  it('retries WITHOUT the token on a raw Postgres 42703 (undefined_column)', async () => {
    const runUpdate = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { code: '42703', message: 'column does not exist' } })
      .mockResolvedValueOnce({ data: { id: 'r3' }, error: null });

    const result = await updateRetrospectiveWithToken(runUpdate, { title: 'x' }, 'writer_a');

    expect(runUpdate).toHaveBeenCalledTimes(2);
    expect(result.error).toBeNull();
  });

  it('does NOT retry and returns the original error for any other error code (e.g. the guard itself refusing, RPGD1)', async () => {
    const runUpdate = vi.fn().mockResolvedValueOnce({
      data: null,
      error: { code: 'RPGD1', message: 'refusing to change PUBLISHED SD_COMPLETION retrospective content without retro_write_token' },
    });

    const result = await updateRetrospectiveWithToken(runUpdate, { title: 'x' }, 'writer_a');

    expect(runUpdate).toHaveBeenCalledTimes(1); // no blind retry -- this error is real and must surface
    expect(result.error.code).toBe('RPGD1');
  });
});
