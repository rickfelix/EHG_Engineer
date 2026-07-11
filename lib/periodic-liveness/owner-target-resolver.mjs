/**
 * Owner-to-target resolver for periodic_process_registry.owner labels.
 * SD-LEO-INFRA-OPERATIVE-AGENT-OWNERSHIP-001-B FR-1.
 *
 * periodic_process_registry.owner is free text (coordinator-fleet, eva-scheduler,
 * chairman-fleet, ...) -- not an addressable session. This resolves a label to a live delivery
 * target where possible, reusing lib/coordinator/peer-target.cjs's already liveness-validated
 * adam/solomon/coordinator resolvers (each internally checks heartbeat freshness against a
 * staleness cutoff -- not a naive latest-row pick), and falls back to the coordinator for any
 * unknown or unresolvable label so an escalation can never dead-letter.
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { resolvePeerTarget } = require('../coordinator/peer-target.cjs');
const { getActiveCoordinatorId } = require('../coordinator/resolve.cjs');

// Registry owner labels are role-ish names with a suffix (coordinator-fleet, eva-scheduler,
// chairman-fleet, ...), not bare peer keys. Strip a known suffix to recover a candidate peer key.
// A label with no known-peer match (e.g. eva-scheduler, chairman-fleet, ops-*-collector) falls
// through to the coordinator fallback below -- correct today (no live eva/chairman session
// exists yet); converges as child A's reassignment worklist assigns addressable owners.
const KNOWN_SUFFIXES = ['-fleet', '-scheduler', '-watcher', '-collector', '-probe', '-sweep', '-sla-sweep'];
const KNOWN_PEERS = new Set(['adam', 'solomon', 'coordinator']);

export function candidatePeerKey(ownerLabel) {
  const label = String(ownerLabel || '').trim().toLowerCase();
  if (KNOWN_PEERS.has(label)) return label;
  for (const suffix of KNOWN_SUFFIXES) {
    if (label.endsWith(suffix)) {
      const stripped = label.slice(0, -suffix.length);
      if (KNOWN_PEERS.has(stripped)) return stripped;
    }
  }
  return null;
}

/**
 * @param {object} supabase
 * @param {string} ownerLabel
 * @param {object} [deps] injectable resolvers, default the real modules (testable seam)
 * @returns {Promise<{kind:'session'|'coordinator', target:string, resolvedPeer:string|null, live:boolean}>}
 */
export async function resolveOwnerTarget(supabase, ownerLabel, deps = {}) {
  const {
    resolvePeer = resolvePeerTarget,
    getCoordinatorId = getActiveCoordinatorId,
  } = deps;

  const peerKey = candidatePeerKey(ownerLabel);
  if (peerKey) {
    try {
      const resolved = await resolvePeer(supabase, peerKey);
      if (resolved && resolved.live && resolved.target) {
        return { kind: 'session', target: resolved.target, resolvedPeer: peerKey, live: true };
      }
    } catch {
      // Unexpected resolver failure -- fall through to coordinator fallback. An owner label
      // must never dead-letter regardless of why resolution failed.
    }
  }

  const coordinatorId = await getCoordinatorId(supabase).catch(() => null);
  return {
    kind: 'coordinator',
    target: coordinatorId || 'broadcast-coordinator',
    resolvedPeer: peerKey,
    live: Boolean(coordinatorId),
  };
}
