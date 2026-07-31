/**
 * SD-LEO-INFRA-WORKER-ESCALATION-WRITE-001 (FR-6) — the inbox-drain precondition on a blocker
 * re-assertion.
 *
 * WHY IT LIVES IN lib/ RATHER THAN IN THE CLI. scripts/worker-recheck-blocker.mjs carries a
 * shebang, and vite's import analysis refuses to parse a shebang'd module, so anything exported
 * from there is structurally untestable by the vitest `unit` project. Same doctrine as
 * lib/adam/presend-consult-lane.cjs: all logic in the unit-tested lib, the live path keeps a tiny
 * diff.
 *
 * WHY THE GATE EXISTS. Alpha-3 re-checked its own blocker correctly on every pass, exactly as the
 * directive instructs, and still sat for ten hours — because it never re-read INBOUND while the
 * coordinator was actively sending it the diagnosis that would have unstuck it. "Still blocked" is
 * a sound claim only if you have looked at everything that could have unblocked you.
 */

/**
 * Count inbound rows this session has NOT yet consumed.
 *
 * Undrained means `acknowledged_at IS NULL` — the predicate lib/checkin/steps/resume.cjs uses.
 * QF-20260703-476 established that UNACKED, not unread, is the correct test: a row can be
 * read_at-stamped and still unactioned, and (per this SD's FR-3) read_at is even stamped on mere
 * dashboard render, so an unread-only test would let a surfaced-but-unactioned answer pass as
 * drained.
 *
 * TAKES AN ALREADY-CONSTRUCTED CLIENT, NOT A FACTORY. Constructing a SECOND supabase client in this
 * process and issuing a query from it makes the subsequent process.exit() race libuv handle
 * teardown on Windows: the run aborts with "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)"
 * and exit code 127, destroying the exit-code contract this CLI exists to provide (0/2/3/4). Caller
 * must pass the ONE client it already builds for emit-feedback. Verified: factory form exited 127,
 * shared-client form exits 3/4 correctly.
 *
 * @param {string|null} sessionId
 * @param {Function} [countFn] injectable counter so tests never touch a live database
 * @param {object} [deps] { client } — an existing supabase client, NOT a createClient factory
 * @returns {Promise<number|null>} count, or null when it cannot be determined
 *
 * FAIL-OPEN BY DESIGN: a failure to COUNT is not a failure to drain. If the query breaks we return
 * null and the caller proceeds, because a telemetry outage must never manufacture a blocker.
 */
export async function countUndrainedInbound(sessionId, countFn, deps = {}) {
  if (!sessionId) return null;
  try {
    if (countFn) return await countFn(sessionId);
    const client = deps.client;
    if (!client) return null;
    const { count, error } = await client
      .from('session_coordination')
      .select('id', { count: 'exact', head: true })
      .eq('target_session', sessionId)
      .is('acknowledged_at', null);
    return error ? null : count;
  } catch {
    return null;
  }
}

/**
 * PURE/TOTAL. Decide whether a re-check verdict may stand.
 *
 * Only STILL_BLOCKING is gated. The asymmetry is load-bearing: gating CLEARED would keep a worker
 * blocked in order to enforce a process rule, which is precisely the harm FR-6 exists to prevent.
 * INDETERMINATE passes through so a broken check stays distinguishable from a real block.
 *
 * @returns {'cleared'|'still_blocking'|'indeterminate'|'drain_required'}
 */
export function applyDrainGate(outcome, undrainedCount) {
  return outcome === 'still_blocking' && Number(undrainedCount) > 0 ? 'drain_required' : outcome;
}

/** Exit code for each verdict, so a worker can branch without parsing prose. */
export const EXIT_CODES = { cleared: 0, indeterminate: 2, still_blocking: 3, drain_required: 4 };
