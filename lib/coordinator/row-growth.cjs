/**
 * Standing row-growth anomaly detection — SD-LEO-INFRA-STANDING-ROW-GROWTH-001.
 *
 * Runaway table growth was discovered by accident: management_reviews reached
 * 45k duplicate rows and sd_baseline_items 13k orphans before anyone noticed.
 * This module gives the coordinator's detector family a standing gauge:
 * a daily snapshot of estimated row counts for the governance tables, persisted
 * as a coordination_events series, with pure anomaly predicates over consecutive
 * snapshots (growth factor and absolute-spike thresholds).
 *
 * Doctrine matches lib/coordinator/detectors.cjs: detection logic is PURE over
 * injected data; the thin IO helpers here do only PostgREST reads/writes and are
 * fail-open. Counts use PostgREST estimated head counts (pg statistics — the
 * same source as pg_class.reltuples) so a snapshot costs one cheap HEAD request
 * per table, never COUNT(*).
 *
 * @module lib/coordinator/row-growth
 */
'use strict';

/** Snapshot cadence gate: due when the last snapshot is older than this. */
const SNAPSHOT_DUE_MS = 22 * 60 * 60 * 1000; // 22h => once per daily cron tick, tolerant of jitter

/** coordination_events event types written by this gauge. */
const SNAPSHOT_EVENT_TYPE = 'ROW_GROWTH_SNAPSHOT';
const ANOMALY_EVENT_TYPE = 'ROW_GROWTH_ANOMALY';

/**
 * Curated governance-table set (the SD's titled scope). Both motivating
 * incidents (management_reviews 45k, sd_baseline_items 13k) are members.
 * Extend freely — unknown tables fail-soft to a null estimate and are skipped.
 */
const GOVERNANCE_TABLES = [
  'strategic_directives_v2',
  'product_requirements_v2',
  'user_stories',
  'sd_phase_handoffs',
  'sd_baseline_items',
  'sd_backlog_map',
  'sub_agent_execution_results',
  'retrospectives',
  'feedback',
  'issue_patterns',
  'quick_fixes',
  'claude_sessions',
  'session_coordination',
  'coordination_events',
  'management_reviews',
  'objectives',
  'key_results',
  'okr_generation_log',
  'leo_protocol_sections',
  'validation_audit_log',
  'eva_scheduler_metrics',
  'learning_decisions',
];

/** Default anomaly thresholds. */
const DEFAULT_OPTS = Object.freeze({
  growthFactor: 1.5,   // matched when current >= prev * growthFactor ...
  minRowsForFactor: 500, // ...but only once a table is big enough that factors mean something
  absSpike: 5000,      // OR matched when current - prev >= absSpike regardless of factor
});

/**
 * PURE: detect per-table growth anomalies between two snapshots.
 * A snapshot is { captured_at: ISO string, tables: { [name]: number } }.
 * Negative growth (cleanup) never matches. Tables absent from either snapshot
 * are skipped (new/removed tables are inventory changes, not growth anomalies).
 *
 * @param {{captured_at?:string, tables:Object<string,number>}|null} prev
 * @param {{captured_at?:string, tables:Object<string,number>}} curr
 * @param {{growthFactor?:number, minRowsForFactor?:number, absSpike?:number}} [opts]
 * @returns {Array<{table:string, prev:number, curr:number, delta:number, factor:number|null, trigger:'growth_factor'|'abs_spike'}>}
 */
function detectRowGrowthAnomalies(prev, curr, opts = {}) {
  const o = { ...DEFAULT_OPTS, ...opts };
  const anomalies = [];
  if (!prev || !prev.tables || !curr || !curr.tables) return anomalies;
  for (const [table, currRaw] of Object.entries(curr.tables)) {
    const prevRaw = prev.tables[table];
    if (!Number.isFinite(prevRaw) || !Number.isFinite(currRaw)) continue;
    const delta = currRaw - prevRaw;
    if (delta <= 0) continue; // shrink/steady is never an anomaly here
    const factor = prevRaw > 0 ? currRaw / prevRaw : null;
    if (delta >= o.absSpike) {
      anomalies.push({ table, prev: prevRaw, curr: currRaw, delta, factor, trigger: 'abs_spike' });
    } else if (prevRaw >= o.minRowsForFactor && factor !== null && factor >= o.growthFactor) {
      anomalies.push({ table, prev: prevRaw, curr: currRaw, delta, factor, trigger: 'growth_factor' });
    }
  }
  return anomalies.sort((a, b) => b.delta - a.delta);
}

/**
 * PURE: is a new snapshot due?
 * @param {string|null} lastCapturedAt - ISO timestamp of the latest snapshot (or null)
 * @param {number} nowMs
 * @param {number} [dueMs]
 * @returns {boolean}
 */
function isSnapshotDue(lastCapturedAt, nowMs, dueMs = SNAPSHOT_DUE_MS) {
  if (!lastCapturedAt) return true;
  const t = new Date(/Z$|[+-]\d{2}:?\d{2}$/.test(String(lastCapturedAt)) ? lastCapturedAt : lastCapturedAt + 'Z').getTime();
  if (!Number.isFinite(t)) return true;
  return nowMs - t >= dueMs;
}

/**
 * IO (fail-soft): estimated row counts for a table list via PostgREST
 * head+estimated (pg statistics, no COUNT(*) scan). A table that errors
 * (missing, RLS) is skipped — never throws.
 * @param {object} sb - supabase client
 * @param {string[]} [tables]
 * @returns {Promise<Object<string, number>>}
 */
async function readTableEstimates(sb, tables = GOVERNANCE_TABLES) {
  const out = {};
  for (const t of tables) {
    try {
      const { count, error } = await sb.from(t).select('*', { count: 'estimated', head: true });
      if (!error && Number.isFinite(count)) out[t] = count;
    } catch { /* fail-soft: skip table */ }
  }
  return out;
}

/**
 * IO (fail-soft): latest persisted snapshot event, or null.
 * @param {object} sb
 * @returns {Promise<{captured_at:string, tables:Object<string,number>}|null>}
 */
async function readLatestSnapshot(sb) {
  try {
    const { data, error } = await sb
      .from('coordination_events')
      .select('payload, created_at')
      .eq('event_type', SNAPSHOT_EVENT_TYPE)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error || !data || !data.length) return null;
    const p = data[0].payload || {};
    if (!p.tables) return null;
    return { captured_at: p.captured_at || data[0].created_at, tables: p.tables };
  } catch { return null; }
}

module.exports = {
  GOVERNANCE_TABLES,
  DEFAULT_OPTS,
  SNAPSHOT_DUE_MS,
  SNAPSHOT_EVENT_TYPE,
  ANOMALY_EVENT_TYPE,
  detectRowGrowthAnomalies,
  isSnapshotDue,
  readTableEstimates,
  readLatestSnapshot,
};
