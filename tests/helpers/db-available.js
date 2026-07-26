/**
 * Shared DB-availability helper for the vitest db/no-db project split.
 * SD-FDBK-INFRA-VITEST-PROJECT-SPLIT-001 (FR-1); reworked by QF-20260726-459 (Part 1).
 *
 * Consolidates the guard that was copy-pasted inline across ~53 test files (CAPA CA-1 of
 * SD-LEO-INFRA-COVERAGE-CI-TRIAGE-001). Because every guarded suite reads the symbols defined
 * here, this is also the single place where the guard can be made safe for all of them at once.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * QF-20260726-459 — WHY THIS FILE CHANGED. THE OLD GUARD ANSWERED THE WRONG QUESTION.
 *
 * It was:
 *   HAS_REAL_DB = SUPABASE_URL set && !includes('test.invalid.local')
 *              && SERVICE_ROLE_KEY set && !includes('test-service-role-key-not-real')
 *
 * That is a NEGATIVE check against two literal placeholder sentinels, so it truthfully answers
 * "IS A REAL DATABASE REACHABLE?" — while every consumer reads it as "IS IT SAFE TO WRITE HERE?".
 * Production satisfies the first and fails the second. The value was never wrong; the QUESTION was.
 *
 * MEASURED, not theorised: on the shared root every agent session runs from, the old predicate
 * evaluated TRUE against the production project ref — so the db project targeted the live database
 * holding 148 ventures, and that project's setupFiles load the real .env. Some of those suites
 * exercise handlers that delete ventures.
 *
 * ENUMERATE WHAT IS SAFE, NOT WHAT IS NOT. Extending the sentinel blacklist is what created this:
 * a denylist of known-fake strings can never cover the infinite set of real-but-unsafe targets, and
 * production is simply a string nobody thought to add. The guard below is POSITIVE — a target is
 * usable only if it has been EXPLICITLY DESIGNATED, and everything else FAILS CLOSED.
 *
 * FAIL-CLOSED-WITH-NOTHING-TO-ALLOW IS A SAFE END STATE. No non-production project is provisioned
 * today, so DESIGNATED_NON_PROD_REFS is deliberately EMPTY and, absent an opt-in, every DB test
 * SKIPS. That is strictly better than running against production. If a suite only passed because it
 * was reaching the live database, its skipping is the CORRECT new behaviour and should be REPORTED,
 * never patched around by widening this guard.
 *
 * PROVISIONING A REAL NON-PRODUCTION TARGET IS PART 2 AND IS A DECISION, NOT A FIX — deliberately
 * out of scope here so it cannot hold up closing an armed hazard.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Usage:
 *   import { describeDb, itDb, HAS_REAL_DB } from '../helpers/db-available.js';
 *   describeDb('queries the venture table', () => { ... });  // skipped unless the target is designated
 */
import { describe, it } from 'vitest';

/**
 * Project refs explicitly designated NON-PRODUCTION and safe for destructive test traffic.
 *
 * INTENTIONALLY EMPTY: no non-production Supabase project exists yet (Part 2). An empty allowlist
 * means the only route to running DB tests is the deliberate, target-naming opt-in below — which
 * cannot be taken by accident.
 */
export const DESIGNATED_NON_PROD_REFS = Object.freeze([]);

/** Extract the Supabase project ref from a URL, or null when it is not a recognisable project URL. */
export function projectRefOf(url) {
  if (typeof url !== 'string') return null;
  const m = url.match(/^https?:\/\/([a-z0-9-]+)\.supabase\.(?:co|in)\b/i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * THE POSITIVE SAFETY PREDICATE. Pure — it takes an env bag, so the discrimination tests can prove
 * BOTH arms (skip AND allow) directly, with no module-cache games. A guard that can only be shown
 * to skip is indistinguishable from a guard that always skips, and the second one silently deletes
 * all DB coverage while passing every test anyone would think to write.
 *
 * A target is usable only when ALL of these hold:
 *   1. a service-role key is present at all (nothing can connect otherwise);
 *   2. the URL parses to a real Supabase project ref;
 *   3. that ref is EITHER on the designated non-prod allowlist, OR named explicitly by
 *      VITEST_DB_ALLOW_REF;
 *   4. and when the opt-in is used, the named ref MATCHES the ref the URL actually points at.
 *
 * (4) is what makes the opt-in an authorisation rather than a rubber stamp: you cannot authorise
 * "some test project" and be silently pointed at production, because the authorisation names an
 * exact ref and is checked against reality. Opting in to production therefore requires typing the
 * production ref yourself — a deliberate act, not an accident.
 *
 * Returns a REASON alongside the verdict so a skip is never mysterious: "there was no DB coverage"
 * and "DB coverage silently vanished" look identical in a green run, and the reason is what
 * separates them.
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
  // Unparseable (including the synthetic test.invalid.local sentinel) → fail closed. Note we never
  // name that sentinel: anything not positively identified is refused by construction, which is the
  // whole point of inverting the predicate.
  if (!ref) return { allowed: false, reason: 'unrecognised_target', ref: null };

  if (DESIGNATED_NON_PROD_REFS.includes(ref)) {
    return { allowed: true, reason: 'allowlisted_non_prod_ref', ref };
  }

  const optIn = (env.VITEST_DB_ALLOW_REF || '').trim().toLowerCase();
  if (!optIn) return { allowed: false, reason: 'no_designated_target', ref };
  if (optIn !== ref) return { allowed: false, reason: 'opt_in_ref_mismatch', ref };

  return { allowed: true, reason: 'explicit_opt_in_matches_target', ref };
}

/** The assessment for the current process env, computed once at import. */
export const DB_TARGET = assessDbTarget(process.env);

/**
 * Is a real database merely REACHABLE? This is the OLD meaning of HAS_REAL_DB, preserved under an
 * honest name because it is a legitimate question — just never a SAFETY question. Do not gate
 * destructive tests on this.
 */
export const DB_IS_REACHABLE = Boolean(
  process.env.SUPABASE_URL
    && process.env.SUPABASE_SERVICE_ROLE_KEY
    && projectRefOf(process.env.SUPABASE_URL),
);

/** Is it SAFE to run DB tests against the configured target? Every guard should use this one. */
export const DB_TARGET_IS_DESIGNATED = DB_TARGET.allowed;

/**
 * COMPATIBILITY SYMBOL — now means "safe to use", NOT "reachable".
 *
 * 119 test files gate on HAS_REAL_DB DIRECTLY, versus only 35 using describeDb/itDb, so fixing the
 * wrappers alone would have left the large majority unguarded and still pointed at production.
 * Re-pointing this symbol at the safety predicate is what makes every call site fail closed in a
 * single edit. Prefer the explicitly-named exports above in new code.
 */
export const HAS_REAL_DB = DB_TARGET_IS_DESIGNATED;

/**
 * `describe()` that runs only when the target is an explicitly designated non-production database,
 * and is SKIPPED (not failed) otherwise. Preserves the chainable API by delegating to skipIf.
 */
export const describeDb = describe.skipIf(!DB_TARGET_IS_DESIGNATED);

/** `it()` that runs only when the target is explicitly designated; skipped otherwise. */
export const itDb = it.skipIf(!DB_TARGET_IS_DESIGNATED);
