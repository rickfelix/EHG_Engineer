/**
 * Coordinator-side writer for a COORDINATOR_RESERVATION fence row.
 *
 * SD-LEO-INFRA-DISPATCH-AUTH-AUTO-AUTHORIZE-001-C shipped the payload.kind convention
 * plus the read/enforcement/observability side (lib/checkin/steps/drain-reservations.cjs,
 * lib/checkin/steps/self-claim-gates.cjs) but no code inserted a real
 * coordinator_reservation row -- the fence was inert in production until this writer
 * existed (retro action item, e537e872).
 *
 * Storage: a session_coordination row, message_type='INFO', target_session=NULL
 * (broadcast -- drain-reservations.cjs never stamps read_at/acknowledged_at, so it must
 * stay visible to every session), target_sd=<the fenced SD>,
 * payload.kind=PAYLOAD_KINDS.COORDINATOR_RESERVATION. Mirrors lib/coordinator/relay-queue.cjs's
 * pure-builder + IO-wrapper split.
 *
 * @module lib/coordinator/reserve-sd
 */

'use strict';

const { PAYLOAD_KINDS } = require('../fleet/worker-status.cjs');
const { getActiveCoordinatorId } = require('./resolve.cjs');

/**
 * FAIL-SOFT wrapper matching relay-queue.cjs's resolveCoordinatorIdSafe: an unresolved
 * coordinator is a real, actionable failure for THIS writer (unlike relay-queue's
 * advisory-precision use), so callers must check the returned error rather than get a
 * reservation silently authored under a null identity.
 *
 * `resolveFn` is injectable (defaults to the real getActiveCoordinatorId) so tests can
 * exercise reserveSd's own logic without depending on resolve.cjs's pointer-file/DB
 * election internals — same DI shape as relay-queue.cjs's drainOne(supabase, row, sendRelay).
 * @param {object} supabase
 * @param {(supabase: object) => Promise<string|null>} [resolveFn]
 * @returns {Promise<string|null>}
 */
async function resolveCoordinatorIdSafe(supabase, resolveFn = getActiveCoordinatorId) {
  try {
    return await resolveFn(supabase);
  } catch {
    return null;
  }
}

/**
 * PURE: build the payload for a new coordinator_reservation row.
 * @param {{ reservedForSession?: string, reservedForTier?: string, lanePattern?: string }} opts
 * @returns {object}
 */
function buildCoordinatorReservationPayload({ reservedForSession, reservedForTier, lanePattern } = {}) {
  return {
    kind: PAYLOAD_KINDS.COORDINATOR_RESERVATION,
    reserved_for_session: reservedForSession || null,
    reserved_for_tier: reservedForTier || null,
    lane_pattern: lanePattern || null,
  };
}

/**
 * IO: write a coordinator_reservation fence row for targetSd.
 *
 * sender_session MUST resolve to the LIVE active coordinator -- drain-reservations.cjs's
 * FR-2 SECURITY MUST only honors rows where row.sender_session === the coordinator it
 * resolves at drain time (defense-in-depth against a buggy worker writing a self-serving
 * fence). Refusing to write when no coordinator resolves (rather than falling back to a
 * caller-supplied identity) keeps that guarantee intact at the source: a reservation
 * authored under any other identity would just be a dead row nobody ever honors, which is
 * a worse failure mode than a loud upfront error.
 *
 * @param {object} supabase
 * @param {{ targetSd: string, reservedForSession?: string, reservedForTier?: string,
 *   lanePattern?: string, expiresAt: string, resolveCoordinatorId?: (supabase: object) =>
 *   Promise<string|null> }} opts - expiresAt is an ISO-8601 string; the caller decides
 *   the reservation's lifetime, this writer never invents a default. resolveCoordinatorId
 *   defaults to the real getActiveCoordinatorId; override only for tests.
 * @returns {Promise<{ data: object|null, error: string|null }>}
 */
async function reserveSd(supabase, { targetSd, reservedForSession, reservedForTier, lanePattern, expiresAt, resolveCoordinatorId } = {}) {
  if (!targetSd) return { data: null, error: 'targetSd is required' };
  if (!expiresAt) return { data: null, error: 'expiresAt is required' };
  const coordinatorId = await resolveCoordinatorIdSafe(supabase, resolveCoordinatorId);
  if (!coordinatorId) {
    return { data: null, error: 'no live active coordinator resolved -- refusing to write an unenforceable reservation' };
  }
  const payload = buildCoordinatorReservationPayload({ reservedForSession, reservedForTier, lanePattern });
  try {
    const { data, error } = await supabase
      .from('session_coordination')
      .insert({
        sender_session: coordinatorId,
        sender_type: 'coordinator',
        target_session: null,
        target_sd: targetSd,
        message_type: 'INFO',
        subject: `[COORDINATOR_RESERVATION] ${targetSd}`,
        payload,
        expires_at: expiresAt,
      })
      .select('id, created_at')
      .single();
    if (error) return { data: null, error: error.message };
    return { data, error: null };
  } catch (e) {
    return { data: null, error: String((e && e.message) || e) };
  }
}

module.exports = { buildCoordinatorReservationPayload, reserveSd };
