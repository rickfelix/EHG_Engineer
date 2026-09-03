/**
 * Supabase Client Factory (CommonJS wrapper)
 *
 * CJS-compatible re-export of lib/supabase-client.js for .cjs scripts.
 * Mirrors the ESM factory: createSupabaseClient() and createSupabaseServiceClient().
 */

const { createClient } = require('@supabase/supabase-js');
const { resolveEnvPath } = require('./env-resolver.cjs');
const { withSchemaDriftDetection } = require('./supabase-client-schema-drift.cjs');

// SD-FDBK-INFRA-WORKTREES-CARRY-SNAPSHOT-001: resolve the MAIN worktree's .env first
// (via git --git-common-dir), so a feature worktree's own stale propagateEnvFile copy
// never wins over a live root rotation. Falls through to the old ancestor walk only
// when no main-worktree .env exists there -- preserving today's behavior for a
// genuinely .env-less repo (verified: altifyai has none anywhere; see TS-7).
function loadEnvFromAncestors() {
  const result = resolveEnvPath(process.cwd());
  // Silent no-op when nothing is found anywhere -- matches the pre-fix behavior exactly
  // (the old ancestor-walk loop simply fell off the end with no side effect). altifyai is
  // the PRD's own confirmed real .env-less repo; this must stay quiet there (see TS-7).
  if (result.source === 'none') {
    return;
  }
  // FR-5: quiet:true, matching the .js variant -- dotenv v17 otherwise prints its
  // "injected env" banner to stdout, contaminating any --json CLI output on this path.
  // TR-4: dotenv's default override:false means a variable already present in
  // process.env (shell, parent process, or an earlier .env load this process) always
  // wins over this resolved file's value -- resolving the right file is not the same
  // as that file's values actually taking effect.
  require('dotenv').config({ path: result.path, quiet: true });
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

// SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-A: this .cjs factory previously created clients
// independently of lib/supabase-client.js's schema-drift-throw wrap despite this file's
// own header claiming to be a "re-export" of it (VAL-A-2, LEAD validation-agent) --
// ~97 files import this .cjs factory and were unprotected. Both factories now share
// one wrap implementation (supabase-client-schema-drift.cjs) so they cannot drift apart
// again. See createSupabaseClient/createSupabaseServiceClient in lib/supabase-client.js
// for the throwOnSchemaDrift option doc -- same explicit, reviewed opt-out, same default.

function createSupabaseClient(options = {}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL is required');
  }
  if (!supabaseKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required');
  }

  // SD-FDBK-FIX-GUARD-ANON-SUPABASE-001: guard against silent RLS-dropped governance writes.
  const client = wrapAnonClientWithGovernanceGuard(createClient(supabaseUrl, supabaseKey));
  return options.throwOnSchemaDrift === false ? client : withSchemaDriftDetection(client);
}

function createSupabaseServiceClient(options = {}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL is required');
  }
  if (!supabaseKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for service client');
  }

  const client = createClient(supabaseUrl, supabaseKey);
  return options.throwOnSchemaDrift === false ? client : withSchemaDriftDetection(client);
}

module.exports = {
  createSupabaseClient,
  createSupabaseServiceClient,
  // SD-FDBK-FIX-GUARD-ANON-SUPABASE-001 — exported for unit tests
  isGovernanceTable,
  wrapAnonClientWithGovernanceGuard,
  GOVERNANCE_TABLES,
};
