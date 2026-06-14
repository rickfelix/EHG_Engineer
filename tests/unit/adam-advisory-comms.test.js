/**
 * Adam advisory comms-durability — SD-LEO-INFRA-ADAM-ADVISORY-COMMS-001 (RCA 076cf785).
 *
 * FR1 of the ADAM-MACHINERY-CONSUMER parent: the request-mode advisory TTL (timeoutMs + 5min ~= 5.5min)
 * expired BEFORE the ~15min coordinator inbox poll, so the row was swept before it was read — the 5th
 * Adam->coordinator comms-loss mode. Fix: a durable 24h TTL for ALL modes; timeoutMs bounds only the
 * await. These tests pin the durable-TTL invariant + the consumer-side round-trip (survives a poll-gap,
 * surfaces until payload.actioned_at is stamped) WITHOUT any live DB/network.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { advisoryExpiresAt, ADVISORY_TTL_MS } = require('../../scripts/adam-advisory.cjs');

const NOW = 1_000_000_000_000; // fixed injected clock
const DAY_MS = 24 * 60 * 60_000;

// The expired-row sweep purges rows whose expires_at has passed; a row is discoverable at time T iff
// expires_at > T. (printAdamInbox itself does NOT filter on expires_at — the loss was the sweep
// deleting the row before the coordinator polled.)
const survivesSweepAt = (expiresAtIso, atMs) => Date.parse(expiresAtIso) > atMs;

// The REAL printAdamInbox surface predicate (scripts/fleet-dashboard.cjs): kind='adam_advisory'
// AND payload.actioned_at IS NULL (the two-stage re-surface gate; read_at does NOT suppress it).
const printAdamInboxSurfaces = (row) =>
  row?.payload?.kind === 'adam_advisory' && (row.payload.actioned_at == null);

describe('advisoryExpiresAt — durable mode-independent TTL', () => {
  it('returns now + 24h', () => {
    expect(advisoryExpiresAt(NOW)).toBe(new Date(NOW + DAY_MS).toISOString());
    expect(ADVISORY_TTL_MS).toBe(DAY_MS);
  });
  it('is mode-independent (same TTL regardless of any await/timeout)', () => {
    // No mode/timeout argument exists anymore — the TTL cannot be shortened by the request path.
    expect(advisoryExpiresAt(NOW)).toBe(advisoryExpiresAt(NOW));
  });
  it('defends against a non-finite clock (falls back to a real 24h window, never NaN)', () => {
    const iso = advisoryExpiresAt(undefined);
    expect(Number.isFinite(Date.parse(iso))).toBe(true);
  });
});

describe('round-trip durability invariant (the regression the old TTL caused)', () => {
  const POLL_GAP_MS = 10 * 60_000; // 10min — longer than the old request TTL (~5.5min), shorter than 24h
  const OLD_REQUEST_TTL_MS = 30_000 + 5 * 60_000; // the removed timeoutMs(30s)+5min branch

  it('a request-mode advisory now SURVIVES a coordinator poll-gap (new 24h TTL)', () => {
    const expiresAt = advisoryExpiresAt(NOW); // send path is now mode-independent
    expect(survivesSweepAt(expiresAt, NOW + POLL_GAP_MS)).toBe(true);
  });
  it('REGRESSION GUARD: the OLD request TTL would have been swept across the same poll-gap', () => {
    const oldExpiresAt = new Date(NOW + OLD_REQUEST_TTL_MS).toISOString();
    expect(survivesSweepAt(oldExpiresAt, NOW + POLL_GAP_MS)).toBe(false); // the bug
  });
});

describe('printAdamInbox surface / re-surface contract (consumer-side invariant)', () => {
  const advisory = (actioned_at = null) => ({ payload: { kind: 'adam_advisory', actioned_at } });

  it('surfaces an unactioned advisory (payload.actioned_at IS NULL)', () => {
    expect(printAdamInboxSurfaces(advisory(null))).toBe(true);
  });
  it('stops surfacing once payload.actioned_at is stamped', () => {
    expect(printAdamInboxSurfaces(advisory('2026-06-14T21:30:00Z'))).toBe(false);
  });
  it('end-to-end: discoverable across the poll-gap, then suppressed after actioning', () => {
    const expiresAt = advisoryExpiresAt(NOW);
    const atPoll = NOW + 10 * 60_000;
    const row = advisory(null);
    // 1. still alive at the poll (durable TTL) AND surfaced (unactioned)
    expect(survivesSweepAt(expiresAt, atPoll) && printAdamInboxSurfaces(row)).toBe(true);
    // 2. coordinator actions it -> stamp actioned_at -> no longer surfaces (no infinite re-surface)
    row.payload.actioned_at = new Date(atPoll).toISOString();
    expect(printAdamInboxSurfaces(row)).toBe(false);
  });
});
