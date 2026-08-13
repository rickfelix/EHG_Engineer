/**
 * QF-20260811-495: token-tracker hardcoded is_simulation:false for every
 * venture_token_ledger row, regardless of the venture's actual launch_mode.
 *
 * Measured 2026-08-11 (venture 50763b6a): 6721 simulation-era rows / 20.2M
 * tokens recorded as REAL spend, driving get_venture_token_budget_status to
 * 4043% and re-blocking the stage worker with budget_exceeded REQUIRE_REVIEW
 * after every stage — the first-revenue factory stalled at s9 on phantom
 * spend. Solomon R4: the hardcoded false was ACCIDENTALLY CORRECT during a
 * real build (safety-by-coincidence) but wrong for every simulated run.
 *
 * Test strategy: recordTokenUsage() is fire-and-forget (never awaited by
 * callers), and its is_simulation derivation now goes through an async
 * getLaunchModeStrict() read before the insert — so every test gives the
 * fire-and-forget chain a tick to settle before asserting on the inserted
 * row, matching the pattern already established in token-tracker.test.js.
 * The fake client disambiguates the two distinct query shapes this function
 * now issues (a 'ventures' launch_mode lookup, then a 'venture_token_ledger'
 * insert) by table name, since a single generic mock can't route both.
 */

import { describe, it, expect, vi } from 'vitest';
import { recordTokenUsage } from '../../../lib/eva/utils/token-tracker.js';

function makeFakeSupabase({ launchMode, launchModeError = null } = {}) {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn((table) => {
    if (table === 'ventures') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              launchModeError
                ? Promise.resolve({ data: null, error: launchModeError })
                : Promise.resolve({ data: { id: 'v-123', launch_mode: launchMode }, error: null }),
          }),
        }),
      };
    }
    if (table === 'venture_token_ledger') {
      return { insert };
    }
    throw new Error(`unexpected table: ${table}`);
  });
  return { client: { from }, insert };
}

async function settle() {
  await new Promise((r) => setTimeout(r, 10));
}

describe('recordTokenUsage is_simulation derivation (QF-20260811-495)', () => {
  it('lands is_simulation=TRUE for a write during launch_mode=simulated', async () => {
    const { client, insert } = makeFakeSupabase({ launchMode: 'simulated' });

    recordTokenUsage(
      { ventureId: 'v-123', stageId: 5, usage: { inputTokens: 10, outputTokens: 5 } },
      { supabase: client, logger: { warn: vi.fn() } }
    );
    await settle();

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ is_simulation: true }));
  });

  it('lands is_simulation=FALSE for a write during launch_mode=live', async () => {
    const { client, insert } = makeFakeSupabase({ launchMode: 'live' });

    recordTokenUsage(
      { ventureId: 'v-123', stageId: 5, usage: { inputTokens: 10, outputTokens: 5 } },
      { supabase: client, logger: { warn: vi.fn() } }
    );
    await settle();

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ is_simulation: false }));
  });

  it('fails CLOSED to is_simulation=FALSE when the launch_mode read errors (Solomon R4 safety)', async () => {
    const { client, insert } = makeFakeSupabase({ launchModeError: { message: 'read failed' } });

    recordTokenUsage(
      { ventureId: 'v-123', stageId: 5, usage: { inputTokens: 10, outputTokens: 5 } },
      { supabase: client, logger: { warn: vi.fn() } }
    );
    await settle();

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ is_simulation: false }));
  });

  it('REGRESSION CONTROL: is_simulation genuinely derives from the mode input, not a re-hardcoded literal', async () => {
    // Same call shape, two different modes — a hardcoded literal would produce
    // an identical is_simulation value both times. This fails if it's ever
    // reintroduced (the exact defect this QF fixes).
    const simRun = makeFakeSupabase({ launchMode: 'simulated' });
    const liveRun = makeFakeSupabase({ launchMode: 'live' });

    recordTokenUsage(
      { ventureId: 'v-123', stageId: 9, usage: { inputTokens: 1, outputTokens: 1 } },
      { supabase: simRun.client, logger: { warn: vi.fn() } }
    );
    recordTokenUsage(
      { ventureId: 'v-123', stageId: 9, usage: { inputTokens: 1, outputTokens: 1 } },
      { supabase: liveRun.client, logger: { warn: vi.fn() } }
    );
    await settle();

    const simValue = simRun.insert.mock.calls[0][0].is_simulation;
    const liveValue = liveRun.insert.mock.calls[0][0].is_simulation;
    expect(simValue).not.toBe(liveValue);
    expect(simValue).toBe(true);
    expect(liveValue).toBe(false);
  });
});
