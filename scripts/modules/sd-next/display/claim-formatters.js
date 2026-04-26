/**
 * Claim formatters for fleet roster display
 * SD-LEO-INFRA-FLEET-DASHBOARD-VISIBILITY-001
 *
 * Both the ACTIVE SESSIONS table (sd-next) and the Fleet Roster (sd-start.js
 * claim-conflict path) read v_active_sessions and need to display:
 * - SD-only claims    → sd_key/sd_title set, qf_id null
 * - QF-only claims    → qf_id/qf_title set (via quick_fixes.claiming_session_id), sd_key null
 * - Idle              → both null
 * - Defensive both    → render both rather than silently de-duplicating
 *
 * Two formatters are exposed because the two call sites have different cell
 * shapes (table column vs. roster line). They share the same dispatch logic.
 */

import { colors } from '../colors.js';

/**
 * Format the "Claimed Work" cell for a tabular ACTIVE SESSIONS row.
 * Plain string, no colors — caller pads + colors as needed.
 *
 * @param {Object} s - Session row from v_active_sessions (sd_id, qf_id, etc.)
 * @returns {string} Cell content (unpadded, no ANSI escapes).
 */
export function formatClaimedWork(s) {
  if (s.sd_id && s.qf_id) {
    return `${s.sd_id} +${s.qf_id}`;
  }
  if (s.sd_id) return s.sd_id;
  if (s.qf_id) return `[QF] ${s.qf_id}`;
  return 'None';
}

/**
 * Format the claim segment for a Fleet Roster line (sd-start.js).
 * Returns a colored string ready for direct console.log.
 *
 * @param {Object} s - Session row from v_active_sessions
 * @returns {string} Display string with colors applied.
 */
export function formatRosterClaim(s) {
  if (s.sd_key && s.qf_id) {
    return `→ ${s.sd_title || s.sd_key} ${colors.dim}+${colors.reset}${colors.cyan}[QF] ${s.qf_title || s.qf_id}${colors.reset}`;
  }
  if (s.sd_key) {
    return `→ ${s.sd_title || s.sd_key}`;
  }
  if (s.qf_id) {
    return `${colors.cyan}→ [QF] ${s.qf_title || s.qf_id}${colors.reset}`;
  }
  return `${colors.dim}(idle)${colors.reset}`;
}
