/**
 * SD-LEO-INFRA-REVOKE-DEFAULT-PUBLIC-001 — pg_net exposure probe.
 *
 * DELIBERATELY UNMOCKED for the default-path test, mirroring
 * tests/unit/security/definer-exposure.test.js: probePgNetExposure() with no injected
 * connect runs its real default connection path against the unit project's env — the only
 * way to demonstrate that a probe with no injected factory cannot reach the production
 * catalog. See that file's own header comment for the fence mechanics (vitest.config.js
 * empties SUPABASE_POOLER_URL/DATABASE_URL/SUPABASE_DB_PASSWORD/EHG_DB_PASSWORD for the
 * unit project; createDatabaseClient throws before opening a socket).
 *
 * TR-5 (this SD's PRD): no test here asserts a live exposure COUNT. Today's baseline
 * (10 functions, 3 relations) is documented in the module header only — a test pinned to
 * that count would go red the moment someone remediates one object, which is the GOOD
 * outcome this probe exists to eventually observe.
 */

import { describe, it, expect } from 'vitest';
import {
  PG_NET_FUNCTION_EXPOSURE_SQL,
  PG_NET_RELATION_EXPOSURE_SQL,
  PG_NET_SCHEMA_EXPOSURE_SQL,
  classifyPgNetFunctionExposure,
  classifyPgNetRelationExposure,
  probePgNetExposure,
} from '../../../lib/security/pg-net-exposure.js';

const CLEAN_SCHEMA_ROW = { rows: [{ anon_usage: false, authenticated_usage: false }] };

const EXPOSED_FN = {
  name: 'http_post', args: 'url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer',
  owner: 'supabase_admin', anon_execute: true, authenticated_execute: true,
};

const EXPOSED_TABLE = {
  name: 'http_request_queue', kind: 'table',
  anon_select: false, anon_insert: true, anon_update: false, anon_delete: false, anon_usage: false,
  authenticated_select: false, authenticated_insert: true, authenticated_update: false, authenticated_delete: false, authenticated_usage: false,
  rls_enabled: false,
};

const EXPOSED_SEQUENCE = {
  name: 'http_request_queue_id_seq', kind: 'sequence',
  anon_select: true, anon_insert: false, anon_update: true, anon_delete: false, anon_usage: true,
  authenticated_select: true, authenticated_insert: false, authenticated_update: true, authenticated_delete: false, authenticated_usage: true,
  rls_enabled: null,
};

// Two-call sequenced mock: probePgNetExposure() calls client.query() for the function
// query, then the relation query, in that order — never concurrently (see module comment).
function sequencedClient(responses, { hasEnd = true } = {}) {
  let call = 0;
  const client = { query: async () => responses[call++] };
  if (hasEnd) client.end = async () => {};
  return client;
}

describe('PG_NET_FUNCTION_EXPOSURE_SQL / PG_NET_RELATION_EXPOSURE_SQL predicates', () => {
  it('function query scopes to the net schema and functions/procedures only, never proacl', () => {
    expect(PG_NET_FUNCTION_EXPOSURE_SQL).toMatch(/nspname = 'net'/);
    expect(PG_NET_FUNCTION_EXPOSURE_SQL).toMatch(/prokind IN \('f', 'p'\)/);
    expect(PG_NET_FUNCTION_EXPOSURE_SQL).toMatch(/has_function_privilege\('anon'/);
    expect(PG_NET_FUNCTION_EXPOSURE_SQL).toMatch(/has_function_privilege\('authenticated'/);
    expect(PG_NET_FUNCTION_EXPOSURE_SQL).not.toMatch(/proacl/);
  });

  it('relation query scopes to the net schema and tables/partitions/sequences, checks relrowsecurity, never relacl', () => {
    expect(PG_NET_RELATION_EXPOSURE_SQL).toMatch(/nspname = 'net'/);
    expect(PG_NET_RELATION_EXPOSURE_SQL).toMatch(/relkind IN \('r', 'p', 'S'\)/);
    expect(PG_NET_RELATION_EXPOSURE_SQL).toMatch(/has_table_privilege\('anon'/);
    expect(PG_NET_RELATION_EXPOSURE_SQL).toMatch(/has_table_privilege\('authenticated'/);
    expect(PG_NET_RELATION_EXPOSURE_SQL).toMatch(/relrowsecurity/);
    expect(PG_NET_RELATION_EXPOSURE_SQL).not.toMatch(/relacl/);
  });

  it('relation query is not hardcoded to specific table names — scoped by relkind so future net.* relations are caught', () => {
    expect(PG_NET_RELATION_EXPOSURE_SQL).not.toMatch(/http_request_queue|_http_response/);
  });

  it('schema query checks USAGE on net for both anon and authenticated (SECURITY finding C1: the reachability gate object ACLs sit behind)', () => {
    expect(PG_NET_SCHEMA_EXPOSURE_SQL).toMatch(/has_schema_privilege\('anon', 'net', 'USAGE'\)/);
    expect(PG_NET_SCHEMA_EXPOSURE_SQL).toMatch(/has_schema_privilege\('authenticated', 'net', 'USAGE'\)/);
  });
});

describe('classifyPgNetFunctionExposure — two-sided by construction', () => {
  it('flags a function EXECUTE-able by anon', () => {
    expect(classifyPgNetFunctionExposure([EXPOSED_FN]).map((f) => f.name)).toEqual(['http_post']);
  });

  it('flags on authenticated EXECUTE alone, not only anon', () => {
    expect(classifyPgNetFunctionExposure([
      { ...EXPOSED_FN, name: 'authed_only', anon_execute: false, authenticated_execute: true },
    ]).map((f) => f.name)).toEqual(['authed_only']);
  });

  it('does NOT flag a function no public role can execute', () => {
    expect(classifyPgNetFunctionExposure([
      { ...EXPOSED_FN, name: 'safe', anon_execute: false, authenticated_execute: false },
    ])).toEqual([]);
  });

  it('is a pure helper: a non-array input yields [] rather than throwing', () => {
    expect(classifyPgNetFunctionExposure(undefined)).toEqual([]);
    expect(classifyPgNetFunctionExposure(null)).toEqual([]);
  });
});

describe('classifyPgNetRelationExposure — two-sided by construction', () => {
  it('flags a table exposed via anon INSERT (the queue-bypass vector)', () => {
    expect(classifyPgNetRelationExposure([EXPOSED_TABLE]).map((r) => r.name)).toEqual(['http_request_queue']);
  });

  it('flags a sequence exposed via anon/authenticated USAGE (nextval abuse)', () => {
    expect(classifyPgNetRelationExposure([EXPOSED_SEQUENCE]).map((r) => r.name)).toEqual(['http_request_queue_id_seq']);
  });

  it('does NOT flag a relation with RLS enabled and no anon/authenticated grant at all', () => {
    const safe = {
      name: 'safe_table', kind: 'table',
      anon_select: false, anon_insert: false, anon_update: false, anon_delete: false, anon_usage: false,
      authenticated_select: false, authenticated_insert: false, authenticated_update: false, authenticated_delete: false, authenticated_usage: false,
      rls_enabled: true,
    };
    expect(classifyPgNetRelationExposure([safe])).toEqual([]);
  });

  it('preserves rls_enabled:null for a sequence (no RLS concept) rather than coercing to false', () => {
    expect(classifyPgNetRelationExposure([EXPOSED_SEQUENCE])[0].rls_enabled).toBeNull();
  });

  it('is a pure helper: a non-array input yields [] rather than throwing', () => {
    expect(classifyPgNetRelationExposure(undefined)).toEqual([]);
    expect(classifyPgNetRelationExposure(null)).toEqual([]);
  });
});

describe('probePgNetExposure — three distinguishable states, two parallel axes', () => {
  it('with the unit credential fence in place, the real default path reports probe_ran:false', async () => {
    // No injected factory: exercises createDatabaseClient for real. Deliberately narrow
    // matcher — see definer-exposure.test.js's header for why a loose /connection|connect/i
    // alternation is vacuous (it would pass even if the fence were bypassed).
    const r = await probePgNetExposure();
    expect(r.probe_ran).toBe(false);
    expect(r.reason).toMatch(/Database password not found/);
    expect(r.functions_at_risk).toBeNull();
    expect(r.relations_at_risk).toBeNull();
    expect(r.functions).toEqual([]);
    expect(r.relations).toEqual([]);
    expect(r.schema_usage).toBeNull();
  });

  it('reports probe_ran:true with both counts AND schema_usage when the catalog answers', async () => {
    const r = await probePgNetExposure({
      connect: async () => sequencedClient([
        { rows: [EXPOSED_FN] },
        { rows: [EXPOSED_TABLE, EXPOSED_SEQUENCE] },
        { rows: [{ anon_usage: true, authenticated_usage: true }] },
      ]),
    });
    expect(r.probe_ran).toBe(true);
    expect(r.reason).toBeNull();
    expect(r.functions_at_risk).toBe(1);
    expect(r.relations_at_risk).toBe(2);
    expect(r.schema_usage).toEqual({ anon: true, authenticated: true });
  });

  it('reports probe_ran:true with zero on both axes when the catalog is genuinely clean', async () => {
    const r = await probePgNetExposure({
      connect: async () => sequencedClient([{ rows: [] }, { rows: [] }, CLEAN_SCHEMA_ROW]),
    });
    expect(r.probe_ran).toBe(true);
    expect(r.functions_at_risk).toBe(0);
    expect(r.relations_at_risk).toBe(0);
    expect(r.schema_usage).toEqual({ anon: false, authenticated: false });
  });

  it('connect() rejecting is probe_ran:false with BOTH counts null and schema_usage null', async () => {
    const r = await probePgNetExposure({
      connect: async () => { throw new Error('connection refused'); },
    });
    expect(r.probe_ran).toBe(false);
    expect(r.reason).toMatch(/connection refused/);
    expect(r.functions_at_risk).toBeNull();
    expect(r.relations_at_risk).toBeNull();
    expect(r.schema_usage).toBeNull();
  });

  it('a malformed payload on the SCHEMA query is probe_ran:false, never a clean result on any axis', async () => {
    for (const bad of [{ rows: [] }, { rows: 'not-an-array' }, { rows: [{}, {}] }, {}, undefined, null]) {
      const r = await probePgNetExposure({
        connect: async () => sequencedClient([{ rows: [] }, { rows: [] }, bad]),
      });
      expect(r.probe_ran).toBe(false);
      expect(r.functions_at_risk).toBeNull();
      expect(r.relations_at_risk).toBeNull();
      expect(r.schema_usage).toBeNull();
      expect(r.reason).toMatch(/uninterpretable|rows/i);
      expect(r.reason).toMatch(/schema/i);
    }
  });

  it('client.query() throwing (distinct from connect() rejecting) is probe_ran:false with BOTH counts null, and still tears down', async () => {
    let ended = false;
    const r = await probePgNetExposure({
      connect: async () => ({
        query: async () => { throw new Error('permission denied for schema pg_catalog'); },
        end: async () => { ended = true; },
      }),
    });
    expect(r.probe_ran).toBe(false);
    expect(r.reason).toMatch(/permission denied/);
    expect(r.functions_at_risk).toBeNull();
    expect(r.relations_at_risk).toBeNull();
    expect(ended).toBe(true);
  });

  it('a malformed payload on the FUNCTION query is probe_ran:false, never a clean zero on either axis', async () => {
    for (const bad of [{ rows: 'not-an-array' }, {}, undefined, null]) {
      const r = await probePgNetExposure({
        connect: async () => sequencedClient([bad, { rows: [] }]),
      });
      expect(r.probe_ran).toBe(false);
      expect(r.functions_at_risk).toBeNull();
      expect(r.relations_at_risk).toBeNull();
      expect(r.reason).toMatch(/uninterpretable|rows/i);
      expect(r.reason).toMatch(/function/i);
    }
  });

  it('a malformed payload on the RELATION query is probe_ran:false, never a clean zero on either axis (even though the function query succeeded)', async () => {
    for (const bad of [{ rows: 'not-an-array' }, {}, undefined, null]) {
      const r = await probePgNetExposure({
        connect: async () => sequencedClient([{ rows: [EXPOSED_FN] }, bad]),
      });
      expect(r.probe_ran).toBe(false);
      expect(r.functions_at_risk).toBeNull();
      expect(r.relations_at_risk).toBeNull();
      expect(r.reason).toMatch(/uninterpretable|rows/i);
      expect(r.reason).toMatch(/relation/i);
    }
  });

  it('closes the connection even when the query throws, when the client owns its connection (exposes end())', async () => {
    let ended = false;
    await probePgNetExposure({
      connect: async () => ({
        query: async () => { throw new Error('boom'); },
        end: async () => { ended = true; },
      }),
    });
    expect(ended).toBe(true);
  });

  it('TR-6: a non-owning wrapper (no end()) is never closed by the probe — the sentinel-shared-connection contract', async () => {
    // The wrapper has no `end` property at all. If probePgNetExposure ever called
    // client.end() unconditionally, this would throw "client.end is not a function" and
    // the test would fail with that error rather than resolving normally.
    const wrapper = sequencedClient([{ rows: [] }, { rows: [] }, CLEAN_SCHEMA_ROW], { hasEnd: false });
    expect(wrapper.end).toBeUndefined();
    const r = await probePgNetExposure({ connect: async () => wrapper });
    expect(r.probe_ran).toBe(true);
  });
});
