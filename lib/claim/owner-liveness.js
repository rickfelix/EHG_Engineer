/**
 * owner-liveness.js — SD-LEO-INFRA-LEO-APP-LAUNCHER-001 (FR-5).
 *
 * The dead-vs-live claim-owner discrimination that gates `sd-start --force-reclaim`, extracted from
 * sd-start.js as a PURE, behaviorally-testable function. Behavior is PRESERVED exactly from
 * QF-20260722-842 / 4d8fbb5 (which added the explicit live-owner refusal but only source-structure
 * tests) — this adds the behavioral regression lock.
 *
 * A claim is RECLAIMABLE only when its owner is genuinely stale (heartbeat older than the TTL) or
 * inactive (missing session, or status != 'active'). A live owner (fresh heartbeat + active) is NOT
 * reclaimable — `--force-reclaim` must REFUSE it (never steal a live claim; the 017c491c false-ghost
 * incident that churned the CP3 claim for 2 days).
 *
 * KNOWN TENSION (deliberately NOT changed here — flagged for a Solomon/Adam design decision): liveness
 * keys on status === 'active'. A fresh-heartbeat *idle* worker is therefore classified reclaimable,
 * and a stuck-but-heartbeating 'active' session is classified live-and-un-reclaimable. Distinguishing
 * genuinely-alive from stuck-heartbeating is the deeper recovery-vs-false-ghost design question; this
 * FR only locks the current 4d8fbb5 behavior, it does not resolve that.
 */
export function classifyOwnerLiveness({ heartbeatAge, ownerSession, ttlMs } = {}) {
  const age = typeof heartbeatAge === 'number' ? heartbeatAge : Infinity;
  const isStale = age > ttlMs;
  const isInactive = !ownerSession || ownerSession.status !== 'active';
  const reclaimable = isStale || isInactive;
  const reason = isInactive
    ? 'owner inactive (missing session or status != active)'
    : (isStale ? `owner heartbeat stale (> ${Math.round(ttlMs / 60000)}m TTL)` : 'owner genuinely live (fresh heartbeat + active)');
  return { isStale, isInactive, reclaimable, live: !reclaimable, reason };
}
