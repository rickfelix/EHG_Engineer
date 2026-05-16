// SD-WRITERCONSUMER-ASYMMETRY-DETECTION-SCOPECOMPLETION-ORCH-001-0 / FR-C0-9
// Helper for INSERT-only sidecar audit on app_config kill-switch toggles.
// Writes a row to app_config_kill_switch_changes on every toggle.

export async function writeKillSwitchAuditRow(supabase, { key, old_value, new_value, changed_by, source, metadata }) {
  if (!supabase || typeof supabase.from !== 'function') {
    throw new TypeError('supabase client required');
  }
  if (!key) throw new Error('key required');
  if (new_value === undefined || new_value === null) throw new Error('new_value required');

  const row = {
    key,
    old_value: old_value ?? null,
    new_value,
    changed_by: changed_by ?? null,
    source: source ?? 'lineage-backfill-writer',
    metadata: metadata ?? {},
  };

  const { data, error } = await supabase
    .from('app_config_kill_switch_changes')
    .insert(row)
    .select('id, changed_at')
    .single();

  if (error) throw error;
  return data;
}
