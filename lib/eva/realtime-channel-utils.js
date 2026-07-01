/**
 * Shared safe teardown for Supabase Realtime channel subscriptions.
 *
 * SD-FDBK-FIX-EVA-STAGE-GOVERNANCE-001: calling a channel's own `unsubscribe()`
 * re-entrantly from inside that channel's `.subscribe()` status callback (on
 * CHANNEL_ERROR/CLOSED/TIMED_OUT) can trigger the vendored phoenix.cjs.js
 * client's Channel.trigger/onClose to recurse infinitely (RangeError: Maximum
 * call stack size exceeded). `supabase.removeChannel()` does not have this
 * problem. This mirrors the pattern already shipped and tested in
 * lib/eva/chairman-decision-watcher.js (SD-FDBK-ENH-CANARY-VENTURE-PROBE-001).
 *
 * @module lib/eva/realtime-channel-utils
 */

/**
 * Tears down a Supabase Realtime channel subscription safely.
 * Use this instead of calling `channelRef.unsubscribe()` directly, especially
 * from inside the channel's own `.subscribe()` status callback.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object|null|undefined} channelRef
 * @returns {null} always returns null, for convenient reassignment:
 *   `ref = safeRemoveChannel(supabase, ref)`
 */
export function safeRemoveChannel(supabase, channelRef) {
  if (!channelRef) return null;
  try {
    supabase?.removeChannel?.(channelRef);
  } catch {
    // Best-effort teardown -- the reference is discarded either way.
  }
  return null;
}
