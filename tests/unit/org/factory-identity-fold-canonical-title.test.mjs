/**
 * Regression tests — lib/org/factory-identity-fold.cjs recordIdentityForAgent()
 * SD-LEO-INFRA-STOP-ORG-ROLE-001: org_agent_roles is keyed on role_key alone (no
 * venture_id) -- the fold must NEVER write a caller-supplied, per-venture display_name
 * into its `title` column. This is the exact defect that clobbered 28/33 canonical titles
 * (a real test-venture display_name like "TEST-59732e35fc-SD-A CEO" overwrote what should
 * have been the venture-agnostic "CEO").
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { recordIdentityForAgent, resolveCanonicalRoleTitle } = require('../../../lib/org/factory-identity-fold.cjs');

function makeFakeSupabase({ identityUpsertResult = { data: { id: 'identity-1' }, error: null } } = {}) {
  const calls = { orgAgentRolesUpsert: null, orgAgentIdentitiesUpsert: null };
  return {
    calls,
    from(table) {
      if (table === 'org_agent_roles') {
        return {
          upsert(payload, opts) {
            calls.orgAgentRolesUpsert = { payload, opts };
            return Promise.resolve({ error: null });
          },
        };
      }
      if (table === 'org_agent_identities') {
        return {
          upsert(payload, opts) {
            calls.orgAgentIdentitiesUpsert = { payload, opts };
            return {
              select: () => ({ maybeSingle: () => Promise.resolve(identityUpsertResult) }),
            };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

describe('recordIdentityForAgent — org_agent_roles.title is never a per-venture display_name', () => {
  it('REGRESSION (the confirmed incident shape): a venture_ceo agent with a test-venture display_name does not leak that name into org_agent_roles.title', async () => {
    const supabase = makeFakeSupabase();
    await recordIdentityForAgent(
      supabase,
      { venture_id: 'v-1', agent_role: 'venture_ceo', display_name: 'TEST-59732e35fc-SD-A CEO', agent_type: 'venture_ceo' },
      { id: 'agent-1' },
    );
    expect(supabase.calls.orgAgentRolesUpsert.payload.title).toBe('CEO');
    expect(supabase.calls.orgAgentRolesUpsert.payload.title).not.toContain('TEST-');
    expect(supabase.calls.orgAgentRolesUpsert.payload.role_key).toBe('VENTURE_CEO');
  });

  it('a VP role resolves its canonical title, not the venture display_name', async () => {
    const supabase = makeFakeSupabase();
    await recordIdentityForAgent(
      supabase,
      { venture_id: 'v-2', agent_role: 'VP_STRATEGY', display_name: 'AcmeCo VP Strategy', agent_type: 'executive' },
      { id: 'agent-2' },
    );
    expect(supabase.calls.orgAgentRolesUpsert.payload.title).toBe('VP Strategy');
  });

  it('a crew role resolves its canonical title, not the venture display_name', async () => {
    const supabase = makeFakeSupabase();
    await recordIdentityForAgent(
      supabase,
      { venture_id: 'v-3', agent_role: 'Market_Research_Crew', display_name: 'AcmeCo Market Research Crew', agent_type: 'crew' },
      { id: 'agent-3' },
    );
    expect(supabase.calls.orgAgentRolesUpsert.payload.title).toBe('Market Research Crew');
  });

  it('org_agent_roles upsert still uses onConflict role_key + ignoreDuplicates (never overwrites an existing canonical title)', async () => {
    const supabase = makeFakeSupabase();
    await recordIdentityForAgent(
      supabase,
      { venture_id: 'v-4', agent_role: 'venture_ceo', display_name: 'SomeVenture CEO', agent_type: 'venture_ceo' },
      { id: 'agent-4' },
    );
    expect(supabase.calls.orgAgentRolesUpsert.opts).toEqual({ onConflict: 'role_key', ignoreDuplicates: true });
  });

  it('the venture-specific display_name IS still recorded correctly in org_agent_identities (the venture-scoped layer)', async () => {
    const supabase = makeFakeSupabase();
    await recordIdentityForAgent(
      supabase,
      { venture_id: 'v-5', agent_role: 'venture_ceo', display_name: 'AcmeCo CEO', agent_type: 'venture_ceo' },
      { id: 'agent-5' },
    );
    expect(supabase.calls.orgAgentIdentitiesUpsert.payload.display_name).toBe('AcmeCo CEO');
    expect(supabase.calls.orgAgentIdentitiesUpsert.payload.venture_id).toBe('v-5');
  });

  it('an unknown/future role_key falls back to the bare role_key (still never venture-specific)', async () => {
    const supabase = makeFakeSupabase();
    await recordIdentityForAgent(
      supabase,
      { venture_id: 'v-6', agent_role: 'SOME_BRAND_NEW_ROLE', display_name: 'AcmeCo Brand New Role', agent_type: 'crew' },
      { id: 'agent-6' },
    );
    expect(supabase.calls.orgAgentRolesUpsert.payload.title).toBe('SOME_BRAND_NEW_ROLE');
    expect(supabase.calls.orgAgentRolesUpsert.payload.title).not.toContain('AcmeCo');
  });
});

describe('resolveCanonicalRoleTitle — fail-soft dynamic-import boundary (TS-3)', () => {
  it('resolves the real canonical title when the loader succeeds (default real import)', async () => {
    expect(await resolveCanonicalRoleTitle('VENTURE_CEO')).toBe('CEO');
  });

  // TESTING sub-agent finding (PLAN_TO_EXEC, evidence fd0cf503): this fail-soft catch branch
  // was previously only verified via a throwaway-copy repro, never a committed regression
  // test. `loadCanonicalTitles` is injectable specifically so this branch is directly
  // testable without fragile mocking of a dynamic import() inside a CJS module.
  it('TS-3: falls back to the bare role_key when the canonical-title loader rejects', async () => {
    const throwingLoader = () => Promise.reject(new Error('simulated: module deleted/broken'));
    expect(await resolveCanonicalRoleTitle('VENTURE_CEO', throwingLoader)).toBe('VENTURE_CEO');
  });

  it('TS-3: falls back to the bare role_key when the loader resolves but computeCanonicalRoleTitles throws', async () => {
    const brokenLoader = () => Promise.resolve({ computeCanonicalRoleTitles: () => { throw new Error('simulated: derivation broke'); } });
    expect(await resolveCanonicalRoleTitle('VP_STRATEGY', brokenLoader)).toBe('VP_STRATEGY');
  });

  it('falls back to the bare role_key when the loaded module lacks the expected export (calling undefined throws, caught by the same try/catch)', async () => {
    const emptyLoader = () => Promise.resolve({});
    expect(await resolveCanonicalRoleTitle('VP_TECH', emptyLoader)).toBe('VP_TECH');
  });
});
