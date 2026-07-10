/**
 * SD-LEO-INFRA-COORDINATOR-WAKE-ON-DIRECTIVE-001 FR-1 / TS-3 / TS-4.
 *
 * hasUnactionedDirective() detects a pending DIRECTIVE_KINDS row targeting
 * the coordinator (read_at IS NULL) so scripts/coordinator-quiet-tick.mjs's
 * main() can override decideCadence's quiescent park with a short hard-wake
 * delay. Reuses the SAME DIRECTIVE_KINDS allowlist as every other consumer
 * (lib/fleet/worker-status.cjs) -- never a second hand-rolled copy.
 */
import { describe, it, expect, vi } from 'vitest';
import { hasUnactionedDirective } from '../../../scripts/coordinator-quiet-tick.mjs';

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
