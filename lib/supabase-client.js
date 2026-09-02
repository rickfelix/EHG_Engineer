#!/usr/bin/env node

/**
 * Supabase Client Factory
 * Creates and configures Supabase clients for EHG_Engineer applications
 *
 * SECURITY: Separate client patterns for browser vs server contexts
 * - createSupabaseClient(): Uses anon key ONLY (safe for client-side)
 * - createSupabaseServiceClient(): Uses service_role key (server-side ONLY)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolveEnvPath } from './env-resolver.cjs';

// SD-FDBK-INFRA-WORKTREES-CARRY-SNAPSHOT-001: resolve the MAIN worktree's .env first
// (via git --git-common-dir), so a feature worktree's own stale propagateEnvFile copy
// (lib/worktree-manager.js:1139-1152) never wins over a live root rotation. Falls
// through to the old ancestor walk only when no main-worktree .env exists there --
// preserving today's behavior for a genuinely .env-less repo (verified: altifyai has
// none anywhere in its own tree or ancestor chain, so this fallthrough is already a
// silent no-op there both before and after this change; see TS-7 in the PRD).
function loadEnvFromAncestors() {
  const result = resolveEnvPath(process.cwd());
  // Silent no-op when nothing is found anywhere -- matches the pre-fix behavior exactly
  // (the old ancestor-walk loop simply fell off the end with no side effect). altifyai is
  // the PRD's own confirmed real .env-less repo; this must stay quiet there (see TS-7).
  if (result.source === 'none') {
    return;
  }
  // QF-20260611-017: quiet=true — dotenv v17 prints its "injected env" banner
  // to STDOUT by default, contaminating --json CLI output (red merge 102->103:
  // audit-ghost-completed-sds --json failed JSON.parse on the banner).
  // TR-4 (SD-FDBK-INFRA-WORKTREES-CARRY-SNAPSHOT-001): dotenv's default override:false means
  // a variable already present in process.env (from the shell, a parent process, or an
  // earlier .env load in this same process) always wins over the value this resolved .env
  // file carries -- resolveEnvPath finding the correct file does not guarantee its values
  // take effect if something upstream already set the same key.
  dotenv.config({ path: result.path, quiet: true });
}
// QF-20260713-897: the module-level .env walk leaks live creds into the unit-vitest
// project (tests/setup.unit.js already stubs SUPABASE_URL/keys and must NOT reach the
// live DB). supabase-client.js is imported transitively by nearly everything (incl.
// analyzeStageNN), so guard the load under the test runner — real processes/CLIs are
// unchanged. This is the root fix for the fleet-wide unit-lane .env leak.
if (!process.env.VITEST && process.env.NODE_ENV !== 'test') loadEnvFromAncestors();

/**
 * Create Supabase client with ANON key only
 *
 * SECURITY: This client uses ONLY the anon key and is safe for client-side usage.
 * Never use this for operations requiring elevated permissions.
 *
 * @returns {import('@supabase/supabase-js').SupabaseClient} Supabase client with anon permissions
 * @throws {Error} If required environment variables are missing
 */
export function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL is required');
  }

  if (!supabaseKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required');
  }

  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Create Supabase client with SERVICE_ROLE key for server-side operations
 *
 * SECURITY WARNING: This client bypasses Row Level Security (RLS).
 * Use ONLY in server-side scripts, NEVER expose to client bundles.
 *
 * @param {object} [options]
 * @param {number} [options.fetchTimeoutMs] - OPT-IN request bound (SD-LEO-INFRA-CHECKER-READBACK-WRITE-001,
 *   RCA a726dd91). Omitted (the default): behavior is byte-identical to before this option existed —
 *   every pre-existing caller is unaffected. When set, a timed-out request is rethrown as an
 *   abort-shaped error (name='AbortError'), which makes @supabase/postgrest-js's executeWithRetry
 *   skip its normal 4-attempt/~7s-backoff retry loop instead of compounding a slow failure into a
 *   40s+ stall (measured: an unbounded request against a slow-to-fail host took 47.8s across 4
 *   attempts; the same request with fetchTimeoutMs bounds to one attempt at the configured ceiling).
 * @returns {import('@supabase/supabase-js').SupabaseClient} Supabase client with admin permissions
 * @throws {Error} If required environment variables are missing
 */
export function createSupabaseServiceClient(options = {}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL is required');
  }

  if (!supabaseKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for service client');
  }

  const { fetchTimeoutMs } = options;
  if (!fetchTimeoutMs) {
    return createClient(supabaseUrl, supabaseKey);
  }

  const boundedFetch = async (url, init = {}) => {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(fetchTimeoutMs) });
    } catch (e) {
      if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
        const err = new Error(`createSupabaseServiceClient: request exceeded fetchTimeoutMs=${fetchTimeoutMs}`);
        err.name = 'AbortError'; // abort-shaped on purpose — see the executeWithRetry note above
        err.cause = e;
        throw err;
      }
      throw e;
    }
  };
  return createClient(supabaseUrl, supabaseKey, { global: { fetch: boundedFetch } });
}

/**
 * Return a lazy service-role client proxy that defers actual createClient()
 * (and therefore the env-var validation throw) until the FIRST property
 * access. Use this at module top-level instead of calling
 * createSupabaseServiceClient() directly — module load no longer crashes
 * when env vars are missing (e.g. during vitest collection in CI without
 * secrets, or under coverage instrumentation).
 *
 * Usage (replaces `const supabase = createSupabaseServiceClient()`):
 *   const supabase = lazyServiceClient();
 *   // later, when a method is actually called:
 *   await supabase.from('strategic_directives_v2').select('*');
 *
 * @returns {import('@supabase/supabase-js').SupabaseClient} Proxy that
 *          lazily delegates to createSupabaseServiceClient() on first access.
 */
export function lazyServiceClient() {
  let real;
  return new Proxy({}, {
    get(_target, prop) {
      if (!real) real = createSupabaseServiceClient();
      const value = real[prop];
      return typeof value === 'function' ? value.bind(real) : value;
    },
  });
}

/**
 * Fetch a Strategic Directive by identifier
 * Handles both new (id column) and legacy (sd_key column) lookup patterns
 *
 * NOTE: Uses service client as this is a server-side operation
 *
 * @param {string} identifier - SD identifier (e.g., 'SD-BACKEND-003')
 * @returns {Promise<{data: object|null, error: object|null}>}
 *
 * @example
 * const { data, error } = await fetchSD('SD-BACKEND-003');
 * if (data) console.log(data.title);
 */
export async function fetchSD(identifier) {
  const supabase = createSupabaseServiceClient();

  // Try id column first (newer SDs like SD-BACKEND-003, SD-RECONNECT-008)
  let { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', identifier)
    .maybeSingle();

  // If found, return immediately
  if (data || error) {
    return { data, error };
  }

  // Fallback to sd_key column for legacy SDs
  return await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('sd_key', identifier)
    .maybeSingle();
}

// SD-LEO-FIX-CLIENT-FACTORY-FALLBACK-001: the default export used to alias
// createSupabaseClient (the ANON client). A caller who default-imports this module
// under any local name -- e.g. `import createServiceClient from './supabase-client.js'`,
// a plausible mistake since this file also exports a real createSupabaseServiceClient --
// silently received the anon client with no error, and an RLS-filtered read then
// returned an empty result with no error either. Removed rather than re-pointed to the
// service client: re-pointing would silently grant service-role (RLS-bypass) access to
// an unknown caller, a security-direction regression. A wrong/default import now fails
// LOUD at link time instead. Census: `git grep -E "(import|require)\(?.*(createSupabaseServiceClient
// |createSupabaseClient|lazyServiceClient)" -- '*.js' '*.mjs' '*.cjs' '*.ts'` (751 named-import call
// sites, re-verified by SECURITY at EXEC-TO-PLAN) found zero current consumers of the default export.
