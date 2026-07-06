/**
 * Unit tests for the VENTURE_STACK sub-agent wrapper.
 * SD-LEO-INFRA-WIRE-PRE-BUILD-001 — FR-1
 *
 * Verifies the wrapper maps the deterministic runVentureStackAgent scan into the
 * results shape the executor persists: PASS for compliant leaves, FAIL (blocking)
 * for forbidden tech, negation-awareness preserved, and a fail-closed error path.
 * Fixtures mirror tests/unit/eva/venture-stack-agent.test.js. The supabase client
 * is injected (options.supabase) so this is a PURE unit test (no DB, no network).
 */
import { describe, it, expect } from 'vitest';
import { execute } from '../../../lib/sub-agents/venture_stack.js';

// Minimal supabase double: .from(...).select(...).eq(...).single() -> { data, error }
// Also supports .from('system_events').insert(...) for the FR-5 observe-only signal
// (recorded on `insertedRows` so tests can assert on it without a real DB).
function fakeSupabase(data, error = null, { insertedRows, insertShouldThrow = false } = {}) {
  const single = async () => ({ data, error });
  return {
    from: (table) => {
      if (table === 'system_events') {
        return {
          insert: async (row) => {
            if (insertShouldThrow) throw new Error('simulated system_events insert failure');
            if (insertedRows) insertedRows.push(row);
            return { data: null, error: null };
          },
        };
      }
      return { select: () => ({ eq: () => ({ single }) }) };
    },
  };
}

describe('VENTURE_STACK sub-agent wrapper (FR-1)', () => {
  it('PASS for a stack-compliant leaf (Clerk + Replit Postgres, no forbidden tech)', async () => {
    const sd = { id: 'u1', sd_key: 'SD-X', title: 'Auth API', description: 'Sign-in via Clerk; users in Replit Postgres.' };
    const r = await execute('u1', {}, { supabase: fakeSupabase(sd) });
    expect(r.verdict).toBe('PASS');
    expect(r.blockers).toHaveLength(0);
    expect(r.sub_agent_code).toBe('VENTURE_STACK');
    expect(r.findings.compliant).toBe(true);
  });

  it('FAIL (blocking) for a leaf that positively specifies forbidden tech (Replit Auth)', async () => {
    const sd = { id: 'u2', sd_key: 'SD-Y', title: 'Signup', description: 'Implement signup via Replit Auth.' };
    const r = await execute('u2', {}, { supabase: fakeSupabase(sd) });
    expect(r.verdict).toBe('FAIL');
    expect(r.blockers.length).toBeGreaterThan(0);
    expect(r.findings.violations).toContain('replit_auth');
  });

  it('preserves negation-awareness: "do NOT use Replit Auth" stays PASS', async () => {
    const sd = { id: 'u3', sd_key: 'SD-Z', title: 'Auth', description: 'Auth is Clerk; do NOT use Replit Auth.' };
    const r = await execute('u3', {}, { supabase: fakeSupabase(sd) });
    expect(r.verdict).toBe('PASS');
    expect(r.findings.violations).toEqual([]);
  });

  it('FAIL with an error summary when the leaf SD is not found (fail-closed)', async () => {
    const r = await execute('missing', {}, { supabase: fakeSupabase(null, { message: 'not found' }) });
    expect(r.verdict).toBe('FAIL');
    expect(r.confidence_score).toBe(0);
    expect(r.summary).toMatch(/error/i);
  });

  // Regression guard (consumer contract, not a brittle direct-path import):
  // the canonical executor loads modules via `../sub-agents/${code.toLowerCase()}.js`.
  // 'VENTURE_STACK'.toLowerCase() === 'venture_stack' (underscore). If the file is
  // ever renamed to a hyphen, the executor silently degrades to MANUAL_REQUIRED and
  // never runs execute() — so derive the path from the CODE exactly as the executor does.
  it('is loadable by the executor naming convention (code.toLowerCase())', async () => {
    const code = 'VENTURE_STACK';
    const mod = await import(`../../../lib/sub-agents/${code.toLowerCase()}.js`);
    expect(typeof mod.execute).toBe('function');
  });

  // SD-LEO-INFRA-ACTIVATE-DORMANT-EXIT-001 (FR-5): observe-only signal, never blocks.
  describe('FR-5 observe-only signal', () => {
    it('PASS + a warnings entry + a system_events row when required tech is unspecified', async () => {
      const sd = { id: 'u4', sd_key: 'SD-W', title: 'Widget', description: 'A small UI widget.' };
      const insertedRows = [];
      const r = await execute('u4', {}, { supabase: fakeSupabase(sd, null, { insertedRows }) });
      expect(r.verdict).toBe('PASS'); // never blocks
      expect(r.warnings.some((w) => w.includes('OBSERVE-ONLY'))).toBe(true);
      expect(insertedRows).toHaveLength(1);
      expect(insertedRows[0].event_type).toBe('VENTURE_STACK_OBSERVE_ONLY');
      expect(insertedRows[0].payload.would_fail).toBe(true);
    });

    it('no observe-only warning or event when the required stack is fully specified', async () => {
      const sd = { id: 'u1', sd_key: 'SD-X', title: 'Auth API', description: 'Sign-in via Clerk; users in Replit Postgres.' };
      const insertedRows = [];
      const r = await execute('u1', {}, { supabase: fakeSupabase(sd, null, { insertedRows }) });
      expect(r.warnings.some((w) => w.includes('OBSERVE-ONLY'))).toBe(false);
      expect(insertedRows).toHaveLength(0);
    });

    it('a system_events insert failure is non-fatal — verdict stays PASS with a fallback warning', async () => {
      const sd = { id: 'u4', sd_key: 'SD-W', title: 'Widget', description: 'A small UI widget.' };
      const r = await execute('u4', {}, { supabase: fakeSupabase(sd, null, { insertShouldThrow: true }) });
      expect(r.verdict).toBe('PASS');
      expect(r.warnings.some((w) => w.includes('non-fatal'))).toBe(true);
    });
  });
});
