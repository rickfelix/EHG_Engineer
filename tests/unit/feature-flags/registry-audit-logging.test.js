/**
 * SD-LEO-FIX-CHAIRMAN-APPROVED-ARMING-001 — unit coverage for the logAudit() insert-shape fix
 * and the two governed writers (transitionLifecycleState, markRolledOut) whose audit citations
 * depend on it. No test previously imported or exercised any of these three functions (found
 * by the TESTING sub-agent's EXEC-phase review) -- the live-DB round-trip already done this
 * session proved correctness against the real schema/constraint, but a mock catches a future
 * regression to the conditional-environment-key logic without needing a live DB.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

/** A minimal fake supabase-js query builder: chainable, and thenable at any point. */
function makeBuilder(resolution) {
  const builder = {
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(resolution())),
    maybeSingle: vi.fn(() => Promise.resolve(resolution())),
    then: (resolve, reject) => Promise.resolve(resolution()).then(resolve, reject),
  };
  return builder;
}

const insertCalls = [];
let fromImpl;

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn((table) => fromImpl(table)),
  })),
}));

const ENV_BAK = { ...process.env };
let registry;

beforeEach(async () => {
  insertCalls.length = 0;
  process.env.SUPABASE_URL = 'http://localhost';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
  vi.resetModules();
  registry = await import('../../../lib/feature-flags/registry.js');
});

afterAll(() => { process.env = { ...ENV_BAK }; });

describe('logAudit insert shape (via markRolledOut)', () => {
  it('omits the environment key entirely when no environment is supplied', async () => {
    const flagRow = { flag_key: 'F1', rolled_out_at: null, is_enabled: true, lifecycle_state: 'enabled' };
    const updatedRow = { ...flagRow, rolled_out_at: '2026-09-12T00:00:00Z' };
    fromImpl = (table) => {
      if (table === 'leo_feature_flags') {
        return makeBuilder(() => ({ data: updatedRow, error: null }));
      }
      if (table === 'leo_feature_flag_audit_log') {
        const b = makeBuilder(() => ({ data: null, error: null }));
        b.insert = vi.fn((payload) => { insertCalls.push(payload); return b; });
        return b;
      }
      throw new Error(`unexpected table ${table}`);
    };
    await registry.markRolledOut('F1', '2026-09-12T00:00:00Z', 'chairman_decision:6cb60a30');

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).not.toHaveProperty('environment');
    expect(insertCalls[0].action).toBe('update');
    expect(insertCalls[0].changed_by).toBe('chairman_decision:6cb60a30');
    expect(insertCalls[0].flag_key).toBe('F1');
  });
});

describe('transitionLifecycleState audit citation', () => {
  it('logs a transition action citing reason/actorId/actorType, never silently discarding them', async () => {
    const currentFlag = {
      flag_key: 'STAGE_GATE_PREDICATE_ARMED',
      lifecycle_state: 'disabled',
      risk_tier: 'low', // avoid the approval-requirement branch for this unit test
      is_enabled: false,
    };
    const updatedFlag = { ...currentFlag, lifecycle_state: 'enabled', is_enabled: true };
    let flagReadCount = 0;
    fromImpl = (table) => {
      if (table === 'leo_feature_flags') {
        // First read (getFlag, pre-transition validity check) sees the disabled flag;
        // the subsequent UPDATE call resolves to the post-transition row.
        return makeBuilder(() => ({ data: flagReadCount++ === 0 ? currentFlag : updatedFlag, error: null }));
      }
      if (table === 'leo_feature_flag_audit_log') {
        const b = makeBuilder(() => ({ data: null, error: null }));
        b.insert = vi.fn((payload) => { insertCalls.push(payload); return b; });
        return b;
      }
      throw new Error(`unexpected table ${table}`);
    };

    await registry.transitionLifecycleState('STAGE_GATE_PREDICATE_ARMED', 'enabled', {
      reason: 'chairman decision 6cb60a30',
      actorId: 'chairman_decision:6cb60a30',
      actorType: 'chairman',
    });

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].action).toBe('transition');
    expect(insertCalls[0].changed_by).toBe('chairman_decision:6cb60a30');
    expect(insertCalls[0].new_state.transition_reason).toBe('chairman decision 6cb60a30');
    expect(insertCalls[0].new_state.actor_type).toBe('chairman');
    expect(insertCalls[0]).not.toHaveProperty('environment');
  });

  // SECURITY finding S13: the passing test above deliberately used risk_tier:'low' to route
  // around the approval-requirement branch, but nothing asserted that branch actually still
  // enforces for a HIGH-risk flag. This closes that gap.
  it('throws for a HIGH-risk flag transitioning to enabled with no approved approval on record', async () => {
    const currentFlag = {
      flag_key: 'SOME_HIGH_RISK_FLAG',
      lifecycle_state: 'disabled',
      risk_tier: 'high',
      is_enabled: false,
    };
    fromImpl = (table) => {
      if (table === 'leo_feature_flags') {
        return makeBuilder(() => ({ data: currentFlag, error: null }));
      }
      if (table === 'leo_feature_flag_approvals') {
        // No approved row on record -- .single() reports not-found.
        return makeBuilder(() => ({ data: null, error: { code: 'PGRST116', message: 'no rows' } }));
      }
      throw new Error(`unexpected table ${table}`);
    };

    await expect(
      registry.transitionLifecycleState('SOME_HIGH_RISK_FLAG', 'enabled', { reason: 'no approval cited', actorId: 'attacker', actorType: 'system' })
    ).rejects.toThrow(/requires 2 approval/);

    expect(insertCalls).toHaveLength(0); // no audit row for a rejected transition
  });
});

// TESTING sub-agent (EXEC phase) finding: 5 of 7 logAudit call sites (createFlag, updateFlag,
// deleteFlag, activateKillSwitch, deactivateKillSwitch) plus setPolicy had zero unit coverage --
// only live-DB round-trips proved they work. These close that gap.
describe('createFlag/updateFlag/deleteFlag/setPolicy audit citations', () => {
  function auditBuilder() {
    const b = makeBuilder(() => ({ data: null, error: null }));
    b.insert = vi.fn((payload) => { insertCalls.push(payload); return b; });
    return b;
  }

  it('createFlag logs action=create with a real citation', async () => {
    const createdRow = { flag_key: 'F2', is_enabled: false, lifecycle_state: 'draft' };
    fromImpl = (table) => {
      if (table === 'leo_feature_flags') return makeBuilder(() => ({ data: createdRow, error: null }));
      if (table === 'leo_feature_flag_audit_log') return auditBuilder();
      throw new Error(`unexpected table ${table}`);
    };
    await registry.createFlag({ flagKey: 'F2', displayName: 'F2', ownerType: 'user', ownerId: 'u1', changedBy: 'qa-create' });
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].action).toBe('create');
    expect(insertCalls[0].changed_by).toBe('qa-create');
  });

  it('updateFlag logs action=update with a real citation', async () => {
    const currentFlag = { flag_key: 'F3', is_enabled: false, lifecycle_state: 'disabled' };
    const updatedFlag = { ...currentFlag, description: 'new' };
    let readCount = 0;
    fromImpl = (table) => {
      if (table === 'leo_feature_flags') return makeBuilder(() => ({ data: readCount++ === 0 ? currentFlag : updatedFlag, error: null }));
      if (table === 'leo_feature_flag_audit_log') return auditBuilder();
      throw new Error(`unexpected table ${table}`);
    };
    await registry.updateFlag('F3', { description: 'new' }, 'qa-update');
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].action).toBe('update');
    expect(insertCalls[0].changed_by).toBe('qa-update');
  });

  it('deleteFlag logs action=delete with a real citation', async () => {
    const currentFlag = { flag_key: 'F4', is_enabled: false, lifecycle_state: 'disabled' };
    fromImpl = (table) => {
      if (table === 'leo_feature_flags') return makeBuilder(() => ({ data: currentFlag, error: null }));
      if (table === 'leo_feature_flag_audit_log') return auditBuilder();
      throw new Error(`unexpected table ${table}`);
    };
    await registry.deleteFlag('F4', 'qa-delete');
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].action).toBe('delete');
    expect(insertCalls[0].changed_by).toBe('qa-delete');
  });

  it('setPolicy logs action=create (new policy) without an environment key, even though environment is always supplied', async () => {
    const flag = { id: 'flag-id-1', flag_key: 'F5', leo_feature_flag_policies: [] };
    const policyRow = { flag_id: 'flag-id-1', environment: 'staging', rollout_percentage: 50 };
    fromImpl = (table) => {
      if (table === 'leo_feature_flags') return makeBuilder(() => ({ data: flag, error: null }));
      if (table === 'leo_feature_flag_policies') return makeBuilder(() => ({ data: policyRow, error: null }));
      if (table === 'leo_feature_flag_audit_log') return auditBuilder();
      throw new Error(`unexpected table ${table}`);
    };
    await registry.setPolicy({ flagKey: 'F5', environment: 'staging', rolloutPercentage: 50, changedBy: 'qa-policy' });
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].action).toBe('create');
    expect(insertCalls[0]).not.toHaveProperty('environment');
    expect(insertCalls[0].changed_by).toBe('qa-policy');
  });
});

describe('kill switch audit citations', () => {
  function auditBuilder() {
    const b = makeBuilder(() => ({ data: null, error: null }));
    b.insert = vi.fn((payload) => { insertCalls.push(payload); return b; });
    return b;
  }

  it('activateKillSwitch logs action=rollback with a real citation', async () => {
    const killSwitch = { switch_key: 'KS1', is_active: false };
    const activated = { ...killSwitch, is_active: true };
    fromImpl = (table) => {
      if (table === 'leo_kill_switches') return makeBuilder(() => ({ data: activated, error: null }));
      if (table === 'leo_feature_flag_audit_log') return auditBuilder();
      throw new Error(`unexpected table ${table}`);
    };
    await registry.activateKillSwitch('KS1', 'qa-activate');
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].action).toBe('rollback');
    expect(insertCalls[0].changed_by).toBe('qa-activate');
  });

  it('deactivateKillSwitch logs action=update with a real citation', async () => {
    const killSwitch = { switch_key: 'KS2', is_active: true };
    const deactivated = { ...killSwitch, is_active: false };
    fromImpl = (table) => {
      if (table === 'leo_kill_switches') return makeBuilder(() => ({ data: deactivated, error: null }));
      if (table === 'leo_feature_flag_audit_log') return auditBuilder();
      throw new Error(`unexpected table ${table}`);
    };
    await registry.deactivateKillSwitch('KS2', 'qa-deactivate');
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].action).toBe('update');
    expect(insertCalls[0].changed_by).toBe('qa-deactivate');
  });
});
