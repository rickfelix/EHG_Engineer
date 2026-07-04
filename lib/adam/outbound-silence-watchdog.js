/**
 * Adam outbound-silence watchdog — SD-LEO-FIX-ADAM-OUTBOUND-SILENCE-001.
 *
 * Chairman-caught gap 2026-07-04: a backlog of Adam->coordinator messages sat
 * unprocessed despite two visible-but-unacted dashboard signals (ADAM ADVISORY
 * INBOX unactioned age, UNDELIVERED OUTBOUND). Watches Adam's own outbound rows
 * (sender_type='adam') at a LIVE target: a reply-expected row unread >30m or
 * read-but-unacknowledged >60m is a breach. First breach for a target -> one
 * alternate-kind channel-health probe. A target STILL breaching after a prior
 * probe (second consecutive breach) -> a chairman-visible feedback row.
 * Deduped 2h/target, capped per tick (unbounded-generator family: fresh
 * primary-state check each tick, terminal/liveness suppression, TWO independent
 * rate-limit guards on the probe leg, visible log line for every probe/escalation
 * -- per database-agent/risk-agent PLAN-phase review, sub_agent_execution_results
 * 55a57f82/e99f7453).
 *
 * Probe rows deliberately omit correlation_id/reply_requested and set
 * reply_class='fire-and-forget' so lib/adam/task-rehydrate.js's rehydrateBoard()
 * never turns a probe into an advisory_thread board node (risk-agent finding C2
 * -- that side-door would bypass both dedup guards). request_ack is never set
 * (avoids spawning a paired transport_ack row). expires_at is stamped 24h out
 * (database-agent finding: the session_coordination default 1h TTL would sweep
 * a probe before the 2h dedup check ever sees it, making the second-breach
 * escalation unreachable).
 */

import { emitFeedback } from '../governance/emit-feedback.js';

export const REPLY_EXPECTED_KINDS = new Set(['coordinator_request', 'solomon_consult']);
export const UNREAD_BREACH_MS = 30 * 60 * 1000;
export const UNACKED_BREACH_MS = 60 * 60 * 1000;
export const PROBE_DEDUP_MS = 2 * 60 * 60 * 1000;
export const PROBE_KIND = 'adam_channel_health_probe';
export const PROBE_EXPIRES_MS = 24 * 60 * 60 * 1000;
const HEARTBEAT_FRESH_MS = 15 * 60 * 1000;
// risk-agent C1: independent absolute cap so a probe-guard parity bug (SELECT/INSERT
// filter divergence) degrades to a bounded per-tick ceiling, never an unbounded storm.
export const MAX_PROBES_PER_TICK = 5;

function toMs(ts) { const n = ts ? Date.parse(ts) : NaN; return Number.isFinite(n) ? n : 0; }

/** Pure: reply-expected per FR (kind in REPLY_EXPECTED_KINDS, or explicit expects_reply). */
export function isReplyExpected(row) {
  return REPLY_EXPECTED_KINDS.has(row && row.payload && row.payload.kind) ||
    !!(row && row.payload && row.payload.expects_reply === true);
}

/** Pure: unread >30m, or read-but-unacknowledged >60m. Never true for the watchdog's own probe rows. */
export function isBreaching(row, nowMs) {
  if (!row || (row.payload && row.payload.kind === PROBE_KIND)) return false;
  if (!row.read_at) return (nowMs - toMs(row.created_at)) >= UNREAD_BREACH_MS;
  if (row.acknowledged_at) return false;
  return (nowMs - toMs(row.read_at)) >= UNACKED_BREACH_MS;
}

/** Pure: oldest breaching reply-expected row per live target_session. */
export function classifyBreaches(outboundRows, liveSessionIds, nowMs) {
  const byTarget = new Map();
  for (const r of (outboundRows || [])) {
    if (!r || !liveSessionIds.has(r.target_session) || !isReplyExpected(r) || !isBreaching(r, nowMs)) continue;
    const cur = byTarget.get(r.target_session);
    if (!cur || toMs(r.created_at) < toMs(cur.created_at)) byTarget.set(r.target_session, r);
  }
  return byTarget;
}

/** Pure: lane-health aggregate for fire-and-forget (non-reply-expected) rows, excluding the watchdog's own probes. */
export function laneHealthAggregate(outboundRows, liveSessionIds, nowMs) {
  const rows = (outboundRows || []).filter(
    (r) => r && liveSessionIds.has(r.target_session) && !isReplyExpected(r)
      && !r.read_at && !(r.payload && r.payload.kind === PROBE_KIND)
  );
  const maxAgeMs = rows.reduce((m, r) => Math.max(m, nowMs - toMs(r.created_at)), 0);
  return { unactionedCount: rows.length, maxAgeMs };
}

/** IO: run one watchdog tick. FAIL-OPEN; never throws. */
export async function runOutboundSilenceWatchdog(supabase, opts = {}) {
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const result = { probed: [], escalated: [], laneHealth: { unactionedCount: 0, maxAgeMs: 0 } };
  try {
    const since = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const { data: outbound } = await supabase
      .from('session_coordination')
      .select('id, target_session, payload, read_at, acknowledged_at, created_at')
      .eq('sender_type', 'adam')
      .gte('created_at', since)
      .limit(200);
    const { data: sessions } = await supabase
      .from('claude_sessions')
      .select('session_id, heartbeat_at')
      .gte('heartbeat_at', new Date(now - HEARTBEAT_FRESH_MS).toISOString())
      .limit(200);
    const liveIds = new Set((sessions || []).map((s) => s.session_id));

    result.laneHealth = laneHealthAggregate(outbound, liveIds, now);
    const breaches = classifyBreaches(outbound, liveIds, now);

    for (const [target, row] of breaches) {
      if (result.probed.length >= MAX_PROBES_PER_TICK) break; // C1: absolute per-tick cap

      const { data: priorProbes } = await supabase
        .from('session_coordination')
        .select('id, created_at')
        .eq('sender_type', 'adam')
        .eq('target_session', target)
        .eq('payload->>kind', PROBE_KIND)
        .order('created_at', { ascending: false })
        .limit(1);
      const prior = priorProbes && priorProbes[0];
      const priorAgeMs = prior ? now - toMs(prior.created_at) : Infinity;
      if (prior && priorAgeMs < PROBE_DEDUP_MS) continue; // deduped — probed too recently

      if (prior) {
        const today = new Date(now).toISOString().slice(0, 10);
        await emitFeedback({
          supabase,
          title: `Adam outbound-silence: target ${target} still breaching after prior probe`,
          description: `Row ${row.id} at target ${target} remains a reply-expected breach after an earlier channel-health probe went unanswered.`,
          category: 'harness_backlog',
          severity: 'high',
          dedup_key: `outbound-silence:${target}:${today}`,
          metadata: { target_session: target, breaching_row_id: row.id, prior_probe_age_ms: priorAgeMs },
        });
        result.escalated.push({ target, rowId: row.id });
      }

      await supabase.from('session_coordination').insert({
        sender_type: 'adam',
        target_session: target,
        message_type: 'INFO',
        subject: '[ADAM_CHANNEL_HEALTH_PROBE]',
        body: `Channel-health probe: row ${row.id} is a reply-expected breach. Please ack this probe.`,
        payload: { kind: PROBE_KIND, probes_for: row.id, reply_class: 'fire-and-forget' },
        expires_at: new Date(now + PROBE_EXPIRES_MS).toISOString(),
      });
      result.probed.push({ target, rowId: row.id });
    }
  } catch (e) {
    result.error = e && e.message;
  }
  return result;
}
