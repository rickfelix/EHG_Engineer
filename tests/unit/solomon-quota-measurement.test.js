/**
 * SD-FDBK-INFRA-SOLOMON-SCORECARD-MEASURES-001 — FR-1 (TS-1, TS-2, TS-10, TS-13).
 *
 * checkConsultQuota was written, exported and unit-tested with ZERO production
 * call sites. The 2026-07-29 breach (193 sends vs cap) happened because nobody
 * asked the gate, not because it answered wrongly.
 *
 * Two properties are pinned here, and the second is the one that matters:
 *   1. The gate now returns enough information to be USED as a measurement —
 *      an availability flag distinct from the count, so a broken query can
 *      never be mistaken for a quiet day.
 *   2. Measurement did NOT become enforcement. The ruling was explicit:
 *      record what would have been refused, change no behaviour. A clamp at
 *      the code default of 20 would be a ~10x throttle on the oracle.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(import.meta.url);
const { checkConsultQuota } = require_(join(here, '..', '..', 'scripts', 'solomon-advisory.cjs'));

/** Minimal stand-in for the PostgREST builder chain checkConsultQuota uses. */
function supabaseReturning({ rows = [], error = null, throws = null } = {}) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    limit: () => {
      if (throws) throw throws;
      return Promise.resolve({ data: rows, error });
    },
  };
  return { from: () => chain };
}

const oracleRow = (extra = {}) => ({ id: 'x', created_at: new Date().toISOString(), payload: { oracle: 'true', ...extra } });

describe('quota signal availability (the anti-fail-open contract)', () => {
  it('a query error reports available:false — NOT a passing zero count', async () => {
    const r = await checkConsultQuota(supabaseReturning({ error: { message: 'boom' } }));
    expect(r.available).toBe(false);
    expect(r.count).toBeUndefined();     // no number to mistake for a real one
    expect(r.allowed).toBe(true);        // fail-open BEHAVIOUR preserved
  });

  it('a thrown exception also reports available:false', async () => {
    const r = await checkConsultQuota(supabaseReturning({ throws: new Error('socket died') }));
    expect(r.available).toBe(false);
    expect(r.allowed).toBe(true);
  });

  it('a genuine zero-send day is DISTINGUISHABLE from a failed signal', async () => {
    const quiet = await checkConsultQuota(supabaseReturning({ rows: [] }));
    const broken = await checkConsultQuota(supabaseReturning({ error: { message: 'boom' } }));
    // This is the whole point: before FR-1 both returned a bare { allowed: true }.
    expect(quiet.available).toBe(true);
    expect(quiet.count).toBe(0);
    expect(broken.available).toBe(false);
    expect(quiet.available).not.toBe(broken.available);
  });
});

describe('the measurement carries real numbers', () => {
  it('reports the observed count and the ceiling it was compared against', async () => {
    const r = await checkConsultQuota(supabaseReturning({ rows: [oracleRow(), oracleRow()] }), { perDayMax: 20 });
    expect(r.available).toBe(true);
    expect(r.count).toBe(2);
    expect(r.perDayMax).toBe(20);
  });

  it('excludes cc_originator rows so a CC does not consume two slots', async () => {
    // TS-13: D3 must reuse THIS count. If it re-queried independently it would
    // silently drop this exclusion and the two volumes would diverge.
    const rows = [oracleRow(), oracleRow({ via: 'cc_originator' }), oracleRow()];
    const r = await checkConsultQuota(supabaseReturning({ rows }), { perDayMax: 20 });
    expect(r.count).toBe(2);
  });

  it('still reports the count when over the ceiling', async () => {
    const rows = Array.from({ length: 5 }, () => oracleRow());
    const r = await checkConsultQuota(supabaseReturning({ rows }), { perDayMax: 3 });
    expect(r.allowed).toBe(false);       // the VERDICT is still computed...
    expect(r.available).toBe(true);
    expect(r.count).toBe(5);             // ...and the number is recoverable
    expect(r.reason).toMatch(/per-day quota reached \(5\/3\)/);
  });
});

describe('routed-lane exemption (QF-20260822-623, ruling flag 1d971fd3 / correlation b748d8e5)', () => {
  it('excludes rows answering a fresh correlation (payload.reply_to set) from the count', async () => {
    const rows = [oracleRow(), oracleRow({ reply_to: 'corr-1' }), oracleRow({ reply_to: 'corr-2' })];
    const r = await checkConsultQuota(supabaseReturning({ rows }), { perDayMax: 20 });
    expect(r.count).toBe(1); // only the self-initiated send counts
  });

  it('a day of only routed replies never trips the per-day ceiling', async () => {
    const rows = Array.from({ length: 10 }, () => oracleRow({ reply_to: 'corr' }));
    const r = await checkConsultQuota(supabaseReturning({ rows }), { perDayMax: 3 });
    expect(r.allowed).toBe(true);
    expect(r.count).toBe(0);
  });

  it('self-initiated sends still count toward the ceiling', async () => {
    const rows = Array.from({ length: 4 }, () => oracleRow());
    const r = await checkConsultQuota(supabaseReturning({ rows }), { perDayMax: 3 });
    expect(r.allowed).toBe(false);
    expect(r.count).toBe(4);
  });
});

describe('measurement did not become enforcement', () => {
  it('an over-cap verdict is reported, not acted on — allowed:false is advisory here', async () => {
    // The caller in solomon-advisory.cjs logs this and proceeds to insert. This
    // test pins the CONTRACT the caller relies on: the function returns a verdict,
    // it does not throw, exit, or otherwise stop the send itself.
    const rows = Array.from({ length: 99 }, () => oracleRow());
    const r = await checkConsultQuota(supabaseReturning({ rows }), { perDayMax: 1 });
    expect(r.allowed).toBe(false);
    expect(r).toBeTypeOf('object');      // returned, not thrown
  });

  it('the send path calls the gate but never branches on allowed:false', async () => {
    // Static pin: the measurement call must not be followed by a refusal.
    // Reading source is the honest check here — the alternative (driving the
    // real CLI past the cap) needs a live DB and would prove less.
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(join(here, '..', '..', 'scripts', 'solomon-advisory.cjs'), 'utf8');
    expect(src).toMatch(/const quotaMeasurement = await checkConsultQuota\(/);
    // No exit/return keyed on the measurement — that would be enforcement.
    expect(src).not.toMatch(/if \(!quotaMeasurement\.allowed\)[^{]*\{[^}]*process\.exit/);
    expect(src).not.toMatch(/if \(!quotaMeasurement\.allowed\)[^{]*\{[^}]*return;/);
  });
});
