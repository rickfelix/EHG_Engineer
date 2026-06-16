/**
 * SD-LEO-INFRA-ADAM-DBCHANGE-APPLY-DELEGATION-001 (FR-5/FR-6, SEC-H1) — delegated-apply GATE tests.
 *
 * Proves the enforcement layer (validateDelegatedApplyGuards): the forgeable `-- @delegated-by: adam`
 * marker is NOT authority (a real crypto token is required — SEC-H1 confused-deputy defense), the
 * kill-switch is default-OFF fail-closed, and a VALID token can NEVER bypass the fail-closed scope
 * boundary (a destructive/policy change is rejected even with a valid token). The chairman path
 * (validateProdDeployGuards/checkApproverFactor) is NOT broadened.
 */
import { describe, it, expect } from 'vitest';
import {
  validateDelegatedApplyGuards,
  extractDelegatedBy,
  validateProdDeployGuards,
} from '../../scripts/lib/migration-guards.js';

const TOKEN = 'a'.repeat(64); // a plausible 64-hex token value
const ADDITIVE = 'CREATE TABLE IF NOT EXISTS public.foo (id uuid primary key);\n-- @delegated-by: adam\n';
const GOVERNED_INSERT = "INSERT INTO vision_ladder_criteria (rung_id, ordinal, capability) VALUES ('0f056dcd-2d8e-470a-8a28-921d322e6461', 99, 'X') ON CONFLICT (rung_id, capability) DO NOTHING;\n-- @delegated-by: adam\n";
const DESTRUCTIVE = 'DROP TABLE public.foo;\n-- @delegated-by: adam\n';
const POLICY = 'CREATE POLICY p ON public.foo FOR SELECT USING (true);\n-- @delegated-by: adam\n';

// Mock pg client for checkTokenFactor: returns a fresh unconsumed token row, or none.
function mockClient({ validToken = false, consumed = false, expired = false } = {}) {
  return {
    query: async () => {
      if (!validToken) return { rows: [] };
      const issued = expired ? new Date(Date.now() - 2 * 60 * 60 * 1000) : new Date(Date.now() - 1000);
      return { rows: [{ id: 'tok-1', token_issued_at: issued.toISOString(), token_consumed_at: consumed ? new Date().toISOString() : null }] };
    },
  };
}
const ON = { LEO_ADAM_DBAPPLY_DELEGATION: 'on' };

describe('extractDelegatedBy — routing marker only', () => {
  it('detects -- @delegated-by: adam (case-insensitive) and nothing else', () => {
    expect(extractDelegatedBy('-- @delegated-by: adam')).toBe('adam');
    expect(extractDelegatedBy('-- @delegated-by: someone')).toBeNull();
    expect(extractDelegatedBy('no marker')).toBeNull();
  });
});

describe('SEC-H1 — the @delegated-by marker is NOT authority; a real token is required', () => {
  it('REJECTS a delegatable change with the marker + kill-switch ON but NO valid token (impersonation attempt)', async () => {
    const r = await validateDelegatedApplyGuards({ flagPresent: true, tokenEnv: TOKEN, sqlContent: ADDITIVE, client: mockClient({ validToken: false }), env: ON });
    expect(r.ok).toBe(false);
    expect(r.factor).toBe('token'); // the forged marker got past routing but the real-secret factor blocks it
  });

  it('REJECTS when the token is consumed or expired (real-secret freshness enforced)', async () => {
    const consumed = await validateDelegatedApplyGuards({ flagPresent: true, tokenEnv: TOKEN, sqlContent: ADDITIVE, client: mockClient({ validToken: true, consumed: true }), env: ON });
    expect(consumed.ok).toBe(false);
    expect(consumed.factor).toBe('token');
    const expired = await validateDelegatedApplyGuards({ flagPresent: true, tokenEnv: TOKEN, sqlContent: ADDITIVE, client: mockClient({ validToken: true, expired: true }), env: ON });
    expect(expired.ok).toBe(false);
    expect(expired.factor).toBe('token');
  });
});

describe('Fail-closed scope — a VALID token can NEVER apply a non-delegatable change', () => {
  it('REJECTS a destructive change even with a valid token + marker + kill-switch on', async () => {
    const r = await validateDelegatedApplyGuards({ flagPresent: true, tokenEnv: TOKEN, sqlContent: DESTRUCTIVE, client: mockClient({ validToken: true }), env: ON });
    expect(r.ok).toBe(false);
    expect(r.factor).toBe('scope');
  });
  it('REJECTS a CREATE POLICY change even with a valid token (GAP-A through the gate)', async () => {
    const r = await validateDelegatedApplyGuards({ flagPresent: true, tokenEnv: TOKEN, sqlContent: POLICY, client: mockClient({ validToken: true }), env: ON });
    expect(r.ok).toBe(false);
    expect(r.factor).toBe('scope');
  });
});

describe('Kill-switch — default-OFF, fail-closed (gates before scope/token)', () => {
  it('REJECTS when the kill-switch is unset (default) or not exactly "on"', async () => {
    for (const env of [{}, { LEO_ADAM_DBAPPLY_DELEGATION: 'ON' }, { LEO_ADAM_DBAPPLY_DELEGATION: 'true' }]) {
      const r = await validateDelegatedApplyGuards({ flagPresent: true, tokenEnv: TOKEN, sqlContent: ADDITIVE, client: mockClient({ validToken: true }), env });
      expect(r.ok).toBe(false);
      expect(r.factor).toBe('kill_switch');
    }
  });
});

describe('Routing + flag factors', () => {
  it('REJECTS a delegatable change missing the @delegated-by marker (falls to chairman path)', async () => {
    const noMarker = 'CREATE TABLE IF NOT EXISTS public.foo (id uuid primary key);';
    const r = await validateDelegatedApplyGuards({ flagPresent: true, tokenEnv: TOKEN, sqlContent: noMarker, client: mockClient({ validToken: true }), env: ON });
    expect(r.ok).toBe(false);
    expect(r.factor).toBe('delegated_marker');
  });
  it('REJECTS without the --prod-deploy flag', async () => {
    const r = await validateDelegatedApplyGuards({ flagPresent: false, tokenEnv: TOKEN, sqlContent: ADDITIVE, client: mockClient({ validToken: true }), env: ON });
    expect(r.ok).toBe(false);
    expect(r.factor).toBe('flag');
  });
});

describe('Happy path — additive + governed INSERT with all factors', () => {
  it('ALLOWS an additive change with marker + kill-switch on + valid token', async () => {
    const r = await validateDelegatedApplyGuards({ flagPresent: true, tokenEnv: TOKEN, sqlContent: ADDITIVE, client: mockClient({ validToken: true }), env: ON });
    expect(r.ok).toBe(true);
    expect(r.path).toBe('delegated');
    expect(r.kind).toBe('additive');
  });
  it('ALLOWS a governed literal INSERT with all factors', async () => {
    const r = await validateDelegatedApplyGuards({ flagPresent: true, tokenEnv: TOKEN, sqlContent: GOVERNED_INSERT, client: mockClient({ validToken: true }), env: ON });
    expect(r.ok).toBe(true);
    expect(r.kind).toBe('governed_insert');
  });
});

describe('Chairman path NOT broadened (regression guard)', () => {
  it('validateProdDeployGuards still rejects a non-matching approver (delegation did not touch it)', async () => {
    const r = await validateProdDeployGuards({ flagPresent: true, tokenEnv: TOKEN, sqlContent: '-- @approved-by: someone@else.com\nCREATE TABLE public.foo (id int);', gitUserEmail: 'chairman@example.com', client: mockClient({ validToken: true }) });
    expect(r.ok).toBe(false);
    expect(r.factor).toBe('approver');
  });
});
