/**
 * SD-LEO-INFRA-ADAM-DURABLE-STANDING-001 — A STANDING PRIORITY THAT OUTLIVES THE TICK.
 *
 * WHY THIS EXISTS. The chairman set a priority, it was not held, and he intervened twice — then
 * asked for a mechanism rather than a promise. Measured 2026-08-02: grep across lib/ and scripts/
 * for standing_priority / standingPriority / durable_priority returned ZERO hits. Nothing persisted
 * "this is the priority" across ticks, so nothing could survive inbound pressure. The queue setting
 * the agenda was not drift — it was the only behaviour available.
 *
 * THE PAIR THAT DEFINES THE SHAPE. The roadmap anchor he asked for ALREADY EXISTED and was
 * deliberately powerless: work-selection-gate.js observes roadmap linkage correctly, but its header
 * forbids it to "block, reorder or veto". So this module is not a second anchor — it is the durable
 * object the existing anchor had nothing to hold. Linkage is IMPORTED from that gate (isPlanLinked),
 * never re-derived: two places deciding what counts as roadmap evidence is how the three private
 * E2E policy lists diverged, and isPlanLinked's refusal to accept a self-assertion is the property
 * worth keeping.
 *
 * WHERE IT LIVES, AND THE STORE THAT WAS REFUTED. This lands in chairman_dashboard_config.metadata
 * on the single config_key='default' row — the chairman's own config table, whose JSONB metadata
 * already carries fleet-governing knobs read on hot paths (claim_ttl_minutes drives claimGuard's
 * TTL). Zero DDL, and semantically right: a chairman-set priority belongs in chairman config.
 *
 * system_settings was the DESIGNED store and was REFUTED BY A LIVE WRITE, not by review: it carries
 * CHECK constraint valid_setting_keys, a CLOSED enum of exactly three AUTO-safety keys
 * (AUTO_FREEZE, HARD_HALT_STATUS, AUTO_RATE_LIMIT — database/migrations/20260202_safety_boundaries_
 * foundation.sql:16-19). The design had inferred "general-purpose config table" from the three rows
 * it happened to hold; the constraint says the opposite, and a mock that accepted any key kept 27
 * tests and 4 dead mutants green while the real INSERT was impossible. A table's contract cannot be
 * read off its contents. adam_task_ledger was also rejected: no JSONB column at all.
 *
 * CONCURRENCY, STATED PLAINLY: set/clear are read-modify-write on a SHARED metadata blob, so a
 * simultaneous writer to a different metadata key could be lost. Accepted deliberately — the
 * priority is written rarely (a chairman action) and read every tick — and the merge below never
 * drops sibling keys, which is the failure that would actually matter.
 *
 * FAILURE POLICY — THIS IS A DETECTOR, SO IT FAILS QUIET. A guard fails closed; a detector fails
 * quiet. An unreadable store must NEVER render as "priority held": absent measurement is not a
 * pass. Read errors return status 'unknown' and the tick emits nothing rather than a false green.
 */
import { isPlanLinked } from './work-selection-gate.js';

export const SETTINGS_KEY = 'adam_standing_priority';
export const TABLE = 'chairman_dashboard_config';
export const CONFIG_KEY = 'default';

/** Roadmap-derived vs an emergent chairman instruction. Kept DISTINCT in the durable record so a
 *  later reader can never mistake an override for ratified roadmap work. */
export const SOURCES = Object.freeze(['roadmap', 'chairman_override']);

/** SD statuses that count as work actually being routed into the priority. */
export const IN_FLIGHT_STATUSES = Object.freeze(['in_progress', 'pending_approval']);

/**
 * Read the standing priority. Fail-quiet: a missing row is `null` (no priority set — a legitimate
 * state), and an ERROR is distinguished from it so callers never conflate "none" with "unknown".
 * @returns {Promise<{priority:object|null, unknown:boolean}>}
 */
export async function readStandingPriority(sb) {
  try {
    const { data, error } = await sb.from(TABLE).select('id, metadata')
      .eq('config_key', CONFIG_KEY).maybeSingle();
    if (error) return { priority: null, unknown: true };
    const priority = data && data.metadata ? data.metadata[SETTINGS_KEY] : null;
    return { priority: priority || null, unknown: false };
  } catch {
    return { priority: null, unknown: true };
  }
}

/** Fetch the config row so a writer can merge into it. Throws — writers are not fail-quiet. */
async function loadConfigRow(sb) {
  const { data, error } = await sb.from(TABLE).select('id, metadata')
    .eq('config_key', CONFIG_KEY).maybeSingle();
  if (error) throw new Error(`standing-priority: config read failed: ${error.message}`);
  if (!data) throw new Error(`standing-priority: no ${TABLE} row with config_key='${CONFIG_KEY}'`);
  return data;
}

/**
 * Set the standing priority. Upsert on the natural key, so setting REPLACES and never accumulates.
 * @param {object} p - { priority_id, title, source, roadmap_evidence?, linked_sd_keys?, set_by? }
 */
export async function setStandingPriority(sb, p) {
  if (!p || !p.priority_id || !p.title) {
    throw new Error('setStandingPriority: priority_id + title are required');
  }
  if (!SOURCES.includes(p.source)) {
    throw new Error(`setStandingPriority: source must be one of ${SOURCES.join('|')} (got ${p.source})`);
  }
  const value_json = {
    priority_id: p.priority_id,
    title: p.title,
    source: p.source,
    roadmap_evidence: p.roadmap_evidence || null,
    linked_sd_keys: Array.isArray(p.linked_sd_keys) ? p.linked_sd_keys : [],
    set_at: p.set_at || new Date().toISOString(),
    set_by: p.set_by || 'unknown',
  };
  // MERGE, never replace: sibling metadata keys (claim_ttl_minutes, claim_gate_version_floor,
  // sweep_respect_inflight_agent) are live fleet knobs — dropping one would be the real damage.
  const row = await loadConfigRow(sb);
  const metadata = { ...(row.metadata || {}), [SETTINGS_KEY]: value_json };
  const { error } = await sb.from(TABLE).update({ metadata }).eq('id', row.id);
  if (error) throw new Error(`setStandingPriority: ${error.message}`);
  return value_json;
}

/** Remove the standing priority. Idempotent — clearing an absent priority is not an error, and
 *  every sibling metadata key survives. */
export async function clearStandingPriority(sb) {
  const row = await loadConfigRow(sb);
  const metadata = { ...(row.metadata || {}) };
  if (!(SETTINGS_KEY in metadata)) return true;
  delete metadata[SETTINGS_KEY];
  const { error } = await sb.from(TABLE).update({ metadata }).eq('id', row.id);
  if (error) throw new Error(`clearStandingPriority: ${error.message}`);
  return true;
}

/**
 * Is the priority ANCHORED to the roadmap? Decided by the IMPORTED isPlanLinked, applied to the
 * stored roadmap_evidence — no second marker list, no second predicate. A chairman override is
 * legitimately unanchored; that is the "degrees of freedom" half of the chairman's constraint.
 */
export function isRoadmapAnchored(priority) {
  if (!priority) return false;
  return isPlanLinked({ metadata: priority.roadmap_evidence || {} });
}

/**
 * THE DISCRIMINATOR (pure, so it is testable without a database).
 *
 * An idle tick that cannot tell "nothing to do" from "priority unserved" is the defect — those two
 * states produced identical silence, which is what made three silent hours look healthy. This
 * returns a DIFFERENT status for each, and the tick renders them differently.
 *
 * @param {object|null} priority       the stored priority, or null when none is set
 * @param {string[]} inFlightSdKeys    linked SD keys observed to be actually moving
 * @returns {{status:'none'|'served'|'unserved', servedBy:string[], anchored:boolean}}
 */
export function classifyServed(priority, inFlightSdKeys) {
  if (!priority) return { status: 'none', servedBy: [], anchored: false };
  const linked = Array.isArray(priority.linked_sd_keys) ? priority.linked_sd_keys : [];
  const moving = (Array.isArray(inFlightSdKeys) ? inFlightSdKeys : []).filter((k) => linked.includes(k));
  return {
    status: moving.length > 0 ? 'served' : 'unserved',
    servedBy: moving,
    anchored: isRoadmapAnchored(priority),
  };
}

/**
 * Read the store, observe what is actually moving, and classify. Fail-quiet throughout: any error
 * yields status 'unknown', which the tick renders as NOTHING — never as a held priority.
 * @returns {Promise<{status:'none'|'served'|'unserved'|'unknown', priority:object|null, servedBy:string[], anchored:boolean}>}
 */
export async function evaluateStandingPriority(sb) {
  const { priority, unknown } = await readStandingPriority(sb);
  if (unknown) return { status: 'unknown', priority: null, servedBy: [], anchored: false };
  if (!priority) return { status: 'none', priority: null, servedBy: [], anchored: false };

  const linked = Array.isArray(priority.linked_sd_keys) ? priority.linked_sd_keys : [];
  let inFlight = [];
  if (linked.length) {
    try {
      const { data, error } = await sb.from('strategic_directives_v2')
        .select('sd_key, status').in('sd_key', linked).in('status', IN_FLIGHT_STATUSES);
      // A failed observation must not read as "served" — treat it as nothing observed moving.
      if (!error && Array.isArray(data)) inFlight = data.map((r) => r.sd_key);
    } catch { inFlight = []; }
  }
  return { priority, ...classifyServed(priority, inFlight) };
}

export default {
  SETTINGS_KEY, TABLE, CONFIG_KEY, SOURCES, IN_FLIGHT_STATUSES,
  readStandingPriority, setStandingPriority, clearStandingPriority,
  isRoadmapAnchored, classifyServed, evaluateStandingPriority,
};
