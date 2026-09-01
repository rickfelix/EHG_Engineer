/**
 * SD-LEO-FIX-TRIAGE-THREE-FALSE-001 — readSchedulerObserveOnly fail-quiet behavior.
 */
import { describe, it, expect } from 'vitest';
import { readSchedulerObserveOnly } from '../../../scripts/cron/stage-line-closure-probe.mjs';

function mockSupabase(response) {
  return {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle: async () => response,
      };
    },
  };
}

describe('readSchedulerObserveOnly', () => {
  it('returns true when the heartbeat row carries metadata.observe_only=true', async () => {
    const supabase = mockSupabase({ data: { metadata: { observe_only: true } }, error: null });
    expect(await readSchedulerObserveOnly(supabase)).toBe(true);
  });

  it('returns false when metadata.observe_only is false or absent', async () => {
    const supabase = mockSupabase({ data: { metadata: {} }, error: null });
    expect(await readSchedulerObserveOnly(supabase)).toBe(false);
  });

  it('TS-4: fails quiet to null on a DB error, never throwing', async () => {
    const supabase = mockSupabase({ data: null, error: { message: 'unreachable' } });
    await expect(readSchedulerObserveOnly(supabase)).resolves.toBeNull();
  });

  it('TS-4: fails quiet to null when the client itself throws', async () => {
    const supabase = {
      from() {
        throw new Error('network error');
      },
    };
    await expect(readSchedulerObserveOnly(supabase)).resolves.toBeNull();
  });

  it('reads false (not an error) when no heartbeat row is found', async () => {
    const supabase = mockSupabase({ data: null, error: null });
    expect(await readSchedulerObserveOnly(supabase)).toBe(false);
  });
});
