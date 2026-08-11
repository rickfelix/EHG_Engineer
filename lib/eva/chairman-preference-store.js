/**
 * ChairmanPreferenceStore - CRUD and scoped resolution for chairman preferences
 *
 * SD-LEO-INFRA-CHAIRMAN-PREFS-001
 *
 * Resolution order:
 *   1. (chairman_id, venture_id, key) — venture-specific
 *   2. (chairman_id, null, key)       — global fallback
 *
 * Database table: chairman_preferences
 */


import { createSupabaseServiceClient } from '../supabase-client.js';
import { isValidCanonicalZone } from '../time/chairman-et-wall-clock.js';
const VALID_VALUE_TYPES = new Set(['number', 'string', 'boolean', 'object', 'array']);

const KNOWN_KEY_VALIDATORS = {
  'risk.max_drawdown_pct': (v) => {
    if (typeof v !== 'number') return 'must be a number';
    if (v < 0 || v > 100) return 'must be between 0 and 100';
    return null;
  },
  'budget.max_monthly_usd': (v) => {
    if (typeof v !== 'number') return 'must be a number';
    if (v < 0) return 'must be >= 0';
    return null;
  },
  'tech.stack_directive': (v) => {
    if (typeof v !== 'string') return 'must be a string';
    if (v.trim().length === 0) return 'must be non-empty';
    return null;
  },
  // Notification preference validators (SD-EVA-FEAT-NOTIFICATION-001)
  'notifications.email': (v) => {
    if (typeof v !== 'string') return 'must be a string';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'must be a valid email address';
    return null;
  },
  'notifications.immediate_enabled': (v) => {
    if (typeof v !== 'boolean') return 'must be a boolean';
    return null;
  },
  'notifications.daily_digest_enabled': (v) => {
    if (typeof v !== 'boolean') return 'must be a boolean';
    return null;
  },
  'notifications.weekly_summary_enabled': (v) => {
    if (typeof v !== 'boolean') return 'must be a boolean';
    return null;
  },
  'notifications.daily_send_time': (v) => {
    if (typeof v !== 'string') return 'must be a string';
    if (!/^\d{2}:\d{2}$/.test(v)) return 'must be in HH:MM format';
    const [h, m] = v.split(':').map(Number);
    if (h < 0 || h > 23 || m < 0 || m > 59) return 'must be a valid time';
    return null;
  },
  'notifications.weekly_send_day': (v) => {
    if (typeof v !== 'string') return 'must be a string';
    if (!['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].includes(v)) return 'must be a day abbreviation (MON-SUN)';
    return null;
  },
  'notifications.weekly_send_time': (v) => {
    if (typeof v !== 'string') return 'must be a string';
    if (!/^\d{2}:\d{2}$/.test(v)) return 'must be in HH:MM format';
    const [h, m] = v.split(':').map(Number);
    if (h < 0 || h > 23 || m < 0 || m > 59) return 'must be a valid time';
    return null;
  },
  // SD-LEO-INFRA-CHAIRMAN-QUIET-WINDOW-001 (FR-6): accepts EITHER a bare IANA string
  // (back-compat, no expiry) OR a composite {zone, until} object (chairman-location
  // preference with an expiry -- falls back to ET once `until` passes). Arrays are
  // rejected explicitly since typeof [] === 'object' would otherwise pass the object-shape
  // branch below. This is the only KNOWN_KEY_VALIDATORS entry with two accepted shapes;
  // it does not share a base/combinator with any other key (each entry here is an
  // independent closure), so this amendment cannot weaken any of the other keys.
  //
  // SEC-QW-02: uses the SAME isValidCanonicalZone the read-time resolver
  // (quiet-hours-extension.js's deriveChairmanZone) validates against, not a separate
  // bare-throw check. A bare `Intl.DateTimeFormat` construction does not throw for a
  // non-canonical legacy alias (e.g. 'Asia/Kolkata', which ICU canonicalizes backward to
  // 'Asia/Calcutta') -- that used to let a write SUCCEED for a zone the read path would
  // then silently reject, exactly the write-succeeds/read-disagrees defect class FR-1 was
  // built to eliminate.
  'notifications.timezone': (v) => {
    if (Array.isArray(v)) return 'must be a string or a {zone, until} object, not an array';
    if (typeof v === 'string') {
      if (!isValidCanonicalZone(v)) return 'must be a valid IANA timezone (canonical form)';
      return null;
    }
    if (v && typeof v === 'object') {
      if (typeof v.zone !== 'string') return 'composite form requires a string "zone" field';
      if (!isValidCanonicalZone(v.zone)) return '"zone" must be a valid IANA timezone (canonical form)';
      if (v.until !== undefined && (typeof v.until !== 'string' || !Number.isFinite(Date.parse(v.until)))) {
        return '"until" must be a valid ISO timestamp string when provided';
      }
      return null;
    }
    return 'must be a string (IANA timezone) or an object {zone, until}';
  },
  'notifications.quiet_hours_start': (v) => {
    if (v === null) return null;
    if (typeof v !== 'string') return 'must be a string or null';
    if (!/^\d{2}:\d{2}$/.test(v)) return 'must be in HH:MM format';
    return null;
  },
  'notifications.quiet_hours_end': (v) => {
    if (v === null) return null;
    if (typeof v !== 'string') return 'must be a string or null';
    if (!/^\d{2}:\d{2}$/.test(v)) return 'must be in HH:MM format';
    return null;
  },
  'notifications.immediate_rate_limit_per_hour': (v) => {
    if (typeof v !== 'number') return 'must be a number';
    if (!Number.isInteger(v) || v < 1 || v > 60) return 'must be an integer between 1 and 60';
    return null;
  },
  // QF-20260720-824: chairman-authorized SMS quiet-hours window extension (verbal
  // "keep texting me until <time>"). ISO timestamp; consumed by
  // lib/comms/adam-outbound/quiet-hours-extension.js. Not a recurring schedule change —
  // a one-off, explicit, chairman-set extension for the current window only.
  'notifications.quiet_hours_extended_until': (v) => {
    if (v === null) return null;
    if (typeof v !== 'string') return 'must be an ISO timestamp string or null';
    if (!Number.isFinite(Date.parse(v))) return 'must be a valid ISO timestamp';
    return null;
  },
};

function validateValueType(value, valueType) {
  switch (valueType) {
    case 'number': return typeof value === 'number';
    case 'string': return typeof value === 'string';
    case 'boolean': return typeof value === 'boolean';
    case 'object': return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'array': return Array.isArray(value);
    default: return false;
  }
}

export class ChairmanPreferenceStore {
  constructor(options = {}) {
    this.supabase = options.supabaseClient || createSupabaseServiceClient();
    this.logger = options.logger || console;
  }

  /**
   * Set (upsert) a preference.
   * @param {object} params
   * @param {string} params.chairmanId
   * @param {string|null} params.ventureId - null for global
   * @param {string} params.key
   * @param {*} params.value
   * @param {string} params.valueType
   * @param {string} [params.source='chairman_directive']
   * @returns {Promise<{success: boolean, record?: object, error?: string}>}
   */
  async setPreference({ chairmanId, ventureId = null, key, value, valueType, source = 'chairman_directive' }) {
    if (!VALID_VALUE_TYPES.has(valueType)) {
      return { success: false, error: `Invalid valueType '${valueType}'. Must be one of: ${[...VALID_VALUE_TYPES].join(', ')}` };
    }

    if (!validateValueType(value, valueType)) {
      return { success: false, error: `Value does not match declared valueType '${valueType}' for key '${key}'` };
    }

    // Run known-key validators
    const validator = KNOWN_KEY_VALIDATORS[key];
    if (validator) {
      const err = validator(value);
      if (err) {
        return { success: false, error: `Validation failed for '${key}': ${err}` };
      }
    }

    const { data, error } = await this.supabase
      .from('chairman_preferences')
      .upsert({
        chairman_id: chairmanId,
        venture_id: ventureId,
        preference_key: key,
        preference_value: value,
        value_type: valueType,
        source,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'chairman_id,venture_id,preference_key',
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: `Failed to set preference: ${error.message}` };
    }

    this.logger.debug?.('chairman_preference.upsert', {
      chairmanId, ventureId, key, valueType, source, recordId: data.id,
    });

    return { success: true, record: data };
  }

  /**
   * Get a single preference with scoped resolution.
   * Checks venture-specific first, then global fallback.
   * @param {object} params
   * @param {string} params.chairmanId
   * @param {string|null} params.ventureId
   * @param {string} params.key
   * @returns {Promise<object|null>}
   */
  async getPreference({ chairmanId, ventureId = null, key }) {
    // Try venture-specific first
    if (ventureId) {
      const { data: ventureRows } = await this.supabase
        .from('chairman_preferences')
        .select('*')
        .eq('chairman_id', chairmanId)
        .eq('venture_id', ventureId)
        .eq('preference_key', key)
        .order('updated_at', { ascending: false });

      if (Array.isArray(ventureRows) && ventureRows.length > 0) {
        this._warnIfMultiRow(ventureRows, { chairmanId, ventureId, key, scope: 'venture' });
        return this._formatResult(ventureRows[0], 'venture');
      }
    }

    // Fall back to global
    const { data: globalRows } = await this.supabase
      .from('chairman_preferences')
      .select('*')
      .eq('chairman_id', chairmanId)
      .is('venture_id', null)
      .eq('preference_key', key)
      .order('updated_at', { ascending: false });

    if (Array.isArray(globalRows) && globalRows.length > 0) {
      this._warnIfMultiRow(globalRows, { chairmanId, ventureId, key, scope: 'global' });
      return this._formatResult(globalRows[0], 'global');
    }

    return null;
  }

  /**
   * A scope that should hold at most one row (uq_chairman_pref_scope) returning more than one
   * means the constraint has been violated or a write raced past it -- log loudly rather than
   * silently picking a row, since a prior .single()-based read silently returned null for this
   * exact condition and hid a live production defect (chairman_preferences upsert bug, FR-1).
   */
  _warnIfMultiRow(rows, { chairmanId, ventureId, key, scope }) {
    if (rows.length <= 1) return;
    this.logger.error?.('chairman_preference.multi_row_scope_violation', {
      chairmanId, ventureId, key, scope, rowCount: rows.length,
    });
  }

  /**
   * SEC-QW-01 (SD-LEO-INFRA-CHAIRMAN-QUIET-WINDOW-001): getPreferences() batch-fetches rows
   * for MANY keys in one query, so a per-key duplicate can't be resolved by a single
   * .single()/[0] pick the way getPreference() does -- this is the getPreferences() sibling
   * of that same fix (previously missing; resolveQuietHoursContext reads through this exact
   * path). Rows arrive pre-ordered updated_at DESC (caller adds .order()), so the FIRST row
   * seen per key is deterministically the most recent.
   */
  _resolveBatchRows(rows, resolved, scope, { chairmanId, ventureId }) {
    const rowsByKey = new Map();
    for (const row of rows) {
      const key = row.preference_key;
      if (!rowsByKey.has(key)) rowsByKey.set(key, []);
      rowsByKey.get(key).push(row);
    }
    for (const [key, keyRows] of rowsByKey) {
      this._warnIfMultiRow(keyRows, { chairmanId, ventureId, key, scope });
      resolved.set(key, this._formatResult(keyRows[0], scope));
    }
  }

  /**
   * Batch-get preferences with scoped resolution.
   * At most 2 SQL queries regardless of key count.
   * @param {object} params
   * @param {string} params.chairmanId
   * @param {string|null} params.ventureId
   * @param {string[]} params.keys
   * @returns {Promise<Map<string, object>>}
   */
  async getPreferences({ chairmanId, ventureId = null, keys }) {
    const start = Date.now();
    const resolved = new Map();

    // Query 1: venture-specific (if ventureId provided)
    if (ventureId) {
      const { data: ventureRows } = await this.supabase
        .from('chairman_preferences')
        .select('*')
        .eq('chairman_id', chairmanId)
        .eq('venture_id', ventureId)
        .in('preference_key', keys)
        .order('updated_at', { ascending: false });

      if (ventureRows) {
        this._resolveBatchRows(ventureRows, resolved, 'venture', { chairmanId, ventureId });
      }
    }

    // Query 2: global fallback for remaining keys
    const remainingKeys = keys.filter(k => !resolved.has(k));
    if (remainingKeys.length > 0) {
      const { data: globalRows } = await this.supabase
        .from('chairman_preferences')
        .select('*')
        .eq('chairman_id', chairmanId)
        .is('venture_id', null)
        .in('preference_key', remainingKeys)
        .order('updated_at', { ascending: false });

      if (globalRows) {
        this._resolveBatchRows(globalRows, resolved, 'global', { chairmanId, ventureId });
      }
    }

    const durationMs = Date.now() - start;
    this.logger.debug?.('chairman_preference.resolve', {
      chairmanId, ventureId,
      requestedKeysCount: keys.length,
      resolvedCount: resolved.size,
      queryDurationMs: durationMs,
    });

    return resolved;
  }

  /**
   * Delete a preference.
   * @param {object} params
   * @param {string} params.chairmanId
   * @param {string|null} params.ventureId
   * @param {string} params.key
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async deletePreference({ chairmanId, ventureId = null, key }) {
    let query = this.supabase
      .from('chairman_preferences')
      .delete()
      .eq('chairman_id', chairmanId)
      .eq('preference_key', key);

    if (ventureId) {
      query = query.eq('venture_id', ventureId);
    } else {
      query = query.is('venture_id', null);
    }

    const { error } = await query;
    if (error) {
      return { success: false, error: `Failed to delete preference: ${error.message}` };
    }
    return { success: true };
  }

  /**
   * Link a decision to resolved preferences for audit trail.
   * @param {object} params
   * @param {string} params.decisionId - UUID of chairman_decisions row
   * @param {Map<string, object>} params.resolvedPreferences - from getPreferences
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async linkDecisionToPreferences({ decisionId, resolvedPreferences }) {
    // Take the first resolved preference for the primary linkage
    const entries = [...resolvedPreferences.entries()];
    if (entries.length === 0) {
      return { success: true }; // nothing to link
    }

    const [primaryKey, primaryPref] = entries[0];
    const snapshot = Object.fromEntries(
      entries.map(([k, v]) => [k, { value: v.value, scope: v.scope, valueType: v.valueType }])
    );

    const { error } = await this.supabase
      .from('chairman_decisions')
      .update({
        preference_key: primaryKey,
        preference_ref_id: primaryPref.id || null,
        preference_snapshot: snapshot,
      })
      .eq('id', decisionId);

    if (error) {
      return { success: false, error: `Failed to link decision: ${error.message}` };
    }
    return { success: true };
  }

  // --- Private helpers ---

  _formatResult(row, scope) {
    return {
      id: row.id,
      key: row.preference_key,
      value: row.preference_value,
      valueType: row.value_type,
      source: row.source,
      scope,
      updatedAt: row.updated_at,
    };
  }
}

/**
 * Create a ChairmanPreferenceStore with default configuration
 * @param {object} [options]
 * @returns {ChairmanPreferenceStore}
 */
export function createChairmanPreferenceStore(options = {}) {
  return new ChairmanPreferenceStore(options);
}

export default ChairmanPreferenceStore;
