// Claim-collision classification — QF-20260712-008 (RCA on QF-20260712-254).
//
// claim_history records CLAIMS but never RELEASES, so a benign release-then-reclaim
// (session A claims, releases/is-reaped, session B claims the now-free SD) is
// indistinguishable from a live simultaneous double-claim when only claim_history +
// the prior session's CURRENT status are inspected — the session can stay status=active
// while having released the SD (witnessed: SESSION_STATUS_TRANSITION
// `claim_cleared_irrevocable ... status=active->active`). session_lifecycle_events carries
// the missing release marker; cross-referencing it collapses that false ANOMALY.

/**
 * Index session_lifecycle_events rows into per-session release markers.
 * A "release" ends session A's hold on an SD before some later time:
 *   - SESSION_STATUS_TRANSITION with metadata.claim_cleared === true (SD-scoped via old_sd_key)
 *   - SESSION_AUTO_RELEASED / CLAIM_TAKEOVER (session-level: ends ALL of that session's claims)
 * @param {Array<{session_id:string,event_type:string,created_at:string,metadata?:object}>} rows
 * @returns {Map<string, Array<{at:number, sdKey:(string|null)}>>}
 */
export function indexReleaseEvents(rows) {
  const bySession = new Map();
  for (const r of rows || []) {
    if (!r || !r.session_id || typeof r.created_at !== 'string') continue;
    let sdKey; // undefined = not a release marker
    if (r.event_type === 'SESSION_AUTO_RELEASED' || r.event_type === 'CLAIM_TAKEOVER') {
      sdKey = null; // session-level release: applies to any SD it held
    } else if (r.event_type === 'SESSION_STATUS_TRANSITION' && r.metadata && r.metadata.claim_cleared === true) {
      sdKey = r.metadata.old_sd_key ?? null; // SD-scoped release
    } else {
      continue;
    }
    const at = Date.parse(r.created_at);
    if (Number.isNaN(at)) continue;
    if (!bySession.has(r.session_id)) bySession.set(r.session_id, []);
    bySession.get(r.session_id).push({ at, sdKey });
  }
  return bySession;
}

/**
 * True when `sessionId` released its hold on `sdKey` strictly before `beforeIso`.
 * A session-level release (sdKey === null marker) counts for any SD.
 */
export function releasedBefore(releaseBySession, sessionId, sdKey, beforeIso) {
  const before = Date.parse(beforeIso);
  if (Number.isNaN(before)) return false;
  const markers = releaseBySession && releaseBySession.get ? releaseBySession.get(sessionId) : null;
  if (!markers) return false;
  return markers.some((m) => m.at < before && (m.sdKey === null || m.sdKey === sdKey));
}

/**
 * Classify a distinct-session claim transition on one SD.
 * A hand-off is a plausible re-route when the prior session was gone/released before the
 * later claim; two sessions BOTH still live-and-holding is the interleave anomaly class.
 * @returns {'plausible_reroute'|'ANOMALY_live_interleave'}
 */
export function classifyClaimTransition({ prev, cur, prevSession, releaseBySession, sdKey }) {
  const statusGone = !prevSession || !['active', 'idle'].includes(prevSession.status);
  if (statusGone) return 'plausible_reroute';
  // Prior session is status-live — but did it RELEASE this SD before the reclaim? (the QF fix)
  if (releasedBefore(releaseBySession, prev.session_id, sdKey, cur.claimed_at)) return 'plausible_reroute';
  return 'ANOMALY_live_interleave';
}
