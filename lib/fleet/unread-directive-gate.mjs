/**
 * SD-LEO-INFRA-HANDOFF-UNREAD-DIRECTIVE-GATE-001 — a ship (handoff.js execute /
 * complete-quick-fix.js) is unsound if a coordinator amendment to the active SD/QF is
 * sitting unread in the executing session's inbox.
 *
 * MEASURED MOTIVATION: QF-20260828-188 (amended twice mid-build, worker shipped the
 * stale 3-leg version, follow-up QF-884 needed) and QF-20260828-255 (stranded-holds
 * amendment ping landed post-completion; coordinator executed the leg manually). The
 * directed-amendment-ping practice narrows but cannot close the window on fast builds.
 *
 * Reuses the exact discriminator lib/fleet/blocker-drain-gate.mjs already proved
 * correct: acknowledged_at IS NULL, not read_at IS NULL (QF-20260703-476 — a row can
 * be read_at-stamped by mere delivery/dashboard render without being actioned).
 *
 * WHY IN lib/, NOT INLINE. scripts/handoff.js and the complete-quick-fix module import
 * this from an ESM lib file so the logic is directly unit-testable without executing a
 * CLI, matching blocker-drain-gate.mjs's own doctrine.
 *
 * TAKES AN ALREADY-CONSTRUCTED CLIENT, NOT A FACTORY — see blocker-drain-gate.mjs for
 * why a second supabase client in-process races libuv handle teardown on Windows.
 */

/**
 * Find unacknowledged directed rows targeting `sessionId` that reference `targetKey`
 * (an SD key or QF id, matched against session_coordination.target_sd) and were
 * created after `claimedAt`.
 *
 * FAIL-OPEN BY DESIGN: a failure to query is not evidence of an unread directive. If
 * the query breaks we return null and the caller proceeds — a telemetry outage must
 * never manufacture a false block.
 *
 * @param {string|null} sessionId
 * @param {string|null} targetKey
 * @param {string|null} claimedAt ISO timestamp; rows created at or before this are ignored
 * @param {Function} [queryFn] injectable query fn(sessionId, targetKey, claimedAt) so tests never touch a live database
 * @param {object} [deps] { client } — an existing supabase client, NOT a createClient factory
 * @returns {Promise<Array<{id:string,subject:string,created_at:string}>|null>}
 */
export async function findUnreadDirectives(sessionId, targetKey, claimedAt, queryFn, deps = {}) {
  if (!sessionId || !targetKey) return null;
  try {
    if (queryFn) return await queryFn(sessionId, targetKey, claimedAt);
    const client = deps.client;
    if (!client) return null;
    // MEASURED (not assumed) against live data: session_coordination.target_sd is ALWAYS
    // null in practice — the SD/QF key lives in payload.sd, and the directive/assignment
    // kind lives in payload.kind, NOT message_type (a WORK_ASSIGNMENT row's message_type
    // is 'WORK_ASSIGNMENT', but a coordinator_directive row's message_type is 'INFO' — so
    // message_type cannot discriminate 'coordinator_directive'). Filtering on the
    // top-level target_sd/message_type columns (the SD proposal's original shape) would
    // silently match ZERO rows. Corrected during EXEC per a live schema query, not assumed.
    let query = client
      .from('session_coordination')
      .select('id, subject, created_at')
      .eq('target_session', sessionId)
      .eq('payload->>sd', targetKey)
      .in('payload->>kind', ['coordinator_directive', 'work_assignment'])
      .is('acknowledged_at', null);
    if (claimedAt) query = query.gt('created_at', claimedAt);
    const { data, error } = await query;
    return error ? null : (data || []);
  } catch {
    return null;
  }
}

/**
 * PURE/TOTAL. Decide whether the handoff/completion may proceed.
 *
 * @param {Array|null} rows result of findUnreadDirectives
 * @returns {'clear'|'blocked'|'indeterminate'}
 */
export function decideUnreadDirectiveGate(rows) {
  if (rows === null || rows === undefined) return 'indeterminate';
  return Array.isArray(rows) && rows.length > 0 ? 'blocked' : 'clear';
}

/**
 * Format the refusal message naming each blocking row, so the operator can go read it
 * without a second query.
 * @param {Array<{id:string,subject:string,created_at:string}>} rows
 */
export function formatUnreadDirectiveMessage(rows) {
  const lines = (rows || []).map((r) => `   - [${r.id}] ${r.subject} (${r.created_at})`);
  return [
    'UNREAD_DIRECTIVE: unacknowledged coordinator directive(s) target this SD/QF:',
    ...lines,
    'Read and action them first, or pass --bypass-validation to proceed anyway.',
  ].join('\n');
}
