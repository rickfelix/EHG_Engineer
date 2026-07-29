/**
 * SD-LEO-INFRA-SOURCING-ENGINE-BELT-GATED-001 — FR-3. The IO half of the demand gate:
 * MEASURE the gauge, RECORD the decision, READ it back for a human.
 *
 * WHY THIS IS A SEPARATE FILE. demand-gate.js is pure and DB-free on purpose (its header explains
 * that a DB-touching decider routes its own tests into the vitest `db` project, which resolves to
 * ZERO files and reports green having executed nothing). All IO lives here so that split holds.
 *
 * WHY FR-3 EXISTS AT ALL — it is the FR that stops this SD becoming an instance of its own thesis.
 * FR-1 replaced a boolean nobody noticed with a CONDITION. A condition nobody notices is no better:
 * an engine that correctly withholds forever looks exactly like an engine that is off, or crashed,
 * or was never wired. The gate only pays for itself if its verdict is READABLE, so the decision is
 * emitted on EVERY run — sourced, withheld and unmeasurable alike — and rendered in the same badge
 * that prints the flag line, per the unconditional-print precedent at
 * lib/coordinator/worker-signal-starvation.cjs:18.
 *
 * ── THE THREE FAILURE MODES THIS FILE IS SHAPED AROUND ──────────────────────────────────────────
 * (1) THE GAUGE IS FAIL-LOUD. belt-depth.cjs:78 passes throwOnError deliberately: a dependency
 *     query it cannot verify must NOT be counted as dispatchable. Letting that throw propagate
 *     would take down the hourly cron, so measureDemand catches it — and maps it to UNMEASURABLE,
 *     never to a number. Catch-and-continue would be fail-open; catch-and-withhold is fail-closed
 *     AND visible, which is the whole point.
 * (2) A RECORDING FAILURE MUST NOT CHANGE THE DECISION, but it must be loud. If recording silently
 *     failed we would have a run that produced and left no trace — invisible production, this SD's
 *     defect with the sign flipped. So recordDemandDecision returns a boolean and complains to
 *     stderr; it never throws, and it never gates production.
 * (3) A MALFORMED RECORD MUST NOT READ AS A DECISION. readLastDemandDecision returns null for "no
 *     run recorded" (which renders NEVER RAN) but a synthetic UNMEASURABLE for a row that exists
 *     and is unreadable — because a truthy-but-corrupt cache that suppresses the honest fallback is
 *     its own well-known trap. "I found a record I cannot parse" is not "no record".
 *
 * NO DDL. audit_log already exists with a jsonb `metadata` column and is the repo's append-only
 * event sink. A purpose-built table would need a chairman-gated prod apply to make an observability
 * line readable — disproportionate, and the ceremony would be the reason FR-3 got deferred.
 * Write/read round-trip verified against the live table before this file was written (service-role
 * insert returned the row rather than the 200/error:null/0-rows shape an RLS rejection produces).
 *
 * @module governance/demand-gate-emit
 */
import { countDispatchableBacklog } from '../fleet/belt-depth.cjs';
import { normalizeGaugeReading, decideDemand } from './demand-gate.js';

/** audit_log.event_type for a demand-gate verdict. One event, every decision. */
export const DEMAND_GATE_EVENT = 'DEMAND_GATE_DECISION';

/**
 * Belt depth at or below which production is warranted.
 *
 * NOT a magic number and NOT a permanent one. The fleet runs at most 3 concurrent worker seats, so
 * 3 claimable items ≈ one per seat — enough that no seat idles, few enough that the belt is not
 * being stuffed. The nearest existing constant, BELT_BUFFER=1 at
 * scripts/coordinator-capacity-forecast.mjs:104, is demand-RELATIVE (idle+freeing-soon workers plus
 * a buffer) rather than absolute, so it could not be reused directly without importing the
 * forecaster's whole worker-state read into an hourly cron.
 *
 * The honest status of this value is STARTING POINT. It is exactly what FR-3's emission makes
 * tunable: once gauge_value and floor are recorded on every run, the floor stops being a guess and
 * becomes a choice against an observed series. Overridable per-deployment via BELT_DEMAND_FLOOR.
 */
export const DEFAULT_DEMAND_FLOOR = 3;

/**
 * Resolve the floor from env. A PRESENT-BUT-UNPARSEABLE value yields NaN on purpose: decideDemand
 * rejects a non-finite floor as UNMEASURABLE, so `BELT_DEMAND_FLOOR=lots` withholds loudly instead
 * of silently reverting to the default. Absent means "no opinion" and takes the default; garbage
 * means someone tried to configure this and got it wrong, which must not look like success.
 * @param {Record<string,string|undefined>} [env]
 * @returns {number} finite floor, or NaN when configured-but-invalid
 */
export function resolveDemandFloor(env = process.env) {
  const raw = env ? env.BELT_DEMAND_FLOOR : undefined;
  if (raw === undefined || raw === null || raw === '') return DEFAULT_DEMAND_FLOOR;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

/**
 * Read the gauge and decide. The ONE place a producer needs to call before minting.
 *
 * @param {object} supabase service-role client
 * @param {{engine:string, floor?:number, now?:string, gauge?:Function}} opts
 *   `gauge` is injectable so the failure modes above are unit-testable without a database — the
 *   real gauge needs live rows to throw, and a failure path nobody can exercise is not a guard.
 * @returns {Promise<ReturnType<typeof decideDemand>>} always a decision, never a throw
 */
export async function measureDemand(supabase, { engine, floor, now, gauge = countDispatchableBacklog } = {}) {
  let raw = null;
  try {
    raw = await gauge(supabase);
  } catch (e) {
    // Failure mode (1). The reading stays null → normalizeGaugeReading → UNMEASURABLE → withheld.
    // Note what is NOT here: no `raw = { dispatchable: 0 }` fallback. Treating an unread gauge as
    // an empty belt is the fail-open flood in its most tempting disguise.
    if (typeof process !== 'undefined' && process.stderr) {
      process.stderr.write(`[demand-gate] gauge read failed for ${engine}: ${e && e.message} — withholding\n`);
    }
  }
  return decideDemand(normalizeGaugeReading(raw), floor, {
    engine,
    measuredAt: now || new Date().toISOString(),
  });
}

/**
 * Persist a decision. Best-effort by design (failure mode 2): returns false and warns rather than
 * throwing, because losing the audit line must never stop — or start — production.
 * @returns {Promise<boolean>} true when the row was written AND returned
 */
export async function recordDemandDecision(supabase, decision) {
  if (!supabase || !decision) return false;
  try {
    const { data, error } = await supabase.from('audit_log').insert({
      event_type: DEMAND_GATE_EVENT,
      entity_type: 'sourcing_engine',
      entity_id: decision.engine,
      metadata: decision,
      severity: decision.decision === 'unmeasurable' ? 'warning' : 'info',
      created_by: 'demand-gate',
    }).select('id');
    if (error) throw new Error(error.message);
    // .select() is not decorative: a silently-rejected insert in this codebase returns HTTP 200
    // with error=null and zero rows, so "no error" alone is not evidence the row landed.
    return (data || []).length > 0;
  } catch (e) {
    if (typeof process !== 'undefined' && process.stderr) {
      process.stderr.write(`[demand-gate] decision NOT recorded for ${decision.engine}: ${e && e.message}\n`);
    }
    return false;
  }
}

/**
 * Read the most recent recorded decision for one engine.
 *
 * @returns {Promise<object|null>} the decision, null when NOTHING has ever been recorded (which the
 *   renderer prints as NEVER RAN), or a synthetic UNMEASURABLE when a row exists but is unreadable
 *   (failure mode 3 — never silently downgraded to "no run").
 */
export async function readLastDemandDecision(supabase, engine) {
  if (!supabase || !engine) return null;
  let row;
  try {
    const { data, error } = await supabase
      .from('audit_log')
      .select('metadata, created_at')
      .eq('event_type', DEMAND_GATE_EVENT)
      .eq('entity_id', engine)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    row = (data || [])[0];
  } catch (e) {
    // A read fault is NOT "never ran" either — the badge must not report a healthy silence it
    // could not verify.
    return {
      engine, gauge_value: null, floor: null, decision: 'unmeasurable',
      reason: `could not read the decision log (${e && e.message})`, measured_at: null,
    };
  }
  if (!row) return null;
  const m = row.metadata;
  if (!m || typeof m !== 'object' || typeof m.decision !== 'string') {
    return {
      engine, gauge_value: null, floor: null, decision: 'unmeasurable',
      reason: 'a decision row exists but its payload is unreadable — this is NOT a run that never happened',
      measured_at: row.created_at || null,
    };
  }
  return m;
}
