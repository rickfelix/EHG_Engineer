/**
 * SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-C: PC-4 gauge-alarm-armed
 */
import { describe, it, expect, vi } from 'vitest';
import { checkGaugeAlarmArmed } from '../../../../lib/switch-automation/prechecks/gauge-alarm.js';

function fakeSupabase(row, { error = null } = {}) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: row, error })),
        })),
      })),
    })),
  };
}

describe('PC-4: checkGaugeAlarmArmed', () => {
  it('passes when owner set, last_fired_at set, currently_expected_active true', async () => {
    const supabase = fakeSupabase({ owner: 'team-x', last_fired_at: '2026-07-18T00:00:00Z', currently_expected_active: true });
    const result = await checkGaugeAlarmArmed(supabase, 'proc-key');
    expect(result).toEqual({ id: 'PC-4', name: 'gauge-alarm-armed', passed: true, reason: 'armed-and-verified-firing' });
  });

  it('fails when never fired (armed but not verified firing)', async () => {
    const supabase = fakeSupabase({ owner: 'team-x', last_fired_at: null, currently_expected_active: true });
    const result = await checkGaugeAlarmArmed(supabase, 'proc-key');
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('never-fired');
  });

  it('fails when no named owner', async () => {
    const supabase = fakeSupabase({ owner: '', last_fired_at: '2026-07-18T00:00:00Z', currently_expected_active: true });
    const result = await checkGaugeAlarmArmed(supabase, 'proc-key');
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('no-named-owner');
  });

  it('fails closed when process key is not registered at all', async () => {
    const supabase = fakeSupabase(null);
    const result = await checkGaugeAlarmArmed(supabase, 'unknown-key');
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('not-registered');
  });
});
