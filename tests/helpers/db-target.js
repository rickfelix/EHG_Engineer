/**
 * The db-test target safety predicate — QF-20260726-459 Part 1b.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM db-available.js. Part 1 put this predicate in
 * db-available.js, which imports `vitest` at module scope for describeDb/itDb. That import makes
 * the module unusable from vitest.config.js (importing `vitest` outside a test worker throws on
 * internal-state access), and the config is exactly where the gate has to live to cover files that
 * never import the guard at all.
 *
 * So the predicate moves HERE, with NO vitest dependency, and db-available.js re-exports it. There
 * is still exactly ONE definition site. Re-deriving the predicate inside the config instead would
 * have been a parallel re-derivation — the same mistake that let the original defect survive its
 * own test (vitest-db-split.test.js re-implemented the old predicate inline and therefore agreed
 * with it by construction).
 *
 * Logic is carried over UNCHANGED from Part 1 — this is a move, not a rewrite.
 */

/**
 * Project refs explicitly designated NON-PRODUCTION and safe for destructive test traffic.
 *
 * INTENTIONALLY EMPTY: no non-production Supabase project exists yet (Part 2). An empty allowlist
 * means the only route to running DB tests is the deliberate, target-naming opt-in below.
 */
export const DESIGNATED_NON_PROD_REFS = Object.freeze([]);

/** Extract the Supabase project ref from a URL, or null when it is not a recognisable project URL. */
export function projectRefOf(url) {
  if (typeof url !== 'string') return null;
  const m = url.match(/^https?:\/\/([a-z0-9-]+)\.supabase\.(?:co|in)\b/i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * THE POSITIVE SAFETY PREDICATE. Pure — takes an env bag, so both arms (refuse AND allow) are
 * provable directly with no module-cache games.
 *
 * A target is usable only when ALL hold:
 *   1. a service-role key is present at all;
 *   2. the URL parses to a real Supabase project ref;
 *   3. that ref is EITHER allowlisted OR named explicitly by VITEST_DB_ALLOW_REF;
 *   4. and when the opt-in is used, the named ref MATCHES the ref the URL actually points at.
 *
 * (4) makes the opt-in an AUTHORISATION rather than a rubber stamp: you cannot authorise "some test
 * project" and be silently pointed at production.
 *
 * @param {Record<string,string|undefined>} env
 * @returns {{ allowed: boolean, reason: string, ref: string|null }}
 */
export function assessDbTarget(env = process.env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) return { allowed: false, reason: 'no_supabase_url', ref: null };
  if (!key) return { allowed: false, reason: 'no_service_role_key', ref: null };

  const ref = projectRefOf(url);
  // Unparseable (including the synthetic test.invalid.local sentinel) → fail closed. We never name
  // that sentinel: anything not positively identified is refused by construction.
  if (!ref) return { allowed: false, reason: 'unrecognised_target', ref: null };

  if (DESIGNATED_NON_PROD_REFS.includes(ref)) {
    return { allowed: true, reason: 'allowlisted_non_prod_ref', ref };
  }

  const optIn = (env.VITEST_DB_ALLOW_REF || '').trim().toLowerCase();
  if (!optIn) return { allowed: false, reason: 'no_designated_target', ref };
  if (optIn !== ref) return { allowed: false, reason: 'opt_in_ref_mismatch', ref };

  return { allowed: true, reason: 'explicit_opt_in_matches_target', ref };
}
