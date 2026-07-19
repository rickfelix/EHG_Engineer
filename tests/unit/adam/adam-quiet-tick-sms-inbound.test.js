/**
 * QF-20260719-848: adam-quiet-tick was blind to sms_relay_staging — a chairman SMS reply sat
 * undrained ~25min (live incident 2026-07-19) because the tick never checked the inbound relay.
 * surfaceSmsInbound() implements the contract CHAIRMAN SMS CHANNEL DUTY (INBOUND WATCH): surface
 * EVERY undrained row (no time filter, and NO phone-mismatch drop — the anti-fragile fix, since
 * the original miss came from a hand-anchored received_at>= filter and CHAIRMAN_PHONE is unset in
 * the tick env).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { surfaceSmsInbound } from '../../../scripts/adam-quiet-tick.mjs';

// sms_relay_staging builder: APPLIES the .is('drained_at', null) filter so the test proves the
// query surfaces ONLY undrained rows (not merely that the fixture was pre-filtered).
function smsBuilder(rows) {
  const filters = [];
  const b = {
    select: () => b,
    is: (col, val) => { filters.push((r) => (val === null ? (r[col] === null || r[col] === undefined) : r[col] === val)); return b; },
    order: () => b,
    limit: () => b,
    then: (resolve, reject) => Promise.resolve({ data: rows.filter((r) => filters.every((f) => f(r))), error: null }).then(resolve, reject),
  };
  return b;
}
function errorBuilder(message) {
  const b = {
    select: () => b, is: () => b, order: () => b, limit: () => b,
    then: (resolve, reject) => Promise.resolve({ data: null, error: { message } }).then(resolve, reject),
  };
  return b;
}
const makeSupabase = (builder) => ({ from: () => builder });

const CHAIR = '+16135550100';
const OTHER = '+15125550999';
const savedPhone = process.env.CHAIRMAN_PHONE;
afterEach(() => {
  if (savedPhone === undefined) delete process.env.CHAIRMAN_PHONE;
  else process.env.CHAIRMAN_PHONE = savedPhone;
});

describe('surfaceSmsInbound', () => {
  it('surfaces ONLY undrained rows (a drained row is excluded by the query filter)', async () => {
    process.env.CHAIRMAN_PHONE = CHAIR;
    const now = Date.now();
    const sb = makeSupabase(smsBuilder([
      { id: 'a', from_phone: CHAIR, body_raw: 'YES', signature_valid: true, received_at: new Date(now - 60000).toISOString(), drained_at: null },
      { id: 'b', from_phone: CHAIR, body_raw: 'old', signature_valid: true, received_at: new Date(now - 120000).toISOString(), drained_at: new Date(now).toISOString() },
    ]));
    const res = await surfaceSmsInbound(sb);
    expect(res.count).toBe(1);
    expect(res.rows[0]).toMatchObject({ id: 'a', isChairman: true, signatureValid: true, body: 'YES' });
    expect(res.rows[0].ageMin).toBeGreaterThanOrEqual(0);
  });

  it('with CHAIRMAN_PHONE set: labels an exact match isChairman:true and a non-match false, but surfaces BOTH (never drops on phone mismatch)', async () => {
    process.env.CHAIRMAN_PHONE = CHAIR;
    const sb = makeSupabase(smsBuilder([
      { id: 'c', from_phone: CHAIR, body_raw: 'hi', signature_valid: true, received_at: new Date().toISOString(), drained_at: null },
      { id: 'd', from_phone: OTHER, body_raw: 'spam', signature_valid: false, received_at: new Date().toISOString(), drained_at: null },
    ]));
    const res = await surfaceSmsInbound(sb);
    expect(res.count).toBe(2);
    expect(res.rows.find((r) => r.id === 'c').isChairman).toBe(true);
    expect(res.rows.find((r) => r.id === 'd').isChairman).toBe(false);
  });

  it('with CHAIRMAN_PHONE UNSET: every undrained row is a chairman-candidate (isChairman:true) — an unset env must not re-hide replies', async () => {
    delete process.env.CHAIRMAN_PHONE;
    const sb = makeSupabase(smsBuilder([
      { id: 'e', from_phone: '+1999', body_raw: 'YES', signature_valid: true, received_at: new Date().toISOString(), drained_at: null },
    ]));
    const res = await surfaceSmsInbound(sb);
    expect(res.count).toBe(1);
    expect(res.rows[0].isChairman).toBe(true);
  });

  it('normalizes whitespace and truncates body_raw to <=120 chars', async () => {
    process.env.CHAIRMAN_PHONE = CHAIR;
    const sb = makeSupabase(smsBuilder([
      { id: 'f', from_phone: CHAIR, body_raw: '  multi\n  line  ' + 'x'.repeat(200), signature_valid: true, received_at: new Date().toISOString(), drained_at: null },
    ]));
    const res = await surfaceSmsInbound(sb);
    expect(res.rows[0].body.length).toBe(120);
    expect(res.rows[0].body).not.toContain('\n');
  });

  it('is fail-soft on a query error: returns rows:[] with the error, never throws', async () => {
    const sb = makeSupabase(errorBuilder('relation "sms_relay_staging" does not exist'));
    const res = await surfaceSmsInbound(sb);
    expect(res).toMatchObject({ rows: [], count: 0 });
    expect(res.error).toContain('does not exist');
  });

  it('is fail-soft on a throwing client: returns rows:[] count:0, never throws', async () => {
    const sb = { from: () => { throw new Error('boom'); } };
    await expect(surfaceSmsInbound(sb)).resolves.toMatchObject({ rows: [], count: 0 });
  });
});
