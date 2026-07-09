/**
 * SD-LEO-INFRA-VENTURE-DEPLOY-PIPELINE-001-B — preview primitive + TTL reaper.
 * All cloud/DB access mocked: no CLI, no live table required.
 */
import { describe, it, expect } from 'vitest';
import {
  preview, planPreviewActions, ephemeralDbRef, DEFAULT_PREVIEW_TTL_MS,
} from '../../lib/venture-deploy/preview.js';
import { reapExpiredPreviews, isReapEligible } from '../../scripts/venture-preview-reaper.mjs';

const DESCRIPTOR = {
  deployment_target: 'cloud-run',
  db_provider: 'neon',
  storage: 'r2',
  connection: { provider: 'neon', secret_ref: 'sm://x' },
};

/** Minimal chainable mock of the two tables preview()/reaper touch. */
function mockSupabase({ descriptor = DESCRIPTOR, insertError = null, rows = [] } = {}) {
  const state = { instances: [...rows], updates: [] };
  const api = {
    state,
    from(table) {
      if (table === 'ventures') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { stack_descriptor: descriptor }, error: null }) }) }),
        };
      }
      if (table === 'venture_preview_instances') {
        return {
          insert(row) {
            return {
              select: () => ({
                maybeSingle: async () => {
                  if (insertError) return { data: null, error: { message: insertError } };
                  const rec = { id: `inst-${state.instances.length + 1}`, ...row };
                  state.instances.push(rec);
                  return { data: { id: rec.id }, error: null };
                },
              }),
            };
          },
          select() {
            const chain = {
              _filters: [],
              eq(col, val) { chain._filters.push((r) => r[col] === val); return chain; },
              in(col, vals) { chain._filters.push((r) => vals.includes(r[col])); return chain; },
              lt(col, val) { chain._filters.push((r) => new Date(r[col]) < new Date(val)); return chain; },
              async maybeSingle() {
                const hit = state.instances.find((r) => chain._filters.every((f) => f(r)));
                return { data: hit ? { ...hit } : null, error: null };
              },
              then(resolve) { // awaited as a list query
                const hits = state.instances.filter((r) => chain._filters.every((f) => f(r)));
                resolve({ data: hits.map((h) => ({ ...h })), error: null });
              },
            };
            return chain;
          },
          update(patch) {
            const chain = {
              _filters: [],
              eq(col, val) { chain._filters.push((r) => r[col] === val); return chain; },
              in(col, vals) { chain._filters.push((r) => vals.includes(r[col])); return chain; },
              then(resolve) {
                const hits = state.instances.filter((r) => chain._filters.every((f) => f(r)));
                hits.forEach((r) => Object.assign(r, patch));
                state.updates.push({ patch, count: hits.length });
                resolve({ data: null, error: null });
              },
            };
            return chain;
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return api;
}

describe('planPreviewActions / ephemeralDbRef', () => {
  it('cloud-run family plans a no-traffic tagged revision + neutral db + seed + registry', () => {
    const actions = planPreviewActions('cloud-run', 'abc123', 'fx-1');
    expect(actions.map((a) => a.kind)).toEqual(['no_traffic_revision', 'ephemeral_db', 'seed_hook', 'registry_register']);
    expect(actions[0].adapter).toBe('deployCloudRun');
    expect(actions[0].desc).toContain('--no-traffic --tag preview-abc123');
    const dbRef = actions.find((a) => a.kind === 'ephemeral_db').db_ref;
    expect(dbRef.candidates).toEqual(['ensureD1', 'ensureNeon']);
    expect(dbRef.chosen).toBeNull(); // adjudication pending — NEVER chosen here
  });

  it('cloudflare family rides native version previews; replit family plans no compute', () => {
    expect(planPreviewActions('cloudflare', 's', null)[0].adapter).toBe('deployWorkers');
    expect(planPreviewActions('replit', 's', null)[0].adapter).toBeNull();
  });

  it('ephemeralDbRef is frozen and neutral', () => {
    const ref = ephemeralDbRef('fx');
    expect(ref.kind).toBe('ephemeral_branch');
    expect(Object.isFrozen(ref)).toBe(true);
  });
});

describe('preview() plan mode', () => {
  it('registers a planned instance with TTL and returns blocked_on_credentials without touching any CLI', async () => {
    const sb = mockSupabase();
    const t0 = new Date('2026-07-09T12:00:00Z');
    const res = await preview('v-1', 'abc123', 'fx-1', sb, { now: () => t0 });
    expect(res.status).toBe('blocked_on_credentials');
    expect(res.instance_id).toBe('inst-1');
    expect(res.url).toBeNull();
    expect(res.planned_actions).toHaveLength(4);
    const row = sb.state.instances[0];
    expect(row.status).toBe('planned');
    expect(new Date(row.expires_at).getTime()).toBe(t0.getTime() + DEFAULT_PREVIEW_TTL_MS);
  });

  it('degrades to registry_unavailable when the table is missing (insert error), never throws', async () => {
    const sb = mockSupabase({ insertError: 'relation "venture_preview_instances" does not exist' });
    const res = await preview('v-1', 'abc123', null, sb);
    expect(res.status).toBe('registry_unavailable');
    expect(res.instance_id).toBeNull();
    expect(res.planned_actions).toHaveLength(4); // the plan is still the contract
  });

  it('teardown marks the row reaped and is idempotent', async () => {
    const sb = mockSupabase();
    const res = await preview('v-1', 'abc123', 'fx', sb);
    expect((await res.teardown()).reaped).toBe(true);
    expect(sb.state.instances[0].status).toBe('reaped');
    const second = await res.teardown();
    expect(second.reaped).toBe(false);
    expect(second.already).toBe(true);
  });

  it('refuses on an invalid stack descriptor (fail-loud, mirrors publish)', async () => {
    const sb = mockSupabase({ descriptor: null });
    await expect(preview('v-1', 'abc', null, sb)).rejects.toThrow(/stack_descriptor/);
  });

  it('real execution path marks failed (never live) when an adapter throws', async () => {
    const sb = mockSupabase();
    const adapters = { deployCloudRun: async () => { throw new Error('gcloud exploded'); } };
    const res = await preview('v-1', 'abc', null, sb, { adapters, execute: true });
    expect(res.status).toBe('failed');
    expect(sb.state.instances[0].status).toBe('failed');
  });

  it('real execution path goes live and captures the preview URL', async () => {
    const sb = mockSupabase();
    const adapters = { deployCloudRun: async () => ({ previewUrl: 'https://preview-abc---svc.run.app' }) };
    const res = await preview('v-1', 'abc', null, sb, { adapters, execute: true });
    expect(res.status).toBe('live');
    expect(res.url).toContain('preview-abc');
    expect(sb.state.instances[0].status).toBe('live');
  });
});

describe('reaper', () => {
  const NOW = '2026-07-09T12:00:00Z';
  const mk = (id, status, expiresAt) => ({ id, venture_id: 'v-1', sha: 's', fixture_id: null, status, url: null, expires_at: expiresAt, metadata: {} });

  it('isReapEligible: expired planned/live only', () => {
    expect(isReapEligible(mk('a', 'planned', '2026-07-09T11:00:00Z'), NOW)).toBe(true);
    expect(isReapEligible(mk('b', 'live', '2026-07-09T11:00:00Z'), NOW)).toBe(true);
    expect(isReapEligible(mk('c', 'planned', '2026-07-09T13:00:00Z'), NOW)).toBe(false); // unexpired
    expect(isReapEligible(mk('d', 'reaped', '2026-07-09T11:00:00Z'), NOW)).toBe(false); // terminal
    expect(isReapEligible(mk('e', 'failed', '2026-07-09T11:00:00Z'), NOW)).toBe(false);
  });

  it('dry-run lists eligible rows and mutates nothing', async () => {
    const sb = mockSupabase({ rows: [mk('x', 'planned', '2026-07-09T11:00:00Z'), mk('y', 'live', '2026-07-09T13:00:00Z')] });
    const res = await reapExpiredPreviews(sb, { dryRun: true, now: () => new Date(NOW) });
    expect(res.eligible.map((r) => r.id)).toEqual(['x']);
    expect(res.reaped).toEqual([]);
    expect(sb.state.instances.find((r) => r.id === 'x').status).toBe('planned');
  });

  it('real mode reaps only expired planned/live, calls the teardown adapter, and is idempotent on re-run', async () => {
    const sb = mockSupabase({
      rows: [mk('x', 'planned', '2026-07-09T11:00:00Z'), mk('y', 'live', '2026-07-09T10:00:00Z'), mk('z', 'reaped', '2026-07-09T09:00:00Z')],
    });
    const torn = [];
    const opts = { now: () => new Date(NOW), teardownAdapter: async (r) => torn.push(r.id) };
    const first = await reapExpiredPreviews(sb, opts);
    expect(first.reaped.sort()).toEqual(['x', 'y']);
    expect(torn.sort()).toEqual(['x', 'y']);
    expect(sb.state.instances.filter((r) => r.status === 'reaped')).toHaveLength(3);
    const second = await reapExpiredPreviews(sb, opts);
    expect(second.reaped).toEqual([]); // idempotent
  });

  it('throws (nonzero-exit contract) on a query failure', async () => {
    const sb = {
      from: () => ({ select: () => ({ in: () => ({ lt: () => ({ then: (resolve) => resolve({ data: null, error: { message: 'boom' } }) }) }) }) }),
    };
    await expect(reapExpiredPreviews(sb)).rejects.toThrow(/eligibility query failed/);
  });
});
