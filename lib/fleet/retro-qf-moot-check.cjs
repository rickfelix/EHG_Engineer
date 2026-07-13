/* retro-qf-moot-check.cjs — claim-time moot-recheck for auto-promoted retro
 * action-item quick-fixes (SD-FDBK-FIX-RETRO-ACTION-ITEM-001 / FR-2).
 *
 * scripts/promote-retro-action-items.mjs stamps promoted QFs with a fixed
 * title prefix ('[Retro action items] '). This module, invoked from
 * worker-checkin.cjs's selfClaimQuickFix() BEFORE tryClaim(), extracts any
 * SD-KEY tokens explicitly named in that QF's description text and checks
 * their live status. A QF whose description names an already-completed or
 * -cancelled SD is treated as moot (the referenced work has already
 * happened, or is no longer relevant) -- caught here so a worker never
 * burns a claim cycle discovering "nothing to do" (the QF-20260713-800
 * pattern this SD closes).
 *
 * Contract:
 *   - FAIL-OPEN: any DB error, no SD-KEY match, or an in-progress referenced
 *     SD all resolve to "not moot" -- this check must never block a
 *     legitimate claim.
 *   - Only applies to QFs whose title matches the exact retro-promotion
 *     prefix; every other QF type is untouched.
 */

const RETRO_QF_TITLE_PREFIX = '[Retro action items] ';

// SD-KEY convention observed across this repo: SD-<SEGMENT>[-<SEGMENT>...]-<NNN>[-<suffix>]
// e.g. SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-A2, SD-FDBK-FIX-RETRO-ACTION-ITEM-001.
const SD_KEY_RE = /SD-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{3}(?:-[A-Z0-9]+)?/g;

const MOOT_STATUSES = new Set(['completed', 'cancelled']);

function isRetroPromotedQf(qf) {
  return typeof qf?.title === 'string' && qf.title.startsWith(RETRO_QF_TITLE_PREFIX);
}

/** Extract unique SD-KEY tokens from free text. Never throws. */
function extractSdKeys(text) {
  if (typeof text !== 'string' || !text) return [];
  const matches = text.match(SD_KEY_RE) || [];
  return Array.from(new Set(matches));
}

/**
 * Returns { moot: boolean, sdKey: string|null, status: string|null } for a
 * single QF row. Fail-open: any error resolves to { moot: false }.
 */
async function checkQfMoot(supabase, qf) {
  try {
    if (!isRetroPromotedQf(qf)) return { moot: false, sdKey: null, status: null };

    const sdKeys = extractSdKeys(qf.description || '');
    if (sdKeys.length === 0) return { moot: false, sdKey: null, status: null };

    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key, status')
      .in('sd_key', sdKeys);
    if (error || !Array.isArray(data)) return { moot: false, sdKey: null, status: null };

    const mootMatch = data.find((row) => MOOT_STATUSES.has(row.status));
    if (!mootMatch) return { moot: false, sdKey: null, status: null };

    return { moot: true, sdKey: mootMatch.sd_key, status: mootMatch.status };
  } catch {
    return { moot: false, sdKey: null, status: null };
  }
}

/**
 * Cancels a moot QF with a recorded reason. Fail-open: swallows any write
 * error (the caller already decided to skip claiming it either way).
 */
async function cancelMootQf(supabase, qfId, sdKey, status) {
  try {
    await supabase
      .from('quick_fixes')
      .update({
        status: 'cancelled',
        verification_notes: `Auto-cancelled: referenced ${sdKey} already ${status} -- moot before claim (SD-FDBK-FIX-RETRO-ACTION-ITEM-001).`,
      })
      .eq('id', qfId);
  } catch { /* fail-open */ }
}

module.exports = { RETRO_QF_TITLE_PREFIX, isRetroPromotedQf, extractSdKeys, checkQfMoot, cancelMootQf };
