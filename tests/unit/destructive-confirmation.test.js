/**
 * SD-LEO-INFRA-DESTRUCTIVE-ACTION-SAFETY-001 FR-1 — confirmation gate logic.
 *
 * These are pure-function tests: no server, no socket, no database client. The gate
 * they cover stands in front of deleteVentureFully, which irreversibly deletes ventures
 * (148 live, no undo), so nothing here may reach it — and nothing here can, because
 * evaluateConfirmation performs no I/O at all.
 *
 * Every "X is refused" assertion is paired with a control showing the same input
 * succeeds once the one offending field is corrected. Without that pairing, a gate that
 * refused EVERYTHING would pass the refusal tests trivially.
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateConfirmation,
  issueToken,
  resolveConfirmSecret,
  CONFIRM_ACK_PHRASE,
  TOKEN_TTL_MS,
  CODES,
} from '../../lib/destructive-confirmation.js';

const ENV = { DESTRUCTIVE_CONFIRM_SECRET: 'test-secret' };
const NOW = 1_700_000_000_000;
const IDS = ['b', 'a', 'c'];

function confirmedBody({ operation = 'master-reset', targetIds = IDS, nowMs = NOW, count = targetIds.length } = {}) {
  return {
    confirmation_token: issueToken({ operation, targetIds, issuedAtMs: nowMs, secret: ENV.DESTRUCTIVE_CONFIRM_SECRET }),
    acknowledgement: CONFIRM_ACK_PHRASE,
    expected_count: count,
  };
}

describe('FR-1: unconfirmed requests are refused with a preview', () => {
  it('an empty body yields 428 and a token bound to the target set', () => {
    const r = evaluateConfirmation({ body: {}, operation: 'master-reset', targetIds: IDS, env: ENV, nowMs: NOW });

    expect(r.ok).toBe(false);
    expect(r.status).toBe(428);
    expect(r.body.code).toBe(CODES.CONFIRMATION_REQUIRED);
    expect(r.body.expected_count).toBe(3);
    expect(r.body.confirmation_token).toBeTruthy();
    expect(r.body.acknowledgement_required).toBe(CONFIRM_ACK_PHRASE);
    // The operator must be told this cannot be undone, not just that a field is missing.
    expect(r.body.message).toMatch(/irreversibly/i);
  });

  it('CONTROL: the token from that preview is accepted, so the refusal above is not vacuous', () => {
    const preview = evaluateConfirmation({ body: {}, operation: 'master-reset', targetIds: IDS, env: ENV, nowMs: NOW });
    const r = evaluateConfirmation({
      body: { confirmation_token: preview.body.confirmation_token, acknowledgement: CONFIRM_ACK_PHRASE, expected_count: 3 },
      operation: 'master-reset', targetIds: IDS, env: ENV, nowMs: NOW,
    });

    expect(r.ok).toBe(true);
  });
});

describe('FR-1: the token is bound to operation and target set', () => {
  it('refuses a token minted for a DIFFERENT id set', () => {
    const r = evaluateConfirmation({
      body: confirmedBody({ targetIds: ['a', 'b'] }),
      operation: 'master-reset', targetIds: IDS, env: ENV, nowMs: NOW,
    });

    expect(r.ok).toBe(false);
    expect(r.body.code).toBe(CODES.TOKEN_INVALID);
  });

  it('refuses a token minted for a DIFFERENT operation', () => {
    const r = evaluateConfirmation({
      body: confirmedBody({ operation: 'bulk-full-delete' }),
      operation: 'master-reset', targetIds: IDS, env: ENV, nowMs: NOW,
    });

    expect(r.ok).toBe(false);
    expect(r.body.code).toBe(CODES.TOKEN_INVALID);
  });

  it('id ORDER does not matter — the same set confirms regardless of ordering', () => {
    const r = evaluateConfirmation({
      body: confirmedBody({ targetIds: ['c', 'a', 'b'] }),
      operation: 'master-reset', targetIds: IDS, env: ENV, nowMs: NOW,
    });

    expect(r.ok).toBe(true);
  });

  it('refuses a forged token signed with the wrong secret', () => {
    const forged = issueToken({ operation: 'master-reset', targetIds: IDS, issuedAtMs: NOW, secret: 'attacker' });
    const r = evaluateConfirmation({
      body: { confirmation_token: forged, acknowledgement: CONFIRM_ACK_PHRASE, expected_count: 3 },
      operation: 'master-reset', targetIds: IDS, env: ENV, nowMs: NOW,
    });

    expect(r.ok).toBe(false);
    expect(r.body.code).toBe(CODES.TOKEN_INVALID);
  });

  it('refuses a malformed token without throwing', () => {
    for (const bad of ['', 'garbage', 'x.y', '123', `${NOW}.`, null]) {
      const r = evaluateConfirmation({
        body: { confirmation_token: bad, acknowledgement: CONFIRM_ACK_PHRASE, expected_count: 3 },
        operation: 'master-reset', targetIds: IDS, env: ENV, nowMs: NOW,
      });
      expect(r.ok).toBe(false);
    }
  });
});

describe('FR-1: expiry', () => {
  it('refuses a token older than the TTL', () => {
    const r = evaluateConfirmation({
      body: confirmedBody(),
      operation: 'master-reset', targetIds: IDS, env: ENV, nowMs: NOW + TOKEN_TTL_MS + 1,
    });

    expect(r.ok).toBe(false);
    expect(r.body.code).toBe(CODES.TOKEN_EXPIRED);
  });

  it('CONTROL: the same token one millisecond INSIDE the TTL is accepted', () => {
    const r = evaluateConfirmation({
      body: confirmedBody(),
      operation: 'master-reset', targetIds: IDS, env: ENV, nowMs: NOW + TOKEN_TTL_MS - 1,
    });

    expect(r.ok).toBe(true);
  });

  it('refuses a token dated in the future', () => {
    const r = evaluateConfirmation({
      body: confirmedBody({ nowMs: NOW + 60_000 }),
      operation: 'master-reset', targetIds: IDS, env: ENV, nowMs: NOW,
    });

    expect(r.ok).toBe(false);
    expect(r.body.code).toBe(CODES.TOKEN_EXPIRED);
  });
});

describe('FR-1: staleness — expected_count must match the live count', () => {
  it('refuses when the live count has moved since the operator confirmed', () => {
    const r = evaluateConfirmation({
      body: confirmedBody({ count: 5 }),
      operation: 'master-reset', targetIds: IDS, env: ENV, nowMs: NOW,
    });

    expect(r.ok).toBe(false);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe(CODES.COUNT_MISMATCH);
    expect(r.body.expected_count).toBe(3);
  });

  it('refuses a MISSING expected_count rather than treating absence as agreement', () => {
    const body = confirmedBody();
    delete body.expected_count;
    const r = evaluateConfirmation({ body, operation: 'master-reset', targetIds: IDS, env: ENV, nowMs: NOW });

    expect(r.ok).toBe(false);
    expect(r.body.code).toBe(CODES.COUNT_MISMATCH);
  });
});

describe('FR-1: acknowledgement', () => {
  it('refuses a wrong, near-miss, or lowercase acknowledgement', () => {
    for (const ack of ['delete permanently', 'DELETE', 'yes', '', 'DELETE PERMANENTLY ']) {
      const r = evaluateConfirmation({
        body: { ...confirmedBody(), acknowledgement: ack },
        operation: 'master-reset', targetIds: IDS, env: ENV, nowMs: NOW,
      });
      expect(r.ok).toBe(false);
      expect(r.body.code).toBe(CODES.ACK_INVALID);
    }
  });

  it('supplying a token but NO acknowledgement is refused, not treated as a preview', () => {
    const body = confirmedBody();
    delete body.acknowledgement;
    const r = evaluateConfirmation({ body, operation: 'master-reset', targetIds: IDS, env: ENV, nowMs: NOW });

    expect(r.ok).toBe(false);
    expect(r.body.code).toBe(CODES.ACK_INVALID);
  });
});

describe('FR-4: fails CLOSED, and has no bypass', () => {
  it('refuses with 503 when no secret is configured — it does NOT wave the request through', () => {
    const r = evaluateConfirmation({ body: confirmedBody(), operation: 'master-reset', targetIds: IDS, env: {}, nowMs: NOW });

    expect(r.ok).toBe(false);
    expect(r.status).toBe(503);
    expect(r.body.code).toBe(CODES.CONFIRMATION_UNAVAILABLE);
  });

  it('no environment variable bypasses the gate', () => {
    // If someone later adds a SKIP_CONFIRM-style escape hatch, this fails.
    const hostile = {
      ...ENV,
      SKIP_CONFIRM: 'true', FORCE: 'true', CONFIRM: 'true', DESTRUCTIVE_CONFIRM_BYPASS: 'true',
      MASTER_RESET_CONFIRMED: 'true', NODE_ENV: 'test', CI: 'true',
    };
    const r = evaluateConfirmation({ body: {}, operation: 'master-reset', targetIds: IDS, env: hostile, nowMs: NOW });

    expect(r.ok).toBe(false);
    expect(r.body.code).toBe(CODES.CONFIRMATION_REQUIRED);
  });

  it('an empty target set still requires confirmation rather than short-circuiting', () => {
    const r = evaluateConfirmation({ body: {}, operation: 'master-reset', targetIds: [], env: ENV, nowMs: NOW });

    expect(r.ok).toBe(false);
    expect(r.body.expected_count).toBe(0);
  });
});

describe('resolveConfirmSecret', () => {
  it('prefers the dedicated secret, falls back to INTERNAL_API_KEY, else null', () => {
    expect(resolveConfirmSecret({ DESTRUCTIVE_CONFIRM_SECRET: 'a', INTERNAL_API_KEY: 'b' })).toBe('a');
    expect(resolveConfirmSecret({ INTERNAL_API_KEY: 'b' })).toBe('b');
    expect(resolveConfirmSecret({})).toBe(null);
  });
});
