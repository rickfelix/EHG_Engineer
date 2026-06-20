/**
 * Vision-ladder placement rules — SD-LEO-INFRA-VISION-LADDER-ROADMAP-COHERENCE-001 (FR-2).
 *
 * A reviewable, FROZEN registry of rung-placement rules + a pure evaluator. Mirrors the house
 * frozen-registry style (lib/governance/guardrail-registry.js, lib/adam/adherence-probes.js):
 * frozen data, pure total functions, fail-loud at import, no IO.
 *
 * The canonical rule encodes the chairman-ratified re-cut (SD-LEO-INFRA-VISION-LADDER-V1-V2-RECUT-001):
 * the four REVENUE capabilities belong on the revenue rung (V2), NOT the foundation rung (V1).
 *
 * CRITICAL SCOPING: the rule is keyed to those four NAMED revenue capabilities, NOT to all
 * `nature === 'operational'` criteria. Six operational KR/governance capabilities (e.g.
 * "Solo-operator survivability", "All 7 governance guardrails") CORRECTLY live in V1 — flagging them
 * would be a false violation that, if it ever gated the gauge, would suppress the live chairman gauge.
 *
 * ESM module (the repo is "type":"module"); imported by lib/vision/vdr-registry.js and vitest.
 */

/**
 * The four revenue/income capabilities the re-cut moved from the V1 foundation rung to the V2
 * revenue rung. These names byte-match vision_ladder_criteria.capability rows. FROZEN.
 */
export const REVENUE_CAPABILITIES = Object.freeze([
  'Take a real dollar',
  'See distance-to-quit',
  'Run a self-operating venture',
  'Compound venture-level learning',
]);

const REVENUE_CAPABILITY_SET = new Set(REVENUE_CAPABILITIES);

/**
 * The frozen rule registry. Each rule:
 *   - id          stable identifier
 *   - description human-readable contract
 *   - check(criterion) => { ok: boolean, violation?: {rule, capability, rung_key, reason} }
 *     where criterion is { capability, rung_key, nature }. PURE — no IO.
 */
export const PLACEMENT_RULES = Object.freeze([
  Object.freeze({
    id: 'REVENUE-NOT-IN-FOUNDATION',
    description:
      'A revenue capability (Take a real dollar / See distance-to-quit / Run a self-operating venture / ' +
      'Compound venture-level learning) must NOT sit on the foundation rung V1 — it belongs on the ' +
      'revenue rung V2. Scoped to those four named capabilities only (NOT all operational-nature criteria).',
    check(criterion) {
      const cap = criterion && criterion.capability;
      const rung = criterion && criterion.rung_key;
      if (REVENUE_CAPABILITY_SET.has(cap) && rung === 'V1') {
        return {
          ok: false,
          violation: {
            rule: 'REVENUE-NOT-IN-FOUNDATION',
            capability: cap,
            rung_key: rung,
            reason: 'revenue capability placed on the foundation rung V1 (belongs on revenue rung V2)',
          },
        };
      }
      return { ok: true };
    },
  }),
]);

/** A criterion is a non-null object with at least a capability + rung_key. */
function isCriterion(c) {
  return c && typeof c === 'object' && typeof c.capability === 'string' && typeof c.rung_key === 'string';
}

/**
 * Evaluate every placement rule against every criterion. PURE and TOTAL — never throws, even on
 * hostile input (malformed criteria are skipped, not crashed on). Returns the flat list of
 * violations (empty when all placements are correct).
 *
 * @param {Array<{capability:string, rung_key:string, nature?:string}>} criteria
 * @returns {{ ok: boolean, violations: Array<object> }}
 */
export function evaluatePlacement(criteria) {
  const violations = [];
  for (const c of Array.isArray(criteria) ? criteria : []) {
    if (!isCriterion(c)) continue;
    for (const rule of PLACEMENT_RULES) {
      let res;
      try {
        res = rule.check(c);
      } catch (_) {
        continue; // a throwing rule never crashes the evaluation
      }
      if (res && res.ok === false && res.violation) violations.push(res.violation);
    }
  }
  return { ok: violations.length === 0, violations };
}

/** Coherence guard (house style): every rule must have an id, description, and a check function. */
export function assertPlacementRulesValid() {
  const bad = [];
  for (const r of PLACEMENT_RULES) {
    if (!r || typeof r !== 'object') { bad.push('<non-object rule>'); continue; }
    if (typeof r.id !== 'string' || !r.id) bad.push('<rule missing id>');
    else if (typeof r.description !== 'string' || !r.description) bad.push(`${r.id}: missing description`);
    else if (typeof r.check !== 'function') bad.push(`${r.id}: missing check function`);
  }
  if (bad.length) throw new Error(`placement-rules registry incoherent: ${bad.join('; ')}`);
  return true;
}

// Loud at import: a malformed rule fails fast (house style).
assertPlacementRulesValid();
