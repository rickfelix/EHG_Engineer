/**
 * SD-EHG-FEAT-AUTOMATED-RESILIENT-VENTURE-001-B — stakes-based DB routing.
 *
 * Pure, no-DB unit + activation suite:
 *  - FR-1: routeDbProvider — d1 default, each of 5 graduation triggers -> neon,
 *          explicit-neon honored, replit no-op, fail-loud on malformed.
 *  - FR-3: the two fail-closed exit-gate verifiers (descriptor-shape +
 *          deployment-target-provisioned) via an injected fake supabase.
 *  - Activation invariant: stakes-routing is registered and fail-closed by default.
 */
import { describe, it, expect } from 'vitest';

import { GRADUATION_TRIGGERS, routeDbProvider } from '../../lib/venture-deploy/stakes-router.js';
import { GATE_VERIFIERS, resolveVerifier } from '../../lib/eva/lifecycle/exit-gate-verifiers.js';

// A valid cloud descriptor (A's contract): cloud target + d1 is coherent.
function cloudDescriptor(overrides = {}) {
  return { db_provider: 'd1', deployment_target: 'cloudflare-workers', ...overrides };
}

describe('FR-1: stakes-router', () => {
  it('exposes the 5 canonical graduation triggers', () => {
    expect(GRADUATION_TRIGGERS).toEqual([
      'collects_irreplaceable_data', 'write_amplifying_jobs', 'needs_postgres_features',
      'needs_portable_migration', 'revenue_bearing',
    ]);
  });

  it('defaults a cloud venture with no stakes to D1', () => {
    const r = routeDbProvider(cloudDescriptor());
    expect(r.provider).toBe('d1');
    expect(r.triggersFired).toEqual([]);
  });

  // Each of the 5 triggers independently graduates to Neon.
  for (const trigger of GRADUATION_TRIGGERS) {
    it(`graduates to Neon when '${trigger}' fires`, () => {
      const r = routeDbProvider(cloudDescriptor({ graduation: { [trigger]: true } }));
      expect(r.provider).toBe('neon');
      expect(r.triggersFired).toContain(trigger);
    });
  }

  it('reports ALL fired triggers when several are set', () => {
    const r = routeDbProvider(cloudDescriptor({
      graduation: { revenue_bearing: true, needs_postgres_features: true },
    }));
    expect(r.provider).toBe('neon');
    expect(r.triggersFired).toEqual(expect.arrayContaining(['revenue_bearing', 'needs_postgres_features']));
  });

  it('honors an explicit db_provider:neon request (never downgrades)', () => {
    const r = routeDbProvider(cloudDescriptor({ db_provider: 'neon' }));
    expect(r.provider).toBe('neon');
    expect(r.triggersFired).toEqual([]); // graduated by explicit request, not a trigger
  });

  it('keeps a replit-autoscale venture on replit-postgres (no-op)', () => {
    const r = routeDbProvider({ db_provider: 'replit-postgres', deployment_target: 'replit-autoscale' });
    expect(r.provider).toBe('replit-postgres');
    expect(r.triggersFired).toEqual([]);
  });

  it('ignores falsy graduation flags (stays on D1)', () => {
    const r = routeDbProvider(cloudDescriptor({ graduation: { revenue_bearing: false, needs_postgres_features: 0 } }));
    expect(r.provider).toBe('d1');
  });

  it('FAIL-LOUD: throws on a non-object descriptor', () => {
    expect(() => routeDbProvider(null)).toThrow(/invalid stack descriptor/);
    expect(() => routeDbProvider('nope')).toThrow(/invalid stack descriptor/);
  });

  it('FAIL-LOUD: throws on an invalid deployment_target', () => {
    expect(() => routeDbProvider({ db_provider: 'd1', deployment_target: 'heroku' })).toThrow(/invalid stack descriptor/);
  });

  it('FAIL-LOUD: throws on a missing required field', () => {
    expect(() => routeDbProvider({ deployment_target: 'cloudflare-workers' })).toThrow(/invalid stack descriptor/);
  });
});

// Fake supabase: .from(t).select(c).eq(k,v).maybeSingle() -> {data, error}.
function fakeSupabase({ data = null, error = null } = {}) {
  const chain = {
    select() { return chain; },
    eq() { return chain; },
    maybeSingle() { return Promise.resolve({ data, error }); },
  };
  return { from() { return chain; } };
}

const VENTURE = 'venture-bbb-222';
const VALID_DESCRIPTOR = { db_provider: 'd1', deployment_target: 'cloudflare-workers' };
const PROVISIONED = {
  ...VALID_DESCRIPTOR,
  connection: { provider: 'd1', secret_ref: `venture_db_secrets:${VENTURE}`, triggers_fired: [] },
};

describe('FR-3: fail-closed exit-gate verifiers', () => {
  it('registers both gate strings, distinct from C/D', () => {
    const dv = resolveVerifier('stack descriptor valid');
    const pv = resolveVerifier('deployment target provisioned');
    expect(typeof dv).toBe('function');
    expect(typeof pv).toBe('function');
    expect(dv).not.toBe(pv);
    // distinct from sibling C's gate
    expect(resolveVerifier('spend guardrails ready')).not.toBe(dv);
    expect(resolveVerifier('spend guardrails ready')).not.toBe(pv);
    expect(GATE_VERIFIERS.some((v) => v.match === 'stack descriptor valid')).toBe(true);
    expect(GATE_VERIFIERS.some((v) => v.match === 'deployment target provisioned')).toBe(true);
  });

  it('stack-descriptor-valid: PASSES on a valid descriptor', async () => {
    const v = resolveVerifier('stack descriptor valid');
    const res = await v({ supabase: fakeSupabase({ data: { stack_descriptor: VALID_DESCRIPTOR } }), ventureId: VENTURE });
    expect(res.satisfied).toBe(true);
  });

  it('stack-descriptor-valid: BLOCKS (fail-closed) on a missing descriptor', async () => {
    const v = resolveVerifier('stack descriptor valid');
    const res = await v({ supabase: fakeSupabase({ data: { stack_descriptor: null } }), ventureId: VENTURE });
    expect(res.satisfied).toBe(false);
    expect(res.reason).toContain('missing');
  });

  it('stack-descriptor-valid: BLOCKS (fail-closed) on an invalid descriptor', async () => {
    const v = resolveVerifier('stack descriptor valid');
    const res = await v({ supabase: fakeSupabase({ data: { stack_descriptor: { deployment_target: 'heroku' } } }), ventureId: VENTURE });
    expect(res.satisfied).toBe(false);
    expect(res.reason).toContain('invalid');
  });

  it('stack-descriptor-valid: BLOCKS (fail-closed) on a query error', async () => {
    const v = resolveVerifier('stack descriptor valid');
    const res = await v({ supabase: fakeSupabase({ error: { message: 'boom' } }), ventureId: VENTURE });
    expect(res.satisfied).toBe(false);
    expect(res.reason).toContain('fail-closed');
  });

  it('deployment-target-provisioned: PASSES when connection is populated', async () => {
    const v = resolveVerifier('deployment target provisioned');
    const res = await v({ supabase: fakeSupabase({ data: { stack_descriptor: PROVISIONED } }), ventureId: VENTURE });
    expect(res.satisfied).toBe(true);
  });

  it('deployment-target-provisioned: BLOCKS (fail-closed) when connection is absent', async () => {
    const v = resolveVerifier('deployment target provisioned');
    const res = await v({ supabase: fakeSupabase({ data: { stack_descriptor: VALID_DESCRIPTOR } }), ventureId: VENTURE });
    expect(res.satisfied).toBe(false);
    expect(res.reason).toContain('not provisioned');
  });

  it('deployment-target-provisioned: BLOCKS (fail-closed) on a query error', async () => {
    const v = resolveVerifier('deployment target provisioned');
    const res = await v({ supabase: fakeSupabase({ error: { message: 'boom' } }), ventureId: VENTURE });
    expect(res.satisfied).toBe(false);
  });
});

describe('Activation invariant (GATE_ACTIVATION_INVARIANT)', () => {
  it('stakes-routing is live: router pure-deterministic + gates registered fail-closed by default', async () => {
    // router engaged
    expect(routeDbProvider(VALID_DESCRIPTOR).provider).toBe('d1');
    // a fresh venture with no descriptor is NOT allowed to advance
    const v = resolveVerifier('stack descriptor valid');
    const res = await v({ supabase: fakeSupabase({ data: { stack_descriptor: null } }), ventureId: 'brand-new' });
    expect(res.satisfied).toBe(false);
  });
});
