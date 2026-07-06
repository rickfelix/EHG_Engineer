/**
 * qf-target-application.js — QF-20260706-648
 *
 * Rider 3 (2026-07-06) opened quick_fixes.target_application to every ACTIVE
 * applications-registry row (trigger fn_quick_fixes_validate_target_application),
 * not just EHG/EHG_Engineer. scripts/create-quick-fix.js still assumed a two-platform
 * world at filing time. These helpers close that gap:
 *   - validateTargetApplication mirrors the DB trigger's exact matching rule, so a
 *     bad --target-application fails fast at the CLI instead of surfacing as a raw
 *     Postgres constraint error.
 *   - detectMisdesignation catches the silent case: a title/description that names
 *     an active VENTURE differing from the resolved (often cwd-inferred) target,
 *     which would otherwise file against the wrong repo unnoticed.
 */

/**
 * Fetch the active applications registry (name + normalized_name).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<Array<{name: string, normalized_name: string}>>}
 */
export async function loadActiveApplications(supabase) {
  const { data, error } = await supabase.from('applications').select('name, normalized_name').eq('status', 'active');
  if (error) throw new Error(`loadActiveApplications: ${error.message}`);
  return data || [];
}

/**
 * Mirrors fn_quick_fixes_validate_target_application exactly: a value is valid
 * when it equals an active app's `name` (case-sensitive) OR lower(value) equals
 * that app's `normalized_name`. Keeping this byte-identical to the trigger means a
 * value that passes here can never be rejected by the DB, and vice versa.
 * @param {string} value
 * @param {Array<{name: string, normalized_name: string}>} activeApps
 * @returns {{valid: boolean, allowedNames: string[]}}
 */
export function validateTargetApplication(value, activeApps) {
  const allowedNames = activeApps.map((a) => a.name);
  const lowerValue = String(value || '').toLowerCase();
  const valid = activeApps.some((a) => a.name === value || a.normalized_name === lowerValue);
  return { valid, allowedNames };
}

/** Platform repos are never subject to the mis-designation heuristic below — only
 *  ventures, since "EHG"/"EHG_Engineer" are common incidental words in QF prose. */
const PLATFORM_NAMES = new Set(['EHG', 'EHG_Engineer']);

/**
 * Does this QF's title/description reference an active VENTURE (non-platform)
 * registry name that differs from the resolved target? Case-insensitive whole-name
 * substring match against the combined text.
 * @param {string} text - title + description (or any combined free text)
 * @param {string} resolvedTarget - the target_application about to be filed
 * @param {Array<{name: string, normalized_name: string}>} activeApps
 * @returns {string|null} the mismatched app name, or null when none found
 */
export function detectMisdesignation(text, resolvedTarget, activeApps) {
  const haystack = String(text || '').toLowerCase();
  for (const app of activeApps) {
    if (PLATFORM_NAMES.has(app.name)) continue;
    if (app.name === resolvedTarget) continue;
    if (haystack.includes(app.name.toLowerCase())) return app.name;
  }
  return null;
}
