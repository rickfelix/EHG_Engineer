/**
 * QF-20260719-387 — role-comms guard at the advisory send chokes.
 *
 * Live misroute d442d8ec: Adam ran solomon-advisory.cjs send from the Adam session;
 * the tool silently applied Solomon's routing defaults and an Adam->Solomon proposal
 * landed on the coordinator lane. These tests pin the guard policy:
 *   - sender-role mismatch is refused and the error names the caller's correct tool;
 *   - target-role read-back refuses a recipient-class mismatch;
 *   - role-resolution failures are fail-closed (exit) for classed sends;
 *   - broadcast sentinels are reported without a role lookup.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  resolveSessionRole, checkSenderRole, checkTargetRole,
  assertSenderRole, assertTargetRole, toolForRole,
} from './role-comms-guard.cjs';

function mockSupabase({ data, error } = {}) {
  const chain = {
    from: vi.fn(() => chain),
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(async () => ({ data, error })),
  };
  return chain;
}

const exitAsThrow = () => vi.spyOn(process, 'exit').mockImplementation((code) => {
  throw new Error(`EXIT:${code}`);
});

afterEach(() => vi.restoreAllMocks());

describe('resolveSessionRole', () => {
  it('returns the newest-heartbeat row role', async () => {
    const supabase = mockSupabase({ data: [{ session_id: 's1', heartbeat_at: 'now', metadata: { role: 'adam' } }] });
    await expect(resolveSessionRole(supabase, 's1')).resolves.toBe('adam');
    expect(supabase.eq).toHaveBeenCalledWith('session_id', 's1');
    expect(supabase.order).toHaveBeenCalledWith('heartbeat_at', { ascending: false });
  });

  it('returns null for a registered session without a role', async () => {
    const supabase = mockSupabase({ data: [{ session_id: 's1', metadata: {} }] });
    await expect(resolveSessionRole(supabase, 's1')).resolves.toBeNull();
  });

  it('derives coordinator from is_coordinator when role is absent (live lapse shape)', async () => {
    // The real coordinator election keys on metadata.is_coordinator, and the live row
    // verifiably has is_coordinator:true with NO role — strict role would false-block.
    const supabase = mockSupabase({ data: [{ session_id: 'c1', metadata: { is_coordinator: true } }] });
    await expect(resolveSessionRole(supabase, 'c1')).resolves.toBe('coordinator');
    const supabase2 = mockSupabase({ data: [{ session_id: 'c1', metadata: { is_coordinator: 'true' } }] });
    await expect(resolveSessionRole(supabase2, 'c1')).resolves.toBe('coordinator');
  });

  it('throws on DB error and on unknown session (fail-closed inputs)', async () => {
    await expect(resolveSessionRole(mockSupabase({ error: { message: 'boom' } }), 's1')).rejects.toThrow(/role lookup failed/);
    await expect(resolveSessionRole(mockSupabase({ data: [] }), 's1')).rejects.toThrow(/not found/);
    await expect(resolveSessionRole(mockSupabase({ data: [] }), null)).rejects.toThrow(/no session id/);
  });
});

describe('checkSenderRole — the incident shape', () => {
  it('refuses Adam running solomon-advisory and names adam-advisory as the right tool', () => {
    const verdict = checkSenderRole({ actualRole: 'adam', requiredRole: 'solomon', toolName: 'solomon-advisory.cjs' });
    expect(verdict.ok).toBe(false);
    expect(verdict.message).toContain('solomon outbound lane');
    expect(verdict.message).toContain('scripts/adam-advisory.cjs');
  });

  it('routes unregistered/worker roles to the /signal lane', () => {
    expect(toolForRole(null)).toContain('worker-signal');
    const verdict = checkSenderRole({ actualRole: null, requiredRole: 'adam', toolName: 'adam-advisory.cjs' });
    expect(verdict.ok).toBe(false);
    expect(verdict.message).toContain('unregistered');
  });

  it('passes the owner role through', () => {
    expect(checkSenderRole({ actualRole: 'solomon', requiredRole: 'solomon', toolName: 'x' }).ok).toBe(true);
  });
});

describe('checkTargetRole', () => {
  it('refuses a recipient-class mismatch', () => {
    const verdict = checkTargetRole({ actualRole: 'worker', expectedRole: 'coordinator', target: 't1' });
    expect(verdict.ok).toBe(false);
    expect(verdict.message).toContain('misroute');
  });
  it('passes a matching class', () => {
    expect(checkTargetRole({ actualRole: 'adam', expectedRole: 'adam', target: 't1' }).ok).toBe(true);
  });
});

describe('assert wrappers (fail-closed exits)', () => {
  it('assertSenderRole exits 4 on role mismatch', async () => {
    const exit = exitAsThrow();
    const supabase = mockSupabase({ data: [{ session_id: 's1', metadata: { role: 'adam' } }] });
    await expect(assertSenderRole(supabase, { sessionId: 's1', requiredRole: 'solomon', toolName: 'solomon-advisory.cjs' }))
      .rejects.toThrow('EXIT:4');
    expect(exit).toHaveBeenCalledWith(4);
  });

  it('assertSenderRole exits 4 when role resolution fails (fail-closed)', async () => {
    exitAsThrow();
    await expect(assertSenderRole(mockSupabase({ error: { message: 'net down' } }), { sessionId: 's1', requiredRole: 'adam', toolName: 'adam-advisory.cjs' }))
      .rejects.toThrow('EXIT:4');
  });

  it('assertTargetRole exits 4 on class mismatch, prints verification on match', async () => {
    exitAsThrow();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(assertTargetRole(mockSupabase({ data: [{ session_id: 't1', metadata: { role: 'worker' } }] }), { target: 't1', expectedRole: 'coordinator' }))
      .rejects.toThrow('EXIT:4');
    await assertTargetRole(mockSupabase({ data: [{ session_id: 't2', metadata: { role: 'coordinator' } }] }), { target: 't2', expectedRole: 'coordinator' });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('target-role verified: coordinator t2'));
  });

  it('assertTargetRole reports broadcast sentinels without a role lookup', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const supabase = { from: () => { throw new Error('must not query'); } };
    await assertTargetRole(supabase, { target: 'broadcast-coordinator', expectedRole: 'coordinator' });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('broadcast-coordinator (buffered sentinel'));
  });

  it('assertTargetRole treats a direct raw-session target as print-only (no class constraint)', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await assertTargetRole(mockSupabase({ data: [{ session_id: 't3', metadata: { role: 'worker' } }] }), { target: 't3', expectedRole: null });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('direct target'));
    // And an unresolvable direct target must NOT exit — informational only.
    await assertTargetRole(mockSupabase({ data: [] }), { target: 'ghost', expectedRole: null });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('role unresolved'));
  });
});
