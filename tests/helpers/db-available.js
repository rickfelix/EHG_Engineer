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
// QF-20260726-459 Part 1b: the predicate moved to a vitest-free module so vitest.config.js can
// import it too (see db-target.js for why). Re-exported here so every existing consumer — 119
// files gate on HAS_REAL_DB directly — keeps working unchanged. ONE definition site, not two.
import { assessDbTarget, projectRefOf, DESIGNATED_NON_PROD_REFS } from './db-target.js';

export { assessDbTarget, projectRefOf, DESIGNATED_NON_PROD_REFS };

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
