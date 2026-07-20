// QF-20260720-406: per-account fleet capacity gauge. Chairman correction 2026-07-20 —
// the fleet rotates across THREE Max accounts (Deep Soul Sessions, Rick Felix 2000, Code
// Street Labs); a pooled/single-account capacity number is stale. "rationing is not the
// answer" (chairman) — cap pressure is an ALLOCATION problem (route to the account with
// headroom) not a scarcity problem, so this module exists to make that routing decision
// data-driven.
//
// Adam cannot read the usage meters programmatically (identity yes, quota no — see
// lib/fleet/account-identity.cjs) — the chairman's pasted /usage dashboard is the only
// meter feed. This module is the durable, PER-ACCOUNT store for those manually-supplied
// readings, keyed by accountUuid8 (never overwrites a different account's last reading —
// the pooled-number failure mode this QF fixes).
//
// No DB/schema change: additive-only JSON state file, matching the existing
// .account-identity-last.json / .coord-capacity-source-last.json convention.

'use strict';

const fs = require('fs');
const path = require('path');
const { getAccountIdentity } = require('./account-identity.cjs');

const DEFAULT_STORE_PATH = path.join(__dirname, '..', '..', '.fleet-account-capacity.json');

/** Read the per-account store. Missing/corrupt file -> {} (never throws). */
function loadStore(storePath = DEFAULT_STORE_PATH) {
  try {
    return JSON.parse(fs.readFileSync(storePath, 'utf8'));
  } catch {
    return {};
  }
}

function numOrNull(v) {
  return Number.isFinite(v) ? v : null;
}

/**
 * Record a chairman-pasted usage reading for the CURRENTLY ACTIVE account (or an
 * injected identity for tests). Read-merge-write: only the reading account's key
 * changes — every other account's last reading is preserved untouched.
 *
 * @param {{sessionPct?:number, sessionResetAt?:string, weeklyAllModelsPct?:number,
 *   weeklyFablePct?:number, weeklyResetAt?:string}} reading
 * @param {{identity?:object|null, storePath?:string, now?:string}} [opts]
 * @returns {{ok:boolean, error?:string, store?:object}}
 */
function recordCapacityReading(reading, opts = {}) {
  const identity = opts.identity !== undefined ? opts.identity : getAccountIdentity();
  if (!identity) return { ok: false, error: 'account_identity_unavailable' };

  const storePath = opts.storePath || DEFAULT_STORE_PATH;
  const store = loadStore(storePath);
  store[identity.accountUuid8] = {
    email: identity.email,
    orgName: identity.orgName,
    accountUuid8: identity.accountUuid8,
    sessionPct: numOrNull(reading.sessionPct),
    sessionResetAt: reading.sessionResetAt || null,
    weeklyAllModelsPct: numOrNull(reading.weeklyAllModelsPct),
    weeklyFablePct: numOrNull(reading.weeklyFablePct),
    weeklyResetAt: reading.weeklyResetAt || null,
    recordedAt: opts.now || new Date().toISOString(),
  };
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
  return { ok: true, store };
}

/**
 * The BINDING weekly constraint for an account: whichever of the two weekly meters
 * (all-models, Fable sub-cap) is higher — that is the one that will exhaust first.
 * Mirrors the "combined headroom across BOTH axes" doctrine (fleet-single-account
 * quota-planning rule) rather than averaging or picking one axis.
 */
function bindingWeeklyPct(entry) {
  const a = Number.isFinite(entry.weeklyAllModelsPct) ? entry.weeklyAllModelsPct : 0;
  const f = Number.isFinite(entry.weeklyFablePct) ? entry.weeklyFablePct : 0;
  return Math.max(a, f);
}

/**
 * Pure: rank every account in the store by headroom (100 - binding weekly %), most
 * headroom first. Unknown/never-recorded meters read as 0% used (max headroom) so an
 * account this fleet has never logged into does not silently rank last.
 * @param {object} store
 * @returns {Array<object>} entries + {headroomPct} sorted descending by headroom
 */
function rankAccountsByHeadroom(store) {
  return Object.values(store || {})
    .map((entry) => ({ ...entry, headroomPct: 100 - bindingWeeklyPct(entry) }))
    .sort((a, b) => b.headroomPct - a.headroomPct);
}

/** The single best-headroom account, or null if the store is empty. */
function bestHeadroomAccount(store) {
  const ranked = rankAccountsByHeadroom(store);
  return ranked.length > 0 ? ranked[0] : null;
}

module.exports = {
  DEFAULT_STORE_PATH,
  loadStore,
  recordCapacityReading,
  bindingWeeklyPct,
  rankAccountsByHeadroom,
  bestHeadroomAccount,
};
