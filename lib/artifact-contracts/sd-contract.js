/**
 * SD artifact contract — declarative field specs for Strategic Directive
 * authoring payloads (SD-LEO-INFRA-ARTIFACT-CONTRACT-SINGLE-001).
 *
 * The metrics-sufficiency rule is NOT re-implemented here: validateSdArtifact
 * DELEGATES to the canonical validateMetricsSufficiency in
 * scripts/modules/handoff/verifiers/lead-to-plan/sd-validation.js (the same
 * pure function the GATE_SD_METRICS_SUFFICIENCY gate and the LEAD-TO-PLAN
 * verifier already share) — one source, zero drift.
 *
 * Field hints quote the documented folklore traps so authors discover the
 * contract from `npm run contract:check -- sd <file>` instead of by failing
 * gates one at a time.
 */
import { validateMetricsSufficiency } from '../../scripts/modules/handoff/verifiers/lead-to-plan/sd-validation.js';

/** Boilerplate smoke-step phrases the SMOKE_TEST_SPECIFICATION gate rejects.
 *  Advisory (warning) in the contract — the gate itself is the enforcement. */
export const BOILERPLATE_SMOKE_PATTERNS = [
  /run the modified script/i,
  /verify output matches expected behavior/i,
  /confirm no regressions in related workflows/i,
  /script executes without errors/i,
  /output is correct and complete/i,
  /existing functionality unchanged/i,
];

/** @type {import('./prd-contract.js').FieldSpec[]} */
export const SD_FIELD_SPECS = [
  {
    field: 'success_metrics', shape: 'arrayOfObjects',
    itemKeys: ['metric', 'target', 'actual'],
    hint: '>=3 UNIQUE entries required (GATE_SD_METRICS_SUFFICIENCY dedups by text — padding with duplicates fails). Achievement scoring parses `actual` LEADING WITH A NUMBER (e.g. "8/8 — ..." or "0 — ..."); operator-prefixed targets (">=3", "<=0", unicode >=/<=) are supported post SD-FDBK-FIX-FIX-SUCCESS-METRICS-001. Validation DELEGATES to the canonical validateMetricsSufficiency.',
    gate: 'GATE_SD_METRICS_SUFFICIENCY (LEAD-TO-PLAN; also fires at PLAN-TO-LEAD)',
  },
  {
    field: 'success_criteria', shape: 'arrayOfObjects',
    itemKeys: ['criterion', 'measure'],
    hint: 'Alternative to success_metrics — at least ONE of the two must be populated with valid structure or LEAD-TO-PLAN fails GATE_SD_TRANSITION_READINESS.',
    gate: 'GATE_SD_TRANSITION_READINESS',
  },
  {
    field: 'smoke_test_steps', shape: 'arrayOfObjects',
    itemKeys: ['step_number', 'instruction', 'expected_outcome'],
    hint: 'The SMOKE_TEST_SPECIFICATION gate reads this TOP-LEVEL SD column (a metadata-located copy is only recovered via the auto-hoist fallback from SD-FDBK-FIX-FIX-SMOKE-TEST-001). Code-producing infrastructure SDs REQUIRE it. Steps must be CONCRETE + observable — auto-seeded boilerplate ("Run the modified script...") FAILS the gate.',
    gate: 'SMOKE_TEST_SPECIFICATION (LEAD-TO-PLAN)',
  },
  {
    field: 'key_changes', shape: 'arrayOfObjects',
    itemKeys: ['change', 'type'],
    hint: 'DB CHECK constraint key_changes_is_array requires an array of OBJECTS with change+type keys — an array of strings violates the constraint at insert time.',
    gate: 'strategic_directives_v2 CHECK key_changes_is_array',
  },
  {
    field: 'key_principles', shape: 'array', minItems: 1,
    hint: 'DB CHECK key_principles_not_empty: when provided, must be a NON-EMPTY string array — [] violates the constraint. Omit entirely if none.',
    gate: 'strategic_directives_v2 CHECK key_principles_not_empty',
  },
  {
    field: 'delivers_capabilities', shape: 'array',
    hint: 'Empty array [] is VALID and preferred for SDs with no formal capability rows (folklore that rows are mandatory is retired — fail-soft per SD-FDBK-FIX-ROOT-FIX-TRG-001). Capability completion writes are fail-soft.',
    gate: 'fn_handle_capability_lifecycle (fail-soft)',
  },
  {
    field: 'strategic_objectives', shape: 'array',
    hint: 'String array; auto-seeded boilerplate is flagged (warning) by GATE_PLACEHOLDER_CONTENT_DETECTION — enrich before PLAN.',
    gate: 'GATE_PLACEHOLDER_CONTENT_DETECTION (advisory)',
  },
  {
    field: 'risks', shape: 'arrayOfObjects',
    itemKeys: ['risk', 'mitigation'],
    hint: 'Array of {risk, mitigation} objects when present.',
    gate: 'SD quality validation',
  },
];

/** A minimal valid SD authoring payload (passes authoring-mode validation). */
export function scaffoldSd() {
  return {
    title: 'Short imperative title',
    description: 'What is broken/missing, the evidence, and what this SD delivers — concrete and grounded.',
    rationale: 'Why this matters now (business/operational justification).',
    scope: 'IN: the bounded deliverables. OUT: explicitly excluded adjacent work.',
    sd_type: 'infrastructure',
    category: 'infrastructure',
    priority: 'medium',
    target_application: 'EHG_Engineer',
    success_metrics: [
      { metric: 'Primary observable outcome', target: '>=1 concrete threshold', actual: '0 — pre-build baseline (lead actual with a number)' },
      { metric: 'Second unique metric', target: '<=0 regressions', actual: '0 — measured post-build' },
      { metric: 'Third unique metric', target: '100% of N items', actual: '0 of N — updated at completion' },
    ],
    key_changes: [
      { change: 'First concrete change', type: 'fix' },
    ],
    key_principles: ['Additive and reversible'],
    smoke_test_steps: [
      { step_number: 1, instruction: 'Concrete command or user action', expected_outcome: 'Concrete observable outcome' },
      { step_number: 2, instruction: 'Second concrete step', expected_outcome: 'Second observable outcome' },
      { step_number: 3, instruction: 'Third concrete step', expected_outcome: 'Third observable outcome' },
    ],
    delivers_capabilities: [],
  };
}

/**
 * SD-specific validation beyond generic shape checks.
 * Returns extra violations/warnings arrays in the same {field, expected, got, hint}
 * format used by validateArtifact.
 */
export function validateSdExtras(payload) {
  const violations = [];
  const warnings = [];

  // Metrics sufficiency — DELEGATED to the canonical gate-shared implementation.
  const metricsResult = validateMetricsSufficiency(payload);
  if (!metricsResult.pass) {
    for (const issue of metricsResult.issues || []) {
      violations.push({
        field: 'success_metrics',
        expected: '>=3 unique success_metrics entries (or valid success_criteria)',
        got: issue,
        hint: 'Canonical check: validateMetricsSufficiency (gate-shared). Dedup is by text — pad-with-duplicates fails.',
      });
    }
  }
  for (const w of metricsResult.warnings || []) {
    warnings.push({ field: 'success_metrics', expected: '', got: w, hint: 'Canonical metrics warning.' });
  }

  // Boilerplate smoke-step heuristic — ADVISORY in v1 (the gate enforces).
  const steps = Array.isArray(payload.smoke_test_steps) ? payload.smoke_test_steps : [];
  for (const [i, step] of steps.entries()) {
    const text = `${step?.instruction || ''} ${step?.expected_outcome || ''}`;
    if (BOILERPLATE_SMOKE_PATTERNS.some((re) => re.test(text))) {
      warnings.push({
        field: `smoke_test_steps[${i}]`,
        expected: 'concrete, observable instruction + outcome',
        got: (step?.instruction || '').slice(0, 60),
        hint: 'Auto-seeded boilerplate fails SMOKE_TEST_SPECIFICATION at LEAD-TO-PLAN — replace with a real command/action and its observable result.',
      });
    }
  }

  return { violations, warnings };
}
