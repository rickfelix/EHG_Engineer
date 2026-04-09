/**
 * execute-preflight.mjs
 *
 * Pre-flight health checks for /execute multi-session team supervisor.
 * SD: SD-MULTISESSION-EXECUTION-TEAM-COMMAND-ORCH-001-A (FR-002)
 * Source: ARCH-EXECUTE-COMMAND-001 § Implementation Phases > Phase 1
 *
 * Three checks run in parallel BEFORE any worker is spawned:
 *   1. node_modules: tries dynamic import of @supabase/supabase-js
 *   2. db_connection: SELECT 1 round-trip
 *   3. claim_gate_rpc: calls fn_check_sd_claim with sentinel args
 *
 * Each failure produces an actionable error message (not a stack trace) so the
 * chairman knows exactly what command to run.
 */

/**
 * Check that node_modules is intact and @supabase/supabase-js loads.
 * @returns {Promise<{ok: boolean, error?: string, hint?: string}>}
 */
export async function checkNodeModules() {
  try {
    await import('@supabase/supabase-js');
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: 'node_modules issue detected',
      hint: 'Run `npm install` from repo root'
    };
  }
}

/**
 * Check DB connectivity via a SELECT 1 round-trip.
 * @param {Object} supabase - Supabase service client
 * @returns {Promise<{ok: boolean, error?: string, hint?: string}>}
 */
export async function checkDatabase(supabase) {
  try {
    // claude_sessions is a stable known table; SELECT 1 row to verify connectivity
    const { error } = await supabase
      .from('claude_sessions')
      .select('session_id')
      .limit(1);
    if (error) {
      return {
        ok: false,
        error: `Database unreachable: ${error.message}`,
        hint: 'Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env'
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: `Database unreachable: ${err.message}`,
      hint: 'Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env'
    };
  }
}

/**
 * Check that the fn_check_sd_claim RPC is responsive (used by claim gate).
 * @param {Object} supabase - Supabase service client
 * @returns {Promise<{ok: boolean, error?: string, hint?: string}>}
 */
export async function checkClaimGateRpc(supabase) {
  try {
    // Use sentinel args that won't conflict with real claims
    const { error } = await supabase.rpc('fn_check_sd_claim', {
      p_sd_key: '__preflight_sentinel__',
      p_session_id: '00000000-0000-0000-0000-000000000000'
    });
    // The RPC returning data OR a "not found" style result is fine — we only fail on transport/missing-function errors
    if (error && /function .* does not exist/i.test(error.message)) {
      return {
        ok: false,
        error: `Claim gate RPC unresponsive: ${error.message}`,
        hint: 'fn_check_sd_claim missing — apply claim-hardening migration (PR #2850)'
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: `Claim gate RPC unresponsive: ${err.message}`,
      hint: 'Check Supabase service role and DB connectivity'
    };
  }
}

/**
 * Run all three checks in parallel and aggregate results.
 * @param {Object} supabase - Supabase service client
 * @returns {Promise<{ok: boolean, checks: {node_modules, db, claim_gate}, summary: string[]}>}
 */
export async function runChecks(supabase) {
  const [node_modules, db, claim_gate] = await Promise.all([
    checkNodeModules(),
    checkDatabase(supabase),
    checkClaimGateRpc(supabase)
  ]);

  const ok = node_modules.ok && db.ok && claim_gate.ok;

  const summary = [];
  summary.push(`  ${node_modules.ok ? '✓' : '✗'} node_modules` + (node_modules.ok ? '' : ` — ${node_modules.error}. ${node_modules.hint}`));
  summary.push(`  ${db.ok ? '✓' : '✗'} database` + (db.ok ? '' : ` — ${db.error}. ${db.hint}`));
  summary.push(`  ${claim_gate.ok ? '✓' : '✗'} claim_gate_rpc` + (claim_gate.ok ? '' : ` — ${claim_gate.error}. ${claim_gate.hint}`));

  return { ok, checks: { node_modules, db, claim_gate }, summary };
}
