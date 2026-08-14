/**
 * SD-ALTIFYAI-FDBK-FIX-GENERIC-SECURITY-SUB-001
 *
 * WHY THESE ASSERTIONS ARE SHAPED THIS WAY — the SECURITY sub-agent's catalog tier has never
 * executed. lib/sub-agents/security.js:499 calls supabase.rpc('get_tables_without_rls'), a
 * function with ZERO definitions in pg_proc in any schema, so one of the two fallbacks always
 * runs. Both fabricate a clean result: the inner branch returns
 * { checked:true, tables_without_rls:0, note:'...verified RLS migrations exist' } after
 * DISCARDING its own grep, and the outer catch returns the same shape with
 * 'Found 0 RLS ENABLE directives in migrations'. Over 365 days, 625 stored SECURITY rows carry
 * an rls_policies finding; 100% report checked:true / 0 unprotected tables (189 via the inner
 * note, 435 via the outer).
 *
 * THE TRAP THIS FILE EXISTS TO CATCH: the obvious fix is a NO-OP. Marking the fallback
 * checked:false changes nothing observable, because :215 gates only on a count (0 → else),
 * :244 registers rls_policies critical:false, and the evidence-absence guard's predicate at
 * :252 is criticalErrored.length === criticalScans.length — an ALL-critical-failed test, not
 * ANY. Even promoting :244 to critical:true leaves it unreachable. So every assertion below is
 * on the EMITTED VERDICT or on a finding value — never on note text, error strings, or source
 * shape, all of which go green the moment someone types the right string.
 *
 * RED-TODAY STATUS: TS-1a, TS-1b and TS-3 fail on their ASSERTIONS against unmodified main
 * (measured: verdict=PASS, confidence=100, warnings=[], critical_issues=[]). TS-2/TS-4/TS-5
 * fail because findings has exactly five keys today (security.js:91-97) and definer_posture is
 * not one of them. Deliberately, this file imports NOTHING that does not already exist, so the
 * pre-fix run is a real assertion failure and not an unresolved-import error.
 *
 * MOCKING: only the I/O seam is mocked (child_process.exec via the util.promisify.custom
 * symbol, and the two supabase-connection factories) — never the logic under test. Mock
 * behaviour is read from a vi.hoisted state object AT CALL TIME rather than at construction,
 * because security.js:41 holds `let supabase = null` at module scope and :56-58 initialises it
 * only when falsy: the client is created once and reused for every test in this file.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  // 'resolve-error' → supabase-js RESOLVES a PostgREST error (the real PGRST202 shape,
  //                   driving security.js:501). 'throw' → drives the outer catch at :525.
  rpcMode: 'resolve-error',
  // 'unavailable' → the connection factory throws (no credential / connection refused)
  // 'rows'        → return catalogRows
  catalogMode: 'unavailable',
  catalogRows: [],
  catalogError: 'Database password not found',
  lastSql: null
}));

// Every grep|wc -l scan resolves '0' — a genuinely clean repo. This isolates the catalog tier
// as the only thing under test: any non-PASS verdict must come from the catalog tier alone.
vi.mock('child_process', async () => {
  const { promisify } = await import('util');
  const exec = function exec() {};
  exec[promisify.custom] = () => Promise.resolve({ stdout: '0\n', stderr: '' });
  return { exec, default: { exec } };
});

vi.mock('../../../scripts/lib/supabase-connection.js', () => ({
  createSupabaseServiceClient: vi.fn(async () => ({
    rpc: async () => {
      if (state.rpcMode === 'throw') throw new Error('rpc get_tables_without_rls failed');
      if (state.rpcMode === 'resolve-error') {
        return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.get_tables_without_rls' } };
      }
      return { data: [], error: null };
    }
  })),
  createDatabaseClient: vi.fn(async () => {
    if (state.catalogMode === 'unavailable') throw new Error(state.catalogError);
    return {
      query: async (sql) => { state.lastSql = sql; return { rows: state.catalogRows }; },
      end: async () => {}
    };
  })
}));

vi.mock('../../../scripts/lib/handoff-preflight.js', () => ({
  quickPreflightCheck: vi.fn(async () => ({ ready: true, missing: [] }))
}));

vi.mock('../../../lib/sub-agents/resolve-repo.js', () => ({
  resolveSubAgentRepo: vi.fn(async () => ({ repoPath: '/fake/repo' })),
  applySubAgentRepoVerdict: vi.fn()
}));

const { execute } = await import('../../../lib/sub-agents/security.js');

/** A SECURITY DEFINER function owned by a BYPASSRLS role and callable by anon — the class. */
const EXPOSED = {
  schema: 'public', name: 'record_venture_error',
  args: 'p_venture_id uuid, p_error_hash text, p_message text, p_context jsonb',
  owner: 'postgres', owner_bypasses_rls: true, security_definer: true,
  anon_execute: true, authenticated_execute: true,
  // Present deliberately: this function's search_path IS pinned in production, which is
  // precisely why the existing CI sentinel cannot see it. Pinning must not be an exclusion axis.
  proconfig: ['search_path=pg_catalog, public']
};
const SAFE_NOT_BYPASSRLS = {
  schema: 'public', name: 'safe_owner_no_bypassrls', args: '', owner: 'app_owner',
  owner_bypasses_rls: false, security_definer: true, anon_execute: true, authenticated_execute: true
};
const SAFE_NO_PUBLIC_EXECUTE = {
  schema: 'public', name: 'safe_no_public_execute', args: '', owner: 'postgres',
  owner_bypasses_rls: true, security_definer: true, anon_execute: false, authenticated_execute: false
};

beforeEach(() => {
  state.rpcMode = 'resolve-error';
  state.catalogMode = 'unavailable';
  state.catalogRows = [];
  state.lastSql = null;
});

describe('SECURITY catalog tier — unavailability must not read as clean', () => {
  it('TS-1a: inner fallback (rpc RESOLVES a PGRST202 error) does not yield PASS@100', async () => {
    state.rpcMode = 'resolve-error';
    const r = await execute('SD-TEST-TS-1A', {}, {});
    expect(r.verdict).not.toBe('PASS');
    expect(r.confidence).not.toBe(100);
  });

  it('TS-1b: outer fallback (rpc THROWS) does not yield PASS@100', async () => {
    state.rpcMode = 'throw';
    const r = await execute('SD-TEST-TS-1B', {}, {});
    expect(r.verdict).not.toBe('PASS');
    expect(r.confidence).not.toBe(100);
  });

  it('TS-3: anti-no-op — an unrun catalog tier is SURFACED, not merely recorded', async () => {
    // The single assertion that distinguishes a real fix from the checked:false no-op.
    const r = await execute('SD-TEST-TS-3', {}, {});
    expect(r.warnings.length + r.critical_issues.length).toBeGreaterThan(0);
  });

  // FR-2 ISOLATION — these two exist because TS-1a/TS-1b DO NOT actually guard FR-2.
  //
  // Found by adversarial review and then reproduced by mutation: restoring BOTH fabricating
  // fallbacks to { checked:true, tables_without_rls:0 } — the exact pre-fix defect this SD is
  // named for — left all 254 tests GREEN. The reason is the disjunct in the verdict branch:
  // `catalogUnverified` is true if the RLS tier OR the definer probe is unverified, and the
  // suite's beforeEach leaves the probe unavailable. So TS-1a/TS-1b were passing entirely
  // through the FR-8 half and would have kept passing if FR-2 had never been written.
  //
  // These cases hold the definer probe AVAILABLE and CLEAN, which removes that disjunct and
  // leaves checkRLSPolicies as the ONLY possible source of a non-PASS verdict.
  it('FR-2/a: inner fallback alone drives non-PASS when the definer probe is available and clean', async () => {
    state.rpcMode = 'resolve-error';
    state.catalogMode = 'rows';
    state.catalogRows = [];
    const r = await execute('SD-TEST-FR2-INNER', {}, {});
    expect(r.findings.definer_posture.probe_ran).toBe(true);
    expect(r.findings.definer_posture.functions_at_risk).toBe(0);
    expect(r.findings.rls_policies.checked).toBe(false);
    expect(r.findings.rls_policies.tables_without_rls).toBeNull();
    expect(r.verdict).not.toBe('PASS');
    expect(r.confidence).not.toBe(100);
  });

  it('FR-2/b: outer fallback alone drives non-PASS when the definer probe is available and clean', async () => {
    state.rpcMode = 'throw';
    state.catalogMode = 'rows';
    state.catalogRows = [];
    const r = await execute('SD-TEST-FR2-OUTER', {}, {});
    expect(r.findings.definer_posture.probe_ran).toBe(true);
    expect(r.findings.rls_policies.checked).toBe(false);
    expect(r.findings.rls_policies.tables_without_rls).toBeNull();
    expect(r.verdict).not.toBe('PASS');
    expect(r.confidence).not.toBe(100);
  });

  it('TS-10: with no usable credential the probe reports probe_ran:false and a reason', async () => {
    state.catalogMode = 'unavailable';
    const r = await execute('SD-TEST-TS-10', {}, {});
    const posture = r.findings.definer_posture;
    expect(posture).toBeDefined();
    expect(posture.probe_ran).toBe(false);
    expect(posture.reason).toMatch(/password|credential|connect/i);
    // MUST be null, never 0 — a 0 here is exactly the count-only misread at security.js:215.
    expect(posture.functions_at_risk).toBeNull();
  });
});

describe('SECURITY catalog tier — positive detection of the exposed-DEFINER class', () => {
  it('TS-2: an exposed function is detected and the verdict is not PASS', async () => {
    state.catalogMode = 'rows';
    state.catalogRows = [EXPOSED];
    const r = await execute('SD-TEST-TS-2', {}, {});
    expect(r.findings.definer_posture.functions_at_risk).toBeGreaterThan(0);
    expect(r.verdict).not.toBe('PASS');
  });

  it('TS-5: a pinned search_path does NOT hide an exposed function', async () => {
    state.catalogMode = 'rows';
    state.catalogRows = [EXPOSED];
    const r = await execute('SD-TEST-TS-5', {}, {});
    const names = r.findings.definer_posture.functions.map(f => f.name);
    expect(names).toContain('record_venture_error');
  });

  it('TS-4: two-sided — safe functions are NOT flagged in the same run that flags an exposed one', async () => {
    state.catalogMode = 'rows';
    state.catalogRows = [EXPOSED, SAFE_NOT_BYPASSRLS, SAFE_NO_PUBLIC_EXECUTE];
    const r = await execute('SD-TEST-TS-4', {}, {});
    const names = r.findings.definer_posture.functions.map(f => f.name);
    expect(names).toContain('record_venture_error');
    expect(names).not.toContain('safe_owner_no_bypassrls');
    expect(names).not.toContain('safe_no_public_execute');
    expect(r.findings.definer_posture.functions_at_risk).toBe(1);
  });

  it('FR-1 AC-3: the emitted SQL constrains the class and does not filter on search_path', async () => {
    state.catalogMode = 'rows';
    state.catalogRows = [EXPOSED];
    await execute('SD-TEST-SQL', {}, {});
    expect(state.lastSql).toBeTruthy();
    expect(state.lastSql).toMatch(/prosecdef/);
    expect(state.lastSql).toMatch(/rolbypassrls/);
    expect(state.lastSql).toMatch(/has_function_privilege/);
    // Pinning is irrelevant to this class; filtering on it is the bug that hid 42 of 44.
    expect(state.lastSql).not.toMatch(/proconfig|search_path/);
  });
});

describe('SECURITY standing posture must not halt the fleet', () => {
  it('TS-9: reporting exposed functions never emits BLOCKED, FAIL or ERROR', async () => {
    // SECURITY has leo_sub_agents.priority=90, mapped to CRITICAL at
    // phase-subagent-orchestrator/index.js:212. result-aggregation.js:12-14 treats
    // verdict=FAIL at CRITICAL priority as a criticalFail → BLOCKED → canProceed=false,
    // identical fleet impact to emitting BLOCKED. SECURITY runs on ~758 SDs per 90 days,
    // so the standing 44-function posture must warn, never block.
    state.catalogMode = 'rows';
    state.catalogRows = [EXPOSED, SAFE_NOT_BYPASSRLS];
    const r = await execute('SD-TEST-TS-9', {}, {});
    expect(['BLOCKED', 'FAIL', 'ERROR']).not.toContain(r.verdict);
    expect(r.findings.definer_posture.functions_at_risk).toBeGreaterThan(0);
  });

  it('a clean, AVAILABLE catalog still yields PASS@100 — the fix must not flag everything', async () => {
    state.rpcMode = 'ok';
    state.catalogMode = 'rows';
    state.catalogRows = [];
    const r = await execute('SD-TEST-CLEAN', {}, {});
    expect(r.verdict).toBe('PASS');
    expect(r.confidence).toBe(100);
    expect(r.findings.definer_posture.probe_ran).toBe(true);
    expect(r.findings.definer_posture.functions_at_risk).toBe(0);
  });
});
