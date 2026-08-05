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
 * FR-7's "past 2x cadence" rule (SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B AC-8), set at
 * REGISTRATION rather than only in the success-path stamp. Sampled live before this SD: every one
 * of the 27 self_stamped rows with a null last_fired_at carried the column default 3, never 2.
 */
const ARMED_GRACE_MULTIPLIER = 2;

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
    // SD-LEO-INFRA-STAMP-ARMING-TIME-001 FR-1 — READ BEFORE UPSERT, and the reason is the whole SD.
    //
    // THE ARMING TIME MUST AGE. This function runs on EVERY in-window tick, so writing
    // `armed_at: new Date()` inline would reset the clock on every tick, the row would never grow
    // older than its grace window, and the FR-7 alarm this SD exists to build could NEVER fire —
    // a fix that silently defeats itself while all of its tests pass. armed_at is therefore
    // written ONCE and preserved thereafter (tests/unit/machinery-class/armed-registration-arming-time.test.js
    // registers twice with an advanced clock and asserts the value is byte-identical).
    //
    // The same read fixes a second, pre-existing defect: `last_fired_at: null` used to be written
    // UNCONDITIONALLY, so re-registering a process that HAD fired wiped its real stamp and sent it
    // back to looking never-produced. It is now sent only when inserting a new row.
    const { data: existing, error: readError } = await supabase
      .from('periodic_process_registry')
      .select('liveness_source_ref, last_fired_at')
      .eq('process_key', processKey)
      .maybeSingle();
    if (readError) return { ok: false, error: readError.message };

    const priorRef = existing?.liveness_source_ref && typeof existing.liveness_source_ref === 'object'
      ? existing.liveness_source_ref : {};
    const nowIso = new Date().toISOString();

    const payload = {
      process_key: processKey,
      display_name: `G3 ARMED: ${sdKey}`,
      owner: opts.owner || 'g3-activation',
      process_type: 'standalone_cron',
      expected_interval_seconds: Number.isFinite(opts.expectedIntervalSeconds) && opts.expectedIntervalSeconds > 0
        ? opts.expectedIntervalSeconds : DEFAULT_EXPECTED_INTERVAL_SECONDS,
      liveness_source: 'self_stamped',
      // Spread FIRST so an existing armed_at (and any key a later SD adds) survives; the explicit
      // keys below re-assert the contract fields without dropping what was already there.
      liveness_source_ref: {
        ...priorRef,
        sd_key: sdKey,
        activation_trigger: opts.activationTrigger.trim(),
        armed_at: priorRef.armed_at || nowIso,
      },
      // FR-7's "past 2x cadence" rule. Without this the row inherits the column default (3), so the
      // alarm the PRD promises at 2x would not fire until 3x.
      grace_multiplier: ARMED_GRACE_MULTIPLIER,
      session_bound: false,
      currently_expected_active: true,
      updated_at: nowIso,
    };
    if (!existing) payload.last_fired_at = null;

    const { error } = await supabase
      .from('periodic_process_registry')
      .upsert(payload, { onConflict: 'process_key' });
    if (error) return { ok: false, error: error.message };
    return { ok: true, processKey, armedAt: payload.liveness_source_ref.armed_at };
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
}
