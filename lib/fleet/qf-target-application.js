// QF-20260706-648: quick_fixes.target_application now accepts any active
// applications-registry row, not just EHG/EHG_Engineer — these helpers keep filing
// in sync with that.

/** Active applications registry (name + normalized_name). */
export async function loadActiveApplications(supabase) {
  const { data, error } = await supabase.from('applications').select('name, normalized_name').eq('status', 'active');
  if (error) throw new Error(`loadActiveApplications: ${error.message}`);
  return data || [];
}

// Mirrors fn_quick_fixes_validate_target_application exactly (name match OR
// lower(value) === normalized_name) so a value accepted here can never be
// rejected by the DB trigger, and vice versa.
export function validateTargetApplication(value, activeApps) {
  const allowedNames = activeApps.map((a) => a.name);
  const lowerValue = String(value || '').toLowerCase();
  const valid = activeApps.some((a) => a.name === value || a.normalized_name === lowerValue);
  return { valid, allowedNames };
}

// Platform names are excluded: they're common incidental words in QF prose and
// would false-positive on nearly every platform-targeted QF.
const PLATFORM_NAMES = new Set(['EHG', 'EHG_Engineer']);

/** Does title/description name an active venture that differs from the resolved
 *  (often cwd-inferred) target? Returns the mismatched app name, or null. */
export function detectMisdesignation(text, resolvedTarget, activeApps) {
  const haystack = String(text || '').toLowerCase();
  for (const app of activeApps) {
    if (PLATFORM_NAMES.has(app.name) || app.name === resolvedTarget) continue;
    if (haystack.includes(app.name.toLowerCase())) return app.name;
  }
  return null;
}
