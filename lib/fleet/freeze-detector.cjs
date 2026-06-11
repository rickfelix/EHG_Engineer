/**
 * Account-limit freeze detector.
 * SD-MAN-INFRA-MEDIUM-EFFORT-HARDENING-001 (FR-2)
 *
 * An account session-limit freeze is indistinguishable from death at the
 * per-session level: heartbeats stop but the processes are alive-and-waiting.
 * The distinguishing SIGNATURE is correlation — multiple sessions (sharing a
 * host/account) stop heartbeating within minutes of EACH OTHER. A genuinely
 * dead session dies alone; a freeze takes the cohort down together.
 *
 * Pure predicate: sessions in, verdict out. All thresholds are options so the
 * synthetic drill (scripts/freeze-drill.mjs) and unit tests run deterministically
 * with no live writes. The sweep consults this BEFORE its PID_DEAD release path;
 * a FROZEN verdict suppresses releases for the episode's sessions until thaw
 * (any cohort member heartbeats again) or episode TTL expiry (so a real mass
 * death — machine reboot — is only delayed, never stuck).
 *
 * @module lib/fleet/freeze-detector
 */

const DEFAULTS = {
  minSessions: 2,          // cohort size that suggests a freeze (>=2 stopping together)
  clusterWindowMs: 10 * 60_000,  // heartbeats must have stopped within this span of each other
  freezeTtlMs: 45 * 60_000,      // episode expires after this — normal staleness resumes
};

/**
 * Detect a freeze episode among dead-classified sessions.
 *
 * @param {Array<{session_id: string, heartbeat_at?: string, hostname?: string}>} deadSessions
 *   Sessions the sweep classified DEAD (heartbeat stale + PID not confirmed alive).
 * @param {{now?: number, minSessions?: number, clusterWindowMs?: number, freezeTtlMs?: number}} [opts]
 * @returns {{frozen: boolean, episodes: Array<{episode_key: string, hostname: string, session_ids: string[], cluster_start: string, cluster_end: string}>, frozenSessionIds: Set<string>}}
 */
function detectFreeze(deadSessions = [], opts = {}) {
  const { minSessions, clusterWindowMs, freezeTtlMs } = { ...DEFAULTS, ...opts };
  const now = opts.now ?? Date.now();

  // Group by hostname — sessions on one machine share the operator's account pool.
  const byHost = new Map();
  for (const s of deadSessions) {
    const hb = s?.heartbeat_at ? new Date(s.heartbeat_at).getTime() : NaN;
    if (!Number.isFinite(hb)) continue; // no heartbeat timestamp → cannot correlate
    const host = s.hostname || 'unknown';
    if (!byHost.has(host)) byHost.set(host, []);
    byHost.get(host).push({ id: s.session_id, hb });
  }

  const episodes = [];
  const frozenSessionIds = new Set();

  for (const [host, members] of byHost) {
    if (members.length < minSessions) continue;
    members.sort((a, b) => a.hb - b.hb);

    // Find the largest cluster of last-heartbeats within clusterWindowMs (sliding window).
    let best = null;
    for (let i = 0, j = 0; i < members.length; i++) {
      while (members[i].hb - members[j].hb > clusterWindowMs) j++;
      const size = i - j + 1;
      if (!best || size > best.size) best = { size, from: j, to: i };
    }
    if (!best || best.size < minSessions) continue;

    const cluster = members.slice(best.from, best.to + 1);
    const newest = cluster[cluster.length - 1].hb;

    // Episode TTL: past the TTL this is no longer treated as a freeze —
    // a real mass death must eventually release (R-2 mitigation).
    if (now - newest > freezeTtlMs) continue;

    const episodeKey = `${host}|${new Date(cluster[0].hb).toISOString().slice(0, 16)}`;
    episodes.push({
      episode_key: episodeKey,
      hostname: host,
      session_ids: cluster.map((m) => m.id),
      cluster_start: new Date(cluster[0].hb).toISOString(),
      cluster_end: new Date(newest).toISOString(),
    });
    for (const m of cluster) frozenSessionIds.add(m.id);
  }

  return { frozen: episodes.length > 0, episodes, frozenSessionIds };
}

module.exports = { detectFreeze, FREEZE_DEFAULTS: DEFAULTS };
