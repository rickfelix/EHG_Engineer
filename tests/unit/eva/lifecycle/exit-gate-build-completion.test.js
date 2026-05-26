/**
 * Regression: S19->S20 exit gate is EVIDENCE-BASED, not asserted.
 * SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001 FR-4 (SECURITY VB-4).
 *
 * Proves an INCOMPLETE venture build is BLOCKED at S20: the build_mvp_build
 * "Application deployed" verifier (verifyBuildMvpBuildPresent, reached via
 * resolveVerifier) now fails closed when the artifact carries build-task
 * completion with complete < total. A bare register-deployment (which, after
 * the FR-4 stage19.js change, emits build_tasks_complete=null => 0) no longer
 * free-passes the transition. Artifacts with NO completion fields keep prior
 * existence-only semantics (backward compat for the Replit-reentry advisory).
 */
import { describe, it, expect } from 'vitest';
import { resolveVerifier } from '../../../../lib/eva/lifecycle/exit-gate-verifiers.js';

// Chainable supabase fake: every builder method returns `this`; maybeSingle
// resolves the configured { data, error }. Mirrors the venture_artifacts query
// shape in verifyBuildMvpBuildPresent.
function mockSupabase({ data = null, error = null } = {}) {
  const chain = {
    from() { return chain; },
    select() { return chain; },
    eq() { return chain; },
    limit() { return chain; },
    async maybeSingle() { return { data, error }; },
  };
  return chain;
}

const VID = '11111111-2222-3333-4444-555555555555';
const verifier = resolveVerifier('Application deployed');

describe('S19->S20 exit gate — build completion (FR-4)', () => {
  it('resolveVerifier maps "Application deployed" to a verifier', () => {
    expect(typeof verifier).toBe('function');
  });

  it('BLOCKS an incomplete build (complete < total)', async () => {
    const supabase = mockSupabase({
      data: { id: 'a1', artifact_data: { build_tasks_total: 7, build_tasks_complete: 3 } },
    });
    const r = await verifier({ supabase, ventureId: VID });
    expect(r.satisfied).toBe(false);
    expect(r.reason).toMatch(/incomplete: 3\/7/);
  });

  it('BLOCKS the bare register-deployment case (complete=null => 0)', async () => {
    // After the FR-4 stage19.js change, a register-deployment with no verified
    // count emits build_tasks_complete: null. normalizeBuildTaskCompletion treats
    // that as 0, so 0 < total => fail-closed.
    const supabase = mockSupabase({
      data: { id: 'a2', artifact_data: { build_tasks_total: 7, build_tasks_complete: null, build_completion_verified: false } },
    });
    const r = await verifier({ supabase, ventureId: VID });
    expect(r.satisfied).toBe(false);
    expect(r.reason).toMatch(/0\/7/);
  });

  it('ALLOWS a verified-complete build (complete >= total)', async () => {
    const supabase = mockSupabase({
      data: { id: 'a3', artifact_data: { build_tasks_total: 7, build_tasks_complete: 7, build_completion_verified: true } },
    });
    const r = await verifier({ supabase, ventureId: VID });
    expect(r.satisfied).toBe(true);
  });

  it('ALLOWS an artifact with NO completion fields (reentry advisory — backward compat)', async () => {
    const supabase = mockSupabase({
      data: { id: 'a4', artifact_data: { repo_url: 'https://github.com/x/y', deployment_url: 'https://x.repl.co' } },
    });
    const r = await verifier({ supabase, ventureId: VID });
    expect(r.satisfied).toBe(true);
  });

  it('BLOCKS when the artifact is missing / not is_current', async () => {
    const supabase = mockSupabase({ data: null });
    const r = await verifier({ supabase, ventureId: VID });
    expect(r.satisfied).toBe(false);
    expect(r.reason).toMatch(/missing or not is_current/);
  });

  it('FAILS-CLOSED on a query error', async () => {
    const supabase = mockSupabase({ data: null, error: { message: 'boom' } });
    const r = await verifier({ supabase, ventureId: VID });
    expect(r.satisfied).toBe(false);
    expect(r.reason).toMatch(/query failed/);
  });
});
