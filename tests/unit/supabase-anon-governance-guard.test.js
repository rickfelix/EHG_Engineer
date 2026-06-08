/**
 * Unit tests — SD-FDBK-FIX-GUARD-ANON-SUPABASE-001
 * The anon client guard warns (once per table) on a mutating call to a governance table —
 * RLS silently drops such writes (0 rows, no error). Reads + non-governance writes are silent.
 * Network-free: a fake client + injected warn spy; no env, no real supabase.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { isGovernanceTable, wrapAnonClientWithGovernanceGuard } = require('../../lib/supabase-client.cjs');

// Fake supabase client whose builder records the op so we can assert delegation/chaining.
function makeFakeClient() {
  return {
    from(table) {
      const mk = (op) => () => ({ __op: op, __table: table });
      return { select: mk('select'), update: mk('update'), insert: mk('insert'), upsert: mk('upsert'), delete: mk('delete') };
    },
  };
}

describe('isGovernanceTable', () => {
  it('matches RLS-protected governance tables, not others', () => {
    expect(isGovernanceTable('strategic_directives_v2')).toBe(true);
    expect(isGovernanceTable('product_requirements_v2')).toBe(true);
    expect(isGovernanceTable('claude_sessions')).toBe(false);
    expect(isGovernanceTable('feedback')).toBe(false);
  });
});

describe('wrapAnonClientWithGovernanceGuard', () => {
  it('warns on a mutating call to a governance table', () => {
    const warn = vi.fn();
    const c = wrapAnonClientWithGovernanceGuard(makeFakeClient(), warn);
    c.from('strategic_directives_v2').update({ status: 'completed' });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/RLS will SILENTLY drop|createSupabaseServiceClient/);
  });

  it('warns at most once per table (one-time)', () => {
    const warn = vi.fn();
    const c = wrapAnonClientWithGovernanceGuard(makeFakeClient(), warn);
    c.from('strategic_directives_v2').update({});
    c.from('strategic_directives_v2').delete();
    c.from('strategic_directives_v2').upsert({});
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('does NOT warn on a read (.select) of a governance table', () => {
    const warn = vi.fn();
    const c = wrapAnonClientWithGovernanceGuard(makeFakeClient(), warn);
    c.from('strategic_directives_v2').select('*');
    expect(warn).not.toHaveBeenCalled();
  });

  it('does NOT warn on a write to a non-governance table', () => {
    const warn = vi.fn();
    const c = wrapAnonClientWithGovernanceGuard(makeFakeClient(), warn);
    c.from('claude_sessions').update({ heartbeat_at: 'now' });
    expect(warn).not.toHaveBeenCalled();
  });

  it('still delegates the real call (behavior + chaining preserved)', () => {
    const warn = vi.fn();
    const c = wrapAnonClientWithGovernanceGuard(makeFakeClient(), warn);
    const res = c.from('strategic_directives_v2').update({ x: 1 });
    expect(res).toEqual({ __op: 'update', __table: 'strategic_directives_v2' });
    // non-governance read also delegates unchanged
    expect(c.from('feedback').select()).toEqual({ __op: 'select', __table: 'feedback' });
  });

  it('is fail-open: a client whose .from throws is returned unchanged (never breaks creation)', () => {
    const bad = { from() { throw new Error('boom'); } };
    // wrapping itself must not throw; binding .from is fine, the throw happens on call
    const wrapped = wrapAnonClientWithGovernanceGuard(bad, vi.fn());
    expect(wrapped).toBe(bad);
  });
});
