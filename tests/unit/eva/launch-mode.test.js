// SD-LEO-INFRA-LAUNCH-MODE-POLICY-001 (FR-1)
import { describe, it, expect } from 'vitest';
import { getLaunchMode, isLiveMode, isSimulatedMode, SIMULATED, LIVE } from '../../../lib/eva/launch-mode.js';

function buildSupabase({ row, error = null } = {}) {
  const chain = { eq: () => chain, maybeSingle: async () => ({ data: row, error }) };
  return { from: () => ({ select: () => chain }) };
}

describe('getLaunchMode (SD-LEO-INFRA-LAUNCH-MODE-POLICY-001 FR-1)', () => {
  it('returns "live" when the venture row has launch_mode="live"', async () => {
    const supabase = buildSupabase({ row: { launch_mode: 'live' } });
    expect(await getLaunchMode(supabase, 'venture-1')).toBe(LIVE);
  });

  it('returns "simulated" when the venture row has launch_mode="simulated"', async () => {
    const supabase = buildSupabase({ row: { launch_mode: 'simulated' } });
    expect(await getLaunchMode(supabase, 'venture-1')).toBe(SIMULATED);
  });

  it('fails open to "simulated" when the column does not exist yet (undefined_column)', async () => {
    const supabase = buildSupabase({ row: null, error: { code: '42703', message: 'column ventures.launch_mode does not exist' } });
    expect(await getLaunchMode(supabase, 'venture-1')).toBe(SIMULATED);
  });

  it('fails open to "simulated" when the query errors for any other reason', async () => {
    const supabase = buildSupabase({ row: null, error: { message: 'network error' } });
    expect(await getLaunchMode(supabase, 'venture-1')).toBe(SIMULATED);
  });

  it('fails open to "simulated" when no row is found', async () => {
    const supabase = buildSupabase({ row: null });
    expect(await getLaunchMode(supabase, 'venture-1')).toBe(SIMULATED);
  });

  it('fails open to "simulated" when supabase or ventureId is missing', async () => {
    expect(await getLaunchMode(undefined, undefined)).toBe(SIMULATED);
    expect(await getLaunchMode(buildSupabase({ row: { launch_mode: 'live' } }), undefined)).toBe(SIMULATED);
  });

  it('fails open to "simulated" when the client throws', async () => {
    const supabase = { from: () => { throw new Error('boom'); } };
    expect(await getLaunchMode(supabase, 'venture-1')).toBe(SIMULATED);
  });
});

describe('isLiveMode / isSimulatedMode', () => {
  it('isLiveMode is true only for "live"', () => {
    expect(isLiveMode('live')).toBe(true);
    expect(isLiveMode('simulated')).toBe(false);
    expect(isLiveMode(undefined)).toBe(false);
  });

  it('isSimulatedMode is the complement (fails safe to simulated on anything unrecognized)', () => {
    expect(isSimulatedMode('simulated')).toBe(true);
    expect(isSimulatedMode('live')).toBe(false);
    expect(isSimulatedMode(undefined)).toBe(true);
    expect(isSimulatedMode('bogus')).toBe(true);
  });
});
