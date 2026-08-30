/**
 * Local (disk-only, no DB round-trip) record of the delay last armed via ScheduleWakeup —
 * QF-20260830-275, part (A). retry-state-manager.cjs reads this on every PreToolUse to feed
 * reinvocation-classifier.cjs; a DB read on that hot path would add latency to every tool
 * call, so the arm-time write (post-tool-loop-state.cjs, already local-disk-adjacent via
 * the retry-state file family) mirrors the same value here instead.
 *
 * Fail-open throughout: a missing/unreadable marker means "no arm on record", which
 * reinvocation-classifier.cjs already treats as 'countable' (never silently exempts).
 */
'use strict';

const fs = require('fs');
const path = require('path');

function markerPath(sessionId) {
  const override = process.env.LEO_RETRY_STATE_DIR;
  const dir = override ? path.resolve(override) : path.resolve(__dirname, '../../.claude');
  return path.join(dir, `wake-arm-${sessionId}.json`);
}

function writeWakeArmMarker(sessionId, delaySeconds, nowMs) {
  if (!sessionId || !Number.isFinite(delaySeconds) || delaySeconds <= 0) return;
  try {
    const fp = markerPath(sessionId);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    const tmp = `${fp}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify({ armed_at: new Date(nowMs).toISOString(), delay_seconds: delaySeconds }), 'utf8');
    fs.renameSync(tmp, fp);
  } catch { /* fail-open: bookkeeping only */ }
}

/** @returns {{ armed_at:string, delay_seconds:number }|null} */
function readWakeArmMarker(sessionId) {
  if (!sessionId) return null;
  try {
    const fp = markerPath(sessionId);
    if (!fs.existsSync(fp)) return null;
    const parsed = JSON.parse(fs.readFileSync(fp, 'utf8'));
    if (!parsed || typeof parsed.delay_seconds !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

module.exports = { writeWakeArmMarker, readWakeArmMarker, markerPath };
