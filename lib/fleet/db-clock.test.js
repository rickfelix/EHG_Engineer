/**
 * Unit tests — SD-FDBK-INFRA-NODE-CLOCK-SKEW-001
 * getDbNowMs derives the DB server clock (skew-immune) and is fail-open; the
 * liveFleetWorkers skew-injection proves that consuming DB-now (as coordinator-audit
 * now does) keeps the staleness verdict correct under a multi-hour node-clock skew.
 * Network-free: a fake supabase + injected clock values, no real DB.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import dbClock from './db-clock.cjs';
import { liveFleetWorkers } from './genuine-worker.mjs';

const { getDbNowMs } = dbClock;

// Fake supabase for the v_active_sessions read getDbNowMs makes.
function fakeSb(result, { throwOnFrom = false } = {}) {
  const api = {
    select: () => api,
    order: () => api,
    limit: () => api,
    then: (res, rej) => { try { res(result); } catch (e) { rej(e); } },
  };
  return { from: () => { if (throwOnFrom) throw new Error('connection boom'); return api; } };
}

let warnSpy;
beforeEach(() => { warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { warnSpy.mockRestore(); });

describe('getDbNowMs', () => {
  it('derives DB-now from a v_active_sessions row (heartbeat_at cancels)', async () => {
    const hb = '2026-06-08T10:00:00.000Z';
    const r = await getDbNowMs(fakeSb({ data: [{ heartbeat_at: hb, heartbeat_age_seconds: 42 }], error: null }));
    expect(r).toBe(Date.parse(hb) + 42_000);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('is fail-open on a query error (returns the node clock, warns)', async () => {
    const r = await getDbNowMs(fakeSb({ data: null, error: { message: 'rls denied' } }));
    expect(Math.abs(r - Date.now())).toBeLessThan(2000);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('is fail-open on an empty fleet (no rows)', async () => {
    const r = await getDbNowMs(fakeSb({ data: [], error: null }));
    expect(Math.abs(r - Date.now())).toBeLessThan(2000);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('is fail-open on a thrown client error and never throws', async () => {
    const r = await getDbNowMs(fakeSb(null, { throwOnFrom: true }));
    expect(Math.abs(r - Date.now())).toBeLessThan(2000);
  });

  it('is fail-open on a null/unparseable heartbeat_at', async () => {
    const r = await getDbNowMs(fakeSb({ data: [{ heartbeat_at: null, heartbeat_age_seconds: 5 }], error: null }));
    expect(Math.abs(r - Date.now())).toBeLessThan(2000);
  });
});

describe('liveFleetWorkers under node-clock skew (proves the coordinator-audit fix)', () => {
  const DB_NOW = Date.parse('2026-06-08T12:00:00.000Z');
  const worker = { session_id: 'w1', status: 'active', metadata: {}, sd_key: 'SD-X', heartbeat_at: new Date(DB_NOW - 60_000).toISOString() };
  const sessions = [worker];

  it('a +4h-skewed node clock FALSE-EXCLUDES a live worker (the bug)', () => {
    const skewedNow = DB_NOW + 4 * 3600_000;
    expect(liveFleetWorkers(sessions, 'coord', skewedNow, 900_000)).toHaveLength(0);
  });

  it('passing DB-now classifies the same worker LIVE (the fix)', () => {
    expect(liveFleetWorkers(sessions, 'coord', DB_NOW, 900_000)).toHaveLength(1);
  });
});
