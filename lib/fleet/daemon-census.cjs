// SD-LEO-INFRA-SESSION-TICK-DAEMONS-001 FR-4 — the assertion that would have caught this.
//
// The accumulation ran for DAYS because nothing ever compared "how many daemons are stamping" to
// "how many conversations are alive". A one-time cleanup without this assertion buys one quiet
// week; the whole point of FR-4 is the second half.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE SIGNATURE, AND WHY IT IS NOT A COUNT COMPARISON
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// "Daemon count materially exceeds live conversations" is the right instinct but the wrong
// instrument: a bare count difference tells an operator that something is wrong and nothing about
// what to do, and it needs a definition of "live conversation" that does not exist.
//
// A leaked daemon has an exact, per-row signature instead. heartbeat_at and process_alive_at are
// BOTH written by the daemon, so two agreeing liveness signals are really one signal. last_tool_at
// is the only value the CONVERSATION writes, which makes it the sole independent discriminator.
// So a leak is: the daemon is stamping RIGHT NOW while the conversation has not acted in a long
// time. That names the offending session ids, which is actionable, and it degrades to a count for
// anyone who just wants a number.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHERE THE THRESHOLD COMES FROM — MEASURED, NOT PICKED
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A PARKED /loop worker is alive but tool-silent between wakeups, so it shares the "stale
// last_tool_at" half of the signature. Getting this wrong releases parked workers, which is the
// false-death outage session-tick.cjs:181-184 calls the seam all five prior attempts fell down.
//
// ScheduleWakeup CLAMPS its delay to [60, 3600] seconds, so a parked worker's last_tool_at cannot
// exceed roughly one hour plus one turn by construction. Census of this host on 2026-08-04, all
// 5,910 non-released rows: 11 were heartbeat-fresh; 10 of those had last_tool_at under 1h, and
// exactly ONE was 51h stale — b22451df, the session this SD witnessed. Nothing at all fell between
// 1h and 24h.
//
// STALE_MS sits at 6h: six times the structural parked-worker ceiling, and inside a measured empty
// gap rather than next to a cluster. It is an ALARM threshold, never a kill threshold — nothing
// here terminates or releases anything, which is why a threshold is admissible at all. The FR-1
// closure that DOES write deliberately reads no clock.

/** Daemon considered to be stamping right now. */
const FRESH_MS = 5 * 60 * 1000;
/** Conversation considered long-dead. Six times the [60,3600]s ScheduleWakeup ceiling. */
const STALE_MS = 6 * 60 * 60 * 1000;

const ms = (t) => {
  if (!t) return null;
  const v = new Date(t).getTime();
  return Number.isFinite(v) ? v : null;
};

/**
 * Pure. Which rows carry the leaked-daemon signature?
 *
 * A row qualifies when the daemon is stamping (heartbeat_at within freshMs) AND the conversation
 * is long silent (last_tool_at present and older than staleMs).
 *
 * A MISSING last_tool_at is NOT a leak. Absence is not evidence — a session that has genuinely
 * never run a tool is indistinguishable from one whose column was never populated, and alarming on
 * "unknown" is how an assertion trains its operator to ignore it. Measured: zero heartbeat-fresh
 * rows on this host have a null last_tool_at, so this costs nothing today and stays honest if that
 * changes.
 *
 * @param {object} o
 * @param {Array<{session_id:string, heartbeat_at:*, last_tool_at:*}>} o.rows
 * @param {number} o.now  epoch ms — injected so the predicate is testable and never reads a clock itself
 * @returns {Array<{session_id:string, heartbeatAgeMs:number, lastToolAgeMs:number}>}
 */
function leakedDaemonSessions({ rows, now, freshMs = FRESH_MS, staleMs = STALE_MS } = {}) {
  if (!Array.isArray(rows) || !Number.isFinite(now)) return [];
  const out = [];
  for (const r of rows) {
    if (!r || !r.session_id) continue;
    const hb = ms(r.heartbeat_at);
    const lt = ms(r.last_tool_at);
    if (hb === null || lt === null) continue;      // absent => not evidence
    const hbAge = now - hb;
    const ltAge = now - lt;
    if (hbAge >= 0 && hbAge <= freshMs && ltAge > staleMs) {
      out.push({ session_id: r.session_id, heartbeatAgeMs: hbAge, lastToolAgeMs: ltAge });
    }
  }
  return out;
}

/**
 * The assertion itself. ok=false means the census diverged and the caller should exit non-zero.
 */
function assertDaemonCensus({ rows, now, freshMs, staleMs } = {}) {
  const leaked = leakedDaemonSessions({ rows, now, freshMs, staleMs });
  return {
    ok: leaked.length === 0,
    leaked,
    detail: leaked.length === 0
      ? 'census clean — every stamping daemon has a conversation that acted recently'
      : `${leaked.length} daemon(s) stamping for a conversation that has not acted in over ` +
        `${Math.round((staleMs ?? STALE_MS) / 3600000)}h: ` +
        leaked.map((l) => `${l.session_id.slice(0, 8)}(${Math.round(l.lastToolAgeMs / 3600000)}h)`).join(', '),
  };
}

module.exports = { leakedDaemonSessions, assertDaemonCensus, FRESH_MS, STALE_MS };
