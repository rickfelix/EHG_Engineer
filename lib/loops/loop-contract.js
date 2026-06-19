/**
 * Canonical Loop-Contract schema + validator.
 *
 * SD-LEO-INFRA-LOOP-CONTRACT-FRAMEWORK-001 (FR-1)
 *
 * A typed contract every operational loop (Adam/coordinator ticks, CI-triage,
 * distill, future V2 venture loops) can declare, so loops are self-describing,
 * bounded, and auditable. This module is the SCHEMA + a pure, fail-loud validator —
 * it builds no loops and runs none.
 *
 * A loop contract has the chairman's named fields:
 *   - id         : stable identifier (e.g. 'LOOP-CI-AUTOTRIAGE-001')
 *   - name       : human label
 *   - goals      : (string | { description, type:GOAL_TYPE, metric?, rubric_ref? })[] — what the loop is
 *                  FOR (>=1). A bare string is back-compat (verifiable); a typed object declares whether the
 *                  goal is VERIFIABLE (deterministic; SHOULD carry a metric) or LLM_AS_JUDGE (MUST carry a rubric_ref).
 *   - workflow   : ordered step objects { step:number, name:string, action?:string } (>=1)
 *   - boundaries : { kind: 'may'|'may_not', description:string }[] — explicit limits
 *                  (>=1 of EACH kind: a loop must say both what it may and may NOT do)
 *   - tasks      : object[]   — concrete artifacts (entrypoint/config/etc.) (optional, type-checked)
 *   - timeline   : { cadence:string, type?:CADENCE_TYPE, ... } — when it runs (cadence required)
 *   - logging    : object     — the logging contract (what it writes) (optional, type-checked)
 *   - budget     : { tokens_per_run_estimate?, daily_max_runs?, pause_if_budget_below_pct? } — declared
 *                  run-cost (optional, declaration only; enforcement is a follow-on)
 *
 * Design mirrors lib/adam/adherence-probes.js + lib/governance/guardrail-registry.js:
 * frozen enums, pure total functions, fail-loud (never silent-pass).
 */

export const CADENCE_TYPE = Object.freeze({
  CRON: 'cron',
  INTERVAL: 'interval',
  EVENT: 'event',
  MANUAL: 'manual',
});

export const BOUNDARY_KIND = Object.freeze({
  MAY: 'may',
  MAY_NOT: 'may_not',
});

/**
 * SD-LEO-INFRA-LOOP-CONTRACT-GOAL-TYPE-BUDGET-001 (FR-1): how a loop's goal is judged.
 *   VERIFIABLE   — a deterministic signal + threshold decides done/not-done (SHOULD carry a `metric`).
 *   LLM_AS_JUDGE — a qualitative rubric decides; MUST carry a `rubric_ref` (the anti-brittleness guard:
 *                  a judge-style goal without a defined rubric is exactly the brittle failure mode to block).
 */
export const GOAL_TYPE = Object.freeze({
  VERIFIABLE: 'verifiable',
  LLM_AS_JUDGE: 'llm_as_judge',
});

/** Canonical field list (the chairman's named fields). Required vs optional below. */
export const LOOP_CONTRACT_FIELDS = Object.freeze([
  'id', 'name', 'goals', 'workflow', 'boundaries', 'tasks', 'timeline', 'logging', 'budget',
]);

/** Required fields — absence/emptiness => invalid (fail-loud). */
const REQUIRED_FIELDS = Object.freeze(['id', 'name', 'goals', 'workflow', 'boundaries', 'timeline']);

const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;
const isNonEmptyArray = (v) => Array.isArray(v) && v.length > 0;

/**
 * Validate a loop contract. PURE and TOTAL — never throws, even on hostile input
 * (a throwing getter degrades to valid:false). Returns the offending field(s) by name.
 *
 * @param {Object} contract
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateLoopContract(contract) {
  const errors = [];
  try {
    if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
      return { valid: false, errors: ['contract must be a non-null object'] };
    }

    // id / name — non-empty strings
    if (!isNonEmptyString(safeGet(contract, 'id'))) errors.push('id: required non-empty string');
    if (!isNonEmptyString(safeGet(contract, 'name'))) errors.push('name: required non-empty string');

    // goals — non-empty array. Each goal is EITHER a bare non-empty string (back-compat: treated as a
    // verifiable goal) OR a typed object { description, type, metric?, rubric_ref? } (FR-1). A
    // type=llm_as_judge goal MUST carry a rubric_ref (fail-loud anti-brittleness guard).
    const goals = safeGet(contract, 'goals');
    if (!isNonEmptyArray(goals)) {
      errors.push('goals: required non-empty array');
    } else {
      const goalTypes = new Set(Object.values(GOAL_TYPE));
      goals.forEach((g, i) => {
        if (isNonEmptyString(g)) return; // bare string = verifiable (back-compat), allowed
        if (!g || typeof g !== 'object' || Array.isArray(g)) {
          errors.push(`goals[${i}]: must be a non-empty string or a { description, type } object`);
          return;
        }
        if (!isNonEmptyString(g.description)) errors.push(`goals[${i}].description: required non-empty string`);
        if (!goalTypes.has(g.type)) errors.push(`goals[${i}].type: must be one of {${[...goalTypes].join(',')}}`);
        if (g.type === GOAL_TYPE.LLM_AS_JUDGE && !isNonEmptyString(g.rubric_ref)) {
          errors.push(`goals[${i}]: type=llm_as_judge requires a non-empty rubric_ref (anti-brittleness guard)`);
        }
      });
    }

    // workflow — non-empty array of ordered step objects
    const workflow = safeGet(contract, 'workflow');
    if (!isNonEmptyArray(workflow)) {
      errors.push('workflow: required non-empty array of ordered steps');
    } else {
      const bad = workflow.some((w) => !w || typeof w !== 'object' || typeof w.step !== 'number' || Number.isNaN(w.step) || !isNonEmptyString(w.name));
      if (bad) errors.push('workflow: each step needs a numeric step and a non-empty name');
    }

    // boundaries — >=1 MAY and >=1 MAY_NOT, each with a description
    const boundaries = safeGet(contract, 'boundaries');
    if (!isNonEmptyArray(boundaries)) {
      errors.push('boundaries: required non-empty array of {kind, description}');
    } else {
      const kinds = new Set(Object.values(BOUNDARY_KIND));
      const shapeBad = boundaries.some((b) => !b || typeof b !== 'object' || !kinds.has(b.kind) || !isNonEmptyString(b.description));
      if (shapeBad) errors.push(`boundaries: each needs kind in {${[...kinds].join(',')}} and a non-empty description`);
      const hasMay = boundaries.some((b) => b && b.kind === BOUNDARY_KIND.MAY);
      const hasMayNot = boundaries.some((b) => b && b.kind === BOUNDARY_KIND.MAY_NOT);
      if (!hasMay) errors.push('boundaries: must declare at least one "may"');
      if (!hasMayNot) errors.push('boundaries: must declare at least one "may_not"');
    }

    // timeline — object with a non-empty cadence string; type (if present) must be a known CADENCE_TYPE
    const timeline = safeGet(contract, 'timeline');
    if (!timeline || typeof timeline !== 'object' || Array.isArray(timeline)) {
      errors.push('timeline: required object with a cadence');
    } else {
      if (!isNonEmptyString(timeline.cadence)) errors.push('timeline.cadence: required non-empty string');
      if (timeline.type !== undefined && !Object.values(CADENCE_TYPE).includes(timeline.type)) {
        errors.push(`timeline.type: must be one of {${Object.values(CADENCE_TYPE).join(',')}}`);
      }
    }

    // tasks — optional, but if present must be an array of objects
    const tasks = safeGet(contract, 'tasks');
    if (tasks !== undefined && (!Array.isArray(tasks) || tasks.some((t) => !t || typeof t !== 'object'))) {
      errors.push('tasks: when present, must be an array of objects');
    }

    // logging — optional, but if present must be an object
    const logging = safeGet(contract, 'logging');
    if (logging !== undefined && (typeof logging !== 'object' || logging === null || Array.isArray(logging))) {
      errors.push('logging: when present, must be an object');
    }

    // budget — optional DECLARATION (FR-2): { tokens_per_run_estimate?, daily_max_runs?,
    // pause_if_budget_below_pct? }. Each present field must be a non-negative number; the pct field is
    // 0-100. This SD declares the budget only — enforcement/auto-pause in the cron executor is a follow-on.
    const budget = safeGet(contract, 'budget');
    if (budget !== undefined) {
      if (typeof budget !== 'object' || budget === null || Array.isArray(budget)) {
        errors.push('budget: when present, must be an object');
      } else {
        for (const k of ['tokens_per_run_estimate', 'daily_max_runs', 'pause_if_budget_below_pct']) {
          const v = budget[k];
          if (v !== undefined && (typeof v !== 'number' || Number.isNaN(v) || v < 0)) {
            errors.push(`budget.${k}: when present, must be a non-negative number`);
          }
        }
        if (typeof budget.pause_if_budget_below_pct === 'number' && budget.pause_if_budget_below_pct > 100) {
          errors.push('budget.pause_if_budget_below_pct: must be between 0 and 100');
        }
      }
    }
  } catch (e) {
    return { valid: false, errors: [`validation threw (treated as invalid): ${e && e.message}`] };
  }
  return { valid: errors.length === 0, errors };
}

/** Read a property without letting a throwing getter blow up the validator. */
function safeGet(obj, key) {
  try { return obj[key]; } catch (_) { return undefined; }
}
