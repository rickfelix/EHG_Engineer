/**
 * Chairman-email channel-health recorder + alarm state machine.
 * SD-LEO-INFRA-CHAIRMAN-EMAIL-CHANNEL-001 FR-2/FR-3/FR-6.
 *
 * Closes the WATCH-HOLE Solomon's referent-audit found: resend-adapter.js's sendEmail() is
 * fire-and-forget at the system level (return value seen only by the immediate caller).
 * recordAndEvaluate() is invoked from sendEmail()'s single choke point so every current and
 * future caller inherits health tracking for free.
 *
 * Pure functions (computeHealthUpdate/evaluateAlarmTransition/checkCanaryFreshness) are
 * separated from the IO wrapper (recordAndEvaluate) per the EXEC testability guidance --
 * the state machine is unit-tested directly with fixtures, no DB/network mocking required.
 */

const DEFAULT_FAILURE_THRESHOLD = 2;
const DEFAULT_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes
const QUOTA_BLOCK_ERROR_CODES = new Set(['HTTP_429']);

/**
 * Pure. Computes the health-column patch for a given SendResult. A quiet-window-suppressed
 * result (success:true, suppressed:true) is NO-SIGNAL -- returns null so the caller skips the
 * write entirely (risk-agent's code-confirmed landmine: a naive `.success` check would mask
 * up to 6h/night of real outage).
 * @param {{consecutive_failures:number}} currentRow
 * @param {{success:boolean, suppressed?:boolean, errorCode?:string}} result
 * @returns {{signalType:'success'|'failure', healthPatch:object, errorCode?:string}|null}
 */
export function computeHealthUpdate(currentRow, result, now = new Date()) {
  if (result && result.suppressed === true) return null; // no-signal, not a success

  if (result && result.success === true) {
    return {
      signalType: 'success',
      healthPatch: { last_success_at: now.toISOString(), consecutive_failures: 0, last_error_class: null },
    };
  }

  return {
    signalType: 'failure',
    errorCode: result ? result.errorCode : undefined,
    healthPatch: {
      consecutive_failures: (currentRow.consecutive_failures || 0) + 1,
      last_error_class: (result && result.errorCode) || 'UNKNOWN_ERROR',
    },
  };
}

/**
 * Pure. Hysteresis-based alarm transition. Raises on >=failureThreshold consecutive failures
 * OR an explicit quota-block; clears only on a verified success; a per-outage cooldown window
 * distinguishes a recovery-then-immediate-refail (same outage, no re-notify) from a genuinely
 * new outage after the cooldown elapses (re-notify) -- R5's storm-vs-mask tension.
 * @param {{alarm_state:string, alarm_raised_at:?string, alarm_cleared_at:?string}} currentRow
 * @param {{signalType:'success'|'failure', errorCode?:string, failuresAfter?:number}} signal
 * @returns {{alarmPatch:object, shouldNotify:boolean, recovered:boolean}|null}
 */
export function evaluateAlarmTransition(currentRow, signal, now = new Date(), config = {}) {
  const failureThreshold = config.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
  const cooldownMs = config.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const state = currentRow.alarm_state || 'clear';

  if (signal.signalType === 'success') {
    if (state === 'raised') {
      return { alarmPatch: { alarm_state: 'cooldown', alarm_cleared_at: now.toISOString() }, shouldNotify: false, recovered: true };
    }
    if (state === 'cooldown' && currentRow.alarm_cleared_at) {
      const elapsed = now.getTime() - new Date(currentRow.alarm_cleared_at).getTime();
      if (elapsed >= cooldownMs) {
        return { alarmPatch: { alarm_state: 'clear' }, shouldNotify: false, recovered: false };
      }
    }
    return null; // already clear, or still within cooldown -- no state change
  }

  // signal.signalType === 'failure'
  const failuresAfter = signal.failuresAfter ?? 0;
  const isQuotaBlock = QUOTA_BLOCK_ERROR_CODES.has(signal.errorCode);
  const failing = failuresAfter >= failureThreshold || isQuotaBlock;
  if (!failing) return null; // single transient blip -- do not raise yet

  if (state === 'clear') {
    return { alarmPatch: { alarm_state: 'raised', alarm_raised_at: now.toISOString() }, shouldNotify: true, recovered: false };
  }
  if (state === 'cooldown') {
    const withinCooldown = currentRow.alarm_cleared_at
      ? (now.getTime() - new Date(currentRow.alarm_cleared_at).getTime()) < cooldownMs
      : false;
    return {
      alarmPatch: { alarm_state: 'raised', alarm_raised_at: currentRow.alarm_raised_at || now.toISOString() },
      shouldNotify: !withinCooldown, // same outage continuing (no re-notify) vs genuinely new (re-notify)
      recovered: false,
    };
  }
  // already 'raised' -- dedup, no new notification
  return null;
}

/**
 * Pure. Absence detection for the daily canary (FR-6): a dropped GH Actions cron run looks
 * identical to a passing run from the caller's side, so detect by freshness instead of "did it
 * run". A stale/never-verified canary is treated as a failure signal through the SAME alarm
 * path as a real send failure (not a separate mechanism), per the SD's explicit requirement.
 * @param {{last_canary_verified_at:?string}} row
 * @returns {{stale:boolean}}
 */
export function checkCanaryFreshness(row, now = new Date(), maxStalenessMs = 28 * 60 * 60 * 1000) {
  if (!row.last_canary_verified_at) return { stale: true };
  const ageMs = now.getTime() - new Date(row.last_canary_verified_at).getTime();
  return { stale: ageMs > maxStalenessMs };
}

/**
 * IO wrapper. Fail-safe and non-blocking: NEVER throws into the caller's send path. On any
 * read/write failure, best-effort marks the channel degraded (can't-record = health-unknown =
 * degraded, per R9) rather than silently swallowing the failure.
 * @param {{supabase:object, notifyChairman?:Function, logger?:object}} deps
 * @param {object} result - the SendResult (or a synthetic canary/freshness result)
 * @param {{now?:Date, config?:object}} [opts]
 * @returns {Promise<{ok:boolean, skipped?:boolean, notified?:boolean, error?:string}>}
 */
export async function recordAndEvaluate(deps, result, opts = {}) {
  const { supabase, notifyChairman, logger = console } = deps;
  const now = opts.now || new Date();

  try {
    const { data: row, error: readErr } = await supabase
      .from('chairman_email_channel_health') // schema-lint-disable-line — new table (this SD's migration), chairman-apply-gated, not yet in the live snapshot
      .select('*')
      .eq('id', 'singleton')
      .maybeSingle();
    if (readErr) throw new Error(`read failed: ${readErr.message}`);
    const currentRow = row || { consecutive_failures: 0, alarm_state: 'clear' };

    const health = computeHealthUpdate(currentRow, result, now);
    if (!health) return { ok: true, skipped: true }; // suppressed -- no-signal, nothing to record

    const failuresAfter = health.signalType === 'failure' ? health.healthPatch.consecutive_failures : 0;
    const alarm = evaluateAlarmTransition(currentRow, { ...health, failuresAfter }, now, opts.config);

    const patch = { ...health.healthPatch, ...(alarm ? alarm.alarmPatch : {}), updated_at: now.toISOString() };
    const { error: writeErr } = await supabase
      .from('chairman_email_channel_health') // schema-lint-disable-line — new table (this SD's migration), chairman-apply-gated, not yet in the live snapshot
      .upsert({ id: 'singleton', ...patch }, { onConflict: 'id' });
    if (writeErr) throw new Error(`write failed: ${writeErr.message}`);

    if (alarm && alarm.shouldNotify && typeof notifyChairman === 'function') {
      try {
        await notifyChairman({
          title: 'Chairman-email channel DOWN',
          description: `Consecutive failures reached threshold (last_error_class=${health.errorCode || health.healthPatch.last_error_class}). Detected by the SD-LEO-INFRA-CHAIRMAN-EMAIL-CHANNEL-001 watchdog.`,
          priority: 'high',
        });
        return { ok: true, notified: true };
      } catch (notifyErr) {
        // Todoist path has its own liveness risk (R3) -- record but never throw upward.
        await supabase.from('chairman_email_channel_health') // schema-lint-disable-line — new table (this SD's migration), chairman-apply-gated, not yet in the live snapshot
          .update({ last_alarm_notify_error: notifyErr?.message || String(notifyErr) })
          .eq('id', 'singleton')
          .then(() => {}, () => {});
        logger.warn?.(`[channel-health-recorder] alarm raised but notifyChairman failed (non-fatal): ${notifyErr?.message || notifyErr}`);
        return { ok: true, notified: false, error: notifyErr?.message || String(notifyErr) };
      }
    }

    return { ok: true, notified: false };
  } catch (e) {
    // Fail-safe: never throw into the send path. A write failure trips the alarm (can't-record
    // = degraded) rather than being silently swallowed -- best-effort, itself fail-safe.
    logger.warn?.(`[channel-health-recorder] recordAndEvaluate failed (non-fatal, marking degraded): ${e?.message || e}`);
    try {
      await supabase.from('chairman_email_channel_health') // schema-lint-disable-line — new table (this SD's migration), chairman-apply-gated, not yet in the live snapshot
        .upsert({ id: 'singleton', alarm_state: 'raised', alarm_raised_at: now.toISOString(), last_error_class: 'RECORDER_WRITE_FAILURE', updated_at: now.toISOString() }, { onConflict: 'id' });
    } catch {
      /* even the degraded-marker write failed -- nothing more we can safely do without risking the send path */
    }
    return { ok: false, error: e?.message || String(e) };
  }
}

let cachedSupabase = null;
async function getSupabase() {
  if (cachedSupabase) return cachedSupabase;
  // Lazy dynamic import avoids a hard import-time dependency for callers that only need the
  // pure functions (e.g. unit tests importing computeHealthUpdate/evaluateAlarmTransition).
  const { createClient } = await import('@supabase/supabase-js');
  cachedSupabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  return cachedSupabase;
}

/**
 * Convenience wrapper for resend-adapter.js's single call site: wires the default Supabase
 * client + the real Todoist notifyChairman() (dynamic import -- avoids a hard import-time edge
 * for a module this one doesn't otherwise need). NEVER throws, regardless of what fails inside.
 *
 * Test-environment guard: sendEmail() is called by many pre-existing test files (e.g.
 * resend-adapter.test.js) that mock `global.fetch` but were never written to expect a DB/Todoist
 * side effect -- without this guard, every one of those tests would attempt a real Supabase call
 * (and potentially a real chairman phone-push) using whatever credentials happen to be in the
 * process env. Under Vitest (process.env.VITEST is set automatically), this is a no-op UNLESS
 * the caller explicitly injects opts.supabase (or opts.notifyChairman) -- exactly what this SD's
 * own integration tests do to exercise the real recorder/alarm logic safely.
 * @param {object} result - the SendResult from sendEmail()
 * @param {{now?:Date, supabase?:object, notifyChairman?:Function}} [opts]
 */
export async function recordSendResult(result, opts = {}) {
  const hasInjectedDeps = Boolean(opts.supabase || opts.notifyChairman);
  if (process.env.VITEST && !hasInjectedDeps) {
    return { ok: true, skipped: true, reason: 'test-environment-no-injected-deps' };
  }
  try {
    const supabase = opts.supabase || await getSupabase();
    let notifyChairman = opts.notifyChairman;
    if (!notifyChairman) {
      const mod = await import('../integrations/todoist/chairman-notify.js');
      notifyChairman = mod.notifyChairman;
    }
    return await recordAndEvaluate({ supabase, notifyChairman }, result, opts);
  } catch (e) {
    console.warn?.(`[channel-health-recorder] recordSendResult outer guard caught (non-fatal): ${e?.message || e}`);
    return { ok: false, error: e?.message || String(e) };
  }
}

export { DEFAULT_FAILURE_THRESHOLD, DEFAULT_COOLDOWN_MS };
