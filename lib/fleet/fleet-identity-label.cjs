/**
 * FLEET-IDENTITY LABEL EXTRACTION — SD-LEO-INFRA-PERMISSION-FREEZE-STUCK-001, EXEC-phase TESTING
 * fix (D1, non-prospective review).
 *
 * FIELD TYPE, NOT JUST FIELD NAME. PLAN-phase review already corrected the field NAME
 * (terminal_identity/callsign -> window_handle/fleet_identity, present on 0/9 vs 6/9 live rows).
 * A 40-row live census done at EXEC-phase review found the field name was right but the ASSUMED
 * TYPE was wrong: claude_sessions.metadata.fleet_identity is an OBJECT on 28/28 non-null rows --
 * {role, color, callsign, assigned_at, accountUuid8, display_name} -- never a bare string.
 * Interpolating it raw (`${fleet_identity}`) renders the literal text "[object Object]" in both
 * fleet-health.cjs's citation and stuck-seat-keystroke-packet.cjs's renderer. Both fixtures used
 * hand-typed strings ('Alpha', 'Echo', ...), so the wrong-type defect stayed green through review.
 *
 * PURE. No I/O.
 */

'use strict';

/**
 * @param {*} fleetIdentity - session.metadata.fleet_identity, real shape unknown to the caller.
 * @returns {string|null} a human-readable label, or null if none can be extracted.
 */
function extractFleetIdentityLabel(fleetIdentity) {
  if (!fleetIdentity) return null;
  if (typeof fleetIdentity === 'string') return fleetIdentity || null;
  if (typeof fleetIdentity === 'object') {
    return fleetIdentity.callsign || fleetIdentity.display_name || null;
  }
  return null;
}

module.exports = { extractFleetIdentityLabel };
