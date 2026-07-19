/* post-checkout-role-restore.cjs — PostCheckout hook (SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-A / FR-3).
 *
 * After a `git checkout` clobbers the gitignored .claude/active-coordinator.json pointer,
 * this hook restores it when the current session is DB-confirmed as the coordinator.
 * session-role-orient.cjs then continues to emit the COORDINATOR role banner correctly.
 *
 * Fail-open: any DB/IO error is caught and the process exits 0. NEVER abort a checkout.
 * Export the core function for tests (TS-3).
 */

'use strict';

const path = require('path');
const { drainAndExit } = require('../../lib/hooks/drain-undici.cjs'); // QF-20260719-890: drain before post-fetch exits

/**
 * Core restore logic — exported for tests.
 *
 * @param {object} supabase - injectable Supabase client (or null → no-op)
 * @param {string|null} sessionId - CLAUDE_SESSION_ID of the current session
 * @param {Function} writePointerFileFn - injectable writePointerFile (for tests)
 * @param {object} [os] - injectable os module (for tests)
 * @returns {Promise<{ restored: boolean, reason: string }>}
 */
async function restoreCoordinatorPointer(supabase, sessionId, writePointerFileFn, os) {
  if (!sessionId || typeof sessionId !== 'string') {
    return { restored: false, reason: 'no_session_id' };
  }
  if (!supabase) {
    return { restored: false, reason: 'no_supabase' };
  }
  try {
    const { data: row } = await supabase
      .from('claude_sessions')
      .select('metadata')
      .eq('session_id', sessionId)
      .maybeSingle();

    const isCoordinator = row && row.metadata && row.metadata.is_coordinator === true;
    if (!isCoordinator) {
      return { restored: false, reason: 'not_coordinator' };
    }

    const hostname = os ? os.hostname() : 'unknown';
    writePointerFileFn({
      session_id: sessionId,
      started_at: row.metadata.coordinator_since || new Date().toISOString(),
      host: hostname,
    });

    return { restored: true, reason: 'db_confirmed_coordinator' };
  } catch (e) {
    // Fail-open: log to stderr so the operator can see it, but never abort.
    process.stderr.write(
      `[post-checkout-role-restore] WARN: ${(e && e.message) || e} (non-fatal)\n`
    );
    return { restored: false, reason: 'error' };
  }
}

async function main() {
  try {
    require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
    const sessionId = process.env.CLAUDE_SESSION_ID || null;
    if (!sessionId) {
      // No session id — this hook is a no-op (worker or solo session).
      process.exit(0);
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      // No DB config — skip silently.
      process.exit(0);
    }

    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { writePointerFile } = require(path.resolve(__dirname, '../../lib/coordinator/resolve.cjs'));
    const os = require('os');

    const result = await restoreCoordinatorPointer(supabase, sessionId, writePointerFile, os);
    if (result.restored) {
      process.stdout.write(
        `[post-checkout-role-restore] Coordinator pointer restored for session ${sessionId}\n`
      );
    }
  } catch {
    // Fail-open: hook must never abort a checkout.
  }
  await drainAndExit(0);
}

if (require.main === module) {
  main();
}

module.exports = { restoreCoordinatorPointer };
