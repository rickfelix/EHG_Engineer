/**
 * SD-LEO-INFRA-VENTURE-DEPLOY-PIPELINE-001-D — promote() production path + pre-route
 * health gate + DEPLOY_UNREPRODUCIBLE findings. All cloud/DB/HTTP access mocked at the
 * network boundary ONLY (TR-4: the gate DECISION logic and registry writes run for real).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  promote, rollback, planPromoteActions, runHealthGate, PROMOTE_STATUSES,
} from '../../lib/venture-deploy/promote.js';

const DESCRIPTOR = {
  deployment_target: 'cloud-run',
  db_provider: 'neon',
  storage: 'r2',
  connection: { provider: 'neon', secret_ref: 'sm://x' },
};

/** Chainable mock covering ventures / venture_deployments / feedback (finding channel). */
function mockSupabase({ descriptor = DESCRIPTOR, insertError = null } = {}) {
  const state = { deployments: [], feedback: [], ventureUpdates: [] };
  const api = {
    state,
    from(table) {
      if (table === 'ventures') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { stack_descriptor: descriptor }, error: null }) }) }),
          update(patch) {
            return { eq: async () => { state.ventureUpdates.push(patch); return { data: null, error: null }; } };
          },
        };
      }
      if (table === 'venture_deployments') {
        return {
          insert(row) {
            return {
              select: () => ({
                maybeSingle: async () => {
                  if (insertError) return { data: null, error: { message: insertError } };
                  const rec = { id: `dep-${state.deployments.length + 1}`, created_at: new Date().toISOString(), ...row };
                  state.deployments.push(rec);
                  return { data: { id: rec.id }, error: null };
                },
              }),
            };
          },
          update(patch) {
            const chain = {
              _filters: [],
              eq(col, val) { chain._filters.push((r) => r[col] === val); return chain; },
              then(resolve) {
                state.deployments.filter((r) => chain._filters.every((f) => f(r)))
                  .forEach((r) => Object.assign(r, patch));
                resolve({ data: null, error: null });
              },
            };
            return chain;
          },
          select() {
            const chain = {
              _filters: [],
              eq(col, val) { chain._filters.push((r) => r[col] === val); return chain; },
              order() { return chain; },
              limit() { return chain; },
              async maybeSingle() {
                const hits = state.deployments.filter((r) => chain._filters.every((f) => f(r)));
                const hit = hits[hits.length - 1];
                return { data: hit ? { ...hit } : null, error: null };
              },
            };
            return chain;
          },
        };
      }
      if (table === 'feedback') {
        return {
          select() {
            const chain = {
              eq() { return chain; },
              limit() { return chain; },
              async maybeSingle() { return { data: null, error: null }; }, // no dedup hit
            };
            return chain;
          },
          insert(row) {
            const doInsert = async () => {
              const rec = { id: `fb-${state.feedback.length + 1}`, ...row };
              state.feedback.push(rec);
              return { data: { id: rec.id }, error: null };
            };
            return { select: () => ({ single: doInsert, maybeSingle: doInsert }) };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return api;
}

const okPreconditions = async () => ({ ok: true, reasons: [] });

describe('planPromoteActions', () => {
  it('cloud-run plan is no-traffic → health gate → route → stamp, in that order', () => {
    const kinds = planPromoteActions('cloud-run', 'abc123').map((a) => a.kind);
    expect(kinds).toEqual(['no_traffic_revision', 'health_gate', 'route_traffic', 'record_stamp']);
  });

  it('unknown family plans without adapters (no accidental deploy path)', () => {
    const actions = planPromoteActions('replit', 'abc123');
    expect(actions.every((a) => a.adapter === null)).toBe(true);
  });
});

describe('promote() plan mode (default)', () => {
  it('registers a planned row and never touches adapters', async () => {
    const supabase = mockSupabase();
    const result = await promote('v1', 'sha1', supabase);
    expect(result.status).toBe('planned');
    expect(result.deployment_id).toBe('dep-1');
    expect(supabase.state.deployments[0].status).toBe('planned');
    expect(supabase.state.ventureUpdates).toHaveLength(0);
  });

  it('degrades explicitly when the registry table is unavailable', async () => {
    const supabase = mockSupabase({ insertError: 'relation does not exist' });
    const result = await promote('v1', 'sha1', supabase);
    expect(result.status).toBe('registry_unavailable');
  });
});

describe('promote() execute mode — fail-closed preconditions', () => {
  it('fails closed when no verifyPreconditions is injected', async () => {
    const supabase = mockSupabase();
    const adapters = { deployCloudRun: vi.fn() };
    const result = await promote('v1', 'sha1', supabase, { adapters, execute: true });
    expect(result.status).toBe('failed');
    expect(result.reasons[0]).toMatch(/preconditions_unverifiable/);
    expect(adapters.deployCloudRun).not.toHaveBeenCalled();
  });

  it('aborts before any adapter call when preconditions fail (TS-3)', async () => {
    const supabase = mockSupabase();
    const adapters = { deployCloudRun: vi.fn() };
    const result = await promote('v1', 'sha1', supabase, {
      adapters, execute: true,
      verifyPreconditions: async () => ({ ok: false, reasons: ['spend guardrails not ready'] }),
    });
    expect(result.status).toBe('failed');
    expect(result.reasons).toContain('spend guardrails not ready');
    expect(adapters.deployCloudRun).not.toHaveBeenCalled();
    expect(supabase.state.deployments).toHaveLength(0); // aborted preconditions are not deploy attempts
  });
});

describe('promote() execute mode — pre-route health gate (TS-1/TS-2)', () => {
  it('failing health gate: traffic never routed, row failed, DEPLOY_UNREPRODUCIBLE emitted', async () => {
    const supabase = mockSupabase();
    const routeCalls = [];
    const adapters = {
      deployCloudRun: vi.fn(async (_args, ctx) => {
        if (ctx.mode === 'route_traffic') { routeCalls.push(ctx); return {}; }
        return { taggedUrl: 'https://preview-tag.example' };
      }),
    };
    const result = await promote('v1', 'sha1', supabase, {
      adapters, execute: true, verifyPreconditions: okPreconditions,
      healthProbe: async () => ({ ok: false, failures: ['/health: HTTP 500'] }),
    });
    expect(result.status).toBe('failed');
    expect(routeCalls).toHaveLength(0); // the gate is the ONLY path to traffic
    expect(supabase.state.deployments[0].status).toBe('failed');
    expect(supabase.state.ventureUpdates).toHaveLength(0); // no deployment_url stamp
    const finding = supabase.state.feedback[0];
    expect(finding).toBeDefined();
    expect(finding.metadata.finding_type).toBe('DEPLOY_UNREPRODUCIBLE');
  });

  it('happy path: gate passes, traffic routed, url stamped, row routed with sha/actor', async () => {
    const supabase = mockSupabase();
    const adapters = {
      deployCloudRun: vi.fn(async (_args, ctx) =>
        ctx.mode === 'route_traffic' ? { serviceUrl: 'https://live.example' } : { taggedUrl: 'https://tag.example' }),
    };
    const result = await promote('v1', 'sha1', supabase, {
      adapters, execute: true, actor: 'test-actor', verifyPreconditions: okPreconditions,
      healthProbe: async () => ({ ok: true, failures: [] }),
    });
    expect(result.status).toBe('routed');
    expect(result.url).toBe('https://live.example');
    const row = supabase.state.deployments[0];
    expect(row.status).toBe('routed');
    expect(row.sha).toBe('sha1');
    expect(row.actor).toBe('test-actor');
    expect(supabase.state.ventureUpdates[0].deployment_url).toBe('https://live.example');
  });

  it('adapter fault at no-traffic stage fails with a finding, never routes', async () => {
    const supabase = mockSupabase();
    const adapters = { deployCloudRun: vi.fn(async () => { throw new Error('gcloud exploded'); }) };
    const result = await promote('v1', 'sha1', supabase, {
      adapters, execute: true, verifyPreconditions: okPreconditions,
    });
    expect(result.status).toBe('failed');
    expect(supabase.state.feedback[0].metadata.finding_type).toBe('DEPLOY_UNREPRODUCIBLE');
  });
});

describe('runHealthGate', () => {
  it('passes when health + root respond 2xx', async () => {
    const fetchImpl = vi.fn(async () => ({ status: 200 }));
    const gate = await runHealthGate('https://x.example', { fetchImpl, timeoutMs: 100, retries: 0 });
    expect(gate.ok).toBe(true);
  });

  it('tolerates 404 on /health (no health route) but not on /', async () => {
    const fetchImpl = vi.fn(async (url) => ({ status: url.endsWith('/health') ? 404 : 200 }));
    expect((await runHealthGate('https://x.example', { fetchImpl, timeoutMs: 100, retries: 0 })).ok).toBe(true);
    const deadRoot = vi.fn(async () => ({ status: 404 }));
    expect((await runHealthGate('https://x.example', { fetchImpl: deadRoot, timeoutMs: 100, retries: 0 })).ok).toBe(false);
  });

  it('fails closed on 5xx with the status in the failure reason', async () => {
    const fetchImpl = vi.fn(async () => ({ status: 503 }));
    const gate = await runHealthGate('https://x.example', { fetchImpl, timeoutMs: 100, retries: 0 });
    expect(gate.ok).toBe(false);
    expect(gate.failures.join(' ')).toMatch(/503/);
  });

  it('a redirect-wall revision does NOT pass (final 3xx is a failure, not liveness)', async () => {
    // With redirect:follow a compliant fetch only surfaces 3xx when redirects
    // cannot resolve (loop/cap) — the gate must treat that as dead, never route it.
    const fetchImpl = vi.fn(async () => ({ status: 301 }));
    const gate = await runHealthGate('https://x.example', { fetchImpl, timeoutMs: 100, retries: 0 });
    expect(gate.ok).toBe(false);
  });

  it('clears its timeout even when the probe rejects (no timer leak)', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn(async () => { throw new Error('ECONNREFUSED'); });
      const gate = await runHealthGate('https://x.example', { fetchImpl, timeoutMs: 60000, retries: 0 });
      expect(gate.ok).toBe(false);
      expect(vi.getTimerCount()).toBe(0); // all timers cleared in finally
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('rollback()', () => {
  it('is a noop (no phantom record) when nothing was ever routed', async () => {
    const supabase = mockSupabase();
    const result = await rollback('v1', supabase);
    expect(result.status).toBe('noop');
    expect(supabase.state.deployments).toHaveLength(0);
  });

  it('plan mode records intent without executing and leaves the routed row live', async () => {
    const supabase = mockSupabase();
    supabase.state.deployments.push({ id: 'dep-0', venture_id: 'v1', sha: 'oldsha', status: 'routed', created_at: new Date().toISOString() });
    const result = await rollback('v1', supabase);
    expect(result.status).toBe('rolled_back');
    expect(result.executed).toBe(false);
    const rec = supabase.state.deployments.find((d) => d.metadata?.rolled_back_from === 'dep-0');
    expect(rec.sha).toBe('oldsha');
    expect(rec.metadata.intent).toBe('plan');
    expect(supabase.state.deployments[0].status).toBe('routed'); // traffic never moved
  });

  it('execute mode uses the FAMILY adapter (cloudflare → deployWorkers) and retires the routed row', async () => {
    const supabase = mockSupabase({ descriptor: { ...DESCRIPTOR, deployment_target: 'cloudflare-workers' } });
    supabase.state.deployments.push({ id: 'dep-0', venture_id: 'v1', sha: 'oldsha', status: 'routed', created_at: new Date().toISOString() });
    const adapters = { deployWorkers: vi.fn(async () => ({})), deployCloudRun: vi.fn() };
    const result = await rollback('v1', supabase, { adapters, execute: true });
    expect(result.executed).toBe(true);
    expect(adapters.deployWorkers).toHaveBeenCalledTimes(1);
    expect(adapters.deployCloudRun).not.toHaveBeenCalled();
    expect(supabase.state.deployments[0].status).toBe('rolled_back'); // retired from routed
  });

  it('execute mode adapter throw records an HONEST failed rollback (executed:false)', async () => {
    const supabase = mockSupabase();
    supabase.state.deployments.push({ id: 'dep-0', venture_id: 'v1', sha: 'oldsha', status: 'routed', created_at: new Date().toISOString() });
    const adapters = { deployCloudRun: vi.fn(async () => { throw new Error('gcloud rollback exploded'); }) };
    const result = await rollback('v1', supabase, { adapters, execute: true });
    expect(result.status).toBe('failed');
    expect(result.executed).toBe(false);
    expect(supabase.state.deployments[0].status).toBe('routed'); // NOT retired — traffic never moved
    const rec = supabase.state.deployments.find((d) => d.metadata?.rolled_back_from === 'dep-0');
    expect(rec.metadata.executed).toBe(false);
    expect(rec.error).toMatch(/exploded/);
  });
});

describe('status vocabulary', () => {
  it('PROMOTE_STATUSES matches the migration CHECK constraint', () => {
    expect(PROMOTE_STATUSES).toEqual(['planned', 'deployed_no_traffic', 'routed', 'failed', 'rolled_back']);
  });
});
