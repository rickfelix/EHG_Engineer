/**
 * SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-C: PC-6 freeze-and-incident
 */
import { describe, it, expect, vi } from 'vitest';
import { checkFreezeAndIncident } from '../../../../lib/switch-automation/prechecks/freeze-incident.js';

function fakeSupabase({ autoFrozen = false, killSwitchActive = false } = {}) {
  return {
    rpc: vi.fn(async (name) => {
      if (name === 'is_auto_frozen') return { data: autoFrozen, error: null };
      throw new Error(`unexpected rpc: ${name}`);
    }),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: { switch_key: 'CONST-009', is_active: killSwitchActive },
            error: null,
          })),
        })),
      })),
    })),
  };
}

describe('PC-6: checkFreezeAndIncident', () => {
  it('passes when not frozen, kill switch inactive, no open incident', async () => {
    const supabase = fakeSupabase({});
    const result = await checkFreezeAndIncident(supabase, 'component-x', { openIncident: false });
    expect(result).toEqual({ id: 'PC-6', name: 'freeze-and-incident', passed: true, reason: 'no-freeze-no-incident' });
  });

  it('fails when AUTO_FREEZE is active', async () => {
    const supabase = fakeSupabase({ autoFrozen: true });
    const result = await checkFreezeAndIncident(supabase, 'component-x', { openIncident: false });
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('auto-freeze-active');
  });

  it('fails when the CONST-009 kill switch is active', async () => {
    const supabase = fakeSupabase({ killSwitchActive: true });
    const result = await checkFreezeAndIncident(supabase, 'component-x', { openIncident: false });
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('kill-switch-active:CONST-009');
  });

  it('fails when there is a known open incident', async () => {
    const supabase = fakeSupabase({});
    const result = await checkFreezeAndIncident(supabase, 'component-x', { openIncident: true });
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('open-incident');
  });

  it('fails closed when incident status is unknown (null)', async () => {
    const supabase = fakeSupabase({});
    const result = await checkFreezeAndIncident(supabase, 'component-x', { openIncident: null });
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('incident-status-unknown');
  });
});
