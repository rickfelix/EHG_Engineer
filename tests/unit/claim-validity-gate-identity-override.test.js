/**
 * SD-LEO-INFRA-SESSION-IDENTITY-RECONCILIATION-001 (FR-2) — IDENTITY_DRIFT_OVERRIDE
 * escape hatch with audit_log + 3/24h rate limit.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies BEFORE importing the gate.
vi.mock('child_process', () => ({ execSync: vi.fn() }));
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, realpathSync: vi.fn((p) => p), existsSync: vi.fn(() => false), readdirSync: vi.fn(() => []) };
});
vi.mock('../../lib/resolve-own-session.js', () => ({
  resolveOwnSession: vi.fn().mockResolvedValue({ data: { session_id: 'sess-test' }, source: 'env_var' }),
}));
vi.mock('../../lib/session-identity-sot.js', () => {
  const m = {
    isEnabled: vi.fn(() => true),
    discoverRepoRoot: vi.fn(() => null),
    validateSourcesAgree: vi.fn(),
  };
  return { default: m, ...m };
});
vi.mock('../../lib/claim-lifecycle-release.mjs', () => ({
  detectSdKeyDrift: vi.fn(() => 'aligned'),
}));

const sotMod = await import('../../lib/session-identity-sot.js');
const { assertValidClaim, ClaimIdentityError } = await import('../../lib/claim-validity-gate.js');

/**
 * Build a configurable Supabase mock supporting both:
 *   .from('audit_log').select('id', {count:'exact', head:true}).eq().gte() → {count, error}
 *   .from('audit_log').insert(row) → {error}
 *   .from('strategic_directives_v2').select().eq().maybeSingle() → {data, error}
 */
function mockSupabase({ auditCount = 0, auditCountErr = null, auditInsertErr = null, sd = null, sdErr = null } = {}) {
  const calls = { audit_select: 0, audit_insert: 0, sd_select: 0 };
  const insertedRows = [];
  const supabase = {
    from: vi.fn((table) => {
      if (table === 'audit_log') {
        return {
          select: () => ({
            eq: () => ({
              gte: vi.fn().mockImplementation(() => {
                calls.audit_select++;
                return Promise.resolve({ count: auditCount, error: auditCountErr });
              }),
            }),
          }),
          insert: vi.fn((row) => {
            calls.audit_insert++;
            insertedRows.push(row);
            return Promise.resolve({ error: auditInsertErr });
          }),
        };
      }
      if (table === 'strategic_directives_v2') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockImplementation(() => {
                calls.sd_select++;
                return Promise.resolve({ data: sd, error: sdErr });
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
  return { supabase, calls, insertedRows };
}

describe('FR-2: IDENTITY_DRIFT_OVERRIDE in claim-validity-gate', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.IDENTITY_DRIFT_OVERRIDE;
    sotMod.validateSourcesAgree.mockReset();
    sotMod.isEnabled.mockReturnValue(true);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('AC-2.1: without IDENTITY_DRIFT_OVERRIDE, identity-drift throws ClaimIdentityError (existing behavior unchanged)', async () => {
    sotMod.validateSourcesAgree.mockReturnValue({
      ok: false,
      sources: { canonical: 'A', envVar: 'B', pointer: 'C' },
      agreement: { agree: false, reason: 'disagreement', conflicts: [
        { source: 'canonical', value: 'A' },
        { source: 'envVar', value: 'B' },
        { source: 'pointer', value: 'C' },
      ] },
      remediation: 'fix it',
    });
    const { supabase } = mockSupabase();
    await expect(assertValidClaim(supabase, 'SD-AC21-001', { operation: 'test' }))
      .rejects.toMatchObject({ reason: 'no_deterministic_identity' });
  });

  it('AC-2.2: with override + identity-drift → returns PASS, audit_log INSERT, telemetry', async () => {
    process.env.IDENTITY_DRIFT_OVERRIDE = 'test-recovery';
    sotMod.validateSourcesAgree.mockReturnValue({
      ok: false,
      sources: { canonical: 'A', envVar: 'B', pointer: null },
      agreement: { agree: false, reason: 'disagreement', conflicts: [
        { source: 'canonical', value: 'A' }, { source: 'envVar', value: 'B' },
      ] },
    });
    // After override succeeds, CHECK 2 (claim ownership) runs — provide a self-claim SD so the gate returns 'self'.
    const { supabase, insertedRows, calls } = mockSupabase({
      auditCount: 0,
      sd: { sd_key: 'SD-AC22-001', claiming_session_id: 'sess-test', worktree_path: null, current_phase: 'LEAD' },
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = await assertValidClaim(supabase, 'SD-AC22-001', { operation: 'test', allowMainRepoForAcquisition: true });
    expect(result.ownership).toBe('self');
    expect(calls.audit_insert).toBe(1);
    expect(insertedRows[0]).toMatchObject({
      action: 'identity_drift_override',
      severity: 'warning',
      details: expect.objectContaining({ sd_key: 'SD-AC22-001', reason: 'test-recovery' }),
    });
    const stderrCalls = stderrSpy.mock.calls.map(c => c[0]).join('');
    expect(stderrCalls).toContain('identity.override.applied');
    stderrSpy.mockRestore();
  });

  it('AC-2.3: 4th use within 24h → throws identity_drift_override_rate_limited', async () => {
    process.env.IDENTITY_DRIFT_OVERRIDE = 'test-rate-limit';
    sotMod.validateSourcesAgree.mockReturnValue({
      ok: false,
      sources: { canonical: 'A', envVar: 'B', pointer: null },
      agreement: { agree: false, reason: 'disagreement', conflicts: [{ source: 'envVar', value: 'B' }] },
    });
    // count=3 already → rate-limit blocks 4th use
    const { supabase, calls } = mockSupabase({ auditCount: 3 });
    await expect(assertValidClaim(supabase, 'SD-AC23-001', { operation: 'test' }))
      .rejects.toMatchObject({ reason: 'identity_drift_override_rate_limited' });
    expect(calls.audit_insert).toBe(0);
  });

  it('AC-2.4: with override + foreign_claim → identity-drift override does NOT apply', async () => {
    process.env.IDENTITY_DRIFT_OVERRIDE = 'should-not-help';
    // SOT says sources agree (no drift), so override is irrelevant.
    sotMod.validateSourcesAgree.mockReturnValue({
      ok: true,
      sessionId: 'sess-test',
      sources: { canonical: 'sess-test', envVar: 'sess-test', pointer: null },
      agreement: { agree: true, sessionId: 'sess-test', presentSources: ['canonical', 'envVar'] },
    });
    // SD is claimed by SOMEONE ELSE → CHECK 2 throws foreign_claim
    const { supabase, calls } = mockSupabase({
      sd: { sd_key: 'SD-AC24-001', claiming_session_id: 'sess-other', worktree_path: null, current_phase: 'LEAD' },
    });
    // claim-lifecycle-release.detectSdKeyDrift is mocked to 'aligned' so we don't auto-release;
    // we also need supabase.from('claude_sessions').select().eq().maybeSingle() to return a live owner
    // so CHECK 2 takes the foreign_claim path. Extend the mock dynamically:
    const originalFrom = supabase.from;
    supabase.from = vi.fn((table) => {
      if (table === 'claude_sessions') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({
          data: { status: 'active', is_alive: true, sd_key: 'SD-AC24-001' }, error: null,
        }) }) }) };
      }
      return originalFrom(table);
    });
    await expect(assertValidClaim(supabase, 'SD-AC24-001', { operation: 'test' }))
      .rejects.toMatchObject({ reason: 'foreign_claim' });
    expect(calls.audit_insert).toBe(0);  // override did NOT fire
  });
});
