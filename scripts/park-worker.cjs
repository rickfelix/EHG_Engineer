#!/usr/bin/env node
/**
 * park-worker.cjs — SD-FDBK-ENH-PARKED-WORKER-FALSE-001
 *
 * Arms expected_silence_until for an autonomous /loop fleet worker that is about
 * to PARK between iterations via a ScheduleWakeup with NO active claim.
 *
 * Background (collaborative RCA, worker 3e810595/Alpha + coordinator 5237807d):
 * expected_silence_until was armed ONLY on Task/Agent sub-agent dispatch
 * (pre-tool-enforce.cjs FR-1), never on ScheduleWakeup parking. So a correctly-
 * parked worker (claim released after SD completion, wake armed) got marked stale
 * (PID_NOT_FOUND) by the claim-sweep and looked "incognito". The sweep CONSUMER
 * (cleanup_stale_sessions) already honors expected_silence_until, so this is a
 * WRITER-ONLY fix: persist a capped expected_silence_until + a 'parked' marker
 * heartbeat so the sweep treats the parked window as first-class expected-silence
 * and the coordinator can distinguish parked-from-dead.
 *
 * Usage (call right BEFORE arming a ScheduleWakeup):
 *   node scripts/park-worker.cjs --minutes 20
 *   node scripts/park-worker.cjs --wake-eta 2026-06-07T01:30:00Z
 *
 * Contract: NEVER throws, ALWAYS exits 0 — it must not break the worker's wake flow.
 */
'use strict';

try { require('dotenv').config(); } catch { /* dotenv optional — env may already be injected */ }

const { SILENCE_HARD_CAP_MIN } = require('../lib/fleet/silence-cap.cjs');

const DEFAULT_MINUTES = 20;
const BUFFER_MIN = 5;
// Hard cap so a worker that parks and then genuinely dies is still reaped within a
// bounded window (fail toward eventual reaping, not indefinite protection).
// FR-4 (SD-LEO-INFRA-CLAIM-LIFECYCLE-HARDENING-002): the writer cap MUST be <= the sweep READER
// cap (SILENCE_HARD_CAP_MIN) — a window the reader silently ignores (>cap) is no protection at all.
// Clamp to the shared cap so an env override can only LOWER it, never exceed the reader.
const HARD_CAP_MIN = Math.min(
  SILENCE_HARD_CAP_MIN,
  Math.max(1, parseInt(process.env.PARK_HARD_CAP_MIN, 10) || SILENCE_HARD_CAP_MIN)
);

function parseArgs(argv) {
  const out = { minutes: null, wakeEta: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--minutes' || a === '-m') out.minutes = argv[++i];
    else if (a === '--wake-eta') out.wakeEta = argv[++i];
    else if (a.startsWith('--minutes=')) out.minutes = a.slice('--minutes='.length);
    else if (a.startsWith('--wake-eta=')) out.wakeEta = a.slice('--wake-eta='.length);
  }
  return out;
}

/**
 * Resolve the upcoming wake interval (minutes) from args. Pure (nowMs injected).
 * Prefers explicit --minutes; else derives from --wake-eta; else DEFAULT_MINUTES.
 */
function resolveWakeMinutes(args, nowMs) {
  if (args && args.minutes != null) {
    const n = Number(args.minutes);
    if (Number.isFinite(n) && n > 0) return n;
  }
  if (args && args.wakeEta) {
    const t = Date.parse(args.wakeEta);
    if (Number.isFinite(t)) {
      const mins = (t - nowMs) / 60000;
      if (mins > 0) return mins;
    }
  }
  return DEFAULT_MINUTES;
}

/**
 * Pure: compute the (capped) silence window in minutes from a wake interval.
 * Exported for unit testing.
 */
function computeSilenceMinutes(wakeMinutes, opts) {
  const buffer = (opts && Number.isFinite(opts.buffer)) ? opts.buffer : BUFFER_MIN;
  const hardCap = (opts && Number.isFinite(opts.hardCap)) ? opts.hardCap : HARD_CAP_MIN;
  const base = (Number.isFinite(wakeMinutes) && wakeMinutes > 0) ? wakeMinutes : DEFAULT_MINUTES;
  return Math.min(base + buffer, hardCap);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sessId = process.env.CLAUDE_SESSION_ID || '';
  if (!sessId) {
    console.warn('[park-worker] CLAUDE_SESSION_ID is empty — cannot arm parked silence (no-op). This window may be orphaned; a relaunch is needed.');
    return; // fail-safe: exit 0
  }

  const nowMs = Date.now();
  const wakeMinutes = resolveWakeMinutes(args, nowMs);
  const silenceMin = computeSilenceMinutes(wakeMinutes);
  const expectedSilenceUntil = new Date(nowMs + silenceMin * 60000).toISOString();

  let ok = false;
  try {
    // Reuse the canonical safe telemetry writer. Its whitelist intentionally
    // EXCLUDES status — arming expected_silence_until proactively is what keeps
    // the sweep from ever marking the parked session stale.
    const { writeTelemetryAwait } = require('./hooks/lib/session-telemetry-writer.cjs');
    ok = await writeTelemetryAwait(sessId, {
      heartbeat_at: new Date(nowMs).toISOString(),
      expected_silence_until: expectedSilenceUntil,
      // 'idle' is the allowed value for a between-iterations parked worker — the
      // claude_sessions_last_activity_kind_check CHECK only permits
      // executing|waiting_tool|waiting_agent|thinking|idle|exiting (no 'parked').
      // The real parked-vs-dead signal is expected_silence_until being armed
      // (future), which the claim-sweep already honors.
      last_activity_kind: 'idle',
    });
  } catch (e) {
    console.warn('[park-worker] telemetry write failed (non-fatal):', e && e.message);
  }

  const capped = silenceMin >= HARD_CAP_MIN ? ' (hard-capped)' : '';
  console.log(
    `[park-worker] PARKED session ${sessId.slice(0, 8)} — expected_silence_until=${expectedSilenceUntil} ` +
    `(~${Math.round(silenceMin)}min${capped}; wake ~${Math.round(wakeMinutes)}min) persist=${ok ? 'ok' : 'best-effort'}`
  );
}

if (require.main === module) {
  main()
    .catch((e) => console.warn('[park-worker] unexpected error (non-fatal):', e && e.message))
    .finally(() => process.exit(0)); // ALWAYS exit 0 — never break the wake flow
}

module.exports = {
  computeSilenceMinutes,
  resolveWakeMinutes,
  parseArgs,
  DEFAULT_MINUTES,
  BUFFER_MIN,
  HARD_CAP_MIN,
};
