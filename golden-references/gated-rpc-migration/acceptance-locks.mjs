// Parameterized structural acceptance LOCKS for the gated-RPC + migration
// reference. Pure predicates over SQL text — node builtins only (isolation-law
// compliant), no test-framework import, so both the vitest runner
// (tests/unit/golden-references/gated-rpc-acceptance.test.js) and the
// consumption proof judge the SAME assertions over the canonical OR any
// delegate-adapted output (parameterized by an entity map {table, rpc}).
export const DEFAULT_ENTITY_MAP = Object.freeze({
  table: 'deviation_requests',
  rpc: 'submit_deviation_request',
});

export function buildLocks(map = DEFAULT_ENTITY_MAP, { kind = 'reference' } = {}) {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    // Reference content carries the REFERENCE ONLY header; an APPLICATION
    // (delegate-adapted, destined for database/migrations/) correctly swaps
    // it for the staged chairman-gated header — the guide teaches exactly
    // that, so the judge must not punish compliance with it.
    ...(kind === 'application'
      ? { staged_application_header: (s) => /requires_chairman_apply/i.test(s) && /never on merge/i.test(s) }
      : { reference_only_header: (s) => /^--\s*REFERENCE ONLY/m.test(s) }),
    security_definer: (s) => /SECURITY DEFINER/.test(s),
    // Hardened lineage only; the modal-but-weaker bare `public` form fails.
    hardened_search_path: (s) =>
      /SET\s+search_path\s*=\s*(''|pg_catalog\s*,\s*public)/i.test(s)
      && !/SET\s+search_path\s*=\s*public\s*$/im.test(s),
    // SECURITY DEFINER bypasses RLS — authorization must live in-function.
    in_function_authz: (s) => /AUTHZ/.test(s) && /insufficient_privilege/.test(s),
    revoke_public_and_anon: (s) =>
      new RegExp(`REVOKE\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+${esc(map.rpc)}[\\s\\S]*?FROM\\s+PUBLIC`, 'i').test(s)
      && new RegExp(`REVOKE\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+${esc(map.rpc)}[\\s\\S]*?FROM\\s+anon`, 'i').test(s),
    grant_named_roles_only: (s) => {
      const grants = [...s.matchAll(new RegExp(`GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+${esc(map.rpc)}[^;]*TO\\s+([a-z_]+)`, 'gi'))];
      return grants.length > 0 && grants.every((g) => !['public', 'anon'].includes(g[1].toLowerCase()));
    },
    // supabase-js silently swallows CHECK violations — the RPC fails loud first.
    raise_validation: (s) => /RAISE EXCEPTION/.test(s) && /22004/.test(s),
    check_constraints: (s) => /CHECK\s*\(/.test(s),
    rls_enabled: (s) => new RegExp(`ALTER TABLE\\s+${esc(map.table)}\\s+ENABLE ROW LEVEL SECURITY`, 'i').test(s),
    verify_by_read_back: (s) => /RETURNING \* INTO/.test(s),
    down_stanza: (s) => /^--\s*DOWN/m.test(s),
    entity_names_present: (s) => s.includes(map.table) && s.includes(map.rpc),
  };
}

/** Evaluate every lock; returns { ok, failed: [lockName] }. */
export function judgeSql(sql, map = DEFAULT_ENTITY_MAP, opts = {}) {
  const locks = buildLocks(map, opts);
  const failed = Object.entries(locks).filter(([, check]) => !check(sql)).map(([name]) => name);
  return { ok: failed.length === 0, failed };
}
