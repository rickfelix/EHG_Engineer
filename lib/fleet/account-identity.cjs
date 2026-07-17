// SD-LEO-INFRA-FLEET-ACCOUNT-IDENTITY-001 (FR-1/FR-3): the fleet has no awareness of which
// Claude Code account it runs under. This module reads the on-disk ~/.claude.json config's
// top-level oauthAccount object and returns ONLY a whitelisted 3-field identity — never the
// full config (which has ~87 top-level keys, some credential-adjacent) and never any other
// oauthAccount sub-field (billingType/seatTier/userRateLimitTier/etc — confirmed on-disk shape
// has ~16 non-identity fields alongside the 3 this module surfaces).
//
// getAccountIdentity(source) accepts an OPTIONAL injection seam so unit tests never touch the
// real logged-in account's file: `source` may be a plain object (already-parsed config) or a
// string file path to read+parse instead of the real config. Omitting it reads the real config.
//
// Fail-safe throughout: a missing file, a JSON parse error, a missing/malformed oauthAccount,
// or oauthAccount missing any of the 3 required sub-fields all resolve to `null` — this
// function NEVER throws.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/** Resolve the real ~/.claude.json path (Windows-first, os.homedir() fallback). */
function resolveRealConfigPath() {
  const base = process.env.USERPROFILE || os.homedir();
  return path.join(base, '.claude.json');
}

/**
 * Load the config object for a given `source` (see getAccountIdentity doc above).
 * Throws on any read/parse failure — callers must catch.
 */
function loadConfigObject(source) {
  if (source && typeof source === 'object') return source;
  const filePath = typeof source === 'string' ? source : resolveRealConfigPath();
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

/** Max length applied to each whitelisted field after sanitization. */
const MAX_FIELD_LENGTH = 256;

/**
 * Sanitize a whitelisted string field before it is ever returned/logged: strips ALL C0 AND C1
 * control characters (0x00-0x1F, 0x7F-0x9F — covers newlines, carriage returns, DEL, and both
 * 7-bit ESC-introduced (0x1B) and 8-bit (0x80-0x9F, incl. CSI 0x9B) ANSI/terminal escape
 * sequences) and clamps length. This guards downstream template-literal log lines (e.g.
 * `acct=${acctLabel}`) against log-line forgery/injection or terminal escape sequences if the
 * on-disk ~/.claude.json is ever tampered with or an OAuth response field is attacker-influenced.
 * @param {string} value
 * @returns {string}
 */
function sanitizeField(value) {
  // eslint-disable-next-line no-control-regex
  const stripped = value.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
  return stripped.slice(0, MAX_FIELD_LENGTH);
}

/**
 * @param {object|string} [source] optional injection seam — a parsed config object, a file
 *   path string, or omitted to read the real ~/.claude.json.
 * @returns {{email:string, orgName:string, accountUuid8:string}|null} EXACTLY these 3 keys,
 *   nothing else, ever — or null on any failure/malformed shape.
 */
function getAccountIdentity(source) {
  try {
    const config = loadConfigObject(source);
    const oauthAccount = config && config.oauthAccount;
    if (!oauthAccount || typeof oauthAccount !== 'object') return null;

    const { emailAddress, organizationName, accountUuid } = oauthAccount;
    if (
      typeof emailAddress !== 'string' || emailAddress.length === 0 ||
      typeof organizationName !== 'string' || organizationName.length === 0 ||
      typeof accountUuid !== 'string' || accountUuid.length === 0
    ) {
      return null;
    }

    const email = sanitizeField(emailAddress);
    const orgName = sanitizeField(organizationName);
    const accountUuid8 = sanitizeField(accountUuid).slice(0, 8);
    if (email.length === 0 || orgName.length === 0 || accountUuid8.length === 0) {
      return null;
    }

    return { email, orgName, accountUuid8 };
  } catch {
    return null;
  }
}

/**
 * FR-3: pure switch detector. Compares a prior persisted identity (or null on cold start) to
 * the current tick's identity and decides whether a genuine ACCOUNT_SWITCH occurred.
 *
 * Cold-start rule (CRITICAL): when `prior` is null (no persisted state yet — first tick after
 * deploy/restart, or the state file was unreadable), this ALWAYS returns changed:false — the
 * caller is expected to silently persist `current` as the new baseline without emitting an
 * event. A switch only fires when a PRIOR state EXISTED and differs from `current`.
 *
 * @param {{email:string,orgName:string,accountUuid8:string}|null} prior
 * @param {{email:string,orgName:string,accountUuid8:string}|null} current
 * @returns {{changed:boolean, event:object|null}}
 */
function detectAccountSwitch(prior, current) {
  if (!prior || !current) return { changed: false, event: null };
  const changed =
    prior.email !== current.email ||
    prior.orgName !== current.orgName ||
    prior.accountUuid8 !== current.accountUuid8;
  if (!changed) return { changed: false, event: null };
  return {
    changed: true,
    event: {
      type: 'ACCOUNT_SWITCH',
      from: { email: prior.email, orgName: prior.orgName, accountUuid8: prior.accountUuid8 },
      to: { email: current.email, orgName: current.orgName, accountUuid8: current.accountUuid8 },
    },
  };
}

module.exports = { getAccountIdentity, detectAccountSwitch };
