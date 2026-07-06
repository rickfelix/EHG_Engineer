/**
 * SD-LEO-INFRA-SELF-CLAIM-STANDDOWN-HONOR-001
 * FR-1 coordinator per-session stand-down · FR-2 global/fleet stand-down · FR-3 priority durability.
 * Emphasis: FAIL-TOWARD-ACTIVE — only an EXPLICIT stand-down disables; uncertainty stays active.
 */
import { describe, it, expect } from 'vitest';
import mod from '../../../scripts/worker-checkin.cjs';

const { isSelfClaimDisabled, isParked, isGlobalStandDownActive, orderByFleetCriticalThenRank } = mod;

// Mock supabase: from('system_settings').select(...).in('key', keys) -> Promise<{data,error}>.
function mockSettingsSb(result) {
  return { from: () => ({ select: () => ({ in: async () => result }) }) };
}

describe('FR-1 coordinator per-session stand-down', () => {
  it('coordinator_stand_down=true disables self_claim', () => {
    expect(isSelfClaimDisabled({ coordinator_stand_down: true })).toBe(true);
  });
  it('coordinator can halt without the existing worker-self-set flags', () => {
    expect(isSelfClaimDisabled({ self_claim: true, coordinator_stand_down: true })).toBe(true);
  });
  it('the existing worker-self-set cases still disable', () => {
    expect(isSelfClaimDisabled({ self_claim: false })).toBe(true);
    expect(isSelfClaimDisabled({ availability: 'idle_only' })).toBe(true);
  });
});

describe('FR-2 global/fleet stand-down (system_settings)', () => {
  it('global FLEET_STAND_DOWN enabled disables self_claim', async () => {
    const sb = mockSettingsSb({ data: [{ key: 'FLEET_STAND_DOWN', value_json: { enabled: true, mode: 'overnight_reduction' } }], error: null });
    expect(await isGlobalStandDownActive(sb)).toBe(true);
  });
  it('global HARD_HALT_STATUS enabled (superset) disables self_claim', async () => {
    const sb = mockSettingsSb({ data: [{ key: 'HARD_HALT_STATUS', value_json: { enabled: true } }], error: null });
    expect(await isGlobalStandDownActive(sb)).toBe(true);
  });
});

describe('QF-20260705-347 durable PARK marker', () => {
  it('metadata.parked_until in the future disables self_claim', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    expect(isParked({ parked_until: future })).toBe(true);
    expect(isSelfClaimDisabled({ parked_until: future })).toBe(true);
  });
  it('a PAST parked_until re-enables self_claim (park is self-expiring)', () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(isParked({ parked_until: past })).toBe(false);
    expect(isSelfClaimDisabled({ parked_until: past })).toBe(false);
  });
  it('absent/garbage parked_until leaves self_claim ENABLED (fail-toward-active)', () => {
    expect(isParked({})).toBe(false);
    expect(isParked({ parked_until: 'not-a-date' })).toBe(false);
    expect(isParked(null)).toBe(false);
  });
});

describe('fail-toward-active default (only explicit stand-down disables)', () => {
  it('no flag / absent value leaves self_claim ENABLED', () => {
    expect(isSelfClaimDisabled({})).toBe(false);
    expect(isSelfClaimDisabled({ coordinator_stand_down: false })).toBe(false);
    expect(isSelfClaimDisabled(null)).toBe(false);
  });
  it('global: missing key, enabled false, empty data, or read error -> ENABLED', async () => {
    expect(await isGlobalStandDownActive(mockSettingsSb({ data: [], error: null }))).toBe(false);
    expect(await isGlobalStandDownActive(mockSettingsSb({ data: [{ key: 'FLEET_STAND_DOWN', value_json: { enabled: false } }], error: null }))).toBe(false);
    expect(await isGlobalStandDownActive(mockSettingsSb({ data: null, error: { message: 'boom' } }))).toBe(false);
    // a throwing client also fails toward active:
    expect(await isGlobalStandDownActive({ from: () => { throw new Error('db down'); } })).toBe(false);
  });
});

describe('FR-3 priority durability when dispatch_rank decays', () => {
  const items = [
    { key: 'LOW', }, { key: 'HIGH' }, { key: 'CRIT' },
  ];
  const keyOf = (x) => x.key;

  it('priority orders high above low when dispatch_rank is stale/absent for both', () => {
    const priorityMap = new Map([['LOW', 3], ['HIGH', 1], ['CRIT', 0]]);
    const ranked = orderByFleetCriticalThenRank(items, keyOf, new Map(), new Set(), priorityMap);
    expect(ranked.map(keyOf)).toEqual(['CRIT', 'HIGH', 'LOW']);
  });

  it('a FRESH dispatch_rank still wins over the priority tier', () => {
    // LOW has a fresh rank 0; HIGH has higher priority but no rank -> LOW first.
    const priorityMap = new Map([['LOW', 3], ['HIGH', 1]]);
    const rankMap = new Map([['LOW', 0]]);
    const ranked = orderByFleetCriticalThenRank([{ key: 'HIGH' }, { key: 'LOW' }], keyOf, rankMap, new Set(), priorityMap);
    expect(ranked.map(keyOf)).toEqual(['LOW', 'HIGH']);
  });

  it('fleet_critical still wins over everything (stale-proof)', () => {
    const priorityMap = new Map([['LOW', 3], ['HIGH', 1]]);
    const fc = new Set(['LOW']); // LOW is fleet_critical
    const ranked = orderByFleetCriticalThenRank([{ key: 'HIGH' }, { key: 'LOW' }], keyOf, new Map(), fc, priorityMap);
    expect(ranked.map(keyOf)).toEqual(['LOW', 'HIGH']);
  });
});
