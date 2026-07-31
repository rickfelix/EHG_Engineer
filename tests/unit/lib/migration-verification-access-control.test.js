import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

// SD-FDBK-INFRA-LIVE-PROBE-DDL-001 FR-2/FR-3. Parent FR-4 AC-1 (policies verdicted from
// pg_policies + relrowsecurity directly) and AC-2 (constraints compare pg_get_constraintdef
// BODY, never conname alone). A fake client is used so these run without a live DB; the SQL
// shape itself is exercised against the real database by the SD's smoke steps.
const { captureObjectDefinitions } = await import('../../../scripts/lib/migration-verification.js');

/** @param {(sql: string, params: any[]) => {rows: any[]}} handler */
const fakeClient = (handler) => ({ query: async (sql, params) => handler(sql, params) });

describe('FR-2 POLICY capture (parent FR-4 AC-1)', () => {
  it('captures policy body AND relrowsecurity, since AC-4 must cite RLS_ENABLED', async () => {
    const client = fakeClient(() => ({
      rows: [{
        tablename: 'ventures', policyname: 'p_read', permissive: 'PERMISSIVE',
        roles: '{authenticated}', cmd: 'SELECT', qual: 'true', with_check: '',
        relrowsecurity: true,
      }],
    }));
    const [row] = await captureObjectDefinitions(client, [{ kind: 'POLICY', schema: 'public', name: 'p_read', table: 'ventures' }]);
    expect(row.definition).toContain('POLICY p_read ON public.ventures');
    expect(row.definition).toContain('CMD=SELECT');
    expect(row.definition).toContain('RLS_ENABLED=true');
  });

  // AC-4 is "relrowsecurity=FALSE with zero policies cited" — the disabled case must be
  // representable, not collapse to the same value as the enabled one.
  it('a disabled-RLS table is distinguishable from an enabled one', async () => {
    const client = fakeClient(() => ({
      rows: [{
        tablename: 'ventures', policyname: 'p_read', permissive: 'PERMISSIVE',
        roles: '{authenticated}', cmd: 'SELECT', qual: 'true', with_check: '',
        relrowsecurity: false,
      }],
    }));
    const [row] = await captureObjectDefinitions(client, [{ kind: 'POLICY', schema: 'public', name: 'p_read', table: 'ventures' }]);
    expect(row.definition).toContain('RLS_ENABLED=false');
  });

  it('absent policy -> null (UNVERIFIABLE), not a fabricated definition', async () => {
    const client = fakeClient(() => ({ rows: [] }));
    const [row] = await captureObjectDefinitions(client, [{ kind: 'POLICY', schema: 'public', name: 'missing' }]);
    expect(row.definition).toBeNull();
  });

  // THE FAIL-DIRECTION RULE from docs/reference/ddl-approval-record-definition.md: ambiguity
  // must degrade to UNVERIFIABLE, never resolve to an arbitrary match that could read APPLIED.
  it('AMBIGUOUS policy name across tables -> null, never an arbitrary pick', async () => {
    const client = fakeClient(() => ({
      rows: [
        { tablename: 'ventures', policyname: 'p_read', permissive: 'PERMISSIVE', roles: '{}', cmd: 'SELECT', qual: 'true', with_check: '', relrowsecurity: true },
        { tablename: 'companies', policyname: 'p_read', permissive: 'PERMISSIVE', roles: '{}', cmd: 'SELECT', qual: 'false', with_check: '', relrowsecurity: true },
      ],
    }));
    const [row] = await captureObjectDefinitions(client, [{ kind: 'POLICY', schema: 'public', name: 'p_read' }]);
    expect(row.definition).toBeNull();
  });
});

describe('FR-3 CONSTRAINT capture (parent FR-4 AC-2)', () => {
  it('captures the pg_get_constraintdef BODY', async () => {
    const client = fakeClient(() => ({ rows: [{ def: 'CHECK ((status = ANY (ARRAY[\'a\'::text])))', tablename: 'ventures' }] }));
    const [row] = await captureObjectDefinitions(client, [{ kind: 'CONSTRAINT', schema: 'public', name: 'ck_status', table: 'ventures' }]);
    expect(row.definition).toContain('CHECK ((status = ANY');
    expect(row.definition).toContain('ON public.ventures');
  });

  // The whole point of AC-2. verify-migration-apply-state.mjs:358-366 matches conname only, so
  // a same-named CHECK with a different body reads APPLIED. Same name MUST NOT compare equal.
  it('same conname, DIFFERENT body produces a different definition (the AC-2 fail-open)', async () => {
    const mk = (def) => fakeClient(() => ({ rows: [{ def, tablename: 'ventures' }] }));
    const obj = [{ kind: 'CONSTRAINT', schema: 'public', name: 'ck_status', table: 'ventures' }];
    const [a] = await captureObjectDefinitions(mk('CHECK ((status = ANY (ARRAY[\'a\'::text])))'), obj);
    const [b] = await captureObjectDefinitions(mk('CHECK ((status = ANY (ARRAY[\'a\'::text, \'b\'::text])))'), obj);
    expect(a.definition).not.toBe(b.definition);
  });

  it('AMBIGUOUS constraint name across tables -> null', async () => {
    const client = fakeClient(() => ({ rows: [{ def: 'CHECK (x)', tablename: 't1' }, { def: 'CHECK (y)', tablename: 't2' }] }));
    const [row] = await captureObjectDefinitions(client, [{ kind: 'CONSTRAINT', schema: 'public', name: 'ck_dup' }]);
    expect(row.definition).toBeNull();
  });
});

// FR-4 (parent FR-4 AC-3): "Function items compare pg_proc.prosrc/proconfig, so a search_path
// change is visible." Verified live that pg_get_functiondef already emits SET search_path for
// every public function carrying a proconfig, so no separate proconfig capture is needed. What
// MUST hold from here on is that the definition survives VERBATIM — a future normalisation that
// trimmed or rewrote the definition would strip the SET line and silently break AC-3 while every
// other test still passed.
describe('FR-4 function definition passes through verbatim (AC-3 depends on it)', () => {
  const fakeClient = (def) => ({ query: async () => ({ rows: [{ def }] }) });

  it('a SET search_path line in the definition is preserved exactly', async () => {
    const { captureObjectDefinitions } = await import('../../../scripts/lib/migration-verification.js');
    const def = 'CREATE OR REPLACE FUNCTION public.f()\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO \'public\'\nAS $function$ BEGIN END $function$\n';
    const [row] = await captureObjectDefinitions(fakeClient(def), [{ kind: 'FUNCTION', schema: 'public', name: 'f' }]);
    expect(row.definition).toBe(def);                      // byte-identical, not trimmed
    expect(row.definition).toContain("SET search_path TO 'public'");
  });

  it('two definitions differing ONLY in search_path are not equal', async () => {
    const { captureObjectDefinitions } = await import('../../../scripts/lib/migration-verification.js');
    const mk = (sp) => `CREATE OR REPLACE FUNCTION public.f()\n SET search_path TO '${sp}'\nAS $function$ BEGIN END $function$\n`;
    const obj = [{ kind: 'FUNCTION', schema: 'public', name: 'f' }];
    const [a] = await captureObjectDefinitions(fakeClient(mk('public')), obj);
    const [b] = await captureObjectDefinitions(fakeClient(mk('public, extensions')), obj);
    expect(a.definition).not.toBe(b.definition);
  });
});

describe('no regression to the pre-existing kinds', () => {
  it('an unknown kind still yields definition=null rather than throwing', async () => {
    const client = fakeClient(() => ({ rows: [] }));
    const [row] = await captureObjectDefinitions(client, [{ kind: 'SEQUENCE', schema: 'public', name: 's1' }]);
    expect(row).toMatchObject({ kind: 'SEQUENCE', definition: null });
  });
});
