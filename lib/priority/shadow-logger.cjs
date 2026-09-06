/**
 * Shadow disagreement logger — SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-B (Child B), FR-3.
 *
 * Writes to the EXISTING generic audit_log table (database/migrations/
 * 20260202_sd_type_change_governance_fixed.sql:12) — zero new schema. Only genuine rank
 * disagreements between the live comparator's actual order and this module's shadow order
 * are logged, to keep volume bounded.
 *
 * SAFETY CONTRACT: shadowCompareAndLog() must NEVER throw into a caller's live sort path and
 * must NEVER touch the `items`/`liveOrder` arrays it is given — every failure mode (bad
 * arguments, a scoring bug, a DB error) degrades to a no-op-with-warning, not an exception.
 * This is the single property the whole child's safety rests on (byte-identical live order),
 * so every layer here — the try/catch around scoring, the internal .catch() on the async
 * write — exists to defend it independently, not for redundancy's own sake.
 */

'use strict';

const { createSupabaseServiceClient } = require('../supabase-client.cjs');
const { computePriorityScore, compareByPriorityScore, COMPARATOR_VERSION } = require('./comparator.cjs');

const AUDIT_LOG_TABLE = 'audit_log';
const EVENT_TYPE = 'priority_shadow_disagreement';
/** audit_log.severity has CHECK (severity IN ('info','warning','error','critical')) — a
 * shadow disagreement is informational calibration data, never an error/warning by itself. */
const SEVERITY = 'info';
const CREATED_BY = 'priority-shadow-comparator';

function isShadowComparatorEnabled() {
  return String(process.env.PRIORITY_SHADOW_COMPARATOR || '').toLowerCase() !== 'off';
}

/**
 * Pure. Given the live order (array of keys, in the order the live comparator actually
 * produced) and the shadow-scored, shadow-sorted items, returns only the entries whose rank
 * differs between the two orders.
 * @param {Array<string>} liveOrderKeys
 * @param {Array<{key: string, score: {score: number|'UNSCORED', components: object}}>} shadowScored — already sorted by compareByPriorityScore
 */
function findDisagreements(liveOrderKeys, shadowScored) {
  if (!Array.isArray(liveOrderKeys) || !Array.isArray(shadowScored)) return [];
  const shadowRankByKey = new Map(shadowScored.map((entry, index) => [entry.key, index]));
  const disagreements = [];
  for (let liveRank = 0; liveRank < liveOrderKeys.length; liveRank += 1) {
    const key = liveOrderKeys[liveRank];
    const shadowRank = shadowRankByKey.get(key);
    if (shadowRank === undefined || shadowRank === liveRank) continue;
    const shadowEntry = shadowScored[shadowRank];
    disagreements.push({
      key,
      liveRank,
      liveNeighborKeys: [liveOrderKeys[liveRank - 1], liveOrderKeys[liveRank + 1]].filter((k) => k !== undefined),
      shadowRank,
      shadowScore: shadowEntry.score.score,
      components: shadowEntry.score.components,
    });
  }
  return disagreements;
}

/** I/O. Best-effort: any failure (client creation, the insert call itself, a DB error) is
 * logged and swallowed here, never thrown or rejected past this function. */
async function logDisagreements(disagreements, { callSite, entityType, client } = {}) {
  if (!Array.isArray(disagreements) || disagreements.length === 0) return { written: 0 };
  const rows = disagreements.map((d) => ({
    event_type: EVENT_TYPE,
    entity_type: entityType,
    entity_id: String(d.key),
    old_value: { live_rank: d.liveRank, live_neighbor_keys: d.liveNeighborKeys },
    new_value: { shadow_rank: d.shadowRank, shadow_score: d.shadowScore, components: d.components },
    metadata: { comparator_version: COMPARATOR_VERSION, call_site: callSite },
    severity: SEVERITY,
    created_by: CREATED_BY,
  }));
  try {
    const supabase = client || createSupabaseServiceClient();
    const { error } = await supabase.from(AUDIT_LOG_TABLE).insert(rows);
    if (error) {
      console.warn(`[priority-shadow-logger] audit_log insert failed (non-blocking): ${error.message}`);
      return { written: 0, error: error.message };
    }
    return { written: rows.length };
  } catch (err) {
    console.warn(`[priority-shadow-logger] logging failed (non-blocking): ${err?.message || err}`);
    return { written: 0, error: err?.message || String(err) };
  }
}

/**
 * Orchestrates a shadow comparison against a caller's already-produced live order and
 * best-effort logs any disagreements. Returns a Promise that never rejects.
 *
 * @param {object} args
 * @param {Array<object>} args.items — the same items the live comparator sorted (read-only; never mutated)
 * @param {(item: object) => string} args.keyOf — extracts a stable dedup key (e.g. sd_key/qf id)
 * @param {(item: object) => {criticality?: number, alignment?: number, leverage?: number, age?: number}} args.scoreInputsOf
 * @param {Array<string>} args.liveOrder — keys in the order the live comparator actually produced
 * @param {string} args.callSite — e.g. 'coordinator-backlog-rank.mjs:363'
 * @param {'sd'|'qf'} args.entityType
 * @param {object} [args.client] — injectable Supabase client, for tests
 */
function shadowCompareAndLog({ items, keyOf, scoreInputsOf, liveOrder, callSite, entityType, client } = {}) {
  if (!isShadowComparatorEnabled()) return Promise.resolve({ skipped: true, reason: 'disabled' });
  try {
    if (!Array.isArray(items) || typeof keyOf !== 'function' || typeof scoreInputsOf !== 'function' || !Array.isArray(liveOrder)) {
      return Promise.resolve({ skipped: true, reason: 'invalid_arguments' });
    }
    const shadowScored = items
      .map((item) => ({ key: keyOf(item), score: computePriorityScore(item, scoreInputsOf(item) || {}) }))
      .sort((a, b) => compareByPriorityScore(a.score, b.score));
    const disagreements = findDisagreements(liveOrder, shadowScored);
    return logDisagreements(disagreements, { callSite, entityType, client }).catch((err) => {
      console.warn(`[priority-shadow-logger] logging failed (non-blocking): ${err?.message || err}`);
      return { written: 0, error: err?.message || String(err) };
    });
  } catch (err) {
    console.warn(`[priority-shadow-logger] shadow computation failed (non-blocking): ${err?.message || err}`);
    return Promise.resolve({ skipped: true, error: err?.message || String(err) });
  }
}

module.exports = {
  AUDIT_LOG_TABLE,
  EVENT_TYPE,
  isShadowComparatorEnabled,
  findDisagreements,
  logDisagreements,
  shadowCompareAndLog,
};
