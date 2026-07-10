/**
 * SD-LEO-INFRA-COORDINATOR-WAKE-ON-DIRECTIVE-001 FR-1 / TS-3 / TS-4.
 *
 * hasUnactionedDirective() detects a pending DIRECTIVE_KINDS row targeting
 * the coordinator (read_at IS NULL) so scripts/coordinator-quiet-tick.mjs's
 * main() can override decideCadence's quiescent park with a short hard-wake
 * delay. Reuses the SAME DIRECTIVE_KINDS allowlist as every other consumer
 * (lib/fleet/worker-status.cjs) -- never a second hand-rolled copy.
 *
 * hasOutstandingChairmanDirective() covers the SEPARATE broadcast-lane case
 * (adversarial-review finding on PR #5794): a chairman_directive is issued
 * with target_session='broadcast' (never a real session id), so it can NEVER
 * match hasUnactionedDirective's target_session filter, and its compliance is
 * tracked by a wholly different mechanism (chairman_directive_ack rows, not
 * read_at) -- lib/coordinator/chairman-directive-gauge.cjs.
 */
import { describe, it, expect, vi } from 'vitest';
import { hasUnactionedDirective, hasOutstandingChairmanDirective } from '../../../scripts/coordinator-quiet-tick.mjs';

function buildSupabaseStub({ rows = [], error = null } = {}) {
  const state = { lastArgs: {} };
  const builder = {
    eq: vi.fn((col, val) => { state.lastArgs.eq = { col, val }; return builder; }),
    in: vi.fn((col, vals) => { state.lastArgs.in = { col, vals }; return builder; }),
    is: vi.fn((col, val) => { state.lastArgs.is = { col, val }; return builder; }),
    limit: vi.fn(() => Promise.resolve({ data: rows, error })),
  };
  return {
    from: vi.fn(() => ({ select: vi.fn(() => builder) })),
    _state: state,
  };
}

describe('hasUnactionedDirective (TS-3: directive-kind detection wires into the hard-wake decision)', () => {
  it('returns true when an unactioned DIRECTIVE_KINDS row targets the coordinator', async () => {
    const sb = buildSupabaseStub({ rows: [{ id: 'row-1' }] });
    const result = await hasUnactionedDirective(sb, 'coord-session-id');
    expect(result).toBe(true);
    expect(sb._state.lastArgs.eq).toEqual({ col: 'target_session', val: 'coord-session-id' });
    expect(sb._state.lastArgs.is).toEqual({ col: 'read_at', val: null });
  });

  it('returns false when no matching row exists', async () => {
    const sb = buildSupabaseStub({ rows: [] });
    expect(await hasUnactionedDirective(sb, 'coord-session-id')).toBe(false);
  });

  it('TS-4: fail-soft — a query error never throws, resolves false (never blocks the tick)', async () => {
    const sb = buildSupabaseStub({ rows: null, error: { message: 'boom' } });
    expect(await hasUnactionedDirective(sb, 'coord-session-id')).toBe(false);
  });

  it('returns false when coordinatorId is falsy (no active coordinator resolved)', async () => {
    const sb = buildSupabaseStub({ rows: [{ id: 'row-1' }] });
    expect(await hasUnactionedDirective(sb, null)).toBe(false);
    expect(sb.from).not.toHaveBeenCalled();
  });
});

/**
 * Mocks the exact query shape lib/coordinator/chairman-directive-gauge.cjs's
 * loadDirectives/loadAcks use: .from('session_coordination').select(...).eq('payload->>kind', KIND)
 * .gte('created_at', since).limit(N). Returns directives on the first .from() call (kind=chairman_directive)
 * and acks on the second (kind=chairman_directive_ack), matching Promise.all's call order.
 */
function buildChairmanGaugeSupabaseStub({ directives = [], acks = [] } = {}) {
  let callIndex = 0;
  return {
    from: vi.fn(() => {
      callIndex += 1;
      const rows = callIndex === 1 ? directives : acks;
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        gte: vi.fn(() => chain),
        limit: vi.fn(() => Promise.resolve({ data: rows, error: null })),
      };
      return chain;
    }),
  };
}

describe('hasOutstandingChairmanDirective (adversarial-review finding: broadcast-lane chairman_directive is a SEPARATE detection path)', () => {
  it('returns true when a chairman_directive applying to "coordinator" has no matching ack', async () => {
    const sb = buildChairmanGaugeSupabaseStub({
      directives: [{
        id: 'd1',
        payload: { kind: 'chairman_directive', directive_id: 'dir-1', applies_to: ['coordinator', 'adam'], issued_at: new Date().toISOString() },
      }],
      acks: [],
    });
    expect(await hasOutstandingChairmanDirective(sb)).toBe(true);
  });

  it('returns false once the coordinator role has genuinely acked (actioned_at present)', async () => {
    const now = new Date().toISOString();
    const sb = buildChairmanGaugeSupabaseStub({
      directives: [{ id: 'd1', payload: { kind: 'chairman_directive', directive_id: 'dir-1', applies_to: ['coordinator'], issued_at: now } }],
      acks: [{ id: 'a1', payload: { kind: 'chairman_directive_ack', directive_id: 'dir-1', role: 'coordinator', actioned_at: now } }],
    });
    expect(await hasOutstandingChairmanDirective(sb)).toBe(false);
  });

  it('returns false when no chairman_directive applies to the coordinator role', async () => {
    const sb = buildChairmanGaugeSupabaseStub({
      directives: [{ id: 'd1', payload: { kind: 'chairman_directive', directive_id: 'dir-1', applies_to: ['adam'], issued_at: new Date().toISOString() } }],
      acks: [],
    });
    expect(await hasOutstandingChairmanDirective(sb)).toBe(false);
  });

  it('fail-soft: never throws even if the underlying gauge query errors', async () => {
    const sb = { from: vi.fn(() => { throw new Error('boom'); }) };
    expect(await hasOutstandingChairmanDirective(sb)).toBe(false);
  });
});
