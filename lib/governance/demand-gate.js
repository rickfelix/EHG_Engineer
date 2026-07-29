/**
 * SD-LEO-INFRA-SOURCING-ENGINE-BELT-GATED-001 — a DEMAND gate, not a volume cap.
 *
 * CHAIRMAN-DIRECTED. He rejected a "turn two flags on and watch one cycle" plan verbatim: "Is
 * there a way to keep them on, but then make them intelligent enough so they're not overwhelming?
 * My fear is that we're just going to forget that they're off." That fear is the dominant defect
 * class here — AN OFF FLAG IS INDISTINGUISHABLE FROM AN ON-AND-QUIET FLAG. Off has no expiry, no
 * reminder, and nothing that reports it. A watch-one-cycle plan is a VIGILANCE control, and
 * vigilance demonstrably decays in this system (measured the same day: a coordinator skipped an
 * OVERDUE block three ticks running as known noise; Solomon demoted a false staleness WARN to
 * noise by its third reading). A CONDITION does not decay. So: replace the boolean with a
 * condition, and make the condition's verdict observable every run.
 *
 * THE DEFECT THIS REPLACES. lib/sourcing-engine/adam-direct-registry.js:202 bounds a run at 100
 * items and consumes it at :205 as `.slice(0, cap)` over an ALREADY-ENUMERATED population. That
 * is a VOLUME cap: it limits how much a run PRODUCES, never WHETHER it should produce. A 100-item
 * cap floods a saturated belt exactly as fast as a starved one, 100 at a time — which is why the
 * only safe-feeling setting has been off. Verified negative: ripgrep for
 * countDispatchableBacklog|belt-depth|belt_depth|dispatchable across ALL of lib/sourcing-engine/
 * returns ZERO matches. The demand signal exists and the engines are its one non-consumer.
 *
 * ── WHY THIS FILE IS SHAPED THE WAY IT IS ────────────────────────────────────────────────────
 * A NAIVE FLOOR CHECK MOVES THE INVISIBILITY RATHER THAN REMOVING IT, and that would make this SD
 * an instance of its own thesis. Three paths, all silent:
 *   (1) the gauge throws (belt-depth.cjs is deliberately fail-loud) and an unguarded gate
 *       propagates the fault into an unrelated stack;
 *   (2) a fail-soft caller yields null and `null > FLOOR` evaluates FALSE — so the engine SOURCES
 *       ANYWAY. A FAIL-OPEN FLOOD, arrived at by an operator precedence nobody reads;
 *   (3) a catch-and-return leaves an engine permanently quiet, BYTE-IDENTICAL to correctly-quiet.
 * The same trap has a second mouth: a non-finite FLOOR. `5 > NaN` is also false, so a
 * misconfigured floor sources exactly like a null gauge, with the same blast radius.
 *
 * THE FIX IS OPERAND-LEVEL, NOT ASSERTION-LEVEL. normalizeGaugeReading() is the ONLY constructor
 * of a comparable value, and decideDemand() rejects a non-ok reading and a non-finite floor in its
 * FIRST statements. `reading.value > floor` is therefore reachable only where BOTH operands are
 * proven finite. That property holds for callers who do not exist yet — which is precisely what a
 * unit assertion on one call site cannot give you. (TESTING review 372d5539, condition C1.)
 *
 * `unmeasurable` IS A FIRST-CLASS DECISION, never folded into either other outcome. "I could not
 * tell" is the state this whole SD is about; collapsing it into `sourced` re-creates the flood and
 * collapsing it into `withheld` re-creates the silent-off. Callers MUST branch on all three.
 *
 * PURE AND DB-FREE ON PURPOSE (the split documented at lib/governance/drain-inventory.js:9-14):
 * all IO belongs to the caller. A DB-touching decider would route its tests to the vitest `db`
 * project, which resolves to ZERO files unless a designated non-prod target is named — it would
 * report green having executed nothing, which is the same defect class in the test tier.
 *
 * @module governance/demand-gate
 */

/** The three decisions. Exhaustive: a caller that handles two of them has a bug. */
export const DEMAND_DECISION = Object.freeze({
  /** Belt is at or below the floor — demand exists, produce. */
  SOURCED: 'sourced',
  /** Belt is above the floor — real demand is absent, stay quiet. This is a HEALTHY outcome. */
  WITHHELD: 'withheld',
  /** The gauge could not be read, or the floor is not a number. NOT a reason to produce. */
  UNMEASURABLE: 'unmeasurable',
});

/**
 * Wrap a raw gauge result into the ONLY shape decideDemand will compare.
 *
 * Returns a tagged union so an unreadable gauge cannot reach a numeric comparison at all. Accepts
 * either the full countDispatchableBacklog result ({dispatchable, raw, ineligible}) or a bare
 * number, because a caller that already has the count should not have to fabricate an envelope.
 *
 * @param {{dispatchable:number}|number|null|undefined} raw
 * @returns {{ok:true, value:number}|{ok:false, reason:string}}
 */
export function normalizeGaugeReading(raw) {
  if (raw === null || raw === undefined) return { ok: false, reason: 'gauge_absent' };
  const value = typeof raw === 'number' ? raw : raw.dispatchable;
  // Number.isFinite rejects NaN and both Infinities. A gauge that returned NaN is NOT a zero
  // backlog — treating it as one would source into a belt whose depth is unknown.
  if (!Number.isFinite(value)) return { ok: false, reason: 'gauge_not_finite' };
  if (value < 0) return { ok: false, reason: 'gauge_negative' };
  return { ok: true, value };
}

/**
 * Decide whether a producer may source, from an already-obtained gauge reading.
 *
 * PURE: no DB, no fs, no clock beyond the caller-supplied measuredAt. The caller does the IO and
 * hands in the reading, so this stays in the unit tier.
 *
 * Return shape follows lib/cost/governor.js:60-83 ({action, measured, reason}) so a SUPPRESSED run
 * carries its own evidence — a withheld run that cannot say what it measured is the invisibility
 * this SD exists to remove.
 *
 * @param {{ok:boolean, value?:number, reason?:string}} reading  from normalizeGaugeReading
 * @param {number} floor  produce only when value <= floor
 * @param {{engine?:string, measuredAt?:string}} [meta]
 * @returns {{engine:string, gauge_value:(number|null), floor:(number|null),
 *   decision:string, reason:string, measured_at:(string|null)}}
 */
export function decideDemand(reading, floor, meta = {}) {
  const engine = typeof meta.engine === 'string' && meta.engine ? meta.engine : 'unknown';
  const measured_at = typeof meta.measuredAt === 'string' ? meta.measuredAt : null;

  // ── The two guards that make the comparison below safe. Order matters only for the reason
  // string; either failing means we do not know enough to permit production.
  if (!reading || reading.ok !== true) {
    return {
      engine,
      gauge_value: null,
      floor: Number.isFinite(floor) ? floor : null,
      decision: DEMAND_DECISION.UNMEASURABLE,
      reason: `gauge unreadable (${(reading && reading.reason) || 'no_reading'}) — NOT a licence to produce`,
      measured_at,
    };
  }
  if (!Number.isFinite(floor)) {
    // `value > NaN` is false, which would SOURCE. Caught here so a misconfigured floor fails
    // closed-and-loud rather than open-and-silent.
    return {
      engine,
      gauge_value: reading.value,
      floor: null,
      decision: DEMAND_DECISION.UNMEASURABLE,
      reason: 'floor is not a finite number — refusing to compare against it',
      measured_at,
    };
  }

  // Both operands proven finite. This is the only comparison in the module.
  const sourced = reading.value <= floor;
  return {
    engine,
    gauge_value: reading.value,
    floor,
    decision: sourced ? DEMAND_DECISION.SOURCED : DEMAND_DECISION.WITHHELD,
    reason: sourced
      ? `dispatchable ${reading.value} <= floor ${floor} — real demand, producing`
      : `dispatchable ${reading.value} > floor ${floor} — belt already has work, staying quiet (this is healthy, not a fault)`,
    measured_at,
  };
}

/**
 * True only for the decision that permits production. Exists so no caller re-implements the
 * comparison and accidentally re-introduces a truthiness check on the whole object (every
 * decision object is truthy, including `withheld`).
 * @param {{decision?:string}} d
 * @returns {boolean}
 */
export function mayProduce(d) {
  return !!d && d.decision === DEMAND_DECISION.SOURCED;
}

/**
 * One-line rendering. Prints the numbers UNCONDITIONALLY — including zeroes — following
 * lib/coordinator/worker-signal-starvation.cjs:18, so measured-and-withheld is distinguishable
 * from never-ran. A gate whose quiet run prints nothing is the defect wearing a new hat.
 * @param {ReturnType<typeof decideDemand>|null|undefined} d
 * @param {string} [engineName] names the engine in the NEVER-RAN case, where there is no decision
 *   object to read it from — "which engine never ran" is the actionable half of that line.
 * @returns {string}
 */
export function formatDemandDecision(d, engineName) {
  if (!d) return `[demand-gate] ${engineName || 'sourcing engine'}: NEVER RAN — no decision recorded (this is NOT the same as withheld)`;
  if (d.decision === DEMAND_DECISION.UNMEASURABLE) {
    return `[demand-gate] ${d.engine}: UNMEASURABLE gauge=${d.gauge_value ?? 'n/a'} floor=${d.floor ?? 'n/a'} — ${d.reason}`;
  }
  return `[demand-gate] ${d.engine}: ${d.decision.toUpperCase()} gauge=${d.gauge_value} floor=${d.floor} — ${d.reason}`;
}

/**
 * PRODUCERS GATED ON BELT DEPTH — an explicit membership list, not an implicit convention.
 *
 * The load-bearing axis is WHICH TABLE A PRODUCER WRITES, not routing-vs-generative. These write
 * strategic_directives_v2 / quick_fixes, so they move the number this gauge counts.
 *
 * Deliberately EXCLUDED (they write roadmap_wave_items — STAGING — and do not move belt depth at
 * all): gauge-gap-miner, proactive-populator, adam-direct-registry. Gating corpus PREPARATION on
 * the state of the BELT is the wrong instrument, and classifyCorpusGatedDeficit
 * (scripts/lib/sourcing-engine-awareness.mjs:144) already establishes that a thin corpus-gated
 * belt is the CORRECT state. Note adam-direct-registry is the 100-cap the SD spine leads with —
 * verification showed it registers ALREADY-EXISTING SDs and adds zero belt depth.
 *
 * Exported as data so a test can assert membership. An "assert the stagers still work" test would
 * assert the absence of a change to files this SD never touches — green before, green after, and
 * green if this module were deleted. Membership can actually fail. (TESTING review 372d5539.)
 */
export const BELT_DEPTH_GATED_PRODUCERS = Object.freeze([
  'refill-auto-promote',
  'fr-c-generator',
]);

/** Stagers, named so their exclusion is a recorded decision rather than an oversight. */
export const STAGING_PRODUCERS_NOT_GATED = Object.freeze([
  'gauge-gap-miner',
  'proactive-populator',
  'adam-direct-registry',
]);

