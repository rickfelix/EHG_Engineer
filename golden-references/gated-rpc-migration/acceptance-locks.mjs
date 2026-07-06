// Parameterized structural acceptance LOCKS for the gated-RPC + migration
// reference. Pure predicates over SQL text — node builtins only (isolation-law
// compliant), no test-framework import, so both the vitest runner
// (tests/unit/golden-references/gated-rpc-acceptance.test.js) and the
// consumption proof judge the SAME assertions over the canonical OR any
// delegate-adapted output (parameterized by an entity map {table, rpc}).
//
// Hardened after the 2026-07-06 deep adversarial review (BLOCK verdict):
// caller-identity AUTHZ (current_user is dead code inside a definer),
// pg_temp-last search_path (CVE-2018-1058 class), full-grantee-list GRANT
// checks, single-statement REVOKE scoping, DOWN-with-DROPs, and a
// single-function scope guard.
export const DEFAULT_ENTITY_MAP = Object.freeze({
  table: 'deviation_requests',
  rpc: 'submit_deviation_request',
});

export function buildLocks(map = DEFAULT_ENTITY_MAP, { kind = 'reference' } = {}) {
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    // Reference content carries the REFERENCE ONLY header; an APPLICATION
    // (delegate-adapted, destined for database/migrations/) correctly swaps
    // it for the staged chairman-gated header — the guide teaches exactly
    // that, so the judge must not punish compliance with it.
    ...(kind === 'application'
      ? { staged_application_header: (s) => /requires_chairman_apply/i.test(s) && /never on merge/i.test(s) }
      : { reference_only_header: (s) => /^--\s*REFERENCE ONLY/m.test(s) }),
    security_definer: (s) => /SECURITY DEFINER/.test(s),
    // CVE-2018-1058 class: pg_temp must be EXPLICITLY LAST in EVERY pin —
    // unless positioned, pg_temp is implicitly searched FIRST for relations,
    // so a malicious temp table could shadow the governed table inside the
    // definer. Evaluated per-pin (not whole-file substring) so a weak pin
    // cannot hide behind a strong one elsewhere.
    hardened_search_path: (s) => {
      const pins = [...s.matchAll(/SET\s+search_path\s*=\s*([^;\n\r]+)/gi)].map((m) => m[1].trim());
      return pins.length > 0 && pins.every((p) => /,\s*pg_temp\s*$/i.test(p));
    },
    // SECURITY DEFINER bypasses RLS — authorization must live in-function AND
    // read the CALLER identity (jwt claims role, session_user fallback):
    // inside a definer, current_user is the OWNER, so a current_user-keyed
    // check is dead code (adversarial CRITICAL, 2026-07-06).
    in_function_authz: (s) => {
      const flat = s.replace(/[\r\n]+\s*/g, ' ');
      return /AUTHZ/.test(s)
        && /insufficient_privilege/.test(s)
        && /request\.jwt\.claims/.test(flat) && /'role'/.test(flat)
        && /session_user/.test(s);
    },
    // The dead-code pattern itself is an explicit violation.
    no_current_user_authz: (s) => !/current_user\s+NOT\s+IN/i.test(s),
    // Single-statement scoped ([^;]*): an unrelated `FROM PUBLIC` elsewhere
    // in the file must not satisfy this (adversarial WARNING).
    revoke_public_and_anon: (s) =>
      new RegExp(`REVOKE\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+${esc(map.rpc)}[^;]*FROM[^;]*PUBLIC[^;]*;`, 'i').test(s)
      && new RegExp(`REVOKE\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+${esc(map.rpc)}[^;]*FROM[^;]*\\banon\\b[^;]*;`, 'i').test(s),
    // Full grantee list per statement — `TO authenticated, anon` must fail
    // (adversarial CRITICAL: first-grantee-only capture let anon ride a
    // valid multi-grantee GRANT).
    grant_named_roles_only: (s) => {
      const grants = [...s.matchAll(new RegExp(`GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+${esc(map.rpc)}[^;]*?TO\\s+([^;]+);`, 'gi'))];
      if (grants.length === 0) return false;
      return grants.every((g) => g[1].split(',').map((r) => r.trim().toLowerCase())
        .every((r) => r.length > 0 && r !== 'public' && r !== 'anon'));
    },
    // supabase-js silently swallows CHECK violations — the RPC fails loud first.
    raise_validation: (s) => /RAISE EXCEPTION/.test(s) && /22004/.test(s),
    check_constraints: (s) => /CHECK\s*\(/.test(s),
    rls_enabled: (s) => new RegExp(`ALTER TABLE\\s+${esc(map.table)}\\s+ENABLE ROW LEVEL SECURITY`, 'i').test(s),
    verify_by_read_back: (s) => /RETURNING \* INTO/.test(s),
    // The DOWN header alone is not a rollback — require actual DROPs after it.
    down_stanza: (s) => {
      const at = s.search(/^--\s*DOWN/m);
      return at !== -1 && /--\s*DROP\s+(FUNCTION|TABLE|POLICY)/i.test(s.slice(at));
    },
    // Whole-file locks assume ONE function per reference file — a second
    // unpinned definer riding along must fail loudly (adversarial WARNING).
    single_function_scope: (s) => (s.match(/CREATE\s+OR\s+REPLACE\s+FUNCTION/gi) || []).length === 1,
    entity_names_present: (s) => s.includes(map.table) && s.includes(map.rpc),
  };
}

/** Evaluate every lock; returns { ok, failed: [lockName] }. */
export function judgeSql(sql, map = DEFAULT_ENTITY_MAP, opts = {}) {
  const locks = buildLocks(map, opts);
  const failed = Object.entries(locks).filter(([, check]) => !check(sql)).map(([name]) => name);
  return { ok: failed.length === 0, failed };
}
