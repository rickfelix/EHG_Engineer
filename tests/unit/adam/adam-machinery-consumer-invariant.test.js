/**
 * SD-LEO-INFRA-ADAM-MACHINERY-CONSUMER-001 — FR1 + FR3 consumer-side-invariant tests.
 *
 * Systemic root cause this SD closes: Adam machinery is verified at the PRODUCER boundary
 * (the advisory is emitted) but never that the real READER sees it across a coordinator
 * poll-gap. These tests assert the invariant at the CONSUMER boundary by driving the actual
 * consumer selector (lib/coordinator/adam-advisory-store.cjs selectUnactionedAdvisories — the
 * SAME query scripts/fleet-dashboard.cjs printAdamInbox now uses) and the actual producer TTL
 * (scripts/adam-advisory.cjs advisoryExpiresAt), and by modeling the real sweep
 * (cleanup_expired_coordination = DELETE FROM session_coordination WHERE expires_at < now()).
 *
 * Reusable pattern PAT-PROCESS-PRODUCER-CONSUMER-INVARIANT-001: every producer ships a
 * "consumer-reads-it-back against the real reader" assertion; here the reader is the advisory
 * selector + the sweep that governs row lifetime.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { advisoryExpiresAt, ADVISORY_TTL_MS } = require('../../../scripts/adam-advisory.cjs');
const { selectUnactionedAdvisories } = require('../../../lib/coordinator/adam-advisory-store.cjs');

// Real-cadence constants (from the live system, cited inline):
const SWEEP_CADENCE_MS = 5 * 60_000;       // cleanup_expired_coordination runs ~every 5 min (stale-session-sweep.cjs)
const COORDINATOR_POLL_MS = 15 * 60_000;   // inbox-monitor cron '*/15 * * * *' (adam-startup-check.mjs)

// Minimal thenable supabase stub that records the query chain (mirrors resilient-symmetric-adam.test.js).
function makeSupabase(result, captured) {
  const chain = {
    from(t) { captured.from = t; return chain; },
    select(s) { captured.select = s; return chain; },
    eq(k, v) { (captured.eq = captured.eq || []).push([k, v]); return chain; },
    is(k, v) { (captured.is = captured.is || []).push([k, v]); return chain; },
    in(k, v) { captured.in = [k, v]; return chain; },
    lt(k, v) { (captured.lt = captured.lt || []).push([k, v]); return chain; },
    lte(k, v) { (captured.lte = captured.lte || []).push([k, v]); return chain; },
    gt(k, v) { (captured.gt = captured.gt || []).push([k, v]); return chain; },
    gte(k, v) { (captured.gte = captured.gte || []).push([k, v]); return chain; },
    order() { captured.ordered = true; return chain; },
    limit(n) { captured.limit = n; return chain; },
    then(res, rej) { return Promise.resolve(result).then(res, rej); },
  };
  return chain;
}

// The real sweep predicate: cleanup_expired_coordination DELETEs rows where expires_at < now().
const sweptAway = (row, nowMs) => new Date(row.expires_at).getTime() < nowMs;
// The real reader gate: selectUnactionedAdvisories returns adam_advisory rows with actioned_at IS NULL.
const readerReturns = (row, nowMs) =>
  !sweptAway(row, nowMs) && row.payload?.kind === 'adam_advisory' && row.payload?.actioned_at == null;

describe('FR1: durable advisory TTL (decoupled from the await timeout)', () => {
  it('ADVISORY_TTL_MS exceeds the coordinator poll interval AND the sweep cadence (>= 1h)', () => {
    expect(ADVISORY_TTL_MS).toBeGreaterThanOrEqual(60 * 60_000);
    expect(ADVISORY_TTL_MS).toBeGreaterThan(COORDINATOR_POLL_MS);
    expect(ADVISORY_TTL_MS).toBeGreaterThan(SWEEP_CADENCE_MS);
  });

  it('advisoryExpiresAt() is ADVISORY_TTL_MS in the future regardless of any await timeout', () => {
    const now = 1_000_000_000_000;
    expect(new Date(advisoryExpiresAt(now)).getTime()).toBe(now + ADVISORY_TTL_MS);
    // No mode/timeout argument exists anymore — the TTL cannot be shrunk by a short --timeout.
    expect(advisoryExpiresAt.length).toBeLessThanOrEqual(1);
  });
});

describe('FR3: the real reader does NOT filter on expires_at (so the row must physically survive)', () => {
  it('selectUnactionedAdvisories gates on actioned_at IS NULL and never adds an expires_at filter', async () => {
    const captured = {};
    const sb = makeSupabase({ data: [], error: null }, captured);
    await selectUnactionedAdvisories(sb, 'coord-uuid', { limit: 20 });
    expect(captured.is).toContainEqual(['payload->>actioned_at', null]);
    expect(captured.eq).toContainEqual(['payload->>kind', 'adam_advisory']);
    // The consumer relies on the row EXISTING — it has no expires_at guard of its own.
    // Therefore row lifetime (the producer TTL + the sweep) is the real durability invariant.
    const touchedExpires = []
      .concat(captured.lt || [], captured.lte || [], captured.gt || [], captured.gte || [], captured.eq || [], captured.is || [])
      .some(([k]) => String(k).includes('expires_at'));
    expect(touchedExpires).toBe(false);
  });
});

describe('FR1+FR3 round-trip: a sent advisory survives a coordinator poll-gap until actioned', () => {
  const now0 = 1_000_000_000_000;
  // Producer writes the row with the REAL TTL helper.
  const advisory = { id: 'adv-1', expires_at: advisoryExpiresAt(now0), payload: { kind: 'adam_advisory' } };

  it('is NOT swept and IS returned by the reader after a >15min poll-gap', () => {
    const atPoll = now0 + COORDINATOR_POLL_MS + 1; // coordinator's next poll, just past 15 min
    expect(sweptAway(advisory, atPoll)).toBe(false);
    expect(readerReturns(advisory, atPoll)).toBe(true);
  });

  it('disappears from the reader ONLY after payload.actioned_at is stamped — not on TTL expiry', () => {
    const atPoll = now0 + COORDINATOR_POLL_MS + 1;
    const actioned = { ...advisory, payload: { ...advisory.payload, actioned_at: new Date(atPoll).toISOString() } };
    expect(sweptAway(actioned, atPoll)).toBe(false);     // still not expired
    expect(readerReturns(actioned, atPoll)).toBe(false); // excluded because actioned, not because swept
  });

  it('COUNTERFACTUAL: the OLD request-mode TTL (now+timeoutMs+5min) WAS swept before the poll (the bug)', () => {
    const oldTtlMs = 30_000 + 5 * 60_000; // default timeoutMs(30s) + 5min ≈ 5.5min
    const oldRow = { id: 'adv-old', expires_at: new Date(now0 + oldTtlMs).toISOString(), payload: { kind: 'adam_advisory' } };
    const atPoll = now0 + COORDINATOR_POLL_MS + 1;
    expect(sweptAway(oldRow, atPoll)).toBe(true);       // deleted ~9.5 min before the 15-min poll
    expect(readerReturns(oldRow, atPoll)).toBe(false);  // gone — the exact loss this SD fixes
  });
});

// End-to-end through the REAL selectUnactionedAdvisories return path (not the local model):
// model the DB response as the real sweep (DELETE WHERE expires_at < now) composed with the
// real reader gate (kind=adam_advisory AND actioned_at IS NULL), then assert the exported
// selector passes the survivor set through as {rows}. Closes the "real reader RETURN behavior
// unproven" gap — the local-model tests above prove the survive/swept logic; this proves the
// actual function returns exactly the surviving, unactioned advisories.
describe('FR1+FR3 end-to-end: the REAL selectUnactionedAdvisories returns only surviving, unactioned advisories', () => {
  const now0 = 1_000_000_000_000;
  const atPoll = now0 + COORDINATOR_POLL_MS + 1;
  const seed = [
    { id: 'fresh', expires_at: advisoryExpiresAt(now0), payload: { kind: 'adam_advisory' } },                                              // durable TTL, unactioned → survives + returned
    { id: 'actioned', expires_at: advisoryExpiresAt(now0), payload: { kind: 'adam_advisory', actioned_at: new Date(atPoll).toISOString() } }, // durable but actioned → gated out
    { id: 'old-swept', expires_at: new Date(now0 + 30_000 + 5 * 60_000).toISOString(), payload: { kind: 'adam_advisory' } },                // old short TTL → swept before poll
  ];
  // Mock supabase whose terminal result is the seed AFTER the real DB semantics at poll time.
  function dbAtPoll(captured) {
    const survivors = seed
      .filter((r) => !sweptAway(r, atPoll))                  // cleanup_expired_coordination DELETE
      .filter((r) => r.payload?.actioned_at == null);        // the selector's actioned_at IS NULL gate
    const result = { data: survivors, error: null };
    const chain = {
      from() { return chain; }, select() { return chain; },
      eq(k, v) { (captured.eq = captured.eq || []).push([k, v]); return chain; },
      is(k, v) { (captured.is = captured.is || []).push([k, v]); return chain; },
      in() { return chain; }, order() { return chain; }, limit() { return chain; },
      then(res, rej) { return Promise.resolve(result).then(res, rej); },
    };
    return chain;
  }

  it('returns the fresh unactioned advisory and excludes the actioned + swept ones', async () => {
    const captured = {};
    const { rows, error } = await selectUnactionedAdvisories(dbAtPoll(captured), 'coord-uuid', { limit: 20 });
    expect(error).toBeNull();
    expect(rows.map((r) => r.id)).toEqual(['fresh']); // actioned gated, old-swept deleted
    // and it really did request the actioned_at gate (consumer-boundary contract)
    expect(captured.is).toContainEqual(['payload->>actioned_at', null]);
  });

  it('surfaces a DB error as {rows:[], error} (fail-soft passthrough)', async () => {
    const errChain = { from() { return errChain; }, select() { return errChain; }, eq() { return errChain; }, is() { return errChain; }, in() { return errChain; }, order() { return errChain; }, limit() { return errChain; }, then(res, rej) { return Promise.resolve({ data: null, error: { message: 'boom' } }).then(res, rej); } };
    const { rows, error } = await selectUnactionedAdvisories(errChain, 'coord-uuid');
    expect(rows).toEqual([]);
    expect(error).toEqual({ message: 'boom' });
  });
});
