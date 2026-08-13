/**
 * QF-20260812-752 — relay-drop-gauge never recognized a worker-signal-shaped reply to a
 * review_request/decision_request, guaranteeing a false positive for EVERY review answered
 * via the documented reply convention.
 *
 * The coordinator's own periodic bidirectional-review-request mechanism instructs the
 * recipient to reply via "/signal feedback", which writes a session_coordination row shaped
 * like { payload: { signal_type: 'feedback', body: '...req <8-char-prefix>...' } } — it never
 * populates payload.kind=relay_confirm or reply_to/in_reply_to, so the pre-fix
 * satisfiesCorrelation() unconditionally returned null for it. Verified live 2026-08-12:
 * Adam replied substantively to review-request cb5587b3/324acaff within 14 minutes (row
 * 264a931f), yet the gauge flagged it as dropped and kept re-flagging it for 45+ minutes,
 * since the reply's shape could never satisfy the matcher — a 100% guaranteed miss for this
 * class of reply, not occasional flakiness.
 *
 * Test strategy: decideRelayDrops() is the pure, dependency-injected core (no IO), so the
 * worker-signal-shaped reply's exact real-world payload shape can be constructed directly —
 * no need to mock loadOutboundCandidates' DB query (covered separately below by a source-text
 * assertion that the widened .or() filter is actually wired, since the pure core alone can't
 * prove the row would ever have been FETCHED in production).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  decideRelayDrops,
  satisfiesByBodyPrefix,
  loadOutboundCandidates,
} from '../../../lib/coordinator/relay-drop-gauge.cjs';
import { PAYLOAD_KINDS } from '../../../lib/fleet/worker-status.cjs';

const NOW = Date.parse('2026-08-12T21:43:00Z');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('satisfiesByBodyPrefix', () => {
  it('matches a worker_signal reply body containing the 8-char correlation prefix', () => {
    const row = { payload: { signal_type: 'feedback', body: 'Reviewed and agree — req cb5587b3, ship it' } };
    expect(satisfiesByBodyPrefix(row, 'cb5587b3-1234-5678-9abc-def012345678')).toBe(true);
  });

  it('does not match when the body references a DIFFERENT correlation id', () => {
    const row = { payload: { signal_type: 'feedback', body: 'req 00000000, unrelated' } };
    expect(satisfiesByBodyPrefix(row, 'cb5587b3-1234-5678-9abc-def012345678')).toBe(false);
  });

  it('does not match a row with no body text', () => {
    expect(satisfiesByBodyPrefix({ payload: { signal_type: 'feedback' } }, 'cb5587b3-xxxx')).toBe(false);
  });

  it('does not match a correlation id shorter than the 8-char prefix window', () => {
    expect(satisfiesByBodyPrefix({ payload: { body: 'req ab' } }, 'ab')).toBe(false);
  });
});

describe('decideRelayDrops: worker-signal reply to a review_request (QF-20260812-752)', () => {
  it('recognizes the REAL live shape as satisfying — no longer flags it', () => {
    // Reproduces the live incident's actual row shapes (correlation cb5587b3..., review sent
    // 20:42:44Z, worker-signal reply landed 20:56:43Z — well within the 15min window here
    // because the check is now well past both, matching the sustained-false-flag symptom).
    const inbound = [{
      id: '324acaff',
      payload: { kind: 'review_request', correlation_id: 'cb5587b3-aaaa-bbbb-cccc-111122223333' },
      created_at: '2026-08-12T20:42:44Z',
    }];
    const outbound = [{
      id: '264a931f',
      payload: { signal_type: 'feedback', body: 'Substantive review of req cb5587b3 — looks solid, ADAM-COORD-FEEDBACK' },
      created_at: '2026-08-12T20:56:43Z',
    }];
    const decisions = decideRelayDrops(inbound, outbound, { now: NOW });
    expect(decisions).toHaveLength(1);
    expect(decisions[0].action).toBe('ok');
  });

  it('REGRESSION CONTROL: still flags when genuinely nothing replied', () => {
    const inbound = [{
      id: '324acaff',
      payload: { kind: 'review_request', correlation_id: 'cb5587b3-aaaa-bbbb-cccc-111122223333' },
      created_at: '2026-08-12T20:42:44Z',
    }];
    const decisions = decideRelayDrops(inbound, [], { now: NOW });
    expect(decisions[0].action).toBe('flag');
  });

  it('REGRESSION CONTROL: an unrelated worker-signal body does not falsely satisfy', () => {
    const inbound = [{
      id: '324acaff',
      payload: { kind: 'review_request', correlation_id: 'cb5587b3-aaaa-bbbb-cccc-111122223333' },
      created_at: '2026-08-12T20:42:44Z',
    }];
    const outbound = [{
      id: 'unrelated1',
      payload: { signal_type: 'feedback', body: 'idle-absorb claim hint acked, no correlation here' },
      created_at: '2026-08-12T20:56:43Z',
    }];
    const decisions = decideRelayDrops(inbound, outbound, { now: NOW });
    expect(decisions[0].action).toBe('flag');
  });

  it('a relay_confirm row still satisfies via the pre-existing exact-match path (unchanged)', () => {
    const inbound = [{ id: 'in1', payload: { kind: PAYLOAD_KINDS.RELAY_REQUEST, correlation_id: 'c1' }, created_at: '2026-08-12T20:42:44Z' }];
    const outbound = [{ id: 'out1', payload: { kind: PAYLOAD_KINDS.RELAY_CONFIRM, correlation_id: 'c1' }, created_at: '2026-08-12T20:56:43Z' }];
    const decisions = decideRelayDrops(inbound, outbound, { now: NOW });
    expect(decisions[0].action).toBe('ok');
  });
});

describe('loadOutboundCandidates: the query must actually fetch feedback-signal rows', () => {
  it('wires an .or() filter including payload->>signal_type.eq.feedback alongside relay_confirm', () => {
    // The pure core above proves the MATCHING logic is correct, but decideRelayDrops can only
    // act on rows it is HANDED — this closes the other half: without widening the DB-side
    // query, the real fix (loadOutboundCandidates only ever selecting payload->>kind=
    // relay_confirm) would still never fetch a worker-signal row for the core to evaluate.
    const src = readFileSync(path.resolve(__dirname, '../../../lib/coordinator/relay-drop-gauge.cjs'), 'utf8');
    const fnSrc = src.slice(src.indexOf('async function loadOutboundCandidates'), src.indexOf('async function planRelayDrops'));
    expect(fnSrc).toMatch(/\.or\(/);
    expect(fnSrc).toMatch(/payload->>signal_type\.eq\.feedback/);
    expect(fnSrc).toMatch(/payload->>kind\.eq\./);
  });

  it('is exported and callable', () => {
    expect(typeof loadOutboundCandidates).toBe('function');
  });
});
