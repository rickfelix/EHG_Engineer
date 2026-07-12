import { describe, it, expect, vi } from 'vitest';
import { checkClaimCollision } from '../../../lib/fleet/collision-check.cjs';

function makeSupabase(rows) {
  return {
    from: (table) => {
      if (table !== 'session_lifecycle_events') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            ilike: () => ({
              order: () => Promise.resolve({ data: rows, error: null }),
            }),
          }),
        }),
      };
    },
  };
}

const SD_KEY = 'SD-APEXNICHE-AI-LEO-FIX-FLAG-GOVERNANCE-CLEANUP-001';

describe('checkClaimCollision', () => {
  it('reports NOT a live collision when the earlier session released before the later claim (the QF-254 incident shape)', async () => {
    const supabase = makeSupabase([
      { reason: `claim_cleared_irrevocable: sd_key=${SD_KEY} status=stale->released`, created_at: '2026-07-12T14:17:53.000Z' },
    ]);
    const result = await checkClaimCollision(supabase, 'f9e778ff-f709-496c-aeaa-dac32b0bd9ac', SD_KEY, '2026-07-12T14:24:35.000Z');
    expect(result.isLiveCollision).toBe(false);
    expect(result.releasedAt).toBe('2026-07-12T14:17:53.000Z');
  });

  it('reports a live collision when no release event exists before the later claim', async () => {
    const supabase = makeSupabase([]);
    const result = await checkClaimCollision(supabase, 'stillActiveSession', SD_KEY, '2026-07-12T14:24:35.000Z');
    expect(result.isLiveCollision).toBe(true);
    expect(result.reason).toBe('no_release_found_before_later_claim');
  });

  it('reports a live collision when the only release event happened AFTER the later claim', async () => {
    const supabase = makeSupabase([
      { reason: `claim_cleared_irrevocable: sd_key=${SD_KEY} status=active->idle`, created_at: '2026-07-12T14:30:00.000Z' },
    ]);
    const result = await checkClaimCollision(supabase, 'raced', SD_KEY, '2026-07-12T14:24:35.000Z');
    expect(result.isLiveCollision).toBe(true);
  });

  it('fails OPEN (assumes collision) on a DB lookup error, never suppressing a real alert', async () => {
    const supabase = {
      from: () => ({
        select: () => ({ eq: () => ({ ilike: () => ({ order: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) }) }),
      }),
    };
    const result = await checkClaimCollision(supabase, 's1', SD_KEY, '2026-07-12T14:24:35.000Z');
    expect(result.isLiveCollision).toBe(true);
    expect(result.reason).toMatch(/lookup_error_fail_open/);
  });

  it('fails OPEN on missing arguments', async () => {
    const result = await checkClaimCollision(null, null, null, null);
    expect(result.isLiveCollision).toBe(true);
    expect(result.reason).toBe('missing_args_fail_open');
  });

  it('fails OPEN on a thrown exception', async () => {
    const supabase = { from: () => { throw new Error('kaboom'); } };
    const result = await checkClaimCollision(supabase, 's1', SD_KEY, '2026-07-12T14:24:35.000Z');
    expect(result.isLiveCollision).toBe(true);
    expect(result.reason).toMatch(/exception_fail_open/);
  });
});
