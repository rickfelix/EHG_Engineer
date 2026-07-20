/**
 * Unit tests — SD-LEO-INFRA-COORD-ADAM-COMMS-RESILIENT-001
 * Coordinator↔Adam comms resilience: 4 FRs matching the 4 live-confirmed defects.
 *   FR-1 correlation echo (dual-key replies + forgiving await matcher + --reply-to echo)
 *   FR-2 receipt contract (findUndelivered / selectRecentDeadLetters pure selectors)
 *   FR-3 directive-kind no-auto-ack allowlist (DIRECTIVE_KINDS imported, never duplicated)
 *   FR-4 dead-letter instead of delete (planDeadLetters pure planner + no-delete source pin)
 * Mocked clients + source pins only — no live DB writes.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { ADAM_LOOPS } from '../../scripts/adam-startup-check.mjs'; // SD-LEO-FIX-ADAM-INBOX-FULL-LANE-001 parity test
const require = createRequire(import.meta.url);

const ROOT = path.resolve(__dirname, '../..');
const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const ws = require('../../lib/fleet/worker-status.cjs');
const { classifyInboxMessage } = require('../../scripts/hooks/coordination-inbox.cjs');
const { ackMessage } = require('../../scripts/worker-checkin.cjs');
const { buildReplyPayload } = require('../../scripts/coordinator-reply.cjs');
const { awaitCoordinatorReply, buildRequestPayload } = require('../../scripts/worker-signal.cjs');
const { buildAdvisoryPayload, resolveReplyToCorrelation, drainInbox, isReplyRow, isDirectiveRow } = require('../../scripts/adam-advisory.cjs');
const sweep = require('../../scripts/stale-session-sweep.cjs');
const receipts = require('../../lib/coordinator/receipts.cjs');

const NOW = Date.parse('2026-06-10T12:00:00Z');
const MIN = 60_000;
const iso = (ms) => new Date(ms).toISOString();
const UUID_A = '11111111-2222-4333-8444-555555555555';
const UUID_B = '99999999-8888-4777-8666-555555555555';

// ───────────────────────────── FR-3 — directive-kind ACK withholding ─────────────────────────────

describe('FR-3: DIRECTIVE_KINDS allowlist', () => {
  it('exports the exact frozen directive-kind list', () => {
    expect(ws.DIRECTIVE_KINDS).toEqual([
      'coordinator_request',
      'work_assignment',
      'adam_action_required',
      'coordinator_reminder',
      'coordinator_to_adam',
      'coordinator_directive', // SD-LEO-FIX-ADAM-INBOX-FULL-LANE-001
      'chairman_directive', // SD-LEO-INFRA-THREE-WAY-COMMS-RELIABILITY-001-B / FR-1 (broadcast chairman directive, no-auto-ack)
      'fence_notice', // SD-LEO-INFRA-MID-FLIGHT-DIRECTIVE-001 / FR-2 (priority-exempt hard-stop notice)
      'review_request', // SD-LEO-INFRA-DISTINCT-REVIEW-REQUEST-001 (bidirectional coordinator<->Adam candid-feedback review)
    ]);
    expect(Object.isFrozen(ws.DIRECTIVE_KINDS)).toBe(true);
  });

  it('SOURCE PIN: every consumer IMPORTS the list — never duplicates it', () => {
    const consumers = [
      'scripts/hooks/coordination-inbox.cjs',
      'scripts/worker-checkin.cjs',
      'scripts/adam-advisory.cjs', // SD-LEO-FIX-ADAM-INBOX-FULL-LANE-001: full-lane inbox drain consumer
    ];
    for (const file of consumers) {
      const text = src(file);
      expect(text, `${file} must reference DIRECTIVE_KINDS`).toMatch(/DIRECTIVE_KINDS/);
      expect(text, `${file} must require lib/fleet/worker-status.cjs`).toMatch(/lib[/\\]fleet[/\\]worker-status\.cjs/);
      // duplication tripwire: no consumer may carry the kind literals themselves
      expect(text, `${file} must not duplicate the kind literals`).not.toMatch(/adam_action_required/);
    }
    // the canonical definition lives in exactly one place
    expect(src('lib/fleet/worker-status.cjs')).toMatch(/adam_action_required/);
  });

  it('kinds × roles matrix: NO directive kind ever gets markAck from the poll classifier', () => {
    const types = ['INFO', 'COACHING', 'WORK_ASSIGNMENT', 'PRIORITY_CHANGE'];
    for (const kind of ws.DIRECTIVE_KINDS) {
      for (const message_type of types) {
        for (const sender_type of ['chairman', 'coordinator', 'orchestrator', 'worker', undefined]) {
          for (const amAdam of [true, false]) {
            for (const isIdle of [true, false]) {
              for (const twoWayOn of [true, false]) {
                const v = classifyInboxMessage(
                  { message_type, payload: { kind }, sender_type },
                  { isIdle, twoWayOn, amAdam }
                );
                if (!v.skip) {
                  expect(v.markAck, `kind=${kind} type=${message_type} sender=${sender_type} amAdam=${amAdam}`).toBe(false);
                }
              }
            }
          }
        }
      }
    }
  });

  it('directive kinds stamp delivered_at (transport receipt) for non-Adam sessions — read_at stays NULL, never markAck', () => {
    // SD-LEO-INFRA-COORDINATOR-WAKE-ON-DIRECTIVE-001 FR-3: was {markRead:true} — stamping read_at on
    // the FIRST poll hid the row from consumers gating on read_at IS NULL (e.g.
    // coordinator-quiet-tick.mjs's hasUnactionedDirective(), Adam's inbox monitor) before it was ever
    // genuinely actioned — the root cause of the 2026-07-09 incident. Now markDelivered stamps the new
    // delivered_at column instead; read_at re-surfaces every throttled poll until genuine action.
    const v = classifyInboxMessage(
      { message_type: 'INFO', payload: { kind: 'coordinator_request' }, sender_type: 'coordinator' },
      { amAdam: false }
    );
    expect(v).toEqual({ skip: false, markRead: false, markDelivered: true, markAck: false });
  });

  it('roll_call keeps the legacy read+ack drain; plain coordinator INFO is now read-only (ack withheld for /checkin)', () => {
    // SD-LEO-INFRA-WORKER-INBOX-PUSH-DELIVERY-001: plain coordinator INFO push is delivered by the worker
    // /checkin loop (coordinator_messages[]), so the poll withholds ack. roll_call is the worker's OWN
    // availability ping (not coaching) and keeps the legacy full-drain so it never re-surfaces.
    expect(classifyInboxMessage({ message_type: 'INFO', payload: {} }, { amAdam: false }))
      .toEqual({ skip: false, markRead: true, markAck: false });
    expect(classifyInboxMessage({ message_type: 'INFO', payload: { kind: 'roll_call' } }, { amAdam: false }))
      .toEqual({ skip: false, markRead: true, markAck: true });
  });
});

describe('FR-3: worker-checkin ackMessage Adam-role guard', () => {
  function mockSb(updates) {
    return {
      from() {
        return {
          update(u) {
            updates.push(u);
            return { eq: async () => ({}) };
          },
        };
      },
    };
  }

  it('adam role + directive kind → read_at ONLY (no acknowledged_at)', async () => {
    const updates = [];
    await ackMessage(mockSb(updates), 'id-1', { role: 'adam', kind: 'coordinator_request' });
    expect(updates).toHaveLength(1);
    expect(updates[0]).toHaveProperty('read_at');
    expect(updates[0]).not.toHaveProperty('acknowledged_at');
  });

  it('adam role + WORK_ASSIGNMENT message_type (no payload.kind) → read_at ONLY', async () => {
    const updates = [];
    await ackMessage(mockSb(updates), 'id-2', { role: 'adam', kind: null, messageType: 'WORK_ASSIGNMENT' });
    expect(updates[0]).toHaveProperty('read_at');
    expect(updates[0]).not.toHaveProperty('acknowledged_at');
  });

  it('worker (role null) genuine claim still stamps BOTH (legacy behavior)', async () => {
    const updates = [];
    await ackMessage(mockSb(updates), 'id-3', { role: null, kind: 'work_assignment', messageType: 'WORK_ASSIGNMENT' });
    expect(updates[0]).toHaveProperty('read_at');
    expect(updates[0]).toHaveProperty('acknowledged_at');
  });

  it('adam role + NON-directive kind still stamps both', async () => {
    const updates = [];
    await ackMessage(mockSb(updates), 'id-4', { role: 'adam', kind: 'roll_call' });
    expect(updates[0]).toHaveProperty('acknowledged_at');
  });

  it('no opts (legacy call shape) stamps both — backward compatible', async () => {
    const updates = [];
    await ackMessage(mockSb(updates), 'id-5');
    expect(updates[0]).toHaveProperty('read_at');
    expect(updates[0]).toHaveProperty('acknowledged_at');
  });
});

// ───────────────────────────── FR-1 — correlation echo ─────────────────────────────

describe('FR-1: dual-key reply payload + forgiving await matcher', () => {
  it('buildReplyPayload echoes the correlation under BOTH reply_to and correlation_id', () => {
    const p = buildReplyPayload({ correlationId: 'corr-123', body: 'hi', coordinatorSession: UUID_A });
    expect(p.kind).toBe('coordinator_reply');
    expect(p.reply_to).toBe('corr-123');
    expect(p.correlation_id).toBe('corr-123');
    expect(p.signal_type).toBeUndefined();
    expect(p.intent_action).toBeUndefined();
  });

  function mockAwaitSb(replyRow, calls) {
    const chain = {
      from(t) { calls.push(['from', t]); return chain; },
      select(c) { calls.push(['select', c]); return chain; },
      eq(k, v) { calls.push(['eq', k, v]); return chain; },
      or(expr) { calls.push(['or', expr]); return chain; },
      in(k, v) { calls.push(['in', k, v]); return chain; },
      order() { return chain; },
      limit() { return Promise.resolve({ data: replyRow ? [replyRow] : [] }); },
    };
    return chain;
  }

  it('awaitCoordinatorReply matches on EITHER reply_to OR correlation_id, kind-filtered', async () => {
    const calls = [];
    const reply = { id: 'r1', payload: { kind: 'coordinator_reply', correlation_id: 'C-1' } };
    const res = await awaitCoordinatorReply(mockAwaitSb(reply, calls), {
      sessionId: UUID_A, correlationId: 'C-1', timeoutMs: 50, pollMs: 1, sleep: async () => {},
    });
    expect(res.ok).toBe(true);
    expect(res.reply.id).toBe('r1');
    const orCall = calls.find((c) => c[0] === 'or');
    expect(orCall[1]).toContain('payload->>reply_to.eq.C-1');
    expect(orCall[1]).toContain('payload->>correlation_id.eq.C-1');
    const inCall = calls.find((c) => c[0] === 'in');
    expect(inCall[1]).toBe('payload->>kind');
    expect(inCall[2]).toEqual(['coordinator_reply', 'adam_advisory']);
  });

  it('awaitCoordinatorReply times out cleanly when nothing matches', async () => {
    const res = await awaitCoordinatorReply(mockAwaitSb(null, []), {
      sessionId: UUID_A, correlationId: 'C-2', timeoutMs: 5, pollMs: 1, sleep: async () => {},
    });
    expect(res).toEqual({ ok: false, reply: null, timedOut: true });
  });

  it('request payload still carries correlation_id + expects_reply (unchanged contract)', () => {
    const p = buildRequestPayload({ correlationId: 'C-3', body: 'q', senderCallsign: 'alpha' });
    expect(p.kind).toBe('coordinator_request');
    expect(p.correlation_id).toBe('C-3');
    expect(p.expects_reply).toBe(true);
  });
});

describe('FR-1: adam-advisory --reply-to echo', () => {
  it('buildAdvisoryPayload({replyTo}) echoes under BOTH keys, overriding the fresh correlation', () => {
    const p = buildAdvisoryPayload({ body: 'answer', correlationId: 'fresh-uuid', replyTo: 'inbound-corr' });
    expect(p.kind).toBe('adam_advisory');
    expect(p.reply_to).toBe('inbound-corr');
    expect(p.correlation_id).toBe('inbound-corr'); // echo wins — a reply correlates to its request
  });

  it('without replyTo the payload is unchanged (fresh correlation, no reply_to)', () => {
    const p = buildAdvisoryPayload({ body: 'fyi', correlationId: 'fresh-uuid' });
    expect(p.correlation_id).toBe('fresh-uuid');
    expect(p.reply_to).toBeUndefined();
  });

  function mockRowSb(row) {
    return {
      from() {
        return {
          select() {
            return { eq() { return { maybeSingle: async () => ({ data: row }) }; } };
          },
        };
      },
    };
  }

  it('resolveReplyToCorrelation: row id → echoes the ROW\'s correlation_id', async () => {
    const corr = await resolveReplyToCorrelation(mockRowSb({ id: 'row-1', payload: { correlation_id: 'C-9' } }), 'row-1');
    expect(corr).toBe('C-9');
  });

  it('resolveReplyToCorrelation: no matching row → value treated as the correlation itself', async () => {
    const corr = await resolveReplyToCorrelation(mockRowSb(null), 'bare-corr');
    expect(corr).toBe('bare-corr');
  });

  it('resolveReplyToCorrelation: matching row WITHOUT correlation_id → throws REPLY_TO_NOT_REPLYABLE', async () => {
    await expect(resolveReplyToCorrelation(mockRowSb({ id: 'row-2', payload: {} }), 'row-2'))
      .rejects.toMatchObject({ code: 'REPLY_TO_NOT_REPLYABLE' });
  });
});

// ───────────────────────────── FR-4 — dead-letter instead of delete ─────────────────────────────

describe('FR-4: planDeadLetters (pure)', () => {
  const sets = () => ({
    allSessionIds: new Set([UUID_A]),     // UUID_A is known (alive unless in deadIds)
    deadIds: new Set([UUID_B]),           // UUID_B classified DEAD
  });
  const row = (over = {}) => ({
    id: 'm1', target_session: 'cccccccc-dddd-4eee-8fff-000000000000',
    message_type: 'INFO', payload: { kind: 'coordinator_request', body: 'go' }, expires_at: null,
    ...over,
  });

  it('eligible row (uuid target, gone, NULL expires) → dead-letter update, never a delete', () => {
    const plan = sweep.planDeadLetters([row()], sets(), NOW);
    expect(plan).toHaveLength(1);
    const u = plan[0].update;
    expect(u.read_at).toBe(iso(NOW));                       // drain marker
    expect(u.expires_at).toBe(iso(NOW + sweep.DEAD_LETTER_TTL_MS)); // 7d backfill (was NULL)
    expect(u.payload.dead_letter).toBe(true);
    expect(u.payload.dead_letter_at).toBe(iso(NOW));
    expect(u.payload.dead_letter_reason).toBe('target_dead');
    expect(u.payload.original_target).toBe('cccccccc-dddd-4eee-8fff-000000000000');
    expect(u.payload.kind).toBe('coordinator_request');     // original payload preserved
    expect(u.payload.body).toBe('go');
  });

  it('row with a PAST expires_at keeps it (no backfill — only NULL is backfilled)', () => {
    const plan = sweep.planDeadLetters([row({ expires_at: iso(NOW - MIN) })], sets(), NOW);
    expect(plan).toHaveLength(1);
    expect(plan[0].update.expires_at).toBeUndefined();
  });

  it('exclusions: future-expiry, non-uuid target, LIVE target, already dead-lettered', () => {
    const cases = [
      row({ expires_at: iso(NOW + 60 * MIN) }),                          // not yet expired
      row({ target_session: 'broadcast-coordinator' }),                  // not UUID-shaped
      row({ target_session: UUID_A }),                                   // known + not dead
      row({ payload: { dead_letter: true } }),                           // idempotency
    ];
    expect(sweep.planDeadLetters(cases, sets(), NOW)).toHaveLength(0);
  });

  it('a DEAD (classified) target IS dead-lettered even though it is in the classified set', () => {
    expect(sweep.planDeadLetters([row({ target_session: UUID_B })], sets(), NOW)).toHaveLength(1);
  });

  it('SOURCE PIN: the dead/gone-session cleanup section contains NO .delete() on session_coordination', () => {
    const text = src('scripts/stale-session-sweep.cjs');
    const start = text.indexOf('FIX #3');
    const end = text.indexOf('SD-LEO-FIX-STALE-SESSION-SWEEP-001', start); // next section AFTER FIX #3
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const section = text.slice(start, end);
    expect(section).not.toContain('.delete()');
    expect(section).toContain('planDeadLetters');
  });
});

// ───────────────────────────── FR-2 — receipt contract ─────────────────────────────

describe('FR-2: findUndelivered (pure)', () => {
  const sessions = [
    { session_id: UUID_A, heartbeat_at: iso(NOW - 2 * MIN) },   // live
    { session_id: UUID_B, heartbeat_at: iso(NOW - 60 * MIN) },  // stale heartbeat
  ];
  const out = (over = {}) => ({
    id: 'o1', target_session: UUID_A, read_at: null,
    created_at: iso(NOW - 30 * MIN), payload: { kind: 'coordinator_request' }, subject: 'GO',
    ...over,
  });

  it('flags an unread 30m-old row at a LIVE target, annotated with ageMs', () => {
    const r = receipts.findUndelivered([out()], sessions, { now: NOW });
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('o1');
    expect(r[0].ageMs).toBe(30 * MIN);
  });

  it('exclusions: already read, young, dead/stale target, unknown target, dead-lettered', () => {
    const cases = [
      out({ read_at: iso(NOW - MIN) }),                                  // delivered
      out({ created_at: iso(NOW - 5 * MIN) }),                           // younger than 10m default
      out({ target_session: UUID_B }),                                   // stale heartbeat — sweep's lane
      out({ target_session: 'cccccccc-dddd-4eee-8fff-000000000000' }),   // not in sessions
      out({ payload: { kind: 'coordinator_request', dead_letter: true } }), // dead-lettered
    ];
    expect(receipts.findUndelivered(cases, sessions, { now: NOW })).toHaveLength(0);
  });

  it('sorts oldest (largest age) first', () => {
    const r = receipts.findUndelivered(
      [out({ id: 'young', created_at: iso(NOW - 11 * MIN) }), out({ id: 'old', created_at: iso(NOW - 90 * MIN) })],
      sessions, { now: NOW }
    );
    expect(r.map((x) => x.id)).toEqual(['old', 'young']);
  });

  it('thresholds are injectable (ageMs / heartbeatFreshMs)', () => {
    const r = receipts.findUndelivered([out({ created_at: iso(NOW - 5 * MIN) })], sessions, { now: NOW, ageMs: 4 * MIN });
    expect(r).toHaveLength(1);
    const r2 = receipts.findUndelivered([out({ target_session: UUID_B })], sessions, { now: NOW, heartbeatFreshMs: 120 * MIN });
    expect(r2).toHaveLength(1); // 60m-old heartbeat counts as live under a 120m window
  });
});

describe('FR-2: selectRecentDeadLetters (pure)', () => {
  const dl = (at, over = {}) => ({
    id: 'd1', payload: { dead_letter: true, dead_letter_at: at, original_target: UUID_A }, ...over,
  });

  it('keeps rows dead-lettered within the 24h window, newest first; drops older + non-dead-letter rows', () => {
    const r = receipts.selectRecentDeadLetters([
      dl(iso(NOW - 60 * MIN), { id: 'recent' }),
      dl(iso(NOW - 2 * MIN), { id: 'newest' }),
      dl(iso(NOW - 48 * 60 * MIN), { id: 'too-old' }),
      { id: 'not-dl', payload: { kind: 'coordinator_request' } },
    ], { now: NOW });
    expect(r.map((x) => x.id)).toEqual(['newest', 'recent']);
  });
});

// ───────────── SD-LEO-FIX-ADAM-INBOX-FULL-LANE-001 — full-lane inbox drain ─────────────

describe('full-lane: isDirectiveRow / isReplyRow lane classification', () => {
  it('isDirectiveRow matches the IMPORTED DIRECTIVE_KINDS (incl. coordinator_directive), not replies/unknowns', () => {
    expect(isDirectiveRow({ payload: { kind: 'coordinator_directive' } })).toBe(true);
    expect(isDirectiveRow({ payload: { kind: 'coordinator_reminder' } })).toBe(true);
    expect(isDirectiveRow({ payload: { kind: 'coordinator_reply' } })).toBe(false); // reply lane, not directive
    expect(isDirectiveRow({ payload: { kind: 'totally_unknown' } })).toBe(false);
    expect(isDirectiveRow({ payload: {} })).toBe(false);
    expect(isDirectiveRow(null)).toBe(false);
  });
  it('isReplyRow matches coordinator_reply OR a payload.reply_to correlation', () => {
    expect(isReplyRow({ payload: { kind: 'coordinator_reply' } })).toBe(true);
    expect(isReplyRow({ payload: { reply_to: 'C-1' } })).toBe(true);
    expect(isReplyRow({ payload: { kind: 'coordinator_directive' } })).toBe(false);
  });
});

describe('full-lane: drainInbox surfaces BOTH lanes + two-stage ACK', () => {
  // AND-only server query (.eq target_session + .is acknowledged_at null), then a surface-stamp
  // update. SD-LEO-INFRA-ADAM-INBOX-SURFACE-NOT-STAMP-001: drainInbox added a window scope (gte)
  // and an advisory older-rows head-count (terminal .lt), so the mock routes by verb instead of
  // by call order.
  function mockInboxSb(rows, captured) {
    return {
      from(table) {
        const q = {
          select() { return q; },
          update(patch) { captured.update = patch; return q; },
          eq() { return q; },
          in(_k, ids) { captured.ids = ids; return q; },
          is() { return q; },
          gte() { return q; },
          lt() { return Promise.resolve({ count: 0, error: null }); },
          order() { return q; },
          limit() { return Promise.resolve({ data: rows, error: null }); },
          then(res, rej) {
            // SD-LEO-INFRA-DRAIN-SET-REGISTRY-001-C (Child B): drainInbox now also queries
            // role_drain_sets via the registry-reader — route it as PGRST205-style
            // table-not-found (STAGED/unapplied), the real state of that table today, so the
            // registry-reader fails open to DRAIN_SETS.adam exactly as before this repoint.
            // The session_coordination surface-stamp update still resolves via this same
            // terminal for any other table.
            if (table === 'role_drain_sets') {
              return Promise.resolve({ data: null, error: { code: 'PGRST205', message: 'not found' } }).then(res, rej);
            }
            return Promise.resolve({ data: [], error: null }).then(res, rej);
          },
        };
        return q;
      },
    };
  }

  it('surfaces a coordinator_directive AND a coordinator_reply; stamps read_at (DELIVERED), withholds acknowledged_at/actioned_at', async () => {
    const rows = [
      { id: 'dir-1', payload: { kind: 'coordinator_directive', body: 'do X' }, created_at: iso(NOW) },
      { id: 'rep-1', payload: { kind: 'coordinator_reply', reply_to: 'C-9', body: 'ack' }, created_at: iso(NOW) },
      // canary_request is handler-owned (EXCLUDED_KINDS) — never surfaced by the Adam inbox, in
      // ANY lane, regardless of future ADAM_INBOX_KINDS widening (QF-20260702-414: adam_advisory
      // itself is NOT "noise" any more — it drains via the normal lane when addressed to Adam).
      { id: 'noise', payload: { kind: 'canary_request', body: 'fyi' }, created_at: iso(NOW) }, // neither lane
    ];
    const captured = {};
    await drainInbox(mockInboxSb(rows, captured), UUID_A);
    expect(captured.ids).toEqual(['dir-1', 'rep-1']);              // both lanes surfaced; noise excluded
    expect(captured.update).toHaveProperty('read_at');            // DELIVERED
    expect(captured.update).not.toHaveProperty('acknowledged_at'); // two-stage ACK: withheld
    expect(captured.update).not.toHaveProperty('actioned_at');
  });

  it('no surfaced rows (only non-lane noise) → no DB update (idempotent / quiet)', async () => {
    const captured = {};
    await drainInbox(mockInboxSb([{ id: 'x', payload: { kind: 'canary_request' }, created_at: iso(NOW) }], captured), UUID_A);
    expect(captured.ids).toBeUndefined();
    expect(captured.update).toBeUndefined();
  });
});

describe('full-lane parity: ADAM_LOOPS inbox-monitor drains the full lane', () => {
  it('inbox-monitor prompt is the full-lane verb (not reply-only) — re-wiring drift guard', () => {
    const loop = ADAM_LOOPS.find((l) => l.key === 'inbox-monitor');
    expect(loop, 'inbox-monitor loop must exist').toBeTruthy();
    // SD-LEO-INFRA-CI-BASELINE-ROT-FIX-001 FR-1a: the inbox-monitor prompt deliberately carries
    // --quiet (noise-suppression for the recurring 15-min tick, see adam-startup-check.mjs +
    // adam-inbox-quiet-suppression.test.js). It is STILL the full-lane verb ("inbox", not a
    // reply-only verb) — the drift guard only needs to assert the full-lane verb, not the exact flags.
    expect(loop.prompt).toMatch(/^node scripts[/\\]adam-advisory\.cjs inbox(\s|$)/);
    expect(loop.prompt).not.toMatch(/replies\s*$/);
  });
});

describe('full-lane safety net: read-adam-directives covers EVERY directive sender', () => {
  it('DIRECTIVE_SENDERS includes chairman (a DELIVERED-but-unacked chairman directive stays recoverable)', () => {
    // The full-lane drain stamps read_at on directive rows of ANY sender; the acked-NULL safety net
    // must therefore not be sender-restricted, or a chairman directive is DELIVERED-then-dropped
    // (harness-bug 43c2dee2). Adversarial-review finding B1.
    const { DIRECTIVE_SENDERS } = require('../../scripts/read-adam-directives.cjs');
    expect(DIRECTIVE_SENDERS).toContain('chairman');
    expect(DIRECTIVE_SENDERS).toContain('coordinator');
    expect(DIRECTIVE_SENDERS).toContain('orchestrator');
  });
});
