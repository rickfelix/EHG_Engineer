/**
 * Unit tests for the Adam->coordinator action-required two-stage ACK + wake/SLA
 * escalation timer (FR-004). SD-LEO-INFRA-ADAM-COORDINATOR-ACTION-001.
 *
 * Network-free: the pure core (decideAdamActionAcks) is exercised against injected
 * session_coordination rows + an injected clock + SLA. The IO wiring
 * (planAndApplyAdamActionAcks / applyEscalation) is exercised against a fake
 * supabase that records inserts/updates — NO real DB, NO cron, NO network.
 *
 * Asserts (per the SD STEP-3 deliverable):
 *   (a) sweep-set read_at marks DELIVERED, not actioned;
 *   (b) an action-required handoff stays pending-action until a genuine ACK;
 *   (c) an un-actioned action-required handoff past the SLA -> escalate;
 *   (d) an ACKed handoff -> no escalation (done);
 *   (e) an informational (unflagged) message -> unaffected, never escalates;
 *   (f) escalation is idempotent (escalate once).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  decideAdamActionAcks,
  isActionRequired,
  isActioned,
  isDelivered,
  buildActionRequiredPayload,
  DEFAULT_SLA_MS,
  WAKE_ALERT_KIND,
  planAndApplyAdamActionAcks,
  applyEscalation,
} = require('./adam-action-ack.cjs');

const NOW = Date.parse('2026-06-07T12:00:00Z');
const MIN = 60 * 1000;
const COORD = 'coordinator-session-uuid';

/**
 * Build an Adam->coordinator handoff row. `payload` override REPLACES the default
 * payload wholesale (so "informational" / "actioned" / "escalated" cases are
 * precise). Default = an action-required, DELIVERED-but-un-actioned handoff.
 */
function msg(over = {}) {
  const payload = 'payload' in over ? over.payload : {
    kind: 'adam_action_required',
    action_required: true,
    action_kind: 'promote_to_orchestrator_and_decompose',
    request_ack: true,
  };
  return {
    id: over.id ?? 'sc-1',
    sender_session: over.sender_session ?? 'adam-session-uuid',
    target_session: over.target_session ?? COORD,
    subject: over.subject ?? '[ADAM_ACTION] promote + decompose',
    body: over.body ?? 'Please promote to orchestrator and decompose.',
    read_at: 'read_at' in over ? over.read_at : new Date(NOW - 15 * MIN).toISOString(),
    created_at: over.created_at ?? new Date(NOW - 16 * MIN).toISOString(),
    payload,
  };
}

const opts = (over = {}) => Object.assign({ now: NOW, slaMs: DEFAULT_SLA_MS, escalationEnabled: true }, over);

describe('decideAdamActionAcks — pure core (FR-001/002/003)', () => {
  it('(a) sweep-set read_at marks DELIVERED, NOT actioned — a fresh-read handoff is still pending', () => {
    // read_at set 1 min ago (the incident: sweep stamped it almost immediately),
    // well inside the SLA → DELIVERED but pending-action, never "done".
    const [d] = decideAdamActionAcks([msg({ read_at: new Date(NOW - 1 * MIN).toISOString() })], opts());
    expect(d.action).toBe('pending');
    // read_at present (delivered) but NOT actioned.
    expect(isDelivered(msg({ read_at: new Date(NOW - 1 * MIN).toISOString() }))).toBe(true);
    expect(isActioned(msg({ read_at: new Date(NOW - 1 * MIN).toISOString() }))).toBe(false);
  });

  it('(b) an action-required handoff stays pending-action until a genuine ACK (read_at alone never closes it)', () => {
    // Even when very stale, if the escalation flag is OFF it stays pending — read_at
    // is never treated as the action-ACK; only payload.actioned_at closes the loop.
    const stale = msg({ read_at: new Date(NOW - 60 * MIN).toISOString() });
    const [dFlagOff] = decideAdamActionAcks([stale], opts({ escalationEnabled: false }));
    expect(dFlagOff.action).toBe('pending');
    // And a not-yet-delivered action handoff (no read_at) is also pending, not done.
    const [dUndelivered] = decideAdamActionAcks([msg({ read_at: null })], opts());
    expect(dUndelivered.action).toBe('pending');
  });

  it('(c) an un-actioned action-required handoff DELIVERED past the SLA → escalate', () => {
    const [d] = decideAdamActionAcks([msg({ read_at: new Date(NOW - 15 * MIN).toISOString() })], opts());
    expect(d.action).toBe('escalate');
    expect(d.action_kind).toBe('promote_to_orchestrator_and_decompose');
    expect(d.id).toBe('sc-1');
  });

  it('(c2) DELIVERED but within the SLA → pending (not yet escalatable)', () => {
    const [d] = decideAdamActionAcks([msg({ read_at: new Date(NOW - 5 * MIN).toISOString() })], opts());
    expect(d.action).toBe('pending');
  });

  it('(d) a genuinely ACKed handoff (payload.actioned_at) → done, NO escalation even when stale', () => {
    const acked = msg({
      read_at: new Date(NOW - 60 * MIN).toISOString(),
      payload: {
        kind: 'adam_action_required',
        action_required: true,
        action_kind: 'promote_to_orchestrator_and_decompose',
        actioned_at: new Date(NOW - 50 * MIN).toISOString(),
      },
    });
    const [d] = decideAdamActionAcks([acked], opts());
    expect(d.action).toBe('done');
  });

  it('(e) an informational (unflagged) message → no decision at all (unaffected, never escalates)', () => {
    const info = msg({
      id: 'info',
      read_at: new Date(NOW - 60 * MIN).toISOString(),
      payload: { kind: 'adam_advisory', body: 'fyi' }, // NO action_required flag
    });
    const decisions = decideAdamActionAcks([info], opts());
    expect(decisions).toHaveLength(0);
    expect(isActionRequired(info)).toBe(false);
  });

  it('(f) escalation is idempotent — once payload.escalated_at is stamped it is NOT re-escalated', () => {
    const escalated = msg({
      read_at: new Date(NOW - 60 * MIN).toISOString(),
      payload: {
        kind: 'adam_action_required',
        action_required: true,
        action_kind: 'promote_to_orchestrator_and_decompose',
        escalated_at: new Date(NOW - 40 * MIN).toISOString(),
      },
    });
    const [d] = decideAdamActionAcks([escalated], opts());
    expect(d.action).toBe('done'); // idempotent — not 'escalate'
  });

  it('flag OFF: aged un-actioned action handoff → pending (no escalate) — flag gates the WAKE WRITE', () => {
    const [d] = decideAdamActionAcks([msg({ read_at: new Date(NOW - 15 * MIN).toISOString() })], opts({ escalationEnabled: false }));
    expect(d.action).toBe('pending');
  });

  it('mixed batch: only the flagged action handoff yields a decision; informational rows are dropped', () => {
    const action = msg({ id: 'act', read_at: new Date(NOW - 15 * MIN).toISOString() });
    const info = msg({ id: 'inf', read_at: new Date(NOW - 15 * MIN).toISOString(), payload: { kind: 'adam_advisory' } });
    const decisions = decideAdamActionAcks([action, info], opts());
    expect(decisions).toHaveLength(1);
    expect(decisions[0].id).toBe('act');
    expect(decisions[0].action).toBe('escalate');
  });
});

describe('buildActionRequiredPayload — explicit FR-003 flag', () => {
  it('carries action_required=true + action_kind + request_ack, and NO signal_type/intent_action', () => {
    const p = buildActionRequiredPayload({ actionKind: 'promote_to_orchestrator_and_decompose', body: 'do it', senderCallsign: 'Adam' });
    expect(p.action_required).toBe(true);
    expect(p.action_kind).toBe('promote_to_orchestrator_and_decompose');
    expect(p.request_ack).toBe(true); // reuses the DELIVERED transport-ack layer
    expect(p.kind).toBe('adam_action_required');
    expect(p.signal_type).toBeUndefined();
    expect(p.intent_action).toBeUndefined();
  });
});

// ── IO wiring (fake supabase, still network-free) ───────────────────────────

function makeFakeSupabase({ rows = [] } = {}) {
  const inserts = [];
  const updates = [];
  const sb = {
    from(table) {
      if (table !== 'session_coordination') throw new Error('unexpected table ' + table);
      const builder = {
        _eq: [],
        select() { return builder; },
        gte() { return builder; },
        eq(col, val) { builder._eq.push([col, val]); return builder; },
        order() { return builder; },
        limit() {
          // terminal for the SELECT path
          return Promise.resolve({ data: rows, error: null });
        },
        insert(row) {
          inserts.push(row);
          return Promise.resolve({ data: { id: 'wake-1' }, error: null });
        },
        update(patch) {
          const u = { patch, eq: [] };
          updates.push(u);
          const upd = {
            eq(col, val) { u.eq.push([col, val]); return upd; },
            then(resolve) { return Promise.resolve({ error: null }).then(resolve); },
          };
          return upd;
        },
      };
      return builder;
    },
  };
  return { sb, inserts, updates };
}

describe('planAndApplyAdamActionAcks — tick wiring (network-free)', () => {
  it('flag ON: an aged un-actioned action handoff escalates — emits a wake row + stamps escalated_at', async () => {
    const rows = [msg({ id: 'go', read_at: new Date(NOW - 15 * MIN).toISOString() })];
    const { sb, inserts, updates } = makeFakeSupabase({ rows });
    const res = await planAndApplyAdamActionAcks(sb, {
      env: { COORD_ADAM_ACTION_ACK_V1: 'true' },
      now: NOW,
      coordinatorId: COORD,
    });
    expect(res.enabled).toBe(true);
    expect(res.escalated).toBe(1);
    // (1) wake/action-required alert row inserted, targeting the coordinator.
    expect(inserts).toHaveLength(1);
    expect(inserts[0].target_session).toBe(COORD);
    expect(inserts[0].payload.kind).toBe(WAKE_ALERT_KIND);
    expect(inserts[0].payload.escalated_for).toBe('go');
    // (2) idempotency stamp written back to the original handoff.
    expect(updates).toHaveLength(1);
    expect(updates[0].patch.payload.escalated_at).toBeTruthy();
    expect(updates[0].eq).toEqual(expect.arrayContaining([['id', 'go']]));
  });

  it('flag OFF: NO writes occur (inert), the aged handoff stays pending', async () => {
    const rows = [msg({ id: 'noop', read_at: new Date(NOW - 15 * MIN).toISOString() })];
    const { sb, inserts, updates } = makeFakeSupabase({ rows });
    const res = await planAndApplyAdamActionAcks(sb, {
      env: { COORD_ADAM_ACTION_ACK_V1: 'false' },
      now: NOW,
      coordinatorId: COORD,
    });
    expect(res.enabled).toBe(false);
    expect(res.escalated).toBe(0);
    expect(res.pending).toBe(1);
    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it('flag ON: an ACKed handoff does not escalate (done) — no writes', async () => {
    const rows = [msg({
      id: 'acked',
      read_at: new Date(NOW - 60 * MIN).toISOString(),
      payload: { action_required: true, action_kind: 'x', actioned_at: new Date(NOW - 50 * MIN).toISOString() },
    })];
    const { sb, inserts, updates } = makeFakeSupabase({ rows });
    const res = await planAndApplyAdamActionAcks(sb, {
      env: { COORD_ADAM_ACTION_ACK_V1: 'true' },
      now: NOW,
      coordinatorId: COORD,
    });
    expect(res.escalated).toBe(0);
    expect(res.done).toBe(1);
    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it('applyEscalation is fail-open when the original-row update errors', async () => {
    let insertCalled = false;
    const erroring = {
      from() {
        return {
          insert() { insertCalled = true; return Promise.resolve({ error: null }); },
          update() {
            return { eq() { return Promise.resolve({ error: { message: 'boom' } }); } };
          },
        };
      },
    };
    const res = await applyEscalation(erroring, msg({ id: 'e' }), { action_kind: 'x', reason: 'r' }, NOW);
    expect(insertCalled).toBe(true); // wake row attempted
    expect(res.ok).toBe(false);
    expect(res.error).toBe('boom');
  });
});
