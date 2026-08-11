/**
 * Chairman quiet-hours window-extension check — QF-20260720-824.
 *
 * rubric-engine/lint.js already accepts context.allowQuietHours as a pure override input
 * (never modified here); this supplies it from a durable, chairman-authorized source: a
 * chairman_preferences row Adam sets ONLY on the chairman's explicit verbal authorization
 * ("keep texting me until <time>"). Fail-safe throughout: any read error, missing,
 * malformed, or expired value returns false — the standard 22:00-06:00 ET window applies
 * by default. This never weakens the default; only a valid recorded chairman
 * authorization can extend it.
 *
 * SD-LEO-INFRA-CHAIRMAN-QUIET-WINDOW-001 (FR-2): also resolves the chairman's LOCATION
 * timezone (notifications.timezone), reusing this file's already-wired
 * ChairmanPreferenceStore instance rather than adding a parallel resolver + DB round-trip.
 * resolveQuietHoursContext batches BOTH preference keys in a single getPreferences() call
 * for the hot chairman-SMS send path; resolveAllowQuietHours and resolveChairmanZone remain
 * available standalone (each does its own single-key read) for callers that only need one.
 */
import { ChairmanPreferenceStore } from '../../eva/chairman-preference-store.js';
import { isValidCanonicalZone } from '../../time/chairman-et-wall-clock.js';

export const CHAIRMAN_ID = 'ehg_chairman';
export const EXTEND_KEY = 'notifications.quiet_hours_extended_until';
export const ZONE_KEY = 'notifications.timezone';
export const DEFAULT_ZONE = 'America/New_York';

/** Pure decision logic shared by resolveAllowQuietHours and resolveQuietHoursContext. */
function deriveAllowQuietHours(now, pref) {
  if (!pref || typeof pref.value !== 'string') return false;
  const extendedUntil = Date.parse(pref.value);
  if (!Number.isFinite(extendedUntil)) return false;
  return now.getTime() < extendedUntil;
}

/** Accepts either a bare IANA string, or the composite {zone, until} expiry shape. */
function extractZoneAndExpiry(rawValue) {
  if (typeof rawValue === 'string') return { zone: rawValue, until: null };
  if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) && typeof rawValue.zone === 'string') {
    return { zone: rawValue.zone, until: typeof rawValue.until === 'string' ? rawValue.until : null };
  }
  return null;
}

/**
 * Pure decision logic shared by resolveChairmanZone and resolveQuietHoursContext.
 * NEVER throws. Returns { zone, source } where source distinguishes:
 *   'default'            -- key unset (by design)
 *   'chairman_preference' -- valid, currently in force
 *   'invalid_fallback'    -- present but malformed, non-canonical, or expired (a REGRESSION,
 *                            not a normal state -- distinguishable from 'default' on purpose,
 *                            since a prior bare fail-safe silently indistinguishable from
 *                            unset is what let the chairman_preferences upsert bug (FR-1) hide)
 * @param {Date} now
 * @param {{value: *}|null} pref
 * @returns {{zone: string, source: 'default'|'chairman_preference'|'invalid_fallback'}}
 */
export function deriveChairmanZone(now, pref) {
  if (!pref) return { zone: DEFAULT_ZONE, source: 'default' };
  const extracted = extractZoneAndExpiry(pref.value);
  if (!extracted || !isValidCanonicalZone(extracted.zone)) {
    return { zone: DEFAULT_ZONE, source: 'invalid_fallback' };
  }
  if (extracted.until) {
    const untilMs = Date.parse(extracted.until);
    if (!Number.isFinite(untilMs) || now.getTime() >= untilMs) {
      return { zone: DEFAULT_ZONE, source: 'invalid_fallback' };
    }
  }
  return { zone: extracted.zone, source: 'chairman_preference' };
}

/**
 * @param {Date} now
 * @param {object} [opts] - { store? } injectable ChairmanPreferenceStore for tests
 * @returns {Promise<boolean>}
 */
export async function resolveAllowQuietHours(now, opts = {}) {
  try {
    const store = opts.store || new ChairmanPreferenceStore();
    const pref = await store.getPreference({ chairmanId: CHAIRMAN_ID, key: EXTEND_KEY });
    return deriveAllowQuietHours(now, pref);
  } catch {
    return false;
  }
}

/**
 * SEC-QW-03: source:'invalid_fallback' is a REGRESSION signal (a stored zone value was
 * written but is rejected at read -- malformed, non-canonical, or expired) -- distinct from
 * the normal 'default' (never-configured) case. Before this it was computed and returned but
 * never observed by any caller, which is what let a write/read validation mismatch
 * (SEC-QW-02) go undetected. Every resolver below logs it.
 */
function warnIfInvalidFallback(logger, source, zone, caller) {
  if (source !== 'invalid_fallback') return;
  logger.warn?.('chairman_zone.invalid_fallback', { zone, caller });
}

/**
 * Standalone chairman-zone resolution (single-key read). Prefer resolveQuietHoursContext at
 * call sites that also need resolveAllowQuietHours, to avoid a second DB round-trip.
 * NEVER throws -- any error, missing key, or invalid value returns the ET default.
 * @param {Date} now
 * @param {object} [opts] - { store?, logger? } injectable for tests; logger defaults to console
 * @returns {Promise<{zone: string, source: 'default'|'chairman_preference'|'invalid_fallback'}>}
 */
export async function resolveChairmanZone(now, opts = {}) {
  const logger = opts.logger || console;
  let result;
  try {
    const store = opts.store || new ChairmanPreferenceStore();
    const pref = await store.getPreference({ chairmanId: CHAIRMAN_ID, key: ZONE_KEY });
    result = deriveChairmanZone(now, pref);
  } catch {
    result = { zone: DEFAULT_ZONE, source: 'invalid_fallback' };
  }
  warnIfInvalidFallback(logger, result.source, result.zone, 'resolveChairmanZone');
  return result;
}

/**
 * Batched resolution of BOTH chairman-comms preferences (the quiet-hours extension override
 * and the location zone) in a SINGLE getPreferences() call -- the hot chairman-SMS send path
 * (chairman-sms-gate/index.js, decision-scheduler/index.js) needs both and must not double
 * the round-trip count by calling resolveAllowQuietHours and resolveChairmanZone separately.
 * @param {Date} now
 * @param {object} [opts] - { store?, logger? } injectable for tests; logger defaults to console
 * @returns {Promise<{allowQuietHours: boolean, chairmanZone: string, chairmanZoneSource: string}>}
 */
export async function resolveQuietHoursContext(now, opts = {}) {
  const logger = opts.logger || console;
  let result;
  try {
    const store = opts.store || new ChairmanPreferenceStore();
    const prefs = await store.getPreferences({ chairmanId: CHAIRMAN_ID, keys: [EXTEND_KEY, ZONE_KEY] });
    const allowQuietHours = deriveAllowQuietHours(now, prefs.get(EXTEND_KEY) || null);
    const { zone, source } = deriveChairmanZone(now, prefs.get(ZONE_KEY) || null);
    result = { allowQuietHours, chairmanZone: zone, chairmanZoneSource: source };
  } catch {
    result = { allowQuietHours: false, chairmanZone: DEFAULT_ZONE, chairmanZoneSource: 'invalid_fallback' };
  }
  warnIfInvalidFallback(logger, result.chairmanZoneSource, result.chairmanZone, 'resolveQuietHoursContext');
  return result;
}
