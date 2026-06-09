/**
 * Shared silence-window hard cap for the parked-worker telemetry hold.
 * SD-LEO-INFRA-CLAIM-LIFECYCLE-HARDENING-002 FR-4.
 *
 * A parked /loop worker arms claude_sessions.expected_silence_until (scripts/park-worker.cjs — the
 * WRITER). The stale-session sweep (scripts/stale-session-sweep.cjs evaluateSourceSideSignals — the
 * READER) treats the worker as alive only while `now < expected_silence_until` AND the window is
 * within this cap. Previously the writer capped at 60min but the reader honored only 30min, so a
 * 31–60min hold was silently ignored and the parked worker could be mis-reaped.
 *
 * ONE constant keeps writer <= reader so the hold is actually honored, while a truly-dead parked
 * worker is still reaped within the cap. CommonJS so both .cjs callers can require() it.
 */
'use strict';

const SILENCE_HARD_CAP_MIN = 30;
const SILENCE_HARD_CAP_MS = SILENCE_HARD_CAP_MIN * 60 * 1000;

module.exports = { SILENCE_HARD_CAP_MIN, SILENCE_HARD_CAP_MS };
