/**
 * ARMED registration — SD-LEO-INFRA-DEFINITION-DONE-ACTIVATION-001 (G3, FR-4).
 *
 * A machinery-class SD/QF whose real events cannot occur yet (e.g. the feature ships
 * ahead of its producer) satisfies the amended Definition-of-Done via the ARMED shape:
 * a named activation trigger + a registered liveness watch, instead of real-event
 * evidence. Reuses the EXISTING periodic_process_registry table/watcher family
 * (SD-LEO-INFRA-PERIODIC-PROCESS-LIVENESS-001) — no new table, no schema change.
 *
 * process_type='standalone_cron' + liveness_source='self_stamped' mirrors the SAME
 * pattern periodic-liveness-watcher.mjs already uses for its own self-registration row
 * (scripts/periodic-liveness-watcher.mjs ~line 190). last_fired_at is left NULL at
 * registration time — that IS the ARMED signature (registered, not yet fired); once the
 * trigger genuinely fires, the owning process stamps last_fired_at via the existing
 * lib/periodic-liveness/stamp-last-fired.js path, at which point this SD's machinery
 * has effectively transitioned from ARMED to (retroactively) ACTIVATED.
 */

/** Default re-check cadence when the caller does not know a natural one (1 day). */
const DEFAULT_EXPECTED_INTERVAL_SECONDS = 86400;

/**
 * Derive a stable, unique process_key for an SD/QF's ARMED registration.
 * @param {string} sdKey
 * @returns {string}
 */
export function armedProcessKey(sdKey) {
  const slug = String(sdKey || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `g3-armed-${slug}`;
}

/**
 * Upsert an ARMED periodic_process_registry row for a machinery-class SD/QF.
 * @param {object} supabase - service-role client
 * @param {object} sd - must carry sd_key
 * @param {{ activationTrigger: string, expectedIntervalSeconds?: number, owner?: string }} opts
 *   activationTrigger is REQUIRED — the ARMED shape's contract is a NAMED trigger, not a
 *   bare "will fire someday" declaration.
 * @returns {Promise<{ ok: boolean, processKey?: string, error?: string }>}
 */
export async function registerArmedMachinery(supabase, sd, opts = {}) {
  const sdKey = sd?.sd_key || sd?.id;
  if (!sdKey) return { ok: false, error: 'missing_sd_key' };
  if (!opts.activationTrigger || typeof opts.activationTrigger !== 'string' || !opts.activationTrigger.trim()) {
    return { ok: false, error: 'missing_activation_trigger' };
  }
  const processKey = armedProcessKey(sdKey);
  try {
    const { error } = await supabase.from('periodic_process_registry').upsert({
      process_key: processKey,
      display_name: `G3 ARMED: ${sdKey}`,
      owner: opts.owner || 'g3-activation',
      process_type: 'standalone_cron',
      expected_interval_seconds: Number.isFinite(opts.expectedIntervalSeconds) && opts.expectedIntervalSeconds > 0
        ? opts.expectedIntervalSeconds : DEFAULT_EXPECTED_INTERVAL_SECONDS,
      liveness_source: 'self_stamped',
      liveness_source_ref: { sd_key: sdKey, activation_trigger: opts.activationTrigger.trim() },
      session_bound: false,
      currently_expected_active: true,
      last_fired_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'process_key' });
    if (error) return { ok: false, error: error.message };
    return { ok: true, processKey };
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
}
