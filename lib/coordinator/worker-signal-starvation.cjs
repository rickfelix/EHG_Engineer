// QF-20260726-921 — surface UNANSWERED WORKER SIGNALS in the sweep tick line. Read-side only.
//
// THE STARVATION THIS MAKES VISIBLE (measured by Bravo, coordinator-endorsed): 17 coordinator_reply
// rows since 00:00Z — SIXTEEN to Adam, ZERO to any worker — while a worker sat blocked 80 minutes on a
// prd-ambiguous signal that explicitly gated its SD. The coordinator drained the Adam advisory lane
// every tick per standing instruction and never once queried payload->>signal_type, so worker signals
// lived behind a filter nobody was running. This was a LANE ASYMMETRY, not neglect and not a dead
// coordinator.
//
// WHY IT WAS INVISIBLE FROM BOTH ENDS AT ONCE, which is the part worth keeping: a starved worker's only
// legal moves are PREPARE and RE-ASK (the wind-down rule correctly forbids dropping the claim), so it
// cannot distinguish a saturated lane from being ignored — both present as silence — and therefore
// cannot escalate differently. Meanwhile the coordinator cannot see what it is not querying. Neither
// side can observe the failure, so it persists without anyone being at fault.
//
// WHY THIS PRINTS UNCONDITIONALLY, INCLUDING =0. The compounding misread was reading
// `SIGNAL ROUTER: promoted=0` as "nothing needs attention" when it only means "nothing AUTO-promoted" —
// a queue of hand-needing signals reported identically to an empty queue. A counter that appears only
// when non-zero reproduces that exact ambiguity, so the explicit `=0` is the point: it distinguishes
// measured-and-empty from not-measured. Same not-measured-rendered-as-measured family seen repeatedly
// on 2026-07-25/26.
//
// NOT GATED BEHIND COORD_DETECTORS_V2, ON PURPOSE. detectReplyStarvation already exists and is wired
// into runDetectors, but runAndLogDetectors returns [] unless that flag is truthy and it defaults to
// 'false' (verified undefined in the live env) — so REPLY_STARVATION is dead by default and could never
// have surfaced this incident. A visibility counter behind a default-off flag is not visibility.
//
// THE DETECTOR IS REUSED, NOT REIMPLEMENTED. Its "answered" semantics are subtle — acknowledged_at OR
// payload.routed_to_feedback_id OR hasCorrelatedReply, because a reply routinely arrives as a fresh
// correlated row rather than an ack stamp (class C6) — and a second copy would drift from it.
//
// ONE IMPLEMENTATION, CALLED BY BOTH SWEEP TWINS. lib/sweep/passes/coordination-detectors.cjs and the
// SWEEP_PASS_REGISTRY=off re-implementation in lib/sweep/legacy-fallback.cjs both call this, so the
// counter cannot become a one-sided improvement that leaves the fallback on pre-fix behavior — the
// failure mode tests/ci/sweep-legacy-twin-parity.test.js exists to prevent.
//
// ALREADY DONE ELSEWHERE, DELIBERATELY NOT REDONE HERE: the current coordinator moved worker-signal
// drain to its first tick duty. That fixes THIS coordinator; this counter is what fixes the next one,
// because a reordering lives in one session and a counter lives in the code.
//
// @module lib/coordinator/worker-signal-starvation

'use strict';

const DEFAULT_THRESHOLD_SEC = 1800; // 30m, matching detectors.cjs DEFAULT_REPLY_STARVATION_MS
const LOOKBACK_MS = 24 * 3600 * 1000;
const MAX_SIGNALS = 500;
const MAX_SAMPLES_LOGGED = 5;

/** Resolve the starvation threshold (ms) from env, mirroring coordination-events.resolveThresholds. */
function resolveThresholdMs(env) {
  env = env || process.env;
  return (Number(env.COORD_REPLY_STARVATION_SEC) || DEFAULT_THRESHOLD_SEC) * 1000;
}

/**
 * Count unanswered worker signals older than the threshold and print the count to the tick line.
 * READ-ONLY: never writes. Fail-OPEN, but says so out loud — a silent catch would recreate the
 * not-measured-looks-like-measured bug this exists to remove.
 *
 * @param {object} supabase
 * @param {{ env?:object, log?:Function, now?:number, detectors?:object }} [opts] injectable seams
 * @returns {Promise<{ measured:boolean, starved:number, thresholdMs:number, oldestMin:number }>}
 */
async function reportWorkerSignalStarvation(supabase, opts = {}) {
  const log = opts.log || ((m) => console.log(m));
  const thresholdMs = resolveThresholdMs(opts.env);
  const mins = Math.round(thresholdMs / 60000);
  try {
    const detectors = opts.detectors || require('./detectors.cjs');
    const now = opts.now ?? Date.now();
    const sinceIso = new Date(now - LOOKBACK_MS).toISOString();
    const { data: signals } = await supabase
      .from('session_coordination')
      .select('id, sender_session, sender_type, message_type, acknowledged_at, read_at, payload, created_at')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(MAX_SIGNALS);
    const res = detectors.detectReplyStarvation({ signals: signals || [], now, thresholdMs });
    const samples = (res && res.evidence && res.evidence.samples) || [];
    const starved = (res && res.evidence && res.evidence.starved_count) || 0;
    const oldestMin = samples.length
      ? Math.round(Math.max(...samples.map((s) => s.age_ms || 0)) / 60000)
      : 0;
    log('WORKER SIGNALS: unanswered_over_' + mins + 'm=' + starved
      + (starved > 0 ? ' oldest=' + oldestMin + 'm' : '')
      + ' (worker lane; 0 means measured-and-empty, not unmeasured)');
    for (const s of samples.slice(0, MAX_SAMPLES_LOGGED)) {
      log('  WORKER_SIGNAL_UNANSWERED: id=' + s.id + ' sender=' + s.sender
        + ' age_min=' + Math.round((s.age_ms || 0) / 60000));
    }
    return { measured: true, starved, thresholdMs, oldestMin };
  } catch (err) {
    log('WORKER SIGNALS: NOT MEASURED (' + ((err && err.message) || 'unknown') + ')');
    return { measured: false, starved: 0, thresholdMs, oldestMin: 0 };
  }
}

module.exports = {
  reportWorkerSignalStarvation,
  resolveThresholdMs,
  DEFAULT_THRESHOLD_SEC,
};
