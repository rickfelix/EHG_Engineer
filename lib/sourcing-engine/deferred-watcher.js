/**
 * lib/sourcing-engine/deferred-watcher.js
 *
 * SD-LEO-INFRA-SOURCING-ENGINE-DEFERRED-WATCHER-001 — sourcing-engine child 8/10.
 *
 * The DEFERRED / BLOCKED-ON axis of the engine's no-drop guarantee. The router (child 1) lanes a
 * candidate 'blocked-on-X' instead of dropping it — but a blocked-on item that is never re-checked is
 * effectively dropped. This module re-evaluates a blocked-on (or deferred) candidate against current
 * state and, when its blocker has CLEARED, re-routes it (typically back to belt-ready) so it re-enters
 * the belt instead of sitting blocked forever.
 *
 * REUSE, don't reinvent (the dep-sentinel lesson):
 *   - the canonical dependency parser parseSdDependencies (lib/utils/parse-sd-dependencies.cjs) is the
 *     SSOT for deciding whether a blocker ref is a real SD-key blocker — we do NOT hand-roll a depId.
 *   - the shipped routeCandidate (child 1) re-computes the lane once the blocker is removed from
 *     context, so the re-emit respects EVERY other gate (dedup / chairman / outcome / a DIFFERENT
 *     in-flight blocker) — we never blindly force belt-ready.
 *
 * PURE: this module is I/O-free and deterministic so it unit-tests without a DB. The cron
 * (scripts/sourcing-engine-deferred-watcher-sweep.mjs) is the thin I/O + persistence wrapper.
 */
import { routeCandidate, LANES } from './router.js';
import { blockedLane, isValidLane, BLOCKED_LANE_PREFIX } from './lane.js';
import depParser from '../utils/parse-sd-dependencies.cjs';

const { parseSdDependencies } = depParser;

/** Feature-flag helper for the watcher cron: on|1|true => enabled; everything else (incl. undefined) => OFF. */
export function isWatcherFlagEnabled(env = process.env) {
  const v = String((env && env.SOURCING_DEFERRED_WATCHER_V1) || 'off').toLowerCase();
  return v === 'on' || v === '1' || v === 'true';
}

/** Is `lane` a persisted parametric blocked-on lane ('blocked-on-<blocker>')? */
export function isBlockedLane(lane) {
  return typeof lane === 'string' && lane.startsWith(BLOCKED_LANE_PREFIX) && lane.length > BLOCKED_LANE_PREFIX.length;
}

/** Extract the blocker descriptor (the suffix) from a 'blocked-on-<blocker>' lane, or null. */
export function extractBlocker(lane) {
  if (!isBlockedLane(lane)) return null;
  return lane.slice(BLOCKED_LANE_PREFIX.length);
}

/**
 * PURE (FR-1/FR-3): re-evaluate ONE blocked-on/deferred registry row and return the re-lane decision.
 *
 * @param {{ id?:*, lane:string, classified?:object }} row - registry row; `classified` is the original
 *   routeCandidate classifiedItem shape (writeSurfaces/dependsOn/authority/needsOutcome/title/...),
 *   used to re-route faithfully once the blocker clears. Absent → re-route from an empty item, which
 *   (no remaining conflicts) lands belt-ready.
 * @param {{
 *   completedSdKeys?: (Set<string>|string[]),       // SD-keys whose blocking SD has completed/shipped
 *   clearedBlockerDescriptors?: (Set<string>|string[]), // non-SD blocker descriptors recorded as cleared
 *   routeContext?: object                            // routeCandidate context (existing/inFlight/...)
 * }} ctx
 * @returns {{ action:'skip'|'stay'|'re-lane', reason:string, from?:string, to?:string,
 *   lane?:string, blocker?:string, routed_lane?:string }}
 */
export function reEvaluateBlockedCandidate(row, ctx = {}) {
  const lane = row && row.lane;
  if (!isBlockedLane(lane)) {
    return { action: 'skip', reason: 'not-blocked-lane' };
  }
  const blocker = extractBlocker(lane);

  // Canonical SSOT: is the blocker a real SD-key blocker? parseSdDependencies returns the SD-key(s)
  // it recognizes (or [] for a free-text / non-SD descriptor) — never a hand-rolled depId.
  const sdBlockers = parseSdDependencies([blocker]);
  const isSdBlocker = sdBlockers.length > 0;
  const sdKey = isSdBlocker ? sdBlockers[0] : null;

  const completed = toSet(ctx.completedSdKeys);
  const clearedDescriptors = toSet(ctx.clearedBlockerDescriptors);
  const cleared = isSdBlocker ? completed.has(sdKey) : clearedDescriptors.has(blocker);

  if (!cleared) {
    return { action: 'stay', reason: 'blocker-open', lane, blocker };
  }

  // Blocker cleared → re-route through the shipped router with the cleared blocker removed from the
  // in-flight set, so the new lane respects every other gate (dedup / chairman / outcome / another
  // in-flight blocker). We never blindly force belt-ready.
  const routeContext = ctx.routeContext && typeof ctx.routeContext === 'object' ? ctx.routeContext : {};
  const inFlight = Array.isArray(routeContext.inFlight)
    ? routeContext.inFlight.filter((f) => !(f && f.sd_key === sdKey))
    : [];
  const r = routeCandidate(row.classified || {}, { ...routeContext, inFlight });

  // Map the router's bare lane vocabulary onto the persisted lane vocabulary.
  let to;
  if (r.lane === LANES.BLOCKED_ON) {
    // Still blocked, by a DIFFERENT in-flight conflict — re-lane onto the new parametric blocked lane.
    to = blockedLane(r.blocker && r.blocker.sd_key);
  } else {
    to = r.lane; // belt-ready / chairman-gated / outcome-gated / dedup are all valid FIXED_LANES
  }

  if (!isValidLane(to)) {
    // Defensive: never propose a lane the CHECK constraint would reject.
    return { action: 'stay', reason: 'reroute-invalid-lane', lane, blocker, routed_lane: r.lane };
  }
  if (to === lane) {
    // No net change (re-blocked on the same descriptor) — idempotent stay.
    return { action: 'stay', reason: 'blocker-cleared-still-blocked', lane, blocker, routed_lane: r.lane };
  }
  return { action: 're-lane', reason: 'blocker-cleared', from: lane, to, blocker, routed_lane: r.lane };
}

function toSet(v) {
  if (v instanceof Set) return v;
  if (Array.isArray(v)) return new Set(v);
  return new Set();
}
