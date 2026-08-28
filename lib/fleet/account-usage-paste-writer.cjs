// SD-LEO-INFRA-USAGE-PASTE-LEDGER-001 (FR-1): sole canonical writer for account_usage_pastes.
//
// Resolves the active account via lib/fleet/account-identity.cjs getAccountIdentity() so a
// paste is ALWAYS attributed to whichever account is actually logged in at paste time (FR-5
// per-account isolation) -- there is no secondary account-selection argument that could diverge
// from the live identity.
//
// Additive to, not a replacement for, lib/fleet/account-capacity-gauge.cjs's recordCapacityReading
// (which keeps serving its own headroom-routing consumers unchanged -- see scripts/record-account-capacity.mjs).

'use strict';

const { getAccountIdentity } = require('./account-identity.cjs');

const TABLE = 'account_usage_pastes';
const MAX_PROMO_NOTE_LENGTH = 280;

/** Strip C0/C1 control + ANSI escape bytes and clamp length (mirrors account-identity.cjs's
 *  sanitizeField -- promo_note is chairman-pasted free text, so the same log/render-forgery
 *  guard applies here). */
function sanitizePromoNote(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  // eslint-disable-next-line no-control-regex
  const stripped = value.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
  return stripped.slice(0, MAX_PROMO_NOTE_LENGTH) || null;
}

function numOrNull(v) {
  return Number.isFinite(v) ? v : null;
}

function isoOrNull(v) {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/**
 * Insert one row for the currently active account (or an injected identity for tests), then
 * read it back to confirm persistence before reporting success (SC-1's readback-verified
 * requirement).
 *
 * @param {{sessionPct?:number, sessionResetAt?:string, weekAllModelsPct?:number,
 *   weekFablePct?:number, weekResetAt?:string, promoNote?:string, pastedAt?:string}} reading
 * @param {{supabase:object, identity?:object|null}} opts
 * @returns {Promise<{ok:boolean, error?:string, row?:object}>}
 */
async function recordUsagePaste(reading, opts = {}) {
  if (!opts.supabase) return { ok: false, error: 'supabase_client_required' };
  const identity = opts.identity !== undefined ? opts.identity : getAccountIdentity();
  if (!identity) return { ok: false, error: 'account_identity_unavailable' };

  const pastedAt = isoOrNull(reading.pastedAt) || new Date().toISOString();

  const row = {
    account_uuid8: identity.accountUuid8,
    account_org_name: identity.orgName || null,
    pasted_at: pastedAt,
    session_pct: numOrNull(reading.sessionPct),
    week_all_models_pct: numOrNull(reading.weekAllModelsPct),
    week_fable_pct: numOrNull(reading.weekFablePct),
    session_reset_at: isoOrNull(reading.sessionResetAt),
    week_reset_at: isoOrNull(reading.weekResetAt),
    promo_note: sanitizePromoNote(reading.promoNote),
  };

  const { data: inserted, error: insErr } = await opts.supabase
    .from(TABLE)
    .insert(row)
    .select('id, account_uuid8, pasted_at, session_pct, week_all_models_pct, week_fable_pct, session_reset_at, week_reset_at, promo_note')
    .single();
  if (insErr) return { ok: false, error: `insert_failed: ${insErr.message}` };

  // Readback: an insert's success return is not persistence -- confirm the stored row matches
  // what was written before this function reports success (TS-12).
  const { data: readback, error: readErr } = await opts.supabase
    .from(TABLE)
    .select('id, account_uuid8, pasted_at')
    .eq('id', inserted.id)
    .single();
  if (readErr || !readback || readback.account_uuid8 !== row.account_uuid8 || readback.pasted_at !== row.pasted_at) {
    return { ok: false, error: `readback_mismatch: ${readErr ? readErr.message : 'row not found or values diverged'}` };
  }

  return { ok: true, row: inserted };
}

module.exports = { recordUsagePaste, sanitizePromoNote, TABLE, MAX_PROMO_NOTE_LENGTH };
