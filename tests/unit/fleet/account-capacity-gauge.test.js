/**
 * QF-20260720-406 — per-account fleet capacity gauge.
 *
 * Chairman correction 2026-07-20: the fleet rotates across THREE Max accounts; a pooled
 * single number hides which account actually has headroom. This tests the per-account
 * store (read-merge-write keyed by accountUuid8 — recording one account never clobbers
 * another's last reading) and the pure headroom-ranking logic that makes the
 * which-account-to-/login decision data-driven.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  recordCapacityReading,
  loadStore,
  bindingWeeklyPct,
  rankAccountsByHeadroom,
  bestHeadroomAccount,
} = require('../../../lib/fleet/account-capacity-gauge.cjs');

const DEEPSOUL = { email: 'deepsoulsessionslabel@gmail.com', orgName: "Deep Soul Sessions's Organization", accountUuid8: 'ca1de6e4' };
const RICKF = { email: 'rickfelix2000@gmail.com', orgName: "Rick Felix 2000's Organization", accountUuid8: 'aabbccdd' };

let dir, storePath;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fleet-capacity-'));
  storePath = join(dir, '.fleet-account-capacity.json');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('recordCapacityReading', () => {
  it('writes a fresh per-account entry keyed by accountUuid8', () => {
    const result = recordCapacityReading(
      { weeklyAllModelsPct: 53, weeklyFablePct: 80, weeklyResetAt: '2026-07-24T07:59:00Z' },
      { identity: DEEPSOUL, storePath, now: '2026-07-20T09:55:00Z' }
    );
    expect(result.ok).toBe(true);
    expect(result.store.ca1de6e4).toMatchObject({
      email: DEEPSOUL.email, weeklyAllModelsPct: 53, weeklyFablePct: 80, weeklyResetAt: '2026-07-24T07:59:00Z',
    });
    expect(existsSync(storePath)).toBe(true);
    expect(JSON.parse(readFileSync(storePath, 'utf8')).ca1de6e4.accountUuid8).toBe('ca1de6e4');
  });

  it('recording a SECOND account never clobbers the first account\'s last reading (the pooled-number bug this fixes)', () => {
    recordCapacityReading({ weeklyAllModelsPct: 53, weeklyFablePct: 80 }, { identity: DEEPSOUL, storePath });
    const second = recordCapacityReading({ weeklyAllModelsPct: 27, weeklyFablePct: 47 }, { identity: RICKF, storePath });
    expect(second.store.ca1de6e4.weeklyFablePct).toBe(80); // untouched
    expect(second.store.aabbccdd.weeklyFablePct).toBe(47);
    expect(Object.keys(second.store).sort()).toEqual(['aabbccdd', 'ca1de6e4']);
  });

  it('re-recording the SAME account updates in place (no duplicate keys)', () => {
    recordCapacityReading({ weeklyAllModelsPct: 53, weeklyFablePct: 80 }, { identity: DEEPSOUL, storePath });
    const updated = recordCapacityReading({ weeklyAllModelsPct: 60, weeklyFablePct: 85 }, { identity: DEEPSOUL, storePath });
    expect(Object.keys(updated.store)).toEqual(['ca1de6e4']);
    expect(updated.store.ca1de6e4.weeklyFablePct).toBe(85);
  });

  it('fails soft (no throw) when account identity is unavailable', () => {
    const result = recordCapacityReading({ weeklyAllModelsPct: 10 }, { identity: null, storePath });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('account_identity_unavailable');
    expect(existsSync(storePath)).toBe(false);
  });

  it('missing numeric fields normalize to null rather than NaN/undefined', () => {
    const result = recordCapacityReading({}, { identity: DEEPSOUL, storePath });
    expect(result.store.ca1de6e4.weeklyAllModelsPct).toBeNull();
    expect(result.store.ca1de6e4.weeklyFablePct).toBeNull();
    expect(result.store.ca1de6e4.sessionResetAt).toBeNull();
  });
});

describe('loadStore', () => {
  it('returns {} for a missing/unreadable file (never throws)', () => {
    expect(loadStore(join(dir, 'does-not-exist.json'))).toEqual({});
  });
});

describe('bindingWeeklyPct (pure)', () => {
  it('takes the HIGHER of the two weekly meters (whichever binds first)', () => {
    expect(bindingWeeklyPct({ weeklyAllModelsPct: 53, weeklyFablePct: 80 })).toBe(80);
    expect(bindingWeeklyPct({ weeklyAllModelsPct: 90, weeklyFablePct: 10 })).toBe(90);
  });

  it('treats missing/non-finite meters as 0% used', () => {
    expect(bindingWeeklyPct({})).toBe(0);
    expect(bindingWeeklyPct({ weeklyAllModelsPct: null, weeklyFablePct: undefined })).toBe(0);
  });
});

describe('rankAccountsByHeadroom / bestHeadroomAccount (pure)', () => {
  it('ranks the account with the LEAST binding usage first (most headroom)', () => {
    const store = {
      ca1de6e4: { ...DEEPSOUL, weeklyAllModelsPct: 53, weeklyFablePct: 80 }, // binding 80 -> 20% headroom
      aabbccdd: { ...RICKF, weeklyAllModelsPct: 27, weeklyFablePct: 47 },    // binding 47 -> 53% headroom
    };
    const ranked = rankAccountsByHeadroom(store);
    expect(ranked.map((a) => a.accountUuid8)).toEqual(['aabbccdd', 'ca1de6e4']);
    expect(ranked[0].headroomPct).toBe(53);
    expect(bestHeadroomAccount(store).accountUuid8).toBe('aabbccdd');
  });

  it('an account with no readings yet ranks with full (100%) headroom, never last-by-default', () => {
    const store = {
      ca1de6e4: { ...DEEPSOUL, weeklyAllModelsPct: 53, weeklyFablePct: 80 },
      neverLoggedIn: { email: 'codestreetlabs@example.com', accountUuid8: 'neverLoggedIn' },
    };
    expect(bestHeadroomAccount(store).accountUuid8).toBe('neverLoggedIn');
  });

  it('bestHeadroomAccount returns null for an empty store', () => {
    expect(bestHeadroomAccount({})).toBeNull();
  });
});
