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
 */
import { ChairmanPreferenceStore } from '../../eva/chairman-preference-store.js';

export const CHAIRMAN_ID = 'ehg_chairman';
export const EXTEND_KEY = 'notifications.quiet_hours_extended_until';

/**
 * @param {Date} now
 * @param {object} [opts] - { store? } injectable ChairmanPreferenceStore for tests
 * @returns {Promise<boolean>}
 */
export async function resolveAllowQuietHours(now, opts = {}) {
  try {
    const store = opts.store || new ChairmanPreferenceStore();
    const pref = await store.getPreference({ chairmanId: CHAIRMAN_ID, key: EXTEND_KEY });
    if (!pref || typeof pref.value !== 'string') return false;
    const extendedUntil = Date.parse(pref.value);
    if (!Number.isFinite(extendedUntil)) return false;
    return now.getTime() < extendedUntil;
  } catch {
    return false;
  }
}
