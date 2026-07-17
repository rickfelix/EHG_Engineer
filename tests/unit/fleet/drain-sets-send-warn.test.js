/**
 * Unit tests for the send-time target-drain contract.
 * SD: SD-LEO-INFRA-SEND-TIME-TARGET-001
 *
 * Send-time validation checked only the GLOBAL kind vocabulary, so a send could pass
 * yet orphan at the target role (Adam's good-morning canary sent adam_advisory to
 * Solomon — SOLOMON_INBOX_KINDS never drains it; Solomon MODE-B finding b93d8966).
 * These tests pin:
 *   - DRAIN_SETS shape: frozen per-role map; solomon mirrors SOLOMON_INBOX_KINDS
 *     semantics plus comms_check (FR-1/FR-3),
 *   - warnIfUndrainedKind: warns on a confident mismatch, silent on drained kinds,
 *     terminal replies, unknown roles, missing input; never throws (FR-2),
 *   - resolveTargetRole: caller hint wins; sentinel targets map to roles (FR-2),
 *   - solomon-advisory drainInbox surfaces a Solomon-directed comms_check with the
 *     ack instruction instead of orphaning it (FR-3).
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  DRAIN_SETS, TERMINAL_REPLY_KINDS, warnIfUndrainedKind, DIRECTIVE_KINDS, PAYLOAD_KINDS,
} = require('../../../lib/fleet/worker-status.cjs');
const { resolveTargetRole, SENTINEL_ROLES } = require('../../../lib/coordinator/dispatch.cjs');
const { SOLOMON_INBOX_KINDS, drainInbox } = require('../../../scripts/solomon-advisory.cjs');

describe('DRAIN_SETS (FR-1)', () => {
  test('frozen per-role map naming solomon, adam, coordinator, worker', () => {
    expect(Object.isFrozen(DRAIN_SETS)).toBe(true);
    for (const role of ['solomon', 'adam', 'coordinator', 'worker']) {
      expect(Array.isArray(DRAIN_SETS[role])).toBe(true);
      expect(Object.isFrozen(DRAIN_SETS[role])).toBe(true);
      expect(DRAIN_SETS[role].length).toBeGreaterThan(0);
    }
  });

  test('solomon set mirrors SOLOMON_INBOX_KINDS plus comms_check (FR-3)', () => {
    for (const kind of SOLOMON_INBOX_KINDS) {
      expect(DRAIN_SETS.solomon).toContain(kind);
    }
    expect(DRAIN_SETS.solomon).toContain('comms_check');
    // The founding defect: adam_advisory must NOT be in Solomon's drain set.
    expect(DRAIN_SETS.solomon).not.toContain(PAYLOAD_KINDS.ADAM_ADVISORY);
  });

  test('every role drains all DIRECTIVE_KINDS except worker (worker drains its directed subset)', () => {
    for (const role of ['solomon', 'adam', 'coordinator']) {
      for (const kind of DIRECTIVE_KINDS) {
        expect(DRAIN_SETS[role]).toContain(kind);
      }
    }
    expect(DRAIN_SETS.worker).toContain(PAYLOAD_KINDS.WORK_ASSIGNMENT);
    expect(DRAIN_SETS.worker).toContain('comms_check');
  });
});

describe('warnIfUndrainedKind (FR-2)', () => {
  test('warns on the founding defect: adam_advisory → solomon', () => {
    const log = vi.fn();
    const warned = warnIfUndrainedKind({ targetRole: 'solomon', kind: 'adam_advisory', log });
    expect(warned).toBe(true);
    expect(log).toHaveBeenCalledOnce();
    const msg = log.mock.calls[0][0];
    expect(msg).toContain('adam_advisory');
    expect(msg).toContain('solomon');
    expect(msg).toContain('warn-only');
  });

  test('silent on a drained kind: solomon_consult → solomon', () => {
    const log = vi.fn();
    expect(warnIfUndrainedKind({ targetRole: 'solomon', kind: 'solomon_consult', log })).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });

  test('silent on terminal reply kinds regardless of role', () => {
    const log = vi.fn();
    for (const kind of TERMINAL_REPLY_KINDS) {
      expect(warnIfUndrainedKind({ targetRole: 'solomon', kind, log })).toBe(false);
    }
    expect(log).not.toHaveBeenCalled();
  });

  test('silent (fail-open) on unknown role, missing role, missing kind — and never throws', () => {
    const log = vi.fn();
    expect(warnIfUndrainedKind({ targetRole: 'chairman', kind: 'adam_advisory', log })).toBe(false);
    expect(warnIfUndrainedKind({ targetRole: null, kind: 'adam_advisory', log })).toBe(false);
    expect(warnIfUndrainedKind({ targetRole: 'solomon', kind: null, log })).toBe(false);
    expect(warnIfUndrainedKind({})).toBe(false);
    expect(warnIfUndrainedKind()).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });

  test('role match is case-insensitive', () => {
    const log = vi.fn();
    expect(warnIfUndrainedKind({ targetRole: 'Solomon', kind: 'adam_advisory', log })).toBe(true);
  });
});

describe('resolveTargetRole (FR-2)', () => {
  const throwingClient = { from() { throw new Error('no lookup expected'); } };

  test('caller hint wins without any lookup', async () => {
    await expect(resolveTargetRole(throwingClient, '9d03c69f-9178-46e0-9ff6-8164d24171b7', 'solomon'))
      .resolves.toBe('solomon');
  });

  test('sentinel targets map to their role without any lookup', async () => {
    expect(SENTINEL_ROLES['broadcast-solomon']).toBe('solomon');
    await expect(resolveTargetRole(throwingClient, 'broadcast-solomon')).resolves.toBe('solomon');
    await expect(resolveTargetRole(throwingClient, 'broadcast-coordinator')).resolves.toBe('coordinator');
    await expect(resolveTargetRole(throwingClient, 'broadcast-adam')).resolves.toBe('adam');
  });

  test("'broadcast' (all roles) and non-UUID targets resolve to null (silent)", async () => {
    await expect(resolveTargetRole(throwingClient, 'broadcast')).resolves.toBe(null);
    await expect(resolveTargetRole(throwingClient, 'not-a-uuid')).resolves.toBe(null);
    await expect(resolveTargetRole(throwingClient, null)).resolves.toBe(null);
  });

  test('a UUID matching no role identity resolves to null — never inferred as worker (no mis-warn)', async () => {
    await expect(resolveTargetRole(throwingClient, '9d03c69f-9178-46e0-9ff6-8164d24171b7'))
      .resolves.toBe(null);
  });
});

describe('solomon-advisory drainInbox surfaces comms_check (FR-3)', () => {
  let logSpy, warnSpy;
  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => { logSpy.mockRestore(); warnSpy.mockRestore(); });

  function mockSupabase(rows) {
    const updates = [];
    const chain = {
      select() { return chain; },
      eq() { return chain; },
      is() { return chain; },
      order() { return chain; },
      limit() { return Promise.resolve({ data: rows, error: null }); },
      update(p) { updates.push(p); return chain; },
      in() { return Promise.resolve({ data: [], error: null }); },
    };
    return { from() { return chain; }, _updates: updates };
  }

  test('a Solomon-directed comms_check row renders with the ack instruction and is not consumed', async () => {
    const client = mockSupabase([{
      id: 'cc-row-1', sender_session: 'coord', sender_type: 'coordinator', message_type: 'INFO',
      subject: 'COMMS CHECK', body: null,
      payload: { kind: 'comms_check', body: 'radio check from coordinator' },
      created_at: new Date().toISOString(),
    }]);
    await drainInbox(client, 'solomon-session-id', { quiet: true });
    const out = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(out).toContain('comms_check');
    expect(out).toContain('cc-row-1');
    expect(out).toContain('Ack:');
    // Not treated as an orphan (the pre-fix behavior was silence; the orphan tier warns).
    const warned = warnSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(warned).not.toContain('cc-row-1');
    // acknowledged_at is never stamped by the drain (surface, don't consume).
    expect(client._updates.every((u) => !('acknowledged_at' in u))).toBe(true);
  });
});
