/**
 * Unit tests — lib/org/gates/writer-authorization.cjs
 * SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-B FR-2 (born-denied per-ROLE writer identity).
 * Pure: mode + grant lookups injected via the module's test seams.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  resolveWriterAuthMode,
  evaluateWriterAuthorization,
  isEvaBottleneckGrant,
  WRITER_AUTH_AUTHORITY_ALLOWLIST,
} = require('../../../lib/org/gates/writer-authorization.cjs');

const identity = (over = {}) => ({ id: 'idn-1', role_key: 'VP_GROWTH', venture_id: 'v-1', ...over });
const grantRow = (payload) => async () => ({ payload });
const noGrant = async () => null;

describe('resolveWriterAuthMode ladder', () => {
  it('off when base flag disabled', async () => {
    expect(await resolveWriterAuthMode({ isEnabledFn: async () => false })).toBe('off');
  });
  it('observe when base on, enforce off', async () => {
    const flags = { writer_identity_born_denied: true, writer_identity_born_denied_enforce: false };
    expect(await resolveWriterAuthMode({ isEnabledFn: async (k) => !!flags[k] })).toBe('observe');
  });
  it('enforce when both on', async () => {
    expect(await resolveWriterAuthMode({ isEnabledFn: async () => true })).toBe('enforce');
  });
  it('fail-soft to off on evaluator error', async () => {
    expect(await resolveWriterAuthMode({ isEnabledFn: async () => { throw new Error('boom'); } })).toBe('off');
  });
});

describe('mode off', () => {
  it('authorizes with zero lookups', async () => {
    let looked = false;
    const v = await evaluateWriterAuthorization(identity(), 'evidence_fabric', null, {
      mode: 'off',
      getDispositionBySubjectFn: async () => { looked = true; return null; },
    });
    expect(v).toEqual({ authorized: true, mode: 'off' });
    expect(looked).toBe(false);
  });
});

describe('born-denied core', () => {
  it('un-granted identity: observe passes with would_deny evidence', async () => {
    const v = await evaluateWriterAuthorization(identity(), 'evidence_fabric', null, {
      mode: 'observe', getDispositionBySubjectFn: noGrant,
    });
    expect(v.authorized).toBe(true);
    expect(v.would_deny).toBe(true);
    expect(v.reason).toBe('writer_auth_pending');
  });

  it('un-granted identity: enforce denies fail-closed', async () => {
    const v = await evaluateWriterAuthorization(identity(), 'evidence_fabric', null, {
      mode: 'enforce', getDispositionBySubjectFn: noGrant,
    });
    expect(v.authorized).toBe(false);
    expect(v.reason).toBe('writer_auth_pending');
  });

  it('granted by allowlisted authority authorizes in enforce', async () => {
    for (const authority of WRITER_AUTH_AUTHORITY_ALLOWLIST) {
      const v = await evaluateWriterAuthorization(identity(), 'evidence_fabric', null, {
        mode: 'enforce',
        getDispositionBySubjectFn: grantRow({ status: 'dispositioned', authority }),
      });
      expect(v).toMatchObject({ authorized: true, authority });
    }
  });

  it('self-granted (non-allowlisted authority) is treated as un-granted', async () => {
    const v = await evaluateWriterAuthorization(identity(), 'evidence_fabric', null, {
      mode: 'enforce',
      getDispositionBySubjectFn: grantRow({ status: 'dispositioned', authority: 'worker-session' }),
    });
    expect(v.authorized).toBe(false);
    expect(v.reason).toContain('writer_auth_authority_not_allowlisted');
  });

  it('grant read error is fail-closed in enforce, evidence-only in observe', async () => {
    const boom = async () => { throw new Error('pg down'); };
    const enforce = await evaluateWriterAuthorization(identity(), 'evidence_fabric', null, {
      mode: 'enforce', getDispositionBySubjectFn: boom,
    });
    expect(enforce.authorized).toBe(false);
    expect(enforce.reason).toContain('writer_auth_read_error');
    const observe = await evaluateWriterAuthorization(identity(), 'evidence_fabric', null, {
      mode: 'observe', getDispositionBySubjectFn: boom,
    });
    expect(observe.authorized).toBe(true);
    expect(observe.would_deny).toBe(true);
  });

  it('unresolvable subject never crashes a write', async () => {
    const v = await evaluateWriterAuthorization(null, 'evidence_fabric', null, { mode: 'enforce' });
    expect(v.authorized).toBe(false);
    expect(v.reason).toBe('writer_auth_unresolvable_subject');
  });
});

describe('org-centered anti-bottleneck invariant', () => {
  it('EVA holding a domain surface is refused even WITH a recorded chairman grant', async () => {
    const eva = identity({ role_key: 'EVA' });
    const v = await evaluateWriterAuthorization(eva, 'objective_registry', null, {
      mode: 'enforce',
      getDispositionBySubjectFn: grantRow({ status: 'dispositioned', authority: 'chairman' }),
    });
    expect(v.authorized).toBe(false);
    expect(v.reason).toContain('writer_auth_eva_bottleneck_refused');
  });

  it('EVA may hold routing surfaces', async () => {
    const eva = identity({ role_key: 'EVA' });
    const v = await evaluateWriterAuthorization(eva, 'routing', null, {
      mode: 'enforce',
      getDispositionBySubjectFn: grantRow({ status: 'dispositioned', authority: 'coordinator' }),
    });
    expect(v.authorized).toBe(true);
  });

  it('domain roles are unaffected by the invariant', () => {
    expect(isEvaBottleneckGrant({ role_key: 'VP_OPS' }, 'evidence_fabric')).toBe(false);
    expect(isEvaBottleneckGrant({ role_key: 'eva' }, 'evidence_fabric')).toBe(true);
  });
});
