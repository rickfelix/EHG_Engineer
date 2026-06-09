/**
 * SD-LEO-GEN-DEFENSE-DEPTH-ADD-001
 * HAS_REAL_DB behavioral tests for the internal chairman authorization guards on
 * delete_venture / set_stage_override / set_global_auto_proceed.
 *
 * NET-ZERO: every call runs inside a transaction that is ROLLBACK'd; delete_venture
 * is only ever invoked with a NON-EXISTENT venture id (it returns before any DELETE).
 * Caller identity is simulated via `SET LOCAL request.jwt.claims` (what auth.uid() /
 * auth.role() read), so no real users are needed for the negative cases.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { HAS_REAL_DB } from '../helpers/db-available.js';

const describeDb = describe.skipIf(!HAS_REAL_DB);

// A uuid that will not match any venture (negative-path safe).
const ABSENT_VENTURE = '00000000-0000-4000-8000-000000000000';
// A uuid that is (almost certainly) not a chairman in auth.users.
const NON_CHAIRMAN_UID = '11111111-1111-4111-8111-111111111111';

describeDb('SECURITY DEFINER chairman authz guards (live DB)', () => {
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

  it('non-chairman authenticated -> set_global_auto_proceed RAISES insufficient_privilege (42501)', async () => {
    await asCaller({ sub: NON_CHAIRMAN_UID, role: 'authenticated' }, async () => {
      await expect(client.query('SELECT public.set_global_auto_proceed(true)')).rejects.toMatchObject({ code: '42501' });
    });
  });

  it('non-chairman authenticated -> set_stage_override RAISES insufficient_privilege (42501)', async () => {
    await asCaller({ sub: NON_CHAIRMAN_UID, role: 'authenticated' }, async () => {
      await expect(client.query('SELECT public.set_stage_override(21, true, null)')).rejects.toMatchObject({ code: '42501' });
    });
  });

  it('non-chairman authenticated -> delete_venture returns success:false / insufficient_privilege (no delete)', async () => {
    await asCaller({ sub: NON_CHAIRMAN_UID, role: 'authenticated' }, async () => {
      const r = await client.query('SELECT public.delete_venture($1) AS res', [ABSENT_VENTURE]);
      expect(r.rows[0].res.success).toBe(false);
      expect(JSON.stringify(r.rows[0].res)).toMatch(/insufficient_privilege/i);
    });
  });

  it('service_role -> delete_venture guard ADMITS (reaches "Venture not found" for an absent id)', async () => {
    await asCaller({ role: 'service_role' }, async () => {
      const r = await client.query('SELECT public.delete_venture($1) AS res', [ABSENT_VENTURE]);
      expect(r.rows[0].res.success).toBe(false);
      // proves the guard let it through (it hit the not-found branch, not the authz reject)
      expect(r.rows[0].res.error).toMatch(/Venture not found/i);
    });
  });

  it('introspection: guards present + exact search_path preserved', async () => {
    const defs = {};
    for (const fn of ['delete_venture', 'set_stage_override', 'set_global_auto_proceed']) {
      const r = await client.query(
        'SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname=$1 AND n.nspname=$2 LIMIT 1',
        [fn, 'public'],
      );
      defs[fn] = r.rows[0].def;
    }
    // guards
    expect(defs.delete_venture).toMatch(/fn_is_chairman\(\)\s+OR\s+auth\.role\(\)\s*=\s*'service_role'/);
    expect(defs.set_stage_override).toMatch(/NOT\s+public\.fn_is_chairman\(\)/);
    expect(defs.set_global_auto_proceed).toMatch(/NOT\s+public\.fn_is_chairman\(\)/);
    // search_path preserved
    expect(defs.delete_venture).toMatch(/SET search_path TO 'public'/);
    expect(defs.set_stage_override).toMatch(/SET search_path TO 'public', 'pg_temp'/);
    expect(defs.set_global_auto_proceed).toMatch(/SET search_path TO 'public', 'pg_temp'/);
  });

  it('open questions: no 3-arg approve_chairman_decision; no anon EXECUTE on park_venture_decision / bootstrap_venture_workflow', async () => {
    const overloads = await client.query(
      "SELECT pg_get_function_identity_arguments(p.oid) AS args FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='approve_chairman_decision' AND n.nspname='public'",
    );
    // none of the remaining overloads is the unguarded 3-arg (uuid,text,text) form
    expect(overloads.rows.every((r) => r.args.split(',').length !== 3)).toBe(true);
    for (const fn of ['park_venture_decision', 'bootstrap_venture_workflow']) {
      const g = await client.query(
        "SELECT has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname=$1 AND n.nspname='public' LIMIT 1",
        [fn],
      );
      if (g.rows.length) expect(g.rows[0].anon_exec).toBe(false);
    }
  });
});
