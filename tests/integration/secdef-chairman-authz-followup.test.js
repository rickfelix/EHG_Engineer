/**
 * SD-FDBK-INFRA-DEFENSE-DEPTH-CHAIRMAN-001
 * HAS_REAL_DB behavioral tests for the chairman/service_role authorization guards on the
 * 3 follow-up SECURITY DEFINER RPCs: park_venture_decision, log_stage_advance_override,
 * reset_eva_circuit. Follow-up to SD-LEO-GEN-DEFENSE-DEPTH-ADD-001 (see secdef-chairman-authz.test.js).
 *
 * NET-ZERO: every call runs inside a transaction that is ROLLBACK'd. All mutating calls use
 * ABSENT ids (the functions return/raise before — or harmlessly within — a rolled-back tx).
 * Caller identity is simulated via `SET LOCAL request.jwt.claims` (what auth.uid()/auth.role()
 * read), so no real users are needed for the negative cases.
 *
 * Scope note: bootstrap_venture_workflow is intentionally EXCLUDED (ordinary venture-creation
 * op called from VentureCreationPage.tsx); the final test asserts it carries NO guard.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { HAS_REAL_DB } from '../helpers/db-available.js';

const describeDb = describe.skipIf(!HAS_REAL_DB);

// Negative-path-safe ids (match no live row).
const ABSENT_UUID = '00000000-0000-4000-8000-000000000000';
const ABSENT_VENTURE_TEXT = '00000000-0000-4000-8000-000000000000';
// A uuid that is (almost certainly) not a chairman in auth.users.
const NON_CHAIRMAN_UID = '11111111-1111-4111-8111-111111111111';

describeDb('SECURITY DEFINER chairman authz guards — follow-up 3 fns (live DB)', () => {
  let client;

  beforeAll(async () => {
    const { createDatabaseClient } = await import('../../lib/supabase-connection.js');
    client = await createDatabaseClient('engineer', { verify: false });
  });
  afterAll(async () => { if (client) await client.end(); });

  async function asCaller(claims, fn) {
    await client.query('BEGIN');
    try {
      await client.query(`SET LOCAL request.jwt.claims = '${JSON.stringify(claims)}'`);
      return await fn();
    } finally {
      await client.query('ROLLBACK');
    }
  }

  // ── park_venture_decision (RETURNS jsonb — denial returns soft-fail shape) ──
  it('non-chairman authenticated -> park_venture_decision returns success:false / insufficient_privilege (no park)', async () => {
    await asCaller({ sub: NON_CHAIRMAN_UID, role: 'authenticated' }, async () => {
      const r = await client.query('SELECT public.park_venture_decision($1,$2,$3,$4) AS res', [ABSENT_UUID, 'blocked', 'authz negative path test reason', null]);
      expect(r.rows[0].res.success).toBe(false);
      expect(JSON.stringify(r.rows[0].res)).toMatch(/insufficient_privilege/i);
    });
  });

  it('service_role -> park_venture_decision guard ADMITS (reaches "Decision not found" for an absent id)', async () => {
    await asCaller({ role: 'service_role' }, async () => {
      const r = await client.query('SELECT public.park_venture_decision($1,$2,$3,$4) AS res', [ABSENT_UUID, 'blocked', 'service role admit path test', null]);
      expect(r.rows[0].res.success).toBe(false);
      // proves the guard let it through (hit the not-found branch, not the authz reject)
      expect(JSON.stringify(r.rows[0].res)).toMatch(/not found/i);
      expect(JSON.stringify(r.rows[0].res)).not.toMatch(/insufficient_privilege/i);
    });
  });

  // ── log_stage_advance_override (RETURNS uuid — denial RAISES 42501) ──
  it('non-chairman authenticated -> log_stage_advance_override RAISES insufficient_privilege (42501)', async () => {
    await asCaller({ sub: NON_CHAIRMAN_UID, role: 'authenticated' }, async () => {
      await expect(
        client.query("SELECT public.log_stage_advance_override($1,$2,$3)", [ABSENT_UUID, 'authz negative path reason >= 10 chars', '{}'])
      ).rejects.toMatchObject({ code: '42501' });
    });
  });

  it('service_role -> log_stage_advance_override guard ADMITS (returns an audit_log uuid)', async () => {
    await asCaller({ role: 'service_role' }, async () => {
      const r = await client.query("SELECT public.log_stage_advance_override($1,$2,$3) AS audit_id", [ABSENT_UUID, 'service role admit path reason >= 10 chars', '{}']);
      // proves the guard admitted: it wrote (in-tx, rolled back) and returned a uuid
      expect(r.rows[0].audit_id).toMatch(/^[0-9a-f-]{36}$/i);
    });
  });

  // ── reset_eva_circuit (RETURNS TABLE — denial RAISES 42501) ──
  it('non-chairman authenticated -> reset_eva_circuit RAISES insufficient_privilege (42501)', async () => {
    await asCaller({ sub: NON_CHAIRMAN_UID, role: 'authenticated' }, async () => {
      await expect(
        client.query('SELECT * FROM public.reset_eva_circuit($1,$2)', [ABSENT_VENTURE_TEXT, 'tester'])
      ).rejects.toMatchObject({ code: '42501' });
    });
  });

  it('service_role -> reset_eva_circuit guard ADMITS (reaches "No circuit breaker found" for an absent id)', async () => {
    await asCaller({ role: 'service_role' }, async () => {
      const r = await client.query('SELECT * FROM public.reset_eva_circuit($1,$2) AS t', [ABSENT_VENTURE_TEXT, 'tester']);
      expect(r.rows[0].success).toBe(false);
      // proves the guard let it through (hit the not-found branch, not the authz reject)
      expect(r.rows[0].message).toMatch(/no circuit breaker found/i);
    });
  });

  // ── introspection: guards present + exact search_path preserved ──
  it('introspection: all 3 fns carry the chairman/service_role guard with search_path preserved', async () => {
    const defs = {};
    for (const fn of ['park_venture_decision', 'log_stage_advance_override', 'reset_eva_circuit']) {
      const r = await client.query(
        'SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname=$1 AND n.nspname=$2 LIMIT 1',
        [fn, 'public'],
      );
      defs[fn] = r.rows[0].def;
    }
    for (const fn of ['park_venture_decision', 'log_stage_advance_override', 'reset_eva_circuit']) {
      expect(defs[fn]).toMatch(/fn_is_chairman\(\)\s+OR\s+auth\.role\(\)\s*=\s*'service_role'/);
    }
    // each fn's distinct search_path preserved verbatim
    expect(defs.park_venture_decision).toMatch(/SET search_path TO 'public', 'auth'/);
    expect(defs.log_stage_advance_override).toMatch(/SET search_path TO 'public'/);
    expect(defs.reset_eva_circuit).toMatch(/SET search_path TO 'public'/);
  });

  // ── scope guard: bootstrap_venture_workflow must remain UNGUARDED ──
  it('bootstrap_venture_workflow is intentionally EXCLUDED (no chairman guard)', async () => {
    const r = await client.query(
      'SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname=$1 AND n.nspname=$2 LIMIT 1',
      ['bootstrap_venture_workflow', 'public'],
    );
    expect(r.rows[0].def).not.toMatch(/fn_is_chairman/);
  });
});
