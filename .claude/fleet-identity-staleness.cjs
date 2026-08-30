// QF-20260830-156: a frozen seat's per-session identity file stops updating once its own hook
// stops firing, so the statusline must not render it as current forever. Extracted as a pure,
// requirable function (statusline.cjs itself reads stdin at import time and cannot be required
// safely in a test).
const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2h — the writing hook fires on every tool call

function staleSuffix(mtimeMs, nowMs = Date.now(), thresholdMs = STALE_THRESHOLD_MS) {
  if (!Number.isFinite(mtimeMs)) return '';
  const ageMs = nowMs - mtimeMs;
  if (ageMs <= thresholdMs) return '';
  return ` (stale ${Math.floor(ageMs / 3600000)}h)`;
}

module.exports = { STALE_THRESHOLD_MS, staleSuffix };
