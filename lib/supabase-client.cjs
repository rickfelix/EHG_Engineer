/**
 * Supabase Client Factory (CommonJS wrapper)
 *
 * CJS-compatible re-export of lib/supabase-client.js for .cjs scripts.
 * Mirrors the ESM factory: createSupabaseClient() and createSupabaseServiceClient().
 */

const { createClient } = require('@supabase/supabase-js');

// QF-20260504-755: walk up from cwd looking for .env. Pre-fix, dotenv only
// loaded .env from cwd, so manual `git worktree add` (which doesn't copy .env)
// caused crashes. Now finds parent worktree's .env automatically.
function loadEnvFromAncestors() {
  const fs = require('fs');
  const path = require('path');
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    const envFile = path.join(dir, '.env');
    if (fs.existsSync(envFile)) {
      require('dotenv').config({ path: envFile });
      return;
    }
    dir = path.dirname(dir);
  }
}
// QF-20260713-897: skip the module-level .env walk under the test runner (library
// modules must not leak live creds into the unit-vitest project). Runtime unchanged.
if (!process.env.VITEST && process.env.NODE_ENV !== 'test') loadEnvFromAncestors();

// SD-FDBK-FIX-GUARD-ANON-SUPABASE-001: the ANON key is RLS-restricted, so a write to a
// governance table is SILENTLY dropped (0 rows affected, NO error) — easily mistaken for a
// missing trigger and costs a long RCA. These are the RLS-protected governance tables whose
// writes must go through createSupabaseServiceClient(); a mutating call on the anon client gets
// a loud one-time warning so the silent drop is never mistaken for a no-op trigger again.
const GOVERNANCE_TABLES = new Set([
  'strategic_directives_v2',
  'product_requirements_v2',
  'sd_phase_handoffs',
  'sd_backlog_map',
  'user_stories',
  'sd_scope_deliverables',
  'leo_protocol_sections',
  'leo_sub_agents',
  'leo_handoff_executions',
  'sub_agent_execution_results',
]);
const MUTATING_METHODS = ['update', 'upsert', 'delete', 'insert'];

/** Pure: is this one of the RLS-protected governance tables? */
function isGovernanceTable(name) {
  return GOVERNANCE_TABLES.has(String(name));
}

/**
 * Wrap an ANON client so a MUTATING call (.update/.upsert/.delete/.insert) on a governance
 * table emits a loud one-time-per-table warning — RLS silently drops it. Reads (.select) are
 * never warned. Fail-open: any wrapping error returns the raw client unchanged (never breaks
 * client creation). Behavior is otherwise byte-identical (the real method is always delegated).
 *
 * @param {object} client  the anon supabase client
 * @param {function} [warn=console.warn]  injectable for tests
 * @returns {object} the same client with a guarded .from()
 */
function wrapAnonClientWithGovernanceGuard(client, warn) {
  const emit = typeof warn === 'function' ? warn : console.warn;
  try {
    const realFrom = client.from.bind(client);
    const warned = new Set();
    client.from = (table) => {
      const builder = realFrom(table);
      if (!builder || !isGovernanceTable(table)) return builder;
      for (const m of MUTATING_METHODS) {
        if (typeof builder[m] !== 'function') continue;
        const realMethod = builder[m].bind(builder);
        builder[m] = (...args) => {
          if (!warned.has(table)) {
            warned.add(table);
            try {
              emit(
                `[supabase-client] ANON client .${m}() on governance table '${table}' — RLS will `
                + `SILENTLY drop this write (0 rows, no error). Use createSupabaseServiceClient() for `
                + `${table} writes.`
              );
            } catch { /* never let logging break the call */ }
          }
          return realMethod(...args);
        };
      }
      return builder;
    };
    return client;
  } catch {
    return client; // fail-open — a guard must never break client creation
  }
}

function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL is required');
  }
  if (!supabaseKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required');
  }

  // SD-FDBK-FIX-GUARD-ANON-SUPABASE-001: guard against silent RLS-dropped governance writes.
  return wrapAnonClientWithGovernanceGuard(createClient(supabaseUrl, supabaseKey));
}

function createSupabaseServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL is required');
  }
  if (!supabaseKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for service client');
  }

  return createClient(supabaseUrl, supabaseKey);
}

module.exports = {
  createSupabaseClient,
  createSupabaseServiceClient,
  // SD-FDBK-FIX-GUARD-ANON-SUPABASE-001 — exported for unit tests
  isGovernanceTable,
  wrapAnonClientWithGovernanceGuard,
  GOVERNANCE_TABLES,
};
