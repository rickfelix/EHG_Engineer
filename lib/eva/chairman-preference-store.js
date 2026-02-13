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

import { createClient } from '@supabase/supabase-js';

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
  'notifications.timezone': (v) => {
    if (typeof v !== 'string') return 'must be a string';
    try { Intl.DateTimeFormat(undefined, { timeZone: v }); } catch { return 'must be a valid IANA timezone'; }
    return null;
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
    this.supabase = options.supabaseClient || createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
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
      const { data: ventureRow } = await this.supabase
        .from('chairman_preferences')
        .select('*')
        .eq('chairman_id', chairmanId)
        .eq('venture_id', ventureId)
        .eq('preference_key', key)
        .single();

      if (ventureRow) {
        return this._formatResult(ventureRow, 'venture');
      }
    }

    // Fall back to global
    const { data: globalRow } = await this.supabase
      .from('chairman_preferences')
      .select('*')
      .eq('chairman_id', chairmanId)
      .is('venture_id', null)
      .eq('preference_key', key)
      .single();

    if (globalRow) {
      return this._formatResult(globalRow, 'global');
    }

    return null;
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
        .in('preference_key', keys);

      if (ventureRows) {
        for (const row of ventureRows) {
          resolved.set(row.preference_key, this._formatResult(row, 'venture'));
        }
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
        .in('preference_key', remainingKeys);

      if (globalRows) {
        for (const row of globalRows) {
          resolved.set(row.preference_key, this._formatResult(row, 'global'));
        }
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
