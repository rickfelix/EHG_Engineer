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
import { execute } from '../../../lib/sub-agents/venture-stack.js';

// Minimal supabase double: .from(...).select(...).eq(...).single() -> { data, error }
function fakeSupabase(data, error = null) {
  const single = async () => ({ data, error });
  return { from: () => ({ select: () => ({ eq: () => ({ single }) }) }) };
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
});
