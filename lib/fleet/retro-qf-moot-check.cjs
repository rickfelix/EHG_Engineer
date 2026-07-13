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

// promote-retro-action-items.mjs's description header always renders the retro's OWN
// parent SD as `retro.sd_id` (the strategic_directives_v2.id this retro's parent SD
// row): "...(SD ${retro.sd_id}).". Used to resolve and exclude that parent SD from
// moot-candidates -- see the comment on checkQfMoot below for why.
//
// NOTE: strategic_directives_v2.id is `character varying`, NOT uuid -- confirmed live
// (adversarial-review finding on PR #6076): ~26% of all SDs use a legacy non-UUID id
// (often equal to sd_key, but not always -- e.g. id='SD-GENESIS-FIX-001' has
// sd_key='GENESIS-FIX-001'). A UUID-only regex here silently skips the exclusion for
// every legacy-id SD, reproducing the self-referential auto-cancel bug this exclusion
// exists to prevent. Capture ANY token between "(SD " and ")" instead of constraining
// to UUID shape, and resolve it via `.eq('id', ...)` (never assume id === sd_key).
const PARENT_SD_REF_RE = /\(SD ([^)]+)\)/;

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

/** Extract the retro's own parent SD reference (id, UUID or legacy) from the
 * description header. Never throws. */
function extractParentSdRef(text) {
  if (typeof text !== 'string' || !text) return null;
  const m = text.match(PARENT_SD_REF_RE);
  if (!m) return null;
  const ref = m[1].trim();
  return ref && ref !== 'n/a' ? ref : null;
}

/**
 * Returns { moot: boolean, sdKey: string|null, status: string|null } for a
 * single QF row. Fail-open: any error resolves to { moot: false }.
 *
 * IMPORTANT: SD-keys naming the retro's OWN parent SD are excluded from the
 * moot-candidate set before the status lookup. lib/sub-agents/retro/action-items.js's
 * generateSmartActionItems() produces gap-closure action items that are
 * self-referential to the retro's own parent SD by construction ("Create PRD for
 * ${sdKey}", "Re-run blocking sub-agents for ${sdKey} until PASS verdict", "Fix
 * failing tests ... for ${sdKey}") -- that parent SD is virtually guaranteed to
 * already be 'completed' by the time any worker evaluates the promoted QF (that is
 * WHY the retro, and the gap-closure item, exist in the first place). Treating "own
 * parent SD completed" as a staleness signal would auto-cancel exactly the class of
 * concrete, owner-assigned items FR-1 was built to preserve, the moment any worker
 * looked at them. Only a DIFFERENT SD referenced inside the action-item text (the
 * QF-20260713-800 pattern this check exists for) is a genuine staleness signal.
 *
 * If a parent reference IS present in the description but its lookup errors, this
 * fails toward "not moot" for the WHOLE check (not just an unfiltered fallthrough) --
 * we cannot safely tell self-reference from real reference without it, and falling
 * through unfiltered on error would silently reproduce the very bug this exclusion
 * exists to prevent.
 */
async function checkQfMoot(supabase, qf) {
  try {
    if (!isRetroPromotedQf(qf)) return { moot: false, sdKey: null, status: null };

    const description = qf.description || '';
    const sdKeys = extractSdKeys(description);
    if (sdKeys.length === 0) return { moot: false, sdKey: null, status: null };

    let candidateKeys = sdKeys;
    const parentRef = extractParentSdRef(description);
    if (parentRef) {
      const { data: parentRow, error: parentError } = await supabase
        .from('strategic_directives_v2')
        .select('sd_key')
        .eq('id', parentRef)
        .maybeSingle();
      if (parentError) return { moot: false, sdKey: null, status: null };
      if (parentRow?.sd_key) {
        candidateKeys = sdKeys.filter((k) => k !== parentRow.sd_key);
      }
    }
    if (candidateKeys.length === 0) return { moot: false, sdKey: null, status: null };

    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key, status')
      .in('sd_key', candidateKeys);
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
 *
 * Guarded on status='open': selfClaimQuickFix() only evaluates status='open' rows,
 * and a successful claim_sd RPC flips status to 'in_progress'. Without this guard, a
 * worker whose checkQfMoot resolved moot=true could race another worker's concurrent
 * claim_sd call and blindly overwrite an already-claimed row back to 'cancelled',
 * leaving claiming_session_id pointed at a worker that believes it holds a live claim
 * on a QF now marked cancelled. With the guard, a losing race is a silent no-op
 * (0 rows matched) instead of a corrupted cancelled-but-claimed state.
 */
async function cancelMootQf(supabase, qfId, sdKey, status) {
  try {
    await supabase
      .from('quick_fixes')
      .update({
        status: 'cancelled',
        verification_notes: `Auto-cancelled: referenced ${sdKey} already ${status} -- moot before claim (SD-FDBK-FIX-RETRO-ACTION-ITEM-001).`,
      })
      .eq('id', qfId)
      .eq('status', 'open');
  } catch { /* fail-open */ }
}

module.exports = { RETRO_QF_TITLE_PREFIX, isRetroPromotedQf, extractSdKeys, extractParentSdRef, checkQfMoot, cancelMootQf };
