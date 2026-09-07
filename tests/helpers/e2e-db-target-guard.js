/**
 * Playwright production-target guard — SD-LEO-INFRA-E2E-DBTIER-PROD-REF-GUARD-001.
 *
 * Refuses to let a Playwright run proceed when its resolved Supabase target is the
 * production project ref, BEFORE any network call. Reuses tests/helpers/db-target.js's
 * assessDbTarget()/projectRefOf() UNCHANGED (that file's own header names parallel
 * re-derivation as the mistake that let its original defect survive its own test).
 *
 * TWO INDEPENDENT CHECKS, either one refusing is sufficient to refuse the run:
 *   1. assessDbTarget()'s existing default-deny predicate (refuses any undesignated ref).
 *   2. A narrow, hardcoded production-ref denylist, evaluated via projectRefOf() DIRECTLY
 *      on the resolved URL — NOT via assessDbTarget().ref. assessDbTarget().ref is null
 *      whenever SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is individually absent (it gates
 *      on BOTH before deriving ref), so relying on it alone leaves three real bypass shapes
 *      open (measured by PLAN-TO-EXEC TESTING, evidence de1c5d33): SUPABASE_URL=prod with no
 *      service key (stories-ci.yml's exact shape); NEXT_PUBLIC_SUPABASE_URL=prod only
 *      (tests/e2e/phase-handoffs.spec.ts's own fallback chain); prod URL + anon key only.
 *      Check 2 closes all three by reading the URL chain directly, independent of key
 *      presence, and is NOT overridable by VITEST_DB_ALLOW_REF (that opt-in only affects
 *      check 1).
 *
 * ENV-ORDERING SELF-SUFFICIENCY: four of the five playwright*.config.js files never call
 * dotenv.config() at module scope (only playwright.config.js does) — their env is
 * materialized later by a different code path. A guard that trusted the importing config to
 * have loaded env first would evaluate an empty process.env at exactly the wrong moment.
 * This module calls dotenv.config() itself (idempotent) before reading process.env, so its
 * correctness never depends on per-config-file dotenv discipline or ordering. This only
 * happens on the process.env path — a caller that passes an explicit env bag (hermetic unit
 * tests) skips the dotenv load entirely.
 */
import dotenv from 'dotenv';
import { assessDbTarget, projectRefOf } from './db-target.js';

/** The known production Supabase project ref. Not a credential — a public URL subdomain. */
export const PRODUCTION_REF = 'dedlbzhpgkmetvhbkyzq';

/**
 * Throws when the resolved Playwright target is unsafe. Call at module top-level in every
 * playwright*.config.js, before defineConfig() returns — a throw there aborts the whole
 * Playwright run (every worker freshly re-imports the config before loading any spec file)
 * before any network call, browser open, or child_process spawn.
 *
 * @param {Record<string,string|undefined>} [env] - defaults to process.env (loads dotenv
 *   first); pass an explicit bag for hermetic testing (dotenv load is skipped in that case).
 */
export function assertPlaywrightTargetSafe(env = process.env) {
  if (env === process.env) {
    dotenv.config(); // idempotent — never overwrites an already-set var
  }

  // Check 1: reuse assessDbTarget's existing default-deny predicate, unchanged -- but pass it
  // the same SUPABASE_URL||NEXT_PUBLIC_SUPABASE_URL fallback chain check 2 uses, not env.SUPABASE_URL
  // alone. assessDbTarget itself only ever reads env.SUPABASE_URL (tests/helpers/db-target.js:51,
  // unmodified) and never falls back to NEXT_PUBLIC_SUPABASE_URL; without this normalization, an
  // undesignated NON-production ref reachable solely via NEXT_PUBLIC_SUPABASE_URL (with a real
  // service key) would resolve assessment.ref to null (check 1 a no-op) while check 2 only compares
  // against the PRODUCTION ref specifically -- so it would pass both checks unrefused, even though
  // assessDbTarget's own default-deny philosophy would refuse it if it ever saw the URL at all.
  const normalizedEnv = env.SUPABASE_URL ? env : { ...env, SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL };
  const assessment = assessDbTarget(normalizedEnv);
  if (assessment.ref && !assessment.allowed) {
    throw new Error(
      `[e2e-db-target-guard] Refused: target ref "${assessment.ref}" is not designated safe ` +
      `(${assessment.reason}). Set VITEST_DB_ALLOW_REF to an explicitly authorized ` +
      'non-production ref, or point SUPABASE_URL at a designated non-production project.'
    );
  }

  // Check 2: independent, direct production-ref denylist — reads the URL chain directly so
  // it cannot be defeated by an absent service key or by the NEXT_PUBLIC_ fallback, and is
  // NOT overridable by VITEST_DB_ALLOW_REF.
  const resolvedUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const directRef = projectRefOf(resolvedUrl);
  if (directRef === PRODUCTION_REF) {
    throw new Error(
      `[e2e-db-target-guard] Refused: resolved target ref "${directRef}" is the PRODUCTION ` +
      'project ref. This check is independent of VITEST_DB_ALLOW_REF and cannot be bypassed by it.'
    );
  }
}
