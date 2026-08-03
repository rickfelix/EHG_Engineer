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
// SD-LEO-INFRA-RETENTION-DESTROYS-REPLY-001 (FR-2): was 500, measured against 779 live rows in a
// single 24h window — and the fetch ordered created_at DESCENDING before limiting, so it kept the
// NEWEST 500 and silently discarded the OLDEST 279. Starvation IS age, so the cap was throwing away
// precisely the population this gauge exists to find: a signal older than the 500th-newest could
// never be reported as starved however long it had waited.
//
// Raised to be non-binding for a realistic window rather than removed — an unbounded fetch on a
// busy day is its own hazard — and assertNonBinding() below makes the truncation SAY SO if it ever
// binds again as traffic grows, instead of silently resuming the old behaviour.
const MAX_SIGNALS = 5000;
const MAX_SAMPLES_LOGGED = 5;
// FR-4: row_timestamp is expires_at, not created_at, so the indexed bound must be widened by at
// least one expiry interval or rows created inside the lookback but expiring just outside it would
// be missed. One hour is the observed coordination expiry; 2h is deliberate slack.
const ARCHIVE_COARSE_SLACK_MS = 2 * 3600 * 1000;

/**
 * SD-LEO-INFRA-RETENTION-DESTROYS-REPLY-001 (FR-1/TR-1): reconstitute an archived coordination row
 * into the shape the live select produces.
 *
 * PURE. retention_archive.row_data is the full to_jsonb() of the original session_coordination row,
 * so every field the detector reads is recoverable — but the mapping is explicit rather than a
 * spread, because detectReplyStarvation and hasCorrelatedReply are pure over the rows handed to
 * them and DO NOT VALIDATE SHAPE. A missing or misnamed field would not throw; it would silently
 * fail to correlate, which reproduces the exact blindness this SD exists to remove while every
 * "it didn't crash" test stays green.
 *
 * @param {{row_data?:object}} archiveRow
 * @returns {object|null} live-shaped row, or null when row_data is unusable
 */
function reviveArchivedSignal(archiveRow) {
  const d = archiveRow && archiveRow.row_data;
  if (!d || typeof d !== 'object' || !d.id) return null;
  return {
    id: d.id,
    sender_session: d.sender_session,
    sender_type: d.sender_type,
    message_type: d.message_type,
    acknowledged_at: d.acknowledged_at,
    read_at: d.read_at,
    payload: d.payload,
    created_at: d.created_at,
  };
}

/**
 * FR-2: report when the row cap actually bound, so a silent truncation cannot quietly return.
 * The cap discarding rows is not an error — it is a measurement the reader must be told about,
 * because a truncated window looks identical to a quiet one.
 * @returns {string|null} a warning line, or null when the cap did not bind
 */
function assertNonBinding(liveCount, archivedCount, cap) {
  const fetched = (liveCount || 0) + (archivedCount || 0);
  if (fetched < cap) return null;
  return 'WORKER SIGNALS: TRUNCATED at MAX_SIGNALS=' + cap + ' (fetched ' + fetched
    + ') — the OLDEST signals in the window were discarded and cannot be reported as starved. '
    + 'Raise MAX_SIGNALS; this count is a FLOOR, not a measurement.';
}

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

    // SD-LEO-INFRA-RETENTION-DESTROYS-REPLY-001 (FR-1): ALSO read the archive.
    //
    // cleanup_expired_coordination does ARCHIVE-before-delete: an acknowledged row that has expired
    // is copied whole into retention_archive and then removed from this table, typically within an
    // hour of being acked. The evidence is not destroyed — it is RELOCATED. But this fetch read the
    // live table only, so for the remaining ~23 hours of the lookback an ANSWERED signal had no
    // visible proof of its answer and reported as starved.
    //
    // Measured on 2026-08-03 over one 24h window: 779 live rows against 1,486 archived — about two
    // thirds of the window this gauge claims to measure was outside what it could see.
    //
    // That produced an inverted incentive: acknowledge promptly and your reply is reaped within the
    // hour, after which the signal you answered re-flags as starved; ignore it and the row persists
    // indefinitely. The gauge rewarded being ignored.
    //
    // INDEX SEMANTICS, easy to get subtly wrong: idx_retention_archive_source_ts covers
    // (source_table, row_timestamp), but row_timestamp is populated from sc.expires_at — NOT
    // created_at, which is the axis this detector reasons about. So row_timestamp is used as a
    // COARSE indexed bound (widened by one expiry interval) and the precise lookback is applied to
    // the revived row's own created_at below. Filtering on row_timestamp as though it were creation
    // time would select the wrong window while looking correct and indexed.
    let archived = [];
    let archiveNote = null;
    try {
      const coarseIso = new Date(now - LOOKBACK_MS - ARCHIVE_COARSE_SLACK_MS).toISOString();
      const { data: arch, error: archErr } = await supabase
        .from('retention_archive')
        .select('row_data')
        .eq('source_table', 'session_coordination')
        .gte('row_timestamp', coarseIso)
        .limit(MAX_SIGNALS);
      if (archErr) throw new Error(archErr.message);
      archived = (arch || [])
        .map(reviveArchivedSignal)
        .filter((r) => r && r.created_at && r.created_at >= sinceIso);
    } catch (e) {
      // TR-2: fail-open but SAY SO. Silently falling back to live-only rows is byte-identical to
      // the defect being fixed, and would let this regress invisibly.
      archiveNote = 'WORKER SIGNALS: archive unreadable (' + ((e && e.message) || 'unknown')
        + ') — answered-but-archived replies are NOT visible this tick; count may over-report.';
    }

    const truncationNote = assertNonBinding((signals || []).length, archived.length, MAX_SIGNALS);
    if (archiveNote) log(archiveNote);
    if (truncationNote) log(truncationNote);

    const res = detectors.detectReplyStarvation({ signals: [...(signals || []), ...archived], now, thresholdMs });
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
  // Exported for test: both are PURE, and both guard failures that throw nothing —
  // a mis-shaped revived row silently fails to correlate, and a bound cap silently
  // discards the oldest signals. Neither is observable without asserting on it.
  reviveArchivedSignal,
  assertNonBinding,
  MAX_SIGNALS,
};
