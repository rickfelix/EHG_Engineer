/**
 * SD-ALTIFYAI-FDBK-FIX-GENERIC-SECURITY-SUB-001 — shared DEFINER-exposure probe.
 *
 * DELIBERATELY UNMOCKED. The sibling suite
 * (tests/unit/sub-agents/security-definer-posture.test.js) mocks
 * scripts/lib/supabase-connection.js to drive the sub-agent's verdict, which means it can
 * never prove the REAL credential fence holds. This file mocks nothing, so
 * probeDefinerExposure() runs its actual default connection path against the unit project's
 * env — the only way to demonstrate that a probe with no injected factory cannot reach the
 * production catalog.
 *
 * The fence being verified: vitest.config.js empties SUPABASE_POOLER_URL, DATABASE_URL,
 * SUPABASE_DB_PASSWORD and EHG_DB_PASSWORD for the unit project. With all four falsy,
 * createDatabaseClient (scripts/lib/supabase-connection.js:175-179) throws before opening a
 * socket. tests/setup.unit.js covers only the PostgREST vars, and the db tier's guard is a
 * globalThis.fetch guard — neither can observe a pg connection, so this assertion is the fence.
 */

import { describe, it, expect } from 'vitest';
import {
  DEFINER_EXPOSURE_SQL,
  classifyDefinerExposure,
  probeDefinerExposure
} from '../../../lib/security/definer-exposure.js';

const EXPOSED = {
  schema: 'public', name: 'record_venture_error', args: 'p_venture_id uuid', owner: 'postgres',
  owner_bypasses_rls: true, security_definer: true, anon_execute: true, authenticated_execute: true
};

describe('DEFINER_EXPOSURE_SQL predicate', () => {
  it('constrains the exposure class', () => {
    expect(DEFINER_EXPOSURE_SQL).toMatch(/prosecdef/);
    expect(DEFINER_EXPOSURE_SQL).toMatch(/rolbypassrls/);
    expect(DEFINER_EXPOSURE_SQL).toMatch(/has_function_privilege\('anon'/);
    expect(DEFINER_EXPOSURE_SQL).toMatch(/has_function_privilege\('authenticated'/);
  });

  it('never filters on search_path — pinning is what hid 42 of 44', () => {
    expect(DEFINER_EXPOSURE_SQL).not.toMatch(/proconfig|search_path/);
  });
});

describe('classifyDefinerExposure — two-sided by construction', () => {
  it('flags a DEFINER function owned by a BYPASSRLS role and callable by anon', () => {
    expect(classifyDefinerExposure([EXPOSED]).map(f => f.name)).toEqual(['record_venture_error']);
  });

  it('does NOT flag a function whose owner lacks rolbypassrls', () => {
    expect(classifyDefinerExposure([{ ...EXPOSED, name: 'safe_a', owner_bypasses_rls: false }])).toEqual([]);
  });

  it('does NOT flag a function no public role can execute', () => {
    expect(classifyDefinerExposure([
      { ...EXPOSED, name: 'safe_b', anon_execute: false, authenticated_execute: false }
    ])).toEqual([]);
  });

  it('flags on authenticated EXECUTE alone, not only anon', () => {
    expect(classifyDefinerExposure([
      { ...EXPOSED, name: 'authed_only', anon_execute: false, authenticated_execute: true }
    ]).map(f => f.name)).toEqual(['authed_only']);
  });

  it('a pinned search_path does not exempt a function — pinning is not an exclusion axis', () => {
    const pinned = { ...EXPOSED, proconfig: ['search_path=pg_catalog, public'] };
    expect(classifyDefinerExposure([pinned]).map(f => f.name)).toEqual(['record_venture_error']);
  });

  it('tolerates a non-array input rather than throwing', () => {
    expect(classifyDefinerExposure(undefined)).toEqual([]);
    expect(classifyDefinerExposure(null)).toEqual([]);
  });
});

describe('probeDefinerExposure — three distinguishable states', () => {
  it('FR-7 AC-3: with the unit credential fence in place, the real default path reports probe_ran:false', async () => {
    // No injected factory: this exercises createDatabaseClient for real.
    const r = await probeDefinerExposure();
    expect(r.probe_ran).toBe(false);
    expect(r.reason).toMatch(/Database password not found|connection|connect/i);
    // The load-bearing assertion: an unrun probe must NOT be readable as "zero at risk".
    expect(r.functions_at_risk).toBeNull();
    expect(r.functions).toEqual([]);
  });

  it('reports probe_ran:true with a count when the catalog answers', async () => {
    const r = await probeDefinerExposure({
      connect: async () => ({ query: async () => ({ rows: [EXPOSED] }), end: async () => {} })
    });
    expect(r.probe_ran).toBe(true);
    expect(r.reason).toBeNull();
    expect(r.functions_at_risk).toBe(1);
  });

  it('reports probe_ran:true with zero when the catalog is genuinely clean', async () => {
    const r = await probeDefinerExposure({
      connect: async () => ({ query: async () => ({ rows: [] }), end: async () => {} })
    });
    expect(r.probe_ran).toBe(true);
    expect(r.functions_at_risk).toBe(0);
  });

  it('a query failure is probe_ran:false with a null count, never a clean zero', async () => {
    const r = await probeDefinerExposure({
      connect: async () => ({
        query: async () => { throw new Error('permission denied for schema pg_catalog'); },
        end: async () => {}
      })
    });
    expect(r.probe_ran).toBe(false);
    expect(r.functions_at_risk).toBeNull();
    expect(r.reason).toMatch(/permission denied/);
  });

  it('closes the connection even when the query throws', async () => {
    let ended = false;
    await probeDefinerExposure({
      connect: async () => ({
        query: async () => { throw new Error('boom'); },
        end: async () => { ended = true; }
      })
    });
    expect(ended).toBe(true);
  });
});
