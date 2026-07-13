/**
 * lib/coordinator/clear-coordinator-review.js — SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-C (FR-2)
 *
 * FIRST canonical write-site for strategic_directives_v2.metadata.needs_coordinator_review.
 * Today only 2 READ sites exist (lib/fleet/claim-eligibility.cjs:82, lib/coordinator/dispatch.cjs:163,
 * both strict `=== true` checks) — clearing the flag to false IS the coordinator's dispatch
 * authorization (CLAUDE_ADAM.md). No production write path existed before this.
 *
 * Uses an ATOMIC JSONB partial merge (`metadata || '{"needs_coordinator_review": false}'::jsonb`)
 * via the raw pg Client, NOT a supabase-js read-then-spread-then-write of the whole metadata blob.
 * A read-modify-write here would be silently reverted by a concurrent coordinator-backlog-rank.mjs
 * pass that read a stale snapshot before this write landed (database-agent finding, PLAN phase) —
 * re-blocking a just-authorized SD with no error. supabase-js's `.update()` cannot express a JSONB
 * `||` merge directly, so this goes through scripts/lib/supabase-connection.js::createDatabaseClient
 * instead (service-role Postgres connection — RLS on strategic_directives_v2 restricts anon/
 * authenticated writes via venture_update_strategic_directives_v2).
 *
 * After the atomic clear, fires an event-driven rank pass (fire-and-forget) so the newly-authorized
 * SD is ranked promptly instead of waiting for the next 15-min cron tick.
 */
import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';
import { triggerRankPass } from './trigger-rank-pass.mjs';

/**
 * buildClearReviewQuery — pure helper: the exact atomic-merge SQL/params. Extracted for
 * unit testing without a live pg connection.
 *
 * SD-FDBK-FIX-DISPATCH-ELIGIBILITY-HONOR-001: the WHERE clause now ALSO guards on
 * metadata.lead_blocker NOT being active, so a still-lead_blocker-active SD can never have its
 * needs_coordinator_review flag cleared out from under it (closes the live G1 "RE-FENCE #3" bug).
 * This guard is folded into the SAME atomic UPDATE...WHERE (never a separate SELECT-then-UPDATE)
 * per LEAD RISK: a read-then-write here would reintroduce the exact TOCTOU race this module's
 * atomic-merge design was built to avoid. The fail-closed truthiness matrix mirrors
 * lib/fleet/claim-eligibility.cjs's isLeadBlockerActive() EXACTLY (TR-2): a row's lead_blocker is
 * "not active" (guard passes) only when the key is absent/SQL-null, the JSON value is literally
 * false, or it is a string that trims to empty -- every other shape blocks the clear.
 * @param {string} sdKey
 * @returns {{sql: string, params: any[]}}
 */
export function buildClearReviewQuery(sdKey) {
  // Adversarial review (ship gate): NULL::jsonb || '{...}'::jsonb evaluates to NULL in Postgres —
  // an unguarded merge on a row whose metadata is ever SQL NULL would silently WIPE the entire
  // blob while still reporting success. metadata is nullable (default '{}'::jsonb); COALESCE
  // makes the merge safe regardless of the column's current value.
  return {
    sql: `UPDATE strategic_directives_v2
          SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"needs_coordinator_review": false}'::jsonb
          WHERE sd_key = $1
            AND (
              metadata->'lead_blocker' IS NULL
              OR metadata->'lead_blocker' = 'false'::jsonb
              OR (jsonb_typeof(metadata->'lead_blocker') = 'string' AND trim(metadata->>'lead_blocker') = '')
            )`,
    params: [sdKey],
  };
}

/**
 * clearCoordinatorReview — clear metadata.needs_coordinator_review to false for one SD via
 * an atomic JSONB merge, then trigger an event-driven rank pass.
 *
 * @param {string} sdKey
 * @param {object} [opts]
 * @param {Function} [opts.createClientFn] test-injection seam (defaults to createDatabaseClient)
 * @param {Function} [opts.triggerFn] test-injection seam (defaults to triggerRankPass)
 * @returns {Promise<{cleared: boolean, sdKey: string, error?: string}>}
 */
export async function clearCoordinatorReview(sdKey, opts = {}) {
  if (!sdKey || typeof sdKey !== 'string') {
    throw new Error('clearCoordinatorReview: sdKey is required');
  }
  const { createClientFn = createDatabaseClient, triggerFn = triggerRankPass } = opts;

  let client;
  try {
    client = await createClientFn('engineer', { verify: false });
  } catch (connErr) {
    return { cleared: false, sdKey, error: `db_connect_failed: ${connErr.message}` };
  }

  try {
    const { sql, params } = buildClearReviewQuery(sdKey);
    const result = await client.query(sql, params);
    const cleared = result.rowCount > 0;
    if (cleared) {
      triggerFn({ reason: 'clear_coordinator_review', sdKey });
      return { cleared: true, sdKey };
    }
    // SD-FDBK-FIX-DISPATCH-ELIGIBILITY-HONOR-001: the atomic UPDATE above already made the ONLY
    // decision that matters (clear or refuse) — this follow-up SELECT is purely for a more useful
    // error message and does NOT reintroduce a TOCTOU race (nothing decision-relevant depends on
    // its result; the clear was already correctly refused or the row was already confirmed absent
    // by the UPDATE's own WHERE evaluation).
    const { rows } = await client.query('SELECT 1 FROM strategic_directives_v2 WHERE sd_key = $1', [sdKey]);
    const error = rows.length > 0 ? 'refused_lead_blocker_active' : 'no_matching_row';
    return { cleared: false, sdKey, error };
  } catch (queryErr) {
    return { cleared: false, sdKey, error: queryErr.message };
  } finally {
    try { await client.end(); } catch { /* best-effort close */ }
  }
}
