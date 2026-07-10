/**
 * SD-LEO-INFRA-VENTURE-DEPLOY-PIPELINE-001-D (PR 2/2) — gate wiring:
 * verifier dual-read + live-probe (FR-3), launch_mode deploy precondition (FR-5),
 * S19 deploy-provisioning check (FR-6). Mocks confined to the DB/HTTP boundary.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveVerifier } from '../../lib/eva/lifecycle/exit-gate-verifiers.js';
import { setLaunchMode } from '../../lib/eva/launch-mode.js';
import { checkDeployTargetProvisioned } from '../../lib/venture-deploy/provisioning-check.js';

const verifyPagesUrlLive = resolveVerifier('pages url live');
const verifyComputeDeployed = resolveVerifier('compute deployed');

/** Multi-table chainable mock: ventures / venture_deployments / chairman_decisions / launch_mode_audit. */
function mockSupabase({
  stackDescriptor = null,
  launchMode = 'simulated',
  routedRows = [],
  deploymentsError = null,
  decision = null,
} = {}) {
  const state = { auditRows: [], ventureUpdates: [] };
  const api = {
    state,
    from(table) {
      if (table === 'ventures') {
        return {
          select: (cols) => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: cols.includes('launch_mode')
                  ? { id: 'v1', launch_mode: launchMode }
                  : { stack_descriptor: stackDescriptor },
                error: null,
              }),
            }),
          }),
          update(patch) {
            const chain = {
              eq: () => chain,
              select: async () => { state.ventureUpdates.push(patch); return { data: [{ id: 'v1' }], error: null }; },
            };
            return chain;
          },
        };
      }
      if (table === 'venture_deployments') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => deploymentsError
            ? { data: null, error: { message: deploymentsError } }
            : { data: routedRows[routedRows.length - 1] ?? null, error: null },
        };
        return chain;
      }
      if (table === 'chairman_decisions') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: decision, error: null }) }) }),
        };
      }
      if (table === 'launch_mode_audit') {
        return {
          insert(row) {
            return {
              select: () => ({
                single: async () => {
                  const rec = { id: `audit-${state.auditRows.length + 1}`, ...row };
                  state.auditRows.push(rec);
                  return { data: { id: rec.id }, error: null };
                },
              }),
            };
          },
          update: () => ({ eq: async () => ({ data: null, error: null }) }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return api;
}

const APPROVED_DECISION = { id: 'dec-1', decided_by: 'chairman', venture_id: 'v1', status: 'approved' };
const LEGACY_PUBLISHED = { publish: { status: 'published', deploymentUrl: 'https://legacy.example' } };

afterEach(() => { delete process.env.LAUNCH_MODE_DEPLOY_PRECONDITION; });

describe('FR-3: verifyComputeDeployed dual-read (TS-5)', () => {
  it('passes on a routed venture_deployments row with no legacy publish record', async () => {
    const supabase = mockSupabase({ routedRows: [{ id: 'dep-1', url: 'https://live.example' }] });
    expect((await verifyComputeDeployed({ supabase, ventureId: 'v1' })).satisfied).toBe(true);
  });

  it('passes on legacy publish record only (transition path, retirement criterion documented)', async () => {
    const supabase = mockSupabase({ stackDescriptor: LEGACY_PUBLISHED });
    expect((await verifyComputeDeployed({ supabase, ventureId: 'v1' })).satisfied).toBe(true);
  });

  it('fails closed with neither', async () => {
    const supabase = mockSupabase({ stackDescriptor: {} });
    const r = await verifyComputeDeployed({ supabase, ventureId: 'v1' });
    expect(r.satisfied).toBe(false);
    expect(r.reason).toMatch(/fail-closed/);
  });

  it('deployments query fault falls through to the legacy read (dual-read exists for this)', async () => {
    const supabase = mockSupabase({ deploymentsError: 'relation does not exist', stackDescriptor: LEGACY_PUBLISHED });
    expect((await verifyComputeDeployed({ supabase, ventureId: 'v1' })).satisfied).toBe(true);
  });
});

describe('FR-3: verifyPagesUrlLive live-probe (TS-4)', () => {
  it('recorded URL that does not serve is fail-closed — the probe is load-bearing (R3)', async () => {
    const supabase = mockSupabase({ routedRows: [{ id: 'dep-1', url: 'https://dead.example' }] });
    const fetchImpl = vi.fn(async () => ({ status: 503 }));
    const r = await verifyPagesUrlLive({ supabase, ventureId: 'v1', fetchImpl });
    expect(r.satisfied).toBe(false);
    expect(r.reason).toMatch(/not serving/);
  });

  it('routed row URL that serves 2xx passes', async () => {
    const supabase = mockSupabase({ routedRows: [{ id: 'dep-1', url: 'https://live.example' }] });
    const fetchImpl = vi.fn(async () => ({ status: 200 }));
    expect((await verifyPagesUrlLive({ supabase, ventureId: 'v1', fetchImpl })).satisfied).toBe(true);
    expect(fetchImpl).toHaveBeenCalled();
  });

  it('legacy publish URL is also live-probed (probe applies to BOTH sources)', async () => {
    const supabase = mockSupabase({ stackDescriptor: LEGACY_PUBLISHED });
    const fetchImpl = vi.fn(async () => ({ status: 200 }));
    expect((await verifyPagesUrlLive({ supabase, ventureId: 'v1', fetchImpl })).satisfied).toBe(true);
    // The probe must actually run on the legacy path — a skipped probe would
    // also return satisfied:true and make this test's name a lie.
    expect(fetchImpl).toHaveBeenCalled();
  });

  it('legacy publish URL that is DEAD is fail-closed (the transition path gets no probe exemption)', async () => {
    const supabase = mockSupabase({ stackDescriptor: LEGACY_PUBLISHED });
    const fetchImpl = vi.fn(async () => ({ status: 503 }));
    const r = await verifyPagesUrlLive({ supabase, ventureId: 'v1', fetchImpl });
    expect(r.satisfied).toBe(false);
    expect(r.reason).toMatch(/not serving/);
  });

  it('a cross-origin redirect to a healthy 200 is fail-closed (off-host, shared safeHost semantics)', async () => {
    const supabase = mockSupabase({ routedRows: [{ id: 'dep-1', url: 'https://live.example' }] });
    const fetchImpl = vi.fn(async () => ({ status: 200, url: 'https://parked.other.example/' }));
    const r = await verifyPagesUrlLive({ supabase, ventureId: 'v1', fetchImpl });
    expect(r.satisfied).toBe(false);
    expect(r.reason).toMatch(/off-host/);
  });

  it('no URL anywhere is fail-closed without probing', async () => {
    const supabase = mockSupabase({ stackDescriptor: {} });
    const fetchImpl = vi.fn();
    const r = await verifyPagesUrlLive({ supabase, ventureId: 'v1', fetchImpl });
    expect(r.satisfied).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('FR-5: launch_mode deploy precondition (TS-6)', () => {
  it('observe mode (default): live-flip without a routed deploy PROCEEDS with a logged violation', async () => {
    const supabase = mockSupabase({ decision: APPROVED_DECISION, launchMode: 'simulated' });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const r = await setLaunchMode({ supabase, ventureId: 'v1', toMode: 'live', decision: { id: 'dec-1' } });
      expect(r.flipped).toBe(true);
      expect(spy.mock.calls.map((c) => c.join(' ')).join('\n')).toMatch(/DEPLOY-PRECONDITION VIOLATION/);
    } finally {
      spy.mockRestore();
    }
  });

  it('enforce mode: live-flip without a routed deploy is BLOCKED citing no_production_deploy', async () => {
    process.env.LAUNCH_MODE_DEPLOY_PRECONDITION = 'enforce';
    const supabase = mockSupabase({ decision: APPROVED_DECISION, launchMode: 'simulated' });
    const r = await setLaunchMode({ supabase, ventureId: 'v1', toMode: 'live', decision: { id: 'dec-1' } });
    expect(r.flipped).toBe(false);
    expect(r.reason).toMatch(/no_production_deploy/);
    expect(supabase.state.auditRows).toHaveLength(0); // blocked before audit write
  });

  it('enforce mode: live-flip WITH a routed deploy proceeds', async () => {
    process.env.LAUNCH_MODE_DEPLOY_PRECONDITION = 'enforce';
    const supabase = mockSupabase({
      decision: APPROVED_DECISION, launchMode: 'simulated',
      routedRows: [{ id: 'dep-1' }],
    });
    const r = await setLaunchMode({ supabase, ventureId: 'v1', toMode: 'live', decision: { id: 'dec-1' } });
    expect(r.flipped).toBe(true);
  });

  it('flips to simulated are never gated (emergency rollback path untouched)', async () => {
    process.env.LAUNCH_MODE_DEPLOY_PRECONDITION = 'enforce';
    const supabase = mockSupabase({ decision: APPROVED_DECISION, launchMode: 'live' });
    const r = await setLaunchMode({ supabase, ventureId: 'v1', toMode: 'simulated', decision: { id: 'dec-1' } });
    expect(r.flipped).toBe(true);
  });

  it('existing decision semantics unchanged: non-approved decision still blocks (regression)', async () => {
    const supabase = mockSupabase({ decision: { ...APPROVED_DECISION, status: 'rejected' } });
    const r = await setLaunchMode({ supabase, ventureId: 'v1', toMode: 'live', decision: { id: 'dec-1' } });
    expect(r.flipped).toBe(false);
    expect(r.reason).toMatch(/decision_not_approved/);
  });
});

describe('FR-6: checkDeployTargetProvisioned (TS-7)', () => {
  it('provisioned when stack_descriptor.connection carries provider + secret_ref', async () => {
    const supabase = mockSupabase({ stackDescriptor: { connection: { provider: 'neon', secret_ref: 'sm://x' } } });
    expect((await checkDeployTargetProvisioned(supabase, 'v1')).provisioned).toBe(true);
  });

  it('unprovisioned (missing connection) reports the honest cause', async () => {
    const supabase = mockSupabase({ stackDescriptor: {} });
    const r = await checkDeployTargetProvisioned(supabase, 'v1');
    expect(r.provisioned).toBe(false);
    expect(r.reason).toMatch(/not provisioned/);
  });

  it('query error is fail-closed with the true cause (never a silent pass)', async () => {
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'boom' } }) }) }) }) };
    const r = await checkDeployTargetProvisioned(supabase, 'v1');
    expect(r.provisioned).toBe(false);
    expect(r.reason).toMatch(/boom/);
  });
});
